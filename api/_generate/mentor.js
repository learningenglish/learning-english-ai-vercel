// api/_generate/mentor.js — Mentor AI (Đợt 3): thay luồng "Tạo nội dung" cũ. Đọc kỹ 2 quy
// tắc tối thượng ở đầu yêu cầu Đợt 3 trước khi sửa BẤT KỲ câu chữ nào ở đây:
//   - QUY TẮC HIỂU: mọi câu Mentor nói phải chứa >=1 số liệu/chi tiết THẬT của chính người
//     dùng đó — xoá tên/số đi mà câu vẫn đúng với bất kỳ ai khác thì CHƯA ĐẠT.
//   - QUY TẮC ĐỒNG HÀNH: câu nào nhắc quyết định của người dùng phải ĐI SAU lựa chọn của họ,
//     luôn có đường tiếp tục nếu họ muốn, không dùng nút mặc định để KHOÁ lối.
//
// TÁCH LỚP BẮT BUỘC (mục 2 Đợt 3), KHÔNG được gộp lại:
//   - LỚP QUYẾT ĐỊNH (decide*, compute*, get*): input = hồ sơ năng lực/tiến độ đọc từ
//     Supabase, output = 1 hành động có cấu trúc. Chỉ SQL/logic JS thuần, KHÔNG gọi AI.
//   - LỚP LỜI THOẠI (buildMentorCard): input = hành động có cấu trúc, output = câu tiếng
//     Việt Mentor nói. Chỉ ghép template bằng CODE, KHÔNG gọi AI.
// Sửa giọng văn (buildMentorCard) sau này KHÔNG được đụng vào logic chọn bài (decideAction)
// và ngược lại — đây là lý do tách file/hàm, không phải chỉ để dễ đọc.
//
// CHỈ 2 ĐIỂM ĐƯỢC GỌI AI TRONG TOÀN BỘ MODULE NÀY (mục 5 Đợt 3):
//   1. mentor_infer_goal() -> generateOccupationProfile() (skin.js, TÁI DÙNG NGUYÊN VẸN,
//      không sửa 1 dòng nào trong skin.js).
//   2. mentor_next_lesson() -> generate_lesson() (lesson.js, TÁI DÙNG NGUYÊN VẸN action đã
//      duyệt, chỉ truyền thêm data.goal_id — xem resolveOwnedGoalId() trong lesson.js).
// Mọi lượt gọi AI ở 2 điểm trên đều console.log("[MENTOR_AI_CALL] ...") để đếm được thật khi
// nghiệm thu (mục 8.5 Đợt 3) — KHÔNG thêm lượt gọi AI nào khác trong module này.
import { SUPABASE_URL } from "./_shared.js";
import { generateOccupationProfile, buildConfirmationDisplay, loadSkinGeneral } from "./curriculum/skin.js";
import { generate_lesson } from "./lesson.js";
import { createLineSession } from "./mentor-lines/select.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE_HEADERS = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
const VALID_LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const VALID_PRONOUN_STYLES = ["toi_anh", "toi_chi", "toi_ban", "toi_ten"];
const DEFAULT_PRONOUN_STYLE = "toi_ban"; // chốt với Minh 2026-07-21: không chọn -> gọi "bạn", Mentor không tự chọn giúp.

// occupation_profile "rỗng" khi bấm "Bạn cứ để tôi tự chọn giúp" (mảnh shared.invite_goal) mà
// CHƯA từng có mục tiêu nào trước đó — dùng thẳng skin_general.json, KHÔNG gọi AI (mục 3.3 Đợt
// 3: input rỗng thì không có gì để suy luận thật). is_general=true là cờ DUY NHẤT mentor_next_lesson
// dùng để rẽ nhánh chọn chủ đề (xem pickGeneralTopic), KHÔNG đụng buildConfirmationDisplay của
// skin.js (hàm đó không xử lý được merged_occupation=null) — xem buildGoalConfirmationDisplay.
const GENERAL_OCCUPATION_PROFILE = {
  is_general: true,
  merged_occupation: null,
  primary_communication_scope: "giao tiếp tiếng Anh trong nhiều tình huống hàng ngày",
  interlocutors: [],
  core_terms: [],
  confidence: { merged_occupation: "thấp", interlocutors: "thấp", core_terms: "thấp" },
};

