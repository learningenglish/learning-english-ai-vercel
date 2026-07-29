// api/_generate/audio.js — action "generate_lesson_full_audio": âm thanh chất lượng cao TRẢ
// PHÍ cho bài đọc/hội thoại CÓ LĨNH VỰC trong Thư viện AI (xem supabase/030_lesson_audio.sql +
// 031_lesson_full_audio.sql cho toàn bộ bối cảnh quyết định phạm vi).
//
// SỬA LẠI TOÀN BỘ KIẾN TRÚC (2026-07-30, Minh: "audio luôn bị khựng khi đọc câu mới" — bản cũ
// sinh/phát TỪNG CÂU MỘT, 1 <audio> element/1 request/câu, dù đã có look-ahead prefetch vẫn
// khựng vì mỗi câu là 1 network round-trip riêng). Xác nhận kỹ thuật TRƯỚC KHI code (Minh yêu
// cầu câu trả lời dứt khoát CÓ/KHÔNG): generateSpeech() (aiProvider.js) luôn gọi CÙNG 1
// model/encoder OpenAI (gpt-4o-mini-tts, response_format mp3) cho MỌI đoạn — nối buffer thô
// (Buffer.concat, KHÔNG cần ffmpeg/binary ngoài) cho kết quả phát liền mạch, đủ an toàn vì mọi
// đoạn ra từ cùng 1 encoder. Sinh xong 1 lần, ghép thành ĐÚNG 1 FILE, lưu vĩnh viễn vào
// lessons.audio_full_url — mọi lượt phát SAU (kể cả người khác nếu bài dùng chung) đọc thẳng
// URL đã lưu, KHÔNG gọi AI lại, cùng triết lý cache-1-lần đã dùng cho word_lookup.
import { generateSpeech } from "../_shared/aiProvider.js";
import { SUPABASE_URL } from "./_shared.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "lesson-audio";
// Sinh song song có giới hạn — mỗi đoạn là 1 lượt gọi OpenAI TTS thật (~1-4s cho câu ngắn/vừa),
// cần đủ nhanh để không chạm trần maxDuration=60s của Vercel (api/chat.js) ngay cả với bài dài
// (B2/C1 nhiều lượt thoại) — 4 song song đã đủ dư thời gian với độ dài bài hiện tại (xem
// LEVEL_LENGTH_TABLE/DIALOGUE_TURN_COUNT_BASIS_BY_LEVEL trong lesson.js, tối đa ~15-20 đơn vị).
const GENERATION_CONCURRENCY = 4;

// "voice" OpenAI TTS — 2 giọng trung tính rõ nam/nữ, KHÔNG cần khớp chính xác nhân vật (bài học
// đã có genderHint riêng cho Web Speech fallback, ở đây chỉ cần MỘT giọng nghe tự nhiên, khác
// nam/nữ đủ để phân biệt người nói trong hội thoại).
// ĐỔI GIỌNG (2026-07-29, Minh phản hồi nghe thật: "giọng nam quá tệ, giọng nữ là giọng nam
// cao" — onyx/shimmer không đạt): echo (nam)/nova (nữ).
function pickOpenAIVoice(genderHint) {
  return genderHint === "female" ? "nova" : "echo";
}

async function uploadAudio(path, buffer, contentType) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType || "audio/mpeg",
      "x-upsert": "true",
    },
    body: buffer,
  });
  if (!r.ok) {
    console.error("audio.js uploadAudio error:", r.status, await r.text().catch(() => ""));
    return null;
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// Sinh song song có giới hạn, GIỮ ĐÚNG THỨ TỰ kết quả (mảng "results" ghi theo index gốc, KHÔNG
// theo thứ tự hoàn thành) — bắt buộc để ghép buffer đúng trình tự câu trong bài.
async function generateAllSegments(texts, voices) {
  const results = new Array(texts.length);
  let nextIndex = 0;
  let firstError = null;
  async function worker() {
    while (nextIndex < texts.length) {
      const i = nextIndex++;
      const res = await generateSpeech({ text: texts[i], voice: voices[i] });
      if (!res.ok) {
        if (!firstError) firstError = res.error;
        continue;
      }
      results[i] = res;
    }
  }
  await Promise.all(Array.from({ length: Math.min(GENERATION_CONCURRENCY, texts.length) }, () => worker()));
  if (firstError) return { ok: false, error: firstError };
  return { ok: true, results };
}

export async function generate_lesson_full_audio(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const lessonId = data.lesson_id;
  if (!lessonId) return { error: "Thiếu 'lesson_id'.", status: 400 };

  const selectRes = await fetch(
    `${SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(lessonId)}&user_id=eq.${encodeURIComponent(ctx.studentId)}&select=content,industry,source,audio_full_url`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!selectRes.ok) {
    console.error("generate_lesson_full_audio select error:", selectRes.status, await selectRes.text().catch(() => ""));
    return { error: "Không tải được bài học.", status: 502 };
  }
  const rows = await selectRes.json();
  const lesson = rows?.[0];
  if (!lesson) return { error: "Không tìm thấy bài học.", status: 404 };

  // Đúng phạm vi đã chốt: CHỈ bài "ai_generated" (Thư viện AI) VÀ CÓ lĩnh vực — bài Tin
  // tức/Phân tích văn bản/Giao tiếp tổng quát (industry rỗng) trả "eligible:false", client tự
  // rơi về Web Speech miễn phí, KHÔNG coi đây là lỗi.
  if (lesson.source !== "ai_generated" || !lesson.industry) {
    return { content: JSON.stringify({ eligible: false, url: null }) };
  }

  if (lesson.audio_full_url) {
    return { content: JSON.stringify({ eligible: true, url: lesson.audio_full_url }) };
  }

  const content = Array.isArray(lesson.content) ? lesson.content : [];
  const texts = content.map((item) => item?.text || "").filter((t) => t.trim());
  if (!texts.length) return { error: "Bài học không có nội dung để đọc.", status: 400 };

  const genderHints = Array.isArray(data.gender_hints) ? data.gender_hints : [];
  const voices = texts.map((_, i) => pickOpenAIVoice(genderHints[i]));

  const genResult = await generateAllSegments(texts, voices);
  if (!genResult.ok) return { error: genResult.error || "Không tạo được audio.", status: 502 };

  // Nối buffer thô THEO ĐÚNG THỨ TỰ — an toàn vì mọi đoạn cùng 1 model/encoder (xem ghi chú đầu
  // file, đã xác nhận kỹ thuật trước khi code, KHÔNG cần ffmpeg).
  const buffers = genResult.results.map((r) => Buffer.from(r.audioBase64, "base64"));
  const combined = Buffer.concat(buffers);
  const contentType = genResult.results[0]?.contentType || "audio/mpeg";
  const ext = contentType.includes("wav") ? "wav" : "mp3";

  const url = await uploadAudio(`${lessonId}/full.${ext}`, combined, contentType);
  if (!url) return { error: "Không lưu được audio.", status: 502 };

  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(lessonId)}&user_id=eq.${encodeURIComponent(ctx.studentId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ audio_full_url: url }),
    }
  );
  if (!patchRes.ok) {
    // Lỗi lưu KHÔNG nên chặn lượt phát lần này — audio đã upload xong, trả URL luôn dùng được,
    // chỉ là lần SAU sẽ phải sinh lại (mất phần "tốn 1 lần" nhưng không hỏng trải nghiệm hiện tại).
    console.error("generate_lesson_full_audio PATCH error:", patchRes.status, await patchRes.text().catch(() => ""));
  }
  return { content: JSON.stringify({ eligible: true, url }) };
}
