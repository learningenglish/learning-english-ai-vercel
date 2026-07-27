// app/js/writingApi.js — điểm plug cho tính năng "Luyện viết" (2026-07-27), theo ĐÚNG mẫu
// lessonApi.js: view chỉ gọi các hàm dưới đây, không biết/không cần biết hình dạng action bên
// trong. Xem api/_generate/writing.js cho toàn bộ logic thật (giao đề, chấm bài, lưu Yêu thích).
import { callChatAction } from "./chatApi.js";

export async function generateWritingTask(level, industry) {
  return callAndParse("generate_writing_task", { level, industry: industry || "" });
}

export async function gradeWriting({ level, industry, task, text }) {
  return callAndParse("grade_writing", { level, industry: industry || "", task, text });
}

// kind: "detailed" | "complete" (kèm variant "clean_rewrite"|"reference_essay" khi complete) —
// xem supabase/028_writing_favorites.sql.
export async function saveWritingFavorite({ kind, variant, level, industry, task, overallScore, content }) {
  return callAndParse("save_writing_favorite", {
    kind,
    variant: variant || undefined,
    level,
    industry: industry || "",
    task,
    overall_score: Number.isFinite(overallScore) ? overallScore : null,
    content,
  });
}

async function callAndParse(action, payload) {
  const res = await callChatAction(action, payload);
  if (!res.ok) return res;
  try {
    return { ok: true, data: JSON.parse(res.content) };
  } catch {
    return { ok: false, error: "Phản hồi máy chủ không hợp lệ.", status: 502 };
  }
}