// ====== HẰNG SỐ CẤU HÌNH — đúng quy ước Đợt 2/3: mọi con số nghiệp vụ đặt 1 chỗ, không rải
// rác trong code. Đổi ở đây là đổi cho toàn bộ luồng Mentor AI. ======
const REVIEW_QUEUE_LOOKBACK_LESSONS = 10; // "N bài gần nhất" — mục 3 Đợt 3
const REVIEW_QUEUE_MIN_ATTEMPTS = 3; // số lần thử tối thiểu 1 grammar_tag mới đủ tin cậy để tính tỷ lệ sai
const REVIEW_QUEUE_ERROR_RATE_THRESHOLD = 0.4; // "tỷ lệ sai > ngưỡng"
const REVIEW_QUEUE_COOLDOWN_DAYS = 3; // "chưa được ôn trong M ngày"
// "Quá hạn NGHIÊM TRỌNG" (chốt với Minh 2026-07-21) — đủ nặng để CHEN NGANG continue_lesson,
// khác ngưỡng thường ở trên (chỉ dùng khi KHÔNG có bài dang dở). Đếm TUYỆT ĐỐI (không phải tỷ
// lệ) trong cửa sổ HẸP hơn (6 bài gần nhất thay vì 10) — bắt mẫu hình gần đây, không pha loãng
// với dữ liệu cũ; cooldown DÀI hơn (5 ngày thay vì 3) — tránh chen ngang ngay sau khi vừa ôn.
const REVIEW_QUEUE_SEVERE_LOOKBACK_LESSONS = 6;
const REVIEW_QUEUE_SEVERE_MIN_WRONG = 3;
const REVIEW_QUEUE_SEVERE_COOLDOWN_DAYS = 5;
const GOAL_LOW_ACCESS_THRESHOLD = 0.5; // Bước 0 mục 6.3: "truy cập đợt hiện tại CHƯA đạt 50%"
const DEFAULT_LEVEL_WHEN_UNSET = "B1"; // người dùng chọn "Mình chưa chắc" ở Bước 2
const MENTOR_LESSON_LENGTH_WORDS = 200; // độ dài mặc định cho bài Mentor tự sinh tiếp (next_slot)
const MENTOR_TERM_DENSITY = 20; // lượng từ chuyên ngành mặc định cho bài Mentor tự sinh
// term_density=0 ("không có từ chuyên ngành") kích lỗi THẬT đã biết (memory: model trả
// vocabulary:[] rỗng hoàn toàn khi prompt ghi "Lượng từ chuyên ngành: không có" — lỗi ở
// lesson.js/prompt, chưa sửa gốc, cần bàn riêng vì đụng nội dung prompt). Mục tiêu "chung"
// (is_general) không có ngành cụ thể để yêu cầu 20 từ như MENTOR_TERM_DENSITY, nhưng KHÔNG
// dùng 0 — dùng 1 số nhỏ để né câu "không có" trong prompt, vẫn hợp lý về nội dung (vài từ/cụm
// từ đáng học trong bài, không đòi hỏi phải "chuyên ngành").
const MENTOR_GENERAL_TERM_DENSITY = 3;
// Các "góc tình huống" luân phiên KHÔNG DÙNG AI để chọn chủ đề bài kế tiếp trong cùng 1 mục
// tiêu — thay cho Lượt B (generateLevelTopicsForAllLevels) của skin.js, vì Lượt B là 5 lượt
// gọi AI riêng, NẰM NGOÀI 2 điểm được phép ở mục 5 Đợt 3. Đây là lựa chọn kỹ thuật tự chọn,
// ghi rõ trong báo cáo bàn giao — xoay vòng theo lesson_count của mục tiêu, thuần code.
const MENTOR_SITUATION_ANGLES = [
  "giới thiệu bản thân và công việc với người mới gặp",
  "hỏi và xác nhận lại thông tin quan trọng",
  "xử lý một tình huống phát sinh ngoài kế hoạch",
  "trao đổi qua điện thoại hoặc email công việc",
  "báo cáo tiến độ hoặc kết quả cho cấp trên/khách hàng",
  "thương lượng hoặc từ chối khéo một yêu cầu",
];

async function restGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SERVICE_HEADERS });
  if (!r.ok) {
    console.error("mentor.js restGet error:", path, r.status, await r.text().catch(() => ""));
    return null;
  }
  return r.json();
}

// HEAD + Prefer:count=exact -> chỉ cần con số, không cần tải cả danh sách bản ghi.
async function restCount(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "HEAD",
    headers: { ...SERVICE_HEADERS, Prefer: "count=exact" },
  });
  if (!r.ok) return 0;
  return Number((r.headers.get("content-range") || "").split("/")[1] || 0);
}

function lastNameOf(fullName) {
  const raw = (fullName || "").trim();
  return raw ? raw.split(/\s+/).slice(-1)[0] : null;
}

// Ngữ cảnh dùng chung cho MỌI lượt chọn câu trong kho: giọng xưng hô hiện tại (mặc định
// 'toi_ban' nếu chưa chọn — DEFAULT_PRONOUN_STYLE), tên gọi (chỉ có ý nghĩa với giọng toi_ten,
// các giọng còn lại không dùng placeholder {ten}), và cache chống lặp câu.
async function getMentorLineContext(studentId) {
  const rows = await restGet(`students?id=eq.${studentId}&select=full_name,nickname,pronoun_style,mentor_last_lines`);
  const row = rows?.[0] || {};
  const style = VALID_PRONOUN_STYLES.includes(row.pronoun_style) ? row.pronoun_style : DEFAULT_PRONOUN_STYLE;
  const ten = (row.nickname || "").trim() || lastNameOf(row.full_name) || "bạn";
  return { style, ten, lastLines: row.mentor_last_lines || {} };
}

