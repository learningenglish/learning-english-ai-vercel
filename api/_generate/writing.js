// api/_generate/writing.js — tính năng MỚI "Luyện viết" (Writing Practice, 2026-07-27).
// KHÔNG đụng tới lesson.js/mentor.js/chat.js ngoài 2 dòng import+entry ACTIONS (luật "chat.js
// đóng băng", xem ghi chú đầu file lesson.js). Độc lập hoàn toàn với luồng Lesson-first — bài
// viết KHÔNG lưu vào bảng "lessons", có bảng riêng "writing_submissions" (xem
// supabase/025_writing_submissions.sql).
//
// 2 action, MỖI action tự có hạn mức 3 lượt/ngày RIÊNG (chốt của Minh 2026-07-27, xem
// DAILY_WRITING_LIMIT bên dưới — tạm thời TẮT enforce trong lúc xây/test, xem
// WRITING_LIMIT_ENFORCED): generate_writing_task (Bước 1→2: AI giao đề) và grade_writing
// (Bước 3→4→5: AI chấm — generate-EVERY-TIME, tốn phí thật mỗi lần bấm "Gửi bài viết").
import { SUPABASE_URL } from "./_shared.js";
import { generateStructuredJSON } from "../_shared/aiProvider.js";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VALID_LEVELS = ["A1", "A2", "B1", "B2", "C1"];

function orNone(v) {
  const s = (v ?? "").toString().trim();
  return s ? s : "không có";
}

function wordCount(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

// ====== Hạn mức 3 lượt/ngày — CHỐT của Minh 2026-07-27: "giao nhiệm vụ" (generate_writing_task)
// VÀ "chấm bài viết" (grade_writing) MỖI hành động giới hạn RIÊNG 3 lượt/ngày (không cộng
// chung), ĐỘC LẬP hoàn toàn với DAILY_LESSON_LIMIT (lesson.js) — không đụng/đổi cơ chế đó.
// Cổng "chỉ Student Pro" giữ nguyên như đề xuất ban đầu (nhất quán với generate_lesson/
// analyze_user_text). Đếm bằng 2 bảng riêng: "writing_task_requests" (mỗi lượt GIAO ĐỀ thành
// công = 1 dòng, xem supabase/026_writing_task_requests.sql) và "writing_submissions" (mỗi
// lượt CHẤM thành công = 1 dòng, đã có sẵn) — giống HỆT cách checkDailyLessonLimit() đếm bảng
// "lessons".
//
// TẠM THỜI TẮT enforce số lượng (Minh: "đang xây và chạy thử không giới hạn") — cổng Pro VẪN
// hoạt động bình thường (không đụng), CHỈ phần đếm 3 lượt/ngày bị bỏ qua. Đặt lại
// WRITING_LIMIT_ENFORCED = true khi chuẩn bị phát hành thật, KHÔNG cần sửa gì khác.
const WRITING_LIMIT_ENFORCED = false;
const DAILY_WRITING_LIMIT = 3;
const VN_TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh = UTC+7, không có giờ mùa hè

function startOfTodayVN() {
  const nowVN = new Date(Date.now() + VN_TZ_OFFSET_MS);
  const midnightVN = Date.UTC(nowVN.getUTCFullYear(), nowVN.getUTCMonth(), nowVN.getUTCDate());
  return new Date(midnightVN - VN_TZ_OFFSET_MS);
}

async function getStudentPlan(studentId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${studentId}&select=plan`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!r.ok) return null;
  return (await r.json())?.[0] || null;
}

// table: "writing_task_requests" (hạn mức giao đề) hoặc "writing_submissions" (hạn mức chấm
// bài) — cùng khuôn đếm, chỉ khác bảng đếm + câu thông báo hết hạn mức.
async function checkDailyWritingLimit(studentId, table, exhaustedMessage) {
  try {
    const student = await getStudentPlan(studentId);
    if (!student) return { allowed: false, message: "Không tìm thấy tài khoản học viên." };
    if (student.plan !== "pro") return { allowed: false, message: "Tính năng Luyện viết chỉ dành cho gói Pro." };
    if (!WRITING_LIMIT_ENFORCED) return { allowed: true, used: 0 };

    const sinceISO = startOfTodayVN().toISOString();
    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${studentId}&created_at=gte.${sinceISO}&select=id`,
      {
        method: "HEAD",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "count=exact",
        },
      }
    );
    if (!countRes.ok) {
      console.error(`checkDailyWritingLimit (${table} count) error:`, countRes.status);
      return { allowed: false, message: "Không kiểm tra được hạn mức luyện viết, thử lại sau." };
    }
    const used = Number((countRes.headers.get("content-range") || "").split("/")[1] || 0);
    if (used >= DAILY_WRITING_LIMIT) {
      return { allowed: false, message: exhaustedMessage, used };
    }
    return { allowed: true, used };
  } catch (e) {
    console.error("checkDailyWritingLimit error:", e);
    return { allowed: false, message: "Không kiểm tra được hạn mức luyện viết, thử lại sau." };
  }
}

