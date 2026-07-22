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
// Vì vậy hằng số nhỏ (SUPABASE_URL) được COPY nguyên văn từ chat.js — đặt ở
// api/_generate/_shared.js để các module khác trong CÙNG thư mục _generate/ dùng chung.
// Gọi AI đi qua api/_shared/aiProvider.js (lớp trừu tượng OpenAI/Gemini dùng chung toàn repo).
import { SUPABASE_URL } from "./_shared.js";
import { generateStructuredJSON } from "../_shared/aiProvider.js";

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

// ====== Hạn mức 10 bài/ngày (thay credit engine, chốt 2026-07-19) — generate_lesson và
// analyze_user_text dùng CHUNG 1 hạn mức: đếm số bản ghi "lessons" (cả 2 source cộng lại)
// user đã tạo trong ngày hiện tại theo giờ Asia/Ho_Chi_Minh (UTC+7, không DST). Không còn
// bảng "students.monthly_exam_credit_*"/RPC consume_student_exam_credit — đó là hệ thống
// credit CHO ĐỀ THI tự tạo (action "consume_exam_credit" riêng trong chat.js, KHÔNG đụng
// tới ở đây, 2 tính năng độc lập dùng chung RPC trước đây chỉ vì tiện, không phải vì cùng
// 1 hạn mức nghiệp vụ).
//
// Chỉ có bước ĐỌC-trước-khi-gọi-AI (đỡ tốn 1 lượt AI khi đã hết hạn mức) — KHÔNG có bước
// "consume" atomic riêng như credit cũ: hạn mức đơn giản là ĐẾM bản ghi đã có, và bản ghi
// insertLesson() ngay sau đó tự nhiên làm tăng số đếm cho lần kiểm tiếp theo. Race hiếm gặp
// (2 request gần như đồng thời cùng đọc thấy còn 1 suất) có thể khiến 1 ngày có 11 bài thay
// vì tối đa 10 — CHẤP NHẬN được cho MVP (không phải hệ thống thanh toán, không cần RPC
// "for update" như credit cũ).
const DAILY_LESSON_LIMIT = 10;
const VN_TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh = UTC+7, không có giờ mùa hè

// Trả về thời điểm UTC tương ứng với 00:00:00 hôm nay theo giờ VN (dùng làm mốc "gte" khi
// đếm bản ghi lessons trong ngày).
function startOfTodayVN() {
  const nowVN = new Date(Date.now() + VN_TZ_OFFSET_MS);
  const midnightVN = Date.UTC(nowVN.getUTCFullYear(), nowVN.getUTCMonth(), nowVN.getUTCDate());
  return new Date(midnightVN - VN_TZ_OFFSET_MS);
}

// Tính năng tự tạo bài (generate_lesson/analyze_user_text) là đặc quyền gói Student PRO
// (499.000đ/tháng, "tự học độc lập, không cần Mentor" — xem project_business_model_pricing
// trong memory) — Student Basic gắn với 1 Mentor, không có quyền này. Credit engine cũ đã
// gate đúng qua cột students.plan; giữ nguyên cổng đó, chỉ đổi phần "còn bao nhiêu suất".
async function checkDailyLessonLimit(studentId) {
  try {
    const studentRes = await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${studentId}&select=plan`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!studentRes.ok) {
      console.error("checkDailyLessonLimit (plan lookup) error:", studentRes.status);
      return { allowed: false, message: "Không kiểm tra được hạn mức tạo bài, thử lại sau." };
    }
    const student = (await studentRes.json())?.[0];
    if (!student) return { allowed: false, message: "Không tìm thấy tài khoản học viên." };
    if (student.plan !== "pro") return { allowed: false, message: "Tính năng tự tạo bài chỉ dành cho gói Pro." };

    const sinceISO = startOfTodayVN().toISOString();
    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/lessons?user_id=eq.${studentId}&created_at=gte.${sinceISO}&select=id`,
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
      console.error("checkDailyLessonLimit (count) error:", countRes.status);
      return { allowed: false, message: "Không kiểm tra được hạn mức tạo bài, thử lại sau." };
    }
    const used = Number((countRes.headers.get("content-range") || "").split("/")[1] || 0);
    if (used >= DAILY_LESSON_LIMIT) {
      return { allowed: false, message: `Đã dùng hết ${DAILY_LESSON_LIMIT} bài hôm nay, quay lại vào ngày mai.`, used };
    }
    return { allowed: true, used };
  } catch (e) {
    console.error("checkDailyLessonLimit error:", e);
    return { allowed: false, message: "Không kiểm tra được hạn mức tạo bài, thử lại sau." };
  }
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

YÊU CẦU HÀNG ĐẦU — ĐỘ DÀI (ngang hàng ưu tiên với cấp độ CEFR, đọc kỹ trước khi viết): user
prompt sẽ cho một SỐ LƯỢT THOẠI/CÂU-ĐOẠN TỐI THIỂU cụ thể. Đây KHÔNG phải gợi ý — hệ thống đo
lại tổng số từ sau khi bạn viết xong và TỰ ĐỘNG TỪ CHỐI bài quá ngắn. Ở cấp độ câu bị giới hạn
ngắn (đặc biệt A1/A2), số lượt đó CAO hơn trực giác nhiều — ĐỪNG dừng lại khi cảm thấy "đã đủ
ý" nếu chưa đạt số lượt tối thiểu. Cách kéo dài TỰ NHIÊN (không lặp ý, không rề rà giả tạo):
chẻ tình huống thành NHIỀU BƯỚC NHỎ thay vì gói gọn trong vài câu — vd 1 tình huống phàn nàn ở
khách sạn tự nhiên có: chào hỏi mở đầu, khách nêu vấn đề, nhân viên hỏi lại chi tiết (phòng số
mấy, vấn đề gì), khách mô tả thêm, nhân viên xin lỗi, nhân viên đề xuất cách xử lý, khách hỏi
thêm về cách xử lý đó (mất bao lâu, có phí không...), nhân viên xác nhận, khách đồng ý, nhân
viên hẹn thời gian cụ thể, khách cảm ơn, nhân viên chào tạm biệt — MỖI bước là 1-3 lượt thoại
riêng, cộng lại tự nhiên ra đủ số lượt cần thiết mà không thấy dài dòng giả tạo.
TRƯỚC KHI trả JSON: tự đếm số lượt/đoạn bạn vừa viết trong đầu. Nếu con số đó THẤP HƠN số lượt
tối thiểu user prompt đã cho, bạn CHƯA XONG — quay lại thêm bước nhỏ tiếp theo (theo danh sách
gợi ý ở trên) cho tới khi đạt hoặc vượt số lượt tối thiểu đó, RỒI MỚI trả JSON. Không trả JSON
khi số lượt còn thấp hơn yêu cầu.

