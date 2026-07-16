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