async function logWritingTaskRequest(studentId) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/writing_task_requests`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: studentId }),
    });
    if (!r.ok) console.error("logWritingTaskRequest error:", r.status, await r.text());
  } catch (e) {
    console.error("logWritingTaskRequest error:", e);
  }
}

// ====== Bảng độ dài bài viết theo cấp CEFR — tự ước tính riêng cho Luyện viết (KHÔNG dùng lại
// LEVEL_LENGTH_TABLE của lesson.js, bảng đó tính cho hội thoại/bài đọc, đơn vị khác). Căn cứ
// tham khảo: chuẩn số từ bài viết các kỳ thi Cambridge ứng theo cấp CEFR — KET(A2) ~25-35 từ,
// PET(B1) ~100 từ, FCE(B2) ~140-190 từ, CAE(C1) ~220-260 từ. A1 KHÔNG có kỳ thi viết chính
// thức tương ứng — ước tính thấp hơn A2 (đoạn/tin nhắn rất ngắn). Nới biên mỗi mức (không
// chỉ đúng khoảng thi) để phù hợp bối cảnh LUYỆN TẬP (không phải thi thật, học viên có thể
// viết dài/ngắn hơn khoảng thi 1 chút vẫn hợp lệ).
const WRITING_LENGTH_TABLE = {
  A1: [30, 60],
  A2: [50, 90],
  B1: [90, 150],
  B2: [140, 220],
  C1: [200, 280],
};

// ====== Tách câu ĐƠN GIẢN — dùng để (a) đưa danh sách câu đã đánh số vào prompt chấm bài,
// (b) validate số phần tử "segments" AI trả về phải khớp CHÍNH XÁC. Không cần hoàn hảo (lỗi
// hiếm gặp: viết tắt "Mr." bị tách nhầm) — chấp nhận được cho mục đích luyện tập, đúng ghi
// chú "tách câu đơn giản" trong yêu cầu gốc.
function splitSentences(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [trimmed];
}

// ====== Chặn ngôn từ tuyệt đối — lớp phòng vệ THỨ 2 sau prompt (model vẫn có thể lỡ dùng dù
// đã dặn). Không throw/chặn cả lượt chấm vì lỗi này — chỉ thay câu nhận xét đó bằng bản an
// toàn, log lại để biết prompt cần siết thêm nếu lặp lại nhiều.
const ABSOLUTE_LANGUAGE_PATTERN = /100\s*%|hoàn toàn không|sạch lỗi|tuyệt đối (không|chuẩn|đúng)|hoàn hảo|không (còn|có) lỗi nào/i;

function sanitizeComment(text, fallback) {
  const s = (text || "").toString().trim();
  if (!s) return fallback;
  if (ABSOLUTE_LANGUAGE_PATTERN.test(s)) {
    console.error("[grade_writing] absolute-language phrase caught, replaced:", s);
    return fallback;
  }
  return s;
}

// ====== PROMPT 1: generate_writing_task (Bước 1→2 — AI giao đề) ======
const TASK_SYSTEM_PROMPT = `Bạn là chuyên gia thiết kế đề bài luyện viết tiếng Anh cho người Việt, bám khung CEFR.

