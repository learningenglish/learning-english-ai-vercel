// app/js/lessonApi.js — ĐIỂM PLUG PLAN B.
//
// Toàn bộ hiểu biết "tạo bài học = gọi action nào, hình dạng payload/response ra sao" nằm
// DUY NHẤT ở file này. views/createLesson.js chỉ gọi createLessonFromAI()/
// createLessonFromText() và nhận về đúng 1 Promise<{ ok, data: {lesson, meta} } | { ok:
// false, error, status }> — nó không biết và không cần biết bên trong là 1 hay nhiều lần
// gọi mạng.
//
// Lý do tồn tại: nếu đo thời gian thật (Phase 0/3) cho thấy generate_lesson/
// analyze_user_text sát hoặc vượt trần maxDuration=60s của Vercel, backend sẽ tách thành 2
// action nối tiếp (vd sinh content+vocabulary trước, rồi gọi tiếp 1 action phụ sinh
// grammar+exercises dựa trên content vừa có). Khi đó CHỈ sửa 2 hàm dưới đây (gọi 2 action
// thay vì 1, ráp kết quả lại thành cùng shape { lesson, meta } như hiện tại) — không đụng
// gì tới UI.
import { callChatAction } from "./chatApi.js";

export async function createLessonFromAI(formData) {
  return callAndParse("generate_lesson", formData);
}

export async function createLessonFromText(userText, level) {
  return callAndParse("analyze_user_text", { user_text: userText, level });
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
