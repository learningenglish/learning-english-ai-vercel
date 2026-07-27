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
//
// LỊCH SỬ SỬA THỂ LOẠI (2026-07-27):
// - Bản đầu: để model "tự chọn thể loại đa dạng" (dù dặn trong prompt + temperature 0.9) hội
//   tụ gần như LUÔN ra "email công việc" — email vừa được liệt kê ĐẦU TIÊN trong ví dụ, vừa
//   được nêu tên riêng ở câu quy tắc B1+, model bám lấy ví dụ quen thuộc nhất thay vì thực sự
//   đa dạng hoá.
// - Bản 2 (đã THAY): server tự bốc 1 thể loại từ danh sách ĐÓNG 8 mục, ép model theo đúng thể
//   loại đó — chữa được triệu chứng nhưng Minh chỉ ra đây là "chọn máy móc" theo danh sách
//   đóng, không phải chủ đề/thể loại THỰC SỰ không giới hạn.
// - Bản 3 (HIỆN TẠI): model lại được TỰ DO chọn thể loại (không giới hạn ở bất kỳ danh sách
//   nào) — cơ chế chống lặp là ĐỌC LỊCH SỬ THẬT 3-5 lượt gần nhất của CHÍNH người học đó
//   (getRecentGenres(), bảng writing_task_requests.genre) và cấm chọn lại thể loại đã dùng gần
//   đây, thay vì random hoá nhân tạo ở server. Danh sách trong prompt bên dưới CHỈ LÀ VÍ DỤ
//   MINH HOẠ phạm vi rộng, không phải danh sách để chọn máy móc.
const TASK_SYSTEM_PROMPT = `Bạn là chuyên gia thiết kế đề bài luyện viết tiếng Anh cho người Việt, bám khung CEFR.

NHIỆM VỤ: Giao 1 đề bài viết phù hợp cấp độ CEFR của học viên. Chủ đề và thể loại viết KHÔNG BỊ GIỚI HẠN — bạn tự quyết định thể loại nào phù hợp nhất cho lượt này, miễn tuân đúng các quy tắc dưới đây.

QUY TẮC CHỌN THỂ LOẠI:
- Bạn được TỰ DO chọn bất kỳ thể loại viết THỰC DỤNG nào gắn với đời sống/công việc thật. Ví dụ MINH HOẠ phạm vi rộng (đây CHỈ LÀ VÍ DỤ để hình dung, KHÔNG PHẢI danh sách đóng, KHÔNG bắt buộc chọn trong đây — hoàn toàn có thể chọn thể loại thực dụng khác miễn hợp lý): nghị luận, phân tích, đánh giá/review, kể chuyện, viết thư, báo cáo, email, tin nhắn, mô tả, hướng dẫn, bài đăng mạng xã hội, thư ngỏ, ghi chú, tường thuật sự việc...
- BẮT BUỘC chọn thể loại KHÁC với các thể loại đã giao GẦN ĐÂY cho CHÍNH người học này — xem danh sách "Thể loại đã giao gần đây" ở dưới, tuyệt đối không chọn lại bất kỳ thể loại nào trong danh sách đó lần này (kể cả khi Lĩnh vực giống nhau).
- CẤM mô phỏng đề thi: KHÔNG viết theo cấu trúc bài luận thi cử kiểu IELTS Writing Task 2 (không "For and against", không "Advantages and disadvantages", không thư kiến nghị/complaint letter theo khuôn ôn thi chuẩn). Đề bài phải là một TÌNH HUỐNG THỰC DỤNG người học thực sự có thể gặp trong đời sống/công việc, không phải bài tập mô phỏng kỳ thi.

QUY TẮC KHÁC:
- Nếu có Lĩnh vực: NỘI DUNG chủ đề phải gắn trực tiếp với lĩnh vực đó (ví dụ lĩnh vực "Nhà hàng - Khách sạn" + thể loại tự chọn là "đánh giá" → đánh giá một trải nghiệm tại nhà hàng/khách sạn) — thể loại vẫn chọn tự do theo 2 quy tắc trên, chỉ nội dung phải bám lĩnh vực.
- Nếu KHÔNG có Lĩnh vực: chọn 1 chủ đề đời thường phù hợp thể loại đã chọn.
- Độ khó đề bài (độ PHỨC TẠP yêu cầu, không phải độ dài) phải VỪA SỨC cấp độ: A1/A2 chỉ yêu cầu câu đơn giản, chủ đề gần gũi đời thường; B1 trở lên có thể yêu cầu cấu trúc rõ ràng, nhiều ý hơn.
- "genre_vi": tên thể loại BẠN vừa chọn, ngắn gọn tiếng Việt (2-4 từ).
- "goals": 2-4 gạch đầu dòng ngắn (tiếng Việt), mục tiêu CỤ THỂ bài viết cần đạt được (không chung chung kiểu "viết hay").
- "structure": các bước/phần nên có trong bài, 3-5 phần, MỖI phần có nhãn tiếng Anh ngắn (1-2 từ) + nhãn tiếng Việt giải thích ngắn trong ngoặc.
- "vocabulary_suggestions": 5-8 từ/cụm từ tiếng Anh HỮU ÍCH để viết đúng chủ đề này, đúng cấp độ, mỗi từ kèm nghĩa tiếng Việt ngắn — đây là GỢI Ý không bắt buộc dùng, không phải danh sách đánh giá.
- "useful_phrases": 4-6 cụm/mẫu câu tiếng Anh THÔNG DỤNG phù hợp thể loại + chủ đề này, đúng cấp độ, mỗi cụm kèm nghĩa/công dụng ngắn tiếng Việt.

QUY TẮC ĐẦU RA: Trả về DUY NHẤT một khối JSON hợp lệ theo schema. Không lời chào, không giải thích, không bọc trong dấu \`\`\`.

SCHEMA JSON:
{
  "topic_en": "câu đề bài bằng tiếng Anh, 1 câu ngắn gọn rõ ràng",
  "topic_vi": "dịch/mô tả câu đề bài bằng tiếng Việt",
  "genre_vi": "tên thể loại bạn vừa chọn, ngắn gọn tiếng Việt",
  "goals": ["mục tiêu 1", "mục tiêu 2"],
  "structure": [{"label": "Greeting", "label_vi": "Lời chào"}],
  "vocabulary_suggestions": [{"word": "delay", "meaning": "sự chậm trễ"}],
  "useful_phrases": [{"phrase": "I'm writing to inform you that...", "meaning": "Dùng để mở đầu email báo tin"}]
}`;

