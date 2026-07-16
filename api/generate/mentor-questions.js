import { cacheKeyFor, getCachedAnalysis, saveCachedAnalysis } from "../cache/sentence-cache.js";

// Mentor Mode (slide dạy học) — 1 lệnh AI DUY NHẤT cho CẢ BÀI, sinh câu hỏi Warm-up +
// Discussion bằng TIẾNG ANH cho từng câu (hiển thị trực tiếp cho học viên trên slide,
// không phải ghi chú riêng của Mentor). Cache theo toàn bộ danh sách câu (đổi 1 câu bất
// kỳ trong bài -> cache miss, tính lại đúng 1 lần).
// ĐÂY LÀ ACTION "generate/" — PHẢI được Mentor chủ động kích hoạt (tốn credit riêng),
// KHÔNG tự động chạy khi mở slide. Đợt 2 (2026-07): action này CHƯA deploy/kích hoạt —
// chỉ tách code ra khỏi chat.js để đúng cấu trúc đích, giữ nguyên hành vi (chưa nối endpoint
// thật). Warm-up/Discussion trên UI vẫn dùng câu hỏi mẫu tĩnh cho tới khi có quyết định kích
// hoạt riêng.
//
// callOpenAI/safeOpenAIError/content được TRUYỀN VÀO (dependency injection) thay vì import
// trực tiếp từ chat.js — đây là các helper OpenAI dùng chung cho nhiều action khác trong
// chat.js, KHÔNG thuộc phạm vi tách của file này (tránh kéo theo hạ tầng không liên quan).
function buildMentorQuestionsSchema() {
  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            warmup: { type: "string" },
            discussion: { type: "string" },
          },
          required: ["warmup", "discussion"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  };
}

export async function mentorQuestions(data, { callOpenAI, safeOpenAIError, content }) {
  if (!Array.isArray(data.sentences) || !data.sentences.length) return { error: "Thiếu 'sentences'", status: 400 };
  const joined = data.sentences.join("|||");
  const key = cacheKeyFor(joined, "mentor_qa");
  const cached = await getCachedAnalysis(key);
  if (cached && Array.isArray(cached.items)) return { content: JSON.stringify(cached) };
  const prompt = `Lesson topic: "${data.topic || ""}"
For each of the ${data.sentences.length} English sentences below (numbered in order), write in ENGLISH:
- "warmup": 1 short warm-up question to introduce the topic BEFORE teaching that sentence.
- "discussion": 1 short open discussion question to help students apply the content/grammar AFTER learning that sentence.
Sentences:
${data.sentences.map((s,i)=>`${i+1}. ${s}`).join("\n")}
Return EXACTLY ${data.sentences.length} items in "items", in the SAME order as above.`;
  const r = await callOpenAI({
    max_tokens: 1500,
    response_format: { type: "json_schema", json_schema: { name: "mentor_questions", strict: true, schema: buildMentorQuestionsSchema() } },
    messages: [
      { role: "system", content: "You write short, natural Vietnamese warm-up and discussion questions for an English teacher's lesson slides. Return complete valid JSON only. No markdown." },
      { role: "user", content: prompt },
    ],
  });
  if (!r.ok) return safeOpenAIError(r);
  let parsed;
  try {
    parsed = JSON.parse(content(r));
  } catch (e) {
    console.error("mentor_questions parse error:", e, content(r).slice(0, 500));
    return safeOpenAIError({ status: 502, data: {} });
  }
  saveCachedAnalysis(key, joined, "mentor_qa", parsed);
  return { content: JSON.stringify(parsed) };
}
