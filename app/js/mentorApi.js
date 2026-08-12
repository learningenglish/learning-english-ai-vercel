// app/js/mentorApi.js — RÚT GỌN 2026-08-11 (rà soát toàn app, xem
// _archive/mentor-ai-personal-flow/mentorApi.js cho bản gốc đầy đủ) — chỉ còn "createGoal", dùng
// bởi views/industrySelect.js để lưu lại chuyên ngành đã chọn (danh mục cố định, không sinh
// bài). Mọi hàm khác từng ở đây (Mentor AI cá nhân hoá: next_slot, nghi thức xưng hô, hàng đợi
// ôn tập...) đã hết caller thật kể từ khi createLesson.js archive cùng đợt.
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

// Lưu chuyên ngành đã chọn/xác nhận — không gọi AI.
export async function createGoal(occupationProfile, rawKeywords, level) {
  return callAndParse("mentor_create_goal", { occupation_profile: occupationProfile, raw_keywords: rawKeywords, level: level || null });
}
