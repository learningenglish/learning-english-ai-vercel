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
import { generateOccupationProfile, buildConfirmationDisplay } from "./curriculum/skin.js";
import { generate_lesson } from "./lesson.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE_HEADERS = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
const VALID_LEVELS = ["A1", "A2", "B1", "B2", "C1"];

// ====== HẰNG SỐ CẤU HÌNH — đúng quy ước Đợt 2/3: mọi con số nghiệp vụ đặt 1 chỗ, không rải
// rác trong code. Đổi ở đây là đổi cho toàn bộ luồng Mentor AI. ======
const REVIEW_QUEUE_LOOKBACK_LESSONS = 10; // "N bài gần nhất" — mục 3 Đợt 3
const REVIEW_QUEUE_MIN_ATTEMPTS = 3; // số lần thử tối thiểu 1 grammar_tag mới đủ tin cậy để tính tỷ lệ sai
const REVIEW_QUEUE_ERROR_RATE_THRESHOLD = 0.4; // "tỷ lệ sai > ngưỡng"
const REVIEW_QUEUE_COOLDOWN_DAYS = 3; // "chưa được ôn trong M ngày"
const GOAL_LOW_ACCESS_THRESHOLD = 0.5; // Bước 0 mục 6.3: "truy cập đợt hiện tại CHƯA đạt 50%"
const DEFAULT_LEVEL_WHEN_UNSET = "B1"; // người dùng chọn "Mình chưa chắc" ở Bước 2
const MENTOR_LESSON_LENGTH_WORDS = 200; // độ dài mặc định cho bài Mentor tự sinh tiếp (next_slot)
const MENTOR_TERM_DENSITY = 20; // lượng từ chuyên ngành mặc định cho bài Mentor tự sinh
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

