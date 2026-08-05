// app/js/db.js — đọc/ghi trực tiếp Supabase REST (PostgREST) từ client, dựa hoàn toàn vào
// RLS (supabase/019_lessons.sql) để phân quyền theo auth.uid() — KHÔNG có logic phân quyền
// nào ở tầng này, chỉ gắn đúng JWT của user đang đăng nhập vào mỗi request.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { getSession, setSession, clearSession, isSessionExpired } from "./session.js";
import { refreshAccessToken } from "./authApi.js";

// Tự refresh access_token 1 LẦN nếu đã hết hạn — KHÔNG tự lặp lại (nếu refresh_token cũng
// hỏng thì coi như phiên đã chết, xoá session để authGuard() ở app.js đưa user về /login).
//
// BUG THẬT đã sửa (2026-08-05, Minh bắt được: vào /progress — màn gọi NHIỀU restFetch() CÙNG
// LÚC nhất trong app (loadStats/loadBreakdown/loadHistory, tổng 5 lượt song song) — báo
// "Không tải được" HÀNG LOẠT, các màn khác gọi ít lượt hơn thì không sao) — mỗi lượt gọi
// ensureValidSession() TRƯỚC ĐÂY tự refresh ĐỘC LẬP, không biết tới nhau. Supabase refresh_token
// CHỈ DÙNG ĐƯỢC 1 LẦN (rotation) — 5 lượt gọi cùng lúc lúc token vừa hết hạn = 5 lượt cùng đem
// ĐÚNG 1 refresh_token cũ đi đổi, chỉ lượt ĐẦU thành công (lưu session mới), 4 lượt còn lại bị
// Supabase từ chối (refresh_token đã dùng) → mỗi lượt thất bại đó tự ý clearSession(), XOÁ MẤT
// session vừa được lượt đầu lưu thành công, dù người dùng vẫn đang đăng nhập hợp lệ. SỬA: gom
// TẤT CẢ lượt gọi trùng thời điểm refresh vào DÙNG CHUNG 1 Promise refresh duy nhất
// (refreshInFlight) — lượt nào tới sau khi refresh đã bắt đầu thì CHỜ kết quả của lượt đầu thay
// vì tự refresh lại, không ai giẫm lên nhau.
let refreshInFlight = null;
export async function ensureValidSession() {
  let session = getSession();
  if (!session) return null;
  if (isSessionExpired(session)) {
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken(session.refresh_token)
        .then((refreshed) => {
          const merged = { ...session, ...refreshed };
          setSession(merged);
          return merged;
        })
        .catch((e) => {
          clearSession();
          throw e;
        })
        .finally(() => {
          refreshInFlight = null;
        });
    }
    try {
      session = await refreshInFlight;
    } catch {
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

// "chưa học/đang học/đã học" (2026-08-04, làm mới khung điều hướng, Phần A4) — embed quan hệ
// FK lesson_progress(lesson_id) qua PostgREST (RLS tự lọc đúng user, không cần request riêng).
// Không có row -> chưa học. Có row, fully_listened_at null -> đang học (đã mở nhưng chưa nghe
// hết audio thật — xem migration 033). Có fully_listened_at -> đã học. Suy ra ở client
// (computeLearnStatus() bên dưới), KHÔNG lưu cột "status" riêng nào (tránh 2 nguồn sự thật).
const PROGRESS_EMBED = "lesson_progress(fully_listened_at,last_opened_at)";

export function computeLearnStatus(lesson) {
  const rows = lesson.lesson_progress;
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return "not_started";
  return row.fully_listened_at ? "done" : "in_progress";
}

export async function listLessons({ filter = "all" } = {}) {
  // "content" nằm trong select để thẻ danh sách hiện được ĐÚNG trích đoạn nội dung thật (câu
  // đầu bài) thay vì "situation" — trường đó AI đôi khi viết kiểu mô tả meta ("Bài đọc mô tả
  // ...") thay vì tóm tắt tình huống thật, xem cardHtml() trong views/lessons.js.
  let q =
    `select=id,title,title_vi,level,situation,content,content_type,cover_image_url,is_favorite,created_at,${PROGRESS_EMBED}` +
    "&order=created_at.desc";
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
    `select=id,title,title_vi,level,situation,content,content_type,cover_image_url,is_favorite,created_at,industry,goal_id,${PROGRESS_EMBED}` +
    "&source=eq.ai_generated&order=created_at.desc";
  if (filter === "favorite") q += "&is_favorite=eq.true";
  if (filter === "dialogue" || filter === "reading") q += `&content_type=eq.${filter}`;
  return restFetch(`lessons?${q}`);
}

// Tab "Phân tích" (2026-07-29, "bài phân tích xong cần phải có đích đến") — bài tạo qua "Tôi có
// văn bản" (action analyze_user_text, xem views/createFromText.js) trước đó không có nơi liệt
// kê riêng, chỉ lẫn trong danh sách chung theo Bài đọc/Hội thoại. Lọc theo lessons.source=
// 'user_text' (enum cố định, xem buildLessonInsertRow trong api/_generate/lesson.js) — cùng
// pattern với listAiGeneratedLessons() ở trên, chỉ khác giá trị "source".
export async function listTextAnalyzedLessons({ filter = "all" } = {}) {
  let q =
    "select=id,title,title_vi,level,situation,content,content_type,cover_image_url,is_favorite,created_at" +
    "&source=eq.user_text&order=created_at.desc";
  if (filter === "favorite") q += "&is_favorite=eq.true";
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

// "Tin tức" (2026-07-28, mục con dưới Phổ biến) — bảng RIÊNG "news_lessons" (migration 029,
// public-read, KHÔNG user_id) — 2 hàm CHỦ Ý TÁCH khỏi listLessons()/getLessonById() ở trên
// (khác bảng hẳn, không phải chỉ khác filter) để không lẫn lộn 2 nguồn dữ liệu.
export async function listNewsLessons({ filter = "all", category = null } = {}) {
  let q = "select=id,title,title_vi,level,content_type,situation,content,category,cover_image_url,published_at&order=published_at.desc";
  if (filter === "dialogue" || filter === "reading") q += `&content_type=eq.${filter}`;
  if (category) q += `&category=eq.${encodeURIComponent(category)}`;
  return restFetch(`news_lessons?${q}`);
}

export async function getNewsLessonById(id) {
  const rows = await restFetch(`news_lessons?id=eq.${encodeURIComponent(id)}&select=*`);
  return rows?.[0] || null;
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

// Màn "Lịch sử" (trong Tiến trình): danh sách bài đã mở, kèm thông tin bài học qua embed quan hệ
// FK (lesson_progress.lesson_id -> lessons), mới mở gần nhất trước. "fully_listened_at" (2026-08-05)
// — dùng để suy ra Đã học/Chưa học THẬT (nghe hết audio tổng), thay cho completed_at/xp_earned
// hiển thị % giả ở views/progress.js trước đó (Minh: "% và thời gian đổi lại thành dấu tick Đã
// học/Chưa học").
export async function getHistory() {
  return restFetch(
    "lesson_progress?order=last_opened_at.desc&select=lesson_id,completed_at,fully_listened_at,xp_earned,last_opened_at,lessons(id,title,title_vi,level,content_type)"
  );
}

const LEVELS_ORDER = ["A1", "A2", "B1", "B2", "C1"];

// Màn "Tiến trình" MỚI (2026-08-04, gộp Lịch sử+Thống kê "giống hình" — bảng tiến trình theo
// kỹ năng × level) — % hoàn thành mỗi level = số bài đã hoàn tất (completed_at) / tổng số bài
// đang có ở level đó cho ĐÚNG loại nội dung (reading/dialogue). Dùng "tổng số bài ĐANG CÓ"
// (không phải tổng ~400 chủ đề cả spine) vì hiện tại danh sách bài chỉ gồm bài đã sinh — số này
// tự tăng lên khi kho bài học lớn dần, không phải số ảo/bịa ra.
export async function getSkillLevelBreakdown() {
  const rows = await restFetch("lessons?select=level,content_type,lesson_progress(completed_at)");
  const bySkill = { reading: {}, dialogue: {} };
  for (const l of rows || []) {
    const bucket = bySkill[l.content_type];
    if (!bucket) continue;
    if (!bucket[l.level]) bucket[l.level] = { total: 0, done: 0 };
    bucket[l.level].total += 1;
    const progressRow = Array.isArray(l.lesson_progress) ? l.lesson_progress[0] : l.lesson_progress;
    if (progressRow?.completed_at) bucket[l.level].done += 1;
  }
  // LUÔN trả đủ 5 level (kể cả level CHƯA có bài nào) — Minh: "các level chưa đo được để ở mức
  // 0%", KHÔNG ẩn hẳn level đó đi như bản trước (lọc theo bucket[lv] tồn tại).
  const toRows = (bucket) =>
    LEVELS_ORDER.map((lv) => {
      const b = bucket[lv] || { total: 0, done: 0 };
      return { level: lv, total: b.total, done: b.done, pct: b.total ? Math.round((b.done / b.total) * 100) : 0 };
    });
  return { reading: toRows(bySkill.reading), dialogue: toRows(bySkill.dialogue) };
}

// 14 DẠNG BÀI VIẾT cố định — ĐÚNG danh sách khoá trong api/_generate/writingTopicPool.json
// (list_writing_genres trả nguyên văn tên này, cũng là GENRE_STYLES trong writingPractice.js).
// Duplicate danh sách này ở đây (thay vì import JSON) vì db.js chạy ở client, cùng quy ước "mỗi
// file tự chứa dữ liệu riêng" đã dùng cho INDUSTRY_CHIPS/GENRE_STYLES.
const KNOWN_WRITING_GENRES = new Set([
  "Nghị luận",
  "Phân tích",
  "Đánh giá",
  "Kể chuyện",
  "Viết thư",
  "Báo cáo",
  "Email",
  "Tin nhắn",
  "Mô tả",
  "Hướng dẫn",
  "Bài đăng mạng xã hội",
  "Thư ngỏ",
  "Ghi chú",
  "Tường thuật sự việc",
]);

// Luyện viết — % "tiến trình" theo THỂ LOẠI = điểm trung bình các lượt chấm gần đây cho thể loại
// đó (overall_score/100), giống ĐÚNG cách getGenreScoreStats() ở api/_generate/writing.js tính
// "lời dẫn thông minh" — dữ liệu thật từ writing_submissions (RLS "select own" đã có sẵn, xem
// supabase/025_writing_submissions.sql), không tự bịa số. GỘP về ĐÚNG 14 dạng cố định + "Khác"
// (2026-08-05, Minh: "chỉ liệt kê các dạng, không liệt kê tất cả các loại nhỏ trong dạng") — dữ
// liệu cũ/test trước khi có danh mục 14 dạng cố định có "task.genre_vi" là tên chủ đề CỤ THỂ
// (vd "đánh giá nhà hàng", "Email xin lỗi" thay vì "Đánh giá"/"Email"), không lọc sẽ ra danh sách
// dài lộn xộn — bất kỳ giá trị nào KHÔNG khớp 14 dạng đã biết đều gộp chung vào "Khác".
export async function getWritingGenreBreakdown() {
  const rows = await restFetch("writing_submissions?select=overall_score,task&order=created_at.desc&limit=100");
  const byGenre = new Map();
  for (const r of rows || []) {
    const raw = r.task?.genre_vi;
    const genre = raw && KNOWN_WRITING_GENRES.has(raw) ? raw : "Khác";
    if (!byGenre.has(genre)) byGenre.set(genre, { count: 0, scoreSum: 0 });
    const g = byGenre.get(genre);
    g.count += 1;
    g.scoreSum += r.overall_score || 0;
  }
  return Array.from(byGenre.entries()).map(([genre, g]) => ({ genre, count: g.count, pct: Math.round(g.scoreSum / g.count) }));
}
