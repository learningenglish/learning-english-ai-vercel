// api/_generate/billing.js (2026-08-19) — Thanh toán nội địa VN qua chuyển khoản mã VietQR (Minh
// hiện chỉ có tài khoản ngân hàng cá nhân, chưa có merchant account VNPay/PayOS/Momo — xem trao đổi
// trong docs/NHAT-KY-LAM-VIEC.md). KHÔNG tự động trừ tiền hàng tháng như Stripe — mô hình: user quét
// QR chuyển khoản 1 lần cho 1 chu kỳ tháng, XÁC NHẬN THỦ CÔNG qua màn quản trị (bước khởi đầu, có thể
// nâng cấp lên webhook tự động qua SePay/Casso sau mà KHÔNG cần đổi kiến trúc — chỉ thêm 1 webhook
// gọi confirmPaymentOrder() y hệt hàm quản trị đang gọi).
//
// VietQR (img.vietqr.io) là dịch vụ ẢNH QR CÔNG KHAI, MIỄN PHÍ, KHÔNG cần đăng ký/API key — chỉ cần
// số tài khoản + mã ngân hàng + tên chủ tài khoản, đúng chuẩn VietQR mọi app ngân hàng VN đều đọc
// được. Xem thêm: https://www.vietqr.io/danh-sach-api/
import { SUPABASE_URL } from "./_shared.js";
import { PACKAGE_CONFIG, VALID_PACKAGE_TIERS } from "../_shared/packages.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE_HEADERS = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

const PAYMENT_BANK_CODE = process.env.PAYMENT_BANK_CODE; // vd "ACB"
const PAYMENT_ACCOUNT_NUMBER = process.env.PAYMENT_ACCOUNT_NUMBER;
const PAYMENT_ACCOUNT_NAME = process.env.PAYMENT_ACCOUNT_NAME;

// Mã tham chiếu ĐƠN HÀNG — PHẢI ngắn (VietQR addInfo có giới hạn ký tự thực tế theo từng ngân hàng,
// an toàn dưới ~25 ký tự), PHẢI dò lại được ĐÚNG user khi Minh xác nhận thủ công (không cần đoán/tra
// cứu chéo). Định dạng: "MOSAIC" + 8 ký tự đầu của studentId (đủ để tra cứu, đọc được qua giọng đọc
// ngân hàng khi Minh xem sao kê).
function buildOrderRef(studentId) {
  const short = (studentId || "").replace(/-/g, "").slice(0, 8).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MOSAIC${short}${rand}`;
}

// KHÔNG gọi AI — tạo 1 "payment_orders" pending + trả URL ảnh QR VietQR tương ứng.
export async function create_payment_order(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const targetTier = data?.targetTier;
  if (!VALID_PACKAGE_TIERS.includes(targetTier) || targetTier === "FREE") {
    return { error: "Gói không hợp lệ.", status: 400 };
  }
  if (!PAYMENT_BANK_CODE || !PAYMENT_ACCOUNT_NUMBER || !PAYMENT_ACCOUNT_NAME) {
    return { error: "Hệ thống thanh toán chưa được cấu hình, vui lòng liên hệ hỗ trợ.", status: 503 };
  }
  const amount = PACKAGE_CONFIG[targetTier].price;
  const orderRef = buildOrderRef(ctx.studentId);

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/payment_orders`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: ctx.studentId,
      order_ref: orderRef,
      target_tier: targetTier,
      amount,
      status: "pending",
    }),
  });
  if (!insertRes.ok) {
    console.error("billing.js create_payment_order insert error:", insertRes.status, await insertRes.text().catch(() => ""));
    return { error: "Không tạo được đơn hàng, vui lòng thử lại.", status: 502 };
  }
  const rows = await insertRes.json();
  const order = rows?.[0];

  const qrUrl =
    `https://img.vietqr.io/image/${encodeURIComponent(PAYMENT_BANK_CODE)}-${encodeURIComponent(PAYMENT_ACCOUNT_NUMBER)}-compact2.png` +
    `?amount=${amount}&addInfo=${encodeURIComponent(orderRef)}&accountName=${encodeURIComponent(PAYMENT_ACCOUNT_NAME)}`;

  return {
    content: JSON.stringify({
      orderId: order?.id,
      orderRef,
      amount,
      targetTier,
      qrUrl,
      bankAccountNumber: PAYMENT_ACCOUNT_NUMBER,
      bankAccountName: PAYMENT_ACCOUNT_NAME,
      bankCode: PAYMENT_BANK_CODE,
    }),
  };
}

