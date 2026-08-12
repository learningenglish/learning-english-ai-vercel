// app/js/lessonApi.js — ĐIỂM PLUG PLAN B.
//
// Toàn bộ hiểu biết "phân tích văn bản dán sẵn = gọi action nào, hình dạng payload/response ra
// sao" nằm DUY NHẤT ở file này. views/createFromText.js chỉ gọi createLessonFromText() và nhận
// về đúng 1 Promise<{ ok, data: {lesson, meta} } | { ok: false, error, status }> — không biết và
// không cần biết bên trong là 1 hay nhiều lần gọi mạng.
//
// RÀ SOÁT 2026-08-11 — bỏ "createLessonFromAI()" (gọi thẳng "generate_lesson", KHÔI PHỤC
// 2026-07-23 nhưng thực tế đã hết caller từ lâu — views/createLesson.js dùng
// mentor_next_lesson/generateNextLessonForGoal(), KHÔNG dùng hàm này; giờ createLesson.js cũng
// đã archive, xem _archive/mentor-ai-personal-flow/). Action "generate_lesson" ở backend VẪN
// GIỮ (không xoá) — cần cho việc sinh trước giáo trình dùng chung sau này, gọi trực tiếp qua
// script/batch, không qua wrapper JS này.
//
// Lý do tồn tại: nếu đo thời gian thật cho thấy analyze_user_text sát hoặc vượt trần
// maxDuration=60s của Vercel, backend sẽ tách thành 2 action nối tiếp (vd sinh content+
// vocabulary trước, rồi gọi tiếp 1 action phụ sinh grammar+exercises dựa trên content vừa
// có). Khi đó CHỈ sửa hàm dưới đây (gọi 2 action thay vì 1, ráp kết quả lại thành cùng shape
// { lesson, meta } như hiện tại) — không đụng gì tới UI.
import { callChatAction } from "./chatApi.js";
import { computeGenderHints } from "./tts.js";

// "level" KHÔNG còn là tham số (2026-07-27) — bỏ hẳn bước người dùng khai báo cấp độ trước khi
// phân tích, AI tự đọc văn bản và tự xác định level, trả lại trong lesson.level (xem
// api/_generate/lesson.js::ANALYZE_TEXT_SYSTEM_PROMPT mục "TỰ PHÂN LOẠI CẤP ĐỘ").
// "goalId" (2026-08-06, tái cấu trúc theo cây mới) — TÙY CHỌN, gắn bài phân tích vào đúng
// Chuyên ngành đang active (views/createFromText.js tự đọc getActiveLearningGoal() trước khi
// gọi) — server tự xác nhận sở hữu (resolveOwnedGoalId trong lesson.js), không có/sai thì âm
// thầm lưu goal_id=null, không lỗi cả lượt phân tích.
export async function createLessonFromText(userText, goalId) {
  return callAndParse("analyze_user_text", { user_text: userText, goal_id: goalId || null });
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

// "Vá" phrase_groups cho bài CŨ (2026-08-05, "sửa gốc tính năng tra từ") — gọi ĐÚNG 1 LẦN khi
// người dùng bấm vào 1 từ mà bài CHƯA có dữ liệu sẵn (bài sinh trước khi có tính năng gom cụm
// từ, xem phraseGroupToEntry() trong views/lesson.js) — phân tích LẠI CẢ BÀI trong 1 lượt gọi
// AI DUY NHẤT, lưu thẳng vào bài, THAY HẲN word_lookup cũ (gọi AI riêng cho MỖI từ mỗi lần bấm —
// nguyên nhân thật gây 952+381 request bất thường 31/7-1/8, xem docs/NHAT-KY-LAM-VIEC.md).
export async function analyzeLessonPhraseGroups(lessonId, isNews) {
  return callAndParse("analyze_lesson_phrase_groups", { lesson_id: lessonId, is_news: !!isNews });
}

// "Vá" reading_chunks cho bài CŨ (2026-08-10, Đợt 14) — field RIÊNG cho "Tách câu", cùng kiến
// trúc "vá 1 lần" như analyzeLessonPhraseGroups() ở trên, xem READING_CHUNKS_RULES trong
// api/_generate/lesson.js.
export async function analyzeLessonReadingChunks(lessonId, isNews) {
  return callAndParse("analyze_lesson_reading_chunks", { lesson_id: lessonId, is_news: !!isNews });
}

// Âm thanh chất lượng cao trả phí — chỉ trả "eligible:true" cho bài đọc/hội thoại CÓ lĩnh vực
// trong Thư viện AI (xem api/_generate/audio.js), các bài khác trả eligible:false để caller tự
// rơi về Web Speech miễn phí, KHÔNG coi đây là lỗi cần hiện thông báo.
// SỬA LẠI TOÀN BỘ KIẾN TRÚC (2026-07-30, Minh: "audio luôn bị khựng khi đọc câu mới") — 1 lượt
// gọi DUY NHẤT trả về ĐÚNG 1 URL (server tự sinh + ghép mọi câu thành 1 file, xem
// generate_lesson_full_audio trong api/_generate/audio.js), thay hẳn vòng lặp gọi từng câu cũ.
export async function getLessonFullAudioUrl(lessonId, genderHints) {
  return callAndParse("generate_lesson_full_audio", { lesson_id: lessonId, gender_hints: genderHints || [] });
}

// Sinh NGAY sau khi tạo bài xong, CÙNG THỜI ĐIỂM với ảnh bìa (xem fetchAndSaveLessonCover bên
// dưới), fire-and-forget, KHÔNG chặn điều hướng sang màn xem bài (Minh: "đảm bảo khi người dùng
// nhấn nút là nghe được ngay" — sinh trước khi cần tới, không sinh-lúc-bấm-nút). views/lesson.js
// TỰ GỌI LẠI đúng action này lúc mount (idempotent — đã có audio_full_url thì trả thẳng URL đã
// lưu, không sinh lại) làm lưới đỡ nếu người dùng mở bài quá nhanh trước khi lượt gọi ở đây kịp
// xong. CHỈ áp dụng bài đọc/hội thoại CÓ lĩnh vực (source='ai_generated' && industry) — khớp
// đúng phạm vi đã chốt, backend tự kiểm tra lại, đây chỉ là lớp gọi sớm.
export function prefetchLessonAudio(lesson) {
  if (lesson?.source !== "ai_generated" || !lesson?.industry) return;
  const content = Array.isArray(lesson.content) ? lesson.content : [];
  if (!content.length) return;
  const genderHints = computeGenderHints(content, lesson.characters);
  getLessonFullAudioUrl(lesson.id, genderHints).catch(() => {
    // Im lặng — lỗi ở lượt sinh SỚM này không nên chặn điều hướng; views/lesson.js sẽ tự thử
    // lại lúc mở bài, và nếu vẫn lỗi thì rơi về Web Speech miễn phí, không phải lỗi hiển thị.
  });
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
