// app/js/lessonApi.js — ĐIỂM PLUG PLAN B.
//
// Toàn bộ hiểu biết "phân tích văn bản dán sẵn = gọi action nào, hình dạng payload/response ra
// sao" nằm DUY NHẤT ở file này. views/mentorGoal.js (ô "Tôi có văn bản", Bước 1) chỉ gọi
// createLessonFromText() và nhận về đúng 1 Promise<{ ok, data: {lesson, meta} } | { ok: false,
// error, status }> — nó không biết và không cần biết bên trong là 1 hay nhiều lần gọi mạng.
// createLessonFromAI() (gọi generate_lesson trực tiếp từ client) đã bị RÚT khỏi file này ở
// Đợt 3 — luồng "AI tạo bài học" cũ (views/createLesson.js) bị thay hẳn bởi Mentor AI
// (views/mentorGoal.js), nơi generate_lesson được gọi GIÁN TIẾP qua action mentor_next_lesson
// (api/_generate/mentor.js) để gắn thêm goal_id, không qua client nữa.
//
// Lý do tồn tại: nếu đo thời gian thật cho thấy analyze_user_text sát hoặc vượt trần
// maxDuration=60s của Vercel, backend sẽ tách thành 2 action nối tiếp (vd sinh content+
// vocabulary trước, rồi gọi tiếp 1 action phụ sinh grammar+exercises dựa trên content vừa
// có). Khi đó CHỈ sửa hàm dưới đây (gọi 2 action thay vì 1, ráp kết quả lại thành cùng shape
// { lesson, meta } như hiện tại) — không đụng gì tới UI.
import { callChatAction } from "./chatApi.js";

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

// Người học bấm tra 1 từ/cụm trong bài (word_lookup) -> tự thêm vào bảng Từ vựng của bài,
// nhóm "Đã tra" (xem VOCAB_VIEWS trong views/lesson.js) — lưu THẬT vào lesson.vocabulary
// (không chỉ hiện tạm trong phiên xem), để lần sau mở lại bài vẫn còn. Fire-and-forget như
// fetchAndSaveLessonCover bên dưới — lỗi mạng ở bước lưu không nên làm hỏng trải nghiệm tra
// từ (tooltip đã hiện xong trước khi hàm này được gọi).
export async function addLookedUpWord(lessonId, word, lookup) {
  try {
    await callChatAction("add_vocab_word", {
      lesson_id: lessonId,
      word,
      meaning: lookup?.meaning || "",
      level: lookup?.level || null,
    });
  } catch {
    // Im lặng — xem ghi chú ở trên.
  }
}

// Tự động lấy ảnh bìa NGAY sau khi tạo bài xong, không cần người học bấm gì — "lấy 1 lần và
// lưu trữ luôn" (yêu cầu người dùng): search_lesson_cover_image tìm ảnh MIỄN PHÍ theo tiêu
// đề tiếng Anh của bài (Unsplash/Pexels/Wikimedia — 0đ, URL vĩnh viễn; KHÔNG dùng DALL-E
// nữa: ~1.000đ/ảnh và URL hết hạn sau ~1-2 giờ, xem quyết định chi phí trong
// api/_generate/coverImage.js), rồi set_lesson_cover_image để PATCH vào đúng hàng lesson
// (client không có quyền UPDATE cột đó trực tiếp). CỐ Ý tách khỏi createLessonFromAI/
// createLessonFromText, gọi RỜI SAU khi màn "Tạo bài học" đã hiện kết quả — không kéo dài
// thời gian chờ tạo bài (đã gần trần maxDuration=60s của Vercel). Fire-and-forget: không
// tìm được ảnh (hiếm) hay lỗi mạng thì bài đơn giản là chưa có ảnh bìa (UI hiện icon mặc
// định) — không throw, không có UI báo lỗi riêng.
export async function fetchAndSaveLessonCover(lesson) {
  try {
    const title = (lesson.title || "").trim();
    if (!title) return;
    const imgRes = await callChatAction("search_lesson_cover_image", { title, content_type: lesson.content_type });
    if (!imgRes.ok) return;
    const { image } = JSON.parse(imgRes.content);
    if (!image?.url) return;
    await callChatAction("set_lesson_cover_image", { lesson_id: lesson.id, cover_image_url: image.url });
  } catch {
    // Im lặng — xem ghi chú ở trên, đây là tính năng "cố gắng tốt nhất", không chặn luồng chính.
  }
}
