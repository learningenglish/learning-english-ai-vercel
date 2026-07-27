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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SUPABASE_URL } from "./_shared.js";
import { generateStructuredJSON } from "../_shared/aiProvider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VALID_LEVELS = ["A1", "A2", "B1", "B2", "C1"];

// ====== Danh sách chủ đề+thể loại CỐ ĐỊNH (chốt Minh 2026-07-27 lần 3) — THAY HẲN cơ chế "AI
// tự do chọn thể loại" trước đó (mở nhưng vẫn có thể trôi dạt/không kiểm soát được diện chủ
// đề). writingTopicPool.json nhóm theo 14 thể loại, mỗi thể loại 8 gợi ý chủ đề (112 mục),
// đúng tinh thần đã chốt: thực dụng đời sống/công việc, KHÔNG theo khuôn thi cử. Đọc 1 lần lúc
// module load (danh sách tĩnh, không đổi giữa các lượt gọi) — xem loadJSON() ở
// curriculum/skin.js cho tiền lệ pattern y hệt (fs.readFileSync + path.join(__dirname,...)).
const WRITING_TOPIC_POOL_BY_GENRE = JSON.parse(fs.readFileSync(path.join(__dirname, "writingTopicPool.json"), "utf8"));
const WRITING_TOPIC_POOL = Object.entries(WRITING_TOPIC_POOL_BY_GENRE).flatMap(([genre_vi, hints]) =>
  hints.map((topic_hint) => ({ genre_vi, topic_hint }))
);
// Số mục đưa vào 1 lượt prompt — không gửi cả 112 mục mỗi lần (tốn token vô ích), lấy mẫu ngẫu
// nhiên 1 tập con đủ đa dạng (trải nhiều thể loại) mỗi lượt, cộng với cơ chế loại thể loại gần
// đây (xem generate_writing_task) là đủ đảm bảo đa dạng thật qua nhiều lượt gọi liên tiếp.
const TOPIC_SAMPLE_SIZE = 18;

function sampleTopicPool(pool, size) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(size, shuffled.length));
}

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

async function logWritingTaskRequest(studentId, genre) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/writing_task_requests`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: studentId, genre: genre || null }),
    });
    if (!r.ok) console.error("logWritingTaskRequest error:", r.status, await r.text());
  } catch (e) {
    console.error("logWritingTaskRequest error:", e);
  }
}

// ====== Lịch sử thể loại đã giao — đọc 3-5 lượt GẦN NHẤT của CHÍNH người học này (kể cả lượt
// "Đổi đề khác" chưa từng viết/chấm — vẫn tính vì người học ĐÃ THẤY thể loại đó) để dặn model
// KHÔNG lặp lại. Thay cho GENRE_POOL cố định chọn ngẫu nhiên ở server (bản cũ) — Minh chốt
// 2026-07-27 lần 2: chủ đề/thể loại KHÔNG giới hạn, model được TỰ DO chọn, chỉ cấm lặp thể
// loại gần đây — đúng tinh thần "sổ điểm danh" (đã dùng gì rồi, không dùng gì tiếp theo)
// chứ không phải danh sách đóng để chọn máy móc.
async function getRecentGenres(studentId, limit = 5) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/writing_task_requests?user_id=eq.${studentId}&select=genre&order=created_at.desc&limit=${limit}`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return rows.map((row) => row.genre).filter(Boolean);
  } catch (e) {
    console.error("getRecentGenres error:", e);
    return [];
  }
}

