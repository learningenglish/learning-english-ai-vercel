// api/_generate/lesson.js — Student App: sinh Lesson JSON (kiến trúc Lesson-first).
//
// Thư mục "_generate" (có tiền tố "_") CHỦ Ý khác "generate" — mọi file nằm trực tiếp
// trong api/ (hoặc bất kỳ thư mục con nào không có tiền tố "_") tự động bị Vercel deploy
// thành 1 Serverless Function/endpoint CÔNG KHAI riêng, với URL suy ra từ đường dẫn file
// (vd api/generate/lesson.js -> POST /api/generate/lesson) — endpoint đó sẽ né hoàn toàn
// qua lớp gate JWT/CORS/App-Secret nằm trong handler() của api/chat.js, vì handler() đó
// chỉ chạy khi request đi vào ĐÚNG /api/chat. Tiền tố "_" báo cho Vercel: đây là module
// nội bộ, không tạo route — file này chỉ được import và gọi TỪ BÊN TRONG tiến trình
// /api/chat (import ở chat.js + entry mới trong ACTIONS map), không bao giờ có URL riêng.
//
// KHÔNG import ngược bất kỳ thứ gì từ chat.js: chat.js "đóng băng" theo luật của dự án
// (chỉ được thêm dòng import + entry ACTIONS, không thêm export mới vào các hàm sẵn có).
// Vì vậy vài hằng số/hàm nhỏ (SUPABASE_URL, callOpenAI, content, safeOpenAIError,
// stripJsonFence) được COPY nguyên văn từ chat.js — nhưng CHỈ COPY 1 LẦN DUY NHẤT, đặt ở
// api/_generate/_shared.js để các module khác trong CÙNG thư mục _generate/ (như
// wordLookup.js) dùng chung, không phải copy lại lần nữa mỗi khi thêm action mới.
import { SUPABASE_URL, callOpenAI, content, safeOpenAIError, stripJsonFence } from "./_shared.js";

// SPEC ghi sổ, CHƯA triển khai (2026-07-19 — xem project_ai_model_routing_spec trong memory):
// model routing 2 bậc dự kiến — (1) sinh DA LĨNH VỰC (chưa có module, sẽ ở
// api/_generate/curriculum/): luôn model bậc GIỮA thế hệ hiện hành qua env MODEL_SKIN, KHÔNG
// dùng o-series/Pro (trả thêm tiền cho suy luận không cần); (2) sinh NỘI DUNG BÀI (hàm bên
// dưới): giữ nguyên "gpt-4o-mini" mặc định, CHỈ leo thang lên model MODEL_SKIN khi lượt "Thử
// lại" sau parse/validate fail (request MỚI từ client — không nhồi 2 lượt vào 1 request vì
// trần 60s). Model mạnh là lưới cuối, KHÔNG thay cho việc siết prompt/validate.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VALID_LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const VALID_CONTENT_TYPES = ["dialogue", "reading"];

// ====== Credit — luồng 3 bước cho cả generate_lesson và analyze_user_text (tạo bài học
// = thao tác AI đắt nhất, dùng chung mức giá 10 credit/hạn mức 300/tháng với đề thi,
// không tinh chỉnh riêng ở MVP):
//   (a) checkStudentExamCreditBalance() — ĐỌC số dư, KHÔNG trừ. Hết credit thì chặn NGAY,
//       trước khi tốn 1 lượt gọi OpenAI thật (tiền OpenAI do chủ app trả, không phải user
//       — không thể coi "tốn lượt gọi AI rồi mới báo hết credit" là nợ chấp nhận được).
//   (b) gọi AI + parse + validate.
//   (c) consumeStudentExamCredit() — RPC atomic, trừ THẬT ngay trước khi insert.
// Cố ý KHÔNG khoá race giữa (a) và (c): 2 request bắn gần như đồng thời có thể cùng lọt
// qua bước (a) (đọc thấy còn credit) rồi cùng vào bước (b) — CHẤP NHẬN, vì bước (c) vẫn
// là cổng chặn atomic thật sự (RPC có "for update"), nhiều nhất 1 trong 2 request bị
// chặn ở (c) chứ không lọt được vào insert. (a) chỉ là tối ưu chi phí (đỡ tốn lượt AI),
// không phải lớp bảo vệ credit duy nhất.
//
// EXAM_CREDIT_COST/EXAM_CREDIT_MONTHLY_LIMIT PHẢI khớp v_cost/v_limit trong RPC
// consume_student_exam_credit (supabase/015_student_pro_exams.sql) — đổi 1 bên mà quên
// bên kia sẽ làm (a) và (c) lệch nhau (vd (a) cho qua nhưng (c) vẫn chặn, gây tốn 1 lượt
// AI oan uổng dù đã có bước đọc trước).
const EXAM_CREDIT_COST = 10;
const EXAM_CREDIT_MONTHLY_LIMIT = 300;

