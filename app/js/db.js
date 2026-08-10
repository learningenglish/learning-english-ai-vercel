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

// MỒ CÔI (2026-08-06, tái cấu trúc theo cây mới) — chỉ dùng cho mode "favorite" của
// views/lessons.js BẢN CŨ (đã lưu ở _archive/old-nav/lessons.js), nhánh "Yêu thích" riêng không
// còn thuộc cây cấu trúc mới (Chuyên ngành -> Bài học/Hội thoại/Phân tích/Luyện viết). Giữ
// nguyên hàm (không xoá, is_favorite vẫn còn trên schema, dữ liệu không mất) phòng khi cần dùng
// lại, hiện KHÔNG còn nơi nào gọi tới.
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
// "goalId" (2026-08-06, tái cấu trúc theo cây mới — Minh: "Bài học/Hội thoại đã sinh: xếp đúng
// theo Chuyên ngành (goal đang active)") — lọc CHỈ bài thuộc goal đang active, CỘNG bài
// "goalId" KHÔNG còn dùng để lọc (2026-08-10, Minh: "đây là bộ giáo trình theo chuyên ngành,
// tất cả bài học đều hiển thị ở tất cả tài khoản" — giai đoạn test, chưa phân gói) — TRƯỚC ĐÂY
// lọc theo goal_id CỦA CHÍNH user hiện tại (learning_goals là bảng riêng theo user_id, xem
// 020_mentor_ai.sql), nghĩa là bài do tài khoản A sinh sẽ KHÔNG hiện cho tài khoản B dù cùng 1
// chuyên ngành thật — đúng nguyên nhân Minh không thấy bài mẫu sinh bằng tài khoản test. Đã bỏ
// điều kiện lọc goal_id ở query lẫn ở RLS (migration 038_lessons_shared_curriculum.sql, Minh tự
// chạy) — "lessons" nguồn 'ai_generated' giờ là 1 bộ giáo trình DÙNG CHUNG, xem được bởi BẤT KỲ
// tài khoản đã đăng nhập nào, không còn khoá theo user_id. "lessons" nguồn 'user_text' (Phân
// tích văn bản cá nhân người dùng tự dán vào) VẪN RIÊNG TƯ, không đụng tới ở đây. Tham số
// "goalId" giữ lại trong chữ ký hàm (không dùng) để không phải sửa lessons.js ngay — dọn sau khi
// Minh xác nhận hướng phân gói tài khoản (câu "sau khi test xong... phân gói tài khoản").
export async function listAiGeneratedLessons({ filter = "all" } = {}) {
  // "spine_slot" (2026-08-06, Minh: "mỗi chuyên ngành là trọn bộ giáo trình, cần đánh số #1,#2..
  // để rà soát") — chỉ bài sinh qua next_slot/khung giáo trình (mentor_next_lesson ->
  // generate_lesson, xem spine_slot trong api/_generate/lesson.js) mới có giá trị (vị trí 1-based
  // TRONG ĐÚNG level đó, theo curriculum_spine.json) — bài tự nhập/phân tích văn bản có
  // spine_slot=null, lessonCard.js tự ẩn số khi null.
  let q =
    `select=id,title,title_vi,level,situation,content,content_type,cover_image_url,is_favorite,created_at,industry,goal_id,spine_slot,${PROGRESS_EMBED}` +
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
// "goalId" (2026-08-06, tái cấu trúc theo cây mới) — cùng chính sách "goal_id khớp HOẶC null"
// đã áp dụng cho listAiGeneratedLessons() ở trên, xem ghi chú đầy đủ ở đó.
export async function listTextAnalyzedLessons({ filter = "all", goalId = null } = {}) {
  let q =
    "select=id,title,title_vi,level,situation,content,content_type,cover_image_url,is_favorite,created_at,goal_id" +
    "&source=eq.user_text&order=created_at.desc";
  if (filter === "favorite") q += "&is_favorite=eq.true";
  if (goalId) q += `&or=(goal_id.eq.${encodeURIComponent(goalId)},goal_id.is.null)`;
  return restFetch(`lessons?${q}`);
}

// Nhãn "Đã dừng" cho nhóm lĩnh vực trong Thư mục AI (2026-07-28, "giới hạn 5 lĩnh vực + Thư mục
// AI") — đọc status của TOÀN BỘ learning_goals của user (active lẫn archived), views/lessons.js
// tự đối chiếu qua lessons.goal_id để biết 1 nhóm lĩnh vực có đang "đã dừng" hay không. Chỉ
// id+status (đủ dùng, không cần thêm field), số dòng nhỏ (giới hạn 5 lĩnh vực trọn đời + vài
// dòng "Giao tiếp tổng quát").
// MỒ CÔI (2026-08-06, tái cấu trúc theo cây mới) — chỉ dùng cho carousel "Lĩnh vực" của
// views/lessons.js BẢN CŨ (đã lưu ở _archive/old-nav/lessons.js) để gắn nhãn "Đã dừng", nhánh đó
// không còn thuộc cây cấu trúc mới (giờ CHỈ 1 Chuyên ngành active tại 1 thời điểm, không cần so
// sánh nhiều lĩnh vực cùng lúc nữa). Giữ nguyên hàm, hiện KHÔNG còn nơi nào gọi tới.
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
// "goalId" KHÔNG còn dùng để lọc (2026-08-10, cùng lý do ở listAiGeneratedLessons() phía trên —
// bộ giáo trình dùng chung, không còn khoá theo goal_id/user_id). "lesson_progress" đã tự khoá
// theo user hiện tại qua RLS (chỉ đọc được tiến độ CỦA CHÍNH MÌNH), nên danh sách trả về ở đây
// LUÔN chỉ gồm bài chính người dùng này đã mở, không cần lọc thêm theo goal.
export async function listInProgressLessons({ limit = 6 } = {}) {
  const rows = await restFetch(
    "lesson_progress?completed_at=is.null&last_opened_at=not.is.null&order=last_opened_at.desc" +
      `&limit=${limit}` +
      "&select=lesson_id,completed_paragraphs,completed_exercises,lessons(id,title,title_vi,level,situation,content,content_type,cover_image_url,is_favorite,created_at,goal_id)"
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

// Màn "Bài học chi tiết" (views/lesson.js) — màn MỞ NHIỀU NHẤT app, TRƯỚC ĐÂY tốn 2 lượt
// restFetch() riêng (getLessonById + getLessonProgress) chạy Promise.all cùng lúc — GỘP thành 1
// lượt DUY NHẤT bằng embed quan hệ FK (2026-08-05, cùng đợt rà soát bug race-condition
// refresh_token) — "lesson_progress(*)" trả mảng 0-1 phần tử (unique theo lesson_id+user_id,
// xem upsertLessonProgress() bên dưới), tách khỏi "lesson" (xoá field thừa) trước khi trả về để
// "lesson" giữ ĐÚNG hình dạng 1 hàng "lessons" như getLessonById() cũ, không rò rỉ field lạ ra
// những chỗ khác dùng "lesson" (fetchAndSaveLessonCover, setLessonFavorite...).
export async function getLessonWithProgress(id) {
  const rows = await restFetch(`lessons?id=eq.${encodeURIComponent(id)}&select=*,lesson_progress(*)`);
  const lesson = rows?.[0] || null;
  if (!lesson) return { lesson: null, progress: null };
  const progressRows = lesson.lesson_progress;
  const progress = (Array.isArray(progressRows) ? progressRows[0] : progressRows) || null;
  delete lesson.lesson_progress;
  return { lesson, progress };
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
// PHẦN LỚN MỒ CÔI (2026-08-06, tái cấu trúc theo cây mới — Minh: "loại bỏ Tin tức/Phổ biến hoàn
// toàn khỏi luồng đang chạy") — route "/news-lesson" đã gỡ khỏi app.js, KHÔNG còn màn nào điều
// hướng tới listNewsLessons(). getNewsLessonById() vẫn còn 1 lời gọi mồ côi trong views/lesson.js
// (nhánh isNews, cũng không còn ai kích hoạt được nữa vì thiếu route) — giữ nguyên 2 hàm + bảng
// news_lessons trong DB (không xoá dữ liệu), chỉ không còn đường vào từ UI.
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
// "goalId" (2026-08-06, tái cấu trúc theo cây mới — Minh: "Luyện viết: xếp vào nhánh của đúng
// Chuyên ngành") — CẦN migration 034_writing_favorites_goal_id.sql chạy trước (thêm cột
// "goal_id", trước đó bảng này KHÔNG có cột này) — nếu chưa chạy, truyền goalId sẽ làm request
// lỗi 400 "column does not exist" giống hệt ca "fully_listened_at"/migration 033 trước đó. Cùng
// chính sách "goal_id khớp HOẶC null" như các hàm list khác ở trên.
export async function listWritingFavorites({ goalId = null } = {}) {
  let q = "select=id,kind,variant,level,industry,task,overall_score,created_at,goal_id&order=created_at.desc";
  if (goalId) q += `&or=(goal_id.eq.${encodeURIComponent(goalId)},goal_id.is.null)`;
  return restFetch(`writing_favorites?${q}`);
}

export async function getWritingFavoriteById(id) {
  const rows = await restFetch(`writing_favorites?id=eq.${encodeURIComponent(id)}&select=*`);
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

// Header (mọi màn) + Home: tổng XP/số bài đã hoàn thành/streak — GỘP 2 lượt gọi cũ
// (getProfileStats()+getStreakDays(), CÙNG đọc bảng lesson_progress chỉ khác cột) thành 1 lượt
// duy nhất (2026-08-05, Minh: "rà soát các màn gọi nhiều API cùng lúc, gộp lại") — trước đó
// header.js::loadAppHeaderStats() tự làm Promise.all() 2 lượt NÀY, cộng thêm bất kỳ lượt nào
// view đang mở TỰ gọi riêng (vd writingPractice.js::loadGenres()) là ít nhất 3 lượt refresh
// token cùng lúc mỗi khi mở màn — dù bug refresh_token race đã sửa tận gốc (ensureValidSession()
// dùng chung 1 Promise refresh), gộp bớt số lượt gọi vẫn giảm tải mạng thật, không chỉ phòng
// bug. "streak" tính giống hệt getStreakDays() cũ (suy ra từ last_opened_at, KHÔNG có cột riêng
// lưu streak).
export async function getStreakAndStats() {
  const rows = await restFetch("lesson_progress?select=xp_earned,completed_at,last_opened_at");
  const totalXp = (rows || []).reduce((s, r) => s + (r.xp_earned || 0), 0);
  const completedCount = (rows || []).filter((r) => r.completed_at).length;
  const streak = computeStreakFromDates(rows || []);
  return { totalXp, completedCount, streak };
}

function computeStreakFromDates(rows) {
  const activeDates = new Set(rows.map((r) => (r.last_opened_at || "").slice(0, 10)).filter(Boolean));
  const cursor = new Date();
  if (!activeDates.has(isoDate(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (activeDates.has(isoDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Kỷ lục streak (2026-08-09, Đợt 3 mục 14 — Minh: "Tổng XP không sử dụng, đổi thành kỉ lục ghi
// nhận chuỗi ngày học cao nhất") — KHÁC computeStreakFromDates() ở trên (chỉ tính streak HIỆN
// TẠI, lùi từ hôm nay/hôm qua): hàm này quét TOÀN BỘ ngày distinct đã có, tìm chuỗi liên tiếp DÀI
// NHẤT từng đạt được trong lịch sử — không cần cột DB riêng, dùng lại đúng "rows" đã fetch sẵn.
function computeLongestStreakFromDates(rows) {
  const activeDates = Array.from(new Set(rows.map((r) => (r.last_opened_at || "").slice(0, 10)).filter(Boolean))).sort();
  let longest = 0;
  let current = 0;
  let prevDate = null;
  for (const dateStr of activeDates) {
    const d = new Date(dateStr + "T00:00:00Z");
    if (prevDate) {
      const diffDays = Math.round((d - prevDate) / 86400000);
      current = diffDays === 1 ? current + 1 : 1;
    } else {
      current = 1;
    }
    longest = Math.max(longest, current);
    prevDate = d;
  }
  return longest;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

const LEVELS_ORDER = ["A1", "A2", "B1", "B2", "C1"];

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

// Màn "Tiến trình" — TRƯỚC ĐÂY 5 lượt restFetch() riêng biệt chạy cùng lúc qua Promise.all
// (getProfileStats/getStreakDays/getSkillLevelBreakdown/getWritingGenreBreakdown/getHistory) —
// đúng nguyên nhân khiến bug race-condition refresh_token dễ lộ ra nhất ở màn này (Minh bắt
// được 2026-08-05). GỘP còn 3 lượt (KHÔNG gộp được về 1 vì 3 lượt đọc 3 BẢNG/HÌNH DẠNG dữ liệu
// khác nhau, PostgREST không aggregate chéo bảng được nếu không viết thêm 1 SQL function riêng
// phía server — ngoài phạm vi yêu cầu này):
//   1) "lesson_progress" (kèm embed lessons) — dùng tính CẢ Tổng XP + số bài hoàn thành + streak
//      + "done" từng level/loại + danh sách Lịch sử — 4 việc TRƯỚC ĐÂY tốn 3 lượt riêng
//      (getProfileStats+getStreakDays+getHistory), giờ 1 lượt là đủ vì cùng bảng.
//   2) "lessons" (chỉ level+content_type, KHÔNG embed) — lấy TỔNG số bài mỗi level/loại (mẫu số
//      %), tách khỏi (1) vì cần TOÀN BỘ bài kể cả bài user CHƯA từng mở (không có lesson_progress).
//   3) "writing_submissions" — không đổi, vẫn 1 bảng riêng, không gộp được với 2 lượt trên.
export async function getProgressOverview() {
  const [progressRows, lessonRows, writingRows] = await Promise.all([
    restFetch(
      "lesson_progress?order=last_opened_at.desc&select=lesson_id,completed_at,fully_listened_at,xp_earned,last_opened_at,lessons(id,title,title_vi,level,content_type)"
    ),
    restFetch("lessons?select=level,content_type"),
    restFetch("writing_submissions?select=overall_score,task&order=created_at.desc&limit=100"),
  ]);

  const totalXp = (progressRows || []).reduce((s, r) => s + (r.xp_earned || 0), 0);
  const completedCount = (progressRows || []).filter((r) => r.completed_at).length;
  const streak = computeStreakFromDates(progressRows || []);
  const longestStreak = computeLongestStreakFromDates(progressRows || []);

  const bySkill = { reading: {}, dialogue: {} };
  for (const l of lessonRows || []) {
    const bucket = bySkill[l.content_type];
    if (!bucket) continue;
    if (!bucket[l.level]) bucket[l.level] = { total: 0, done: 0 };
    bucket[l.level].total += 1;
  }
  for (const r of progressRows || []) {
    if (!r.completed_at || !r.lessons) continue;
    const bucket = bySkill[r.lessons.content_type];
    if (!bucket?.[r.lessons.level]) continue;
    bucket[r.lessons.level].done += 1;
  }
  // LUÔN trả đủ 5 level (kể cả level CHƯA có bài nào) — Minh: "các level chưa đo được để ở mức
  // 0%", KHÔNG ẩn hẳn level đó đi như bản trước (lọc theo bucket[lv] tồn tại).
  const toRows = (bucket) =>
    LEVELS_ORDER.map((lv) => {
      const b = bucket[lv] || { total: 0, done: 0 };
      return { level: lv, total: b.total, done: b.done, pct: b.total ? Math.round((b.done / b.total) * 100) : 0 };
    });
  const skills = { reading: toRows(bySkill.reading), dialogue: toRows(bySkill.dialogue) };

  // GỘP về ĐÚNG 14 dạng cố định + "Khác" (2026-08-05, Minh: "chỉ liệt kê các dạng, không liệt kê
  // tất cả các loại nhỏ trong dạng") — dữ liệu cũ/test trước khi có danh mục 14 dạng cố định có
  // "task.genre_vi" là tên chủ đề CỤ THỂ (vd "đánh giá nhà hàng"), không lọc sẽ ra danh sách dài
  // lộn xộn — bất kỳ giá trị nào KHÔNG khớp 14 dạng đã biết đều gộp chung vào "Khác".
  const byGenre = new Map();
  for (const r of writingRows || []) {
    const raw = r.task?.genre_vi;
    const genre = raw && KNOWN_WRITING_GENRES.has(raw) ? raw : "Khác";
    if (!byGenre.has(genre)) byGenre.set(genre, { count: 0, scoreSum: 0 });
    const g = byGenre.get(genre);
    g.count += 1;
    g.scoreSum += r.overall_score || 0;
  }
  const writing = Array.from(byGenre.entries()).map(([genre, g]) => ({ genre, count: g.count, pct: Math.round(g.scoreSum / g.count) }));

  return { totalXp, completedCount, streak, longestStreak, skills, writing, history: progressRows || [] };
}
