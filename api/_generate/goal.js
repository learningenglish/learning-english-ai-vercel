// api/_generate/goal.js — ĐỔI TÊN 2026-08-12 (từ "mentor.js", rà soát đặt tên toàn app, Minh: "app
// hiện tại không có liên quan đến Mentor... dò lại từng luồng, đổi tên lại cho phù hợp") — RÚT
// GỌN 2026-08-11 (Minh: "luồng của app này vốn dĩ đã không còn sinh bài... rà soát lại toàn bộ
// app, những phần không còn liên quan tới luồng truy cập hiện tại hãy báo cáo để loại ra") — bản
// gốc (Mentor AI Đợt 3: mục tiêu theo goal_id, next_slot tự sinh bài theo tiến độ cá nhân, hàng
// đợi ôn tập ngữ pháp, nghi thức xưng hô...) đã lưu NGUYÊN VẸN tại
// _archive/mentor-ai-personal-flow/mentor.js — xác nhận qua rà soát toàn app: KHÔNG còn icon/link
// nào dẫn tới luồng đó (route "/create" đã archive cùng đợt). File này giờ CHỈ còn đúng 1 action
// còn sống: "create_goal" — dùng bởi views/industrySelect.js (màn "Chọn chuyên ngành", danh mục
// CỐ ĐỊNH các vị trí, không phải luồng tự sinh bài cá nhân đã bỏ) để lưu lại 1 "learning_goals" —
// bản ghi hồ sơ/nhãn hiển thị chuyên ngành đang chọn của user (Home hiện "Anh văn chuyên ngành Kế
// toán" từ đây), KHÔNG tự sinh bài nào cả.
//
// GHI CHÚ ĐỔI TÊN: bảng Supabase "mentor_events" (ghi log goal_created/goal_archived) VẪN giữ tên
// cũ — đổi tên cột/bảng DB cần 1 migration SQL riêng (Minh tự chạy trong Supabase SQL Editor theo
// quy ước), CHƯA làm ở đợt này vì bảng chỉ ghi log nội bộ, không lộ ra UI/API nào — ưu tiên thấp.
import { SUPABASE_URL } from "./_shared.js";
import { buildConfirmationDisplay } from "./curriculum/skin.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE_HEADERS = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
const VALID_LEVELS = ["A1", "A2", "B1", "B2", "C1"];

async function restGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SERVICE_HEADERS });
  if (!r.ok) {
    console.error("goal.js restGet error:", path, r.status, await r.text().catch(() => ""));
    return null;
  }
  return r.json();
}

// Nhật ký sự kiện (mục 3.4 điểm 4 Đợt 3, GIỮ LẠI — bảng "mentor_events" vẫn ghi nhận đúng 2 sự
// kiện "goal_created"/"goal_archived" cho luồng chọn chuyên ngành còn sống, xem ghi chú đổi tên
// đầu file) — fire-and-forget: lỗi ghi log không được làm hỏng luồng chính.
function logGoalEvent(studentId, eventType, context) {
  fetch(`${SUPABASE_URL}/rest/v1/mentor_events`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: studentId, event_type: eventType, context: context || {} }),
  }).catch((e) => console.error("goal.js logGoalEvent error:", e));
}

// occupation_profile "chung" (không có merged_occupation cho buildConfirmationDisplay của
// skin.js đọc, hàm đó KHÔNG được sửa) — tự dựng hiển thị riêng.
function buildGoalConfirmationDisplay(profile) {
  if (profile?.is_general) {
    return { title_line: "Giao tiếp tổng quát", topic_line: `Chủ đề: ${profile.primary_communication_scope}`, invite_line: "Mời bạn học" };
  }
  return buildConfirmationDisplay(profile);
}

// GIỚI HẠN 5 LĨNH VỰC TRỌN ĐỜI (2026-07-28) — đếm learning_goals KHÁC NHAU đã TỪNG tạo (kể cả
// archived, KHÔNG reset theo ngày/tháng), KHÔNG tính "Giao tiếp tổng quát" (is_general).
const MAX_LIFETIME_INDUSTRY_GOALS = 5;