async function checkStudentExamCreditBalance(studentId) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/students?id=eq.${studentId}&select=plan,monthly_exam_credit_used,monthly_exam_credit_reset_date`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    if (!r.ok) {
      console.error("checkStudentExamCreditBalance error:", r.status, await r.text());
      return { allowed: false, message: "Không kiểm tra được credit tạo bài, thử lại sau." };
    }
    const rows = await r.json();
    const row = rows?.[0];
    if (!row) return { allowed: false, message: "Không tìm thấy tài khoản học viên." };
    if (row.plan !== "pro") return { allowed: false, message: "Tính năng tự tạo đề chỉ dành cho gói Pro." };

    // date_trunc('month', current_date) phía RPC ~ ngày 1 đầu tháng hiện tại (UTC) ở đây —
    // so sánh chuỗi ISO "YYYY-MM-DD" là đủ chính xác vì cùng định dạng.
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    const monthStartStr = monthStart.toISOString().slice(0, 10);
    const used = row.monthly_exam_credit_reset_date < monthStartStr ? 0 : row.monthly_exam_credit_used;
    if (used + EXAM_CREDIT_COST > EXAM_CREDIT_MONTHLY_LIMIT) {
      return { allowed: false, message: "Đã dùng hết 300 credit tạo đề tháng này, quay lại tháng sau." };
    }
    return { allowed: true };
  } catch (e) {
    console.error("checkStudentExamCreditBalance error:", e);
    return { allowed: false, message: "Không kiểm tra được credit tạo bài, thử lại sau." };
  }
}

// Copy nguyên văn consumeStudentExamCredit() từ chat.js (RPC atomic, trừ credit THẬT).
async function consumeStudentExamCredit(studentId) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_student_exam_credit`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_student_id: studentId }),
    });
    if (!r.ok) {
      console.error("consume_student_exam_credit RPC error:", r.status, await r.text());
      return { allowed: false, message: "Không kiểm tra được credit tạo bài, thử lại sau." };
    }
    const rows = await r.json();
    return rows?.[0] || { allowed: false, message: "Không tìm thấy dữ liệu học viên." };
  } catch (e) {
    console.error("consumeStudentExamCredit error:", e);
    return { allowed: false, message: "Không kiểm tra được credit tạo bài, thử lại sau." };
  }
}

// Đo riêng thời gian gọi OpenAI (khác thời gian tổng round-trip mà trình duyệt đo được ở
// /app/ — chênh lệch cho biết độ trễ nằm ở OpenAI hay ở phần còn lại: cold start, mạng...).
// Trả kèm "usage" (prompt/completion/total tokens) để /app/ tự tính chi phí ước tính, hiển
// thị cùng đồng hồ thời gian trên màn hình Tạo bài học — phục vụ bài đo Phase 0/3.
async function timedCallOpenAI(args) {
  const start = Date.now();
  const r = await callOpenAI(args);
  return { ...r, durationMs: Date.now() - start };
}