async function persistLastLines(studentId, lastLines) {
  await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${studentId}`, {
    method: "PATCH",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ mentor_last_lines: lastLines }),
  }).catch((e) => console.error("mentor.js persistLastLines error:", e));
}

// Nhật ký sự kiện (mục 3.4 điểm 4 Đợt 3) — dữ liệu bổ sung hồ sơ năng lực, KHÔNG dùng để tự
// kích hoạt phản hồi. Fire-and-forget: lỗi ghi log không được làm hỏng luồng chính.
async function logMentorEvent(studentId, eventType, context) {
  fetch(`${SUPABASE_URL}/rest/v1/mentor_events`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: studentId, event_type: eventType, context: context || {} }),
  }).catch((e) => console.error("mentor.js logMentorEvent error:", e));
}

// ============================================================
// LỚP QUYẾT ĐỊNH — chỉ đọc dữ liệu + tính toán, KHÔNG gọi AI.
// ============================================================

async function findInProgressLesson(studentId) {
  const rows = await restGet(
    `lesson_progress?user_id=eq.${studentId}&completed_at=is.null&order=last_opened_at.desc&limit=1` +
      `&select=lesson_id,completed_exercises,lessons(id,title_vi,content_type,exercises,goal_id,learning_goals(id,title,lesson_count))`
  );
  return rows?.[0] || null;
}

async function goalProgressCounts(studentId, goalId, { onlyCompleted } = {}) {
  const completedFilter = onlyCompleted ? "&completed_at=not.is.null" : "";
  return restCount(
    `lesson_progress?select=id,lessons!inner(goal_id)&lessons.goal_id=eq.${goalId}&user_id=eq.${studentId}${completedFilter}`
  );
}

// Dùng chung cho cả 2 ngưỡng (thường/nghiêm trọng) — chỉ khác limit (lookback). grammar_tag ->
// { wrong, total, lastSeenAt }.
async function fetchGrammarTagStats(studentId, lookbackLessons) {
  const rows = await restGet(
    `lesson_progress?user_id=eq.${studentId}&completed_at=not.is.null&order=completed_at.desc` +
      `&limit=${lookbackLessons}&select=completed_at,exercise_results`
  );
  if (!rows?.length) return null;

  const byTag = new Map();
  for (const row of rows) {
    const results = Array.isArray(row.exercise_results) ? row.exercise_results : [];
    for (const item of results) {
      if (!item?.grammar_tag) continue;
      const tag = String(item.grammar_tag).trim();
      if (!tag) continue;
      if (!byTag.has(tag)) byTag.set(tag, { wrong: 0, total: 0, lastSeenAt: row.completed_at });
      const entry = byTag.get(tag);
      entry.total += 1;
      if (!item.correct) entry.wrong += 1;
      if (row.completed_at > entry.lastSeenAt) entry.lastSeenAt = row.completed_at;
    }
  }
  return byTag;
}

// Tìm 1 bài ĐÃ CÓ của chính user có điểm ngữ pháp này (ưu tiên bài cũ, không sinh AI mới —
// đúng lựa chọn "không bắt buộc" ở mục 3 Đợt 3, giữ số lượt AI = 0 cho review_lesson).
async function findLessonForTag(studentId, tag) {
  const candidateLessons = await restGet(
    `lessons?user_id=eq.${studentId}&select=id,title_vi,grammar&order=created_at.desc&limit=50`
  );
  return (candidateLessons || []).find((l) => (l.grammar || []).some((g) => g?.name === tag)) || null;
}

function daysSince(dateStr) {
  return (Date.now() - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000);
}

// Ngưỡng THƯỜNG (không đổi hành vi cũ) — chỉ xét khi KHÔNG có bài dang dở (mục 2 Đợt 3, giữ
// đúng thứ tự đã có: review trước next_slot).
async function computeReviewQueue(studentId) {
  const byTag = await fetchGrammarTagStats(studentId, REVIEW_QUEUE_LOOKBACK_LESSONS);
  if (!byTag) return null;

  let worst = null;
  for (const [tag, entry] of byTag) {
    if (entry.total < REVIEW_QUEUE_MIN_ATTEMPTS) continue;
    const errorRate = entry.wrong / entry.total;
    if (errorRate <= REVIEW_QUEUE_ERROR_RATE_THRESHOLD) continue;
    if (daysSince(entry.lastSeenAt) < REVIEW_QUEUE_COOLDOWN_DAYS) continue; // vừa ôn gần đây, chưa tới lúc nhắc lại
    if (!worst || errorRate > worst.errorRate) worst = { tag, errorRate, wrong: entry.wrong, total: entry.total };
  }
  if (!worst) return null;

  const match = await findLessonForTag(studentId, worst.tag);
  if (!match) return null; // không có bài phù hợp -> để decideAction() rơi xuống next_slot/prompt_new_goal
  return { grammarTag: worst.tag, wrong: worst.wrong, total: worst.total, lesson: match };
}

// Ngưỡng NGHIÊM TRỌNG (mới, mục 1 yêu cầu sửa decideAction) — đủ nặng để CHEN NGANG
// continue_lesson. Đếm tuyệt đối trong cửa sổ hẹp, xem hằng số REVIEW_QUEUE_SEVERE_* ở trên.
async function computeSevereReviewQueue(studentId) {
  const byTag = await fetchGrammarTagStats(studentId, REVIEW_QUEUE_SEVERE_LOOKBACK_LESSONS);
  if (!byTag) return null;

  let worst = null;
  for (const [tag, entry] of byTag) {
    if (entry.wrong < REVIEW_QUEUE_SEVERE_MIN_WRONG) continue;
    if (daysSince(entry.lastSeenAt) < REVIEW_QUEUE_SEVERE_COOLDOWN_DAYS) continue;
    if (!worst || entry.wrong > worst.wrong) worst = { tag, wrong: entry.wrong, total: entry.total };
  }
  if (!worst) return null;

  const match = await findLessonForTag(studentId, worst.tag);
  if (!match) return null;
  return { grammarTag: worst.tag, wrong: worst.wrong, total: worst.total, lesson: match };
}

async function getMostRecentActiveGoal(studentId) {
  const rows = await restGet(
    `learning_goals?user_id=eq.${studentId}&status=eq.active&order=created_at.desc&limit=1&select=*`
  );
  return rows?.[0] || null;
}

async function decideAction(studentId) {
  const [inProgress, severeReview] = await Promise.all([findInProgressLesson(studentId), computeSevereReviewQueue(studentId)]);

  // Mục 1 (sửa decideAction, chốt với Minh 2026-07-21): quá hạn NGHIÊM TRỌNG -> CHEN NGANG
  // continue_lesson (biến cố "quyết định mới ảnh hưởng luồng cũ dang dở", mục 3.1 Đợt 3). Bài
  // dang dở KHÔNG mất — findInProgressLesson() luôn tính lại từ dữ liệu thật, nên lượt
  // decideAction() kế tiếp (sau khi ôn xong/bỏ qua) tự hiện lại continue_lesson như cũ.
  if (severeReview) return { type: "review_lesson", ...severeReview };

  if (inProgress?.lessons) {
    let goalCounts = null;
    if (inProgress.lessons.goal_id) {
      const completed = await goalProgressCounts(studentId, inProgress.lessons.goal_id, { onlyCompleted: true });
      goalCounts = { completed, total: inProgress.lessons.learning_goals?.lesson_count || 0 };
    }
    return {
      type: "continue_lesson",
      lesson: { id: inProgress.lessons.id, title_vi: inProgress.lessons.title_vi },
      goal: inProgress.lessons.learning_goals ? { id: inProgress.lessons.goal_id, title: inProgress.lessons.learning_goals.title } : null,
      goalCounts,
      exercisesDone: (inProgress.completed_exercises || []).length,
      exercisesTotal: (inProgress.lessons.exercises || []).length,
    };
  }

  const reviewItem = await computeReviewQueue(studentId);
  if (reviewItem) return { type: "review_lesson", ...reviewItem };

  const goal = await getMostRecentActiveGoal(studentId);
  if (goal) {
    const completed = await goalProgressCounts(studentId, goal.id, { onlyCompleted: true });
    return { type: "next_slot", goal, completed };
  }

  return { type: "prompt_new_goal" };
}

// ============================================================
// LỚP LỜI THOẠI — chỉ ghép template tiếng Việt bằng CODE, KHÔNG gọi AI. Mọi câu ở đây phải
// tự đối chiếu QUY TẮC HIỂU (mục 1 Đợt 3) trước khi thêm/sửa: xoá số liệu đi câu còn đúng
// với ai khác không? Nếu còn đúng -> chưa đạt, phải thêm số liệu thật.
// ============================================================

// Nhãn nút BẤM CỐ ĐỊNH (không thuộc kho biến thể, giống "Học tiếp"/"Bạn cứ để tôi tự chọn
// giúp" đã ghi trong README.md của kho) — chỉ câu chữ TƯỜNG THUẬT (title/body) mới lấy từ kho.
function buildMentorCard(action, lineSession) {
  const pick = (fragment, vars) => lineSession.pick(fragment, vars);
  const ten = lineSession.ten;

  if (action.type === "continue_lesson") {
    const lessonTitle = action.lesson.title_vi;
    const cta = pick("continue_lesson.cta", { ten, lesson_title: lessonTitle });
    if (action.goal && action.goalCounts) {
      const { completed, total } = action.goalCounts;
      return {
        title: pick("continue_lesson.progress_with_goal", { ten, goal_title: action.goal.title, completed, total }),
        body: cta,
        primary: { label: "Học tiếp", kind: "open_lesson", lessonId: action.lesson.id },
        secondary: { label: "Xem cả lộ trình", kind: "open_hub", goalId: action.goal.id },
      };
    }
    return {
      title: pick("continue_lesson.progress_no_goal", {
        ten,
        lesson_title: lessonTitle,
        exercises_done: action.exercisesDone,
        exercises_total: action.exercisesTotal,
      }),
      body: cta,
      primary: { label: "Học tiếp", kind: "open_lesson", lessonId: action.lesson.id },
      secondary: { label: "Xem thư viện", kind: "open_hub" },
    };
  }

  if (action.type === "review_lesson") {
    const point = pick("review_lesson.point", { ten, grammar_tag: action.grammarTag, wrong: action.wrong, total: action.total });
    const reassure = pick("review_lesson.reassure", {});
    const cta = pick("review_lesson.cta", { ten, lesson_title: action.lesson.title_vi });
    return {
      title: point,
      body: `${reassure} ${cta}`,
      primary: { label: "Ôn lại bài này", kind: "open_lesson", lessonId: action.lesson.id },
      secondary: { label: "Học bài khác", kind: "open_hub" },
    };
  }

  if (action.type === "next_slot") {
    return {
      title: pick("next_slot.progress", { ten, goal_title: action.goal.title, completed: action.completed, lesson_count: action.goal.lesson_count }),
      body: pick("next_slot.cta", { ten }),
      primary: { label: "Học bài mới", kind: "next_lesson", goalId: action.goal.id },
      secondary: { label: "Xem lại bài cũ", kind: "open_hub", goalId: action.goal.id },
    };
  }

  // prompt_new_goal — người dùng chưa từng có mục tiêu nào, dẫn thẳng xuống nút (+) (mục 6.2).
  const greeting = ten && ten !== "bạn" ? pick("new_goal.named_opener", { ten }) : pick("new_goal.blank_greeting", {});
  return {
    title: greeting,
    body: pick("shared.invite_goal", { ten }),
    primary: { label: "Bắt đầu", kind: "open_goal_flow" },
    secondary: null,
  };
}

// ============================================================
// ACTIONS xuất ra cho chat.js đăng ký vào ACTIONS map.
// ============================================================

export async function mentor_get_action(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const [action, lineCtx] = await Promise.all([decideAction(ctx.studentId), getMentorLineContext(ctx.studentId)]);
  const session = createLineSession(lineCtx.style, lineCtx.lastLines, lineCtx.ten);
  const card = buildMentorCard(action, session);
  await persistLastLines(ctx.studentId, session.getUpdatedLastLines());
  logMentorEvent(ctx.studentId, "mentor_opened", { action: action.type });
  return { content: JSON.stringify({ action: action.type, card }) };
}

// Bước 0 (mục 6.3): chặn CÓ ĐIỀU KIỆN khi bấm nút (+) — chỉ tính, không tự ý chặn (client tự
// quyết định có hiện màn chặn hay bỏ qua thẳng Bước 1). Không gọi AI. Gộp CHUNG 1 lượt gọi với
// "màn nhớ từ khoá cũ" (mục 3.4 điểm 2 Đợt 3: Trường hợp A/B) + câu mời Bước 1 (shared.invite_goal)
// để luồng mentorGoal.js chỉ cần 1 round-trip trước khi vào Bước 1/màn B, KHÔNG thêm action riêng.
export async function mentor_check_goal_gate(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const [gateGoal, latestGoalRows, lineCtx] = await Promise.all([
    getMostRecentActiveGoal(ctx.studentId),
    restGet(`learning_goals?user_id=eq.${ctx.studentId}&order=created_at.desc&limit=1&select=raw_keywords,level,occupation_profile`),
    getMentorLineContext(ctx.studentId),
  ]);
  const session = createLineSession(lineCtx.style, lineCtx.lastLines, lineCtx.ten);
  const ten = session.ten;

  const result = { shouldGate: false, hasHistory: false, inviteLine: session.pick("shared.invite_goal", { ten }) };

  if (gateGoal?.lesson_count) {
    const accessed = await goalProgressCounts(ctx.studentId, gateGoal.id, {});
    const pct = accessed / gateGoal.lesson_count;
    if (pct < GOAL_LOW_ACCESS_THRESHOLD) {
      const remaining = gateGoal.lesson_count - accessed;
      const status = session.pick("gate.status", { ten, goal_title: gateGoal.title, remaining });
      const reason = session.pick("gate.reason", {});
      result.shouldGate = true;
      result.goalTitle = gateGoal.title;
      result.remaining = remaining;
      result.message = `${status} ${reason}`;
    }
  }

  const latestGoal = latestGoalRows?.[0];
  if (latestGoal) {
    const profile = latestGoal.occupation_profile;
    const occupation = profile?.is_general ? "giao tiếp tổng quát" : profile?.merged_occupation;
    result.hasHistory = true;
    result.resumeTop = session.pick("resume_goal.resume_top", { ten, occupation, scope: profile?.primary_communication_scope });
    result.resumeBottom = session.pick("resume_goal.resume_bottom", { ten });
    result.rawKeywords = latestGoal.raw_keywords || "";
    result.level = latestGoal.level || null;
  }

  await persistLastLines(ctx.studentId, session.getUpdatedLastLines());
  return { content: JSON.stringify(result) };
}

// AI CALL #1/2 (mục 5 Đợt 3) — chân dung nghề, TÁI DÙNG NGUYÊN VẸN skin.js.
export async function mentor_infer_goal(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const rawText = (data.raw_text || "").trim();
  if (!rawText) return { error: "Thiếu nội dung mục tiêu.", status: 400 };

  console.log("[MENTOR_AI_CALL] profile_inference", { studentId: ctx.studentId });
  // 3 từ khoá field/industry/product của skin.js gộp thành 1 đoạn trả lời tự do của người dùng
  // ở Bước 1 (shared.invite_goal trong kho, KHÔNG phải form 3 ô riêng như "Tạo bài học" cũ) —
  // dồn hết vào "industry" (nghĩa rộng nhất trong 3 trường của skin.js) để chân dung nghề suy
  // luận có tối đa ngữ cảnh.
  const result = await generateOccupationProfile({ field: "", industry: rawText, product: "" });
  if (result.status !== "ok") {
    // KHÔNG coi là lỗi HTTP — đây là 1 kết quả hợp lệ của lượt suy luận (mục "needs_user_question"
    // trong skin.js), QUY TẮC ĐỒNG HÀNH bắt buộc vẫn phải có đường tiếp tục cho người dùng
    // (quay lại Bước 1 sửa mô tả), không phải màn lỗi chặn đường.
    return { content: JSON.stringify({ status: "needs_user_question" }) };
  }
  const occupationProfile = result.data.occupation_profile;

  // Câu "nói lại bằng lời" ở Bước 3 (renderConfirm trong mentorGoal.js) — bọc quanh dữ liệu AI
  // THẬT bằng confirm_wrapper.open/close (kho), câu giữa dùng NGUYÊN VĂN occupation_profile,
  // không nằm trong kho biến thể (xem note trong confirm_wrapper.json).
  const lineCtx = await getMentorLineContext(ctx.studentId);
  const session = createLineSession(lineCtx.style, lineCtx.lastLines, lineCtx.ten);
  const open = session.pick("confirm_wrapper.open", { ten: session.ten });
  const close = session.pick("confirm_wrapper.close", { ten: session.ten });
  const middle = `Học tiếng Anh cho ${occupationProfile.merged_occupation}, tập trung ${occupationProfile.primary_communication_scope}.`;
  await persistLastLines(ctx.studentId, session.getUpdatedLastLines());

  return {
    content: JSON.stringify({
      status: "ok",
      occupation_profile: occupationProfile,
      confirmation: buildConfirmationDisplay(occupationProfile),
      confirm_text: `${open} ${middle} ${close}`,
    }),
  };
}

// occupation_profile "chung" (GENERAL_OCCUPATION_PROFILE) không có merged_occupation cho
// buildConfirmationDisplay của skin.js đọc (hàm đó KHÔNG được sửa) — tự dựng hiển thị riêng.
function buildGoalConfirmationDisplay(profile) {
  if (profile?.is_general) {
    return { title_line: "Giao tiếp tổng quát", topic_line: `Chủ đề: ${profile.primary_communication_scope}`, invite_line: "Mời bạn học" };
  }
  return buildConfirmationDisplay(profile);
}

async function insertLearningGoal(studentId, profile, rawKeywords, level) {
  const display = buildGoalConfirmationDisplay(profile);
  const validLevel = VALID_LEVELS.includes(level) ? level : null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/learning_goals`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: studentId,
      title: display.title_line,
      topic_line: display.topic_line,
      raw_keywords: (rawKeywords || "").slice(0, 500) || null,
      level: validLevel,
      occupation_profile: profile,
      status: "active",
      lesson_count: 0,
    }),
  });
  if (!r.ok) {
    console.error("mentor.js insertLearningGoal error:", r.status, await r.text().catch(() => ""));
    return null;
  }
  const rows = await r.json();
  const goal = rows?.[0] || null;
  if (goal) logMentorEvent(studentId, "goal_created", { goal_id: goal.id, is_general: !!profile?.is_general });
  return { goal, confirmation: display };
}