// ====== Lời dẫn thông minh trong Bước 2 (Item 5, chốt Minh 2026-07-27 lần 3) — MỘT DÒNG bổ
// sung vào nội dung màn giao nhiệm vụ đã có sẵn (KHÔNG phải thông báo/popup riêng — đúng
// nguyên tắc "không tự động khơi mào ngoài luồng" đã áp dụng cho Mentor AI). "Chủ đề gần
// tương tự" ĐƯỢC NHÓM THEO THỂ LOẠI (genre_vi) — chủ đề CỤ THỂ (topic_en) do AI tự viết lại mỗi
// lần từ cùng 1 gợi ý trong pool nên gần như không bao giờ trùng chữ, không dùng được làm khoá
// nhóm; thể loại là 1 trong 14 giá trị CỐ ĐỊNH (WRITING_TOPIC_POOL), đã có sẵn trên cả
// writing_task_requests.genre lẫn writing_submissions.task->>genre_vi — khoá nhóm ổn định,
// không cần thêm cột/bảng nào.
async function getGenreScoreStats(studentId, genreVi, limit = 5) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/writing_submissions?user_id=eq.${studentId}&task->>genre_vi=eq.${encodeURIComponent(genreVi)}&select=overall_score&order=created_at.desc&limit=${limit}`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    if (!rows.length) return null;
    const avg = rows.reduce((sum, x) => sum + (x.overall_score || 0), 0) / rows.length;
    return { avg, count: rows.length };
  } catch (e) {
    console.error("getGenreScoreStats error:", e);
    return null;
  }
}

// KHÔNG suy diễn khi chưa có lịch sử ở thể loại này (return null -> frontend không hiện dòng
// nào, đúng nguyên tắc "Quy tắc Hiểu" đã áp dụng cho Mentor AI). Ngưỡng dùng LẠI đúng 2 mốc của
// SCORE_TIERS (70/50) cho nhất quán, gộp Khá+Giỏi thành 1 mức "cao" (Item 5 chỉ cần 3 sắc thái,
// không cần chia nhỏ như màn Kết quả).
function buildTopicNote(stats) {
  if (!stats) return null;
  if (stats.avg >= 70) return "Bạn đang làm khá tốt ở thể loại này — nhiệm vụ lần này để bạn phát huy tiếp.";
  if (stats.avg >= 50) return "Bạn có tiến bộ ở thể loại này, luyện thêm chút nữa sẽ tốt hơn.";
  return "Đây là thể loại bạn có thể luyện thêm — cứ thử sức, mỗi lần viết đều giúp bạn tiến bộ.";
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

// ====== PROMPT 1: generate_writing_task (Bước 1→2 — AI giao nhiệm vụ) ======
//
// LỊCH SỬ SỬA THỂ LOẠI/CHỦ ĐỀ (2026-07-27):
// - Bản 1: model "tự chọn thể loại đa dạng" hội tụ gần như LUÔN ra "email công việc".
// - Bản 2: server bốc 1 thể loại từ danh sách ĐÓNG 8 mục ép model theo — Minh chỉ ra đây là
//   "chọn máy móc", không phải KHÔNG GIỚI HẠN thật.
// - Bản 3: model lại TỰ DO chọn thể loại, chỉ cấm lặp lịch sử gần đây — sửa được vụ dồn email,
//   nhưng vẫn có thể trôi dạt chủ đề khó kiểm soát/không đảm bảo tính thực dụng.
// - Bản 4 (HIỆN TẠI, chốt Minh lần 3): quay lại danh sách ĐÓNG nhưng ĐỦ LỚN (112 mục, xem
//   WRITING_TOPIC_POOL ở đầu file) — model CHỌN 1 mục có sẵn (không tự bịa chủ đề mới), server
//   validate lựa chọn đó bằng "chosen_index" (không tin text model echo lại, đúng nguyên tắc đã
//   áp dụng cho "genre" và "segments"). Cơ chế chống lặp GIỮ NGUYÊN (loại thể loại 3-5 lượt gần
//   đây khỏi tập mẫu trước khi đưa vào prompt).
const TASK_SYSTEM_PROMPT = `Bạn là chuyên gia thiết kế đề bài luyện viết tiếng Anh cho người Việt, bám khung CEFR.

NHIỆM VỤ: Chọn ĐÚNG 1 mục trong danh sách "CÁC LỰA CHỌN" ở phần user prompt (KHÔNG tự bịa chủ đề/thể loại nào ngoài danh sách), rồi soạn thành 1 nhiệm vụ viết hoàn chỉnh phù hợp cấp độ CEFR của học viên.

QUY TẮC CHỌN MỤC:
- Chọn mục PHÙ HỢP NHẤT với Lĩnh vực đã cho (nếu có) — ưu tiên mục dễ gắn nội dung với lĩnh vực đó nhất trong danh sách (ví dụ lĩnh vực "Nhà hàng - Khách sạn" thì ưu tiên mục về đánh giá/báo cáo/email/mô tả liên quan dịch vụ, ăn uống, lưu trú hơn hẳn mục hoàn toàn không liên quan như "thiết lập điện thoại mới"). Nếu KHÔNG có Lĩnh vực, hoặc không có mục nào đặc biệt phù hợp, chọn tự do.
- Trả "chosen_index" là SỐ THỨ TỰ (bắt đầu từ 1) của mục bạn chọn trong danh sách.

QUY TẮC SOẠN NHIỆM VỤ TỪ MỤC ĐÃ CHỌN:
- "topic_en"/"topic_vi": viết đề bài CỤ THỂ dựa trên gợi ý chủ đề của mục đã chọn (KHÔNG chỉ dịch nguyên văn gợi ý — thêm chi tiết/tình huống cụ thể cho sinh động), ĐÚNG thể loại của mục đó.
- Nếu có Lĩnh vực: nội dung càng cụ thể gắn với lĩnh vực đó càng tốt.
- Độ khó đề bài (độ PHỨC TẠP yêu cầu, không phải độ dài) phải VỪA SỨC cấp độ: A1/A2 chỉ yêu cầu câu đơn giản, chủ đề gần gũi đời thường; B1 trở lên có thể yêu cầu cấu trúc rõ ràng, nhiều ý hơn.
- "goals": 2-4 gạch đầu dòng ngắn (tiếng Việt), mục tiêu CỤ THỂ bài viết cần đạt được (không chung chung kiểu "viết hay").
- "structure": các bước/phần nên có trong bài, 3-5 phần, MỖI phần có nhãn tiếng Anh ngắn (1-2 từ) + nhãn tiếng Việt giải thích ngắn trong ngoặc.
- "vocabulary_suggestions": 5-8 từ/cụm từ tiếng Anh HỮU ÍCH để viết đúng chủ đề này, đúng cấp độ, mỗi từ kèm nghĩa tiếng Việt ngắn — đây là GỢI Ý không bắt buộc dùng, không phải danh sách đánh giá.
- "useful_phrases": 4-6 cụm/mẫu câu tiếng Anh THÔNG DỤNG phù hợp thể loại + chủ đề này, đúng cấp độ, mỗi cụm kèm nghĩa/công dụng ngắn tiếng Việt.

