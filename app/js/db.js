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

// Hồ sơ + Thống kê: tổng XP + số bài đã hoàn thành — tính trên lesson_progress của chính
// user (RLS tự lọc, không cần truyền user_id trong query).
export async function getProfileStats() {
  const rows = await restFetch("lesson_progress?select=xp_earned,completed_at");
  const totalXp = (rows || []).reduce((s, r) => s + (r.xp_earned || 0), 0);
  const completedCount = (rows || []).filter((r) => r.completed_at).length;
  return { totalXp, completedCount };
}

// "Streak" (số ngày học liên tục) — KHÔNG có cột riêng lưu streak, tính suy ra từ các
// ngày lịch có ít nhất 1 lần last_opened_at. Cho phép streak không rớt về 0 nếu HÔM NAY
// chưa mở bài nào (chỉ rớt khi bỏ lỡ trọn 1 ngày) — đếm lùi từ hôm nay hoặc hôm qua.
export async function getStreakDays() {
  const rows = await restFetch("lesson_progress?select=last_opened_at");
  const activeDates = new Set((rows || []).map((r) => (r.last_opened_at || "").slice(0, 10)).filter(Boolean));

  const cursor = new Date();
  if (!activeDates.has(isoDate(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (activeDates.has(isoDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Màn "Lịch sử": danh sách bài đã mở, kèm thông tin bài học qua embed quan hệ FK
// (lesson_progress.lesson_id -> lessons), mới mở gần nhất trước.
export async function getHistory() {
  return restFetch(
    "lesson_progress?order=last_opened_at.desc&select=lesson_id,completed_at,xp_earned,last_opened_at,lessons(id,title,title_vi,level,content_type)"
  );
}