// Không gọi AI — chỉ lưu kết quả Bước 3 đã được người dùng xác nhận.
export async function mentor_create_goal(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const profile = data.occupation_profile;
  if (!profile?.merged_occupation && !profile?.is_general) return { error: "Thiếu chân dung nghề.", status: 400 };
  const result = await insertLearningGoal(ctx.studentId, profile, data.raw_keywords, data.level);
  if (!result) return { error: "Tạo mục tiêu thất bại, vui lòng thử lại.", status: 502 };
  return { content: JSON.stringify(result) };
}

// Không gọi AI — "Bạn cứ để tôi tự chọn giúp" khi input rỗng (mục 3.3 Đợt 3, đã chốt với Minh
// 2026-07-21): CÓ lịch sử -> lặp lại occupation_profile của mục tiêu gần nhất (không gọi AI lại,
// giữ đúng luật "chỉ 2 điểm gọi AI"); TRẮNG hoàn toàn -> GENERAL_OCCUPATION_PROFILE
// (skin_general.json). Bỏ qua Bước 2/3 (chọn cấp độ/xác nhận bằng lời) vì không có gì mới để
// hỏi lại — đúng tinh thần "bấm 1 phát là đi luôn" của nút này.
export async function mentor_auto_goal(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const rows = await restGet(
    `learning_goals?user_id=eq.${ctx.studentId}&order=created_at.desc&limit=1&select=occupation_profile,level,raw_keywords`
  );
  const prior = rows?.[0];
  const profile = prior?.occupation_profile || GENERAL_OCCUPATION_PROFILE;
  const result = await insertLearningGoal(ctx.studentId, profile, prior?.raw_keywords, prior?.level);
  if (!result) return { error: "Tạo mục tiêu thất bại, vui lòng thử lại.", status: 502 };
  return { content: JSON.stringify(result) };
}