QUY TẮC ĐẦU RA: Trả về DUY NHẤT một khối JSON hợp lệ theo schema. Không lời chào, không giải thích, không bọc trong dấu \`\`\`.

SCHEMA JSON:
{
  "chosen_index": 1,
  "topic_en": "câu đề bài bằng tiếng Anh, 1 câu ngắn gọn rõ ràng",
  "topic_vi": "dịch/mô tả câu đề bài bằng tiếng Việt",
  "goals": ["mục tiêu 1", "mục tiêu 2"],
  "structure": [{"label": "Greeting", "label_vi": "Lời chào"}],
  "vocabulary_suggestions": [{"word": "delay", "meaning": "sự chậm trễ"}],
  "useful_phrases": [{"phrase": "I'm writing to inform you that...", "meaning": "Dùng để mở đầu email báo tin"}]
}`;

function buildTaskUserPrompt(level, industry, sampledPool) {
  const optionsText = sampledPool.map((o, i) => `${i + 1}. [${o.genre_vi}] ${o.topic_hint}`).join("\n");
  return `Cấp độ CEFR của học viên: ${level}
Lĩnh vực: ${orNone(industry)}

CÁC LỰA CHỌN (chọn ĐÚNG 1 mục, trả lại đúng số thứ tự vào "chosen_index"):
${optionsText}`;
}

// ====== PROMPT 2: grade_writing (Bước 3→4→5 — AI chấm + đánh dấu) ======
// GHI CHÚ TÁCH LƯỢT (2026-07-27, chốt "phân luồng theo điểm"): "clean_rewrite" TỪNG nằm
// chung schema này (Việc 2) — nay TÁCH RA 2 prompt riêng (CLEAN_REWRITE_SYSTEM_PROMPT/
// REFERENCE_ESSAY_SYSTEM_PROMPT bên dưới), CHỈ gọi lượt 2 SAU KHI biết điểm+mức (server không
// thể biết trước mức Khá/Giỏi cần "Bài viết hoàn chỉnh" hay mức Trung bình cần "Bài tham khảo"
// nếu chưa chấm xong) — mức Yếu KHÔNG gọi lượt 2 nào cả, tiết kiệm phí thật cho nhóm bài yếu
// nhất (thường đông nhất). Vẫn là 1 action grade_writing DUY NHẤT phía client, chỉ nội bộ
// server gọi AI tối đa 2 lượt tuần tự thay vì 1.
const GRADE_SYSTEM_PROMPT = `Bạn là giám khảo chấm bài viết tiếng Anh cho người Việt học theo khung CEFR.

NHIỆM VỤ: Chấm bài viết của học viên dựa trên đề bài đã giao, theo ĐÚNG cấp độ CEFR của học viên.

QUY TẮC CHẤM 5 TIÊU CHÍ (mỗi tiêu chí thang điểm NGUYÊN 0-20, tổng tối đa 100):
1. "organization" (Bố cục): bài có mở đầu/thân bài/kết đúng cấu trúc phù hợp thể loại này không.
2. "vocabulary" (Từ vựng): từ vựng phong phú, đúng ngữ cảnh, đúng cấp độ; NẾU có lĩnh vực chuyên ngành được cho, xét thêm mức độ dùng từ chuyên ngành đó.
3. "grammar" (Ngữ pháp + cấu trúc câu): đúng ngữ pháp, cấu trúc câu phù hợp cấp độ.
4. "coherence" (Mạch lạc): các câu/đoạn liên kết logic, dùng từ nối hợp lý, không rời rạc.
5. "task_genre" (Đúng thể loại / không lạc đề): bài có bám đúng đề bài, đúng mục tiêu, đúng thể loại đã giao không. NẾU bài viết LẠC ĐỀ RÕ RÀNG (nội dung không liên quan gì tới đề bài đã giao, hoặc hoàn toàn không đáp ứng bất kỳ mục tiêu nào) — BẮT BUỘC cho ĐÚNG 0 điểm ở tiêu chí này, KHÔNG cho điểm an ủi/châm chước. Chỉ trừ điểm một phần (không phải 0) nếu bài CÓ bám đề bài nhưng chưa đầy đủ/chưa đúng thể loại hoàn toàn.
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

// ====== PROMPT 3: "Bài viết hoàn chỉnh" (clean_rewrite) — CHỈ gọi cho mức Khá/Giỏi ======
const CLEAN_REWRITE_SYSTEM_PROMPT = `Bạn là chuyên gia viết mẫu tiếng Anh cho người Việt học theo khung CEFR.