QUY TẮC BẮT BUỘC VỀ CẤP ĐỘ (CEFR):
- Độ dài câu dưới đây là TRẦN TỐI ĐA, không phải khoảng cố định — câu ngắn 1-4 từ luôn hợp lệ ở MỌI cấp độ (đặc biệt trong hội thoại: "Sure.", "Really?", "Of course."). Không được ép mọi câu phải dài gần chạm trần.
- A1: câu TỐI ĐA 8 từ, chỉ thì hiện tại đơn và hiện tại tiếp diễn, từ vựng trong nhóm 1000 từ thông dụng nhất.
- A2: câu TỐI ĐA 12 từ, thêm quá khứ đơn và tương lai với "going to", từ vựng nhóm 2000 từ thông dụng.
- B1: câu TỐI ĐA 15 từ, thêm hiện tại hoàn thành, câu điều kiện loại 1, so sánh; từ vựng nhóm 3000 từ.
- B2: câu phức tự nhiên (không giới hạn cứng số từ), bị động, câu điều kiện loại 2-3, mệnh đề quan hệ; từ vựng học thuật nhẹ.
- C1: văn phong tự nhiên như người bản xứ, thành ngữ, cấu trúc đảo ngữ.
Tuyệt đối không dùng ngữ pháp hoặc từ vựng vượt cấp độ được yêu cầu, trừ các TỪ CHUYÊN NGÀNH được chỉ định.
RIÊNG A1 (chốt 2026-07-22): length_words của bài A1 CỐ Ý ngắn hơn hẳn các cấp khác — KHÔNG phải
lỗi, đừng cố "kéo dài cho đủ nghĩa". Bản chất A1 là câu và cấu trúc ĐƠN GIẢN, DỄ NHỚ, DÙNG LẠI
ĐƯỢC trong nhiều tình huống khác nhau, không phải đoạn văn/hội thoại dài. Ưu tiên vài câu/lượt
thật rõ ràng, đúng cấu trúc, học xong dùng lại ngay được — hơn là nhiều câu để đạt đủ số từ.

QUY TẮC VỀ TỪ CHUYÊN NGÀNH:
- Lượng từ chuyên ngành được cho dưới dạng SỐ LƯỢT xuất hiện tuyệt đối trong bài (không phải phần trăm), bất kể độ dài bài dài hay ngắn.
- Ví dụ: lượng từ chuyên ngành = 20 → chèn khoảng 20 lượt từ/cụm từ chuyên ngành trong toàn bài (một từ lặp lại vẫn tính mỗi lần xuất hiện).
- Từ chuyên ngành phải lấy từ Lĩnh vực / Ngành nghề / Sản phẩm được cung cấp. Nếu cả ba đều là "không có" thì bỏ qua RIÊNG yêu cầu chuyên ngành này — "vocabulary" VẪN PHẢI có đủ số lượng theo mục SỐ LƯỢNG bên dưới, chỉ đổi 100% sang từ vựng phổ thông, KHÔNG được để mảng rỗng.
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
- BẮT BUỘC hội thoại TRỌN VẸN: có mở đầu — diễn biến — chốt lại tự nhiên (vd cảm ơn/tạm biệt/xác nhận đã xong việc). LƯỢT THOẠI CUỐI CÙNG TUYỆT ĐỐI KHÔNG ĐƯỢC LÀ CÂU HỎI CHƯA CÓ LỜI ĐÁP (lỗi thật đã gặp: bài kết ở "Will I get paid for this delivery?" rồi hết, không nhân vật nào trả lời) — nếu gần hết length_words mà diễn biến chưa xong, RÚT NGẮN phần giữa để dành chỗ chốt lại cho trọn, KHÔNG được cắt ngang khi câu chuyện còn dở.

