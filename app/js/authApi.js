// app/js/authApi.js — gọi thẳng Supabase Auth REST API (không dùng SDK @supabase/supabase-js
// qua CDN) để tránh phụ thuộc 1 CDN bên ngoài cho toàn bộ /app/ — cùng phong cách raw fetch
// mà api/chat.js phía backend đã dùng, giữ "một người bảo trì được toàn bộ" không cần biết
// thêm 1 thư viện ngoài.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

async function authFetch(grantType, body) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(data?.error_description || data?.msg || "Đăng nhập thất bại, vui lòng thử lại.");
  }
  return normalizeAuthResponse(data);
}

export function signInWithPassword(email, password) {
  return authFetch("password", { email, password });
}

// Đăng nhập Google/Facebook (2026-08-04) — dùng ĐÚNG Supabase Auth OAuth (Providers đã bật
// sẵn trong Supabase Dashboard, Minh đã dán Client ID/Secret), KHÔNG viết hệ thống đăng nhập
// riêng. Điều hướng CẢ TRANG (không phải fetch) tới endpoint /authorize của GoTrue — Supabase
// tự lo màn chọn tài khoản + tạo user mới nếu lần đầu, rồi redirect NGƯỢC LẠI đúng "redirect_to"
// kèm access_token/refresh_token trên URL fragment (#...), xem app.js::consumeOAuthCallback().
//
// "redirect_to" tính ĐỘNG theo window.location.origin (KHÔNG hardcode domain trong config.js) —
// app CHƯA có domain cố định (đang test qua localhost:3001/Vercel preview đổi liên tục), tự
// đúng bất kể đang chạy ở đâu MIỄN LÀ domain đó đã được thêm vào Supabase Dashboard ->
// Authentication -> URL Configuration -> Redirect URLs (khác hẳn bước dán Client ID/Secret của
// provider — 2 bước riêng biệt, dễ nhầm). Redirect URI khai trong Google/Facebook Console vẫn
// LUÔN LÀ 1 URL CỐ ĐỊNH của Supabase (`${SUPABASE_URL}/auth/v1/callback`), không đổi theo domain
// app — không việc gì phải sửa 2 chỗ đó khi app đổi domain.
export function getOAuthRedirectUrl() {
  // "./" (thư mục hiện tại, thường là "/app/") thay vì "/" tuyệt đối — app không LUÔN đứng ở gốc
  // domain (xem cùng bài học đường dẫn tuyệt đối/tương đối đã ghi trong background.js).
  return new URL("./", window.location.href).href;
}

export function startOAuthLogin(provider) {
  const redirectTo = getOAuthRedirectUrl();
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(redirectTo)}`;
  window.location.href = url;
}

// Sau khi Supabase xử lý xong OAuth, nó redirect NGƯỢC LẠI "redirect_to" kèm access_token/
// refresh_token trên URL fragment — KHÔNG kèm object "user" đầy đủ như response JSON của
// grant_type=password (normalizeAuthResponse() ở trên), phải tự GET /auth/v1/user bằng
// access_token vừa nhận để dựng ĐÚNG cùng 1 hình dạng session mà session.js/app.js đang dùng
// chung cho cả 2 luồng đăng nhập (email/password lẫn OAuth) — xem app.js::consumeOAuthCallback().
export async function completeOAuthSession(accessToken, refreshToken, expiresIn) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  const user = await r.json();
  if (!r.ok) {
    throw new Error(user?.error_description || user?.msg || "Không lấy được thông tin tài khoản sau khi đăng nhập.");
  }
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + (Number(expiresIn) || 3600),
    user,
  };
}

export function refreshAccessToken(refreshToken) {
  return authFetch("refresh_token", { refresh_token: refreshToken });
}

function normalizeAuthResponse(data) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: data.user,
  };
}
