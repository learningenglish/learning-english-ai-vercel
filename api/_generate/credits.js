// api/_generate/credits.js (2026-08-19) — Ví Credit DÙNG CHUNG cho Phân tích AI + Luyện viết (spec
// "CƠ CẤU GÓI MOSAIC" mục 16-18: "Không tạo hai ví riêng"). Trước đây 2 tính năng này chỉ có "cầu chì
// vô hình" đếm số dòng/ngày (checkDailyTextAnalysisLimit trong lesson.js, checkDailyWritingLimit trong
// writing.js) — KHÔNG PHẢI Credit, không hiển thị cho người dùng, mục đích chống bot/spam. Giữ NGUYÊN
// 2 cầu chì đó (mục đích khác — chặn lạm dụng bất kể gói) — Credit là lớp giới hạn MỚI, theo gói,
// hiển thị được cho người dùng, cộng thêm chứ không thay thế.
import { SUPABASE_URL } from "./_shared.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE_HEADERS = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

// consumeAiCredits/refundAiCredits gọi RPC service-role-only trong migration 041 — dùng ĐÚNG khuôn
// "for update" khoá dòng + lazy-reset-theo-tháng đã có sẵn ở consume_student_credit()
// (007_student_tiers.sql), không phát minh khuôn mới cho cùng 1 loại vấn đề (đọc trước khi viết).
export async function consumeAiCredits(studentId, amount = 2) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_ai_credits`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ p_student_id: studentId, p_amount: amount }),
  });
  if (!r.ok) {
    console.error("credits.js consumeAiCredits error:", r.status, await r.text().catch(() => ""));
    return { allowed: false, message: "Không kiểm tra được Credit, vui lòng thử lại." };
  }
  const rows = await r.json();
  return rows?.[0] || { allowed: false, message: "Lỗi không xác định." };
}

// GỌI khi lượt AI SAU KHI trừ credit bị lỗi (OpenAI lỗi/timeout/parse lỗi...) — hoàn credit đã trừ,
// đúng khuôn "reserve -> execute -> success: giữ nguyên / failure: refund" (spec mục 15/20). Không
// throw nếu refund lỗi — best-effort, ghi log để biết mà đối soát tay nếu cần, không chặn response
// lỗi gốc đã có sẵn cho người dùng.
export async function refundAiCredits(studentId, amount = 2) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/refund_ai_credits`, {
      method: "POST",
      headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ p_student_id: studentId, p_amount: amount }),
    });
    if (!r.ok) console.error("credits.js refundAiCredits error:", r.status, await r.text().catch(() => ""));
  } catch (e) {
    console.error("credits.js refundAiCredits exception:", e);
  }
}

// Đọc số dư — dùng cho UI (bộ đếm Credit ở header Phân tích/Luyện viết, card Tiến trình).
export async function get_credit_balance(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/students?id=eq.${ctx.studentId}&select=package_tier,ai_credits_balance,ai_credits_reset_at,is_admin`,
    { headers: SERVICE_HEADERS }
  );
  if (!r.ok) return { error: "Không đọc được số dư Credit.", status: 502 };
  const rows = await r.json();
  const row = rows?.[0];
  if (!row) return { error: "Không tìm thấy tài khoản học viên.", status: 404 };
  // "is_admin" (2026-08-20, Minh: "admin là không giới hạn") — consume_ai_credits() (migration 044)
  // ĐÃ bỏ qua trừ credit thật cho admin, nhưng số cột "ai_credits_balance" trong DB vẫn là giá trị
  // thấp/0 bình thường (không tự đồng bộ) — hiện số LỚN ở đây để UI (header.js) không hiện nhầm
  // icon khoá dù thực tế không hề bị chặn.
  return {
    content: JSON.stringify({
      packageTier: row.package_tier,
      balance: row.is_admin ? 999 : row.ai_credits_balance,
      resetAt: row.ai_credits_reset_at,
    }),
  };
}