function buildTaskUserPrompt(level, industry, recentGenres) {
  return `Cấp độ CEFR của học viên: ${level}
Lĩnh vực: ${orNone(industry)}
Thể loại đã giao gần đây cho người học này (KHÔNG được chọn lại bất kỳ thể loại nào trong danh sách này lần này): ${recentGenres.length ? recentGenres.join(", ") : "chưa có lịch sử, được chọn tự do"}`;
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

QUY TẮC "clean_rewrite" (bài viết hoàn chỉnh — bài MẪU chuyên nghiệp để học viên đối chiếu):
- Viết lại HOÀN TOÀN bài viết dựa ĐÚNG trên nội dung/ý học viên đã viết — KHÔNG đổi ý, KHÔNG thêm ý mới ngoài những gì học viên đã đề cập, KHÔNG bớt ý đã có, chỉ nâng cấp CÁCH DIỄN ĐẠT.
- GIỮ NGUYÊN đúng BỐI CẢNH/SỰ VIỆC/ĐỐI TƯỢNG cụ thể học viên đã kể (ví dụ bài gốc kể về một chỗ Ở/khách sạn thì bài viết lại VẪN PHẢI về chỗ ở/khách sạn đó) — TUYỆT ĐỐI KHÔNG tự đổi sang đối tượng/tình huống khác dù nó có vẻ khớp thể loại đề bài hơn (ví dụ KHÔNG được biến "chỗ ở tôi từng ngủ lại" thành "nhà hàng tôi từng ăn" chỉ vì đề bài yêu cầu thể loại đánh giá nhà hàng — nếu học viên viết lạc đề, đó là điều PHẢN ÁNH ĐÚNG thực tế bài làm, không phải lỗi để bạn tự sửa bằng cách đổi nội dung).
- Sửa hết mọi câu đã đánh dấu "unnatural" (dùng đúng bản "replacement"), áp dụng bản "suggestion" cho mọi câu "improvable" (KHÔNG giữ lại cách viết gốc chưa tối ưu của câu đó).
- NẾU có Lĩnh vực chuyên ngành VÀ "industry_vocab_gap" = true: BẮT BUỘC chèn TỰ NHIÊN ít nhất 2-4 từ/cụm từ CHUYÊN NGÀNH THẬT SỰ (không phải từ chung chung như "place", "staff", "food", "room" — phải là thuật ngữ chuyên ngành cụ thể, ví dụ lĩnh vực Nhà hàng - Khách sạn: "front desk", "check-in/check-out", "amenities", "concierge", "housekeeping", "room service") vào đúng chỗ hợp lý, KHÔNG gượng ép, VẪN đúng bối cảnh học viên đã kể (xem quy tắc GIỮ NGUYÊN BỐI CẢNH ở trên). Nếu "industry_vocab_gap" = false (bài gốc đã đủ từ chuyên ngành) thì không cần thêm gì, giữ nguyên mức dùng đã có.
- Ngữ pháp, cấu trúc câu ĐÚNG TẦM cấp độ CEFR đã cho — không quá đơn giản (dưới tầm cấp độ), không quá phức tạp (vượt tầm cấp độ).
- Vẫn phải bám đúng mục tiêu ("goals") của đề bài đã giao.
- Đây là bài viết như người bản xứ thành thạo, đúng cấp độ sẽ viết — KHÔNG lặp lại lỗi hay cách diễn đạt còn hạn chế của bản gốc.
- Trả về liền mạch dạng văn xuôi bình thường — KHÔNG chèn bất kỳ ký hiệu đánh dấu nào (không gạch ngang, không in đậm, không ngoặc chú thích).

QUY TẮC "clean_rewrite_vocab" (chỉ liệt kê khi có Lĩnh vực chuyên ngành, để mảng rỗng nếu không có):
- CHỈ liệt kê từ/cụm từ CHUYÊN NGÀNH thực sự XUẤT HIỆN trong "clean_rewrite" — không liệt kê từ vựng phổ thông. NẾU "industry_vocab_gap" = true, mảng này KHÔNG ĐƯỢC RỖNG (phải khớp với các từ chuyên ngành bạn vừa chèn vào theo quy tắc trên).

QUY TẮC "clean_rewrite_patterns" (CHỌN LỌC — dùng ĐÚNG tinh thần chọn "sentence_patterns" của bài học thông thường, KHÔNG liệt kê tràn lan):
- CHỈ chọn cấu trúc/khuôn câu THỰC SỰ đáng học lại, PHẢI xuất hiện nguyên văn trong "clean_rewrite", KHÁC cách viết gốc của học viên, ĐÚNG TẦM cấp độ CEFR đã cho (không quá cơ bản, không quá xa tầm). Đây là phép thử NĂNG LỰC PHÁN ĐOÁN — "why_worth_it" phải là lý do THẬT, nếu không nghĩ ra lý do thuyết phục thì BỎ QUA khuôn đó, KHÔNG hạ chuẩn để đủ số lượng. Số lượng: 2-5 mục — bài ít cấu trúc đáng chú ý thì cứ để 2, không cố nhồi.

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
  "structure_too_simple": false,
  "clean_rewrite": "bản viết lại hoàn chỉnh, liền mạch, không ký hiệu đánh dấu",
  "clean_rewrite_vocab": [{"word": "delay", "meaning": "sự chậm trễ"}],
  "clean_rewrite_patterns": [
    {"structure": "I would like to request...", "example": "trích NGUYÊN VĂN câu chứa cấu trúc này từ clean_rewrite", "note": "1 câu tiếng Việt: dùng để làm gì trong giao tiếp thực tế", "why_worth_it": "1 câu tiếng Việt: tại sao đáng học lại ở đúng cấp độ này"}
  ]
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
  if (typeof parsed.clean_rewrite !== "string" || !parsed.clean_rewrite.trim()) return false;
  if (parsed.clean_rewrite_vocab !== undefined && !Array.isArray(parsed.clean_rewrite_vocab)) return false;
  if (parsed.clean_rewrite_patterns !== undefined && !Array.isArray(parsed.clean_rewrite_patterns)) return false;
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
      maxTokens: 5800, // + clean_rewrite (~ bằng độ dài bài gốc) + clean_rewrite_vocab/patterns — nâng từ 4800 (2026-07-27, thêm Việc 2), gần trần MAX_TOKENS_CAP=6000 (aiProvider.js) — xem báo cáo thời gian/token thật trước khi cân nhắc tách lượt gọi riêng.
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

  const recentGenres = await getRecentGenres(ctx.studentId, 5);

  function isValidTaskShape(p) {
    return !!(p?.topic_en && p?.topic_vi && p?.genre_vi && Array.isArray(p.goals) && Array.isArray(p.structure));
  }
  // "đã lặp thể loại" so khớp KHÔNG phân biệt hoa/thường + bỏ khoảng trắng thừa — model có thể
  // viết lại genre_vi hơi khác chữ hoa/thường ("Email công việc" vs "email công việc") nhưng
  // vẫn là cùng 1 thể loại, phải bắt được cả 2 dạng.
  function repeatsRecentGenre(genreVi) {
    const norm = (genreVi || "").trim().toLowerCase();
    return recentGenres.some((g) => (g || "").trim().toLowerCase() === norm);
  }

  // Gọi AI + tự retry TỐI ĐA 1 LẦN nếu model LỠ chọn lại đúng 1 thể loại vừa cấm (dặn trong
  // prompt là đủ đa số trường hợp, nhưng vẫn cần lưới chắn — model có thể bỏ sót danh sách cấm
  // dài, giống lý do gradeWithRetry() có retry cho số lượng segments).
  let r, parsed;
  for (let attempt = 0; attempt < 2; attempt++) {
    const userPrompt =
      attempt === 0
        ? buildTaskUserPrompt(data.level, data.industry, recentGenres)
        : `${buildTaskUserPrompt(data.level, data.industry, recentGenres)}\n\nLƯU Ý: Lượt trước bạn LẶP LẠI 1 thể loại đã bị cấm ở trên — lần này PHẢI chọn thể loại KHÁC HẲN, không trùng bất kỳ thể loại nào trong danh sách "Thể loại đã giao gần đây".`;
    r = await generateStructuredJSON({
      maxTokens: 1600, // topic+goals+structure+vocabulary_suggestions+useful_phrases cộng lại ~500-700 token thật, chừa biên an toàn.
      temperature: 0.9, // thể loại/chủ đề cần đa dạng giữa các lần gọi.
      messages: [
        { role: "system", content: TASK_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    if (!r.ok) break;
    parsed = r.data;
    if (isValidTaskShape(parsed) && !repeatsRecentGenre(parsed.genre_vi)) break;
  }
  if (!r.ok) {
    if (r.parseError) console.error("[generate_writing_task] parse error:", r.text?.slice(0, 500));
    return { error: r.error || "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: r.status || 502 };
  }
  if (!isValidTaskShape(parsed)) {
    console.error("[generate_writing_task] invalid shape:", JSON.stringify(parsed).slice(0, 500));
    return { error: "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: 502 };
  }
  if (repeatsRecentGenre(parsed.genre_vi)) {
    console.error("[generate_writing_task] repeated recent genre sau retry:", parsed.genre_vi, "recent:", recentGenres);
  }

  // PHẢI await (không fire-and-forget) — đây là Serverless Function, tiến trình có thể bị
  // đóng băng/dừng NGAY sau khi response được trả về, insert chưa kịp chạy xong sẽ mất đếm/lịch sử.
  await logWritingTaskRequest(ctx.studentId, parsed.genre_vi);

  const [minWords, maxWords] = WRITING_LENGTH_TABLE[data.level] || [90, 150];
  return {
    content: JSON.stringify({
      task: {
        topic_en: parsed.topic_en,
        topic_vi: parsed.topic_vi,
        genre_vi: parsed.genre_vi,
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

  // Việc 2 (2026-07-27) — "Bài viết hoàn chỉnh": KHÔNG lưu vào writing_submissions ở đây (bảng
  // đó chỉ phục vụ đếm hạn mức + lịch sử tối giản) — client giữ trong state, CHỈ lưu THẬT khi
  // người học chủ động bấm "Lưu bài hoàn chỉnh" (Việc 3, bảng lưu riêng).
  const cleanRewrite = {
    text: parsed.clean_rewrite.trim(),
    vocab: Array.isArray(parsed.clean_rewrite_vocab) ? parsed.clean_rewrite_vocab : [],
    patterns: Array.isArray(parsed.clean_rewrite_patterns) ? parsed.clean_rewrite_patterns : [],
  };

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
      clean_rewrite: cleanRewrite,
      meta: buildMeta(r),
    }),
  };
}