QUY TẮC VỀ ĐỘ DÀI (KIỂM TRA MÁY, KHÔNG PHẢI GỢI Ý):
- Tổng số từ tiếng Anh trong TOÀN BỘ mảng "content" (đếm cả text của mọi phần tử cộng lại) phải nằm trong khoảng ±25% của length_words yêu cầu. Hệ thống sẽ TỰ ĐỘNG TỪ CHỐI và bắt sinh lại nếu lệch quá 25% — bài chỉ yêu cầu ~100 từ mà chỉ viết 40-50 từ là KHÔNG ĐẠT, phải viết đủ.
- LỖI THẬT HAY GẶP Ở HỘI THOẠI MỌI CẤP ĐỘ (không riêng A1/A2): quy tắc "lượt ngắn 1-4 từ xen giữa lượt dài" (QUY TẮC HỘI THOẠI TỰ NHIÊN) khiến độ dài trung bình MỖI LƯỢT THỰC TẾ thấp hơn nhiều so với cảm giác khi viết — đo được thật: hội thoại B1 yêu cầu 200 từ chỉ đạt ~110-140 từ (thiếu 30-45%) khi dừng theo cảm giác "đã đủ ý" thay vì đếm số lượt. Cách DUY NHẤT để đạt đủ length_words khi có nhiều lượt ngắn là TĂNG TỔNG SỐ LƯỢT THOẠI (hội thoại) hoặc SỐ CÂU/ĐOẠN (bài đọc) — KHÔNG PHẢI viết từng lượt dài hơn trần cấp độ cho phép. User prompt đã tính SẴN số lượt/đoạn tối thiểu cần có (công thức đã cộng biên an toàn cho đúng thực tế lượt ngắn) — coi đó là SỐ CỨNG phải đạt hoặc vượt, không phải gợi ý tham khảo. Diễn biến câu chuyện phải đủ phong phú để tự nhiên cần nhiều lượt thoại đó (chẻ tình huống thành nhiều bước nhỏ, xem ví dụ ở đầu prompt) — không lặp ý, không rề rà giả tạo.

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
      "explanation": "phân tích ĐÚNG câu/đoạn này (2-3 dòng, tiếng Việt): cấu trúc đáng chú ý CỦA CHÍNH CÂU NÀY (không phải tên thì chung chung), từ/cụm cần lưu ý nếu có, VÌ SAO câu này dùng dạng đó trong tình huống này. CẤM khuôn sáo rỗng kiểu 'Thì X trong câu này diễn tả...' lặp lại máy móc — mỗi câu phải đọc như đang phân tích riêng câu đó, không phải dán nhãn ngữ pháp hàng loạt. Ngắn gọn, đúng trọng tâm, không lan man."
    }
  ],
  "vocabulary": [
    {
      "word": "từ hoặc cụm từ",
      "ipa": "phiên âm IPA",
      "type": "với TỪ ĐƠN: loại từ (noun, verb, adj...). Với CỤM TỪ (word có khoảng trắng): PHẢI chọn ĐÚNG 1 trong 3 nhãn sau theo cấu trúc thật của cụm — 'Cụm danh từ', 'Cụm động từ + giới từ (phrasal verb)', hoặc 'N + giới từ + N' — không dùng nhãn khác, không để trống",
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
  "sentence_patterns": [
    {
      "pattern": "khuôn câu có chỗ trống, viết tự nhiên (KHÔNG phải công thức trừu tượng kiểu S+V+O)",
      "example_from_lesson": "trích ĐÚNG NGUYÊN VĂN một câu đầy đủ trong \\"content\\" có dùng khuôn này, không bịa thêm",
      "note": "1 câu tiếng Việt ngắn, nói khuôn này DÙNG ĐỂ LÀM GÌ trong giao tiếp thực tế — KHÔNG giải thích ngữ pháp hàn lâm",
      "why_worth_it": "1 câu tiếng Việt ngắn, TẠI SAO khuôn này đáng học lại ở ĐÚNG cấp độ bài này — không mô tả lại nghĩa câu"
    }
  ],
  "exercises": [
    {
      "type": "multiple_choice",
      "question": "câu hỏi",
      "options": ["A", "B", "C", "D"],
      "answer": 0,
      "explanation": "vì sao đáp án đúng, bằng tiếng Việt",
      "grammar_tag": "trùng ĐÚNG NGUYÊN VĂN 1 giá trị \\"name\\" trong mảng \\"grammar\\" ở trên nếu câu này kiểm tra riêng điểm đó, hoặc null nếu không gắn với điểm ngữ pháp nào trong đó (vd câu hỏi từ vựng thuần)"
    },
    {
      "type": "fill_blank",
      "sentence": "câu có chỗ trống ghi là ___",
      "answer": "từ cần điền",
      "hint": "gợi ý ngắn",
      "grammar_tag": "như trên"
    }
  ],
  "xp_reward": số XP đề xuất (bài ngắn 20, vừa 35, dài 50)
}

SỐ LƯỢNG:
- vocabulary: 6-10 từ với bài ngắn, 10-14 với bài vừa, 14-18 với bài dài. Toàn bộ từ chuyên ngành trong bài phải nằm ở đây trước, còn lại lấy từ thường đáng học nhất trong bài. MỌI cụm từ (word có khoảng trắng) PHẢI trích XUẤT HIỆN NGUYÊN VĂN trong câu/đoạn nào đó của "content" — không tự bịa cụm hay/đúng ngữ pháp nhưng không thật sự có trong bài.
- grammar: CHỈ chọn điểm ngữ pháp ĐÚNG CẤP ĐỘ của bài (bài B1 → chỉ điểm B1), là trọng tâm bài này dạy. KHÔNG liệt kê cấu trúc thuộc cấp thấp hơn dù chúng xuất hiện trong bài. Nếu bài không có điểm ngữ pháp nào đúng cấp, trả mảng rỗng.
- sentence_patterns: quét TOÀN BỘ "content" (không giới hạn ở câu có điểm ngữ pháp trọng tâm), CHỈ chọn khuôn câu THỰC SỰ đáng học lại để dùng trong giao tiếp (câu hỏi thông dụng, cấu trúc tái dùng được ở nhiều tình huống khác) — bỏ qua câu quá đơn giản không có gì đáng nêu (vd "I like coffee"). Đây là phép thử NĂNG LỰC PHÁN ĐOÁN, không phải bài liệt kê — việc khó không phải "tìm cấu trúc" (câu nào cũng có cấu trúc) mà là biết cái nào ĐÁNG chọn, cái nào KHÔNG. Bắt buộc: (1) khuôn phải VỪA TẦM cấp độ của bài — không chọn khuôn quá cơ bản mà cấp độ đó chắc chắn đã thấm từ lâu, cũng không chọn khuôn vượt quá xa khiến người học chưa dùng được ngay; (2) "why_worth_it" phải là lý do THẬT — nếu không nghĩ ra lý do thuyết phục cho 1 khuôn, ĐỪNG đưa khuôn đó vào, KHÔNG hạ chuẩn để đủ số lượng. KHÔNG trùng với "grammar" (góc nhìn khác nhau: "grammar" là quy tắc ngữ pháp trọng tâm, "sentence_patterns" là khuôn câu thực dụng — được phép dùng chung 1 câu nguồn nhưng góc nhìn phải khác, không liệt kê lại y hệt). Số lượng: tối thiểu 3, tối đa 8 — tự lọc theo mật độ khuôn thật sự đáng chú ý có trong bài; bài ít khuôn đáng học thì cứ để gần mức tối thiểu, KHÔNG cố nhồi cho đủ số.
- exercises: tối thiểu 3 câu trắc nghiệm + 2 câu điền từ. Câu hỏi phải kiểm tra nội dung và từ vựng CỦA CHÍNH BÀI NÀY, không hỏi kiến thức bên ngoài. "grammar_tag" dùng để hệ thống gợi ý ôn tập sau này — không ảnh hưởng nội dung câu hỏi, chỉ gắn nhãn ĐÚNG với điểm ngữ pháp câu đó thực sự kiểm tra. BẮT BUỘC mọi object trong "exercises" PHẢI có key "grammar_tag" — KHÔNG được bỏ qua key này dưới bất kỳ trường hợp nào (lỗi thật đã gặp: model bỏ hẳn key thay vì ghi null). Giá trị CHỈ có 2 dạng hợp lệ: string khớp NGUYÊN VĂN 1 "name" trong "grammar", HOẶC chính xác giá trị null (không phải chuỗi rỗng, không phải thiếu key) khi câu không gắn điểm ngữ pháp nào.`;

// Độ dài trung bình 1 lượt thoại/1 câu-đoạn (từ) theo cấp độ — dùng để TÍNH SẴN một con số
// lượt/đoạn cụ thể đưa vào user prompt, thay vì bắt model tự ước lượng (thử nghiệm thật:
// chỉ ghi hướng dẫn chung chung trong system prompt KHÔNG đủ — model A1 vẫn dừng ở ~8 lượt/
// 45 từ dù yêu cầu 300, vì trần "câu tối đa 8 từ" bị hiểu nhầm thành trần cho CẢ BÀI). Số ở
// đây chỉ là ước tính hợp lý (không phải hằng số nghiệp vụ cứng như DAILY_LESSON_LIMIT), đặt
// gần chỗ dùng cho dễ chỉnh khi có dữ liệu thật.
//
// SỬA 2026-07-21 (test thật): "dialogue" dùng bảng RIÊNG, thấp hơn nhiều — QUY TẮC HỘI THOẠI
// TỰ NHIÊN bắt buộc nhiều lượt ngắn 1-4 từ ("Sure.", "Of course.") xen giữa lượt dài, kéo
// trung bình THỰC TẾ xuống rất thấp ở MỌI cấp độ, không riêng A1. Số liệu thật: hội thoại
// B1/200 từ (ước tính cũ 10 từ/lượt -> minUnits=20) chỉ đạt 93-137 từ thật (TB ~114) — suy
// ngược ra trung bình THỰC ĐẠT ~5.7 từ/lượt, gần bằng A1. "reading" KHÔNG có ràng buộc lượt
// ngắn bắt buộc này nên giữ bảng cũ (đã ổn định qua nhiều lần test trước).
const AVG_WORDS_PER_UNIT_BY_LEVEL = {
  dialogue: { A1: 6, A2: 6, B1: 6, B2: 7, C1: 8 },
  reading: { A1: 6, A2: 8, B1: 10, B2: 13, C1: 15 },
};

function suggestedUnitCount(level, lengthWords, contentType) {
  const table = AVG_WORDS_PER_UNIT_BY_LEVEL[contentType] || AVG_WORDS_PER_UNIT_BY_LEVEL.reading;
  const avg = table[level] || 8;
  // Biên an toàn — lỗi thật đo được LUÔN LÀ HỤT (chưa từng gặp thừa quá đà), nên thà ước tính
  // dư số đoạn còn hơn thiếu. NÂNG 1.2 -> 1.6 (2026-07-23, sau khi tăng length_words B1-C1 lên
  // hẳn theo LEVEL_LENGTH_TABLE — dữ liệu thật cho thấy 1.2 (hiệu chỉnh cho target ~200 cũ)
  // KHÔNG đủ ở target cao hơn nhiều: reading B1/C1 hụt 30-40% (110/230, 280/460) dù minUnits đã
  // tính theo 1.2 — undershoot NẶNG hơn hẳn mức 1.2 từng bù được, cần biên rộng hơn nhiều.
  return Math.max(6, Math.ceil(((lengthWords || 200) / avg) * 1.6));
}

// KIẾN TRÚC ĐỘ DÀI HỘI THOẠI (chốt 2026-07-21, thay hẳn cách "viết ~N từ tổng" cũ) — ra đề
// THEO CẤU TRÚC (N lượt cụ thể, mỗi lượt 1 khoảng từ cụ thể) thay vì bắt model tự cộng tổng
// qua nhiều lượt (model KHÔNG làm tốt việc tự cộng tổng — số liệu thật: yêu cầu "viết ~200 từ"
// hội tụ về 93-137 từ dù đã thử làm rõ cách đếm + tăng biên an toàn, KHÔNG cải thiện). Đổi
// sang "N lượt, mỗi lượt X-Y từ" thì model bám SỐ LƯỢT khá tốt (đo B1: 18/17/14 lượt thật so
// với 18 yêu cầu) nhưng ĐỘ DÀI mỗi lượt lại neo sát ĐÁY khoảng cho (đo B1: TB 8.3 từ/lượt khi
// khoảng là 8-15, tức gần đáy). Sửa bằng cách đẩy khoảng HIỂN THỊ cao hơn hẳn khoảng dùng để
// TÍNH SỐ LƯỢT + yêu cầu tường minh ưu tiên nửa trên khoảng — B1/200 từ: 6 mẫu thật (3+3) đạt
// validator ±25% ổn định (191/215/220/170 từ, chỉ 96/141 không đạt ở vòng đầu trước khi đẩy
// khoảng). reading KHÔNG đổi (không có vấn đề này, giữ nguyên suggestedUnitCount cũ).
//
// Dùng để TÍNH SỐ LƯỢT (turnCount) — GIỮ NGUYÊN dù đẩy khoảng hiển thị ở dưới, vì compliance số
// lượt đã tốt với range gốc này, không cần đổi.
const DIALOGUE_TURN_COUNT_BASIS_BY_LEVEL = {
  A1: [5, 9],
  A2: [6, 11],
  B1: [8, 15],
  B2: [10, 18],
  C1: [12, 22],
};
// Khoảng HIỂN THỊ cho model viết mỗi lượt — đẩy cao hơn hẳn cơ sở tính ở trên để bù thiên lệch
// neo-đáy. B1 ĐÃ KIỂM CHỨNG bằng dữ liệu thật (8-15 -> 14-22, 6 mẫu). A2/B2: NGOẠI SUY tuyến
// tính giữa các điểm biên đã đo (chấp nhận ngoại suy, không đo riêng).
// A1 RIÊNG — hiệu chỉnh lại 2026-07-22 (KHÁC ngoại suy A2-C1 ở trên): khoảng gốc [9,14] được đo
// khi length_words A1 còn ở mức cao hơn hẳn (~200) — sau khi hạ length_words A1 xuống mức thấp
// (xem LEVEL_LENGTH_TABLE, 2026-07-23 đổi tiếp thành bảng đủ 5 cấp), giữ NGUYÊN khoảng cũ gây
// THỪA hẳn (đo thật: target 90 -> hội tụ ~119-130, vượt tôn 25%) vì bias "đẩy nửa trên" vốn
// tính để bù thiên lệch neo-đáy ở target CAO, áp lên target THẤP thì hoá ra lại đẩy quá đà. Hạ
// về [5,8] (gần khoảng CƠ SỞ tính số lượt, gần như bỏ hẳn phần đẩy) — theo tính toán: turnCount
// (không đổi, vẫn theo cơ sở avg=7) × trung bình khoảng mới (~6.5) ≈ khớp target thấp. Đã kiểm
// lại bằng dữ liệu thật (6/6 đạt) khi target còn 50-90 — CHƯA đo lại ở target 60-90 hiện tại
// (khoảng gần như không đổi, không kỳ vọng khác biệt đáng kể), xem
// project_next_slot_skin_wiring trong memory nếu cần đo lại.
const DIALOGUE_TURN_RANGE_DISPLAY_BY_LEVEL = {
  A1: [5, 8],
  A2: [11, 16],
  B1: [14, 22],
  B2: [17, 26],
  C1: [21, 32],
};

// BẢNG ĐỘ DÀI THEO CẤP CEFR (chốt 2026-07-23, THAY HẲN cơ chế length_words tự do + ±25% cũ) —
// căn cứ: vốn từ theo cấp (A1~500 → C1~8000+ từ), độ dài câu theo CEFR (A1-A2 <10 từ/câu, B1-B2
// 10-16 từ/câu), và chuẩn độ dài bài đọc Cambridge KET/PET/FCE/CAE ứng A2/B1/B2/C1 — KHÔNG phải
// số tự chọn. A1/A2 CHỈ 1 mức CỐ ĐỊNH — văn bản CEFR ở 2 cấp này là đoạn RỜI RẠC NGẮN (biển
// báo/tin nhắn), không phải đoạn liên kết dài, nên KHÔNG có khái niệm "Dài" ở đây (không hiện
// control chọn độ dài cho A1/A2 ở bất kỳ UI nào sau này). B1 trở lên có 3 mức Ngắn/Vừa/Dài, số
// riêng từng cấp — "Vừa" của B1 (180-230, giữa 205) khớp gần đúng target 200 đã kiểm chứng
// nhiều lần trước đây (xem DIALOGUE_TURN_RANGE_DISPLAY_BY_LEVEL) nên không đổi hành vi B1 hiện
// có, chỉ B2/C1 THỰC SỰ tăng mạnh so với mặc định 200 cũ (chưa test tới, xem
// project_next_slot_skin_wiring trong memory khi kiểm lại).
const LEVEL_LENGTH_TABLE = {
  A1: { fixed: [60, 90] },
  A2: { fixed: [90, 130] },
  B1: { short: [150, 180], medium: [180, 230], long: [230, 280] },
  B2: { short: [250, 300], medium: [300, 380], long: [380, 450] },
  C1: { short: [350, 420], medium: [420, 500], long: [500, 600] },
};
const VALID_LENGTH_TIERS = ["short", "medium", "long"];

// Trả về [min, max] THẬT dùng cho prompt + validate — A1/A2 LUÔN dùng mức cố định (bỏ qua
// lengthTier nếu caller có gửi), B1+ dùng lengthTier (mặc định "medium" nếu thiếu/sai giá trị,
// đúng lựa chọn tự động của next_slot — luồng này không hỏi người dùng chọn độ dài).
function resolveLengthRange(level, lengthTier) {
  const entry = LEVEL_LENGTH_TABLE[level];
  if (!entry) return [180, 230]; // phòng hờ, level đã validate hợp lệ trước đó nên không nên tới đây
  if (entry.fixed) return entry.fixed;
  const tier = VALID_LENGTH_TIERS.includes(lengthTier) ? lengthTier : "medium";
  return entry[tier];
}

function buildGenerateLessonUserPrompt(data) {
  const contentTypeVi = data.content_type === "dialogue" ? "hội thoại" : "bài đọc";
  const unitLabel = data.content_type === "dialogue" ? "lượt thoại" : "câu/đoạn";
  const termDensity = data.term_density === undefined || data.term_density === null || data.term_density === ""
    ? 0
    : data.term_density;
  const lengthWords = data.length_words || 200; // trung điểm khoảng đã nắn — dùng để TÍNH CƠ HỌC (số lượt/đơn vị), band thật hiển thị cho model là length_words_min/max bên dưới.
  const lengthWordsMin = data.length_words_min || Math.round(lengthWords * 0.85);
  const lengthWordsMax = data.length_words_max || Math.round(lengthWords * 1.15);
  const isDialogue = data.content_type === "dialogue";
  let lengthInstruction;
  if (isDialogue) {
    const [basisMin, basisMax] = DIALOGUE_TURN_COUNT_BASIS_BY_LEVEL[data.level] || [8, 15];
    const turnCount = Math.max(6, Math.round(lengthWords / ((basisMin + basisMax) / 2)));
    const [turnMin, turnMax] = DIALOGUE_TURN_RANGE_DISPLAY_BY_LEVEL[data.level] || [basisMin, basisMax];
    const upperHalfMin = Math.round((turnMin + turnMax) / 2);
    lengthInstruction = `- Cấu trúc hội thoại (yêu cầu CƠ HỌC, đếm được cho từng phần tử): viết ĐÚNG ${turnCount} lượt thoại (${turnCount} phần tử trong "content"). MỖI LƯỢT dài khoảng ${turnMin}-${turnMax} từ tiếng Anh — ƯU TIÊN VIẾT Ở NỬA TRÊN của khoảng này (tức ${upperHalfMin}-${turnMax} từ/lượt), KHÔNG mặc định viết ở đáy khoảng dù đáy vẫn hợp lệ về lý thuyết — số liệu thật đo được cho thấy xu hướng viết ngắn hơn yêu cầu rất rõ, nên phải CHỦ ĐỘNG nhắm cao hơn để bù, không viết theo bản năng "vừa đủ chạm sàn". Đếm riêng từng lượt, không phải cộng dồn cả bài trong đầu — nếu bạn viết đúng ${turnCount} lượt, mỗi lượt trong khoảng ${upperHalfMin}-${turnMax} từ, tổng cả bài sẽ tự động rơi vào khoảng ${lengthWordsMin}-${lengthWordsMax} từ yêu cầu (xem QUY TẮC VỀ ĐỘ DÀI). KHÔNG tính từ trong vocabulary/grammar/sentence_patterns/exercises/translation/explanation. Nếu 1 lượt nào đó phải ngắn hơn ${turnMin} từ vì lý do tự nhiên (vd "Sure.", "Of course."), lượt NGAY SAU hoặc NGAY TRƯỚC đó phải dài hơn ${turnMax} từ để bù lại — tổng thể vẫn phải đạt đủ ${turnCount} lượt.`;
  } else {
    const minUnits = suggestedUnitCount(data.level, lengthWords, data.content_type);
    const avgWordsPerUnit = Math.round(lengthWords / minUnits);
    lengthInstruction = `- Độ dài: viết trong khoảng ${lengthWordsMin}-${lengthWordsMax} từ tiếng Anh (khung CỐ ĐỊNH theo cấp ${data.level}, không phải ước lượng). CÁCH ĐẾM: cộng TOÀN BỘ số từ trong "text" của MỌI phần tử trong "content" — đếm TỪNG TỪ TIẾNG ANH thật sự, KHÔNG PHẢI đếm số ${unitLabel}/số phần tử. KHÔNG tính từ trong vocabulary/grammar/sentence_patterns/exercises/translation/explanation (những phần đó KHÔNG được rút ngắn để né việc viết đủ content). Hệ thống TỰ ĐỘNG TỪ CHỐI nếu ngoài khoảng ${lengthWordsMin}-${lengthWordsMax} — lỗi thật đo được LUÔN LÀ VIẾT THIẾU (chưa từng gặp viết thừa), nên khi phân vân hãy nhắm về nửa TRÊN của khoảng chứ đừng viết sát đáy. CẦN khoảng ${minUnits} ${unitLabel} ở cấp ${data.level} để đạt đủ (đã tính kèm biên an toàn) — ví dụ cách tính: ${minUnits} ${unitLabel}, trung bình mỗi ${unitLabel} khoảng ${avgWordsPerUnit} từ, cộng lại ≈ ${lengthWords} từ. Đừng dừng sớm hơn ${minUnits} ${unitLabel} nếu tổng từ trong "content" đo được chưa tới ${lengthWordsMin}.`;
  }
  return `Tạo bài học theo yêu cầu sau:

- Mô tả của người học: ${orNone(data.description)}
- Cấp độ: ${data.level}
- Chủ đề: ${orNone(data.topic)}
- Loại nội dung: ${contentTypeVi}
${lengthInstruction}
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
      "explanation": "phân tích ĐÚNG câu/đoạn này (2-3 dòng, tiếng Việt), vừa sức cấp độ người học: cấu trúc đáng chú ý CỦA CHÍNH CÂU NÀY (không phải tên thì chung chung), từ/cụm cần lưu ý nếu có, VÌ SAO câu này dùng dạng đó. CẤM khuôn sáo rỗng kiểu 'Thì X trong câu này diễn tả...' lặp lại máy móc — mỗi câu đọc như đang phân tích riêng câu đó. Ngắn gọn, đúng trọng tâm."
    }
  ],
  "vocabulary": [
    {
      "word": "từ hoặc cụm từ CÓ MẶT trong văn bản",
      "ipa": "phiên âm IPA",
      "type": "với TỪ ĐƠN: loại từ (noun, verb, adj...). Với CỤM TỪ (word có khoảng trắng): PHẢI chọn ĐÚNG 1 trong 3 nhãn — 'Cụm danh từ', 'Cụm động từ + giới từ (phrasal verb)', hoặc 'N + giới từ + N' — theo đúng cấu trúc thật của cụm, không dùng nhãn khác",
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
  "sentence_patterns": [
    {
      "pattern": "khuôn câu có chỗ trống, viết tự nhiên (KHÔNG phải công thức trừu tượng kiểu S+V+O)",
      "example_from_lesson": "trích ĐÚNG NGUYÊN VĂN một câu đầy đủ trong văn bản có dùng khuôn này, không bịa thêm",
      "note": "1 câu tiếng Việt ngắn, nói khuôn này DÙNG ĐỂ LÀM GÌ trong giao tiếp thực tế — KHÔNG giải thích ngữ pháp hàn lâm",
      "why_worth_it": "1 câu tiếng Việt ngắn, TẠI SAO khuôn này đáng học lại ở ĐÚNG cấp độ người học (không phải cấp độ văn bản) — không mô tả lại nghĩa câu"
    }
  ],
  "exercises": [
    {
      "type": "multiple_choice",
      "question": "câu hỏi về nội dung hoặc từ vựng của chính văn bản này",
      "options": ["A", "B", "C", "D"],
      "answer": 0,
      "explanation": "giải thích bằng tiếng Việt",
      "grammar_tag": "trùng ĐÚNG NGUYÊN VĂN 1 giá trị \\"name\\" trong mảng \\"grammar\\" ở trên nếu câu này kiểm tra riêng điểm đó, hoặc null nếu không gắn với điểm ngữ pháp nào trong đó"
    },
    {
      "type": "fill_blank",
      "sentence": "lấy một câu trong bài, khoét một từ thành ___",
      "answer": "từ bị khoét",
      "hint": "gợi ý ngắn",
      "grammar_tag": "như trên"
    }
  ],
  "notes": ["các lỗi chính tả/ngữ pháp phát hiện trong văn bản gốc, nếu có; không có thì mảng rỗng"],
  "xp_reward": số XP theo độ dài văn bản: dưới 150 từ = 20, 150-400 = 35, trên 400 = 50
}

SỐ LƯỢNG:
- vocabulary: 8-15 từ tùy độ dài và độ khó văn bản so với cấp độ người học.
- grammar: 1-3 điểm THỰC SỰ xuất hiện trong văn bản, ưu tiên điểm lặp lại nhiều lần nhất.
- sentence_patterns: quét TOÀN BỘ văn bản (không giới hạn ở câu có điểm ngữ pháp trọng tâm), CHỈ chọn khuôn câu THỰC SỰ đáng học lại để dùng trong giao tiếp (câu hỏi thông dụng, cấu trúc tái dùng được ở nhiều tình huống khác) — bỏ qua câu quá đơn giản không có gì đáng nêu (vd "I like coffee"). Đây là phép thử NĂNG LỰC PHÁN ĐOÁN, không phải bài liệt kê — việc khó không phải "tìm cấu trúc" (câu nào cũng có cấu trúc) mà là biết cái nào ĐÁNG chọn, cái nào KHÔNG. Bắt buộc: (1) khuôn phải VỪA TẦM cấp độ NGƯỜI HỌC (không phải cấp độ văn bản, có thể cao hơn) — không chọn khuôn quá cơ bản mà cấp độ đó chắc chắn đã thấm từ lâu, cũng không chọn khuôn vượt quá xa khiến người học chưa dùng được ngay; (2) "why_worth_it" phải là lý do THẬT — nếu không nghĩ ra lý do thuyết phục cho 1 khuôn, ĐỪNG đưa khuôn đó vào, KHÔNG hạ chuẩn để đủ số lượng. KHÔNG trùng với "grammar". Số lượng: tối thiểu 3, tối đa 8 — tự lọc theo mật độ khuôn thật sự đáng chú ý có trong văn bản; văn bản ít khuôn đáng học thì cứ để gần mức tối thiểu, KHÔNG cố nhồi cho đủ số.
- exercises: tối thiểu 3 trắc nghiệm + 2 điền từ, tất cả bám vào văn bản. "grammar_tag" dùng để hệ thống gợi ý ôn tập sau này — chỉ gắn nhãn ĐÚNG với điểm ngữ pháp câu đó thực sự kiểm tra. BẮT BUỘC mọi object trong "exercises" PHẢI có key "grammar_tag" — KHÔNG được bỏ qua key này dưới bất kỳ trường hợp nào (lỗi thật đã gặp: model bỏ hẳn key thay vì ghi null). Giá trị CHỈ có 2 dạng hợp lệ: string khớp NGUYÊN VĂN 1 "name" trong "grammar", HOẶC chính xác giá trị null (không phải chuỗi rỗng, không phải thiếu key) khi câu không gắn điểm ngữ pháp nào.`;

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
  if (Array.isArray(parsed.sentence_patterns) && parsed.sentence_patterns.length > 8) parsed.sentence_patterns = parsed.sentence_patterns.slice(0, 8);
  if (Array.isArray(parsed.exercises) && parsed.exercises.length > 12) parsed.exercises = parsed.exercises.slice(0, 12);
  return parsed;
}

// Ngưỡng lệch độ dài cho phép — bài thật đã gặp yêu cầu ~100 từ mà AI chỉ trả 40-50 từ vẫn
// qua được validator cũ (không hề đếm từ) — đây là con số hằng số DUY NHẤT chỗ này, đổi ở
// đây là đổi cho cả generate_lesson lẫn analyze_user_text.
const WORD_COUNT_DEVIATION_LIMIT = 0.25;

function totalContentWords(content) {
  return (content || []).reduce((sum, item) => sum + wordCount(item?.text), 0);
}

// endsOnDanglingQuestion: lượt thoại CUỐI CÙNG của 1 bài hội thoại không được là câu hỏi
// chưa có lời đáp — theo định nghĩa đây luôn là lượt cuối, nên "kết thúc bằng dấu ?" ĐÃ ĐỦ
// để coi là treo (không có lượt nào sau nó để trả lời). Lỗi thật đã gặp: bài kết ở "Will I
// get paid for this delivery?" rồi hết.
function endsOnDanglingQuestion(content) {
  const last = (content || [])[content.length - 1];
  return !!last && typeof last.text === "string" && last.text.trim().endsWith("?");
}

function validateLessonShape(parsed, { expectedWords, minWords, maxWords, checkDialogueEnding } = {}) {
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

  // minWords/maxWords (bảng độ dài theo cấp CEFR, generate_lesson dùng) ưu tiên hơn
  // expectedWords±% (analyze_user_text vẫn dùng riêng — kiểm nội dung PHẢN ÁNH ĐỦ văn bản
  // GỐC người dùng dán vào, không liên quan bảng cấp độ nào cả).
  if (typeof minWords === "number" && typeof maxWords === "number") {
    const actualWords = totalContentWords(parsed.content);
    if (actualWords < minWords || actualWords > maxWords) {
      return { valid: false, reason: "word_count_out_of_range", actualWords, minWords, maxWords };
    }
  } else if (typeof expectedWords === "number" && expectedWords > 0) {
    const actualWords = totalContentWords(parsed.content);
    const deviation = Math.abs(actualWords - expectedWords) / expectedWords;
    if (deviation > WORD_COUNT_DEVIATION_LIMIT) {
      return { valid: false, reason: "word_count_deviation", actualWords, expectedWords };
    }
  }
  if (checkDialogueEnding && parsed.content_type === "dialogue" && endsOnDanglingQuestion(parsed.content)) {
    return { valid: false, reason: "dangling_question_ending" };
  }
  return { valid: true };
}

function buildLessonInsertRow(parsed, { userId, source, goalId, skinId, spineSlot }) {
  return {
    user_id: userId,
    source,
    goal_id: goalId || null,
    skin_id: skinId || null,
    spine_slot: Number.isInteger(spineSlot) ? spineSlot : null,
    title: parsed.title,
    title_vi: parsed.title_vi,
    level: parsed.level,
    detected_level: parsed.detected_level || null,
    situation: parsed.situation || null,
    content_type: parsed.content_type,
    content: parsed.content,
    vocabulary: parsed.vocabulary,
    grammar: parsed.grammar,
    sentence_patterns: Array.isArray(parsed.sentence_patterns) ? parsed.sentence_patterns : [],
    exercises: parsed.exercises,
    notes: parsed.notes || null,
    xp_reward: Number.isFinite(parsed.xp_reward) ? parsed.xp_reward : 20,
  };
}

// Mentor AI (Đợt 3): generate_lesson nhận thêm data.goal_id TÙY CHỌN để gắn bài mới vào
// đúng mục tiêu (learning_goals) khi được gọi TỪ api/_generate/mentor.js. generate_lesson
// vẫn là action CÔNG KHAI (client gọi trực tiếp qua /api/chat), nên PHẢI xác nhận goal_id
// đó thật sự thuộc về CHÍNH ctx.studentId trước khi gắn — nếu không, âm thầm bỏ qua (coi
// như không có goal_id) thay vì lỗi cả lượt tạo bài, tránh 1 client cố tình gắn bài vào
// goal_id của người khác (learning_goals.id không có gì ràng buộc theo user ở tầng FK).
async function resolveOwnedGoalId(goalId, userId) {
  if (!goalId) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/learning_goals?id=eq.${encodeURIComponent(goalId)}&user_id=eq.${userId}&select=id`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0]?.id || null;
  } catch (e) {
    console.error("resolveOwnedGoalId error:", e);
    return null;
  }
}