NHIỆM VỤ: Viết lại HOÀN CHỈNH bài viết của học viên thành bài MẪU chuyên nghiệp để đối chiếu.

QUY TẮC "clean_rewrite":
- Viết lại HOÀN TOÀN bài viết dựa ĐÚNG trên nội dung/ý học viên đã viết — KHÔNG đổi ý, KHÔNG thêm ý mới ngoài những gì học viên đã đề cập, KHÔNG bớt ý đã có, chỉ nâng cấp CÁCH DIỄN ĐẠT.
- GIỮ NGUYÊN đúng BỐI CẢNH/SỰ VIỆC/ĐỐI TƯỢNG cụ thể học viên đã kể (ví dụ bài gốc kể về một chỗ Ở/khách sạn thì bài viết lại VẪN PHẢI về chỗ ở/khách sạn đó) — TUYỆT ĐỐI KHÔNG tự đổi sang đối tượng/tình huống khác dù nó có vẻ khớp thể loại đề bài hơn (ví dụ KHÔNG được biến "chỗ ở tôi từng ngủ lại" thành "nhà hàng tôi từng ăn" chỉ vì đề bài yêu cầu thể loại đánh giá nhà hàng — nếu học viên viết lạc đề, đó là điều PHẢN ÁNH ĐÚNG thực tế bài làm, không phải lỗi để bạn tự sửa bằng cách đổi nội dung).
- Sửa hết mọi câu đã đánh dấu "unnatural" (dùng đúng bản "replacement"), áp dụng bản "suggestion" cho mọi câu "improvable" (KHÔNG giữ lại cách viết gốc chưa tối ưu của câu đó).
- NẾU có Lĩnh vực chuyên ngành VÀ "industry_vocab_gap" = true: BẮT BUỘC chèn TỰ NHIÊN ít nhất 2-4 từ/cụm từ CHUYÊN NGÀNH THẬT SỰ (không phải từ chung chung như "place", "staff", "food", "room" — phải là thuật ngữ chuyên ngành cụ thể, ví dụ lĩnh vực Nhà hàng - Khách sạn: "front desk", "check-in/check-out", "amenities", "concierge", "housekeeping", "room service") vào đúng chỗ hợp lý, KHÔNG gượng ép, VẪN đúng bối cảnh học viên đã kể (xem quy tắc GIỮ NGUYÊN BỐI CẢNH ở trên). Nếu "industry_vocab_gap" = false (bài gốc đã đủ từ chuyên ngành) thì không cần thêm gì, giữ nguyên mức dùng đã có.
- Ngữ pháp, cấu trúc câu ĐÚNG TẦM cấp độ CEFR đã cho — không quá đơn giản (dưới tầm cấp độ), không quá phức tạp (vượt tầm cấp độ).
- Vẫn phải bám đúng mục tiêu ("goals") của đề bài đã giao.
- Đây là bài viết như người bản xứ thành thạo, đúng cấp độ sẽ viết — KHÔNG lặp lại lỗi hay cách diễn đạt còn hạn chế của bản gốc.
- Trả về liền mạch dạng văn xuôi bình thường — KHÔNG chèn bất kỳ ký hiệu đánh dấu nào (không gạch ngang, không in đậm, không ngoặc chú thích).

QUY TẮC "clean_rewrite_vocab" (chỉ liệt kê khi có Lĩnh vực chuyên ngành, để mảng rỗng nếu không có):
- CHỈ liệt kê từ/cụm từ CHUYÊN NGÀNH thực sự XUẤT HIỆN trong "clean_rewrite" — không liệt kê từ vựng phổ thông. Phép thử: một người học tiếng Anh BÌNH THƯỜNG (không làm trong lĩnh vực này) có khả năng CHƯA từng gặp từ/cụm này không? Nếu KHÔNG (từ đó ai học tiếng Anh cũng biết, vd "spacious", "excellent", "assistance") thì KHÔNG được liệt kê, dù nghe "hay" hay "nâng cấp" tới đâu — chỉ liệt kê thuật ngữ THẬT SỰ đặc trưng của lĩnh vực đó. NẾU "industry_vocab_gap" = true, mảng này KHÔNG ĐƯỢC RỖNG (phải khớp với các từ chuyên ngành bạn vừa chèn vào theo quy tắc trên). Mỗi mục PHẢI là object {"word","meaning"}, KHÔNG được là chuỗi thô.