async function getStudentName(studentId) {
  const rows = await restGet(`students?id=eq.${studentId}&select=full_name`);
  const raw = (rows?.[0]?.full_name || "").trim();
  return raw ? raw.split(/\s+/).slice(-1)[0] : null; // tên gọi (từ cuối họ tên) cho tự nhiên khi xưng hô
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

async function computeReviewQueue(studentId) {
  const rows = await restGet(
    `lesson_progress?user_id=eq.${studentId}&completed_at=not.is.null&order=completed_at.desc` +
      `&limit=${REVIEW_QUEUE_LOOKBACK_LESSONS}&select=completed_at,exercise_results,lessons(id,title_vi)`
  );
  if (!rows?.length) return null;

  const byTag = new Map(); // grammar_tag -> { wrong, total, lastSeenAt, lessons: Set<{id,title_vi}> }
  for (const row of rows) {
    const results = Array.isArray(row.exercise_results) ? row.exercise_results : [];
    for (const item of results) {
      if (!item?.grammar_tag) continue;
      const tag = String(item.grammar_tag).trim();
      if (!tag) continue;
      if (!byTag.has(tag)) byTag.set(tag, { wrong: 0, total: 0, lastSeenAt: row.completed_at, lessonCandidates: [] });
      const entry = byTag.get(tag);
      entry.total += 1;
      if (!item.correct) entry.wrong += 1;
      if (row.completed_at > entry.lastSeenAt) entry.lastSeenAt = row.completed_at;
    }
  }

  const now = Date.now();
  const cooldownMs = REVIEW_QUEUE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  let worst = null;
  for (const [tag, entry] of byTag) {
    if (entry.total < REVIEW_QUEUE_MIN_ATTEMPTS) continue;
    const errorRate = entry.wrong / entry.total;
    if (errorRate <= REVIEW_QUEUE_ERROR_RATE_THRESHOLD) continue;
    const daysSince = now - new Date(entry.lastSeenAt).getTime();
    if (daysSince < cooldownMs) continue; // vừa ôn gần đây, chưa tới lúc nhắc lại
    if (!worst || errorRate > worst.errorRate) worst = { tag, errorRate, wrong: entry.wrong, total: entry.total };
  }
  if (!worst) return null;

  // Tìm 1 bài ĐÃ CÓ của chính user có điểm ngữ pháp này (ưu tiên bài cũ, không sinh AI mới —
  // đúng lựa chọn "không bắt buộc" ở mục 3 Đợt 3, giữ số lượt AI = 0 cho review_lesson).
  const candidateLessons = await restGet(
    `lessons?user_id=eq.${studentId}&select=id,title_vi,grammar&order=created_at.desc&limit=50`
  );
  const match = (candidateLessons || []).find((l) => (l.grammar || []).some((g) => g?.name === worst.tag));
  if (!match) return null; // không có bài phù hợp -> để decideAction() rơi xuống next_slot/prompt_new_goal

  return { grammarTag: worst.tag, wrong: worst.wrong, total: worst.total, lesson: match };
}

async function getMostRecentActiveGoal(studentId) {
  const rows = await restGet(
    `learning_goals?user_id=eq.${studentId}&status=eq.active&order=created_at.desc&limit=1&select=*`
  );
  return rows?.[0] || null;
}

async function decideAction(studentId) {
  const inProgress = await findInProgressLesson(studentId);
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

function buildMentorCard(action, studentName) {
  const hi = studentName ? `Chào ${studentName}, ` : "Chào bạn, ";

  if (action.type === "continue_lesson") {
    const lessonTitle = action.lesson.title_vi;
    if (action.goal && action.goalCounts) {
      const { completed, total } = action.goalCounts;
      return {
        title: `${hi}bạn đang học "${action.goal.title}" — ${completed}/${total} bài rồi đó.`,
        body: `Học tiếp bài "${lessonTitle}" nhé?`,
        primary: { label: "Học tiếp", kind: "open_lesson", lessonId: action.lesson.id },
        secondary: { label: "Xem cả lộ trình", kind: "open_hub", goalId: action.goal.id },
      };
    }
    return {
      title: `${hi}bạn đang học dở "${lessonTitle}" — đã làm ${action.exercisesDone}/${action.exercisesTotal} câu bài tập.`,
      body: `Học tiếp cho xong nhé?`,
      primary: { label: "Học tiếp", kind: "open_lesson", lessonId: action.lesson.id },
      secondary: { label: "Xem thư viện", kind: "open_hub" },
    };
  }

  if (action.type === "review_lesson") {
    return {
      title: `${hi}gần đây bạn sai ${action.wrong}/${action.total} câu về "${action.grammarTag}".`,
      body: `Ôn lại trong bài "${action.lesson.title_vi}" nhé?`,
      primary: { label: "Ôn lại bài này", kind: "open_lesson", lessonId: action.lesson.id },
      secondary: { label: "Học bài khác", kind: "open_hub" },
    };
  }

  if (action.type === "next_slot") {
    return {
      title: `${hi}bạn đã học ${action.completed}/${action.goal.lesson_count} bài trong "${action.goal.title}".`,
      body: `Sẵn sàng học bài mới chưa?`,
      primary: { label: "Học bài mới", kind: "next_lesson", goalId: action.goal.id },
      secondary: { label: "Xem lại bài cũ", kind: "open_hub", goalId: action.goal.id },
    };
  }

  // prompt_new_goal — người dùng chưa từng có mục tiêu nào, dẫn thẳng xuống nút (+) (mục 6.2).
  return {
    title: `${hi}mình là Mentor AI.`,
    body: `Kể mình nghe bạn muốn học tiếng Anh để làm gì, mình chuẩn bị lộ trình riêng cho bạn.`,
    primary: { label: "Bắt đầu", kind: "open_goal_flow" },
    secondary: null,
  };
}

// ============================================================
// ACTIONS xuất ra cho chat.js đăng ký vào ACTIONS map.
// ============================================================

export async function mentor_get_action(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const [action, studentName] = await Promise.all([decideAction(ctx.studentId), getStudentName(ctx.studentId)]);
  const card = buildMentorCard(action, studentName);
  return { content: JSON.stringify({ action: action.type, card }) };
}

// Bước 0 (mục 6.3): chặn CÓ ĐIỀU KIỆN khi bấm nút (+) — chỉ tính, không tự ý chặn (client tự
// quyết định có hiện màn chặn hay bỏ qua thẳng Bước 1). Không gọi AI.
export async function mentor_check_goal_gate(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const goal = await getMostRecentActiveGoal(ctx.studentId);
  if (!goal || !goal.lesson_count) return { content: JSON.stringify({ shouldGate: false }) };
  const accessed = await goalProgressCounts(ctx.studentId, goal.id, {});
  const pct = accessed / goal.lesson_count;
  if (pct >= GOAL_LOW_ACCESS_THRESHOLD) return { content: JSON.stringify({ shouldGate: false }) };
  const remaining = goal.lesson_count - accessed;
  return {
    content: JSON.stringify({
      shouldGate: true,
      goalTitle: goal.title,
      remaining,
      message: `Bạn còn ${remaining} bài chưa học ở lộ trình "${goal.title}" đó. Học thêm mục tiêu mới sẽ tách sự tập trung — bạn có chắc muốn bắt đầu cái mới không?`,
    }),
  };
}

// AI CALL #1/2 (mục 5 Đợt 3) — chân dung nghề, TÁI DÙNG NGUYÊN VẸN skin.js.
export async function mentor_infer_goal(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const rawText = (data.raw_text || "").trim();
  if (!rawText) return { error: "Thiếu nội dung mục tiêu.", status: 400 };

  console.log("[MENTOR_AI_CALL] profile_inference", { studentId: ctx.studentId });
  // 3 từ khoá field/industry/product của skin.js gộp thành 1 câu trả lời tự do của người
  // dùng ("Kể mình nghe, bạn muốn học tiếng Anh để làm gì?") — không có 3 ô nhập riêng ở
  // luồng Mentor (khác form "Tạo bài học" cũ), nên dồn hết vào "industry" (nghĩa rộng nhất
  // trong 3 trường của skin.js) để chân dung nghề suy luận có tối đa ngữ cảnh.
  const result = await generateOccupationProfile({ field: "", industry: rawText, product: "" });
  if (result.status !== "ok") {
    // KHÔNG coi là lỗi HTTP — đây là 1 kết quả hợp lệ của lượt suy luận (mục "needs_user_question"
    // trong skin.js), QUY TẮC ĐỒNG HÀNH bắt buộc vẫn phải có đường tiếp tục cho người dùng
    // (quay lại Bước 1 sửa mô tả), không phải màn lỗi chặn đường.
    return { content: JSON.stringify({ status: "needs_user_question" }) };
  }
  const occupationProfile = result.data.occupation_profile;
  return {
    content: JSON.stringify({
      status: "ok",
      occupation_profile: occupationProfile,
      confirmation: buildConfirmationDisplay(occupationProfile),
    }),
  };
}

// Không gọi AI — chỉ lưu kết quả Bước 3 đã được người dùng xác nhận.
export async function mentor_create_goal(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const profile = data.occupation_profile;
  if (!profile?.merged_occupation) return { error: "Thiếu chân dung nghề.", status: 400 };
  const display = buildConfirmationDisplay(profile);
  const level = VALID_LEVELS.includes(data.level) ? data.level : null;

  const r = await fetch(`${SUPABASE_URL}/rest/v1/learning_goals`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: ctx.studentId,
      title: display.title_line,
      topic_line: display.topic_line,
      raw_keywords: (data.raw_keywords || "").slice(0, 500) || null,
      level,
      occupation_profile: profile,
      status: "active",
      lesson_count: 0,
    }),
  });
  if (!r.ok) {
    console.error("mentor_create_goal insert error:", r.status, await r.text().catch(() => ""));
    return { error: "Tạo mục tiêu thất bại, vui lòng thử lại.", status: 502 };
  }
  const rows = await r.json();
  return { content: JSON.stringify({ goal: rows?.[0] || null, confirmation: display }) };
}

