// api/_generate/audio.js — action "generate_lesson_full_audio": âm thanh chất lượng cao TRẢ
// PHÍ cho bài đọc/hội thoại CÓ LĨNH VỰC trong Thư viện AI (xem supabase/030_lesson_audio.sql +
// 031_lesson_full_audio.sql cho toàn bộ bối cảnh quyết định phạm vi).
//
// SỬA LẠI TOÀN BỘ KIẾN TRÚC (2026-07-30, Minh: "audio luôn bị khựng khi đọc câu mới" — bản cũ
// sinh/phát TỪNG CÂU MỘT, 1 <audio> element/1 request/câu, dù đã có look-ahead prefetch vẫn
// khựng vì mỗi câu là 1 network round-trip riêng). Xác nhận kỹ thuật TRƯỚC KHI code (Minh yêu
// cầu câu trả lời dứt khoát CÓ/KHÔNG): generateSpeech() (aiProvider.js) luôn gọi CÙNG 1
// model/encoder OpenAI cho MỌI đoạn — nối buffer thô cho kết quả phát liền mạch, KHÔNG cần
// ffmpeg/binary ngoài. Sinh xong 1 lần, ghép thành ĐÚNG 1 FILE, lưu vĩnh viễn vào
// lessons.audio_full_url — mọi lượt phát SAU (kể cả người khác nếu bài dùng chung) đọc thẳng
// URL đã lưu, KHÔNG gọi AI lại, cùng triết lý cache-1-lần đã dùng cho word_lookup.
//
// ĐỔI SANG WAV (2026-07-30, mục E — "khoảng lặng giữa câu", gộp cùng đợt với sửa giọng ở trên
// theo đúng yêu cầu Minh) — MP3 không có cách chèn khoảng lặng CHÍNH XÁC theo mili-giây mà
// không cần ffmpeg (frame MP3 mã hoá phức tạp, tự ghép byte thô rủi ro sai định dạng, không có
// công cụ nghe thử để kiểm chứng). WAV thì khoảng lặng ĐƠN GIẢN LÀ SỐ 0 thô sau chuỗi PCM —
// ghép chính xác tuyệt đối, không rủi ro. Đánh đổi: file nặng hơn hẳn MP3 (~3-4x, nhạc nói PCM
// 24kHz mono ~48KB/s) — chấp nhận được cho tính năng audio trả phí đã có cổng lĩnh vực, KHÔNG
// áp dụng đại trà cho mọi loại audio trong app.
import { generateSpeech } from "../_shared/aiProvider.js";
import { SUPABASE_URL } from "./_shared.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "lesson-audio";
// Sinh song song có giới hạn — mỗi đoạn là 1 lượt gọi OpenAI TTS thật (~1-4s cho câu ngắn/vừa),
// cần đủ nhanh để không chạm trần maxDuration=60s của Vercel (api/chat.js) ngay cả với bài dài
// (B2/C1 nhiều lượt thoại) — 4 song song đã đủ dư thời gian với độ dài bài hiện tại (xem
// LEVEL_LENGTH_TABLE/DIALOGUE_TURN_COUNT_BASIS_BY_LEVEL trong lesson.js, tối đa ~15-20 đơn vị).
const GENERATION_CONCURRENCY = 4;
// Khoảng lặng chèn giữa 2 đoạn liền kề (mục E) — Minh: "200-400ms, anh tự chọn số nghe tự nhiên
// nhất". 300ms = điểm giữa, đủ để phân biệt 2 câu/2 lượt thoại khác nhân vật mà không kéo dài
// cảm giác chờ. Áp dụng ĐỒNG NHẤT cho cả bài đọc lẫn hội thoại (không chỉ riêng hội thoại như
// Minh nêu ví dụ) — nhất quán, không cần 2 con số khác nhau cho 2 loại nội dung.
const SILENCE_GAP_MS = 300;

