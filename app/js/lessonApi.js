// app/js/lessonApi.js — ĐIỂM PLUG PLAN B.
//
// Toàn bộ hiểu biết "phân tích văn bản dán sẵn / tự tạo bài = gọi action nào, hình dạng
// payload/response ra sao" nằm DUY NHẤT ở file này. Các view chỉ gọi createLessonFromText()/
// createLessonFromAI() và nhận về đúng 1 Promise<{ ok, data: {lesson, meta} } | { ok: false,
// error, status }> — không biết và không cần biết bên trong là 1 hay nhiều lần gọi mạng.
//
// createLessonFromAI() KHÔI PHỤC lại 2026-07-23 (đã bị rút khỏi file này ở Đợt 3 khi Mentor AI
// thay hẳn form tự nhập cũ) — Mentor AI bị TẮT UI (chất lượng thật không đạt, "như spam"),
// backend mentor.js/mentor-lines/industry_skins/learning_goals VẪN giữ nguyên (không xoá,
// không đụng), chỉ không còn điểm vào nào trên UI gọi tới. views/createLesson.js gọi thẳng
// generate_lesson qua đây, KHÔNG qua goal_id/mentor_next_lesson nữa.
//
// Lý do tồn tại: nếu đo thời gian thật cho thấy analyze_user_text sát hoặc vượt trần
// maxDuration=60s của Vercel, backend sẽ tách thành 2 action nối tiếp (vd sinh content+
// vocabulary trước, rồi gọi tiếp 1 action phụ sinh grammar+exercises dựa trên content vừa
// có). Khi đó CHỈ sửa hàm dưới đây (gọi 2 action thay vì 1, ráp kết quả lại thành cùng shape
// { lesson, meta } như hiện tại) — không đụng gì tới UI.
import { callChatAction } from "./chatApi.js";

// "level" KHÔNG còn là tham số (2026-07-27) — bỏ hẳn bước người dùng khai báo cấp độ trước khi
// phân tích, AI tự đọc văn bản và tự xác định level, trả lại trong lesson.level (xem
// api/_generate/lesson.js::ANALYZE_TEXT_SYSTEM_PROMPT mục "TỰ PHÂN LOẠI CẤP ĐỘ").
export async function createLessonFromText(userText) {
  return callAndParse("analyze_user_text", { user_text: userText });
}

export async function createLessonFromAI(payload) {
  return callAndParse("generate_lesson", payload);
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

// Tra 1 từ/cụm trong bài (word_lookup, dù do người dùng bấm hay do prefetchAllLessonWords()
// chạy nền — xem views/lesson.js) -> tự thêm vào bảng Từ vựng của bài, nhóm "Đã tra" (xem
// VOCAB_VIEWS trong views/lesson.js) — lưu THẬT vào vocabulary (không chỉ hiện tạm trong phiên
// xem), để LẦN SAU mở lại bài (kể cả người khác, với bài Tin tức dùng chung) vẫn có sẵn, không
// tốn lượt AI tra lại — đây là điều kiện để "prefetch cả bài lúc mở" không lặp lại chi phí AI
// mỗi lần mở bài (2026-07-29). Fire-and-forget như fetchAndSaveLessonCover bên dưới — lỗi mạng
// ở bước lưu không nên làm hỏng trải nghiệm tra từ (tooltip đã hiện xong trước khi gọi hàm này).
// "isNews" — bài Tin tức (news_lessons, KHÔNG user_id, dùng chung mọi tài khoản) phải ghi qua
// action RIÊNG (add_news_vocab_word, không lọc theo chủ sở hữu), xem api/_generate/vocab.js.
export async function addLookedUpWord(lessonId, word, lookup, isNews) {
  try {
    await callChatAction(isNews ? "add_news_vocab_word" : "add_vocab_word", {
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
