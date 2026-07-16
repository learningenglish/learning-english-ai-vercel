// app/js/db.js — đọc/ghi trực tiếp Supabase REST (PostgREST) từ client, dựa hoàn toàn vào
// RLS (supabase/019_lessons.sql) để phân quyền theo auth.uid() — KHÔNG có logic phân quyền
// nào ở tầng này, chỉ gắn đúng JWT của user đang đăng nhập vào mỗi request.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { getSession, setSession, clearSession, isSessionExpired } from "./session.js";
import { refreshAccessToken } from "./authApi.js";

// Tự refresh access_token 1 LẦN nếu đã hết hạn — KHÔNG tự lặp lại (nếu refresh_token cũng
// hỏng thì coi như phiên đã chết, xoá session để authGuard() ở app.js đưa user về /login).
export async function ensureValidSession() {
  let session = getSession();
  if (!session) return null;
  if (isSessionExpired(session)) {
    try {
      const refreshed = await refreshAccessToken(session.refresh_token);
      session = { ...session, ...refreshed };
      setSession(session);
    } catch {
      clearSession();
      return null;
    }
  }
  return session;
}

async function restFetch(path, options = {}) {
  const session = await ensureValidSession();
  if (!session) throw new Error("NOT_LOGGED_IN");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Supabase REST lỗi (${r.status}): ${text.slice(0, 200)}`);
  }
  if (r.status === 204) return null;
  return r.json();
}

export async function listLessons({ filter = "all" } = {}) {
  let q = "select=id,title,title_vi,level,situation,content_type,cover_image_url,is_favorite,created_at&order=created_at.desc";
  if (filter === "favorite") q += "&is_favorite=eq.true";
  if (filter === "dialogue" || filter === "reading") q += `&content_type=eq.${filter}`;
  return restFetch(`lessons?${q}`);
}

export async function getLessonById(id) {
  const rows = await restFetch(`lessons?id=eq.${encodeURIComponent(id)}&select=*`);
  return rows?.[0] || null;
}

export async function setLessonFavorite(id, isFavorite) {
  return restFetch(`lessons?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ is_favorite: isFavorite }),
  });
}

// Card "Tiếp tục học" ở Trang chủ: bản ghi completed_at is null, last_opened_at mới nhất —
// dùng đúng partial index lesson_progress_continue_idx (supabase/019_lessons.sql).
export async function getContinueLearning() {
  const rows = await restFetch(
    "lesson_progress?completed_at=is.null&order=last_opened_at.desc&limit=1&select=*,lessons(id,title,title_vi,level,cover_image_url)"
  );
  return rows?.[0] || null;
}

export async function getLessonProgress(lessonId) {
  const rows = await restFetch(`lesson_progress?lesson_id=eq.${encodeURIComponent(lessonId)}&select=*`);
  return rows?.[0] || null;
}

export async function upsertLessonProgress(lessonId, patch) {
  const session = await ensureValidSession();
  if (!session) throw new Error("NOT_LOGGED_IN");
  return restFetch("lesson_progress?on_conflict=lesson_id,user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ lesson_id: lessonId, user_id: session.user.id, ...patch }),
  });
}

// Hồ sơ: tổng XP + số bài đã hoàn thành — tính trên lesson_progress của chính user (RLS
// tự lọc, không cần truyền user_id trong query).
export async function getProfileStats() {
  const rows = await restFetch("lesson_progress?select=xp_earned,completed_at");
  const totalXp = (rows || []).reduce((s, r) => s + (r.xp_earned || 0), 0);
  const completedCount = (rows || []).filter((r) => r.completed_at).length;
  return { totalXp, completedCount };
}