QUY TẮC "clean_rewrite_patterns" (CHỌN LỌC — dùng ĐÚNG tinh thần chọn "sentence_patterns" của bài học thông thường, KHÔNG liệt kê tràn lan):
- CHỈ chọn cấu trúc/khuôn câu THỰC SỰ đáng học lại, PHẢI xuất hiện nguyên văn trong "clean_rewrite", KHÁC cách viết gốc của học viên, ĐÚNG TẦM cấp độ CEFR đã cho (không quá cơ bản, không quá xa tầm). Đây là phép thử NĂNG LỰC PHÁN ĐOÁN — "why_worth_it" phải là lý do THẬT, nếu không nghĩ ra lý do thuyết phục thì BỎ QUA khuôn đó, KHÔNG hạ chuẩn để đủ số lượng. Số lượng: 2-5 mục — bài ít cấu trúc đáng chú ý thì cứ để 2, không cố nhồi.

QUY TẮC ĐẦU RA: Trả về DUY NHẤT một khối JSON hợp lệ theo schema. Không lời chào, không giải thích, không bọc trong dấu \`\`\`.

SCHEMA JSON:
{
  "clean_rewrite": "bản viết lại hoàn chỉnh, liền mạch, không ký hiệu đánh dấu",
  "clean_rewrite_vocab": [{"word": "delay", "meaning": "sự chậm trễ"}],
  "clean_rewrite_patterns": [
    {"structure": "I would like to request...", "example": "trích NGUYÊN VĂN câu chứa cấu trúc này từ clean_rewrite", "note": "1 câu tiếng Việt: dùng để làm gì trong giao tiếp thực tế", "why_worth_it": "1 câu tiếng Việt: tại sao đáng học lại ở đúng cấp độ này"}
  ]
}`;

// ====== PROMPT 4: "Bài tham khảo" — CHỈ gọi cho mức Trung bình. KHÁC HẲN clean_rewrite: viết
// MỚI HOÀN TOÀN cho cùng đề bài, KHÔNG dựa trên nội dung/ý học viên đã viết (mục đích: cho
// người còn yếu thấy "1 bài đúng chuẩn nên viết từ đầu ra sao", thay vì nâng cấp 1 bài còn
// nhiều lỗ hổng cấu trúc). Không cần 2 tab vocab/pattern như clean_rewrite. ======
const REFERENCE_ESSAY_SYSTEM_PROMPT = `Bạn là chuyên gia viết mẫu tiếng Anh cho người Việt học theo khung CEFR.

NHIỆM VỤ: Viết 1 bài MẪU HOÀN TOÀN MỚI cho đề bài đã giao, đúng cấp độ CEFR của học viên — bài này KHÔNG dựa trên bất kỳ nội dung nào học viên đã viết trước đó, bạn TỰ NGHĨ RA nội dung phù hợp đề bài.

QUY TẮC:
- Bám sát đúng đề bài, mục tiêu ("goals"), thể loại, cấu trúc gợi ý đã giao.
- Nội dung do BẠN tự nghĩ ra, thực tế, mạch lạc, đúng thể loại.
- NẾU có Lĩnh vực chuyên ngành: dùng TỰ NHIÊN một vài từ/cụm từ chuyên ngành thật sự đặc trưng của lĩnh vực đó (không phải từ chung chung).
- Ngữ pháp, cấu trúc câu, độ dài ĐÚNG TẦM cấp độ CEFR đã cho.
- Đây là bài chuẩn để người học ở mức còn hạn chế THAM KHẢO cách triển khai 1 bài đúng chuẩn từ đầu — viết như người bản xứ thành thạo, đúng cấp độ sẽ viết.
- Trả về liền mạch dạng văn xuôi bình thường — KHÔNG chèn ký hiệu đánh dấu nào.

QUY TẮC ĐẦU RA: Trả về DUY NHẤT một khối JSON hợp lệ theo schema. Không lời chào, không giải thích, không bọc trong dấu \`\`\`.

SCHEMA JSON:
{ "reference_essay": "bài mẫu hoàn toàn mới, liền mạch, không ký hiệu đánh dấu" }`;

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

// ====== Thang điểm & phân luồng hiển thị (chốt Minh 2026-07-27 lần 3) — mốc chia TỰ CHỌN dựa
// trên phân phối điểm THẬT quan sát được qua các lượt test trước đó (dải 40-81/100 với các bài
// có lỗi rõ tới bài khá sạch, 40 là 1 bài LẠC ĐỀ rõ ràng — đúng dự kiến rơi mức Yếu). Băng
// 0-49/50-69/70-84/85-100 tương ứng Yếu/Trung bình/Khá/Giỏi, giống trực giác thang điểm quen
// thuộc (D/C/B/A) — KHÔNG có ngưỡng nào đặc biệt cho "lạc đề", nó tự rơi vào Yếu qua công thức
// tính điểm bình thường (task_genre=0 kéo tổng xuống thấp tự nhiên, xem QUY TẮC CHẤM 5 TIÊU
// CHÍ mục 5 trong GRADE_SYSTEM_PROMPT).
const SCORE_TIERS = [
  { key: "weak", label: "Yếu", min: 0, max: 49 },
  { key: "average", label: "Trung bình", min: 50, max: 69 },
  { key: "good", label: "Khá", min: 70, max: 84 },
  { key: "excellent", label: "Giỏi", min: 85, max: 100 },
];

