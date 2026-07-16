// app/js/session.js — lưu/đọc phiên đăng nhập (Supabase Auth) trong localStorage.
const STORAGE_KEY = "lea_student_session";

export function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

// Trừ hao 30s trước mốc hết hạn thật để tránh vừa hết hạn đúng lúc 1 request khác đang bay.
export function isSessionExpired(session) {
  if (!session?.expires_at) return true;
  return Date.now() / 1000 > session.expires_at - 30;
}
