// app/js/packageApi.js — gọi các action Gói/Credit/Thanh toán (2026-08-20, spec "CƠ CẤU GÓI
// MOSAIC"). Cùng khuôn callAndParse() đã dùng ở lessonApi.js.
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

// { packageTier, balance, resetAt }
export async function getCreditBalance() {
  return callAndParse("get_credit_balance");
}

// { packageTier, switchCount, canSwitch, reason, required, completed }
export async function getSpecializationSwitchStatus() {
  return callAndParse("get_specialization_switch_status");
}

// { orderId, orderRef, amount, targetTier, qrUrl, bankAccountNumber, bankAccountName, bankCode }
export async function createPaymentOrder(targetTier) {
  return callAndParse("create_payment_order", { targetTier });
}

// { orders: [{id, order_ref, target_tier, amount, status, created_at, confirmed_at}] }
export async function getMyPaymentOrders() {
  return callAndParse("get_my_payment_orders");
}

// ====== QUẢN TRỊ (chỉ tài khoản trong ADMIN_EMAILS gọi được thật — server tự kiểm tra lại) ======

// { orders: [{id, order_ref, target_tier, amount, created_at, students:{email, full_name}}] }
export async function adminListPendingPayments() {
  return callAndParse("admin_list_pending_payments");
}

// { ok, message, package_tier, credits_granted }
export async function adminConfirmPayment(orderRef) {
  return callAndParse("admin_confirm_payment", { orderRef });
}

// { ok, message, package_tier, expires_at, targetEmail }
// "durationUnit": "day" | "month" (2026-08-20, thêm mốc 3/5 ngày cạnh 3/6/12 tháng cũ, xem
// admin.js GRANT_DURATION_OPTIONS).
export async function adminGrantPackage(targetEmail, tier, durationValue, durationUnit) {
  return callAndParse("admin_grant_package", { targetEmail, tier, durationValue, durationUnit });
}