function scoreTier(overallScore) {
  return SCORE_TIERS.find((t) => overallScore >= t.min && overallScore <= t.max) || SCORE_TIERS[0];
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
      maxTokens: 4800, // chỉ criteria+segments+strengths (clean_rewrite tách sang lượt 2 riêng, xem CLEAN_REWRITE_SYSTEM_PROMPT).
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

function buildCleanRewriteUserPrompt({ level, industry, task, segments, industryVocabGap }) {
  const numberedSegments = segments
    .map((s, i) => `${i + 1}. [${s.issue_type}] "${s.text}"${s.issue_type === "unnatural" ? ` → gợi ý sửa: "${s.replacement}"` : ""}${s.issue_type === "improvable" ? ` → gợi ý cải thiện: "${s.suggestion}"` : ""}`)
    .join("\n");
  return `Đề bài đã giao:
- Chủ đề (tiếng Anh): ${task?.topic_en || "không có"}
- Thể loại: ${task?.genre_vi || "không có"}
- Mục tiêu bài viết: ${Array.isArray(task?.goals) ? task.goals.join("; ") : "không có"}

Thông tin học viên:
- Cấp độ CEFR: ${level}
- Lĩnh vực chuyên ngành: ${orNone(industry)}
- industry_vocab_gap: ${industryVocabGap}

Bài viết gốc của học viên đã chấm theo từng câu (dùng để viết lại):
${numberedSegments}

Viết lại theo đúng quy tắc đã nêu ở trên.`;
}

async function generateCleanRewrite({ level, industry, task, segments, industryVocabGap }) {
  const userPrompt = buildCleanRewriteUserPrompt({ level, industry, task, segments, industryVocabGap });
  function isValid(p) {
    return !!(
      p &&
      typeof p.clean_rewrite === "string" &&
      p.clean_rewrite.trim() &&
      (p.clean_rewrite_vocab === undefined || Array.isArray(p.clean_rewrite_vocab)) &&
      (p.clean_rewrite_patterns === undefined || Array.isArray(p.clean_rewrite_patterns))
    );
  }
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await generateStructuredJSON({
      maxTokens: 2500,
      temperature: 0.6,
      messages: [
        { role: "system", content: CLEAN_REWRITE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    last = r;
    if (r.ok && isValid(r.data)) return r;
  }
  return last;
}

function buildReferenceEssayUserPrompt({ level, industry, task }) {
  return `Đề bài đã giao:
- Chủ đề (tiếng Anh): ${task?.topic_en || "không có"}
- Mô tả tiếng Việt: ${task?.topic_vi || "không có"}
- Thể loại: ${task?.genre_vi || "không có"}
- Mục tiêu bài viết: ${Array.isArray(task?.goals) ? task.goals.join("; ") : "không có"}
- Cấu trúc gợi ý: ${Array.isArray(task?.structure) ? task.structure.map((s) => s.label).join(" → ") : "không có"}

Cấp độ CEFR của học viên: ${level}
Lĩnh vực chuyên ngành: ${orNone(industry)}

Viết bài mẫu MỚI HOÀN TOÀN theo đúng quy tắc đã nêu ở trên.`;
}

async function generateReferenceEssay({ level, industry, task }) {
  const userPrompt = buildReferenceEssayUserPrompt({ level, industry, task });
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await generateStructuredJSON({
      maxTokens: 1500,
      temperature: 0.7,
      messages: [
        { role: "system", content: REFERENCE_ESSAY_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    last = r;
    if (r.ok && typeof r.data?.reference_essay === "string" && r.data.reference_essay.trim()) return r;
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

  // Loại các thể loại đã giao 3-5 lượt gần đây khỏi tập mẫu TRƯỚC KHI đưa vào prompt — chặn ở
  // NGUỒN (model không có cơ hội chọn lại dù có muốn) thay vì chỉ dặn+kiểm tra sau, mạnh hơn
  // hẳn cách "dặn rồi hy vọng" của bản trước.
  const recentGenres = await getRecentGenres(ctx.studentId, 5);
  const recentGenresNorm = new Set(recentGenres.map((g) => (g || "").trim().toLowerCase()));
  const eligiblePool = WRITING_TOPIC_POOL.filter((o) => !recentGenresNorm.has(o.genre_vi.trim().toLowerCase()));
  const sampledPool = sampleTopicPool(eligiblePool.length ? eligiblePool : WRITING_TOPIC_POOL, TOPIC_SAMPLE_SIZE);

  function isValidTaskShape(p) {
    const idx = Number(p?.chosen_index);
    return !!(
      Number.isInteger(idx) &&
      idx >= 1 &&
      idx <= sampledPool.length &&
      p?.topic_en &&
      p?.topic_vi &&
      Array.isArray(p.goals) &&
      Array.isArray(p.structure)
    );
  }

  // Gọi AI + tự retry TỐI ĐA 1 LẦN nếu "chosen_index" thiếu/ngoài phạm vi (lưới chắn, giống
  // gradeWithRetry() cho số lượng segments).
  let r, parsed;
  for (let attempt = 0; attempt < 2; attempt++) {
    const userPrompt =
      attempt === 0
        ? buildTaskUserPrompt(data.level, data.industry, sampledPool)
        : `${buildTaskUserPrompt(data.level, data.industry, sampledPool)}\n\nLƯU Ý: Lượt trước "chosen_index" bị thiếu hoặc ngoài phạm vi 1-${sampledPool.length} — lần này PHẢI trả về đúng 1 số nguyên trong khoảng đó, ứng với ĐÚNG 1 mục trong danh sách.`;
    r = await generateStructuredJSON({
      maxTokens: 1600, // topic+goals+structure+vocabulary_suggestions+useful_phrases cộng lại ~500-700 token thật, chừa biên an toàn.
      temperature: 0.8, // chủ đề CỤ THỂ hoá từ gợi ý cần đa dạng giữa các lần gọi (bản thân việc CHỌN mục đã do sampleTopicPool() đảm bảo ngẫu nhiên, nhiệt độ ở đây chủ yếu ảnh hưởng cách viết topic_en/topic_vi cụ thể).
      messages: [
        { role: "system", content: TASK_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    if (!r.ok) break;
    parsed = r.data;
    if (isValidTaskShape(parsed)) break;
  }
  if (!r.ok) {
    if (r.parseError) console.error("[generate_writing_task] parse error:", r.text?.slice(0, 500));
    return { error: r.error || "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: r.status || 502 };
  }
  if (!isValidTaskShape(parsed)) {
    console.error("[generate_writing_task] invalid shape:", JSON.stringify(parsed).slice(0, 500));
    return { error: "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: 502 };
  }
  // "genre_vi" LUÔN lấy từ mục ĐÃ CHỌN trong sampledPool (nguồn chân lý ở server) — KHÔNG tin
  // model tự ghi lại tên thể loại, đúng nguyên tắc đã áp dụng cho segments/task ở nơi khác.
  const chosenEntry = sampledPool[Number(parsed.chosen_index) - 1];

  // PHẢI await (không fire-and-forget) — đây là Serverless Function, tiến trình có thể bị
  // đóng băng/dừng NGAY sau khi response được trả về, insert chưa kịp chạy xong sẽ mất đếm/lịch sử.
  await logWritingTaskRequest(ctx.studentId, chosenEntry.genre_vi);

  // Item 5 — lời dẫn thông minh (KHÔNG chặn/làm chậm response nếu lỗi, chỉ là gia vị thêm vào
  // nội dung Bước 2 đã có, không phải phần bắt buộc của luồng).
  const genreStats = await getGenreScoreStats(ctx.studentId, chosenEntry.genre_vi).catch(() => null);
  const topicNote = buildTopicNote(genreStats);

  const [minWords, maxWords] = WRITING_LENGTH_TABLE[data.level] || [90, 150];
  return {
    content: JSON.stringify({
      task: {
        topic_en: parsed.topic_en,
        topic_vi: parsed.topic_vi,
        genre_vi: chosenEntry.genre_vi,
        goals: parsed.goals,
        structure: parsed.structure,
        vocabulary_suggestions: Array.isArray(parsed.vocabulary_suggestions) ? parsed.vocabulary_suggestions : [],
        useful_phrases: Array.isArray(parsed.useful_phrases) ? parsed.useful_phrases : [],
        topic_note: topicNote,
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

  // Phân luồng theo mức điểm (chốt Minh 2026-07-27 lần 3, xem SCORE_TIERS) — QUYẾT ĐỊNH lượt
  // gọi AI THỨ 2 (nếu có) chỉ SAU KHI biết điểm, không gọi thừa cho mức không cần:
  // Khá/Giỏi -> "Bài viết hoàn chỉnh" (dựa bài học viên, có vocab/patterns chọn lọc).
  // Trung bình -> "Bài tham khảo" (viết MỚI HOÀN TOÀN, không dựa bài học viên).
  // Yếu -> KHÔNG gọi gì thêm (tiết kiệm phí — mức thường đông người mới nhất).
  const tier = scoreTier(overallScore);
  let cleanRewrite = null;
  let referenceEssay = null;
  let secondCallMeta = null;
  if (tier.key === "good" || tier.key === "excellent") {
    const r2 = await generateCleanRewrite({
      level: data.level,
      industry: data.industry,
      task: data.task,
      segments,
      industryVocabGap: parsed.industry_vocab_gap === true,
    });
    if (r2?.ok) {
      const p2 = r2.data;
      // Model đôi lúc trả "clean_rewrite_vocab" là mảng CHUỖI thô thay vì {word,meaning} dù
      // schema đã ghi rõ — chuẩn hoá phòng thủ thay vì bắt retry cả lượt chỉ vì lệch 1 field phụ.
      cleanRewrite = {
        text: p2.clean_rewrite.trim(),
        vocab: (Array.isArray(p2.clean_rewrite_vocab) ? p2.clean_rewrite_vocab : [])
          .map((v) => (typeof v === "string" ? { word: v, meaning: "" } : { word: v?.word || "", meaning: v?.meaning || "" }))
          .filter((v) => v.word),
        patterns: Array.isArray(p2.clean_rewrite_patterns) ? p2.clean_rewrite_patterns : [],
      };
      secondCallMeta = buildMeta(r2);
    } else {
      console.error("[grade_writing] clean_rewrite generation failed:", r2?.error || (r2?.parseError && "parseError"));
    }
  } else if (tier.key === "average") {
    const r2 = await generateReferenceEssay({ level: data.level, industry: data.industry, task: data.task });
    if (r2?.ok) {
      referenceEssay = { text: r2.data.reference_essay.trim() };
      secondCallMeta = buildMeta(r2);
    } else {
      console.error("[grade_writing] reference_essay generation failed:", r2?.error || (r2?.parseError && "parseError"));
    }
  }

  // Lưu ĐẦY ĐỦ vào DB bất kể mức điểm (dữ liệu lịch sử — hữu ích sau này dù bản thân lượt này
  // không hiển thị hết cho người học) — CHỈ phản hồi trả về CLIENT mới bị gọn theo mức
  // (segments/strengths ẩn ở mức Yếu, xem bên dưới).
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

  const isWeak = tier.key === "weak";
  return {
    content: JSON.stringify({
      submission_id: saved.id,
      overall_score: overallScore,
      tier: tier.key,
      tier_label: tier.label,
      criteria,
      strengths: isWeak ? null : strengths,
      segments: isWeak ? null : segments,
      weak_message: isWeak ? "Bài viết cần luyện thêm ở kỹ năng này trước khi xem chi tiết từng câu — thử lại với 1 bài mới nhé." : null,
      notices,
      clean_rewrite: cleanRewrite,
      reference_essay: referenceEssay,
      meta: secondCallMeta ? { grade: buildMeta(r), second_call: secondCallMeta } : buildMeta(r),
    }),
  };
}

// ====== "Lưu vào Yêu thích" (Việc 3 gốc + Item 7, xem supabase/028_writing_favorites.sql) ======
async function insertWritingFavorite(row) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/writing_favorites`, {
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
      console.error("insert writing_favorites error:", r.status, await r.text());
      return null;
    }
    const rows = await r.json();
    return rows?.[0] || null;
  } catch (e) {
    console.error("insertWritingFavorite error:", e);
    return null;
  }
}

// data.kind: "detailed" (bài đã sửa — chi tiết theo câu) | "complete" (bài hoàn chỉnh/tham
// khảo — cần thêm data.variant: "clean_rewrite" | "reference_essay"). Không gọi AI, không tính
// vào hạn mức/ngày (thuần lưu trữ 1 lần đã có sẵn dữ liệu từ lượt chấm/giao đề trước đó).
export async function save_writing_favorite(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!["detailed", "complete"].includes(data.kind)) return { error: "Thiếu hoặc sai 'kind'.", status: 400 };
  if (data.kind === "complete" && !["clean_rewrite", "reference_essay"].includes(data.variant)) {
    return { error: "Thiếu hoặc sai 'variant'.", status: 400 };
  }
  if (!VALID_LEVELS.includes(data.level)) return { error: "Thiếu hoặc sai 'level'.", status: 400 };
  if (!data.task || typeof data.task !== "object") return { error: "Thiếu đề bài.", status: 400 };
  if (!data.content || typeof data.content !== "object") return { error: "Thiếu nội dung.", status: 400 };

  const saved = await insertWritingFavorite({
    user_id: ctx.studentId,
    kind: data.kind,
    variant: data.kind === "complete" ? data.variant : null,
    level: data.level,
    industry: (data.industry || "").trim() || null,
    task: data.task,
    overall_score: Number.isFinite(data.overall_score) ? data.overall_score : null,
    content: data.content,
  });
  if (!saved) return { error: "Lưu thất bại, vui lòng thử lại.", status: 502 };

  return { content: JSON.stringify({ favorite: saved }) };
}
