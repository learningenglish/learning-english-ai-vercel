// app/js/mentorApi.js — hiểu biết "Mentor AI gọi action nào, payload/response ra sao" nằm
// DUY NHẤT ở file này, giống nguyên tắc lessonApi.js. views/mentor.js và
// views/mentorGoal.js chỉ gọi các hàm dưới đây, không tự biết tên action backend.
import { callChatAction } from "./chatApi.js";

async function callAndParse(action, payload) {
  const res = await callChatAction(action, payload);
  if (!res.ok) return res;
  try {
    return { ok: true, data: JSON.parse(res.content) };
  } catch {
    return { ok: false, error: "Phản hồi máy chủ không hợp lệ.", status: 502 };
  }
}

// Thẻ đạo diễn (lớp Lời thoại, không gọi AI) — hiện tức thời khi mở màn Mentor AI.
export async function getMentorAction() {
  return callAndParse("mentor_get_action", {});
}

// Bước 0 (mục 6.3): kiểm tra có cần hiện màn chặn khi bấm nút (+) hay không — không gọi AI.
export async function checkGoalGate() {
  return callAndParse("mentor_check_goal_gate", {});
}

// AI CALL #1 — suy luận chân dung nghề từ câu trả lời tự do của người dùng.
export async function inferGoalProfile(rawText, level) {
  return callAndParse("mentor_infer_goal", { raw_text: rawText, level: level || null });
}

// Lưu mục tiêu đã xác nhận — không gọi AI.
export async function createGoal(occupationProfile, rawKeywords, level) {
  return callAndParse("mentor_create_goal", { occupation_profile: occupationProfile, raw_keywords: rawKeywords, level: level || null });
}

// AI CALL #2 — sinh 1 bài học thật cho mục tiêu (đợt tiếp theo hoặc bài đầu tiên).
export async function generateNextLessonForGoal(goalId) {
  return callAndParse("mentor_next_lesson", { goal_id: goalId });
}

// Không gọi AI — "Bạn cứ để tôi tự chọn giúp" ở Bước 1 khi input rỗng (mục 3.3/3.4 Đợt 3).
export async function autoCreateGoal() {
  return callAndParse("mentor_auto_goal", {});
}

// Không gọi AI — "Tạo lộ trình mới" (khoá chip + xác nhận đổi lộ trình, 2026-07-28 — bản CUỐI,
// thay bản "chuyển vào Yêu thích" đầu ngày): archive (các) mục tiêu 'active' hiện tại, KHÔNG xoá
// gì, bài học GIỮ NGUYÊN vị trí trong Thư mục AI (không đụng Yêu thích). Gọi TRƯỚC khi mở luồng
// chọn ngành mới (createLesson.js).
export async function switchGoal() {
  return callAndParse("mentor_switch_goal", {});
}

// Không gọi AI — số lượt tạo lĩnh vực chuyên ngành đã dùng/tối đa (giới hạn TRỌN ĐỜI, 2026-07-28)
// — dùng để hiện "X/5" trong hộp thoại xác nhận đổi lộ trình TRƯỚC khi người dùng thật sự bấm.
export async function getGoalUsage() {
  return callAndParse("mentor_get_goal_usage", {});
}

// ====== Màn nghi thức xưng hô (mục 3.2/3.4 điểm 1 Đợt 3) ======

export async function getPronounState() {
  return callAndParse("mentor_get_pronoun_state", {});
}

export async function markPronounAsked() {
  return callAndParse("mentor_mark_pronoun_asked", {});
}

export async function setPronounStyle(pronounStyle, nickname) {
  return callAndParse("mentor_set_pronoun_style", { pronoun_style: pronounStyle, nickname: nickname || null });
}

// Câu chờ ngắn dùng đúng giọng xưng hô đã chọn, không đi qua director card.
export async function getTransientLine(key) {
  return callAndParse("mentor_get_transient_line", { key });
}