// AI CALL #2/2 (mục 5 Đợt 3) — sinh 1 bài học thật, TÁI DÙNG NGUYÊN VẸN generate_lesson()
// (lesson.js). Chủ đề/loại nội dung/cấp độ chọn bằng CODE thuần (không AI) trước khi gọi.
export async function mentor_next_lesson(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const goalRows = await restGet(`learning_goals?id=eq.${data.goal_id}&user_id=eq.${ctx.studentId}&select=*`);
  const goal = goalRows?.[0];
  if (!goal) return { error: "Không tìm thấy mục tiêu.", status: 404 };

  const contentType = goal.lesson_count % 2 === 0 ? "reading" : "dialogue";
  const level = goal.level || DEFAULT_LEVEL_WHEN_UNSET;
  const isGeneral = goal.occupation_profile?.is_general === true;

  let topic, industry, termDensity;
  if (isGeneral) {
    topic = pickGeneralTopic(level, goal.lesson_count);
    industry = "";
    termDensity = MENTOR_GENERAL_TERM_DENSITY;
  } else {
    const angle = MENTOR_SITUATION_ANGLES[goal.lesson_count % MENTOR_SITUATION_ANGLES.length];
    topic = `${goal.occupation_profile.merged_occupation}: ${angle}`;
    industry = goal.occupation_profile.merged_occupation;
    termDensity = MENTOR_TERM_DENSITY;
  }

  console.log("[MENTOR_AI_CALL] generate_lesson (next_slot)", { studentId: ctx.studentId, goalId: goal.id });
  const genLessonInput = {
    description: "",
    level,
    content_type: contentType,
    topic,
    length_words: MENTOR_LESSON_LENGTH_WORDS,
    field: "",
    industry,
    product: "",
    situation: "",
    term_density: termDensity,
    goal_id: goal.id,
  };
  // generate_lesson() KHÔNG tự retry (lỗi thật đã biết: model đôi khi lệch số từ >25% ở dialogue
  // 200 từ, đặc biệt hay gặp — chưa có cơ chế leo thang model, xem project_ai_model_routing_spec
  // trong memory, CHƯA xây, KHÔNG thuộc phạm vi ở đây). Thử lại 1 LẦN CÙNG model khi lỗi CHÍNH XÁC
  // là "dữ liệu AI không hợp lệ" (status 502) — đủ để giảm hẳn tỷ lệ fail người dùng thấy, không
  // phải giải pháp gốc. Lỗi khác (hết hạn mức, lỗi mạng...) KHÔNG retry, trả thẳng cho người dùng.
  let result = await generate_lesson(genLessonInput, ctx);
  if (result.error && result.status === 502) {
    console.log("[MENTOR_AI_CALL] generate_lesson (next_slot) retry 1x sau lỗi:", result.error);
    result = await generate_lesson(genLessonInput, ctx);
  }
  if (result.error) return result;

  // Tăng bộ đếm HIỂN THỊ ("x/y bài") — không phải hạn mức chặn (đọc ghi chú NỢ KỸ THUẬT trong
  // supabase/020_mentor_ai.sql), nên read-modify-write đơn giản là đủ, không cần RPC atomic.
  await fetch(`${SUPABASE_URL}/rest/v1/learning_goals?id=eq.${goal.id}`, {
    method: "PATCH",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ lesson_count: goal.lesson_count + 1 }),
  }).catch((e) => console.error("mentor_next_lesson lesson_count update error:", e));

  logMentorEvent(ctx.studentId, "lesson_generated", { goal_id: goal.id, is_general: isGeneral });
  return result;
}