NHIỆM VỤ: Giao 1 đề bài viết phù hợp cấp độ CEFR của học viên.

QUY TẮC:
- Nếu có Lĩnh vực: đề bài PHẢI liên quan trực tiếp tới lĩnh vực đó (ví dụ lĩnh vực "Nhà hàng - Khách sạn" → viết email/đoạn văn liên quan công việc khách sạn), không lái sang chủ đề chung chung không liên quan.
- Nếu KHÔNG có Lĩnh vực: tự chọn 1 chủ đề viết thường gặp, đa dạng giữa các lần gọi (email công việc, đoạn văn miêu tả, thư cho bạn, đánh giá sản phẩm, kể lại một sự việc, viết tin nhắn...).
- Độ khó đề bài (độ PHỨC TẠP yêu cầu, không phải độ dài) phải VỪA SỨC cấp độ: A1/A2 chỉ yêu cầu câu đơn giản, chủ đề gần gũi đời thường (giới thiệu bản thân, tin nhắn ngắn, mô tả đồ vật quen thuộc); B1 trở lên có thể yêu cầu email/đoạn văn có cấu trúc rõ ràng, nhiều ý hơn.
- "goals": 2-4 gạch đầu dòng ngắn (tiếng Việt), mục tiêu CỤ THỂ bài viết cần đạt được (không chung chung kiểu "viết hay").
- "structure": các bước/phần nên có trong bài, 3-5 phần, MỖI phần có nhãn tiếng Anh ngắn (1-2 từ) + nhãn tiếng Việt giải thích ngắn trong ngoặc.
- "genre_vi": tên thể loại ngắn gọn tiếng Việt (vd "Email công việc", "Đoạn văn miêu tả", "Thư cho bạn", "Bài đánh giá sản phẩm").
- "vocabulary_suggestions": 5-8 từ/cụm từ tiếng Anh HỮU ÍCH để viết đúng chủ đề này, đúng cấp độ, mỗi từ kèm nghĩa tiếng Việt ngắn — đây là GỢI Ý không bắt buộc dùng, không phải danh sách đánh giá.
- "useful_phrases": 4-6 cụm/mẫu câu tiếng Anh THÔNG DỤNG phù hợp thể loại + chủ đề này (vd mở đầu email, câu chuyển ý...), đúng cấp độ, mỗi cụm kèm nghĩa/công dụng ngắn tiếng Việt.

QUY TẮC ĐẦU RA: Trả về DUY NHẤT một khối JSON hợp lệ theo schema. Không lời chào, không giải thích, không bọc trong dấu \`\`\`.

SCHEMA JSON:
{
  "topic_en": "câu đề bài bằng tiếng Anh, 1 câu ngắn gọn rõ ràng",
  "topic_vi": "dịch/mô tả câu đề bài bằng tiếng Việt",
  "genre_vi": "tên thể loại ngắn gọn tiếng Việt",
  "goals": ["mục tiêu 1", "mục tiêu 2"],
  "structure": [{"label": "Greeting", "label_vi": "Lời chào"}],
  "vocabulary_suggestions": [{"word": "delay", "meaning": "sự chậm trễ"}],
  "useful_phrases": [{"phrase": "I'm writing to inform you that...", "meaning": "Dùng để mở đầu email báo tin"}]
}`;

function buildTaskUserPrompt(level, industry) {
  return `Cấp độ CEFR của học viên: ${level}
Lĩnh vực: ${orNone(industry)}`;
}

