// api/webhooks/payment.js — Endpoint THẬT riêng (KHÔNG qua /api/chat, xem ghi chú "_" ở đầu
// lesson.js — thư mục KHÔNG có tiền tố "_" tự động thành route công khai) — nơi 1 dịch vụ trung
// gian đọc-giao-dịch-ngân-hàng (SePay/Casso...) gọi tới khi có tiền chuyển vào tài khoản ACB của
// Minh, để TỰ ĐỘNG xác nhận đơn hàng thay vì Minh phải bấm tay ở tab Quản trị (2026-08-20, Minh:
// "Tôi muốn khi thanh toán xong tự động duyệt").
//
// CHƯA CÓ DỊCH VỤ NÀO NỐI VÀO ĐÂY THẬT — Minh cần tự đăng ký SePay hoặc Casso + liên kết ngân
// hàng ACB trước (không phải việc code làm được, giống việc Minh tự cung cấp STK lúc trước), rồi
// điền URL endpoint này vào cấu hình webhook của dịch vụ đó. TÊN TRƯỜNG DỮ LIỆU bên dưới (content/
// description/data[]/amount...) là suy đoán hợp lý dựa trên 2 dịch vụ phổ biến nhất — CẦN ĐỐI
// CHIẾU LẠI với payload thật khi Minh có tài khoản, khả năng phải chỉnh lại tên trường.
//
// Bảo mật: xác thực bằng CHUỖI BÍ MẬT DÙNG CHUNG qua query "?token=" (đặt PAYMENT_WEBHOOK_SECRET
// trên Vercel, dán ĐÚNG giá trị đó vào URL webhook khai báo bên dịch vụ) — không tin bất kỳ payload
// nào không kèm đúng token, tránh người lạ tự gọi endpoint này để kích hoạt gói khống.
import { SUPABASE_URL } from "../_generate/_shared.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE_HEADERS = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
const PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET;

// Khớp buildOrderRef() (billing.js, 2026-08-20 — đổi để vừa giới hạn "Nhận diện mã thanh toán" của
// SePay): tiền tố "MOSAI" (5 ký tự chữ, đúng giới hạn tối đa của SePay) + 6-8 chữ số (Minh cấu
// hình hậu tố "Số nguyên" 6-8 ký tự trong Cấu trúc mã thanh toán — code luôn sinh đúng 8, chấp
// nhận 6-8 ở đây để không vỡ nếu Minh đổi khoảng cấu hình sau này).
const ORDER_REF_PATTERN = /MOSAI\d{6,8}/;

// Gom mọi "giao dịch" có thể có trong payload — SePay gửi 1 object phẳng/lượt gọi, Casso gửi
// {data: [...]} có thể nhiều giao dịch/lượt gọi — chuẩn hoá về 1 mảng để xử lý chung 1 đường.
function extractTransactions(body) {
  if (Array.isArray(body?.data)) return body.data;
  if (body && typeof body === "object") return [body];
  return [];
}

function extractDescription(tx) {
  return (tx.content || tx.description || tx.memo || tx.transferContent || "").toString();
}

function extractAmount(tx) {
  const raw = tx.transferAmount ?? tx.amount ?? tx.amount_in ?? tx.creditAmount;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchOrderByRef(orderRef) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/payment_orders?order_ref=eq.${encodeURIComponent(orderRef)}&select=id,amount,status`, {
    headers: SERVICE_HEADERS,
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] || null;
}

async function confirmOrder(orderRef) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/confirm_payment_order`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ p_order_ref: orderRef }),
  });
  if (!r.ok) return { ok: false, message: `RPC lỗi ${r.status}` };
  const rows = await r.json();
  return rows?.[0] || { ok: false, message: "Không có phản hồi." };
}

export default async function handler(req, res) {
  // Health-check GET (nhiều dịch vụ tự ping URL lúc khai báo webhook để xác nhận endpoint sống).
  if (req.method === "GET") {
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST allowed" });
    return;
  }

  // SePay gửi API Key qua header "Authorization" (dạng "Apikey <token>" theo tài liệu SePay,
  // "Bearer <token>" cũng được chấp nhận phòng trường hợp đổi quy ước) — kiểm tra CẢ 2 dạng, cộng
  // query "?token="/header "x-webhook-token" tự đặt (phòng dùng dịch vụ khác Casso sau này không
  // theo đúng quy ước SePay).
  const authHeader = (req.headers["authorization"] || "").toString();
  const authToken = authHeader.replace(/^(Apikey|Bearer)\s+/i, "").trim();
  const token = authToken || req.query?.token || req.headers["x-webhook-token"];
  if (!PAYMENT_WEBHOOK_SECRET || token !== PAYMENT_WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body || {};
  const transactions = extractTransactions(body);
  const results = [];

  for (const tx of transactions) {
    const description = extractDescription(tx);
    const cleaned = description.replace(/\s+/g, "").toUpperCase();
    const match = cleaned.match(ORDER_REF_PATTERN);
    if (!match) {
      results.push({ ok: false, reason: "no_order_ref_in_description" });
      continue;
    }
    const orderRef = match[0];
    const order = await fetchOrderByRef(orderRef);
    if (!order) {
      results.push({ ok: false, reason: "order_not_found", orderRef });
      continue;
    }
    if (order.status !== "pending") {
      results.push({ ok: false, reason: "order_not_pending", orderRef });
      continue;
    }
    // Đối chiếu SỐ TIỀN nếu payload có (an toàn: memo đúng chữ nhưng tiền chuyển thiếu/thừa
    // KHÔNG được tự kích hoạt gói) — chỉ bỏ qua đối chiếu khi dịch vụ không gửi trường số tiền
    // nào nhận diện được (an toàn hơn ở phía "chặn nhầm", không phải "duyệt nhầm").
    const amount = extractAmount(tx);
    if (amount !== null && amount !== order.amount) {
      results.push({ ok: false, reason: "amount_mismatch", orderRef, expected: order.amount, got: amount });
      continue;
    }
    const result = await confirmOrder(orderRef);
    results.push({ orderRef, ...result });
  }

  res.status(200).json({ processed: results.length, results });
}