// Mục tiêu "chung" (không ngành cụ thể) chọn chủ đề bằng CODE thuần, xoay vòng qua toàn bộ
// (khung, chủ đề) của skin_general.json — GIỐNG cơ chế MENTOR_SITUATION_ANGLES cho mục tiêu
// ngành, KHÔNG dùng generateLevelTopicsForAllLevels (Lượt B của skin.js, 5 lượt gọi AI riêng,
// nằm NGOÀI 2 điểm được phép gọi AI của Đợt 3 mục 5).
function pickGeneralTopic(level, lessonCount) {
  const levels = loadSkinGeneral();
  const frameMap = levels[level] || levels[DEFAULT_LEVEL_WHEN_UNSET];
  const flat = [];
  for (const topics of Object.values(frameMap)) {
    for (const topic of topics) flat.push(topic);
  }
  return flat[lessonCount % flat.length];
}

// ============================================================
// MÀN NGHI THỨC XƯNG HÔ (mục 3.2/3.4 điểm 1 Đợt 3) — hỏi ĐÚNG 1 LẦN/user, đầu tiên khi chạm
// Mentor. KHÔNG có "để Mentor tự chọn giúp" ở màn này (đã chốt với Minh 2026-07-21) — người
// dùng phải TỰ chọn 1 trong 4 chip; không chọn (điều hướng đi chỗ khác) thì mặc định 'toi_ban'
// (DEFAULT_PRONOUN_STYLE), không có bước "xác nhận lại bằng lời" vì lựa chọn đã tường minh.
// ============================================================