// ====== PROMPT 2: grade_writing (Bước 3→4→5 — AI chấm + đánh dấu) ======
const GRADE_SYSTEM_PROMPT = `Bạn là giám khảo chấm bài viết tiếng Anh cho người Việt học theo khung CEFR.

NHIỆM VỤ: Chấm bài viết của học viên dựa trên đề bài đã giao, theo ĐÚNG cấp độ CEFR của học viên.

QUY TẮC CHẤM 5 TIÊU CHÍ (mỗi tiêu chí thang điểm NGUYÊN 0-20, tổng tối đa 100):
1. "organization" (Bố cục): bài có mở đầu/thân bài/kết đúng cấu trúc phù hợp thể loại này không.
2. "vocabulary" (Từ vựng): từ vựng phong phú, đúng ngữ cảnh, đúng cấp độ; NẾU có lĩnh vực chuyên ngành được cho, xét thêm mức độ dùng từ chuyên ngành đó.
3. "grammar" (Ngữ pháp + cấu trúc câu): đúng ngữ pháp, cấu trúc câu phù hợp cấp độ.
4. "coherence" (Mạch lạc): các câu/đoạn liên kết logic, dùng từ nối hợp lý, không rời rạc.
5. "task_genre" (Đúng thể loại / không lạc đề): bài có bám đúng đề bài, đúng mục tiêu, đúng thể loại đã giao không.
Mỗi tiêu chí: điểm số nguyên 0-20 + "comment" 1 câu tiếng Việt ngắn nhận xét CHỈ tiêu chí đó.

QUY TẮC NGÔN TỪ (BẮT BUỘC): KHÔNG dùng các cụm khẳng định tuyệt đối trong bất kỳ câu nhận xét nào ("sạch lỗi 100%", "hoàn toàn không còn lỗi", "hoàn hảo", "chuẩn tuyệt đối"...) — hệ thống không có cách nào tự kiểm chứng một tuyên bố tuyệt đối như vậy, dùng cách diễn đạt điềm tĩnh, có chừa dư địa ("đã rà soát các lỗi phổ biến", "bài viết khá tốt ở các phần chính", "còn một vài điểm có thể cải thiện thêm").

QUY TẮC ĐÁNH DẤU BÀI VIẾT — BẮT BUỘC KHỚP SỐ CÂU:
Bài viết đã được tách sẵn thành các câu đánh số theo thứ tự ở dưới. Bạn PHẢI trả về mảng "segments" có ĐÚNG số phần tử bằng số câu đã cho, THEO ĐÚNG THỨ TỰ, KHÔNG gộp 2 câu thành 1, KHÔNG tách 1 câu thành 2 — mỗi phần tử ứng với ĐÚNG 1 câu đã đánh số, "text" là NGUYÊN VĂN câu đó (copy chính xác, không sửa chữ nào).
Mỗi phần tử phân vào ĐÚNG 1 trong 3 loại "issue_type":
- "unnatural": câu/cụm không tự nhiên, phi thực tế, người bản xứ không dùng, thành ngữ dùng sai, hoặc SAI ngữ pháp rõ ràng. Bắt buộc có "replacement" = nguyên câu thay thế đúng/tự nhiên hơn.
- "improvable": câu KHÔNG sai, nhưng có cách viết tự nhiên/hay hơn. Bắt buộc có "suggestion" = nguyên câu đã cải thiện.
- "ok": câu ổn, không cần sửa. KHÔNG kèm "replacement"/"suggestion".
CHỈ đánh dấu "unnatural" cho lỗi THẬT SỰ rõ ràng — câu chỉ hơi khác văn phong thuộc "improvable", không phải "unnatural". Một bài viết tốt nên có ĐA SỐ câu là "ok" — không cố tìm lỗi để đủ số lượng.

QUY TẮC 2 THÔNG BÁO TỔNG QUAN (chỉ nêu HIỆN TƯỢNG, KHÔNG giải thích cách sửa):
- "industry_vocab_gap": true nếu CÓ lĩnh vực chuyên ngành được giao NHƯNG bài viết dùng rất ít hoặc không dùng từ chuyên ngành đó; false nếu không có lĩnh vực hoặc bài đã dùng đủ.
- "structure_too_simple": true nếu PHẦN LỚN câu trong bài dùng cấu trúc ngữ pháp thấp hơn rõ rệt so với cấp độ CEFR đã cho; false nếu không.

QUY TẮC ĐẦU RA: Trả về DUY NHẤT một khối JSON hợp lệ theo schema. Không lời chào, không giải thích ngoài JSON, không bọc trong dấu \`\`\`. "strengths": 1-2 câu tiếng Việt nhận xét tổng quan điểm mạnh của bài (đúng QUY TẮC NGÔN TỪ ở trên).

SCHEMA JSON:
{
  "criteria": [
    {"key": "organization", "score": 0, "comment": "..."},
    {"key": "vocabulary", "score": 0, "comment": "..."},
    {"key": "grammar", "score": 0, "comment": "..."},
    {"key": "coherence", "score": 0, "comment": "..."},
    {"key": "task_genre", "score": 0, "comment": "..."}
  ],
  "strengths": "...",
  "segments": [
    {"text": "nguyên văn câu 1", "issue_type": "ok|unnatural|improvable", "replacement": "chỉ có khi unnatural", "suggestion": "chỉ có khi improvable"}
  ],
  "industry_vocab_gap": false,
  "structure_too_simple": false
}`;