// "voice" OpenAI TTS — 2 giọng trung tính rõ nam/nữ, KHÔNG cần khớp chính xác nhân vật (bài học
// đã có genderHint riêng cho Web Speech fallback, ở đây chỉ cần MỘT giọng nghe tự nhiên, khác
// nam/nữ đủ để phân biệt người nói trong hội thoại).
// ĐỔI GIỌNG (2026-07-29, Minh phản hồi nghe thật: "giọng nam quá tệ, giọng nữ là giọng nam
// cao" — onyx/shimmer không đạt): echo (nam)/nova (nữ).
function pickOpenAIVoice(genderHint) {
  return genderHint === "female" ? "nova" : "echo";
}

// Đọc chunk "fmt " + "data" của 1 file WAV (bỏ qua chunk khác nếu có, vd LIST/INFO — một số
// encoder chèn thêm, không phải lỗi) — trả về thông số PCM + buffer dữ liệu thô (KHÔNG kèm
// header 44 byte đầu). Không validate sâu (định dạng luôn do CHÍNH generateSpeech() sinh ra,
// không phải input người dùng tự do) — lỗi cấu trúc (nếu có) nên NỔ RÕ ở đây thay vì âm thầm
// ghép sai, dễ debug hơn 1 lớp try/catch nuốt lỗi.
function parseWav(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Không phải file WAV hợp lệ (thiếu RIFF/WAVE header)");
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkId === "fmt ") {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        numChannels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === "data") {
      data = buffer.subarray(chunkStart, chunkStart + chunkSize);
    }
    offset = chunkStart + chunkSize + (chunkSize % 2); // chunk WAV luôn căn chẵn byte
  }
  if (!fmt || !data) throw new Error("File WAV thiếu chunk 'fmt ' hoặc 'data'");
  return { fmt, data };
}

