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
  // "content" nằm trong select để thẻ danh sách hiện được ĐÚNG trích đoạn nội dung thật (câu
  // đầu bài) thay vì "situation" — trường đó AI đôi khi viết kiểu mô tả meta ("Bài đọc mô tả
  // ...") thay vì tóm tắt tình huống thật, xem cardHtml() trong views/lessons.js.
  let q = "select=id,title,title_vi,level,situation,content,content_type,cover_image_url,is_favorite,created_at&order=created_at.desc";
  if (filter === "favorite") q += "&is_favorite=eq.true";
  if (filter === "dialogue" || filter === "reading") q += `&content_type=eq.${filter}`;
  return restFetch(`lessons?${q}`);
}

// Màn "Thư viện AI" (bottom nav) — CHỈ bài có lessons.source='ai_generated' (sinh từ form
// "Tạo bài học" tự nhập, action generate_lesson), KHÁC bài "user_text" (dán sẵn văn bản qua
// action analyze_user_text, xem views/createFromText.js) — 2 giá trị enum cố định ở
// api/_generate/lesson.js::buildLessonInsertRow(), luôn được set khi insert nên lọc được
// chắc chắn, không cần suy luận qua content_type hay goal_id (goal_id chỉ dành riêng cho
// luồng Mentor AI đã tắt UI, KHÔNG dùng để phân biệt ở đây).
export async function listAiGeneratedLessons({ filter = "all" } = {}) {
  let q =
    "select=id,title,title_vi,level,situation,content,content_type,cover_image_url,is_favorite,created_at,industry,goal_id" +
    "&source=eq.ai_generated&order=created_at.desc";
  if (filter === "favorite") q += "&is_favorite=eq.true";
  if (filter === "dialogue" || filter === "reading") q += `&content_type=eq.${filter}`;
  return restFetch(`lessons?${q}`);
}

// Nhãn "Đã dừng" cho nhóm lĩnh vực trong Thư mục AI (2026-07-28, "giới hạn 5 lĩnh vực + Thư mục
// AI") — đọc status của TOÀN BỘ learning_goals của user (active lẫn archived), views/lessons.js
// tự đối chiếu qua lessons.goal_id để biết 1 nhóm lĩnh vực có đang "đã dừng" hay không. Chỉ
// id+status (đủ dùng, không cần thêm field), số dòng nhỏ (giới hạn 5 lĩnh vực trọn đời + vài
// dòng "Giao tiếp tổng quát").
export async function listGoalStatuses() {
  return restFetch("learning_goals?select=id,status&order=created_at.desc");
}

// Lưới thư viện Mentor AI (Đợt 3 mục 6.1) — CHỈ bài có goal_id (sinh từ luồng Mentor), khác
// listLessons() ở trên vốn trả TOÀN BỘ bài của user bất kể nguồn nào (tab "Bài học" cũ vẫn
// giữ nguyên hành vi, không lọc theo goal_id).
export async function listMentorLibraryLessons({ filter = "all" } = {}) {
  let q =
    "select=id,title,title_vi,level,situation,content,content_type,cover_image_url,is_favorite,created_at,goal_id" +
    "&goal_id=not.is.null&order=created_at.desc";
  if (filter === "favorite") q += "&is_favorite=eq.true";
  if (filter === "dialogue" || filter === "reading") q += `&content_type=eq.${filter}`;
  return restFetch(`lessons?${q}`);
}

// Màn "Bài học" mới — mục "BÀI ĐANG ĐỌC" (carousel lướt ngang): bài có tiến độ (đã mở, có
// last_opened_at) nhưng CHƯA hoàn thành (completed_at rỗng), mới mở gần nhất trước. Trả kèm
// completed_paragraphs/completed_exercises để tính % tiến độ ở lessonCard.js, không cần gọi
// thêm request nào khác.
export async function listInProgressLessons({ limit = 6 } = {}) {
  const rows = await restFetch(
    "lesson_progress?completed_at=is.null&last_opened_at=not.is.null&order=last_opened_at.desc" +
      `&limit=${limit}` +
      "&select=lesson_id,completed_paragraphs,completed_exercises,lessons(id,title,title_vi,level,situation,content,content_type,cover_image_url,is_favorite,created_at)"
  );
  return (rows || [])
    .filter((r) => r.lessons)
    .map((r) => ({
      ...r.lessons,
      progress_page: r.completed_paragraphs || 0,
      progress_done_exercises: (r.completed_exercises || []).length,
    }));
}

export async function listLearningGoals() {
  return restFetch("learning_goals?select=id,title&status=eq.active&order=created_at.desc");
}

// "AI tạo nội dung" bám lộ trình (2026-07-27, xem views/createLesson.js) — mục tiêu ĐANG HOẠT
// ĐỘNG gần nhất của người dùng, đủ trường để (a) quyết định "tiếp tục mục tiêu cũ" hay "đổi mục
// tiêu" (so raw_keywords với Lĩnh vực/Ngành nghề vừa điền) và (b) gọi thẳng mentor_next_lesson
// nếu tiếp tục. Khác listLearningGoals() ở trên (chỉ id+title, phục vụ màn Mentor AI cũ đã tắt
// UI) — hàm CHỦ Ý MỚI thay vì sửa hàm cũ, tránh đụng code đường (dead nhưng chưa xoá) đó.
export async function getActiveLearningGoal() {
  const rows = await restFetch(
    "learning_goals?select=id,title,raw_keywords,level,occupation_profile,lesson_count&status=eq.active&order=created_at.desc&limit=1"
  );
  return rows?.[0] || null;
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

// Tab "Bài viết" trong Yêu thích (Việc 3/Item 7, 2026-07-27) — đọc trực tiếp qua RLS "select
// own" (giống listLessons() ở trên), GHI (lưu mới) bắt buộc qua action save_writing_favorite
// trong api/_generate/writing.js (service role), xem supabase/028_writing_favorites.sql.
export async function listWritingFavorites() {
  return restFetch(
    "writing_favorites?select=id,kind,variant,level,industry,task,overall_score,created_at&order=created_at.desc"
  );
}

export async function getWritingFavoriteById(id) {
  const rows = await restFetch(`writing_favorites?id=eq.${encodeURIComponent(id)}&select=*`);
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