function buildGradeUserPrompt({ level, industry, task, sentences }) {
  const goalsText = Array.isArray(task?.goals) && task.goals.length ? task.goals.map((g) => `- ${g}`).join("\n") : "không có";
  const numberedSentences = sentences.map((s, i) => `${i + 1}. "${s}"`).join("\n");
  return `Đề bài đã giao:
- Chủ đề (tiếng Anh): ${task?.topic_en || "không có"}
- Mô tả tiếng Việt: ${task?.topic_vi || "không có"}
- Thể loại: ${task?.genre_vi || "không có"}
- Mục tiêu bài viết:
${goalsText}

Thông tin học viên:
- Cấp độ CEFR: ${level}
- Lĩnh vực chuyên ngành: ${orNone(industry)}

Bài viết của học viên đã tách sẵn thành ĐÚNG ${sentences.length} câu theo thứ tự dưới đây — mảng "segments" trả về PHẢI có ĐÚNG ${sentences.length} phần tử khớp thứ tự này:
${numberedSentences}

Chấm bài theo đúng quy tắc đã nêu ở trên.`;
}

const CRITERIA_DEFS = [
  { key: "organization", label: "Bố cục" },
  { key: "vocabulary", label: "Từ vựng" },
  { key: "grammar", label: "Ngữ pháp" },
  { key: "coherence", label: "Mạch lạc" },
  { key: "task_genre", label: "Đúng thể loại" },
];

function isValidGradeShape(parsed, expectedSentenceCount) {
  if (!parsed || typeof parsed !== "object") return false;
  if (!Array.isArray(parsed.criteria) || parsed.criteria.length !== CRITERIA_DEFS.length) return false;
  const gotKeys = new Set(parsed.criteria.map((c) => c?.key));
  if (!CRITERIA_DEFS.every((c) => gotKeys.has(c.key))) return false;
  if (!parsed.criteria.every((c) => Number.isFinite(c?.score))) return false;
  if (!Array.isArray(parsed.segments) || parsed.segments.length !== expectedSentenceCount) return false;
  if (!parsed.segments.every((s) => ["ok", "unnatural", "improvable"].includes(s?.issue_type))) return false;
  return true;
}

// Gọi AI + tự retry TỐI ĐA 1 LẦN nếu số "segments" không khớp số câu gốc (đúng yêu cầu validate
// phía code ở mục 2.2) — KHÔNG leo thang model (tier mặc định đủ dùng, xem ghi chú mục 2.4),
// chỉ nhắc lại yêu cầu số lượng mạnh hơn ở lượt 2.
async function gradeWithRetry({ level, industry, task, sentences }) {
  const basePrompt = buildGradeUserPrompt({ level, industry, task, sentences });
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const userPrompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nLƯU Ý: Lượt trước bạn trả về SAI số phần tử "segments" — lần này PHẢI trả về ĐÚNG ${sentences.length} phần tử, không hơn không kém, khớp đúng thứ tự ${sentences.length} câu đã cho ở trên.`;
    const r = await generateStructuredJSON({
      maxTokens: 4800, // bài dài (~600 từ, ~40 câu) x (text+replacement/suggestion+comment mỗi câu) cộng lại có thể vượt 4000, chừa biên an toàn.
      temperature: 0.5,
      messages: [
        { role: "system", content: GRADE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    last = r;
    if (r.ok && isValidGradeShape(r.data, sentences.length)) return r;
  }
  return last;
}

async function insertWritingSubmission(row) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/writing_submissions`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      console.error("insert writing_submissions error:", r.status, await r.text());
      return null;
    }
    const rows = await r.json();
    return rows?.[0] || null;
  } catch (e) {
    console.error("insertWritingSubmission error:", e);
    return null;
  }
}