// data.skin_id TÙY CHỌN (2026-07-22, nối next_slot vào da lĩnh vực) — chỉ audit "bài này lấy
// chủ đề từ da nào", industry_skins KHÔNG thuộc về 1 user (dùng chung theo ngành) nên không
// cần kiểm ownership như goal_id ở trên — chỉ cần xác nhận id đó CÓ TỒN TẠI, tránh lỗi FK
// constraint làm hỏng cả lượt lưu bài nếu client gửi id rác.
async function resolveSkinId(skinId) {
  if (!skinId) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/industry_skins?id=eq.${encodeURIComponent(skinId)}&select=id`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0]?.id || null;
  } catch (e) {
    console.error("resolveSkinId error:", e);
    return null;
  }
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
// Chỉ Student mới được dùng — Mentor có mô hình credit khác (cột "credits" riêng ở bảng
// mentors) nên không mở action này cho Mentor ở MVP.
export async function generate_lesson(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!VALID_LEVELS.includes(data.level)) return { error: "Thiếu hoặc sai 'level'.", status: 400 };
  if (!VALID_CONTENT_TYPES.includes(data.content_type)) return { error: "Thiếu hoặc sai 'content_type'.", status: 400 };

  // (a) Đọc hạn mức TRƯỚC — hết hạn mức thì chặn ngay, không tốn 1 lượt gọi OpenAI thật.
  const limitCheck = await checkDailyLessonLimit(ctx.studentId);
  if (!limitCheck.allowed) return { error: limitCheck.message, status: 403 };

  // Lấy khoảng độ dài THẬT theo bảng cấp CEFR (xem LEVEL_LENGTH_TABLE) — A1/A2 luôn 1 mức cố
  // định, B1+ theo data.length_tier ("short"/"medium"/"long", mặc định "medium"). Dùng CÙNG 1
  // khoảng đã nắn cho cả prompt lẫn validate bên dưới, không đọc lại data.length_words/length_tier
  // gốc ở đâu khác trong hàm này.
  const [minWords, maxWords] = resolveLengthRange(data.level, data.length_tier);
  const targetLengthWords = Math.round((minWords + maxWords) / 2);
  const genData = { ...data, length_words: targetLengthWords, length_words_min: minWords, length_words_max: maxWords };

  // (b) Gọi AI + parse + validate.
  const r = await generateStructuredJSON({
    maxTokens: 6000, // trần chung MAX_TOKENS_CAP (aiProvider.js) — nâng 4000->6000 (2026-07-23):
    // C1 "long" (500-600 từ, xem LEVEL_LENGTH_TABLE) bị cắt giữa JSON ở 4000, parse fail.
    temperature: 0.7,
    messages: [
      { role: "system", content: GENERATE_LESSON_SYSTEM_PROMPT },
      { role: "user", content: buildGenerateLessonUserPrompt(genData) },
    ],
  });
  if (!r.ok) {
    if (r.parseError) console.error("[generate_lesson] parse error:", r.text?.slice(0, 500));
    return { error: r.error || "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: r.status || 502 };
  }
  const parsed = r.data;
  capLessonArrays(parsed);
  const validation = validateLessonShape(parsed, { minWords, maxWords, checkDialogueEnding: true });
  if (!validation.valid) {
    console.error("[generate_lesson] validate FAIL:", validation.reason, validation.actualWords, `range=[${minWords},${maxWords}]`);
    return { error: "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: 502 };
  }

  const [goalId, skinId] = await Promise.all([
    resolveOwnedGoalId(data.goal_id, ctx.studentId),
    resolveSkinId(data.skin_id),
  ]);
  const saved = await insertLesson(
    buildLessonInsertRow(parsed, { userId: ctx.studentId, source: "ai_generated", goalId, skinId, spineSlot: data.spine_slot })
  );
  if (!saved) return { error: "Tạo bài thành công nhưng lưu thất bại, vui lòng thử lại.", status: 502 };

  return { content: JSON.stringify({ lesson: saved, meta: buildMeta(r) }) };
}

export async function analyze_user_text(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!VALID_LEVELS.includes(data.level)) return { error: "Thiếu hoặc sai 'level'.", status: 400 };
  const wc = wordCount(data.user_text);
  if (wc < 20) return { error: "Văn bản quá ngắn (tối thiểu 20 từ).", status: 400 };
  if (wc > 3000) return { error: "Văn bản quá dài (tối đa 3000 từ), vui lòng chia nhỏ.", status: 400 };

  // (a) Đọc hạn mức TRƯỚC — hết hạn mức thì chặn ngay, không tốn 1 lượt gọi OpenAI thật.
  const limitCheck = await checkDailyLessonLimit(ctx.studentId);
  if (!limitCheck.allowed) return { error: limitCheck.message, status: 403 };

  // (b) Gọi AI + parse + validate.
  const r = await generateStructuredJSON({
    maxTokens: 4000, // trần chung MAX_TOKENS_CAP (aiProvider.js) — nâng từ 3500 vì A1/A2 giờ cần
    // nhiều lượt thoại hơn hẳn để đạt đủ length_words khi câu bị giới hạn ngắn (xem "LỖI THẬT
    // HAY GẶP Ở A1/A2" trong prompt), JSON output theo đó cũng dài hơn trước.
    temperature: 0.7,
    messages: [
      { role: "system", content: ANALYZE_TEXT_SYSTEM_PROMPT },
      { role: "user", content: buildAnalyzeTextUserPrompt(data.level, data.user_text) },
    ],
  });
  if (!r.ok) {
    if (r.parseError) console.error("[analyze_user_text] parse error:", r.text?.slice(0, 500));
    return { error: r.error || "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: r.status || 502 };
  }
  const parsed = r.data;
  capLessonArrays(parsed);
  // Không check checkDialogueEnding: content ở đây là VĂN BẢN THẬT của người dùng (giữ
  // nguyên 100%, xem QUY TẮC TỐI THƯỢNG trong prompt) — nếu văn bản gốc thật sự kết thúc
  // bằng câu hỏi, đó là thực tế của văn bản, không phải lỗi AI, không có gì để "sửa" bằng
  // cách bắt sinh lại. expectedWords vẫn áp dụng: content phải PHẢN ÁNH ĐỦ văn bản gốc,
  // không được cắt bớt đuôi văn bản dài (lệch quá 25% so với số từ user_text = nghi ngờ bị cắt).
  const validation = validateLessonShape(parsed, { expectedWords: wc });
  if (!validation.valid) {
    console.error("[analyze_user_text] validate FAIL:", validation.reason, validation.actualWords, validation.expectedWords);
    return { error: "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: 502 };
  }

  const saved = await insertLesson(buildLessonInsertRow(parsed, { userId: ctx.studentId, source: "user_text" }));
  if (!saved) return { error: "Phân tích thành công nhưng lưu thất bại, vui lòng thử lại.", status: 502 };

  return { content: JSON.stringify({ lesson: saved, meta: buildMeta(r) }) };
}

// meta không phải 1 phần "hợp đồng dữ liệu" Lesson JSON (mục 4 brief) — chỉ để /app/ hiển
// thị thời gian/token/chi phí ước tính lúc đo Phase 0/3, KHÔNG lưu vào bảng "lessons".
function buildMeta(r) {
  return { usage: r.usage || null, openai_duration_ms: r.durationMs, model: r.model };
}

// ============================================================
// NỢ KỸ THUẬT:
// 1. Không tự động sinh ảnh bìa (cover_image_url luôn null khi tạo) — logic
//    generateLessonCoverImage() có sẵn nhưng nằm private trong chat.js (không export
//    được vì luật "chat.js đóng băng"), và action get_lesson_cover_image đã có sẵn cho
//    phép frontend tự gọi rời sau khi lesson được lưu. Không nhân bản pipeline
//    Wikimedia/Unsplash/Pexels/AI vào đây để tránh 2 nơi cùng nuôi 1 logic — nếu cần ảnh
//    bìa tự động ngay lúc tạo, nên làm ở Phase 3 (frontend gọi get_lesson_cover_image rồi
//    PATCH cover_image_url qua 1 action backend mới, vì client không có quyền UPDATE cột
//    này trực tiếp — xem GRANT ở supabase/019_lessons.sql).
// ============================================================