// Đọc trạng thái đơn hàng gần nhất của chính user — để UI tự poll biết Minh đã xác nhận hay chưa.
export async function get_my_payment_orders(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/payment_orders?user_id=eq.${ctx.studentId}&select=id,order_ref,target_tier,amount,status,created_at,confirmed_at&order=created_at.desc&limit=5`,
    { headers: SERVICE_HEADERS }
  );
  if (!r.ok) return { error: "Không đọc được đơn hàng.", status: 502 };
  return { content: JSON.stringify({ orders: await r.json() }) };
}

// ====== QUẢN TRỊ (chỉ Minh dùng, KHÔNG lộ cho user thường) ======
// ctx (api/chat.js) chỉ có {studentId, mentorId}, KHÔNG có email sẵn — tự đọc email từ "students"
// bằng service role rồi so với ADMIN_EMAILS (đơn giản/đủ dùng cho 1 người quản trị lúc này).
async function isAdmin(ctx) {
  if (!ctx?.studentId) return false;
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.length) return false;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${ctx.studentId}&select=email`, { headers: SERVICE_HEADERS });
  if (!r.ok) return false;
  const rows = await r.json();
  const email = (rows?.[0]?.email || "").toLowerCase();
  return !!email && adminEmails.includes(email);
}

// Xác nhận thủ công — MỘT bước duy nhất kích hoạt cả "payment_orders.status" LẪN "students.package_tier"
// + credits đầy theo gói mới, atomic qua RPC (tránh nửa vời nếu request chết giữa chừng).
export async function admin_confirm_payment(data, ctx) {
  if (!(await isAdmin(ctx))) return { error: "Không có quyền quản trị.", status: 403 };
  const orderRef = data?.orderRef;
  if (!orderRef) return { error: "Thiếu mã đơn hàng.", status: 400 };

  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/confirm_payment_order`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ p_order_ref: orderRef }),
  });
  if (!r.ok) {
    console.error("billing.js admin_confirm_payment error:", r.status, await r.text().catch(() => ""));
    return { error: "Xác nhận thất bại.", status: 502 };
  }
  const rows = await r.json();
  const result = rows?.[0];
  if (!result?.ok) return { error: result?.message || "Đơn hàng không hợp lệ.", status: 400 };
  return { content: JSON.stringify(result) };
}

export async function admin_list_pending_payments(data, ctx) {
  if (!(await isAdmin(ctx))) return { error: "Không có quyền quản trị.", status: 403 };
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/payment_orders?status=eq.pending&select=id,order_ref,target_tier,amount,created_at,students(email,full_name)&order=created_at.desc&limit=50`,
    { headers: SERVICE_HEADERS }
  );
  if (!r.ok) return { error: "Không đọc được danh sách.", status: 502 };
  return { content: JSON.stringify({ orders: await r.json() }) };
}

// ====== "Gói tặng" (2026-08-20, Minh: "Tặng 3 tháng, Tặng 6 tháng, Tặng 1 năm cho các level" cho
// tài khoản được admin duyệt) — cấp thủ công 1 gói trả phí, KHÔNG qua thanh toán thật, xem
// supabase/041_package_grants.sql cho RPC atomic + bảng audit "package_grants".
const VALID_GRANT_MONTHS = [3, 6, 12];

export async function admin_grant_package(data, ctx) {
  if (!(await isAdmin(ctx))) return { error: "Không có quyền quản trị.", status: 403 };
  const targetEmail = (data?.targetEmail || "").trim().toLowerCase();
  const tier = data?.tier;
  const months = Number(data?.months);
  if (!targetEmail) return { error: "Thiếu email tài khoản cần tặng.", status: 400 };
  if (!["A1_A2", "B1", "B2"].includes(tier)) return { error: "Gói không hợp lệ.", status: 400 };
  if (!VALID_GRANT_MONTHS.includes(months)) return { error: "Thời hạn không hợp lệ.", status: 400 };

  const lookupRes = await fetch(`${SUPABASE_URL}/rest/v1/students?email=eq.${encodeURIComponent(targetEmail)}&select=id,email`, {
    headers: SERVICE_HEADERS,
  });
  if (!lookupRes.ok) return { error: "Không tra được tài khoản.", status: 502 };
  const targetRows = await lookupRes.json();
  const target = targetRows?.[0];
  if (!target) return { error: "Không tìm thấy tài khoản với email này.", status: 404 };

  const adminEmailRows = await (
    await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${ctx.studentId}&select=email`, { headers: SERVICE_HEADERS })
  ).json();
  const grantedByEmail = adminEmailRows?.[0]?.email || "unknown";

  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/grant_package`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ p_student_id: target.id, p_tier: tier, p_months: months, p_granted_by: grantedByEmail }),
  });
  if (!r.ok) {
    console.error("billing.js admin_grant_package error:", r.status, await r.text().catch(() => ""));
    return { error: "Tặng gói thất bại.", status: 502 };
  }
  const rows = await r.json();
  const result = rows?.[0];
  if (!result?.ok) return { error: result?.message || "Tặng gói thất bại.", status: 400 };
  return { content: JSON.stringify({ ...result, targetEmail: target.email }) };
}