function buildMeta(r) {
  return { usage: r.usage || null, duration_ms: r.durationMs, model: r.model };
}

// ====== ACTIONS xuất ra cho chat.js đăng ký vào ACTIONS map ======
// Chỉ Student mới dùng (giống generate_lesson/analyze_user_text) — Mentor không có mô hình
// credit/hạn mức tương ứng ở MVP này.
export async function generate_writing_task(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!VALID_LEVELS.includes(data.level)) return { error: "Thiếu hoặc sai 'level'.", status: 400 };

  // (a) Đọc hạn mức TRƯỚC — hết hạn mức thì chặn ngay, không tốn 1 lượt gọi AI thật.
  const limitCheck = await checkDailyWritingLimit(
    ctx.studentId,
    "writing_task_requests",
    `Đã dùng hết ${DAILY_WRITING_LIMIT} lượt giao đề hôm nay, quay lại vào ngày mai.`
  );
  if (!limitCheck.allowed) return { error: limitCheck.message, status: 403 };

  const r = await generateStructuredJSON({
    maxTokens: 1600, // topic+goals+structure+vocabulary_suggestions+useful_phrases cộng lại ~500-700 token thật, chừa biên an toàn.
    temperature: 0.9, // đề bài cần ĐA DẠNG giữa các lần gọi (không có Lĩnh vực -> AI tự chọn chủ đề) — nhiệt độ cao hơn generate_lesson (0.7) cố ý.
    messages: [
      { role: "system", content: TASK_SYSTEM_PROMPT },
      { role: "user", content: buildTaskUserPrompt(data.level, data.industry) },
    ],
  });
  if (!r.ok) {
    if (r.parseError) console.error("[generate_writing_task] parse error:", r.text?.slice(0, 500));
    return { error: r.error || "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: r.status || 502 };
  }
  const parsed = r.data;
  if (!parsed?.topic_en || !parsed?.topic_vi || !Array.isArray(parsed.goals) || !Array.isArray(parsed.structure)) {
    console.error("[generate_writing_task] invalid shape:", JSON.stringify(parsed).slice(0, 500));
    return { error: "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: 502 };
  }

  // PHẢI await (không fire-and-forget) — đây là Serverless Function, tiến trình có thể bị
  // đóng băng/dừng NGAY sau khi response được trả về, insert chưa kịp chạy xong sẽ mất đếm.
  await logWritingTaskRequest(ctx.studentId);

  const [minWords, maxWords] = WRITING_LENGTH_TABLE[data.level] || [90, 150];
  return {
    content: JSON.stringify({
      task: {
        topic_en: parsed.topic_en,
        topic_vi: parsed.topic_vi,
        genre_vi: parsed.genre_vi || "",
        goals: parsed.goals,
        structure: parsed.structure,
        vocabulary_suggestions: Array.isArray(parsed.vocabulary_suggestions) ? parsed.vocabulary_suggestions : [],
        useful_phrases: Array.isArray(parsed.useful_phrases) ? parsed.useful_phrases : [],
      },
      target_words_min: minWords,
      target_words_max: maxWords,
      meta: buildMeta(r),
    }),
  };
}

export async function grade_writing(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!VALID_LEVELS.includes(data.level)) return { error: "Thiếu hoặc sai 'level'.", status: 400 };
  if (!data.task || typeof data.task !== "object" || !data.task.topic_en) return { error: "Thiếu đề bài.", status: 400 };
  const wc = wordCount(data.text);
  if (wc < 10) return { error: "Bài viết quá ngắn (tối thiểu 10 từ).", status: 400 };
  if (wc > 600) return { error: "Bài viết quá dài (tối đa 600 từ).", status: 400 };

  // (a) Đọc hạn mức TRƯỚC — hết hạn mức thì chặn ngay, không tốn 1 lượt gọi AI thật.
  const limitCheck = await checkDailyWritingLimit(
    ctx.studentId,
    "writing_submissions",
    `Đã dùng hết ${DAILY_WRITING_LIMIT} lượt chấm bài hôm nay, quay lại vào ngày mai.`
  );
  if (!limitCheck.allowed) return { error: limitCheck.message, status: 403 };

  const sentences = splitSentences(data.text);
  if (!sentences.length) return { error: "Không đọc được câu nào trong bài viết.", status: 400 };

  // (b) Gọi AI + parse + validate (khớp số câu, xem gradeWithRetry).
  const r = await gradeWithRetry({ level: data.level, industry: data.industry, task: data.task, sentences });
  if (!r || !r.ok) {
    if (r?.parseError) console.error("[grade_writing] parse error:", r.text?.slice(0, 500));
    return { error: r?.error || "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: r?.status || 502 };
  }
  const parsed = r.data;
  if (!isValidGradeShape(parsed, sentences.length)) {
    console.error("[grade_writing] validate FAIL sau retry — segments:", parsed?.segments?.length, "expected:", sentences.length);
    return { error: "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: 502 };
  }

  // Tự tính overall_score = tổng 5 tiêu chí (KHÔNG tin số "overall" nếu model có tự trả thêm —
  // schema không yêu cầu field đó nên model không có chỗ để trả sai, nhưng vẫn tính lại ở đây
  // cho chắc thay vì tin bất kỳ tổng nào từ model).
  const criteria = CRITERIA_DEFS.map((def) => {
    const c = parsed.criteria.find((x) => x.key === def.key);
    const score = Math.max(0, Math.min(20, Math.round(c.score)));
    return { key: def.key, label: def.label, score, comment: sanitizeComment(c.comment, "Đã rà soát tiêu chí này, chưa có nhận xét chi tiết.") };
  });
  const overallScore = criteria.reduce((sum, c) => sum + c.score, 0);
  const strengths = sanitizeComment(parsed.strengths, "Bài viết đã hoàn thành đủ các phần chính theo đề bài.");

  // segments: LUÔN dùng "text" từ câu gốc do CHÍNH server tách (không tin "text" model echo
  // lại) — đảm bảo Bước 5 hiển thị ĐÚNG NGUYÊN VĂN bài viết của học viên dù model có vô tình
  // sửa chữ nào khi echo lại.
  const segments = sentences.map((text, i) => {
    const s = parsed.segments[i];
    const base = { text, issue_type: s.issue_type };
    if (s.issue_type === "unnatural") base.replacement = (s.replacement || "").toString().trim() || text;
    if (s.issue_type === "improvable") base.suggestion = (s.suggestion || "").toString().trim() || text;
    return base;
  });

  const notices = [];
  const industryLabel = (data.industry || "").trim();
  if (industryLabel && parsed.industry_vocab_gap === true) {
    notices.push(`Bài viết chưa sử dụng nhiều từ vựng chuyên ngành ${industryLabel}.`);
  }
  if (parsed.structure_too_simple === true) {
    notices.push(`Phần lớn câu trong bài đang ở cấu trúc đơn giản hơn trình độ ${data.level} bạn đã chọn.`);
  }

  const saved = await insertWritingSubmission({
    user_id: ctx.studentId,
    level: data.level,
    industry: industryLabel || null,
    task: data.task,
    submitted_text: data.text,
    overall_score: overallScore,
    criteria,
    segments,
    notices,
  });
  if (!saved) return { error: "Chấm bài thành công nhưng lưu thất bại, vui lòng thử lại.", status: 502 };

  return {
    content: JSON.stringify({
      submission_id: saved.id,
      overall_score: overallScore,
      criteria,
      strengths,
      segments,
      notices,
      meta: buildMeta(r),
    }),
  };
}