// Đọc trạng thái để client quyết định có hiện màn nghi thức hay không — không gọi AI.
export async function mentor_get_pronoun_state(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const rows = await restGet(`students?id=eq.${ctx.studentId}&select=full_name,nickname,pronoun_style,pronoun_asked_at`);
  const row = rows?.[0] || {};
  return {
    content: JSON.stringify({
      asked: !!row.pronoun_asked_at,
      pronounStyle: row.pronoun_style || null,
      ten: (row.nickname || "").trim() || lastNameOf(row.full_name) || null,
    }),
  };
}

// Đánh dấu "đã hiện màn" — gọi ngay khi màn nghi thức MOUNT (không đợi người dùng bấm gì), đúng
// nghĩa "hỏi đúng 1 lần" = hiện đúng 1 lần, không phải "chọn đúng 1 lần".
export async function mentor_mark_pronoun_asked(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${ctx.studentId}&pronoun_asked_at=is.null`, {
    method: "PATCH",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ pronoun_asked_at: new Date().toISOString() }),
  }).catch((e) => console.error("mentor_mark_pronoun_asked error:", e));
  return { content: JSON.stringify({ ok: true }) };
}

// Người dùng bấm 1 trong 4 chip — lưu thẳng, không gọi AI, không câu xác nhận thêm (lựa chọn đã
// tường minh do chính người dùng bấm).
export async function mentor_set_pronoun_style(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!VALID_PRONOUN_STYLES.includes(data.pronoun_style)) return { error: "Cách xưng hô không hợp lệ.", status: 400 };
  const nickname = data.pronoun_style === "toi_ten" ? (data.nickname || "").trim().slice(0, 50) || null : null;
  await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${ctx.studentId}`, {
    method: "PATCH",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ pronoun_style: data.pronoun_style, nickname, pronoun_asked_at: new Date().toISOString() }),
  }).catch((e) => console.error("mentor_set_pronoun_style error:", e));
  logMentorEvent(ctx.studentId, "pronoun_style_set", { pronoun_style: data.pronoun_style });
  return { content: JSON.stringify({ ok: true }) };
}

// Câu chờ dùng chung (transient.json) — cho những màn chờ ngắn cần đúng giọng xưng hô đã chọn
// nhưng không đi qua mentor_get_action/mentor_check_goal_gate. Whitelist "key" -> mảnh, KHÔNG
// nhận thẳng tên mảnh từ client (tránh client dò tên mảnh khác không dành cho màn chờ).
const TRANSIENT_LINE_KEYS = {
  loading_first_lesson: "transient.loading_first_lesson",
};

export async function mentor_get_transient_line(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const fragmentPath = TRANSIENT_LINE_KEYS[data.key];
  if (!fragmentPath) return { error: "Không rõ loại câu chờ.", status: 400 };
  const lineCtx = await getMentorLineContext(ctx.studentId);
  const session = createLineSession(lineCtx.style, lineCtx.lastLines, lineCtx.ten);
  const text = session.pick(fragmentPath, { ten: session.ten });
  await persistLastLines(ctx.studentId, session.getUpdatedLastLines());
  return { content: JSON.stringify({ text }) };
}
