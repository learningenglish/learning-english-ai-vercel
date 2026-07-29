// api/_generate/audio.js — action "get_lesson_audio": âm thanh chất lượng cao TRẢ PHÍ cho bài
// đọc/hội thoại CÓ LĨNH VỰC trong Thư viện AI (2026-07-29, xem supabase/030_lesson_audio.sql
// cho toàn bộ bối cảnh quyết định phạm vi). SINH LƯỜI đúng 1 lần/câu — bấm Phát lần đầu cho 1
// câu thì tốn vài giây gọi generateSpeech() + upload Storage, LƯU VĨNH VIỄN vào
// lessons.audio_urls[item_index]; mọi lượt phát SAU (kể cả người khác nếu bài dùng chung, hoặc
// chính người này mở lại bài) đọc thẳng URL đã lưu, KHÔNG gọi AI lại — cùng triết lý cache-1-lần
// đã dùng cho word_lookup (xem app/js/views/lesson.js::prefetchAllLessonWords, cùng ngày).
import { generateSpeech } from "../_shared/aiProvider.js";
import { SUPABASE_URL } from "./_shared.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "lesson-audio";

// "voice" OpenAI TTS — 2 giọng trung tính rõ nam/nữ, KHÔNG cần khớp chính xác nhân vật (bài học
// đã có genderHint riêng cho Web Speech fallback, ở đây chỉ cần MỘT giọng nghe tự nhiên, khác
// nam/nữ đủ để phân biệt người nói trong hội thoại).
// ĐỔI GIỌNG (2026-07-29, Minh phản hồi nghe thật: "giọng nam quá tệ, giọng nữ là giọng nam
// cao" — onyx/shimmer không đạt): chuyển sang echo (nam, được đánh giá tự nhiên/ấm hơn onyx
// vốn khá đều đều/thiếu sức sống cho hội thoại) và nova (nữ, giọng phổ biến nhất trong các
// voice OpenAI TTS cho cảm giác tự nhiên, rõ ràng là giọng nữ — khác hẳn shimmer, giọng nhẹ dễ
// bị nghe lẫn). CHƯA nghe thử lại bằng tai thật (không nghe được audio trong sandbox) — cần
// Minh xác nhận trên bài thật sau khi deploy, đổi tiếp nếu vẫn chưa ổn.
function pickOpenAIVoice(genderHint) {
  return genderHint === "female" ? "nova" : "echo";
}

async function uploadAudio(path, audioBase64, contentType) {
  const buffer = Buffer.from(audioBase64, "base64");
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

export async function get_lesson_audio(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const lessonId = data.lesson_id;
  const itemIndex = Number(data.item_index);
  if (!lessonId || !Number.isInteger(itemIndex) || itemIndex < 0) {
    return { error: "Thiếu 'lesson_id' hoặc 'item_index' không hợp lệ.", status: 400 };
  }

  const selectRes = await fetch(
    `${SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(lessonId)}&user_id=eq.${encodeURIComponent(ctx.studentId)}&select=content,industry,source,audio_urls`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!selectRes.ok) {
    console.error("get_lesson_audio select error:", selectRes.status, await selectRes.text().catch(() => ""));
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

  const content = Array.isArray(lesson.content) ? lesson.content : [];
  const item = content[itemIndex];
  if (!item?.text) return { error: "Không tìm thấy câu/đoạn này trong bài.", status: 404 };

  const audioUrls = Array.isArray(lesson.audio_urls) ? [...lesson.audio_urls] : [];
  const cached = audioUrls[itemIndex];
  if (cached) return { content: JSON.stringify({ eligible: true, url: cached }) };

  const speechRes = await generateSpeech({ text: item.text, voice: pickOpenAIVoice(data.gender_hint) });
  if (!speechRes.ok) return { error: speechRes.error || "Không tạo được audio.", status: speechRes.status || 502 };

  const ext = (speechRes.contentType || "").includes("wav") ? "wav" : "mp3";
  const url = await uploadAudio(`${lessonId}/${itemIndex}.${ext}`, speechRes.audioBase64, speechRes.contentType);
  if (!url) return { error: "Không lưu được audio.", status: 502 };

  while (audioUrls.length <= itemIndex) audioUrls.push(null);
  audioUrls[itemIndex] = url;
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
      body: JSON.stringify({ audio_urls: audioUrls }),
    }
  );
  if (!patchRes.ok) {
    // Lỗi lưu KHÔNG nên chặn lượt phát lần này — audio đã upload xong, trả URL luôn dùng được,
    // chỉ là lần SAU sẽ phải sinh lại (mất phần "tốn 1 lần" nhưng không hỏng trải nghiệm hiện tại).
    console.error("get_lesson_audio PATCH error:", patchRes.status, await patchRes.text().catch(() => ""));
  }
  return { content: JSON.stringify({ eligible: true, url }) };
}
