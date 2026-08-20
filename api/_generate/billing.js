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

// Mã tham chiếu ĐƠN HÀNG — 2026-08-20, đổi định dạng để KHỚP giới hạn "Nhận diện mã thanh toán" của
// SePay (Cấu hình chung -> Cấu trúc mã thanh toán, Minh đã cấu hình thật): tiền tố tối đa 5 ký tự
// CHỮ CÁI ("MOSAI", KHÔNG phải "MOSAIC" — 6 ký tự vượt giới hạn 5), hậu tố CHỈ hỗ trợ kiểu "Số
// nguyên" (thuần chữ số, không được lẫn chữ cái) — bản cũ dùng hậu tố base36 lẫn chữ cái, KHÔNG
// khớp được. Hậu tố 8 chữ số ngẫu nhiên (đủ ngắn, đủ tránh trùng ở quy mô app này — order_ref có
// ràng buộc UNIQUE ở DB, trùng cực hiếm sẽ tự lỗi 502, user bấm lại là ra mã mới).
function buildOrderRef() {
  const digits = Math.floor(10000000 + Math.random() * 90000000); // đúng 8 chữ số
  return `MOSAI${digits}`;
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
  const orderRef = buildOrderRef();

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
// EXPORT (2026-08-20) — coverImage.js cần dùng lại ĐÚNG hàm này cho action "admin_set_lesson_cover_image"
// (sửa ảnh bìa bài học CHUNG, không phải bài của riêng ctx.studentId — cần quyền admin thay vì chỉ
// "đã đăng nhập"), tránh viết lại 1 bản isAdmin() thứ 2 lệch nhau.
export async function isAdmin(ctx) {
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
// THÊM 2 mốc NGÀY (2026-08-20, Minh: "Trong gói tặng, thêm cho tôi gói 3 ngày và 5 ngày" — dùng
// thử nghiệm ngắn hạn) — xem supabase/046_package_grant_duration_days.sql (đổi "months" thành cặp
// "duration_value"+"duration_unit" ở cả DB lẫn đây).
const VALID_GRANT_DURATIONS = { day: [3, 5], month: [3, 6, 12] };

export async function admin_grant_package(data, ctx) {
  if (!(await isAdmin(ctx))) return { error: "Không có quyền quản trị.", status: 403 };
  const targetEmail = (data?.targetEmail || "").trim().toLowerCase();
  const tier = data?.tier;
  const durationValue = Number(data?.durationValue);
  const durationUnit = data?.durationUnit;
  if (!targetEmail) return { error: "Thiếu email tài khoản cần tặng.", status: 400 };
  if (!["A1_A2", "B1", "B2"].includes(tier)) return { error: "Gói không hợp lệ.", status: 400 };
  if (!VALID_GRANT_DURATIONS[durationUnit]?.includes(durationValue)) return { error: "Thời hạn không hợp lệ.", status: 400 };

  const adminEmailRows = await (
    await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${ctx.studentId}&select=email`, { headers: SERVICE_HEADERS })
  ).json();
  const grantedByEmail = adminEmailRows?.[0]?.email || "unknown";

  const lookupRes = await fetch(`${SUPABASE_URL}/rest/v1/students?email=eq.${encodeURIComponent(targetEmail)}&select=id,email`, {
    headers: SERVICE_HEADERS,
  });
  if (!lookupRes.ok) return { error: "Không tra được tài khoản.", status: 502 };
  const targetRows = await lookupRes.json();
  const target = targetRows?.[0];

  // Email CHƯA có tài khoản (2026-08-20, Minh: "phải set luôn, không đợi người ta đăng ký mới
  // tặng được") — LÊN LỊCH thay vì báo lỗi, xem supabase/043_pending_package_grants.sql —
  // handle_new_user() tự áp dụng NGAY lúc email này đăng ký tài khoản mới.
  if (!target) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/schedule_package_grant`, {
      method: "POST",
      headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_email: targetEmail,
        p_tier: tier,
        p_duration_value: durationValue,
        p_duration_unit: durationUnit,
        p_granted_by: grantedByEmail,
      }),
    });
    if (!r.ok) {
      console.error("billing.js admin_grant_package (schedule) error:", r.status, await r.text().catch(() => ""));
      return { error: "Lên lịch tặng gói thất bại.", status: 502 };
    }
    return {
      content: JSON.stringify({
        ok: true,
        scheduled: true,
        message: "Chưa có tài khoản — đã lên lịch, tự áp dụng ngay khi email này đăng ký.",
        targetEmail,
      }),
    };
  }

  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/grant_package`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_student_id: target.id,
      p_tier: tier,
      p_duration_value: durationValue,
      p_duration_unit: durationUnit,
      p_granted_by: grantedByEmail,
    }),
  });
  if (!r.ok) {
    console.error("billing.js admin_grant_package error:", r.status, await r.text().catch(() => ""));
    return { error: "Tặng gói thất bại.", status: 502 };
  }
  const rows = await r.json();
  const result = rows?.[0];
  if (!result?.ok) return { error: result?.message || "Tặng gói thất bại.", status: 400 };
  return { content: JSON.stringify({ ...result, scheduled: false, targetEmail: target.email }) };
}

// Lịch sử tặng gói (2026-08-20, Minh: "tôi kiểm tra các gói tặng ở đâu? Trong phần quản trị không
// thấy list gì hết" — trước đây chỉ có FORM tặng mới, không có nơi xem lại) — trả về CẢ 2 loại:
// "grants" (đã tặng thật, bảng package_grants — audit, xem 041/046) VÀ "pendingGrants" (đã lên
// lịch cho email CHƯA đăng ký, bảng pending_package_grants — xem 043/046, applied_at=null nghĩa là
// còn đang chờ). Không gộp chung 1 danh sách vì 2 trạng thái khác hẳn nhau, UI cần phân biệt rõ.
export async function admin_list_package_grants(data, ctx) {
  if (!(await isAdmin(ctx))) return { error: "Không có quyền quản trị.", status: 403 };
  const [grantsRes, pendingRes] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/package_grants?select=id,tier,duration_value,duration_unit,granted_by_email,created_at,expires_at,students(email,full_name)&order=created_at.desc&limit=50`,
      { headers: SERVICE_HEADERS }
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/pending_package_grants?applied_at=is.null&select=id,email,tier,duration_value,duration_unit,granted_by_email,created_at&order=created_at.desc&limit=50`,
      { headers: SERVICE_HEADERS }
    ),
  ]);
  if (!grantsRes.ok || !pendingRes.ok) return { error: "Không đọc được lịch sử tặng gói.", status: 502 };
  return {
    content: JSON.stringify({
      grants: await grantsRes.json(),
      pendingGrants: await pendingRes.json(),
    }),
  };
}