async function countLifetimeIndustryGoals(studentId) {
  const rows = await restGet(`learning_goals?user_id=eq.${studentId}&select=occupation_profile`);
  return (rows || []).filter((r) => !r.occupation_profile?.is_general).length;
}

// Archive (các) goal 'active' hiện tại của user, TRỪ "exceptGoalId" nếu có. Trả null nếu lỗi ghi
// DB, trả mảng id đã archive (rỗng nếu không có gì cần archive) nếu thành công. Client KHÔNG có
// quyền UPDATE learning_goals (020_mentor_ai.sql, không có policy INSERT/UPDATE cho
// authenticated) nên bắt buộc qua service role ở đây.
async function archiveOtherActiveGoals(studentId, exceptGoalId) {
  let q = `learning_goals?user_id=eq.${studentId}&status=eq.active&select=id`;
  if (exceptGoalId) q += `&id=neq.${exceptGoalId}`;
  const activeGoals = await restGet(q);
  const goalIds = (activeGoals || []).map((g) => g.id);
  if (!goalIds.length) return [];
  const idList = goalIds.join(",");

  const archiveRes = await fetch(`${SUPABASE_URL}/rest/v1/learning_goals?id=in.(${idList})`, {
    method: "PATCH",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "archived" }),
  });
  if (!archiveRes.ok) {
    console.error("goal.js archiveOtherActiveGoals error:", archiveRes.status, await archiveRes.text().catch(() => ""));
    return null;
  }
  for (const goalId of goalIds) logGoalEvent(studentId, "goal_archived", { goal_id: goalId });
  return goalIds;
}

async function insertLearningGoal(studentId, profile, rawKeywords, level) {
  // Chỉ đếm/chặn khi TẠO LĨNH VỰC CHUYÊN NGÀNH THẬT — "Giao tiếp tổng quát" (is_general) không
  // tính. "is_fixed_catalog" (2026-08-04) — danh mục vị trí Kế toán CỐ ĐỊNH/hữu hạn (8 vị trí,
  // xem views/industrySelect.js) không tính vào giới hạn 5 (giới hạn đó vốn sinh ra để chặn
  // luồng gõ tự do đã archive, không áp dụng cho danh mục cố định).
  if (!profile?.is_general && !profile?.is_fixed_catalog) {
    const used = await countLifetimeIndustryGoals(studentId);
    if (used >= MAX_LIFETIME_INDUSTRY_GOALS) {
      return { limitReached: true, used, max: MAX_LIFETIME_INDUSTRY_GOALS };
    }
  }
  // Tạo lĩnh vực MỚI luôn thay thế goal đang hoạt động hiện tại.
  const archived = await archiveOtherActiveGoals(studentId, null);
  if (archived === null) return null;
  const display = buildGoalConfirmationDisplay(profile);
  const validLevel = VALID_LEVELS.includes(level) ? level : null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/learning_goals`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: studentId,
      title: display.title_line,
      topic_line: display.topic_line,
      raw_keywords: (rawKeywords || "").slice(0, 500) || null,
      level: validLevel,
      occupation_profile: profile,
      status: "active",
      lesson_count: 0,
    }),
  });
  if (!r.ok) {
    console.error("goal.js insertLearningGoal error:", r.status, await r.text().catch(() => ""));
    return null;
  }
  const rows = await r.json();
  const goal = rows?.[0] || null;
  if (goal) logGoalEvent(studentId, "goal_created", { goal_id: goal.id, is_general: !!profile?.is_general });
  return { goal, confirmation: display };
}

// Không gọi AI — chỉ lưu kết quả đã được người dùng xác nhận (chọn 1 vị trí trong danh mục cố
// định, views/industrySelect.js).
export async function create_goal(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const profile = data.occupation_profile;
  if (!profile?.merged_occupation && !profile?.is_general) return { error: "Thiếu chân dung nghề.", status: 400 };
  const result = await insertLearningGoal(ctx.studentId, profile, data.raw_keywords, data.level);
  if (result?.limitReached) {
    return { error: `Bạn đã dùng hết ${result.max} lượt tạo lĩnh vực chuyên ngành.`, status: 403 };
  }
  if (!result) return { error: "Tạo mục tiêu thất bại, vui lòng thử lại.", status: 502 };
  return { content: JSON.stringify(result) };
}
