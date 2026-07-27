// app/js/writingApi.js — điểm plug cho tính năng "Luyện viết" (2026-07-27), theo ĐÚNG mẫu
// lessonApi.js: view chỉ gọi 2 hàm dưới đây, không biết/không cần biết hình dạng action bên
// trong. Xem api/_generate/writing.js cho toàn bộ logic thật (giao đề, chấm bài).
import { callChatAction } from "./chatApi.js";

export async function generateWritingTask(level, industry) {
  return callAndParse("generate_writing_task", { level, industry: industry || "" });
}

export async function gradeWriting({ level, industry, task, text }) {
  return callAndParse("grade_writing", { level, industry: industry || "", task, text });
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