// AI CALL #2/2 (mục 5 Đợt 3) — sinh 1 bài học thật, TÁI DÙNG NGUYÊN VẸN generate_lesson()
// (lesson.js). Chủ đề/loại nội dung/cấp độ chọn bằng CODE thuần (không AI) trước khi gọi.
export async function mentor_next_lesson(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  const goalRows = await restGet(`learning_goals?id=eq.${data.goal_id}&user_id=eq.${ctx.studentId}&select=*`);
  const goal = goalRows?.[0];
  if (!goal) return { error: "Không tìm thấy mục tiêu.", status: 404 };

  const angle = MENTOR_SITUATION_ANGLES[goal.lesson_count % MENTOR_SITUATION_ANGLES.length];
  const contentType = goal.lesson_count % 2 === 0 ? "reading" : "dialogue";
  const level = goal.level || DEFAULT_LEVEL_WHEN_UNSET;

  console.log("[MENTOR_AI_CALL] generate_lesson (next_slot)", { studentId: ctx.studentId, goalId: goal.id });
  const result = await generate_lesson(
    {
      description: "",
      level,
      content_type: contentType,
      topic: `${goal.occupation_profile.merged_occupation}: ${angle}`,
      length_words: MENTOR_LESSON_LENGTH_WORDS,
      field: "",
      industry: goal.occupation_profile.merged_occupation,
      product: "",
      situation: "",
      term_density: MENTOR_TERM_DENSITY,
      goal_id: goal.id,
    },
    ctx
  );
  if (result.error) return result;

  // Tăng bộ đếm HIỂN THỊ ("x/y bài") — không phải hạn mức chặn (đọc ghi chú NỢ KỸ THUẬT trong
  // supabase/020_mentor_ai.sql), nên read-modify-write đơn giản là đủ, không cần RPC atomic.
  await fetch(`${SUPABASE_URL}/rest/v1/learning_goals?id=eq.${goal.id}`, {
    method: "PATCH",
    headers: { ...SERVICE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ lesson_count: goal.lesson_count + 1 }),
  }).catch((e) => console.error("mentor_next_lesson lesson_count update error:", e));

  return result;
}