function wordCount(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

// Trường nâng cao rỗng -> "không có" (đúng quy ước 2 file prompt: field/industry/
// product/situation đều thuộc "Tùy chọn nâng cao" ở form. "Ngữ pháp trọng tâm" đã bỏ khỏi
// form — chọn Cấp độ CEFR là đủ đảm bảo đúng phạm vi ngữ pháp, không cần chọn thêm).
function orNone(v) {
  const s = (v ?? "").toString().trim();
  return s ? s : "không có";
}

// ====== PROMPT 1: generate_lesson — nguyên văn docs/prompt-ai-tao-bai-hoc.md, KHÔNG sửa. ======
const GENERATE_LESSON_SYSTEM_PROMPT = `Bạn là chuyên gia soạn giáo trình tiếng Anh cho người Việt, bám sát khung CEFR.

NHIỆM VỤ: Tạo một bài học tiếng Anh hoàn chỉnh theo yêu cầu của người dùng.

QUY TẮC BẮT BUỘC VỀ CẤP ĐỘ (CEFR):
- Độ dài câu dưới đây là TRẦN TỐI ĐA, không phải khoảng cố định — câu ngắn 1-4 từ luôn hợp lệ ở MỌI cấp độ (đặc biệt trong hội thoại: "Sure.", "Really?", "Of course."). Không được ép mọi câu phải dài gần chạm trần.
- A1: câu TỐI ĐA 8 từ, chỉ thì hiện tại đơn và hiện tại tiếp diễn, từ vựng trong nhóm 1000 từ thông dụng nhất.
- A2: câu TỐI ĐA 12 từ, thêm quá khứ đơn và tương lai với "going to", từ vựng nhóm 2000 từ thông dụng.
- B1: câu TỐI ĐA 15 từ, thêm hiện tại hoàn thành, câu điều kiện loại 1, so sánh; từ vựng nhóm 3000 từ.
- B2: câu phức tự nhiên (không giới hạn cứng số từ), bị động, câu điều kiện loại 2-3, mệnh đề quan hệ; từ vựng học thuật nhẹ.
- C1: văn phong tự nhiên như người bản xứ, thành ngữ, cấu trúc đảo ngữ.
Tuyệt đối không dùng ngữ pháp hoặc từ vựng vượt cấp độ được yêu cầu, trừ các TỪ CHUYÊN NGÀNH được chỉ định.

QUY TẮC VỀ TỪ CHUYÊN NGÀNH:
- Lượng từ chuyên ngành được cho dưới dạng SỐ LƯỢT xuất hiện tuyệt đối trong bài (không phải phần trăm), bất kể độ dài bài dài hay ngắn.
- Ví dụ: lượng từ chuyên ngành = 20 → chèn khoảng 20 lượt từ/cụm từ chuyên ngành trong toàn bài (một từ lặp lại vẫn tính mỗi lần xuất hiện).
- Từ chuyên ngành phải lấy từ Lĩnh vực / Ngành nghề / Sản phẩm được cung cấp. Nếu cả ba đều là "không có" thì bỏ qua yêu cầu này, dùng từ vựng phổ thông.
- Mọi từ chuyên ngành xuất hiện trong bài PHẢI có mặt trong danh sách "vocabulary" của kết quả.

QUY TẮC VỀ TÌNH HUỐNG:
- Nếu người dùng cung cấp Tình huống (khác "không có"): TOÀN BỘ nội dung bài phải diễn ra
  đúng trong tình huống đó — nhân vật, bối cảnh, diễn biến bám sát mô tả, không lái sang
  tình huống khác. Tình huống được ưu tiên hơn Chủ đề nếu hai bên vênh nhau.
- Nếu Tình huống là "không có": bạn PHẢI tự nghĩ ra một tình huống cụ thể, đời thường,
  có diễn biến (có mở đầu, có vấn đề nhỏ hoặc mục đích, có kết) dựa trên Chủ đề, Lĩnh vực,
  Ngành nghề đã cho. Cấm viết nội dung chung chung không bối cảnh (ví dụ: hai người chào
  hỏi vu vơ rồi hết bài). Tình huống tự tạo phải vừa sức cấp độ người học.
- Dù tình huống do người dùng nhập hay bạn tự tạo, luôn ghi tóm tắt tình huống (1-2 câu
  tiếng Việt) vào trường "situation" trong JSON kết quả.

QUY TẮC VỀ LOẠI NỘI DUNG:
- "hội thoại": viết dạng hội thoại 2 người, mỗi lượt thoại là một phần tử trong mảng, có tên người nói (dùng tên tiếng Anh phổ biến hoặc vai như "Staff", "Customer" tùy ngữ cảnh).
- "bài đọc": viết thành các đoạn văn, mỗi đoạn là một phần tử trong mảng, mỗi đoạn 2-4 câu.

QUY TẮC HỘI THOẠI TỰ NHIÊN (CHỈ áp dụng khi loại nội dung là "hội thoại"):
- Độ dài lượt thoại PHẢI biến thiên rõ rệt: có lượt chỉ 1-4 từ (Sure. / Of course. / How many? / That's right.), có lượt dài 2-3 câu khi nhân vật giải thích, kể, hoặc phàn nàn. CẤM chuỗi 3 lượt liên tiếp có độ dài tương đương nhau.
- Vai không đối xứng: xác định ai là người CẦN gì trong tình huống (khách phàn nàn nói nhiều, nhân viên xác nhận ngắn; người hỏi đường nói ngắn, người chỉ đường nói dài) và phân bổ lời thoại theo đó.
- Dùng phản hồi ngắn tự nhiên đúng cấp độ: A1-A2 (Yes, sure / Oh no / Thank you so much), B1+ thêm (Actually... / I see what you mean / Well, the thing is...). Không nhồi vào mọi lượt — rải tự nhiên.
- Ít nhất 1 lần trong bài: một nhân vật hỏi lại để làm rõ hoặc xác nhận thông tin (Sorry, did you say 3 PM? / So that's two boxes, right?) — đây là kỹ năng giao tiếp thật cần dạy.
- Tổng số từ toàn bài vẫn theo length_words; biến thiên nằm ở phân bổ giữa các lượt, không phải kéo dài bài.

QUY TẮC ĐẦU RA:
- Trả về DUY NHẤT một khối JSON hợp lệ theo đúng schema bên dưới.
- Không viết lời chào, không giải thích, không bọc trong dấu \`\`\`.
- Mọi bản dịch và giải thích viết bằng tiếng Việt tự nhiên, không dịch máy móc từng chữ.

SCHEMA JSON:
{
  "title": "tên bài học bằng tiếng Anh, ngắn gọn",
  "title_vi": "tên bài dịch sang tiếng Việt",
  "level": "cấp độ CEFR của bài",
  "situation": "tóm tắt tình huống của bài bằng tiếng Việt, 1-2 câu (người dùng nhập hoặc AI tự tạo)",
  "content_type": "dialogue hoặc reading",
  "content": [
    {
      "speaker": "tên người nói (chỉ có khi là dialogue, bài đọc thì bỏ trường này)",
      "text": "câu/đoạn tiếng Anh",
      "translation": "bản dịch tiếng Việt của câu/đoạn này",
      "explanation": "giải thích ngắn gọn (2-3 dòng, tiếng Việt) về cấu trúc ngữ pháp/thì đang dùng trong ĐÚNG câu/đoạn này — để hiển thị ngay khi người học bấm xem giải thích, không phân tích chung chung"
    }
  ],
  "vocabulary": [
    {
      "word": "từ hoặc cụm từ",
      "ipa": "phiên âm IPA",
      "type": "loại từ (noun, verb, adj...)",
      "meaning": "nghĩa tiếng Việt",
      "example": "một câu ví dụ khác với câu trong bài, đúng cấp độ",
      "is_specialized": true nếu là từ chuyên ngành, false nếu là từ thường
    }
  ],
  "grammar": [
    {
      "name": "tên điểm ngữ pháp",
      "structure": "công thức, ví dụ: S + V(s/es) + O",
      "explanation": "giải thích ngắn bằng tiếng Việt",
      "example_from_lesson": "trích đúng một câu trong bài có dùng điểm ngữ pháp này"
    }
  ],
  "exercises": [
    {
      "type": "multiple_choice",
      "question": "câu hỏi",
      "options": ["A", "B", "C", "D"],
      "answer": 0,
      "explanation": "vì sao đáp án đúng, bằng tiếng Việt"
    },
    {
      "type": "fill_blank",
      "sentence": "câu có chỗ trống ghi là ___",
      "answer": "từ cần điền",
      "hint": "gợi ý ngắn"
    }
  ],
  "xp_reward": số XP đề xuất (bài ngắn 20, vừa 35, dài 50)
}

SỐ LƯỢNG:
- vocabulary: 6-10 từ với bài ngắn, 10-14 với bài vừa, 14-18 với bài dài. Toàn bộ từ chuyên ngành trong bài phải nằm ở đây trước, còn lại lấy từ thường đáng học nhất trong bài.
- grammar: CHỈ chọn điểm ngữ pháp ĐÚNG CẤP ĐỘ của bài (bài B1 → chỉ điểm B1), là trọng tâm bài này dạy. KHÔNG liệt kê cấu trúc thuộc cấp thấp hơn dù chúng xuất hiện trong bài. Nếu bài không có điểm ngữ pháp nào đúng cấp, trả mảng rỗng.
- exercises: tối thiểu 3 câu trắc nghiệm + 2 câu điền từ. Câu hỏi phải kiểm tra nội dung và từ vựng CỦA CHÍNH BÀI NÀY, không hỏi kiến thức bên ngoài.`;

function buildGenerateLessonUserPrompt(data) {
  const contentTypeVi = data.content_type === "dialogue" ? "hội thoại" : "bài đọc";
  const termDensity = data.term_density === undefined || data.term_density === null || data.term_density === ""
    ? 0
    : data.term_density;
  return `Tạo bài học theo yêu cầu sau:

- Mô tả của người học: ${orNone(data.description)}
- Cấp độ: ${data.level}
- Chủ đề: ${orNone(data.topic)}
- Loại nội dung: ${contentTypeVi}
- Độ dài: khoảng ${data.length_words || 200} từ (cho phép lệch ±15%)
- Lĩnh vực: ${orNone(data.field)}
- Ngành nghề: ${orNone(data.industry)}
- Sản phẩm / Dịch vụ liên quan: ${orNone(data.product)}
- Tình huống cụ thể: ${orNone(data.situation)}
- Lượng từ chuyên ngành: ${termDensity === 0 ? "không có" : `khoảng ${termDensity} lượt từ/cụm từ chuyên ngành trong bài`}

Nếu mô tả của người học mâu thuẫn với các trường còn lại (ví dụ mô tả đòi thì quá khứ
nhưng cấp độ là A1), ưu tiên CẤP ĐỘ, điều chỉnh mô tả cho vừa cấp độ.`;
}

// ====== PROMPT 2: analyze_user_text — nguyên văn docs/prompt-phan-tich-van-ban.md, KHÔNG sửa. ======
const ANALYZE_TEXT_SYSTEM_PROMPT = `Bạn là chuyên gia giảng dạy tiếng Anh cho người Việt, bám sát khung CEFR.

NHIỆM VỤ: Người học dán vào một văn bản tiếng Anh có sẵn. Hãy phân tích văn bản đó
thành một bài học hoàn chỉnh.

QUY TẮC TỐI THƯỢNG — KHÔNG SỬA VĂN BẢN GỐC:
- Giữ nguyên 100% từ ngữ, chính tả, ngắt câu của văn bản người dùng cung cấp.
- Không viết lại, không "cải thiện", không rút gọn, không thêm câu mới vào nội dung.
- Chỉ được phép: chia văn bản thành các đoạn/lượt thoại để phân trang.
- Nếu văn bản có lỗi chính tả hoặc ngữ pháp, vẫn giữ nguyên trong content, nhưng liệt kê
  các lỗi đó vào trường "notes" để người học biết.

CÁCH CHIA ĐOẠN:
- Nếu văn bản là hội thoại (có dấu hiệu người nói, gạch đầu dòng, dấu ngoặc kép luân phiên):
  content_type = "dialogue", mỗi lượt thoại là một phần tử, điền speaker nếu nhận diện được.
- Nếu là văn xuôi: content_type = "reading", chia theo đoạn gốc; đoạn nào dài quá 5 câu
  thì được phép tách tại ranh giới câu (không tách giữa câu).

PHÂN TÍCH THEO CẤP ĐỘ NGƯỜI HỌC:
- Người học khai báo cấp độ của họ. Hãy tự đánh giá cấp độ thực của văn bản (theo CEFR)
  và ghi vào "detected_level".
- Chọn từ vựng để đưa vào danh sách "vocabulary" theo nguyên tắc: những từ NGƯỜI HỌC
  Ở CẤP ĐỘ ĐÓ nhiều khả năng chưa biết. Người học A1 thì gần như mọi từ ngoài nhóm 1000 từ
  thông dụng đều đáng chọn; người học B2 thì chỉ chọn từ học thuật, thành ngữ, cụm động từ khó.
- Nếu văn bản vượt cấp độ người học từ 2 bậc trở lên (ví dụ văn bản C1, người học A2),
  đặt "level_warning" = true và viết một lời khuyên ngắn thân thiện bằng tiếng Việt
  vào "level_warning_message" (ví dụ: nên học kèm bản dịch từng câu, đừng cố hiểu 100%).
- Giải thích ngữ pháp và bài tập phải diễn đạt VỪA SỨC cấp độ người học, kể cả khi
  văn bản khó hơn: giải thích đơn giản, ví dụ bổ sung dùng từ vựng dễ.

QUY TẮC ĐẦU RA:
- Trả về DUY NHẤT một khối JSON hợp lệ theo schema dưới đây.
- Không lời chào, không giải thích ngoài JSON, không bọc trong dấu \`\`\`.
- Bản dịch và giải thích bằng tiếng Việt tự nhiên.

SCHEMA JSON:
{
  "title": "tự đặt tên bài bằng tiếng Anh dựa trên nội dung văn bản",
  "title_vi": "tên bài dịch sang tiếng Việt",
  "level": "cấp độ người học khai báo",
  "detected_level": "cấp độ CEFR bạn đánh giá cho văn bản",
  "level_warning": true/false,
  "level_warning_message": "chỉ có khi level_warning = true",
  "content_type": "dialogue hoặc reading",
  "content": [
    {
      "speaker": "chỉ có với dialogue",
      "text": "nguyên văn đoạn/lượt thoại từ văn bản gốc, không sửa",
      "translation": "bản dịch tiếng Việt",
      "explanation": "giải thích ngắn gọn (2-3 dòng, tiếng Việt) về cấu trúc ngữ pháp/thì đang dùng trong ĐÚNG câu/đoạn này, vừa sức cấp độ người học — để hiển thị ngay khi bấm xem giải thích, không phân tích chung chung"
    }
  ],
  "vocabulary": [
    {
      "word": "từ hoặc cụm từ CÓ MẶT trong văn bản",
      "ipa": "phiên âm IPA",
      "type": "loại từ",
      "meaning": "nghĩa tiếng Việt ĐÚNG THEO NGỮ CẢNH trong bài (không phải nghĩa phổ biến nhất)",
      "example": "một câu ví dụ mới, đơn giản, vừa cấp độ người học",
      "is_specialized": true nếu là thuật ngữ chuyên ngành, false nếu là từ thường
    }
  ],
  "grammar": [
    {
      "name": "tên điểm ngữ pháp",
      "structure": "công thức",
      "explanation": "giải thích bằng tiếng Việt, vừa sức cấp độ người học",
      "example_from_lesson": "trích nguyên văn một câu trong văn bản có dùng điểm này"
    }
  ],
  "exercises": [
    {
      "type": "multiple_choice",
      "question": "câu hỏi về nội dung hoặc từ vựng của chính văn bản này",
      "options": ["A", "B", "C", "D"],
      "answer": 0,
      "explanation": "giải thích bằng tiếng Việt"
    },
    {
      "type": "fill_blank",
      "sentence": "lấy một câu trong bài, khoét một từ thành ___",
      "answer": "từ bị khoét",
      "hint": "gợi ý ngắn"
    }
  ],
  "notes": ["các lỗi chính tả/ngữ pháp phát hiện trong văn bản gốc, nếu có; không có thì mảng rỗng"],
  "xp_reward": số XP theo độ dài văn bản: dưới 150 từ = 20, 150-400 = 35, trên 400 = 50
}

SỐ LƯỢNG:
- vocabulary: 8-15 từ tùy độ dài và độ khó văn bản so với cấp độ người học.
- grammar: 1-3 điểm THỰC SỰ xuất hiện trong văn bản, ưu tiên điểm lặp lại nhiều lần nhất.
- exercises: tối thiểu 3 trắc nghiệm + 2 điền từ, tất cả bám vào văn bản.`;

function buildAnalyzeTextUserPrompt(level, userText) {
  // Lọc bỏ chuỗi """ khỏi input trước khi chèn — chống prompt injection cơ bản (đúng
  // ghi chú trong docs/prompt-phan-tich-van-ban.md mục "USER PROMPT").
  const safeText = (userText || "").replace(/"""/g, "");
  return `Cấp độ của tôi: ${level}

Văn bản cần phân tích (giữ nguyên, không sửa):
"""
${safeText}
"""`;
}

// ====== Validate + chốt an toàn số lượng (không để model viết tràn) ======
function capLessonArrays(parsed) {
  if (Array.isArray(parsed.vocabulary) && parsed.vocabulary.length > 18) parsed.vocabulary = parsed.vocabulary.slice(0, 18);
  if (Array.isArray(parsed.grammar) && parsed.grammar.length > 3) parsed.grammar = parsed.grammar.slice(0, 3);
  if (Array.isArray(parsed.exercises) && parsed.exercises.length > 12) parsed.exercises = parsed.exercises.slice(0, 12);
  return parsed;
}

function validateLessonShape(parsed) {
  if (!parsed || typeof parsed !== "object") return { valid: false, reason: "not_object" };
  if (typeof parsed.title !== "string" || !parsed.title.trim()) return { valid: false, reason: "missing_title" };
  if (typeof parsed.title_vi !== "string" || !parsed.title_vi.trim()) return { valid: false, reason: "missing_title_vi" };
  if (!VALID_LEVELS.includes(parsed.level)) return { valid: false, reason: "invalid_level" };
  if (!VALID_CONTENT_TYPES.includes(parsed.content_type)) return { valid: false, reason: "invalid_content_type" };
  if (!Array.isArray(parsed.content) || !parsed.content.length) return { valid: false, reason: "empty_content" };
  if (!Array.isArray(parsed.vocabulary) || !parsed.vocabulary.length) return { valid: false, reason: "empty_vocabulary" };
  // "grammar" ĐƯỢC PHÉP rỗng — đúng chỉ dẫn trong prompt "chỉ chọn điểm ngữ pháp THỰC SỰ
  // xuất hiện trong bài", nội dung đơn giản (đặc biệt A1-A2, chủ đề chung chung) có thể
  // hợp lệ mà không có điểm ngữ pháp nào nổi bật để dạy. Bug thật: bản cũ bắt buộc không
  // rỗng, khiến những bài học HOÀN TOÀN HỢP LỆ bị từ chối oan (lỗi 502 giả, không phải do
  // AI hỏng) — đây là nguyên nhân trực tiếp của báo cáo "không tạo được bài học".
  if (!Array.isArray(parsed.grammar)) return { valid: false, reason: "grammar_not_array" };
  if (!Array.isArray(parsed.exercises) || !parsed.exercises.length) return { valid: false, reason: "empty_exercises" };
  return { valid: true };
}

function buildLessonInsertRow(parsed, { userId, source }) {
  return {
    user_id: userId,
    source,
    title: parsed.title,
    title_vi: parsed.title_vi,
    level: parsed.level,
    detected_level: parsed.detected_level || null,
    situation: parsed.situation || null,
    content_type: parsed.content_type,
    content: parsed.content,
    vocabulary: parsed.vocabulary,
    grammar: parsed.grammar,
    exercises: parsed.exercises,
    notes: parsed.notes || null,
    xp_reward: Number.isFinite(parsed.xp_reward) ? parsed.xp_reward : 20,
  };
}

async function insertLesson(row) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/lessons`, {
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
      console.error("insert lessons error:", r.status, await r.text());
      return null;
    }
    const rows = await r.json();
    return rows?.[0] || null;
  } catch (e) {
    console.error("insertLesson error:", e);
    return null;
  }
}

// ====== ACTIONS xuất ra cho chat.js đăng ký vào ACTIONS map ======
// Chỉ Student mới được dùng — cùng phạm vi với consumeStudentExamCredit() (credit tạo
// đề/bài học của Student Pro), Mentor có mô hình credit khác (cột "credits" riêng ở
// bảng mentors, không đi qua RPC này) nên không mở action này cho Mentor ở MVP.
export async function generate_lesson(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!VALID_LEVELS.includes(data.level)) return { error: "Thiếu hoặc sai 'level'.", status: 400 };
  if (!VALID_CONTENT_TYPES.includes(data.content_type)) return { error: "Thiếu hoặc sai 'content_type'.", status: 400 };

  // (a) Đọc số dư TRƯỚC — hết credit thì chặn ngay, không tốn 1 lượt gọi OpenAI thật.
  const balanceCheck = await checkStudentExamCreditBalance(ctx.studentId);
  if (!balanceCheck.allowed) return { error: balanceCheck.message, status: 403 };

  // (b) Gọi AI + parse + validate.
  const r = await timedCallOpenAI({
    max_tokens: 3500,
    temperature: 0.7,
    messages: [
      { role: "system", content: GENERATE_LESSON_SYSTEM_PROMPT },
      { role: "user", content: buildGenerateLessonUserPrompt(data) },
    ],
  });
  if (!r.ok) return safeOpenAIError(r);

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(content(r)));
  } catch (e) {
    console.error("[generate_lesson] parse error:", e, content(r).slice(0, 500));
    return { error: "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: 502 };
  }
  capLessonArrays(parsed);
  const validation = validateLessonShape(parsed);
  if (!validation.valid) {
    console.error("[generate_lesson] validate FAIL:", validation.reason);
    return { error: "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: 502 };
  }

  // (c) Trừ credit THẬT (atomic) ngay trước khi insert — vẫn là cổng chặn cuối cùng
  // ngay cả khi 2 request cùng lọt qua bước (a) (xem ghi chú ở checkStudentExamCreditBalance()).
  const creditCheck = await consumeStudentExamCredit(ctx.studentId);
  if (!creditCheck.allowed) return { error: creditCheck.message, status: 403 };

  const saved = await insertLesson(buildLessonInsertRow(parsed, { userId: ctx.studentId, source: "ai_generated" }));
  if (!saved) return { error: "Tạo bài thành công nhưng lưu thất bại, vui lòng thử lại.", status: 502 };

  return { content: JSON.stringify({ lesson: saved, meta: buildMeta(r) }) };
}

export async function analyze_user_text(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!VALID_LEVELS.includes(data.level)) return { error: "Thiếu hoặc sai 'level'.", status: 400 };
  const wc = wordCount(data.user_text);
  if (wc < 20) return { error: "Văn bản quá ngắn (tối thiểu 20 từ).", status: 400 };
  if (wc > 3000) return { error: "Văn bản quá dài (tối đa 3000 từ), vui lòng chia nhỏ.", status: 400 };

  // (a) Đọc số dư TRƯỚC — hết credit thì chặn ngay, không tốn 1 lượt gọi OpenAI thật.
  const balanceCheck = await checkStudentExamCreditBalance(ctx.studentId);
  if (!balanceCheck.allowed) return { error: balanceCheck.message, status: 403 };

  // (b) Gọi AI + parse + validate.
  const r = await timedCallOpenAI({
    max_tokens: 3500,
    temperature: 0.7,
    messages: [
      { role: "system", content: ANALYZE_TEXT_SYSTEM_PROMPT },
      { role: "user", content: buildAnalyzeTextUserPrompt(data.level, data.user_text) },
    ],
  });
  if (!r.ok) return safeOpenAIError(r);

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(content(r)));
  } catch (e) {
    console.error("[analyze_user_text] parse error:", e, content(r).slice(0, 500));
    return { error: "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: 502 };
  }
  capLessonArrays(parsed);
  const validation = validateLessonShape(parsed);
  if (!validation.valid) {
    console.error("[analyze_user_text] validate FAIL:", validation.reason);
    return { error: "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: 502 };
  }

  // (c) Trừ credit THẬT (atomic) ngay trước khi insert.
  const creditCheck = await consumeStudentExamCredit(ctx.studentId);
  if (!creditCheck.allowed) return { error: creditCheck.message, status: 403 };

  const saved = await insertLesson(buildLessonInsertRow(parsed, { userId: ctx.studentId, source: "user_text" }));
  if (!saved) return { error: "Phân tích thành công nhưng lưu thất bại, vui lòng thử lại.", status: 502 };

  return { content: JSON.stringify({ lesson: saved, meta: buildMeta(r) }) };
}

// meta không phải 1 phần "hợp đồng dữ liệu" Lesson JSON (mục 4 brief) — chỉ để /app/ hiển
// thị thời gian/token/chi phí ước tính lúc đo Phase 0/3, KHÔNG lưu vào bảng "lessons".
function buildMeta(r) {
  return { usage: r.data?.usage || null, openai_duration_ms: r.durationMs, model: "gpt-4o-mini" };
}

// ============================================================
// NỢ KỸ THUẬT:
// 1. Không có refund RPC — nếu lỗi xảy ra SAU khi credit đã trừ (vd insertLesson thất
//    bại vì Supabase tạm gián đoạn ngay sau bước consumeStudentExamCredit thành công),
//    user mất 1 credit mà không có bài học nào được lưu. Xác suất thấp (khoảng hở rất
//    ngắn giữa 2 lệnh gọi) nhưng vẫn có thể xảy ra — nếu cần chặt chẽ tuyệt đối, cần
//    thêm RPC "refund_student_exam_credit" (migration mới) gọi trong nhánh insertLesson
//    trả về null.
// 2. Không tự động sinh ảnh bìa (cover_image_url luôn null khi tạo) — logic
//    generateLessonCoverImage() có sẵn nhưng nằm private trong chat.js (không export
//    được vì luật "chat.js đóng băng"), và action get_lesson_cover_image đã có sẵn cho
//    phép frontend tự gọi rời sau khi lesson được lưu. Không nhân bản pipeline
//    Wikimedia/Unsplash/Pexels/AI vào đây để tránh 2 nơi cùng nuôi 1 logic — nếu cần ảnh
//    bìa tự động ngay lúc tạo, nên làm ở Phase 3 (frontend gọi get_lesson_cover_image rồi
//    PATCH cover_image_url qua 1 action backend mới, vì client không có quyền UPDATE cột
//    này trực tiếp — xem GRANT ở supabase/019_lessons.sql).
// ============================================================