// Dựng lại 1 file WAV hoàn chỉnh (44-byte header chuẩn PCM) từ thông số fmt + buffer PCM thô
// (đã ghép sẵn nhiều đoạn + khoảng lặng, xem generate_lesson_full_audio bên dưới).
function buildWav(fmt, pcmData) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // kích thước chunk "fmt " chuẩn PCM
  header.writeUInt16LE(fmt.audioFormat, 20);
  header.writeUInt16LE(fmt.numChannels, 22);
  header.writeUInt32LE(fmt.sampleRate, 24);
  header.writeUInt32LE(fmt.byteRate, 28);
  header.writeUInt16LE(fmt.blockAlign, 32);
  header.writeUInt16LE(fmt.bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

// Buffer PCM toàn số 0 (im lặng thật, không phải "gần như im lặng") đúng "durationMs", tính
// theo ĐÚNG thông số fmt của các đoạn đã sinh (byteRate = số byte/giây) — căn về bội số
// blockAlign để không làm lệch khung mẫu (mỗi khung = blockAlign byte).
function silenceBuffer(fmt, durationMs) {
  const rawBytes = Math.round((fmt.byteRate * durationMs) / 1000);
  const alignedBytes = Math.round(rawBytes / fmt.blockAlign) * fmt.blockAlign;
  return Buffer.alloc(alignedBytes); // Buffer.alloc() mặc định điền toàn số 0.
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
      const res = await generateSpeech({ text: texts[i], voice: voices[i], format: "wav" });
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
    `${SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(lessonId)}&user_id=eq.${encodeURIComponent(ctx.studentId)}&select=content,industry,source,audio_full_url,audio_segment_times`,
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
    // "segmentTimes" có thể null cho bài đã sinh TRƯỚC cột audio_segment_times tồn tại (chưa
    // regenerate) — client tự rơi về công thức ước lượng cũ cho riêng bài đó, xem tts.js.
    return { content: JSON.stringify({ eligible: true, url: lesson.audio_full_url, segmentTimes: lesson.audio_segment_times || null }) };
  }

  // BUG THẬT (2026-07-30, Minh: "giọng nữ bị phát ra giọng nam") — bản cũ filter() TRỰC TIẾP
  // trên mảng text RỒI MỚI đánh index vào gender_hints (mảng KHÔNG filter, vẫn giữ nguyên vị
  // trí gốc theo content) — 1 đoạn text rỗng bị filter ra sẽ làm LỆCH INDEX toàn bộ giọng của
  // MỌI đoạn phía sau nó (đoạn thứ N+1 vô tình dùng gender_hints[N], sai giọng dây chuyền).
  // Ghép text+hint THÀNH CẶP trước khi filter để không bao giờ lệch, bất kể filter bỏ đi bao
  // nhiêu đoạn ở vị trí nào. "origIndex" giữ lại vị trí THẬT trong "content" gốc — cần để dựng
  // "segmentTimes" bên dưới đúng theo chỉ số mà client (views/lesson.js/tts.js) dùng để tra
  // (client luôn đánh index theo "lesson.content" gốc, không phải theo mảng đã lọc rỗng này).
  const content = Array.isArray(lesson.content) ? lesson.content : [];
  const rawGenderHints = Array.isArray(data.gender_hints) ? data.gender_hints : [];
  const paired = content
    .map((item, i) => ({ origIndex: i, text: item?.text || "", genderHint: rawGenderHints[i] }))
    .filter((x) => x.text.trim());
  if (!paired.length) return { error: "Bài học không có nội dung để đọc.", status: 400 };

  const texts = paired.map((x) => x.text);
  const voices = paired.map((x) => pickOpenAIVoice(x.genderHint));

  const genResult = await generateAllSegments(texts, voices);
  if (!genResult.ok) return { error: genResult.error || "Không tạo được audio.", status: 502 };

  // Ghép WAV THEO ĐÚNG THỨ TỰ, chèn khoảng lặng THẬT (SILENCE_GAP_MS) giữa mỗi 2 đoạn liền kề —
  // mục E, "khoảng lặng giữa câu" (2026-07-30). fmt lấy từ đoạn ĐẦU TIÊN (mọi đoạn cùng 1
  // model/API nên fmt luôn giống nhau, xem ghi chú đầu file) — dùng làm chuẩn cho cả khoảng
  // lặng lẫn header file cuối cùng.
  const parsedSegments = genResult.results.map((r) => parseWav(Buffer.from(r.audioBase64, "base64")));
  const fmt = parsedSegments[0].fmt;
  const gap = silenceBuffer(fmt, SILENCE_GAP_MS);
  const gapSeconds = SILENCE_GAP_MS / 1000;

  // Mốc thời gian THẬT của từng câu (mục 1+2+3+9, 2026-07-30) — tính được NGAY ở đây, không tốn
  // thêm lượt AI nào: mỗi đoạn đã biết chính xác số byte PCM của nó (seg.data.length), chia cho
  // byteRate (byte/giây, cùng fmt cho mọi đoạn) ra đúng số giây thật. Cộng dồn theo thứ tự +
  // khoảng lặng đã chèn giữa 2 đoạn liền kề. Mảng "segmentTimes" CÙNG ĐỘ DÀI với "content" gốc
  // (không phải "paired" đã lọc) — vị trí nào bị lọc bỏ (text rỗng) giữ nguyên null, để client
  // tra thẳng bằng đúng index của "lesson.content"/"pages" mà không cần biết gì về việc lọc này.
  const segmentTimes = new Array(content.length).fill(null);
  const pcmParts = [];
  let cursor = 0;
  parsedSegments.forEach((seg, i) => {
    const durationSeconds = seg.data.length / fmt.byteRate;
    segmentTimes[paired[i].origIndex] = { start: cursor, end: cursor + durationSeconds };
    pcmParts.push(seg.data);
    cursor += durationSeconds;
    if (i < parsedSegments.length - 1) {
      pcmParts.push(gap);
      cursor += gapSeconds;
    }
  });
  const combined = buildWav(fmt, Buffer.concat(pcmParts));

  const url = await uploadAudio(`${lessonId}/full.wav`, combined, "audio/wav");
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
      body: JSON.stringify({ audio_full_url: url, audio_segment_times: segmentTimes }),
    }
  );
  if (!patchRes.ok) {
    // Lỗi lưu KHÔNG nên chặn lượt phát lần này — audio đã upload xong, trả URL luôn dùng được,
    // chỉ là lần SAU sẽ phải sinh lại (mất phần "tốn 1 lần" nhưng không hỏng trải nghiệm hiện tại).
    console.error("generate_lesson_full_audio PATCH error:", patchRes.status, await patchRes.text().catch(() => ""));
  }
  return { content: JSON.stringify({ eligible: true, url, segmentTimes }) };
}
