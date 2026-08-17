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
import { SUPABASE_URL, PRO_GATE_ENFORCED } from "./_shared.js";
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
const VN_TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh = UTC+7, không có giờ mùa hè — vẫn
// dùng cho checkDailyTextAnalysisLimit() bên dưới (cầu chì chống script, KHÔNG đụng tới).

// Trả về thời điểm UTC tương ứng với 00:00:00 hôm nay theo giờ VN (dùng làm mốc "gte" khi
// đếm bản ghi lessons trong ngày).
function startOfTodayVN() {
  const nowVN = new Date(Date.now() + VN_TZ_OFFSET_MS);
  const midnightVN = Date.UTC(nowVN.getUTCFullYear(), nowVN.getUTCMonth(), nowVN.getUTCDate());
  return new Date(midnightVN - VN_TZ_OFFSET_MS);
}

// 2026-08-14 — GỠ HẲN hạn mức số lượng (DAILY_LESSON_LIMIT, từng =10/ngày/tài khoản): Minh
// "Loại bỏ giới hạn. không gán giới hạn cho tài khoản nữa" — chặn thẳng việc sinh hàng loạt
// giáo trình (400+ bài) bằng chính tài khoản test/service, và không còn lý do giữ hạn mức số
// lượng cho MVP giai đoạn này. checkDailyLessonLimit() (đếm bản ghi/ngày) đã XOÁ HẲN, không
// còn gọi ở generate_lesson() bên dưới.
// VẪN GIỮ cổng gói Pro (PRO_GATE_ENFORCED, xem _shared.js) — đây là CƠ CHẾ KHÁC (theo GÓI,
// không theo SỐ LƯỢNG/NGÀY) và hiện đang TẮT (2026-08-07, "Tắt tính năng gói Pro") nên không
// ảnh hưởng hành vi thật — giữ nguyên để không phải viết lại nếu Minh bật lại cổng Pro sau này.
async function checkProGateForLessonGeneration(studentId) {
  if (!PRO_GATE_ENFORCED) return { allowed: true };
  try {
    const studentRes = await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${studentId}&select=plan`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!studentRes.ok) {
      console.error("checkProGateForLessonGeneration (plan lookup) error:", studentRes.status);
      return { allowed: false, message: "Không kiểm tra được quyền tạo bài, thử lại sau." };
    }
    const student = (await studentRes.json())?.[0];
    if (!student) return { allowed: false, message: "Không tìm thấy tài khoản học viên." };
    if (student.plan !== "pro") return { allowed: false, message: "Tính năng tự tạo bài chỉ dành cho gói Pro." };
    return { allowed: true };
  } catch (e) {
    console.error("checkProGateForLessonGeneration error:", e);
    return { allowed: false, message: "Không kiểm tra được quyền tạo bài, thử lại sau." };
  }
}

function wordCount(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

// Mốc tham chiếu 600 từ (2026-07-28, chốt với Minh — thay 3000 cũ) cho "Tôi có văn bản": văn
// bản dài hơn nên chia nhỏ, đọc/phân tích 1 lượt hợp lý hơn hẳn ở quy mô này.
const MAX_TEXT_ANALYSIS_WORDS = 600;

// "Cầu chì vô hình" chống script cho "Tôi có văn bản" (2026-07-28, chốt với Minh) — ĐỘC LẬP
// hoàn toàn với DAILY_LESSON_LIMIT (generate_lesson) — dán+phân tích văn bản có sẵn là thao tác
// NHẸ hơn hẳn tự soạn bài mới, không nên dùng chung 1 hạn mức 10/ngày với generate_lesson (sẽ
// làm cạn suất "Tạo bài học" chỉ vì dùng "Tôi có văn bản" vài lần). KHÔNG hiện số này ở UI —
// chỉ để chặn script/bot lạm dụng, người dùng thường không bao giờ chạm ngưỡng.
const DAILY_TEXT_ANALYSIS_LIMIT = 40;

async function checkDailyTextAnalysisLimit(studentId) {
  try {
    const studentRes = await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${studentId}&select=plan`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!studentRes.ok) {
      console.error("checkDailyTextAnalysisLimit (plan lookup) error:", studentRes.status);
      return { allowed: false, message: "Không kiểm tra được hạn mức phân tích văn bản, thử lại sau." };
    }
    const student = (await studentRes.json())?.[0];
    if (!student) return { allowed: false, message: "Không tìm thấy tài khoản học viên." };
    if (PRO_GATE_ENFORCED && student.plan !== "pro") return { allowed: false, message: "Tính năng phân tích văn bản chỉ dành cho gói Pro." };

    const sinceISO = startOfTodayVN().toISOString();
    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/lessons?user_id=eq.${studentId}&source=eq.user_text&created_at=gte.${sinceISO}&select=id`,
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
      console.error("checkDailyTextAnalysisLimit (count) error:", countRes.status);
      return { allowed: false, message: "Không kiểm tra được hạn mức phân tích văn bản, thử lại sau." };
    }
    const used = Number((countRes.headers.get("content-range") || "").split("/")[1] || 0);
    if (used >= DAILY_TEXT_ANALYSIS_LIMIT) {
      // Thông báo CHUNG CHUNG, không lộ con số cụ thể (đúng tinh thần "cầu chì vô hình") — nếu
      // 1 người dùng thật sự chạm ngưỡng này (40 lượt/ngày), khả năng cao là script chứ không
      // phải dùng tay, không cần giải thích chi tiết.
      return { allowed: false, message: "Đã dùng hết hạn mức phân tích văn bản hôm nay, quay lại vào ngày mai." };
    }
    return { allowed: true, used };
  } catch (e) {
    console.error("checkDailyTextAnalysisLimit error:", e);
    return { allowed: false, message: "Không kiểm tra được hạn mức phân tích văn bản, thử lại sau." };
  }
}

// Trường nâng cao rỗng -> "không có" (đúng quy ước 2 file prompt: field/industry/
// product/situation đều thuộc "Tùy chọn nâng cao" ở form. "Ngữ pháp trọng tâm" đã bỏ khỏi
// form — chọn Cấp độ CEFR là đủ đảm bảo đúng phạm vi ngữ pháp, không cần chọn thêm).
function orNone(v) {
  const s = (v ?? "").toString().trim();
  return s ? s : "không có";
}

// ====== PROMPT 1: generate_lesson — nguyên văn docs/prompt-ai-tao-bai-hoc.md, KHÔNG sửa. ======
// TÁCH RIÊNG (2026-08-05, "sửa gốc tính năng tra từ" — Minh) — khối luật GOM CỤM TỪ này TRƯỚC
// ĐÂY nằm thẳng trong GENERATE_LESSON_SYSTEM_PROMPT (không tái dùng được) — giờ dùng CHUNG cho
// CẢ 2 nơi: (1) sinh bài mới (generate_lesson/analyze_user_text, như trước), (2) "vá" phrase_
// groups cho bài CŨ chưa có (analyzeLessonPhraseGroups() bên dưới) — đảm bảo 2 nơi KHÔNG BAO GIỜ
// lệch luật nhau (sửa 1 chỗ, cả 2 tự cập nhật).
// 2026-08-11, Minh: "phrase_groups_rules phục vụ tooltip hay tách câu hay lọc cấu trúc câu?" — TRẢ
// LỜI: CHỈ phục vụ TOOLTIP (tra từ khi bấm). "reading_chunks" (tách câu) và "grammar"/
// "sentence_patterns" (phần ngữ pháp, dùng catalog Grammar Formula Chunks RIÊNG ở
// "QUY TẮC VỀ CẤU TRÚC CÂU ĐÁNG CHÚ Ý" phía trên) là 2 field/2 mục đích KHÁC, không dùng chung dữ
// liệu với phrase_groups. Bản trước có nhét thêm 1 bullet "Grammar Formula Chunks" vào chính
// PHRASE_GROUPS_RULES — SAI phạm vi (đó là việc của phần ngữ pháp), đã bỏ khỏi đây.
//
// 2026-08-11, Minh: "tại sao thêm 'Cụm danh từ' vào phrase_groups_rules mà không dùng file cụm gốc?
// Nếu còn lỗi ở cụm khác, lại tiếp tục thêm vào phrase_groups_rules?" — ĐÚNG, bản trước chỉ là
// diễn giải/rút gọn lại 24 loại cụm theo trí nhớ (không phải nguyên văn), rồi khi phát hiện lỗi ở
// đúng 1 loại (Cụm danh từ bị gắn nhãn sai cho câu có động từ chia) thì VÁ THÊM 1 đoạn riêng cho
// loại đó — đúng kiểu "chắp vá" Minh đã nhiều lần yêu cầu dừng. Viết lại ĐẦY ĐỦ NGUYÊN VẸN 24 loại
// đúng theo file gốc Minh gửi (mục I-XXIV) làm NGUỒN DUY NHẤT, KHÔNG diễn giải lại — và thêm 1
// NGUYÊN TẮC CHUNG (áp dụng đồng thời cho MỌI loại, không phải patch riêng từng loại) để tự phòng
// đúng LỚP lỗi đó (gắn nhãn 1 loại "không chứa động từ chia" cho cụm CÓ chứa động từ chia) xảy ra
// ở BẤT KỲ loại nào trong 24 loại, không chỉ riêng "Cụm danh từ".
//
// 2026-08-12 — BỎ HẲN interpolate PHRASE_GROUPS_RULES vào GENERATE_LESSON_SYSTEM_PROMPT/
// ANALYZE_TEXT_SYSTEM_PROMPT (ĐÚNG lịch sử/lý do đã áp dụng cho READING_CHUNKS_RULES bên dưới —
// xem comment ở đó): test thật A/B trực tiếp trên 6 câu giống nhau xác nhận bản NHÚNG VÀO 2
// prompt sinh CẢ BÀI (đã quá nhiều yêu cầu đồng thời) cho kết quả XẤU HƠN RÕ RỆT (chủ ngữ bị nhét
// chung "Cụm động từ" ở 5/6 câu, có câu phủ THIẾU quá nửa số từ) so với đúng CÙNG bộ rule khi chạy
// RIÊNG qua action vá "analyze_lesson_phrase_groups" (callAnalyzePhraseGroups, gửi TỪNG CÂU 1,
// không cạnh tranh yêu cầu khác — 4/6 câu ĐÚNG hoàn toàn, chỉ còn 1 câu phức khó). Quyết định:
// "phrase_groups" giờ CHỈ có qua ĐÚNG 1 con đường DUY NHẤT — lượt vá tự chạy NGAY sau khi tạo bài
// (views/createFromText.js đã gọi sẵn analyzeLessonPhraseGroups() không điều kiện, xem đầu file
// đó) — bài mới KHÔNG còn field này lúc vừa sinh, coverage-check ở action vá sẽ thấy 0 nhóm và tự
// gửi TOÀN BỘ câu qua lượt phân tích riêng. Batch sinh giáo trình chung sau này (gọi generate_lesson
// trực tiếp qua script, không qua UI) PHẢI tự gọi thêm analyze_lesson_phrase_groups sau khi tạo,
// giống các script test đã làm trong đợt này — KHÔNG còn có phrase_groups "miễn phí" kèm theo
// generate_lesson nữa.
//
// 2026-08-13 — RÚT GỌN prompt text bên dưới ~45% (19960 → ~11000 ký tự) sau khi Minh phát hiện
// chi phí OpenAI tăng bất thường: prompt này chạy TỪNG CÂU 1 (sau fix tách câu thật cùng ngày,
// xem analyzePhraseGroupsInChunks) — với bài B1+ nhiều câu/đoạn, phần system prompt ~5000 token
// bị gửi lại ĐẦY ĐỦ hàng chục lần/bài, phần lớn là chú giải LỊCH SỬ (ngày sửa, lỗi thật đã gặp,
// trích dẫn Minh) không cần cho MÔ HÌNH, chỉ cần cho NGƯỜI ĐỌC code. Toàn bộ chú giải đó dời vào
// đây + các đoạn comment phía trên — nội dung THỰC THỂ (mọi rule + ví dụ tối giản) giữ nguyên
// không đổi, chỉ bớt phần "vì sao"/"lịch sử". Các mốc đã ghi trong nội dung rút gọn:
// - "chủ ngữ không chung nhóm với Cụm động từ" (2026-08-12/13): xác nhận qua nhiều vòng test thật
//   — dù đã có ví dụ, model không tuân thủ đều 100%, xem thêm lưới đỡ bằng CODE
//   (splitLeadingSubjectPronoun bên dưới, xử lý phần AI vẫn bỏ lọt).
// - "13 mẫu ngữ pháp cho Cụm động từ" (2026-08-13, thay 10 mẫu cũ): Minh — "không yêu cầu giữ
//   trần hay sàn, yêu cầu nhận diện đúng" — đổi từ đếm-từ sang nhận-diện-mẫu.
// - "word_types"/"word_levels" (2026-08-12/13): thêm để tooltip hiện đúng loại từ NGỮ PHÁP và
//   cấp độ RIÊNG của từng từ, thay vì mượn của cả nhóm (quá thô cho nhóm nhiều từ khác cấp độ).
const PHRASE_GROUPS_RULES = `QUY TẮC VỀ GOM CỤM TỪ (chunking — trường "phrase_groups" trong MỖI phần tử "content") — CHỈ phục vụ
TRA TỪ khi bấm vào 1 từ/cụm (tooltip), KHÔNG liên quan "reading_chunks" (tách câu) hay
"grammar"/"sentence_patterns" (ngữ pháp, dùng catalog riêng).

BẮT BUỘC (hệ thống TỰ ĐỘNG KIỂM TRA bằng code): ghép TOÀN BỘ "words" của MỌI nhóm theo đúng thứ
tự PHẢI tái tạo lại CHÍNH XÁC các từ của "text" (chỉ khác dấu câu/khoảng trắng) — không thiếu,
không thừa, không đảo thứ tự, không lặp từ ở 2 nhóm. Quan trọng hơn việc chọn đúng loại cụm.

Mỗi phần tử trong "words" PHẢI là ĐÚNG 1 TỪ ĐƠN (hoặc 1 từ có dấu nháy như "don't" — vẫn 1 từ) —
KHÔNG nhét nhiều từ cách nhau bởi khoảng trắng vào 1 chuỗi.
❌ {"words": ["oil traffic could"]} ✅ {"words": ["oil","traffic","could"]} — vẫn 1 NHÓM DUY NHẤT,
chỉ mảng "words" phải tách rời từng từ.

TỪ VIẾT TẮT có dấu nháy đơn (contraction — You're, I'm, It's, He's, They've, We'll, Don't, Can't,
Won't...) LUÔN LUÔN là ĐÚNG 1 phần tử DUY NHẤT trong "words", giữ NGUYÊN VẸN dấu nháy — TUYỆT ĐỐI
KHÔNG tách thành "You"+"are"/"You"+"'re", KHÔNG viết lại thành dạng đầy đủ. Đây là lỗi THẬT lặp
lại nhiều lần (You're welcome → sai thành "You"+"are" hoặc "You"+"'re", I'm glad → sai thành
"I"+"am") khiến hệ thống bắt lỗi liên tục, quan trọng hơn hẳn việc chọn đúng loại cụm.
❌ {"words":["You","are","welcome"]} ❌ {"words":["You","'re","welcome"]}
✅ {"words":["You're","welcome"]} — "You're" giữ NGUYÊN 1 phần tử, y hệt cách nó xuất hiện trong câu.
❌ {"words":["I","am","glad"]} ✅ {"words":["I'm","glad"]}

Từ có DẤU GẠCH NỐI (long-term, 24-hour): tách thành 2 phần tử riêng trong "words" ("long","term"),
có thể vẫn cùng 1 nhóm.

QUY TẮC CHIA CỤM — 6 LOẠI DUY NHẤT (2026-08-13, thay hẳn bộ 24 loại + khung "S-V-O" thử nghiệm
trước đó — Minh gửi bộ quy tắc gốc, test thật cho kết quả ổn định + prompt NGẮN hơn nhiều lần so
với 24 loại cũ, giảm token mỗi lượt gọi). CHỈ dùng ĐÚNG 6 nhãn sau cho "type" của mỗi nhóm ≥1 từ
thuộc 1 cụm; nếu 1 từ KHÔNG thuộc cụm nào (đứng độc lập — liên từ, thán từ, trạng từ 1-từ không
bổ nghĩa trực tiếp cho gì...), tự làm 1 nhóm riêng, "type" ghi loại từ đơn của chính nó (noun/verb/
adjective/adverb/pronoun/preposition/conjunction/...), KHÔNG dùng 1 trong 5 nhãn cụm dưới đây:
- "Cụm danh từ" (Noun Phrase — NP)
- "Cụm động từ" (Verb Phrase — VP)
- "Cụm giới từ" (Prepositional Phrase — PP)
- "Cụm tính từ" (Adjective Phrase — AdjP)
- "Cụm trạng từ" (Adverb Phrase — AdvP, CHỈ dùng khi ≥2 từ; trạng từ ĐƠN 1 từ đứng độc lập thì
  dùng "type" = "adverb" như trên, không phải "Cụm trạng từ")
TUYỆT ĐỐI KHÔNG tự đặt thêm type nào ngoài 5 nhãn cụm trên + loại từ đơn — ví dụ SAI thường gặp:
"to-infinitive", "clause", "subject", "object", "verb pattern" (không phải type hợp lệ). Từ "to"
đứng ngay trước động từ nguyên mẫu (to learn, to go, to become) KHÔNG BAO GIỜ tự làm 1 nhóm/type
riêng — nó LUÔN nằm chung "Cụm động từ" với động từ chính đứng trước (mục II bên dưới).

NGUYÊN TẮC CỐT LÕI: nhận diện cụm có RANH GIỚI NGỮ PHÁP RIÊNG, KHÔNG cố tạo cụm LỚN NHẤT có thể.
1 cụm phải TÁCH khỏi cụm liền kề khi cụm đó có bản sắc ngữ pháp riêng — cụ thể: NP thường tách
khỏi PP theo sau nó; NP tách khỏi VP; VP tách khỏi PP; VP tách khỏi NP tân ngữ theo sau; AdjP tách
khỏi NP/VP; AdvP tách riêng khi nó hoạt động độc lập.
Thứ tự chia cơ bản cho 1 mệnh đề: NP → VP → NP/PP/AdjP/AdvP/từ đơn.
❌ {"words":["She","works"],"type":"Cụm danh từ"} (gộp cả chủ ngữ vào 1 nhóm — SAI)
✅ {"words":["She"],"type":"Cụm danh từ"} + {"words":["works"],"type":"Cụm động từ"} +
   {"words":["at","school"],"type":"Cụm giới từ"}

KHÔNG BAO GIỜ giữ nguyên 1 MỆNH ĐỀ (kể cả mệnh đề quan hệ/phụ) làm 1 khối — luôn tiếp tục chia
mệnh đề đó thành các cụm NP/VP/PP/AdjP/AdvP/từ đơn bên trong nó, y như mệnh đề chính. Liên từ nối
mệnh đề (and, but, because, although, that, who, which khi dẫn mệnh đề...) tự làm 1 nhóm từ đơn
riêng, KHÔNG gộp vào cụm nào.
Câu: "She stayed at home because she was sick." →
{"words":["She"],"type":"Cụm danh từ"} + {"words":["stayed"],"type":"Cụm động từ"} +
{"words":["at","home"],"type":"Cụm giới từ"} + {"words":["because"],"type":"conjunction"} +
{"words":["she"],"type":"Cụm danh từ"} + {"words":["was","sick"],"type":"Cụm động từ"}

I. "Cụm danh từ" (NP): danh từ + mọi mạo từ/đại từ sở hữu/tính từ/lượng từ đi TRỰC TIẾP cùng nó
trong 1 nhóm DUY NHẤT — KHÔNG tách "an" khỏi "accountant", KHÔNG tách "the" khỏi "company".
Danh từ+danh từ ghép nghĩa (compound noun: English teacher, coffee shop, student visa, language
learning app) LUÔN giữ 1 NP, không tách rời từng từ.
KHÔNG tự động kéo cụm giới từ (PP) theo sau vào NP — tách riêng PP:
❌ {"words":["the","book","on","the","table"],"type":"Cụm danh từ"}
✅ {"words":["the","book"],"type":"Cụm danh từ"} + {"words":["on","the","table"],"type":"Cụm giới từ"}

II. "Cụm động từ" (VP): động từ chính + trợ động từ + modal + biến đổi thời/thể/bị động, VÍ DỤ
giữ nguyên 1 VP: works, is working, has worked, has been working, will work, can speak, was
repaired, is being repaired, must have forgotten. KHÔNG tách trợ động từ khỏi động từ chính.
Verb + to-infinitive HOẶC verb + V-ing làm BỔ NGỮ CHO ĐỘNG TỪ (không phải tân ngữ danh từ) VẪN
giữ chung 1 VP với động từ chính, nhưng KHÔNG kéo tân ngữ của to-infinitive/V-ing đó vào VP:
❌ {"words":["want","to","learn","English"],"type":"Cụm động từ"}
✅ {"words":["want","to","learn"],"type":"Cụm động từ"} + {"words":["English"],"type":"Cụm danh từ"}
❌ {"words":["enjoy","reading","books"],"type":"Cụm động từ"}
✅ {"words":["enjoy","reading"],"type":"Cụm động từ"} + {"words":["books"],"type":"Cụm danh từ"}
PHÂN BIỆT BẮT BUỘC — bổ ngữ động từ (giữ trong VP) khác TÂN NGỮ DANH TỪ (tách riêng thành NP):
"want to learn" (VP) + "English" (NP tân ngữ) — KHÔNG viết chung "want to learn English" = 1 VP.

III. Giới từ/tiểu từ BẮT BUỘC đi kèm động từ để ĐỦ NGHĨA (2-3 từ, nghĩa KHÔNG suy ra được từ nghĩa
riêng từng từ cộng lại — phrasal/prepositional verb thật): depend on, belong to, listen to, wait
for, look at, look for, talk about, think about, pay for, look after, give up, carry on...) — gộp
CHUNG cả cụm (kể cả 3 từ) thành 1 "Cụm động từ" DUY NHẤT, tân ngữ theo sau tách riêng "Cụm danh từ":
✅ {"words":["listens","to"],"type":"Cụm động từ"} + {"words":["music"],"type":"Cụm danh từ"}
✅ {"words":["look","for"],"type":"Cụm động từ"} + {"words":["errors"],"type":"Cụm danh từ"}
BẮT BUỘC với cụm động từ-giới từ 3 TỪ (run out of, look forward to, put up with, get away with,
come up with, catch up with, look down on, do away with...) — GIỮ NGUYÊN CẢ 3 TỪ trong 1 "Cụm
động từ", KHÔNG tách rời, và KHÔNG gộp thêm động từ catenative đứng TRƯỚC nó (avoid, want, decide,
enjoy, keep, finish...) vào cùng nhóm — động từ catenative đó luôn là 1 "Cụm động từ" RIÊNG:
❌ {"words":["avoid","running","out","of","money"],"type":"Cụm động từ"} (gộp cả câu, tách rời cụm
   3-từ "running out of" — SAI, đây là lỗi thật đã xảy ra)
✅ {"words":["avoid"],"type":"Cụm động từ"} + {"words":["running","out","of"],"type":"Cụm động từ"}
   + {"words":["money"],"type":"Cụm danh từ"}
Giới từ TÙY CHỌN (chỉ nơi/thời gian/cách thức, KHÔNG bắt buộc để động từ đủ nghĩa — work at
school, study in Germany, eat at a restaurant, live in Hanoi): tách hẳn PP riêng khỏi VP, KHÔNG
gộp vào động từ — tự hỏi "động từ này có CẦN đúng giới từ này để đủ nghĩa không?": CÓ → gộp VP
(mục III); KHÔNG (chỉ là thông tin thêm về nơi/lúc/cách) → tách PP riêng (mục IV).

IV. "Cụm giới từ" (PP): giới từ + toàn bộ cụm danh từ theo sau nó, giữ nguyên 1 khối — in the
room, at school, on the table, with my friends, for three years. KHÔNG tách giới từ khỏi phần
danh từ theo sau (❌ {"words":["in"]}+{"words":["the","classroom"]} riêng — phải gộp 1 PP).

V. "Cụm tính từ" (AdjP): tính từ + bổ ngữ THUỘC VỀ nó (very happy, interested in music, afraid of
dogs, good at English, full of water) — không gồm chủ ngữ đứng trước nó.
"She is very good at English." → {"words":["She"],"type":"Cụm danh từ"} +
{"words":["is"],"type":"Cụm động từ"} + {"words":["very","good","at","English"],"type":"Cụm tính từ"}

VI. "Cụm trạng từ" (AdvP, ≥2 từ): very slowly, extremely carefully, much more quickly. Trạng từ
ĐƠN 1 từ bổ nghĩa cho động từ nhưng KHÔNG đứng đầu câu (also, always, often, never, just, already,
usually — ở giữa câu) PHẢI có 1 nhóm riêng (type="adverb", KHÔNG được biến mất khỏi mọi nhóm):
❌ "They also prepare reports." → {"words":["They"],...}+{"words":["prepare","reports"],...}
   (THIẾU hẳn "also" — SAI, vi phạm yêu cầu phủ đủ 100% từ)
✅ {"words":["They"],"type":"Cụm danh từ"} + {"words":["also"],"type":"adverb"} +
   {"words":["prepare"],"type":"Cụm động từ"} + {"words":["reports"],"type":"Cụm danh từ"}

KIỂM TRA CUỐI (tự rà lại trước khi trả JSON):
- Mọi từ của câu thuộc ĐÚNG 1 nhóm — không thiếu, không lặp (yêu cầu hệ thống tự kiểm, xem đầu
  quy tắc này, quan trọng hơn chọn đúng loại cụm).
- NP không dính PP/VP liền sau nó. VP không dính NP tân ngữ liền sau nó (trừ mục III — giới từ
  bắt buộc). Danh từ ghép (noun+noun) không bị tách rời.
- Không có nhóm nào là 1 MỆNH ĐỀ nguyên vẹn (relative/subordinate clause) — luôn chia tiếp bên
  trong mệnh đề đó thành NP/VP/PP/AdjP/AdvP/từ đơn.
- Auxiliary/modal không tách khỏi động từ chính. Verb+to-infinitive hoặc verb+V-ing bổ ngữ không
  kéo theo tân ngữ danh từ của nó vào cùng VP.

QUY TẮC XÁC ĐỊNH "level": tự hỏi theo ĐÚNG 1 câu hỏi duy nhất: "1 người học ĐÃ ĐẠT ĐÚNG cấp độ
này (không hơn) có khả năng cao đã BIẾT/GẶP từ hoặc cụm này trong giao tiếp thông thường KHÔNG
(không tính riêng ngành)?" — không phải "từ này CÓ THỂ xuất hiện ở cấp độ nào" (câu hỏi sai, gần
như từ nào cũng "có thể" xuất hiện ở mọi cấp nếu hỏi kiểu đó). Mốc neo:
- A1: từ chức năng cơ bản (a/an/the/is/are/have/this/that), từ vựng sinh hoạt cực phổ biến
  (name/time/day/work/like/want/good/big).
- A2: từ thông dụng nhưng ít lõi hơn A1 (decide/prepare/example/perhaps/several/although).
- B1: từ trừu tượng/học thuật nhẹ bắt đầu xuất hiện (analyze/consider/tendency/significant).
- B2: từ trừu tượng/học thuật rõ, ít dùng đời thường (implement/comprehensive/facilitate).
- C1: từ trang trọng/học thuật cao, hiếm đời thường (nonetheless/notwithstanding/ambiguous).
- THUẬT NGỮ CHUYÊN NGÀNH (balance sheet, cash flow...): xếp theo ĐỘ KHÓ NGÔN NGỮ của chính cụm
  từ đó, KHÔNG xếp theo độ khó KHÁI NIỆM chuyên môn — 1 thuật ngữ ghép từ toàn A1-A2 quen thuộc
  (cash flow = tiền + chảy) vẫn có thể xếp A2-B1 dù khái niệm phức tạp.
- TỰ KIỂM: nếu 1 bài A1/A2 có QUÁ NHIỀU cụm bị gán B1+ (hơn 1-2 cụm/câu ngắn), dừng lại xét lại —
  cấp độ CHUNG của bài phải là cấp độ của PHẦN LỚN từ vựng thật dùng trong bài.

Mỗi nhóm có cấu trúc:
  {
    "words": ["từ 1", "từ 2", ...] — ĐÚNG NGUYÊN VĂN, ĐÚNG THỨ TỰ như trong "text",
    "meaning": "nghĩa tiếng Việt của CẢ CỤM (hoặc của từ đơn nếu nhóm chỉ 1 từ)",
    "level": "cấp độ CEFR chung của cả cụm (dùng khi nhóm chỉ 1 từ, hoặc làm lưới đỡ nếu
      "word_levels" thiếu từ nào) — CÓ THỂ khác cấp độ chung của bài",
    "type": "ĐÚNG 1 trong 5 nhãn cụm ở trên (Cụm danh từ/Cụm động từ/Cụm giới từ/Cụm tính từ/Cụm
      trạng từ) — DÙNG CẢ KHI nhóm chỉ có 1 từ nhưng từ đó vẫn là chủ ngữ/động từ/tân ngữ (vd 1
      đại từ/danh từ riêng làm chủ ngữ vẫn ghi 'Cụm danh từ', 1 động từ đơn vẫn ghi 'Cụm động từ')
      — CHỈ dùng loại từ đơn (noun/verb/adjective/adverb/pronoun/preposition/conjunction/...) khi
      từ đó THỰC SỰ đứng độc lập, không thuộc cụm nào (liên từ, thán từ, trạng từ 1-từ giữa câu)",
    "word_meanings": {"từ": "nghĩa riêng của từ đó bên trong cụm"} — BẮT BUỘC PHỦ ĐỦ 100% MỌI TỪ
      trong "words" của nhóm khi nhóm có >1 từ (không thiếu bất kỳ từ nào — từ nào không có trong
      "word_meanings" thì phía hiển thị phải hiện nghĩa CẢ CỤM thay thế, trộn 2 ngôn ngữ nếu ghép
      nhiều nguồn — YÊU CẦU CỨNG, không phải tuỳ chọn). NGHĨA PHẢI THEO ĐÚNG NGỮ CẢNH CỦA CÂU/CỤM
      NÀY, TUYỆT ĐỐI KHÔNG lấy nghĩa mặc định/phổ biến nhất của từ điển nếu ngữ cảnh chỉ ra nghĩa
      khác — cùng 1 từ ở 2 câu khác nhau PHẢI cho nghĩa khác nhau nếu ngữ cảnh khác nhau. Ví dụ:
      "She works at a bank." → "works" = "làm việc" (chủ ngữ là người); "The machine works." →
      "works" = "hoạt động" (chủ ngữ là máy móc) — KHÔNG được dùng chung 1 nghĩa cho cả 2 câu.
      "I take a break." thuộc cụm cố định "take a break" → "take" KHÔNG được dịch "lấy" (nghĩa mặc
      định sai ở đây), phải ghi nghĩa theo đúng vai trò trong cụm (vd "take"="nghỉ/thực hiện",
      "break"="giải lao") — nếu tách riêng "take" hay "break" ra dịch độc lập sẽ SAI Ý CẢ CỤM.
    "word_types": {"từ": "chức năng NGỮ PHÁP RIÊNG của chính từ đó (noun/verb/adjective/adverb/
      pronoun/preposition/conjunction/determiner/auxiliary/particle/interjection...) — KHÁC "type"
      của CẢ NHÓM (vd "Cụm động từ"): loại từ của TỪNG TỪ, hiện trong tooltip khi bấm đúng từ đó.
      BẮT BUỘC PHỦ ĐỦ 100% MỌI TỪ trong "words", kể cả nhóm chỉ 1 từ (khi đó trùng "type" nhóm).
    "word_levels": {"từ": "cấp độ CEFR RIÊNG của chính từ đó — KHÁC "level" của CẢ NHÓM (1 nhóm
      nhiều từ có thể có từ dễ/khó khác nhau, tự hỏi lại đúng câu hỏi ở "QUY TẮC XÁC ĐỊNH level"
      TRÊN cho TỪNG TỪ riêng, không suy diễn từ cấp độ chung nhóm/bài). BẮT BUỘC PHỦ ĐỦ 100% MỌI
      TỪ trong "words", kể cả nhóm chỉ 1 từ (khi đó trùng "level" nhóm).
  }
- NẾU KIỂM TRA COVERAGE THẤT BẠI (words không tái tạo đủ/đúng "text"), hệ thống sẽ bắt làm lại —
  không được để sót từ nào, ở BẤT KỲ cấp độ nào.`;

// 2026-08-10, Đợt 14 — Minh: "phần tách câu là phần tinh hoa của app... cụm của tách câu có thể
// là cụm dài, không liên quan gì tới tooltip". TRƯỚC ĐÂY "Tách câu" (UI) tự suy ra từ chính
// "phrase_groups" ở trên — nhưng phrase_groups bị ép trần CỨNG ≤5 từ/nhóm (ĐÚNG cho mục đích tra
// từ khi bấm, SAI mục đích cho hiểu cấu trúc câu khi đọc) — ép dùng chung 1 nguồn buộc client
// phải cắt/ghép/vá liên tục (đã làm ở đợt 12-13), có lúc ghép lộn tiếng Anh chưa dịch vào nghĩa
// (bug thật: "but we have một số loại" — từ không có trong "word_meanings" bị giữ nguyên tiếng
// Anh rồi nối chung 1 chuỗi). Tách hẳn thành field RIÊNG.
// KHÔNG interpolate vào GENERATE_LESSON_SYSTEM_PROMPT/ANALYZE_TEXT_SYSTEM_PROMPT (đã thử, xem
// lịch sử test thật 2026-08-10: nhồi thêm 1 yêu cầu nữa vào prompt sinh CẢ BÀI — vốn đã quá nhiều
// yêu cầu đồng thời (độ dài/ngữ pháp/từ vựng/hội thoại tự nhiên/phrase_groups...) — khiến model
// LIÊN TỤC bỏ qua đúng quy tắc chia khối này dù đã viết ví dụ ❌/✅ + công thức số học rõ ràng,
// luôn trả về NGUYÊN CÂU làm 1 khối. Test lại CHÍNH prompt này khi dùng RIÊNG cho 1 việc DUY NHẤT
// (READING_CHUNKS_ANALYZE_SYSTEM_PROMPT bên dưới, không cạnh tranh với yêu cầu khác) — TUÂN THỦ
// ĐÚNG ngay. Kết luận: MỌI bài (mới lẫn cũ) đều lấy "reading_chunks" qua ĐÚNG 1 con đường DUY
// NHẤT — lượt "vá" (analyze_lesson_reading_chunks) tự chạy ngay lúc mở bài lần đầu (client kiểm
// coverage rồi tự gọi, xem ensureReadingChunksPatched() trong views/lesson.js) — không có
// nhánh nào khác tạo ra field này, tránh 2 nguồn dữ liệu KHÁC CHẤT LƯỢNG cho cùng 1 field.
const READING_CHUNKS_RULES = `QUY TẮC VỀ TÁCH CÂU ĐỌC-HIỂU (trường "reading_chunks" trong MỖI phần tử "content" — RIÊNG BIỆT
HOÀN TOÀN với "phrase_groups" ở trên, KHÔNG dùng chung mục đích: "phrase_groups" phục vụ TRA TỪ khi
bấm (cần cụm NGẮN ≤5 từ để bấm trúng đúng từ), "reading_chunks" phục vụ HIỂU CẤU TRÚC CÂU khi đọc.

2026-08-11 (SỬA LẠI SAU KHI TEST THẬT): bản trước cho phép "1 mệnh đề quan hệ/phụ dài 8-9 từ giữ
nguyên làm 1 khối" — SAI, đã bị bắt lỗi qua ảnh thật (khối bị giữ "dài như 1 mệnh đề" thay vì chia
theo cụm). Quy tắc ĐÚNG (theo đúng bộ prompt gốc Minh cung cấp): chia theo ĐÚNG CỤM NGỮ PHÁP TỰ
NHIÊN — cụm ở đây LUÔN NGẮN HƠN 1 MỆNH ĐỀ, không phải giữ nguyên cả mệnh đề. KHÔNG dùng công thức
đếm từ (đã thử, không phải vấn đề số từ mà là vấn đề ĐƠN VỊ chia sai).

I. NGUYÊN TẮC TUYỆT ĐỐI:
- Giữ NGUYÊN 100% câu gốc trong "text" ghép lại (không lược, không thêm, không đổi từ).
- KHÔNG được gộp 2 mệnh đề độc lập (nối bằng and/but/or/so/because) vào chung 1 khối.
- KHÔNG được giữ nguyên cả 1 mệnh đề phụ/quan hệ dài làm 1 khối — mệnh đề đó PHẢI được chia tiếp
  thành các cụm nhỏ hơn bên trong nó (cụm giới từ, cụm danh từ, cụm động từ...), CHIA TẠI ĐÚNG
  RANH GIỚI cụm — ví dụ mệnh đề quan hệ "in which people are paid for their recyclable waste"
  KHÔNG giữ nguyên 1 khối, mà chia thành "in which" / "people are paid" / "for their recyclable
  waste" (xem ví dụ đầy đủ ở mục III).

II. CÁC ĐƠN VỊ PHẢI GIỮ NGUYÊN LÀM 1 KHỐI (không tách rời bên trong):
- Phrasal verb (verb + particle): PHẢI viết "verb...particle (nguyên mẫu)" — ví dụ "gave up (give
  up)", "carried out (carry out)", "turned...off (turn off)" — KHÔNG tách "gave" và "up" thành 2
  nghĩa rời rạc ("đã đưa" + "lên").
- Bị động (be + V3): "was carried out (carry out)" = đã được thực hiện, "is considered" = được
  xem là — giữ nguyên cụm động từ bị động, không tách "was"/"carried"/"out" riêng.
- Modal + verb: "could have been" = lẽ ra có thể đã, "should wait" = nên chờ — giữ nguyên cụm.
- Phản thân/tự tác động (verb + himself/herself/themselves, express oneself): PHẢI viết
  "verb...reflexive (verb oneself)" — ví dụ "blamed...himself (blame oneself)" = tự trách mình,
  "prepared...herself (prepare oneself)" = tự chuẩn bị. KHÔNG tách "himself" thành 1 khối riêng
  ("himself" = bản thân) và KHÔNG viết "blamed himself" = tự trách (thiếu dạng nguyên mẫu).
- Cụm giới từ (giới từ + cụm danh từ): "in a new scheme", "for their recyclable waste", "at the
  accident site" — giữ nguyên cả cụm, không tách giới từ khỏi phần danh từ theo sau.
- Cụm danh từ (mạo từ/đại từ sở hữu + [tính từ] + danh từ, hoặc danh từ + of...): "a cargo vessel",
  "the children's parents", "5 pence per item" — giữ nguyên cả cụm.

III. VÍ DỤ CHUẨN (nguyên văn từ bộ prompt gốc, dùng để hiệu chỉnh đúng ĐỘ NGẮN của khối):
Câu: "Recycling is being encouraged in a new scheme in which people are paid for their recyclable waste."
✅ ĐÚNG (5 khối, mệnh đề quan hệ "in which..." bị chia tiếp thành 3 khối con, KHÔNG giữ nguyên):
{"reading_chunks": [
  {"text":"Recycling is being encouraged","meaning":"việc tái chế đang được khuyến khích"},
  {"text":"in a new scheme","meaning":"trong một chương trình mới"},
  {"text":"in which","meaning":"trong đó"},
  {"text":"people are paid","meaning":"người dân được trả tiền"},
  {"text":"for their recyclable waste.","meaning":"cho rác có thể tái chế của họ."}
]}
❌ SAI (giữ nguyên cả mệnh đề quan hệ dài làm 1 khối — ĐÚNG LỖI ĐÃ XẢY RA, không được lặp lại):
{"reading_chunks": [
  {"text":"Recycling is being encouraged","meaning":"việc tái chế đang được khuyến khích"},
  {"text":"in a new scheme in which people are paid for their recyclable waste.","meaning":"trong một chương trình mới, theo đó người dân được trả tiền cho rác có thể tái chế của mình."}
]}

Câu: "Any witnesses are being urged to contact police."
✅ ĐÚNG (3 khối, mỗi khối 1 cụm ngắn — bị động "are being urged" giữ nguyên, to-V giữ nguyên):
{"reading_chunks": [
  {"text":"Any witnesses","meaning":"mọi nhân chứng"},
  {"text":"are being urged","meaning":"đang được kêu gọi"},
  {"text":"to contact police.","meaning":"liên hệ với cảnh sát."}
]}

Câu: "Stock markets have gone up with the 100 index hitting an all time high."
✅ ĐÚNG (phrasal verb "have gone up (go up)" giữ nguyên 1 khối, các cụm còn lại tách riêng):
{"reading_chunks": [
  {"text":"Stock markets have gone up (go up)","meaning":"thị trường chứng khoán đã tăng"},
  {"text":"with the 100 index","meaning":"với chỉ số 100"},
  {"text":"hitting an all time high.","meaning":"đạt mức cao nhất mọi thời đại."}
]}

IV. KHÔNG ĐƯỢC LÀM:
- Không giữ nguyên cả mệnh đề quan hệ/phụ dài làm 1 khối.
- Không gộp 2 mệnh đề độc lập.
- Không tách rời phrasal verb, bị động, modal+verb, hoặc cấu trúc phản thân thành 2 khối.
- Không tách đại từ/liên từ đơn lẻ ra khỏi cụm nó thuộc về nếu việc đó làm mất nghĩa cụm.
- Không thêm/bớt/đổi từ so với câu gốc, không tóm tắt.

V. BẮT BUỘC PHỦ ĐỦ 100% (hệ thống TỰ ĐỘNG KIỂM TRA bằng code, không tốn thêm lượt AI): ghép TOÀN
BỘ "text" của MỌI khối theo đúng thứ tự PHẢI tái tạo lại CHÍNH XÁC các từ của "text" phần tử đó
(chỉ khác dấu câu/khoảng trắng) — không thiếu, không thừa, không đảo thứ tự.

VI. "meaning" của MỖI khối PHẢI là bản dịch tiếng Việt TỰ NHIÊN, SẠCH của ĐÚNG khối đó — TUYỆT ĐỐI
KHÔNG để lẫn bất kỳ từ tiếng Anh nào chưa dịch trong "meaning".

Mỗi khối có cấu trúc:
  {
    "text": "ĐÚNG NGUYÊN VĂN đoạn text của khối này, đúng thứ tự xuất hiện trong câu",
    "meaning": "nghĩa tiếng Việt tự nhiên, SẠCH, của ĐÚNG khối này (không lẫn tiếng Anh)"
  }`;

// TÁCH RIÊNG PROMPT THEO content_type (2026-08-17, Minh: "quy tắc về bài đọc và hội thoại đã set
// riêng chưa" — TRƯỚC ĐÂY 1 PROMPT DUY NHẤT chứa cả 2 nhánh "hội thoại"/"bài đọc" cùng lúc, model
// phải tự đọc qua đoạn KHÔNG liên quan tới content_type đang sinh rồi tự lọc đúng nhánh — ĐÚNG
// NGUYÊN LÝ đã xác nhận 2 lần trong dự án (reading_chunks, phrase_groups): prompt gộp nhiều mục
// đích làm giảm độ tuân thủ, tách theo ĐÚNG 1 mục đích cải thiện rõ rệt). Ghép 3 mảnh
// PREFIX + (RULES riêng theo content_type) + SUFFIX thay vì nhân đôi TOÀN BỘ prompt (phần chung
// độ dài/CEFR/schema JSON dài ~250 dòng, nhân đôi sẽ khó bảo trì — sửa 1 quy tắc chung phải nhớ
// sửa 2 chỗ).
const GENERATE_LESSON_SYSTEM_PROMPT_PREFIX = `Bạn là chuyên gia soạn giáo trình tiếng Anh cho người Việt, bám sát khung CEFR.

NHIỆM VỤ: Tạo một bài học tiếng Anh hoàn chỉnh theo yêu cầu của người dùng.

YÊU CẦU HÀNG ĐẦU — ĐỘ DÀI (ngang hàng ưu tiên với cấp độ CEFR, đọc kỹ trước khi viết): user
prompt sẽ cho một SỐ LƯỢT THOẠI/CÂU-ĐOẠN TỐI THIỂU cụ thể. Đây KHÔNG phải gợi ý — đây là ĐIỀU
KIỆN BẮT BUỘC bạn TỰ phải đạt trước khi trả JSON (2026-08-14: không còn bước máy nào đếm lại và
bắt sinh lại nếu thiếu — quyết định này ĐÃ ĐỔI vì lúc còn cơ chế đó, nó từng chặn oan nhiều bài
hợp lệ vì lý do không liên quan chất lượng thật; giờ việc đạt đủ độ dài hoàn toàn phụ thuộc vào
CHÍNH BẠN tự đếm và tự sửa trước khi trả JSON, không có ai kiểm lại giúp). Ở cấp độ câu bị giới hạn
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

QUY TẮC VỀ ĐIỂM NGỮ PHÁP TRỌNG TÂM BẮT BUỘC (2026-07-27 — chỉ có khi user prompt liệt kê rõ
"Điểm ngữ pháp trọng tâm BẮT BUỘC"; KHÔNG có mục này trong user prompt thì bỏ qua toàn bộ đoạn
này, tự chọn ngữ pháp trong phạm vi cấp độ như bình thường):
- Đây là bài đi theo lộ trình học đã định sẵn (spine) — điểm ngữ pháp trọng tâm KHÔNG phải gợi
  ý, mà là ĐIỂM DUY NHẤT bài này PHẢI dạy, đã khoá sẵn theo đúng vị trí trong lộ trình.
- "content" PHẢI thể hiện RÕ đúng điểm ngữ pháp đó, xuất hiện tối thiểu 1 LẦN THẬT SỰ RÕ RÀNG
  (không phải nhắc lướt qua) — không bắt buộc lặp nhiều lần, 1 lần dùng rõ ràng, tự nhiên là đủ.
- QUAN TRỌNG: yêu cầu này KHÔNG THAY THẾ và KHÔNG LÀM GIẢM NHẸ yêu cầu ĐỘ DÀI đã nêu ở trên —
  bài VẪN PHẢI đạt đủ khoảng từ yêu cầu (lỗi thật hay gặp là VIẾT THIẾU, không phải viết thừa,
  xem "QUY TẮC VỀ ĐỘ DÀI"). KHÔNG được cắt ngắn bài hay bỏ bớt câu vì bận tâm tới điểm ngữ pháp
  trọng tâm — viết ĐỦ NỘI DUNG tự nhiên theo đúng độ dài yêu cầu, đồng thời lồng điểm ngữ pháp
  trọng tâm vào MỘT CÁCH TỰ NHIÊN trong nội dung đó, không phải đánh đổi cái này lấy cái kia.
- KHÔNG lái sang điểm ngữ pháp khác cùng cấp độ dù hợp lý về ngữ cảnh (ví dụ được giao trọng
  tâm "Thì hiện tại đơn" thì KHÔNG được viết chính bằng "will"/tương lai dù chủ đề có vẻ hợp —
  đây CHÍNH XÁC là lỗi thật đã xảy ra trước khi có ràng buộc này: bài gắn nhãn A1 nhưng dùng
  "will" làm trọng tâm, trong khi "will" thuộc A2 theo catalog, không phải A1).
- "grammar" trong JSON kết quả BẮT BUỘC có đúng 1 mục dùng CHÍNH XÁC tên (trường "name_vi") đã
  cho ở điểm ngữ pháp trọng tâm này — được phép thêm tối đa 1 điểm phụ khác cùng cấp độ nếu THẬT
  SỰ xuất hiện tự nhiên trong bài, nhưng điểm bắt buộc không được thiếu.

QUY TẮC VỀ TỪ CHUYÊN NGÀNH:
- Lượng từ chuyên ngành được cho dưới dạng SỐ LƯỢT xuất hiện tuyệt đối trong bài (không phải phần trăm), bất kể độ dài bài dài hay ngắn.
- Ví dụ: lượng từ chuyên ngành = 20 → chèn khoảng 20 lượt từ/cụm từ chuyên ngành trong toàn bài (một từ lặp lại vẫn tính mỗi lần xuất hiện).
- Từ chuyên ngành phải lấy từ Lĩnh vực / Ngành nghề / Sản phẩm được cung cấp. Nếu cả ba đều là "không có" thì bỏ qua RIÊNG yêu cầu chuyên ngành này — "vocabulary" VẪN PHẢI có đủ số lượng theo mục SỐ LƯỢNG bên dưới, chỉ đổi 100% sang từ vựng phổ thông, KHÔNG được để mảng rỗng.
- Mọi từ chuyên ngành xuất hiện trong bài PHẢI có mặt trong danh sách "vocabulary" của kết quả.

QUY TẮC VỀ CHỦ ĐỀ (form "Tạo bài học" 2026-07-23 bỏ ô nhập Chủ đề — luôn tự sinh):
- Nếu Chủ đề là "không có" VÀ Lĩnh vực cũng "không có": tự chọn 1 chủ đề giao tiếp hàng ngày
  thông dụng (chào hỏi, mua sắm, hỏi đường, đặt hàng, gọi món, đi khám bệnh nhẹ...), không cần
  liên quan chuyên ngành gì.
- Nếu Chủ đề là "không có" NHƯNG có Lĩnh vực: tự chọn 1 chủ đề PHÙ HỢP với đúng Lĩnh vực đó
  (không lái sang chủ đề chung chung không liên quan).

QUY TẮC VỀ TÍNH THỜI SỰ (2026-08-09, Đợt 3 mục 17 — Minh phản hồi thật: bài sinh ra nhắc tới
Excel "như thể một phát hiện/xu hướng mới", trong khi Excel là phần mềm phổ biến từ hàng chục
năm trước, không còn gì mới mẻ để nhấn mạnh):
- Bối cảnh bài học PHẢI phản ánh đúng thực tiễn công việc/công nghệ ĐƯƠNG ĐẠI (năm hiện tại,
  xem "Ngày hiện tại" trong user prompt nếu có) — tránh viết như thể các công cụ/quy trình đã
  phổ biến từ lâu là điều mới mẻ, đáng chú ý, hay hiện đại.
- KHÔNG cấm nhắc TÊN công cụ cũ nếu THẬT SỰ vẫn được dùng phổ biến trong thực tế nghề đó (ví dụ
  Excel vẫn là công cụ kế toán/tài chính hàng ngày) — chỉ tránh CÁCH VIẾT khiến nó nghe như phát
  hiện/xu hướng mới ("gần đây", "hiện đại", "công cụ mới"...). Nếu ngữ cảnh phù hợp, có thể nhắc
  tới các công cụ/thực hành thật sự đương đại hơn (tự động hoá, phần mềm đám mây, AI hỗ trợ công
  việc...) một cách tự nhiên, không gượng ép nhồi nhét.

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

`;

// PHẦN RIÊNG "hội thoại" — CHỈ nối vào prompt khi content_type === "dialogue", "bài đọc" KHÔNG
// hề thấy đoạn này.
const DIALOGUE_ONLY_RULES = `
QUY TẮC VỀ NỘI DUNG HỘI THOẠI: mô phỏng 1 cuộc trao đổi tự nhiên giữa các nhân vật có vai trò rõ
ràng — tập trung vào giao tiếp, phản hồi, hỏi-đáp, trao đổi thông tin, giải quyết tình huống. Viết
dạng hội thoại 2 người, mỗi lượt thoại là một phần tử trong mảng, có tên người nói.

QUY TẮC VỀ GIỌNG VĂN (2026-08-14, Minh phản hồi thật: nội dung sinh ra hiện khá khô khan, cần
sinh động hơn — CHỈ đổi CÁCH VIẾT, không đổi/nới lỏng ràng buộc khác như ĐỘ DÀI/cấp độ ngữ
pháp/TÌNH HUỐNG): đề cao HÀI HƯỚC, THÔNG MINH, DÍ DỎM, SINH ĐỘNG — nhân vật có cá tính riêng
(không nói kiểu trả lời máy móc, đúng chuẩn), thỉnh thoảng chêm phản ứng bất ngờ nhẹ, câu đùa/nhận
xét dí dỏm phù hợp ngữ cảnh (kể cả trong tình huống công việc — người thật vẫn đùa vui khi làm
việc), "nhiều chuyện" theo nghĩa tự nhiên bàn tán/hỏi han thêm ngoài lề chứ không chỉ hỏi-đáp cụt
lủn đúng mục đích. Ưu tiên để nhân vật CHIA SẺ một điều hay/kinh nghiệm/mẹo thật cụ thể qua lời
thoại tự nhiên (không phải giảng giải khô khan) — người đọc học được điều gì đó thú vị, không chỉ
theo dõi một giao dịch/tác vụ khô cứng. Vẫn PHẢI đúng cấp độ CEFR (từ vựng/ngữ pháp/độ dài câu như
đã quy định) — hài hước/sinh động không có nghĩa là dùng từ lóng hay cấu trúc vượt cấp độ.

QUY TẮC VỀ TÊN NHÂN VẬT HỘI THOẠI (2026-08-14, Minh chốt): nếu "Chủ đề"/"Tình huống" đã cho ở
trên NÊU RÕ tên 1 nhân vật cụ thể (thường là nhân viên phía công ty/ngành, do bước chọn chủ đề đã
gán sẵn) — dùng ĐÚNG NGUYÊN VĂN tên đó, không đổi. Nếu KHÔNG có tên nào được nêu rõ (bài tự chọn
hoàn toàn), chọn tên nhân vật NHÂN VIÊN chính từ ĐÚNG danh sách sau, xoay vòng qua nhiều bài khác
nhau (không lặp mãi 1-2 tên quen):
- Nữ: Phương Ánh, Thúy Vy, Trang
- Nam: Giàu, Khang
Nhân vật ĐỐI DIỆN (khách hàng, đối tác, kiểm toán viên, ngân hàng, cấp trên...) KHÔNG bị giới
hạn vào danh sách trên — tự đặt tên phù hợp vai trò, XEN KẼ người Việt và người nước ngoài tuỳ
tình huống cho đa dạng (đối tác/khách hàng/kiểm toán quốc tế dùng tên nước ngoài tự nhiên).

QUY TẮC VỀ GIỚI TÍNH NHÂN VẬT (2026-08-08): hệ thống dùng "characters" để chọn ĐÚNG giọng đọc
nam/nữ cho từng nhân vật — liệt kê MỌI tên/vai trò xuất hiện ở trường "speaker" trong "content"
(đúng NGUYÊN VĂN từng giá trị "speaker" đã dùng, không đổi cách viết), kèm giới tính THẬT của
nhân vật đó theo đúng tên/vai trò/ngữ cảnh bạn vừa viết (vd "CEO"/"CFO"/"Staff" vẫn phải xác định
rõ nam hay nữ dựa vào cách bạn đã mô tả nhân vật đó trong bài, không được bỏ trống hay đoán ngẫu
nhiên) — mỗi nhân vật xuất hiện ĐÚNG 1 lần trong mảng này dù nói nhiều lượt trong bài. Tên trong
danh sách "QUY TẮC VỀ TÊN NHÂN VẬT HỘI THOẠI" ở trên đã CÓ SẴN giới tính đúng (Phương Ánh/Thúy
Vy/Trang = nữ, Giàu/Khang = nam) — không cần suy luận lại riêng cho các tên đó.

QUY TẮC HỘI THOẠI TỰ NHIÊN:
- Độ dài lượt thoại PHẢI biến thiên rõ rệt: có lượt chỉ 1-4 từ (Sure. / Of course. / How many? / That's right.), có lượt dài 2-3 câu khi nhân vật giải thích, kể, hoặc phàn nàn. CẤM chuỗi 3 lượt liên tiếp có độ dài tương đương nhau.
- Vai không đối xứng: xác định ai là người CẦN gì trong tình huống (khách phàn nàn nói nhiều, nhân viên xác nhận ngắn; người hỏi đường nói ngắn, người chỉ đường nói dài) và phân bổ lời thoại theo đó.
- Dùng phản hồi ngắn tự nhiên đúng cấp độ: A1-A2 (Yes, sure / Oh no / Thank you so much), B1+ thêm (Actually... / I see what you mean / Well, the thing is...). Không nhồi vào mọi lượt — rải tự nhiên.
- Ít nhất 1 lần trong bài: một nhân vật hỏi lại để làm rõ hoặc xác nhận thông tin (Sorry, did you say 3 PM? / So that's two boxes, right?) — đây là kỹ năng giao tiếp thật cần dạy.
- Tổng số từ toàn bài vẫn theo length_words; biến thiên nằm ở phân bổ giữa các lượt, không phải kéo dài bài.
- BẮT BUỘC hội thoại TRỌN VẸN: có mở đầu — diễn biến — chốt lại tự nhiên (vd cảm ơn/tạm biệt/xác nhận đã xong việc). LƯỢT THOẠI CUỐI CÙNG TUYỆT ĐỐI KHÔNG ĐƯỢC LÀ CÂU HỎI CHƯA CÓ LỜI ĐÁP (lỗi thật đã gặp: bài kết ở "Will I get paid for this delivery?" rồi hết, không nhân vật nào trả lời) — nếu gần hết length_words mà diễn biến chưa xong, RÚT NGẮN phần giữa để dành chỗ chốt lại cho trọn, KHÔNG được cắt ngang khi câu chuyện còn dở.
`;

// PHẦN RIÊNG "bài đọc" — CHỈ nối vào prompt khi content_type === "reading", "hội thoại" KHÔNG hề
// thấy đoạn này (2026-08-17, viết lại sau khi xác nhận thật qua batch A1: "bài đọc" bị kéo thành
// bản tóm tắt/nhật ký cá nhân của "hội thoại" — SAI GỐC vì trước đây không quy định 2 loại phải
// có MỤC ĐÍCH GIAO TIẾP khác nhau, và bản CŨ dùng cụm "viết như người có kinh nghiệm thật đang
// chia sẻ" CHÍNH LÀ NGUYÊN NHÂN GỐC khiến model tự đẩy sang ngôi thứ nhất mơ hồ "We have a
// desk...").
const READING_ONLY_RULES = `
QUY TẮC VỀ NỘI DUNG BÀI ĐỌC: PHẢI là 1 bài viết CUNG CẤP THÔNG TIN hoàn chỉnh, có giá trị nội
dung ĐỘC LẬP — phát triển chủ đề theo hướng kiến thức/kinh nghiệm/quan sát/giải thích/góc nhìn
thực tế. TUYỆT ĐỐI KHÔNG được: kể lại nội dung 1 cuộc hội thoại; tóm tắt điều nhân vật đã nói;
chuyển lượt thoại thành 1 đoạn văn xuôi; lặp lại đúng chuỗi thông tin/ví dụ chỉ đổi cách diễn đạt.
Phải TỰ ĐỨNG ĐỘC LẬP được, trả lời đúng câu hỏi "người học hiểu thêm/học được ĐIỀU GÌ từ bài đọc
này?" — không phải "làm sao kể lại 1 tình huống giao tiếp bằng văn xuôi?".
CẤU TRÚC BẮT BUỘC: chia thành NHIỀU đoạn văn RÕ RÀNG, mỗi đoạn là 1 phần tử RIÊNG trong mảng, mỗi
đoạn ĐÚNG 2-4 câu — TUYỆT ĐỐI KHÔNG được gộp cả bài thành 1 phần tử duy nhất dù bài ngắn, CŨNG
KHÔNG được chẻ vụn mỗi phần tử chỉ 1 câu (hệ thống sẽ TỰ ĐỘNG KIỂM TRA VÀ BẮT LỖI bằng code cả 2
chiều). Mỗi đoạn nên có 1 chức năng rõ ràng (mở đầu chủ đề/tình huống → phát triển ý chính → ví
dụ/trải nghiệm/giải thích → kết luận hoặc mở rộng ý nghĩa thực tế) — không bắt buộc đúng 4 đoạn,
nhưng phải phân đoạn hợp lý.

QUY TẮC VỀ GIỌNG VĂN: giọng văn phải TỰ NHIÊN, CỤ THỂ, CÓ THÔNG TIN THỰC TẾ, đúng cấp độ CEFR —
"giọng người viết am hiểu thực tế" KHÔNG có nghĩa BẮT BUỘC dùng ngôi thứ nhất, KHÔNG tự ý dùng
I/we/my/our/me chỉ để tạo cảm giác chân thực. Tránh văn phong giáo khoa khô cứng, tránh tuyên bố
chung chung không nội dung, tránh "giả vờ là 1 người cụ thể đang kể chuyện" nếu nội dung không yêu
cầu — "thật" nghĩa là THÔNG TIN cụ thể/có giá trị, không phải AI phải đóng vai 1 nhân vật. Vẫn
PHẢI đúng cấp độ CEFR (từ vựng/ngữ pháp/độ dài câu như đã quy định).

QUY TẮC VỀ NGÔI KỂ: mặc định dùng NGÔI THỨ BA, khách quan, trình bày trực tiếp về chủ đề (vd "The
desk is usually placed near the window." / "Many small teams prefer to place a shared desk near
the window."). CHỈ dùng ngôi thứ nhất ("I"/"we") khi nội dung THỰC SỰ phù hợp với 1 người kể
chuyện cụ thể — nếu dùng, câu ĐẦU TIÊN của bài PHẢI xác lập rõ: người kể là ai, quan hệ của người
kể với chủ đề, vì sao người kể có kinh nghiệm/góc nhìn này (vd "As an accountant with five years
of experience, I..."). TUYỆT ĐỐI KHÔNG dùng ngôi thứ nhất với narrator không xác định — cấm các
câu mở đầu kiểu "We have a desk near the window."/"We usually do this."/"Our team often..." khi
người đọc CHƯA biết "we"/"our" là ai.
`;

const GENERATE_LESSON_SYSTEM_PROMPT_SUFFIX = `
QUY TẮC VỀ ĐỘ DÀI (BẮT BUỘC TỰ ĐẠT, KHÔNG PHẢI GỢI Ý):
- Tổng số từ tiếng Anh trong TOÀN BỘ mảng "content" (đếm cả text của mọi phần tử cộng lại) phải nằm trong khoảng ±25% của length_words yêu cầu. KHÔNG CÓ bước máy nào đếm lại và bắt sinh lại nếu lệch (2026-08-14, đã gỡ hẳn — xem lý do ở "YÊU CẦU HÀNG ĐẦU — ĐỘ DÀI" phía trên) — bạn PHẢI tự đếm và tự đạt đúng khoảng này trước khi trả JSON, không có lượt kiểm lại nào khác. Bài chỉ yêu cầu ~100 từ mà chỉ viết 40-50 từ là KHÔNG ĐẠT, phải viết đủ.
- LỖI THẬT HAY GẶP Ở HỘI THOẠI MỌI CẤP ĐỘ (không riêng A1/A2): quy tắc "lượt ngắn 1-4 từ xen giữa lượt dài" (QUY TẮC HỘI THOẠI TỰ NHIÊN) khiến độ dài trung bình MỖI LƯỢT THỰC TẾ thấp hơn nhiều so với cảm giác khi viết — đo được thật: hội thoại B1 yêu cầu 200 từ chỉ đạt ~110-140 từ (thiếu 30-45%) khi dừng theo cảm giác "đã đủ ý" thay vì đếm số lượt. Cách DUY NHẤT để đạt đủ length_words khi có nhiều lượt ngắn là TĂNG TỔNG SỐ LƯỢT THOẠI (hội thoại) hoặc SỐ CÂU/ĐOẠN (bài đọc) — KHÔNG PHẢI viết từng lượt dài hơn trần cấp độ cho phép. User prompt đã tính SẴN số lượt/đoạn tối thiểu cần có (công thức đã cộng biên an toàn cho đúng thực tế lượt ngắn) — coi đó là SỐ CỨNG phải đạt hoặc vượt, không phải gợi ý tham khảo. Diễn biến câu chuyện phải đủ phong phú để tự nhiên cần nhiều lượt thoại đó (chẻ tình huống thành nhiều bước nhỏ, xem ví dụ ở đầu prompt) — không lặp ý, không rề rà giả tạo.

QUY TẮC VỀ CẤU TRÚC CÂU ĐÁNG CHÚ Ý (trường "grammar"/"sentence_patterns" — 2026-08-14, Đợt 7,
đổi hẳn nội dung "sentence_patterns" ở B1 trở lên sang CỤM TỪ ĐÁNG CHÚ Ý thay vì công thức ngữ
pháp — lý do: người học B1+ đã nắm cấu trúc câu cơ bản từ lâu, liệt kê lại kiểu "S + can + V"
không có giá trị học thêm gì; cái họ cần là CÁCH DIỄN ĐẠT/CỤM TỪ tự nhiên hay gặp lại được):
- Mỗi cấp CEFR có 1 tập cấu trúc "công thức" (Grammar Formula Chunks) đặc trưng cho trường
  "grammar" (LUÔN dùng công thức ngữ pháp ở MỌI cấp độ, mục này không đổi), KHÔNG học lẫn cấp cao
  hơn khi viết bài cấp thấp:
  * A1: am/is/are (hiện tại đơn của "be"), have/has (sở hữu), do/does + V (nghi vấn/phủ định
    hiện tại đơn), động từ thường số ít/nhiều (work/works), am/is/are + V-ing (hiện tại tiếp
    diễn), quá khứ đơn V-ed/bất quy tắc (went, saw), there is/there are.
  * A2: am/is/are + going to + V (dự định), will + V (tương lai), can/can't + V, have to/has to
    + V, would like + to V, used to + V.
  * B1: have/has + V3 (hiện tại hoàn thành), have/has been + V-ing (hiện tại hoàn thành tiếp
    diễn), was/were + V-ing (quá khứ tiếp diễn), had + V3 (quá khứ hoàn thành), be + V3 (bị
    động), modal nâng cao (should/must/might + have + V3), mệnh đề quan hệ đơn giản (who/that),
    mệnh đề vì/vì vậy/nếu (because/although/if).
  * B2: have been + V-ing (hoàn thành tiếp diễn), should have done/could have gone (modal hoàn
    thành), verb pattern (V + to V, V + V-ing, V + O + to V), câu điều kiện loại 0-3, cấu trúc so
    sánh (comparative/superlative/as...as), there + be nâng cao (there seems to be), it + be (it
    is important to...), participle/infinitive/gerund phrase, mệnh đề danh từ/mệnh đề quan hệ rút
    gọn, collocation/fixed expression học thuật nhẹ.
  * C1: đảo ngữ (inversion), câu chẻ (cleft sentence), danh động từ hoá (nominalisation), tỉnh
    lược (ellipsis), thành ngữ, cấu trúc văn phong học thuật nâng cao.
- "grammar": chọn 2-4 điểm ngữ pháp THẬT SỰ dùng trong bài, đúng cấp độ (nếu có "Điểm ngữ pháp
  trọng tâm BẮT BUỘC" ở trên, mục đó LUÔN có mặt, xem quy tắc riêng).
- "sentence_patterns" — NỘI DUNG KHÁC NHAU theo cấp độ bài (đọc đúng "Cấp độ" đã cho ở phần yêu
  cầu bài học):
  * NẾU cấp độ là A1 hoặc A2: giữ nguyên cách cũ — chọn 1-3 KHUÔN CÂU (ưu tiên các "công thức"
    Grammar Formula Chunks liệt kê ở trên theo đúng cấp) THẬT SỰ xuất hiện trong "content", viết
    "pattern" thành khuôn câu có chỗ trống, tự nhiên (vd "I would like to V..." không viết "S +
    would like + to V" trừu tượng).
  * NẾU cấp độ là B1, B2 hoặc C1: KHÔNG liệt kê công thức ngữ pháp kiểu "S + V + O" hay "S + can
    + V" nữa (đã có "grammar" lo phần này) — thay vào đó chọn 1-3 CỤM TỪ/CÁCH DIỄN ĐẠT đáng chú ý
    THẬT SỰ xuất hiện trong "content": collocation (đi cùng nhau tự nhiên, vd "avoid running out
    of money", "consult a financial advisor"), cụm giới từ/động từ cố định hay lặp lại trong giao
    tiếp thực tế (vd "depend heavily on", "be responsible for"), hoặc cách diễn đạt/thành ngữ nhẹ
    đáng học lại. "pattern" ghi ĐÚNG NGUYÊN VĂN cụm đó (không phải khuôn có chỗ trống, không phải
    công thức trừu tượng) — vd "pattern": "avoid running out of money", KHÔNG viết "S + avoid +
    V-ing + O". TUYỆT ĐỐI CẤM dùng dấu ba chấm "..." hay bất kỳ chỗ trống nào trong "pattern" ở
    mức B1 trở lên (lỗi thật đã gặp: model viết "If a company depends on ...", "A business that
    ... is more likely to ..." — đây VẪN LÀ khuôn câu trừu tượng trá hình, SAI như công thức
    S+V+O) — "pattern" phải là 1 CHUỖI TỪ LIỀN MẠCH, ĐẦY ĐỦ, không chỗ trống, đúng ví dụ ❌/✅:
    ❌ "If a company depends on ..." / ✅ "depend heavily on" — ❌ "A business that ... is more
    likely to ..." / ✅ "is more likely to face" hoặc "fails to plan ahead".
  Trong cả 2 trường hợp: trích "example_from_lesson" ĐÚNG NGUYÊN VĂN câu ví dụ trong "content" —
  đây là nội dung hiển thị trực tiếp ở tab "Ngữ pháp" cho người học, không phải phần phân tích ẩn
  (quy tắc SỐ LƯỢNG/chất lượng ĐẦY ĐỦ của trường này ở mục riêng phía sau, xem "sentence_patterns:
  quét TOÀN BỘ...").

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
  "characters": [
    { "name": "ĐÚNG NGUYÊN VĂN 1 giá trị speaker đã dùng trong content", "gender": "male hoặc female" }
  ],
  "content": [
    {
      "speaker": "tên người nói (chỉ có khi là dialogue, bài đọc thì bỏ trường này)",
      "text": "câu/đoạn tiếng Anh",
      "translation": "bản dịch tiếng Việt của câu/đoạn này",
      "explanation": "phân tích ĐÚNG câu/đoạn này (2-3 dòng, tiếng Việt): MỞ ĐẦU NGAY bằng chính điểm đáng chú ý của CÂU NÀY (từ/cụm cụ thể, cách diễn đạt cụ thể, hoặc lý do dùng cách nói này trong tình huống) — CẤM mở đầu bằng cách gọi tên thì/cấu trúc chung chung trước, dưới BẤT KỲ cách diễn đạt nào của khuôn 'Câu này dùng/sử dụng thì...', 'Câu này ở thì...', 'Thì X trong câu này diễn tả...' (cấm cả khuôn mẫu, không chỉ đúng câu chữ nêu trên — đổi từ ngữ nhưng vẫn mở đầu bằng cách gọi tên thì/cấu trúc trước tiên vẫn tính là vi phạm). Nêu VÌ SAO câu này dùng dạng đó trong tình huống này nếu có ích, nhưng KHÔNG phải câu mở đầu. Mỗi câu phải đọc như đang phân tích RIÊNG câu đó, không phải dán nhãn ngữ pháp hàng loạt. Ngắn gọn, đúng trọng tâm, không lan man."
    }
  ],
  "vocabulary": [
    {
      "word": "từ hoặc cụm từ",
      "ipa": "phiên âm IPA",
      "type": "với TỪ ĐƠN: loại từ (noun, verb, adj...). Với CỤM TỪ (word có khoảng trắng): PHẢI chọn ĐÚNG 1 trong 3 nhãn sau theo cấu trúc thật của cụm — 'Cụm danh từ', 'Cụm động từ + giới từ (phrasal verb)', hoặc 'N + giới từ + N' — không dùng nhãn khác, không để trống",
      "meaning": "nghĩa tiếng Việt",
      "example": "một câu ví dụ khác với câu trong bài, đúng cấp độ",
      "example_translation": "bản dịch tiếng Việt của chính câu \\"example\\" ở trên",
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
      "pattern": "A1/A2: khuôn câu có chỗ trống, viết tự nhiên (KHÔNG công thức trừu tượng S+V+O). B1 trở lên: CỤM TỪ/CÁCH DIỄN ĐẠT đáng chú ý ĐÚNG NGUYÊN VĂN xuất hiện trong bài (KHÔNG công thức ngữ pháp, xem quy tắc riêng)",
      "example_from_lesson": "trích ĐÚNG NGUYÊN VĂN một câu đầy đủ trong \\"content\\" có dùng khuôn/cụm này, không bịa thêm",
      "example_translation": "bản dịch tiếng Việt của chính câu \\"example_from_lesson\\" ở trên",
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
- grammar: NẾU user prompt có "Điểm ngữ pháp trọng tâm BẮT BUỘC" — mảng này PHẢI có đúng 1 mục dùng CHÍNH XÁC tên đã cho (xem quy tắc riêng ở trên), được thêm tối đa 1 điểm phụ khác cùng cấp nếu thật sự xuất hiện. NẾU KHÔNG có mục bắt buộc nào (form tự do): CHỈ chọn điểm ngữ pháp ĐÚNG CẤP ĐỘ của bài (bài B1 → chỉ điểm B1), là trọng tâm bài này dạy. KHÔNG liệt kê cấu trúc thuộc cấp thấp hơn dù chúng xuất hiện trong bài. Nếu bài không có điểm ngữ pháp nào đúng cấp, trả mảng rỗng.
- sentence_patterns: quét TOÀN BỘ "content" (không giới hạn ở câu có điểm ngữ pháp trọng tâm), CHỈ chọn khuôn câu THỰC SỰ đáng học lại để dùng trong giao tiếp (câu hỏi thông dụng, cấu trúc tái dùng được ở nhiều tình huống khác) — bỏ qua câu quá đơn giản không có gì đáng nêu (vd "I like coffee"). Đây là phép thử NĂNG LỰC PHÁN ĐOÁN, không phải bài liệt kê — việc khó không phải "tìm cấu trúc" (câu nào cũng có cấu trúc) mà là biết cái nào ĐÁNG chọn, cái nào KHÔNG. Bắt buộc: (1) khuôn phải VỪA TẦM cấp độ của bài — không chọn khuôn quá cơ bản mà cấp độ đó chắc chắn đã thấm từ lâu, cũng không chọn khuôn vượt quá xa khiến người học chưa dùng được ngay; (2) "why_worth_it" phải là lý do THẬT — nếu không nghĩ ra lý do thuyết phục cho 1 khuôn, ĐỪNG đưa khuôn đó vào, KHÔNG hạ chuẩn để đủ số lượng. KHÔNG trùng với "grammar" (góc nhìn khác nhau: "grammar" là quy tắc ngữ pháp trọng tâm, "sentence_patterns" là khuôn câu thực dụng — được phép dùng chung 1 câu nguồn nhưng góc nhìn phải khác, không liệt kê lại y hệt). Số lượng: tối thiểu 5, tối đa 8 (2026-08-12, nâng sàn từ 3 — Minh: "phần Ngữ pháp thường quá sơ sài", đo được thật hầu hết bài chỉ có "grammar" rỗng + "sentence_patterns" dừng đúng ở mức sàn cũ 3, tab chỉ còn 3 mục — trường này CHÍNH LÀ nơi bù đắp khi "grammar" ít điểm, không phải phần phụ có thể để tối thiểu) — vẫn GIỮ ĐÚNG yêu cầu chất lượng ở trên (why_worth_it phải thật, không hạ chuẩn), chỉ đổi mức sàn để bài THÔNG THƯỜNG (không phải mọi bài) đủ khuôn câu đáng học, quét kỹ hơn TOÀN BỘ "content" trước khi kết luận không đủ khuôn để đạt sàn 5.
- exercises: tối thiểu 3 câu trắc nghiệm + 2 câu điền từ. Câu hỏi phải kiểm tra nội dung và từ vựng CỦA CHÍNH BÀI NÀY, không hỏi kiến thức bên ngoài. "grammar_tag" dùng để hệ thống gợi ý ôn tập sau này — không ảnh hưởng nội dung câu hỏi, chỉ gắn nhãn ĐÚNG với điểm ngữ pháp câu đó thực sự kiểm tra. BẮT BUỘC mọi object trong "exercises" PHẢI có key "grammar_tag" — KHÔNG được bỏ qua key này dưới bất kỳ trường hợp nào (lỗi thật đã gặp: model bỏ hẳn key thay vì ghi null). Giá trị CHỈ có 2 dạng hợp lệ: string khớp NGUYÊN VĂN 1 "name" trong "grammar", HOẶC chính xác giá trị null (không phải chuỗi rỗng, không phải thiếu key) khi câu không gắn điểm ngữ pháp nào.`;

function buildGenerateLessonSystemPrompt(contentType) {
  const middle = contentType === "dialogue" ? DIALOGUE_ONLY_RULES : READING_ONLY_RULES;
  return GENERATE_LESSON_SYSTEM_PROMPT_PREFIX + middle + GENERATE_LESSON_SYSTEM_PROMPT_SUFFIX;
}

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
// Export (2026-07-28, "Tin tức tự sinh") — news.js tái dùng ĐÚNG cơ chế tính khoảng độ dài +
// điểm nhắm ngẫu nhiên đã kiểm chứng thật hôm nay (xem callAndValidateLesson bên dưới, cũng
// export), thay vì tự viết lại 1 bản logic riêng dễ lệch/thiếu test.
export function resolveLengthRange(level, lengthTier) {
  const entry = LEVEL_LENGTH_TABLE[level];
  if (!entry) return [180, 230]; // phòng hờ, level đã validate hợp lệ trước đó nên không nên tới đây
  if (entry.fixed) return entry.fixed;
  const tier = VALID_LENGTH_TIERS.includes(lengthTier) ? lengthTier : "medium";
  return entry[tier];
}

// "Độ dài tự nhiên hơn" (2026-07-28, yêu cầu người dùng — xem
// yeu-cau-mach-chu-de-va-do-dai-tu-nhien.md Việc 2): TRƯỚC ĐÂY mọi bài cùng level+tier đều nhắm
// ĐÚNG 1 điểm cố định (trung điểm khoảng CEFR), khiến các bài liên tiếp dài gần như y hệt nhau —
// không giống cách người viết thật không bao giờ canh đúng 1 độ dài mỗi lần. Random hoá điểm
// nhắm MỖI LẦN GỌI (dùng để tính số lượt thoại/số đoạn cơ học bên dưới, KHÔNG đổi khoảng
// min/max CEFR hiển thị cho model — bảng đó vẫn là khung tham chiếu duy nhất, không đổi).
// LỆCH HẲN vùng chọn về nửa TRÊN [min+30%khoảng, max] (KHÔNG đối xứng — sửa 2026-07-28 sau khi
// test thật lộ undershoot nặng: A1 dialogue 2 mẫu random tới gần đáy khoảng đều ra bài CHỈ 53-55
// từ, dưới cả sàn CHÍNH THỨC 60; B1 reading 1 mẫu random gần đáy ra 143/191; C1 reading random
// gần đáy ra 280/454 — GẦN NHƯ THIẾU HẲN 40-60%, không phải lệch nhẹ). Lý do kỹ thuật: model có
// thiên lệch viết thiếu MỘT CHIỀU đã ghi nhận nhất quán qua RẤT NHIỀU lần đo trong toàn bộ lịch
// sử file này ("lỗi thật đo được LUÔN LÀ VIẾT THIẾU, chưa từng gặp viết thừa") — random hoá ĐỐI
// XỨNG quanh khoảng (bản đầu tiên, đã bỏ) coi undershoot và overshoot như rủi ro ngang nhau, SAI
// với thực tế đo được. Giữ vùng chọn LỆCH vào nửa trên (30%-100% của khoảng, không chỉ 1 điểm
// giữa cố định như bản CŨ TRƯỚC 2026-07-28) — vẫn tạo dao động thật giữa các bài (không còn luôn
// đúng 1 con số), nhưng không còn random tới vùng đáy vốn đã biết trước là rủi ro cao.
export function pickTargetLengthWords(minWords, maxWords) {
  const range = maxWords - minWords;
  const low = minWords + range * 0.3;
  return Math.round(low + Math.random() * (maxWords - low));
}

function buildGenerateLessonUserPrompt(data) {
  const contentTypeVi = data.content_type === "dialogue" ? "hội thoại" : "bài đọc";
  const unitLabel = data.content_type === "dialogue" ? "lượt thoại" : "câu/đoạn";
  const termDensity = data.term_density === undefined || data.term_density === null || data.term_density === ""
    ? 0
    : data.term_density;
  // "lengthWords" giờ là 1 ĐIỂM NHẮM NGẪU NHIÊN HOÁ mỗi lượt gọi (pickTargetLengthWords, KHÔNG
  // còn luôn là trung điểm cố định — 2026-07-28 "độ dài tự nhiên hơn") dùng để TÍNH CƠ HỌC (số
  // lượt/đơn vị) cho ĐÚNG LƯỢT NÀY; "lengthWordsMin/Max" vẫn là khung CEFR CHÍNH THỨC không đổi
  // theo cấp (LEVEL_LENGTH_TABLE), hiển thị cho model như khung tham chiếu ngoài cùng.
  const lengthWords = data.length_words || 200;
  const lengthWordsMin = data.length_words_min || Math.round(lengthWords * 0.85);
  const lengthWordsMax = data.length_words_max || Math.round(lengthWords * 1.15);
  const isDialogue = data.content_type === "dialogue";
  let lengthInstruction;
  if (isDialogue) {
    const [basisMin, basisMax] = DIALOGUE_TURN_COUNT_BASIS_BY_LEVEL[data.level] || [8, 15];
    const turnCount = Math.max(6, Math.round(lengthWords / ((basisMin + basisMax) / 2)));
    const [turnMin, turnMax] = DIALOGUE_TURN_RANGE_DISPLAY_BY_LEVEL[data.level] || [basisMin, basisMax];
    lengthInstruction = `- Cấu trúc hội thoại (yêu cầu CƠ HỌC, đếm được cho từng phần tử): viết ĐÚNG ${turnCount} lượt thoại (${turnCount} phần tử trong "content"), hướng tới TỔNG khoảng ${lengthWords} từ cho cả bài — con số này đổi MỖI BÀI (không phải hằng số cố định), nên không cần khớp CHÍNH XÁC 1 con số. NHƯNG tổng cả bài PHẢI nằm trong khung ${lengthWordsMin}-${lengthWordsMax} từ của cấp ${data.level} — đây là RANH GIỚI CỨNG, hệ thống TỰ ĐỘNG TỪ CHỐI nếu ra ngoài khung, nên TUYỆT ĐỐI KHÔNG được để tổng bài ngắn hơn ${lengthWordsMin} từ. MỖI LƯỢT dài khoảng ${turnMin}-${turnMax} từ tiếng Anh — đây là khoảng TỰ NHIÊN của 1 lượt thoại thật ở cấp ${data.level}, không phải khoảng phải bám sát: có lượt RẤT NGẮN (1-4 từ, vd "Sure.", "Of course.", "Really?") xen giữa các lượt dài hơn là ĐÚNG với hội thoại thật, không phải lỗi cần tránh — ưu tiên cảm giác hội thoại tự nhiên hơn việc mọi lượt na ná độ dài nhau, miễn TỔNG vẫn đạt đủ khung ở trên. Đếm riêng từng lượt, không phải cộng dồn cả bài trong đầu. Số liệu thật đo được cho thấy xu hướng viết ngắn hơn yêu cầu rõ rệt (chưa từng gặp viết thừa) — nên KHI PHÂN VÂN giữa viết dài hay ngắn 1 lượt, nghiêng về phía dài hơn một chút, đừng viết theo bản năng "vừa đủ chạm sàn". KHÔNG tính từ trong vocabulary/grammar/sentence_patterns/exercises/translation/explanation.`;
  } else {
    const minUnits = suggestedUnitCount(data.level, lengthWords, data.content_type);
    const avgWordsPerUnit = Math.round(lengthWords / minUnits);
    lengthInstruction = `- Độ dài: hướng tới khoảng ${lengthWords} từ tiếng Anh cho cả bài — con số này đổi MỖI BÀI trong khung ${lengthWordsMin}-${lengthWordsMax} từ của cấp ${data.level} (không cần khớp CHÍNH XÁC 1 con số, dao động nhẹ quanh mức nhắm là bình thường). NHƯNG khung ${lengthWordsMin}-${lengthWordsMax} từ là RANH GIỚI CỨNG của cấp độ này — hệ thống TỰ ĐỘNG TỪ CHỐI nếu tổng số từ thực tế nằm ngoài khung, nên TUYỆT ĐỐI KHÔNG được viết ngắn hơn ${lengthWordsMin} từ. CÁCH ĐẾM: cộng TOÀN BỘ số từ trong "text" của MỌI phần tử trong "content" — đếm TỪNG TỪ TIẾNG ANH thật sự, KHÔNG PHẢI đếm số ${unitLabel}/số phần tử. KHÔNG tính từ trong vocabulary/grammar/sentence_patterns/exercises/translation/explanation (những phần đó KHÔNG được rút ngắn để né việc viết đủ content). Số liệu thật đo được LUÔN LÀ VIẾT THIẾU (chưa từng gặp viết thừa), nên khi phân vân hãy nhắm cao hơn một chút chứ đừng viết sát đáy khung ${lengthWordsMin} từ. CẦN khoảng ${minUnits} ${unitLabel} ở cấp ${data.level} để đạt đủ (đã tính kèm biên an toàn) — ví dụ cách tính: ${minUnits} ${unitLabel}, trung bình mỗi ${unitLabel} khoảng ${avgWordsPerUnit} từ, cộng lại ≈ ${lengthWords} từ. Đừng dừng sớm hơn ${minUnits} ${unitLabel} nếu tổng từ trong "content" đo được chưa tới ${lengthWordsMin}.`;
  }
  // grammar_focus: TÙY CHỌN, chỉ có khi caller tự truyền theo đúng 1 vị trí spine (xem ghi chú
  // "QUY TẮC VỀ ĐIỂM NGỮ PHÁP TRỌNG TÂM BẮT BUỘC" ở system prompt) — cơ chế cũ mentor_next_lesson
  // truyền vào đã archive (2026-08-11, xem _archive/mentor-ai-personal-flow/), nhưng field này
  // vẫn GIỮ LẠI ở generate_lesson vì cần cho việc sinh trước giáo trình theo đúng spine slot sau
  // này (batch script tự truyền grammar_focus tương ứng, không qua mentor.js nữa).
  const grammarFocusInstruction =
    Array.isArray(data.grammar_focus) && data.grammar_focus.length
      ? `\nĐiểm ngữ pháp trọng tâm BẮT BUỘC (đã khoá theo lộ trình, xem quy tắc riêng ở trên): ${data.grammar_focus
          .map((g) => `${g.name_vi}${g.formula ? ` (${g.formula})` : ""}`)
          .join(
            "; "
          )}. NHẮC LẠI: vẫn phải viết ĐỦ ${lengthWordsMin}-${lengthWordsMax} từ như yêu cầu độ dài ở trên — đừng viết ngắn hơn chỉ vì đang tập trung vào điểm ngữ pháp này.`
      : "";

  // "is_real_news_topic" (2026-07-29, "Tin tức tự sinh" — api/_generate/news.js) — "topic" ở
  // đây là tin thời sự THẬT, đã xác minh qua web_search Ở BƯỚC KHÁC (searchTodayNews trong
  // news.js); LƯỢT VIẾT BÀI NÀY (buildGenerateLessonUserPrompt) KHÔNG có web_search, chỉ có
  // kiến thức nền CŨ (huấn luyện tới 1 mốc thời gian nhất định) — Minh phát hiện thật: bài sinh
  // nhắc "Tổng Bí thư Nguyễn Phú Trọng" dù không còn đúng, vì model TỰ THÊM chi tiết thời sự
  // ngoài "topic" bằng kiến thức cũ khi viết. Chặn NGAY TẠI ĐÂY — chỉ áp dụng khi cờ này bật
  // (Tin tức), KHÔNG đụng lộ trình cá nhân thường (topic ở đó không phải tin thời sự thật, câu
  // chặn này vô nghĩa/thừa với chúng).
  const newsGroundingInstruction = data.is_real_news_topic
    ? `\n\nLƯU Ý QUAN TRỌNG — "Chủ đề" ở trên là tin thời sự THẬT vừa xác minh qua tìm kiếm web (không phải hư cấu): CHỈ được dùng ĐÚNG những chi tiết/sự kiện/tên riêng ĐÃ CÓ trong "Chủ đề" — TUYỆT ĐỐI KHÔNG tự thêm bất kỳ chi tiết thời sự nào khác (tên lãnh đạo/chức vụ hiện tại, số liệu, ngày tháng, tổ chức...) không có sẵn trong "Chủ đề", vì kiến thức nền của bạn có thể đã LỖI THỜI và không đáng tin cho tin tức hiện tại. Nếu cần nhắc tới người/tổ chức KHÔNG có tên trong "Chủ đề", dùng cách gọi CHUNG CHUNG (vd "the government", "officials", "the company", "a spokesperson") thay vì tự đoán tên cụ thể.`
    : "";

  // Ngày hiện tại (2026-08-09, Đợt 3 mục 17) — bơm thẳng vào prompt để "QUY TẮC VỀ TÍNH THỜI SỰ"
  // ở system prompt có căn cứ CỤ THỂ, không phải chỉ dựa vào kiến thức nền (đã có mốc cắt) của
  // model để tự đoán "hiện tại" là năm nào.
  const todayVi = new Date().toLocaleDateString("vi-VN", { year: "numeric", month: "long", day: "numeric" });

  return `Tạo bài học theo yêu cầu sau:

- Ngày hiện tại: ${todayVi}
- Mô tả của người học: ${orNone(data.description)}
- Cấp độ: ${data.level}
- Chủ đề: ${orNone(data.topic)}
- Loại nội dung: ${contentTypeVi}
${lengthInstruction}
- Lĩnh vực: ${orNone(data.field)}
- Ngành nghề: ${orNone(data.industry)}
- Sản phẩm / Dịch vụ liên quan: ${orNone(data.product)}
- Tình huống cụ thể: ${orNone(data.situation)}
- Lượng từ chuyên ngành: ${termDensity === 0 ? "không có" : `khoảng ${termDensity} lượt từ/cụm từ chuyên ngành trong bài`}${grammarFocusInstruction}${newsGroundingInstruction}

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

TỰ PHÂN LOẠI CẤP ĐỘ (2026-07-27 — không còn người học khai báo cấp độ trước, đây là bước BẮT
BUỘC và là CĂN CỨ DUY NHẤT cho toàn bộ phần còn lại của bài, không phải cảnh báo phụ):
- Đọc kỹ văn bản, tự đánh giá cấp độ CEFR THỰC của chính văn bản đó (dựa độ phức tạp câu, từ
  vựng, cấu trúc ngữ pháp dùng trong bài — đúng tiêu chí đã dùng để phân cấp A1-C1 ở nơi khác
  trong hệ thống này), ghi vào "level". Đây là cấp độ CỦA VĂN BẢN, và vì không còn cấp độ người
  học nào khác để đối chiếu, "level" này ĐƯỢC DÙNG THẲNG làm mức mọi phần còn lại của bài phải
  vừa sức theo.
- Chọn từ vựng để đưa vào danh sách "vocabulary" theo nguyên tắc: những từ người học Ở ĐÚNG
  CẤP ĐỘ VỪA XÁC ĐỊNH nhiều khả năng chưa biết. Cấp A1 thì gần như mọi từ ngoài nhóm 1000 từ
  thông dụng đều đáng chọn; cấp B2 thì chỉ chọn từ học thuật, thành ngữ, cụm động từ khó.
- Giải thích ngữ pháp, bản dịch, chú giải và bài tập PHẢI diễn đạt ĐÚNG ĐỘ SÂU tương ứng cấp độ
  vừa xác định — cấp thấp (A1-A2): giải thích đơn giản, câu ngắn, ví dụ bổ sung dùng từ dễ; cấp
  cao (B2-C1): được phép giải thích sâu hơn, dùng thuật ngữ ngữ pháp chính xác hơn, ví dụ phức
  tạp hơn. KHÔNG dùng chung 1 độ sâu giải thích bất kể văn bản dễ hay khó.

QUY TẮC ĐẦU RA:
- Trả về DUY NHẤT một khối JSON hợp lệ theo schema dưới đây.
- Không lời chào, không giải thích ngoài JSON, không bọc trong dấu \`\`\`.
- Bản dịch và giải thích bằng tiếng Việt tự nhiên.

SCHEMA JSON:
{
  "title": "tự đặt tên bài bằng tiếng Anh dựa trên nội dung văn bản",
  "title_vi": "tên bài dịch sang tiếng Việt",
  "level": "cấp độ CEFR bạn tự đánh giá cho CHÍNH văn bản này — dùng thẳng làm căn cứ cho mọi phần còn lại của bài",
  "content_type": "dialogue hoặc reading",
  "content": [
    {
      "speaker": "chỉ có với dialogue",
      "text": "nguyên văn đoạn/lượt thoại từ văn bản gốc, không sửa",
      "translation": "bản dịch tiếng Việt",
      "explanation": "phân tích ĐÚNG câu/đoạn này (2-3 dòng, tiếng Việt), vừa sức cấp độ đã xác định ở 'level': MỞ ĐẦU NGAY bằng chính điểm đáng chú ý của CÂU NÀY (từ/cụm cụ thể, cách diễn đạt cụ thể, hoặc lý do dùng cách nói này) — CẤM mở đầu bằng cách gọi tên thì/cấu trúc chung chung trước, dưới BẤT KỲ cách diễn đạt nào của khuôn 'Câu này dùng/sử dụng thì...', 'Câu này ở thì...', 'Thì X trong câu này diễn tả...' (cấm cả khuôn mẫu, không chỉ đúng câu chữ nêu trên). Mỗi câu đọc như đang phân tích RIÊNG câu đó. Ngắn gọn, đúng trọng tâm.",
    }
  ],
  "vocabulary": [
    {
      "word": "từ hoặc cụm từ CÓ MẶT trong văn bản",
      "ipa": "phiên âm IPA",
      "type": "với TỪ ĐƠN: loại từ (noun, verb, adj...). Với CỤM TỪ (word có khoảng trắng): PHẢI chọn ĐÚNG 1 trong 3 nhãn — 'Cụm danh từ', 'Cụm động từ + giới từ (phrasal verb)', hoặc 'N + giới từ + N' — theo đúng cấu trúc thật của cụm, không dùng nhãn khác",
      "meaning": "nghĩa tiếng Việt ĐÚNG THEO NGỮ CẢNH trong bài (không phải nghĩa phổ biến nhất)",
      "example": "một câu ví dụ mới, đơn giản, vừa cấp độ đã xác định ở 'level'",
      "example_translation": "bản dịch tiếng Việt của chính câu \\"example\\" ở trên",
      "is_specialized": true nếu là thuật ngữ chuyên ngành, false nếu là từ thường
    }
  ],
  "grammar": [
    {
      "name": "tên điểm ngữ pháp",
      "structure": "công thức",
      "explanation": "giải thích bằng tiếng Việt, vừa sức cấp độ đã xác định ở 'level'",
      "example_from_lesson": "trích nguyên văn một câu trong văn bản có dùng điểm này"
    }
  ],
  "sentence_patterns": [
    {
      "pattern": "NẾU 'level' tự xác định ở trên là A1/A2: khuôn câu có chỗ trống, viết tự nhiên (KHÔNG công thức trừu tượng S+V+O). NẾU B1 trở lên: KHÔNG liệt kê công thức ngữ pháp nữa (đã có 'grammar' lo phần đó), KHÔNG dùng dấu ba chấm/chỗ trống dưới bất kỳ hình thức nào (vd 'If a company depends on ...' là SAI, coi như công thức trá hình) — thay bằng CỤM TỪ/CÁCH DIỄN ĐẠT đáng chú ý (collocation, cụm giới từ/động từ cố định, cách diễn đạt hay lặp lại) là 1 CHUỖI TỪ LIỀN MẠCH ĐẦY ĐỦ, ĐÚNG NGUYÊN VĂN xuất hiện trong văn bản, vd 'depend heavily on' KHÔNG viết 'S + depend + on + O' hay 'depends on ...'",
      "example_from_lesson": "trích ĐÚNG NGUYÊN VĂN một câu đầy đủ trong văn bản có dùng khuôn/cụm này, không bịa thêm",
      "example_translation": "bản dịch tiếng Việt của chính câu \\"example_from_lesson\\" ở trên",
      "note": "1 câu tiếng Việt ngắn, nói khuôn/cụm này DÙNG ĐỂ LÀM GÌ trong giao tiếp thực tế — KHÔNG giải thích ngữ pháp hàn lâm",
      "why_worth_it": "1 câu tiếng Việt ngắn, TẠI SAO khuôn/cụm này đáng học lại ở ĐÚNG cấp độ đã xác định ở 'level' — không mô tả lại nghĩa câu"
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
- vocabulary: 8-15 từ tùy độ dài văn bản và cấp độ đã xác định ở "level".
- grammar: 1-3 điểm THỰC SỰ xuất hiện trong văn bản, ưu tiên điểm lặp lại nhiều lần nhất.
- sentence_patterns: quét TOÀN BỘ văn bản (không giới hạn ở câu có điểm ngữ pháp trọng tâm), CHỈ chọn khuôn câu THỰC SỰ đáng học lại để dùng trong giao tiếp (câu hỏi thông dụng, cấu trúc tái dùng được ở nhiều tình huống khác) — bỏ qua câu quá đơn giản không có gì đáng nêu (vd "I like coffee"). Đây là phép thử NĂNG LỰC PHÁN ĐOÁN, không phải bài liệt kê — việc khó không phải "tìm cấu trúc" (câu nào cũng có cấu trúc) mà là biết cái nào ĐÁNG chọn, cái nào KHÔNG. Bắt buộc: (1) khuôn phải VỪA TẦM cấp độ đã xác định ở "level" — không chọn khuôn quá cơ bản mà cấp độ đó chắc chắn đã thấm từ lâu, cũng không chọn khuôn vượt quá xa khiến người học chưa dùng được ngay; (2) "why_worth_it" phải là lý do THẬT — nếu không nghĩ ra lý do thuyết phục cho 1 khuôn, ĐỪNG đưa khuôn đó vào, KHÔNG hạ chuẩn để đủ số lượng. KHÔNG trùng với "grammar". Số lượng: tối thiểu 5, tối đa 8 (2026-08-12, nâng sàn từ 3 — xem lý do đầy đủ ở GENERATE_LESSON_SYSTEM_PROMPT cùng mục) — vẫn GIỮ ĐÚNG yêu cầu chất lượng ở trên (why_worth_it phải thật, không hạ chuẩn), chỉ đổi mức sàn để bài THÔNG THƯỜNG đủ khuôn câu đáng học, quét kỹ hơn TOÀN BỘ văn bản trước khi kết luận không đủ khuôn để đạt sàn 5.
- exercises: tối thiểu 3 trắc nghiệm + 2 điền từ, tất cả bám vào văn bản. "grammar_tag" dùng để hệ thống gợi ý ôn tập sau này — chỉ gắn nhãn ĐÚNG với điểm ngữ pháp câu đó thực sự kiểm tra. BẮT BUỘC mọi object trong "exercises" PHẢI có key "grammar_tag" — KHÔNG được bỏ qua key này dưới bất kỳ trường hợp nào (lỗi thật đã gặp: model bỏ hẳn key thay vì ghi null). Giá trị CHỈ có 2 dạng hợp lệ: string khớp NGUYÊN VĂN 1 "name" trong "grammar", HOẶC chính xác giá trị null (không phải chuỗi rỗng, không phải thiếu key) khi câu không gắn điểm ngữ pháp nào.`;

// "level" KHÔNG còn là tham số đầu vào (2026-07-27, bỏ hẳn bước người dùng khai báo cấp độ
// trước khi phân tích — xem ANALYZE_TEXT_SYSTEM_PROMPT mục "TỰ PHÂN LOẠI CẤP ĐỘ") — model tự
// đọc văn bản và tự xác định "level" trong JSON trả về, không có gì để so sánh/đối chiếu nữa.
function buildAnalyzeTextUserPrompt(userText) {
  // Lọc bỏ chuỗi """ khỏi input trước khi chèn — chống prompt injection cơ bản (đúng
  // ghi chú trong docs/prompt-phan-tich-van-ban.md mục "USER PROMPT").
  const safeText = (userText || "").replace(/"""/g, "");
  return `Văn bản cần phân tích (giữ nguyên, không sửa):
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

// endsOnDanglingQuestion — GIỮ LẠI hàm (dùng ở nơi khác/tham khảo) nhưng KHÔNG còn dùng để
// chặn/sinh lại bài (xem ghi chú "GỠ BỎ VALIDATOR KỸ THUẬT CỨNG" ở validateLessonShape() bên
// dưới, 2026-08-07) — 1 bài hội thoại kết ở câu hỏi chưa đáp là vấn đề CẤU TRÚC/CHẤT LƯỢNG,
// đúng phạm vi "Nguyên tắc 3 — Cấu trúc hoàn chỉnh" của Giám khảo (lesson-judge-criteria.md),
// không phải lỗi kỹ thuật cần đếm-và-từ-chối.
function endsOnDanglingQuestion(content) {
  const last = (content || [])[content.length - 1];
  return !!last && typeof last.text === "string" && last.text.trim().endsWith("?");
}

// ====== "phrase_groups" phủ từ trong câu (2026-07-30, "gom cụm từ khi sinh bài") — hàm GIỮ
// NGUYÊN, vẫn dùng để TÍNH xem 1 item đã đủ dữ liệu tooltip hay chưa (analyze_lesson_phrase_
// groups — "vá 1 lần" cho bài thiếu, xem phía dưới file) — NHƯNG KHÔNG CÒN dùng để chặn/sinh
// lại CẢ BÀI ở validateLessonShape() nữa (xem ghi chú ở đó, 2026-08-07: đây là dữ liệu phục vụ
// TOOLTIP, một tính năng độc lập với chất lượng nội dung bài học — bài phủ chưa đủ 100% lúc
// sinh thì đơn giản là sẽ được "vá 1 lần" khi người dùng bấm vào từ đầu tiên còn thiếu, ĐÚNG
// CƠ CHẾ đã xây cho bài CŨ, không có lý do gì bài MỚI phải bị chặn nghiêm khắc hơn bài cũ).
// BUG THẬT (2026-08-13, bài #1-B2 — câu chứa "organization's"/"management's" bị AI SINH RA bằng
// dấu nháy đơn CONG "’" (U+2019, "smart quote" — model hay tự đổi kiểu này trong văn xuôi) —
// regex CŨ chỉ nhận dấu nháy THẲNG "'" (U+0027), nên "organization’s" bị tách thành 2 token
// "organization"+"s" (dấu ’ bị coi là dấu câu, làm đứt từ) — coverage-check thất bại DAI DẲNG dù
// "words" AI trả về đúng ranh giới thật, chỉ khác KIỂU dấu nháy. Nhận CẢ 2 kiểu dấu nháy
// (thẳng/cong) là 1 phần hợp lệ của từ, chuẩn hoá về CÙNG 1 dạng trước khi so khớp.
// BUG THẬT (2026-08-14, #a-B2 VÀ #b-B2 — cùng lỗi lặp lại 2 lần độc lập ở B2, câu chứa
// "long-term"): regex CŨ không coi dấu gạch nối "-" là 1 phần của từ, nên "long-term" bị tách
// thành 2 token rời "long"+"term" (dấu gạch nối bị coi là dấu câu, cắt đứt từ ghép) — trong khi
// AI hợp lý viết "words" gồm "long-term" NGUYÊN VẸN 1 phần tử (đúng cách từ ghép có gạch nối
// xuất hiện tự nhiên trong câu, giống contraction/dấu nháy đã sửa trước đó) — 2 bên không bao
// giờ khớp được, coverage-check thất bại DAI DẲNG dù thử lại nhiều lần (không tự khỏi bằng retry
// vì đây là lỗi tokenizer, không phải AI ngẫu nhiên sai). Nhận dấu gạch nối là 1 phần hợp lệ của
// từ, cùng cách đã làm cho dấu nháy đơn.
// BUG THẬT (2026-08-15, phát hiện khi sinh hàng loạt A1 Kế toán với dàn nhân vật cố định
// Phương Ánh/Thúy Vy/Trang/Giàu/Khang — coverage-check thất bại DAI DẲNG cho MỌI câu có tên nhân
// vật, không tự khỏi bằng retry): regex CŨ chỉ nhận ký tự ASCII [a-z0-9] — tên "Giàu" (có dấu) bị
// cắt thành 2 token rời "gi"+"u" (chữ "à" bị coi là dấu câu, cắt đứt từ), trong khi AI viết
// "Giàu" NGUYÊN VẸN 1 token (đúng, tên riêng không tách được) — 2 bên không bao giờ khớp được.
// Thêm bảng chữ cái tiếng Việt có dấu vào ký tự hợp lệ của từ, cùng cách đã làm cho gạch nối/số.
const VN_LOWER = "àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ";
const VN_UPPER = VN_LOWER.toUpperCase();
const VN_WORD_CHARS = `A-Za-z0-9${VN_LOWER}${VN_UPPER}`;
function normalizePhraseWord(w) {
  return (w || "")
    .toString()
    .toLowerCase()
    .replace(/[’‘ʼ]/g, "'")
    .replace(new RegExp(`[^a-z0-9'\\-${VN_LOWER}]`, "g"), "");
}
// BUG THẬT (2026-08-12, xác nhận qua dữ liệu sống — bài #5a2 A2 có câu chứa lời trích dẫn trong
// dấu nháy đơn 'This is...' — coverage-check thất bại LIÊN TỤC dù thử lại 3 lần/9 lượt gọi AI):
// regex cũ /[A-Za-z0-9']+/g coi dấu nháy đơn MỞ ĐẦU (dùng để trích lời nói, KHÁC dấu nháy đơn bên
// TRONG 1 từ như "don't") là 1 PHẦN của từ liền sau nó — token thật ra "'this" (còn dấu nháy),
// nhưng AI hợp lý viết "words":["This",...] KHÔNG kèm dấu nháy (đúng cách hiểu tự nhiên: dấu nháy
// trích dẫn là dấu câu, không phải 1 phần của từ) — 2 bên KHÔNG BAO GIỜ khớp được dù AI viết đúng.
// SỬA: chỉ coi dấu nháy đơn là 1 phần của từ khi nó đứng NGAY GIỮA 2 ký tự chữ/số (đúng vị trí
// duy nhất dấu nháy xuất hiện trong từ tiếng Anh thật: "don't", "it's"), không phải ở đầu/cuối 1
// khối ký tự liên tiếp.
// BUG THẬT (2026-08-14, bài #a-B2 — câu chứa "$10,000"/"$1,000" bị MẤT TRẮNG khỏi phrase_groups,
// tốn tiền retry vô ích vì lỗi này KHÔNG tự khỏi bằng cách gọi lại): regex CŨ không có số/dấu
// phẩy trong nhóm ký tự của từ, nên "$10,000" bị tách thành 2 token rời "10" + "000" (dấu $ và
// dấu phẩy bị coi là dấu câu, cắt đứt số) — trong khi AI hợp lý viết "words" gồm "$10,000" NGUYÊN
// VẸN 1 phần tử (đúng cách số tiền xuất hiện tự nhiên trong câu) — 2 bên không bao giờ khớp được.
// Tham khảo file v6 (Minh cung cấp) — thêm hẳn 1 mẫu SỐ (có thể có "$" trước, dấu phẩy phân
// nhóm nghìn, phần thập phân) làm lựa chọn ĐẦU TIÊN trong regex, thử trước mẫu chữ cái.
const SENTENCE_WORD_TOKEN_RE = new RegExp(`\\$?\\d[\\d,]*(?:\\.\\d+)?|[${VN_WORD_CHARS}]+(?:['’ʼ-][${VN_WORD_CHARS}]+)*`, "g");
function sentenceWordTokens(text) {
  return ((text || "").match(SENTENCE_WORD_TOKEN_RE) || []).map(normalizePhraseWord);
}
// BUG THẬT (2026-08-13, Minh xem trực tiếp bài #7b2 câu 13 — tooltip "organizations" hiện level
// "B2" đồng loạt cho MỌI từ trong câu, không phân biệt từng từ): hàm này TRƯỚC ĐÂY chỉ so khớp
// DÃY TỪ ("words" ghép lại đúng "text") — 1 lượt gọi AI có thể trả về nhóm ĐÚNG ranh giới từ
// (words khớp) nhưng THIẾU HẲN "word_meanings"/"word_types"/"word_levels" cho 1 phần câu (model
// bỏ sót, không phải lỗi tách từ) — coverage-check CŨ coi đó là "ĐẠT" (chỉ nhìn "words"), never
// kích hoạt retry, dữ liệu thiếu tồn tại vĩnh viễn. SỬA: BẮT BUỘC mọi nhóm ≥1 từ phải có ĐỦ
// word_meanings/word_types/word_levels cho MỌI từ trong "words" của nó — thiếu 1 từ ở BẤT KỲ
// nhóm nào cũng coi là CHƯA ĐẠT, kích hoạt đúng cơ chế retry/leo thang đã có (analyzePhraseGroupsInChunks),
// KHÔNG cần thêm lượt gọi AI mới nào ngoài retry sẵn có.
function itemPhraseCoverageOk(item) {
  const realWords = sentenceWordTokens(item?.text);
  if (!realWords.length) return true; // item rỗng/chỉ dấu câu -> không có gì để phủ, coi như đạt
  const groups = Array.isArray(item?.phrase_groups) ? item.phrase_groups : [];
  if (!groups.length) return false;
  const groupWords = groups.flatMap((g) => (Array.isArray(g?.words) ? g.words : [])).map(normalizePhraseWord);
  if (groupWords.length !== realWords.length) return false;
  for (let i = 0; i < realWords.length; i++) {
    if (groupWords[i] !== realWords[i]) return false;
  }
  for (const g of groups) {
    const words = Array.isArray(g?.words) ? g.words : [];
    if (!words.length) continue;
    const wm = g.word_meanings || {};
    const wt = g.word_types || {};
    const wl = g.word_levels || {};
    for (const w of words) {
      if (!wm[w] || !wt[w] || !wl[w]) return false;
    }
  }
  return true;
}

// ====== "reading_chunks" phủ từ trong câu (2026-08-10, Đợt 14 — field RIÊNG cho "Tách câu",
// TÁCH KHỎI "phrase_groups", xem READING_CHUNKS_RULES) — CÙNG NGUYÊN LÝ itemPhraseCoverageOk()
// ở trên (ghép "text" của mọi khối, so khớp TUẦN TỰ với từ thật trong câu), chỉ khác là so khớp
// theo TEXT của từng khối (tokenize lại) thay vì mảng "words" có sẵn, vì "reading_chunks" không
// bị ép tách rời từng từ như "phrase_groups" (1 khối = 1 đoạn text nguyên, có thể nhiều từ).
function itemReadingChunksCoverageOk(item) {
  const realWords = sentenceWordTokens(item?.text);
  if (!realWords.length) return true;
  const chunks = Array.isArray(item?.reading_chunks) ? item.reading_chunks : [];
  if (!chunks.length) return false;
  const chunkWords = chunks.flatMap((c) => sentenceWordTokens(c?.text));
  if (chunkWords.length !== realWords.length) return false;
  for (let i = 0; i < realWords.length; i++) {
    if (chunkWords[i] !== realWords[i]) return false;
  }
  return true;
}

// dùng bởi analyze_lesson_phrase_groups() ("vá 1 lần") — KHÔNG còn dùng để chặn generate_lesson,
// xem ghi chú "GỠ BỎ VALIDATOR KỸ THUẬT CỨNG" ở validateLessonShape() ngay bên dưới.
function validatePhraseCoverage(parsed) {
  const content = Array.isArray(parsed.content) ? parsed.content : [];
  for (let i = 0; i < content.length; i++) {
    if (!itemPhraseCoverageOk(content[i])) return { valid: false, reason: "phrase_coverage_incomplete", itemIndex: i };
  }
  return { valid: true };
}

// ============================================================
// GỠ BỎ VALIDATOR KỸ THUẬT CỨNG (2026-08-07, quyết định Minh — xem
// docs/NHAT-KY-LAM-VIEC.md mục cùng ngày) — bối cảnh: slot #3 Kế toán A1 fail 11/11 lần vì
// phrase_coverage (dữ liệu phục vụ TOOLTIP, một tính năng ĐỘC LẬP không liên quan gì tới việc
// bài có chất lượng hay không) bị nhét làm điều kiện CHẶN/SINH LẠI CẢ BÀI. Đây là dấu hiệu rộng
// hơn: dùng validator kỹ thuật cứng (đếm từ, đếm cụm, đạt/không đạt theo công thức) để đánh giá
// CHẤT LƯỢNG NỘI DUNG — 2 việc khác bản chất. Áp dụng lại đúng mô hình đã THÀNH CÔNG với kho lời
// thoại Mentor AI (api/_generate/mentor-lines/judge-criteria.md, Đợt 3 2026-07-21): bỏ liệt kê
// quy tắc/công thức cứng, thay bằng nguyên tắc bậc cao cho GIÁM KHẢO (AI, xem
// lesson-judge-criteria.md) tự suy luận.
//
// GIỮ LẠI (Đúng "cần thiết tối thiểu" — JSON hợp lệ/không rỗng, KHÔNG phải chỉ số chất lượng):
// title/title_vi/level/content_type/content/vocabulary/grammar/exercises đúng hình dạng.
//
// GỠ (từng là "đẹp trên giấy", không phản ánh chất lượng thật, đẩy sang phạm vi Giám khảo):
// - word_count_out_of_range (đếm từ khớp bảng CEFR tuyệt đối) — thuộc "Nguyên tắc 6: đúng trình
//   độ CEFR một cách TỰ NHIÊN" của Giám khảo, không phải phép đếm.
// - dangling_question_ending (hội thoại kết ở câu hỏi treo) — thuộc "Nguyên tắc 3: cấu trúc
//   hoàn chỉnh".
// - phrase_coverage_incomplete — KHÔNG liên quan chất lượng, chỉ phục vụ tooltip; bài phủ chưa
//   đủ 100% lúc sinh vẫn được LƯU bình thường, tự "vá 1 lần" khi người dùng bấm từ còn thiếu
//   (analyze_lesson_phrase_groups, đã có sẵn, dùng CHUNG cơ chế với bài cũ).
//
// KHÔNG ĐỤNG word_count_deviation (analyze_user_text riêng) — đây KHÔNG phải chỉ số thẩm mỹ, mà
// là kiểm tra ĐỘ TRUNG THỰC: bài phân tích phải phản ánh ĐỦ văn bản GỐC người dùng dán vào,
// không bị AI cắt bớt/bịa thêm — thuộc nhóm "cần thiết tối thiểu", không phải chất lượng chủ
// quan, nên vẫn giữ.
// ============================================================
function validateLessonShape(parsed, { expectedWords } = {}) {
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

  // BUG THẬT (2026-08-17, xác nhận qua batch A1 #53/#85 VÀ lặp lại ngay sau khi sửa PROMPT bằng
  // văn xuôi — chỉ nêu quy tắc "2-4 câu/đoạn" KHÔNG đủ, model vẫn gộp cả bài đọc thành 1 phần tử
  // 13-17 câu): kiểm bằng CODE, không chỉ trông cậy prompt — 1 phần tử "bài đọc" quá dài (>5 câu)
  // là dấu hiệu chắc chắn model gộp cả bài, bắt lỗi để kích hoạt đúng cơ chế retry-1-lần đã có.
  if (parsed.content_type === "reading" && Array.isArray(parsed.content)) {
    const oversizedIdx = parsed.content.findIndex((item) => (String(item?.text || "").match(/[.!?]+/g) || []).length > 5);
    if (oversizedIdx >= 0) return { valid: false, reason: "reading_paragraph_too_long", itemIndex: oversizedIdx };

    // BUG THẬT (2026-08-17, xác nhận NGAY SAU KHI THÊM check trên — model né "quá dài" bằng cách
    // chẻ vụn CẢ BÀI thành 1-câu/phần tử, vd 16 phần tử đều đúng 1 câu, không đạt "2-4 câu/đoạn"
    // yêu cầu): nếu ĐA SỐ phần tử (>50%, bài có ≥3 phần tử) chỉ có ĐÚNG 1 câu, coi là chẻ vụn sai.
    if (parsed.content.length >= 3) {
      const oneSentenceCount = parsed.content.filter((item) => (String(item?.text || "").match(/[.!?]+/g) || []).length <= 1).length;
      if (oneSentenceCount / parsed.content.length > 0.5) {
        return { valid: false, reason: "reading_paragraph_too_fragmented" };
      }
    }

    // BUG THẬT (2026-08-17, Minh: "We have a desk..." không rõ ai kể — vẫn lặp lại ngay sau khi
    // thêm QUY TẮC VỀ NGÔI KỂ bằng văn xuôi): câu ĐẦU TIÊN mở đầu bằng I/We/My/Our mà KHÔNG có
    // cụm xác lập danh tính điển hình — coi là ngôi thứ nhất bị bỏ ngỏ, bắt lỗi bằng CODE.
    const firstText = String(parsed.content[0]?.text || "").trim();
    if (/^(I|We|My|Our)\b/.test(firstText)) {
      const hasIdentityIntro = /\b(as an?|as the|i am an?|i'm an?|i work as|my name is|i have been|our team of|we are an?)\b/i.test(firstText);
      if (!hasIdentityIntro) return { valid: false, reason: "reading_narrator_not_established" };
    }
  }

  // expectedWords±% — CHỈ analyze_user_text dùng (kiểm ĐỘ TRUNG THỰC với văn bản GỐC, xem ghi
  // chú khối "GỠ BỎ VALIDATOR..." phía trên) — generate_lesson KHÔNG còn truyền tham số này.
  if (typeof expectedWords === "number" && expectedWords > 0) {
    const actualWords = totalContentWords(parsed.content);
    const deviation = Math.abs(actualWords - expectedWords) / expectedWords;
    if (deviation > WORD_COUNT_DEVIATION_LIMIT) {
      return { valid: false, reason: "word_count_deviation", actualWords, expectedWords };
    }
  }
  return { valid: true };
}

function buildLessonInsertRow(parsed, { userId, source, goalId, skinId, spineSlot, industry }) {
  return {
    user_id: userId,
    source,
    goal_id: goalId || null,
    skin_id: skinId || null,
    spine_slot: Number.isInteger(spineSlot) ? spineSlot : null,
    // "Ngành nghề" cụ thể hơn "Lĩnh vực" -> ưu tiên nếu người dùng điền cả 2 ở form Tạo bài
    // học (views/createLesson.js) — chỉ để NHÓM thẻ ở màn Thư viện AI (2026-07-23,
    // views/lessons.js::renderIndustrySection), KHÔNG dùng lại để dựng prompt (đã dùng data
    // gốc cho việc đó ở buildGenerateLessonUserPrompt, không liên quan cột này).
    industry: industry || null,
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
    // Giới tính nhân vật (2026-08-08) — do AI khai báo lúc sinh bài, thay cho việc tts.js phải tự
    // đoán qua bảng tên tiếng Anh cứng (xem computeGenderHints() trong app/js/tts.js) — vai trò
    // như "CEO"/"CFO" hay tên lạ trước đây bị đoán ngẫu nhiên, giờ có sẵn đáp án đúng.
    characters: Array.isArray(parsed.characters) ? parsed.characters : [],
    exercises: parsed.exercises,
    notes: parsed.notes || null,
    xp_reward: Number.isFinite(parsed.xp_reward) ? parsed.xp_reward : 20,
  };
}

// Mentor AI (Đợt 3, luồng gọi generate_lesson với goal_id đã archive 2026-08-11 cùng mentor.js —
// xem _archive/mentor-ai-personal-flow/): generate_lesson nhận thêm data.goal_id TÙY CHỌN để gắn
// bài mới vào đúng mục tiêu (learning_goals) — vẫn giữ field này cho batch sinh giáo trình chung
// sau này. generate_lesson vẫn là action CÔNG KHAI (client gọi trực tiếp qua /api/chat), nên PHẢI
// xác nhận goal_id
// đó thật sự thuộc về CHÍNH ctx.studentId trước khi gắn — nếu không, âm thầm bỏ qua (coi
// như không có goal_id) thay vì lỗi cả lượt tạo bài, tránh 1 client cố tình gắn bài vào
// goal_id của người khác (learning_goals.id không có gì ràng buộc theo user ở tầng FK).
// "export" (2026-08-06, tái cấu trúc theo cây mới) — TÁI DÙNG nguyên hàm này cho
// analyze_user_text() bên dưới (Phân tích) LẪN save_writing_favorite() trong writing.js (Luyện
// viết), cả 2 đều cần gắn goal_id đang active + xác nhận sở hữu giống hệt generate_lesson,
// không viết lại logic kiểm tra ownership 1 lần nữa.
export async function resolveOwnedGoalId(goalId, userId) {
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
// 1 LƯỢT gọi AI + parse + validate cho generate_lesson — tách riêng (2026-07-28, "Tạo bài học
// phải luôn ra bài") để generate_lesson() có thể gọi lại với target KHÁC trên lượt retry (xem
// bên dưới), không lặp lại nguyên khối code. Export (cùng ngày, "Tin tức tự sinh") — news.js tái
// dùng THẲNG hàm này (đúng prompt/validate/retry-target-adaptive đã kiểm chứng thật) thay vì tự
// viết lại — chỉ khác nơi INSERT kết quả (news_lessons, không phải lessons cá nhân của user).
export async function callAndValidateLesson(data, targetLengthWords, minWords, maxWords, tier) {
  const genData = { ...data, length_words: targetLengthWords, length_words_min: minWords, length_words_max: maxWords };
  const r = await generateStructuredJSON({
    tier,
    maxTokens: 6000, // trần chung MAX_TOKENS_CAP (aiProvider.js) — nâng 4000->6000 (2026-07-23):
    // C1 "long" (500-600 từ, xem LEVEL_LENGTH_TABLE) bị cắt giữa JSON ở 4000, parse fail.
    temperature: 0.7,
    messages: [
      { role: "system", content: buildGenerateLessonSystemPrompt(data.content_type) },
      { role: "user", content: buildGenerateLessonUserPrompt(genData) },
    ],
  });
  if (!r.ok) {
    if (r.parseError) console.error("[generate_lesson] parse error:", r.text?.slice(0, 500));
    return { ok: false, reason: "call_or_parse_failed" };
  }
  const parsed = r.data;
  capLessonArrays(parsed);
  // CHỈ còn validate HÌNH DẠNG (JSON đúng cấu trúc/không rỗng) — KHÔNG còn đếm từ/đếm cụm/kiểm
  // câu kết, xem khối "GỠ BỎ VALIDATOR KỸ THUẬT CỨNG" ở validateLessonShape(). minWords/maxWords/
  // targetLengthWords VẪN truyền vào PROMPT phía trên (buildGenerateLessonUserPrompt, hướng dẫn
  // MỀM cho model) — chỉ không còn dùng để CHẶN/SINH LẠI bài dựa trên đếm từ tuyệt đối nữa.
  const validation = validateLessonShape(parsed);
  if (!validation.valid) {
    console.error("[generate_lesson] validate FAIL:", validation.reason, validation.actualWords, `target=${targetLengthWords}`);
    return { ok: false, reason: validation.reason, actualWords: validation.actualWords };
  }
  return { ok: true, parsed, meta: buildMeta(r) };
}

export async function generate_lesson(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!VALID_LEVELS.includes(data.level)) return { error: "Thiếu hoặc sai 'level'.", status: 400 };
  if (!VALID_CONTENT_TYPES.includes(data.content_type)) return { error: "Thiếu hoặc sai 'content_type'.", status: 400 };

  // (a) Cổng gói Pro (hiện TẮT, xem checkProGateForLessonGeneration) — hạn mức SỐ LƯỢNG/ngày
  // đã gỡ hẳn 2026-08-14, xem ghi chú tại đó.
  const gateCheck = await checkProGateForLessonGeneration(ctx.studentId);
  if (!gateCheck.allowed) return { error: gateCheck.message, status: 403 };

  // Lấy khoảng độ dài THẬT theo bảng cấp CEFR (xem LEVEL_LENGTH_TABLE) — A1/A2 luôn 1 mức cố
  // định, B1+ theo data.length_tier ("short"/"medium"/"long", mặc định "medium").
  const [minWords, maxWords] = resolveLengthRange(data.level, data.length_tier);

  // TỰ ĐỘNG THỬ LẠI (2026-07-28, "Tạo bài học phải luôn ra bài" — đo tỷ lệ lỗi thật qua nhiều
  // đợt: A1/A2 100%, B1 ~65-75%, B2/C1 GẦN NHƯ LUÔN THẤT BẠI (0/8, 0/7 hai đợt test riêng) dù
  // target cao đến đâu. LỘ RA THÊM khi đo per-attempt: 1 lượt gọi B2/C1 đơn lẻ đã mất ~27-40s —
  // với trần 60s của Vercel, KHÔNG CÒN ĐỦ THỜI GIAN cho 1 lượt retry TRỌN VẸN thứ 2 trong CÙNG
  // request (retry nội bộ dưới đây coi như KHÔNG BAO GIỜ chạy được cho B2/C1 — đã tự kiểm bằng
  // debug field, elapsed đã 27000-31000ms trước khi tới được điểm quyết định retry). Tức lượt
  // gọi nội bộ 2 dưới đây CHỈ thực sự hữu ích cho A1/A2/B1 (attempt nhanh, còn thời gian) — với
  // B2/C1, cửa duy nhất là lớp NGOÀI (client tự gọi lại — mỗi lượt 1 request MỚI, ngân sách 60s
  // MỚI TINH, xem createLesson.js) VÀ đổi tier sang "strong" ở lượt gọi lại đó (data.model_tier
  // — model mạnh hơn nhiều khả năng vượt được trần năng lực nội dung dày mà model rẻ không đạt
  // được dù thử bao nhiêu lần với model CŨ).
  const tier = data.model_tier === "strong" ? "strong" : "default";
  const attemptStartedAt = Date.now();
  const firstTarget = pickTargetLengthWords(minWords, maxWords);
  let result = await callAndValidateLesson(data, firstTarget, minWords, maxWords, tier);

  // "retryTarget" không còn cần thích ứng theo lý do lỗi (2026-08-07, sau khi gỡ validator đếm
  // từ cứng) — validate giờ chỉ còn kiểm HÌNH DẠNG JSON, nên lượt retry chỉ còn ý nghĩa "thử lại
  // 1 lượt gọi AI mới, hi vọng lần này trả đúng cấu trúc" (call_or_parse_failed/empty_*...),
  // không cần đổi target độ dài giữa 2 lượt nữa.
  if (!result.ok && Date.now() - attemptStartedAt < 25000) {
    console.log("[generate_lesson] retry 1x sau lỗi:", result.reason, `target=${firstTarget}`, `tier=${tier}`);
    result = await callAndValidateLesson(data, firstTarget, minWords, maxWords, tier);
  }
  // THÊM 1 LƯỢT THỬ RIÊNG cho "bài đọc" (2026-08-17, xác nhận thật: chủ đề mang tính "hoạt động/
  // cảm xúc cá nhân" — vd "Cảm xúc giờ nghỉ trưa" — khiến model lệch ngôi kể/cấu trúc đoạn 2 LẦN
  // LIÊN TIẾP, hết cả 2 lượt mặc định vẫn fail đúng 1 trong 3 lỗi mới thêm — 502 cho người dùng
  // dù nội dung KHÔNG hề khó, chỉ là chủ đề dễ kéo lệch giọng văn). CHỈ áp dụng đúng 3 lý do lỗi
  // MỚI (cấu trúc/ngôi kể), KHÔNG áp dụng cho lỗi khác (call_or_parse_failed...) để không kéo dài
  // thời gian chờ vô ích khi lỗi là do mạng/JSON hỏng (đã thử đủ 2 lượt là hợp lý cho ca đó).
  const READING_STRUCTURE_RETRY_REASONS = new Set([
    "reading_paragraph_too_long",
    "reading_paragraph_too_fragmented",
    "reading_narrator_not_established",
  ]);
  if (
    !result.ok &&
    data.content_type === "reading" &&
    READING_STRUCTURE_RETRY_REASONS.has(result.reason) &&
    Date.now() - attemptStartedAt < 45000
  ) {
    console.log("[generate_lesson] retry 2x (riêng bài đọc, lỗi cấu trúc/ngôi kể):", result.reason);
    result = await callAndValidateLesson(data, firstTarget, minWords, maxWords, tier);
  }

  if (!result.ok) {
    return { error: "AI trả về dữ liệu không hợp lệ, vui lòng thử lại.", status: 502 };
  }
  const parsed = result.parsed;

  const [goalId, skinId] = await Promise.all([
    resolveOwnedGoalId(data.goal_id, ctx.studentId),
    resolveSkinId(data.skin_id),
  ]);
  const saved = await insertLesson(
    buildLessonInsertRow(parsed, {
      userId: ctx.studentId,
      source: "ai_generated",
      goalId,
      skinId,
      spineSlot: data.spine_slot,
      industry: (data.industry || data.field || "").trim() || null,
    })
  );
  if (!saved) return { error: "Tạo bài thành công nhưng lưu thất bại, vui lòng thử lại.", status: 502 };

  return { content: JSON.stringify({ lesson: saved, meta: result.meta }) };
}

export async function analyze_user_text(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  // KHÔNG còn validate "level" đầu vào (2026-07-27) — người dùng không còn khai báo cấp độ
  // trước khi phân tích, model tự xác định "level" của CHÍNH văn bản, xem ghi chú ở
  // buildAnalyzeTextUserPrompt()/ANALYZE_TEXT_SYSTEM_PROMPT.
  const wc = wordCount(data.user_text);
  if (wc < 20) return { error: "Văn bản quá ngắn (tối thiểu 20 từ).", status: 400 };
  // 3000 -> 600 (2026-07-28, chốt với Minh) — mốc tham chiếu thật cho 1 bài phân tích hợp lý,
  // văn bản dài hơn nên chia nhỏ. UI (createFromText.js) đã chặn TRƯỚC khi gửi lên đây — kiểm
  // lại ở server để không phụ thuộc hoàn toàn vào client (phòng gọi thẳng action, bỏ qua UI).
  if (wc > MAX_TEXT_ANALYSIS_WORDS) {
    return { error: `Văn bản quá dài (tối đa ${MAX_TEXT_ANALYSIS_WORDS} từ), vui lòng chia nhỏ.`, status: 400 };
  }

  // (a) Đọc hạn mức TRƯỚC — hết hạn mức thì chặn ngay, không tốn 1 lượt gọi OpenAI thật. Cầu chì
  // RIÊNG cho tính năng này (KHÔNG dùng chung DAILY_LESSON_LIMIT của generate_lesson) — xem
  // checkDailyTextAnalysisLimit().
  const limitCheck = await checkDailyTextAnalysisLimit(ctx.studentId);
  if (!limitCheck.allowed) return { error: limitCheck.message, status: 403 };

  // (b) Gọi AI + parse + validate.
  const r = await generateStructuredJSON({
    maxTokens: 6000, // trần chung MAX_TOKENS_CAP (aiProvider.js) — nâng từ 4000 (2026-08-09):
    // đợt 2 vừa thêm field "phrase_groups" khá dài vào schema, lặp lại đúng lỗi lịch sử từng
    // gặp ở generate_lesson (JSON bị cắt giữa chừng, parse fail) trước khi nâng lên 6000.
    temperature: 0.7,
    messages: [
      { role: "system", content: ANALYZE_TEXT_SYSTEM_PROMPT },
      { role: "user", content: buildAnalyzeTextUserPrompt(data.user_text) },
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

  // "goal_id" (2026-08-06, tái cấu trúc theo cây mới — Minh: "Phân tích: xếp vào nhánh của đúng
  // Chuyên ngành đang active") — TÙY CHỌN, xác nhận sở hữu giống hệt generate_lesson (xem
  // resolveOwnedGoalId ở trên) trước khi gắn, KHÔNG lỗi cả lượt phân tích nếu goal_id sai/thiếu.
  const goalId = await resolveOwnedGoalId(data.goal_id, ctx.studentId);
  const saved = await insertLesson(buildLessonInsertRow(parsed, { userId: ctx.studentId, source: "user_text", goalId }));
  if (!saved) return { error: "Phân tích thành công nhưng lưu thất bại, vui lòng thử lại.", status: 502 };

  return { content: JSON.stringify({ lesson: saved, meta: buildMeta(r) }) };
}

// meta không phải 1 phần "hợp đồng dữ liệu" Lesson JSON (mục 4 brief) — chỉ để /app/ hiển
// thị thời gian/token/chi phí ước tính lúc đo Phase 0/3, KHÔNG lưu vào bảng "lessons".
function buildMeta(r) {
  return { usage: r.usage || null, openai_duration_ms: r.durationMs, model: r.model };
}

// ====== "Vá" phrase_groups cho bài CŨ (2026-08-05, "sửa gốc tính năng tra từ" — Minh) ======
// Bối cảnh: TRƯỚC ĐÂY bấm 1 từ chưa có dữ liệu -> gọi AI CHO ĐÚNG TỪ ĐÓ mỗi lần bấm
// (word_lookup, xem api/_generate/wordLookup.js — đã gỡ khỏi luồng bấm, XEM ghi chú ở đó) —
// nguyên nhân thật gây 952+381 request bất thường 31/7-1/8 (điều tra thật, không phải suy đoán,
// xem docs/NHAT-KY-LAM-VIEC.md). KIẾN TRÚC MỚI: bấm vào từ CHƯA có dữ liệu -> phân tích LẠI
// TOÀN BỘ các câu/đoạn CÒN THIẾU của CHÍNH bài đó trong 1 LƯỢT GỌI AI DUY NHẤT, PATCH thẳng vào
// hàng "lessons"/"news_lessons" — CHỈ tốn ĐÚNG 1 LẦN/BÀI (không phải 1 lần/từ), mọi lượt bấm SAU
// (từ khác, kể cả người dùng khác với bài Tin tức dùng chung) đọc thẳng dữ liệu đã lưu, 0 lượt AI.
const PHRASE_GROUPS_ANALYZE_SYSTEM_PROMPT = `Bạn là chuyên gia phân tích cụm từ tiếng Anh cho người học Việt Nam.

${PHRASE_GROUPS_RULES}

NHIỆM VỤ: Với DANH SÁCH câu/đoạn tiếng Anh ĐỘC LẬP được đánh số dưới đây (KHÔNG phải 1 bài liền
mạch — CHỈ phân tích cụm từ theo quy tắc trên, TUYỆT ĐỐI KHÔNG viết lại/sửa/rút gọn nội dung câu),
trả về "phrase_groups" cho ĐÚNG MỖI câu.

QUY TẮC ĐẦU RA:
- Trả về DUY NHẤT 1 JSON hợp lệ, không chữ nào khác, không bọc \`\`\`.
- Schema: {"items": [{"index": <số thứ tự câu, ĐÚNG như đề bài>, "phrase_groups": [...]}]} — PHẢI
  có ĐỦ VÀ ĐÚNG SỐ LƯỢNG câu đã cho, đúng thứ tự "index".`;

function buildPhraseGroupsUserPrompt(items) {
  return items.map((it, i) => `[${i}] "${it.text}"`).join("\n");
}

async function callAnalyzePhraseGroups(items, tier) {
  const r = await generateStructuredJSON({
    tier: tier || "default",
    maxTokens: 6000,
    temperature: 0.3,
    messages: [
      { role: "system", content: PHRASE_GROUPS_ANALYZE_SYSTEM_PROMPT },
      { role: "user", content: buildPhraseGroupsUserPrompt(items) },
    ],
  });
  if (!r.ok) return { ok: false, reason: "call_or_parse_failed" };
  const resultItems = Array.isArray(r.data?.items) ? r.data.items : null;
  if (!resultItems || resultItems.length !== items.length) return { ok: false, reason: "item_count_mismatch" };
  for (let i = 0; i < items.length; i++) {
    const match = resultItems.find((x) => x.index === i) || resultItems[i];
    if (!itemPhraseCoverageOk({ text: items[i].text, phrase_groups: match?.phrase_groups })) {
      return { ok: false, reason: "phrase_coverage_incomplete", itemIndex: i };
    }
  }
  return { ok: true, items: resultItems };
}

// BUG THẬT (2026-08-13, Minh xem trực tiếp bài B2 #5b2 thật — cụm dài 6-10 từ, vượt xa trần 5,
// xuất hiện hàng loạt CHỈ ở bài "reading" cấp B1+): comment gốc "gửi TỪNG CÂU MỘT" ở dưới đây
// GIẢ ĐỊNH mỗi phần tử "content" (`toAnalyze[i].text`) LUÔN là 1 CÂU — ĐÚNG với hội thoại/A1-A2
// (mỗi lượt thoại/câu ngắn tự nhiên là 1 câu), nhưng SAI với "reading" cấp B1+ — mỗi phần tử ở đó
// thường là 1 ĐOẠN VĂN 2-3 CÂU. Gửi nguyên cả đoạn làm model buộc phải nhồi nhiều mệnh đề vào
// cùng 1 lượt phân tích, phá vỡ đúng giả định "1 lượt = 1 câu ngắn, dễ giữ trần 5 từ" đã có.
// SỬA: tách THẬT theo câu (dùng lại đúng thuật toán splitIntoSentences() phía client, xem
// app/js/views/lessons/lesson.js — bảo vệ viết tắt Mr./U.S./e.g. trước khi tách) TRƯỚC khi gửi
// AI, phân tích ĐÚNG 1 CÂU/lượt gọi dù phần tử gốc dài bao nhiêu câu, rồi GHÉP LẠI đúng thứ tự
// thành 1 mảng "phrase_groups" DUY NHẤT cho phần tử đó — coverage-check (so khớp DÃY TỪ, không
// quan tâm khoảng trắng/câu) vẫn đúng ĐỦ như cũ, không đổi hình dạng dữ liệu trả về.
const PHRASE_SENTENCE_ABBR_SENTINEL = " "; // ký tự KHÔNG BAO GIỜ xuất hiện trong văn bản thật
const PHRASE_SENTENCE_TRAILING_CHARS = `["'“”‘’)\\]]*`;
function splitEnglishSentencesForPhraseGroups(text) {
  if (!text) return [text];
  const protectedText = text
    .replace(/\b([A-Z]\.){2,}/g, (m) => m.replace(/\./g, PHRASE_SENTENCE_ABBR_SENTINEL))
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|vs|etc|approx|Ltd|Co|Inc)\.(?=\s)/gi, (m) => m.replace(/\./g, PHRASE_SENTENCE_ABBR_SENTINEL))
    .replace(/\b(e\.g|i\.e|a\.m|p\.m)\.(?=\s|$)/gi, (m) => m.replace(/\./g, PHRASE_SENTENCE_ABBR_SENTINEL));
  const matches = protectedText.match(
    new RegExp(`[^.!?]+[.!?]+${PHRASE_SENTENCE_TRAILING_CHARS}(\\s+|$)|[^.!?]+$`, "g")
  );
  const sentences = (matches || [protectedText])
    .map((s) => s.split(PHRASE_SENTENCE_ABBR_SENTINEL).join(".").trim())
    .filter(Boolean);
  return sentences.length ? sentences : [text];
}

// Gửi TỪNG CÂU MỘT (2026-08-08 — phát hiện thật qua nhiều vòng test trực tiếp, xem
// docs/NHAT-KY-LAM-VIEC.md mục cùng ngày cho đầy đủ diễn biến): gửi nhiều câu/đoạn cùng lúc từng
// gây JSON bị CẮT NGANG (chạm trần "maxTokens" CHUNG toàn app = 6000, aiProvider.js — không nên
// nâng trần đó chỉ vì 1 action) LẪN model tự làm sai cú pháp JSON giữa chừng khi phải giữ mạch
// nhiều nhóm dài liên tiếp. Mỗi câu 1 lượt gọi riêng, tự thử lại tối đa 3 lần — 2 lượt đầu dùng
// model mặc định (rẻ), LƯỢT THỨ 3 LEO THANG lên model mạnh hơn (tier "strong", đúng nguyên tắc
// "model mạnh là lưới cuối" đã áp dụng cho generate_lesson) — cho model nhiều "sức" suy luận hơn
// đúng lúc cần nhất thay vì lặp lại y hệt 3 lần cùng model yếu. Thất bại cả 3 thì dừng TOÀN BỘ
// (không lưu dở dang 1 phần "vá", giữ đúng tính idempotent — lượt bấm/mở bài SAU sẽ thử lại từ
// đầu với đúng các câu còn thiếu). "toAnalyze[i].text" GIỜ có thể là 1 ĐOẠN nhiều câu (xem ghi
// chú splitEnglishSentencesForPhraseGroups ở trên) — tách thật theo câu trước, mỗi câu 1 lượt gọi
// riêng NHƯ CŨ, ghép lại đúng thứ tự thành 1 mảng phrase_groups cho ĐÚNG phần tử gốc.
// SỬA 2026-08-13 (Minh: "chi phí OpenAI quá cao, kiểm tra gấp") — 2 thay đổi để giảm chi phí:
// (1) BỎ HẲN lượt leo thang model "strong" (đắt ~13x model mặc định "gpt-4o-mini" theo giá
// OpenAI công khai) — action này chỉ phục vụ TOOLTIP (tính năng phụ, không chặn đọc bài), không
// đáng trả giá cao để "chắc thắng" 1 câu khó — 2 lượt model mặc định là đủ, câu vẫn thất bại thì
// BỎ QUA câu đó (coverage vẫn thiếu, lượt "vá" SAU sẽ tự thử lại đúng câu đó, không mất dữ liệu).
// (2) BỎ hành vi "1 câu thất bại -> HUỶ TOÀN BỘ lượt vá" (trước đây return {ok:false} ngay) — đổi
// sang "1 câu thất bại -> BỎ QUA riêng câu đó, các câu KHÁC trong CÙNG bài vẫn được lưu" — quan
// trọng hơn khi giờ phân tích TỪNG CÂU (không phải từng đoạn như trước): 1 bài B1+ có thể có
// 15-20 câu, không nên để 1 câu khó làm mất hết dữ liệu của 14-19 câu còn lại đã phân tích đúng.
// GHÉP CÂU NGẮN — THỬ 2026-08-13 rồi ĐẢO LẠI ngay trong cùng ngày (Minh: "đảm bảo phrase_groups
// rules không chạy quá nhiều") — verify sống trên bài B2/A2 thật cho kết quả XẤU HẲN: gộp nhiều
// câu vào 1 lượt gọi khiến model mất phương hướng, tự ý chẻ hầu hết từ thành nhóm 1-từ riêng
// (mất hẳn khái niệm "cụm"), có đoạn còn trả về THIẾU HẲN cả câu (0 nhóm). Batching KHÔNG đáng
// đánh đổi so với rủi ro chất lượng — quay lại ĐÚNG 1 câu/lượt gọi (đã verify ổn định qua nhiều
// vòng trước đó). Tiết kiệm chi phí giờ CHỈ còn dựa vào 2 việc đã làm ổn (rút gọn prompt ~40%,
// bỏ leo thang model đắt) — không đánh đổi thêm bằng chất lượng.
// TÁI SỬ DỤNG kết quả CÂU ĐÃ ĐÚNG khi retry (2026-08-15, Minh: "thiếu từ nào tra từ đó là ok...
// hiện tại việc giao tiếp như vậy đang rất tốn token") — phát hiện thật: analyze_lesson_phrase_
// groups gọi lại NGUYÊN 1 "item" (có thể 2-3 câu) mỗi khi item đó chưa đủ coverage, làm
// analyzePhraseGroupsInChunks PHÂN TÍCH LẠI TỪ ĐẦU MỌI CÂU trong item đó — kể cả câu ĐÃ ĐÚNG từ
// lượt trước (vd "That's fun! Maybe we can go together." — "Maybe we can go together." đã đúng,
// chỉ "That's fun!" bị AI bỏ trắng, nhưng lượt sau vẫn hỏi lại CẢ 2 câu). Đọc "phrase_groups" ĐÃ
// LƯU của item đó, thử khớp PREFIX các nhóm đã có với đúng câu đang xét (theo thứ tự) — khớp
// đúng thì DÙNG LẠI, không tốn lượt gọi AI; ngay khi gặp câu KHÔNG khớp được (thiếu/lệch), NGỪNG
// tái sử dụng cho các câu còn lại (an toàn hơn đoán mò, dù có thể bỏ lỡ vài câu đúng phía sau).
function tryReuseSentenceGroups(existingGroups, cursorIdx, sentenceRealTokens) {
  if (!Array.isArray(existingGroups) || !sentenceRealTokens.length) return null;
  let idx = cursorIdx;
  let collected = 0;
  const groups = [];
  while (idx < existingGroups.length && collected < sentenceRealTokens.length) {
    const words = Array.isArray(existingGroups[idx]?.words) ? existingGroups[idx].words : [];
    if (!words.length) return null;
    groups.push(existingGroups[idx]);
    collected += words.length;
    idx++;
  }
  if (collected !== sentenceRealTokens.length) return null;
  const gotTokens = groups.flatMap((g) => g.words).map(normalizePhraseWord);
  for (let i = 0; i < sentenceRealTokens.length; i++) {
    if (gotTokens[i] !== sentenceRealTokens[i]) return null;
  }
  return { groups, nextCursorIdx: idx };
}

async function analyzePhraseGroupsInChunks(toAnalyze, existingGroupsList) {
  const allItems = [];
  for (let i = 0; i < toAnalyze.length; i++) {
    const sentences = splitEnglishSentencesForPhraseGroups(toAnalyze[i].text);
    const existingGroups = Array.isArray(existingGroupsList?.[i]) ? existingGroupsList[i] : null;
    let cursorIdx = 0;
    const combinedGroups = [];
    for (const sentence of sentences) {
      // KHÔNG "bỏ cuộc vĩnh viễn" sau 1 câu không khớp được (bug thật tự phát hiện: câu ĐẦU bị
      // AI bỏ trắng là ca PHỔ BIẾN NHẤT — "That's fun! Maybe we can go together." chỉ câu 1 thiếu,
      // câu 2 đã đúng SẴN Ở ĐẦU mảng existingGroups vì câu 1 chưa từng đóng góp gì. cursorIdx
      // KHÔNG bị tiêu tốn khi 1 câu không khớp, nên câu KẾ TIẾP vẫn thử khớp lại đúng từ vị trí
      // đó — chỉ khi khớp ĐƯỢC mới coi là "đã dùng" (tryReuseSentenceGroups tự xác nhận CHÍNH XÁC
      // bằng so khớp token, không phải đoán mò) nên thử lại mỗi câu là an toàn.
      const reused = tryReuseSentenceGroups(existingGroups, cursorIdx, sentenceWordTokens(sentence));
      if (reused) {
        combinedGroups.push(...reused.groups);
        cursorIdx = reused.nextCursorIdx;
        continue;
      }
      const chunk = [{ text: sentence }];
      // BỎ HẲN LEO THANG "strong" (2026-08-14, Minh xem dashboard OpenAI thật: model mạnh chiếm
      // $0.19/$0.29 = 65% chi tiêu 1 ngày — ĐÚNG lỗi CŨ đã bị bắt và sửa 1 lần trước đó (xem ghi
      // chú "BỎ HẲN lượt leo thang model 'strong'" phía trên), rồi VÔ TÌNH thêm lại hôm nay
      // (2026-08-13) để cố đạt "tooltip 100%" — nhưng KHÔNG lường trước việc script publish-
      // lesson.mjs gọi lại action này TỚI 8 LẦN cho 1 bài — mỗi lần đều LEO THANG LẠI cho ĐÚNG
      // CÙNG 1 câu vẫn lỗi (không có bộ nhớ giữa các lượt gọi), tốn tới 8 LƯỢT MODEL ĐẮT cho 1 câu
      // mà CUỐI CÙNG VẪN THẤT BẠI (#a-B2 vẫn "chưa đủ" sau 8 lượt) — tiền mất tật mang. Quay lại
      // ĐÚNG 2 lượt cùng tier mặc định rồi bỏ qua — câu khó thật sự cần sửa bằng RULE (như đã làm
      // với contraction/dấu nháy cong/cụm 3-từ hôm nay), không phải trả tiền hy vọng may mắn.
      let result = await callAnalyzePhraseGroups(chunk);
      if (!result.ok) result = await callAnalyzePhraseGroups(chunk);
      if (!result.ok) {
        console.warn("[analyzePhraseGroupsInChunks] bỏ qua 1 câu thất bại cả 2 lượt:", result.reason, sentence.slice(0, 60));
        continue;
      }
      const sentenceItem = result.items.find((x) => x.index === 0) || result.items[0];
      combinedGroups.push(...(sentenceItem?.phrase_groups || []));
    }
    allItems.push({ index: i, phrase_groups: combinedGroups });
  }
  return { ok: true, items: allItems };
}

// "is_news": true -> "news_lessons" (public, KHÔNG kiểm ownership — cùng mô hình quyền
// add_news_vocab_word() trong vocab.js, ai đã đăng nhập cũng vá được vì dữ liệu dùng chung).
// false -> "lessons": SỬA 2026-08-10 (Đợt 14 — cùng bug đã sửa ở api/_generate/audio.js đợt 13)
// — TRƯỚC ĐÂY luôn lọc "user_id=eq.ctx.studentId" ngay trong query SELECT/PATCH, sót lại từ
// TRƯỚC migration 038 (bài "ai_generated" dùng chung mọi tài khoản) — tài khoản KHÔNG phải chủ
// bài mở 1 bài chung cần vá sẽ luôn nhận "không tìm thấy". Đọc "source"+"user_id" TRƯỚC, chỉ ép
// đúng chủ sở hữu khi "source==='user_text'" (Phân tích cá nhân, vẫn riêng tư) — "ai_generated"
// (dùng chung) thì bất kỳ tài khoản đã đăng nhập đều vá được, đúng chính sách migration 038.
async function loadLessonForPatch(lessonId, isNews, studentId) {
  const table = isNews ? "news_lessons" : "lessons";
  const selectRes = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(lessonId)}&select=content,source,user_id`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!selectRes.ok) return { ok: false, status: 502, error: "Không đọc được bài học." };
  const rows = await selectRes.json();
  const row = rows?.[0];
  if (!row || !Array.isArray(row.content)) return { ok: false, status: 404, error: "Không tìm thấy bài học." };
  if (!isNews && row.source === "user_text" && row.user_id !== studentId) {
    return { ok: false, status: 404, error: "Không tìm thấy bài học." };
  }
  return { ok: true, table, content: row.content };
}

// LƯỚI ĐỠ BẰNG CODE (2026-08-13, Minh xem trực tiếp trên bài #5b2 thật: tra từ "might" hiện cụm
// "They might contact the bank" — nguyên cả mệnh đề, không phải "nhóm từ vài chữ làm rõ nghĩa
// phạm vi nhỏ" như đúng ý nghĩa "cụm" phải có) — xác nhận đây là ĐÚNG lỗi "QUY TẮC RIÊNG VỀ CHỦ
// NGỮ" đã thêm rule+ví dụ trong PHRASE_GROUPS_RULES vẫn không chặn được 100% (model không tuân
// thủ đều, đúng bản chất AI, không phải lỗi thiếu ví dụ). Do đại từ chủ ngữ (I/you/he/she/it/we/
// they) là danh sách ĐÓNG, hữu hạn — tách bằng CODE ngay tại đây đảm bảo ĐÚNG 100%, không phụ
// thuộc AI có tuân thủ hay không, thay vì tiếp tục thêm chữ vào prompt (đã thử, không ăn chắc).
// CHỈ xử lý đại từ (danh từ riêng làm chủ ngữ, vd "Maria", "Accounting" đứng đầu câu, KHÔNG có
// danh sách đóng để nhận diện chắc chắn bằng code — vẫn phải dựa vào prompt, chấp nhận rủi ro còn
// lại thấp hơn nhiều vì đại từ là phần lớn trường hợp thật đã gặp).
const LEADING_SUBJECT_PRONOUNS = new Set(["i", "you", "he", "she", "it", "we", "they"]);

function splitLeadingSubjectPronoun(phraseGroups) {
  if (!Array.isArray(phraseGroups)) return phraseGroups;
  const out = [];
  for (const g of phraseGroups) {
    const words = Array.isArray(g?.words) ? g.words : [];
    const first = words[0];
    if (words.length > 1 && first && LEADING_SUBJECT_PRONOUNS.has(first.toLowerCase())) {
      const rest = words.slice(1);
      const wordMeanings = g.word_meanings || {};
      const wordTypes = g.word_types || {};
      const wordLevels = g.word_levels || {};
      out.push({
        words: [first],
        meaning: wordMeanings[first] || first,
        level: wordLevels[first] || g.level,
        type: wordTypes[first] || "pronoun",
        word_meanings: { [first]: wordMeanings[first] || first },
        word_types: { [first]: wordTypes[first] || "pronoun" },
        word_levels: { [first]: wordLevels[first] || g.level },
      });
      out.push({
        ...g,
        words: rest,
        word_meanings: Object.fromEntries(Object.entries(wordMeanings).filter(([k]) => k !== first)),
        word_types: Object.fromEntries(Object.entries(wordTypes).filter(([k]) => k !== first)),
        word_levels: Object.fromEntries(Object.entries(wordLevels).filter(([k]) => k !== first)),
      });
    } else {
      out.push(g);
    }
  }
  return out;
}

// LƯỚI ĐỠ 2 (2026-08-13, cùng nguyên tắc splitLeadingSubjectPronoun ở trên — model KHÔNG tuân
// thủ đều 100% dù prompt đã có ví dụ ❌/✅ rõ, đo được qua nhiều lượt force-retry cùng 1 câu: có
// lượt gộp đúng "an accountant"/"the company's financial status" thành 1 nhóm, có lượt lại chẻ
// rời từng từ ra thành nhiều nhóm 1-từ). Gộp LẠI bằng CODE: bất kỳ dãy ≥2 nhóm LIÊN TIẾP, MỖI
// nhóm CHỈ 1 từ, mà "word_types" của các từ đó là determiner/adjective (0 hoặc nhiều từ đầu) rồi
// kết thúc bằng ĐÚNG 1 từ "noun" — luôn là 1 cụm danh từ bị chẻ vụn, gộp lại thành 1 nhóm "Cụm
// danh từ" duy nhất. KHÔNG đụng tới nhóm đã ≥2 từ (đã đúng) hay dãy có xen verb/pronoun/preposition
// ở giữa (ranh giới cụm thật, không phải lỗi chẻ vụn).
const NP_FRAGMENT_PREFIX_TYPES = new Set(["determiner", "adjective"]);
function isNpFragmentPrefix(word, wType) {
  return NP_FRAGMENT_PREFIX_TYPES.has(wType) || /['’]s$/i.test(word || "");
}
function mergeFragmentedNounPhrases(phraseGroups) {
  if (!Array.isArray(phraseGroups)) return phraseGroups;
  const out = [];
  let run = []; // các nhóm 1-từ liên tiếp đang xét gộp (determiner/adjective/possessive 's)
  const flushRun = (extra) => {
    const items = extra ? [...run, extra] : run;
    if (items.length >= 2) {
      const words = items.flatMap((g) => g.words);
      const word_meanings = Object.assign({}, ...items.map((g) => g.word_meanings || {}));
      const word_types = Object.assign({}, ...items.map((g) => g.word_types || {}));
      const word_levels = Object.assign({}, ...items.map((g) => g.word_levels || {}));
      out.push({
        words,
        meaning: items.map((g) => g.meaning || g.words[0]).join(" "),
        level: items[items.length - 1].level,
        type: "Cụm danh từ",
        word_meanings,
        word_types,
        word_levels,
      });
    } else {
      out.push(...items);
    }
    run = [];
  };
  for (const g of phraseGroups) {
    const words = Array.isArray(g?.words) ? g.words : [];
    const w = words[0];
    const wType = words.length === 1 ? g.word_types?.[w] : null;
    if (words.length === 1 && wType === "noun" && run.length) {
      flushRun(g);
    } else if (words.length === 1 && isNpFragmentPrefix(w, wType)) {
      run.push(g);
    } else {
      flushRun();
      out.push(g);
    }
  }
  flushRun();
  return out;
}

// LƯỚI ĐỠ 3 (2026-08-13, phát hiện qua đọc thật 2 bài mẫu #7a2/#7b2 — RẤT PHỔ BIẾN, xuất hiện
// 8-10+ lần chỉ trong 2 bài): giới từ đứng LẺ 1 mình (nhãn "preposition", KHÔNG phải "Cụm giới
// từ") ngay TRƯỚC 1 "Cụm danh từ" — đúng ra phải gộp thành 1 "Cụm giới từ" DUY NHẤT (mục IV) —
// vd "with" + "risk assessments" -> phải là "with risk assessments". CHỈ gộp khi nhóm liền sau là
// "Cụm danh từ" (an toàn, không đụng tới ca "to" + "Cụm động từ" — "to" nguyên mẫu đôi khi bị
// word_types gắn nhầm "preposition", gộp nhầm sẽ tạo "Cụm giới từ" SAI cho 1 cụm động từ thật).
function mergeStrandedPreposition(phraseGroups) {
  if (!Array.isArray(phraseGroups)) return phraseGroups;
  const out = [];
  for (let i = 0; i < phraseGroups.length; i++) {
    const g = phraseGroups[i];
    const words = Array.isArray(g?.words) ? g.words : [];
    const isLonePreposition = words.length === 1 && (g.word_types?.[words[0]] === "preposition" || g.type === "preposition");
    const next = phraseGroups[i + 1];
    if (isLonePreposition && next?.type === "Cụm danh từ") {
      out.push({
        ...next,
        words: [...words, ...(next.words || [])],
        meaning: `${g.meaning || words[0]} ${next.meaning || ""}`.trim(),
        type: "Cụm giới từ",
        word_meanings: { ...(g.word_meanings || {}), ...(next.word_meanings || {}) },
        word_types: { ...(g.word_types || {}), ...(next.word_types || {}) },
        word_levels: { ...(g.word_levels || {}), ...(next.word_levels || {}) },
      });
      i++; // đã dùng luôn nhóm kế tiếp
    } else {
      out.push(g);
    }
  }
  return out;
}

// TỪ ĐIỂN CỤM ĐỘNG TỪ CỐ ĐỊNH (2026-08-14, Minh: "đối chiếu từ điển thay vì soạn thêm quy tắc
// prompt" — sau khi phát hiện "run out of"/"look for" bị chẻ vụn dù đã có ví dụ trong prompt).
// GỘP BẰNG CODE, đối chiếu DANH SÁCH TĨNH — miễn phí tuyệt đối, KHÔNG gọi thêm AI, và CHẮC CHẮN
// hơn hẳn hy vọng model tuân thủ ví dụ trong prompt mỗi lượt. Mỗi entry là 1 mảng CÁC DẠNG CHIA
// thật của từ đầu tiên (bao gồm bất quy tắc) + phần đuôi cố định — khớp ĐÚNG THỨ TỰ liên tiếp
// trong "words" (không phân biệt hoa/thường). Mở rộng danh sách này khi phát hiện thêm cụm bị
// chẻ sai, KHÔNG cần sửa gì khác.
const KNOWN_MULTI_WORD_VERBS = [
  // Cụm động từ-giới từ 3 từ (phrasal-prepositional) — hay bị chẻ vụn nhất
  [["run", "runs", "running", "ran"], "out", "of"],
  [["look", "looks", "looking", "looked"], "forward", "to"],
  [["put", "puts", "putting"], "up", "with"],
  [["get", "gets", "getting", "got", "gotten"], "away", "with"],
  [["come", "comes", "coming", "came"], "up", "with"],
  [["catch", "catches", "catching", "caught"], "up", "with"],
  [["look", "looks", "looking", "looked"], "down", "on"],
  [["do", "does", "doing", "did", "done"], "away", "with"],
  [["cut", "cuts", "cutting"], "down", "on"],
  [["keep", "keeps", "keeping", "kept"], "up", "with"],
  [["make", "makes", "making", "made"], "up", "for"],
  [["take", "takes", "taking", "took", "taken"], "part", "in"],
  [["get", "gets", "getting", "got", "gotten"], "rid", "of"],
  // Cụm động từ-giới từ 2 từ (prepositional verb — nghĩa KHÔNG suy ra được từ 2 từ cộng lại)
  [["look", "looks", "looking", "looked"], "for"],
  [["look", "looks", "looking", "looked"], "after"],
  [["depend", "depends", "depending", "depended"], "on"],
  [["rely", "relies", "relying", "relied"], "on"],
  [["belong", "belongs", "belonging", "belonged"], "to"],
  [["listen", "listens", "listening", "listened"], "to"],
  [["wait", "waits", "waiting", "waited"], "for"],
  [["pay", "pays", "paying", "paid"], "for"],
  [["talk", "talks", "talking", "talked"], "about"],
  [["think", "thinks", "thinking", "thought"], "about"],
  [["apply", "applies", "applying", "applied"], "to"],
  [["refer", "refers", "referring", "referred"], "to"],
  [["lead", "leads", "leading", "led"], "to"],
  [["result", "results", "resulting", "resulted"], "in"],
  [["rule", "rules", "ruling", "ruled"], "out"],
  [["find", "finds", "finding", "found"], "out"],
  [["point", "points", "pointing", "pointed"], "out"],
  [["carry", "carries", "carrying", "carried"], "on"],
  [["turn", "turns", "turning", "turned"], "down"],
  [["give", "gives", "giving", "gave", "given"], "up"],
  [["set", "sets", "setting"], "up"],
  [["call", "calls", "calling", "called"], "off"],
  [["break", "breaks", "breaking", "broke", "broken"], "down"],
  [["break", "breaks", "breaking", "broke", "broken"], "out"],
  [["take", "takes", "taking", "took", "taken"], "over"],
];

function mergeKnownMultiWordVerbs(phraseGroups) {
  if (!Array.isArray(phraseGroups)) return phraseGroups;
  // Làm phẳng thành dãy từ đơn kèm nhóm gốc để dò cụm liên tiếp xuyên NHÓM (AI có thể đã lỡ chẻ
  // "run"/"out of" thành 2 nhóm khác nhau, không chỉ 2 từ trong CÙNG 1 nhóm).
  const flat = [];
  for (const g of phraseGroups) {
    const words = Array.isArray(g?.words) ? g.words : [];
    for (const w of words) flat.push({ word: w, group: g });
  }
  const used = new Array(flat.length).fill(false);
  const matches = []; // {start, end} theo chỉ số flat
  for (let i = 0; i < flat.length; i++) {
    for (const entry of KNOWN_MULTI_WORD_VERBS) {
      const firstForms = entry[0];
      if (!firstForms.includes(flat[i].word.toLowerCase())) continue;
      let ok = true;
      for (let k = 1; k < entry.length; k++) {
        const tok = flat[i + k];
        if (!tok || tok.word.toLowerCase() !== entry[k]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        matches.push({ start: i, end: i + entry.length - 1 });
        break;
      }
    }
  }
  if (!matches.length) return phraseGroups;
  // Ghép lại thành nhóm mới cho các đoạn TRÙNG với 1 cụm đã biết — giữ nguyên mọi nhóm khác.
  const out = [];
  let flatIdx = 0;
  for (const g of phraseGroups) {
    const words = Array.isArray(g?.words) ? g.words : [];
    if (!words.length) continue;
    const groupStart = flatIdx;
    const groupEnd = flatIdx + words.length - 1;
    const match = matches.find((m) => m.start >= groupStart && m.start <= groupEnd);
    if (match && !used[match.start]) {
      // Thu thập TOÀN BỘ từ trong khoảng [match.start, match.end], có thể trải qua nhiều nhóm gốc.
      const spanWords = [];
      const wordMeanings = {};
      const wordTypes = {};
      const wordLevels = {};
      const meaningParts = [];
      let lastGroup = null;
      for (let idx = match.start; idx <= match.end; idx++) {
        used[idx] = true;
        const { word, group: srcGroup } = flat[idx];
        spanWords.push(word);
        Object.assign(wordMeanings, srcGroup?.word_meanings);
        Object.assign(wordTypes, srcGroup?.word_types);
        Object.assign(wordLevels, srcGroup?.word_levels);
        if (srcGroup !== lastGroup) {
          meaningParts.push(srcGroup?.meaning || word);
          lastGroup = srcGroup;
        }
      }
      out.push({
        words: spanWords,
        meaning: meaningParts.join(" ").trim(),
        level: flat[match.start].group?.level,
        type: "Cụm động từ",
        word_meanings: wordMeanings,
        word_types: wordTypes,
        word_levels: wordLevels,
      });
    } else if (!used[groupStart]) {
      out.push(g);
    }
    // Nếu nhóm gốc đã bị "used" (thuộc 1 match đã xử lý ở lượt trước), bỏ qua hẳn — tránh lặp.
    flatIdx += words.length;
  }
  return out;
}

export async function analyze_lesson_phrase_groups(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!data.lesson_id) return { error: "Thiếu 'lesson_id'.", status: 400 };

  const loaded = await loadLessonForPatch(data.lesson_id, data.is_news, ctx.studentId);
  if (!loaded.ok) return { error: loaded.error, status: loaded.status };
  const { table, content } = loaded;

  // CHỈ gửi AI các câu/đoạn CHƯA đủ dữ liệu — item nào đã đạt coverage (vd bài B2/C1 sinh giai
  // đoạn trước khi ép 100% may mắn đã đủ, hoặc 1 lượt vá TRƯỚC ĐÓ đã xử lý xong) thì GIỮ NGUYÊN,
  // không tốn thêm token phân tích lại. "data.force" (2026-08-13, cần cho việc PHÂN TÍCH LẠI bài
  // CŨ đã có coverage đủ nhưng chunk sai — vd bài trước khi có fix tách câu THẬT ở
  // analyzePhraseGroupsInChunks, coverage-check chỉ so khớp DÃY TỪ, không phát hiện được chunk
  // sai/quá dài) — bỏ qua hẳn bước lọc, coi MỌI item đều cần phân tích lại.
  const missingIdx = data.force
    ? content.map((_, i) => i)
    : content.map((it, i) => (itemPhraseCoverageOk(it) ? -1 : i)).filter((i) => i >= 0);

  // LƯU NGAY SAU MỖI ITEM (2026-08-13, bug thật: bài B1 nhiều lượt thoại -> tổng thời gian phân
  // tích TUẦN TỰ từng câu vượt trần thời gian 1 lượt gọi Vercel -> 504 FUNCTION_INVOCATION_TIMEOUT
  // -> TRƯỚC ĐÂY chỉ PATCH 1 LẦN DUY NHẤT ở cuối, nghĩa là timeout giữa chừng làm MẤT TOÀN BỘ việc
  // đã làm, gọi lại (retry) lại phân tích lại từ đầu -> lặp lại đúng 504 y hệt, không bao giờ xong
  // được). Giờ PATCH ngay sau MỖI item — timeout giữa chừng vẫn giữ lại các item đã xử lý xong,
  // gọi lại action này (missingIdx tự lọc lại item còn thiếu) sẽ tiếp tục đúng chỗ dang dở, không
  // làm lại từ đầu.
  for (const origIdx of missingIdx) {
    const result = await analyzePhraseGroupsInChunks([{ text: content[origIdx].text }], [content[origIdx].phrase_groups]);
    if (!result.ok) {
      console.error("[analyze_lesson_phrase_groups] thất bại tại item", origIdx, result.reason);
      continue;
    }
    const match = result.items.find((x) => x.index === 0) || result.items[0];
    content[origIdx] = {
      ...content[origIdx],
      phrase_groups: mergeStrandedPreposition(mergeFragmentedNounPhrases(mergeKnownMultiWordVerbs(splitLeadingSubjectPronoun(match.phrase_groups)))),
    };
    const stepPatchRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(data.lesson_id)}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ content }),
    });
    if (!stepPatchRes.ok) console.error("analyze_lesson_phrase_groups step-patch error:", stepPatchRes.status, await stepPatchRes.text());
  }

  // ÁP DỤNG LƯỚI ĐỠ chủ ngữ (splitLeadingSubjectPronoun) cho MỌI item, KỂ CẢ item đã đạt
  // coverage từ trước (bài CŨ, sinh trước khi có lưới đỡ này) — không tốn thêm lượt AI (thuần
  // code), nên lượt gọi action này (dù coverage đã đủ, không cần gọi AI ở trên) vẫn luôn có ích:
  // tự "dọn" lại bài cũ mỗi khi được gọi lại, không cần phân biệt bài mới/cũ.
  for (const item of content) {
    if (Array.isArray(item.phrase_groups)) {
      item.phrase_groups = mergeStrandedPreposition(mergeFragmentedNounPhrases(mergeKnownMultiWordVerbs(splitLeadingSubjectPronoun(item.phrase_groups))));
    }
  }

  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(data.lesson_id)}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ content }),
  });
  if (!patchRes.ok) {
    console.error("analyze_lesson_phrase_groups patch error:", patchRes.status, await patchRes.text());
    return { error: "Phân tích xong nhưng lưu thất bại, vui lòng thử lại.", status: 502 };
  }

  return { content: JSON.stringify({ content }) };
}

// ====== "Vá" reading_chunks cho bài CŨ (2026-08-10, Đợt 14) — CÙNG KIẾN TRÚC "vá 1 lần" đã có
// cho phrase_groups ở trên (loadLessonForPatch dùng chung), field/prompt riêng.
const READING_CHUNKS_ANALYZE_SYSTEM_PROMPT = `Bạn là chuyên gia phân tích cấu trúc câu tiếng Anh cho người học Việt Nam.

${READING_CHUNKS_RULES}

NHIỆM VỤ: Với DANH SÁCH câu/đoạn tiếng Anh ĐỘC LẬP được đánh số dưới đây (KHÔNG phải 1 bài liền
mạch — CHỈ tách khối theo quy tắc trên, TUYỆT ĐỐI KHÔNG viết lại/sửa/rút gọn nội dung câu), trả về
"reading_chunks" cho ĐÚNG MỖI câu.

QUY TẮC ĐẦU RA:
- Trả về DUY NHẤT 1 JSON hợp lệ, không chữ nào khác, không bọc \`\`\`.
- Schema: {"items": [{"index": <số thứ tự câu, ĐÚNG như đề bài>, "reading_chunks": [...]}]} — PHẢI
  có ĐỦ VÀ ĐÚNG SỐ LƯỢNG câu đã cho, đúng thứ tự "index".`;

function buildReadingChunksUserPrompt(items) {
  return items.map((it, i) => `[${i}] "${it.text}"`).join("\n");
}

async function callAnalyzeReadingChunks(items, tier) {
  const r = await generateStructuredJSON({
    tier: tier || "default",
    maxTokens: 6000,
    temperature: 0.3,
    messages: [
      { role: "system", content: READING_CHUNKS_ANALYZE_SYSTEM_PROMPT },
      { role: "user", content: buildReadingChunksUserPrompt(items) },
    ],
  });
  if (!r.ok) return { ok: false, reason: "call_or_parse_failed" };
  const resultItems = Array.isArray(r.data?.items) ? r.data.items : null;
  if (!resultItems || resultItems.length !== items.length) return { ok: false, reason: "item_count_mismatch" };
  for (let i = 0; i < items.length; i++) {
    const match = resultItems.find((x) => x.index === i) || resultItems[i];
    if (!itemReadingChunksCoverageOk({ text: items[i].text, reading_chunks: match?.reading_chunks })) {
      return { ok: false, reason: "reading_chunks_incomplete", itemIndex: i };
    }
  }
  return { ok: true, items: resultItems };
}

// Gửi TỪNG CÂU MỘT + tự thử lại tối đa 3 lần (lượt cuối leo thang model mạnh) — ĐÚNG PATTERN
// analyzePhraseGroupsInChunks() ở trên, xem ghi chú đầy đủ tại đó.
// SỬA 2026-08-13 — cùng lý do/thay đổi đã áp dụng cho analyzePhraseGroupsInChunks() phía trên
// (Minh: "chi phí OpenAI quá cao"): bỏ lượt leo thang model "strong" (đắt, không đáng cho tính
// năng phụ "Tách câu"), 1 đoạn thất bại chỉ bỏ qua RIÊNG đoạn đó, không huỷ cả lượt vá.
async function analyzeReadingChunksInChunks(toAnalyze) {
  const allItems = [];
  for (let i = 0; i < toAnalyze.length; i++) {
    const chunk = [toAnalyze[i]];
    let result = await callAnalyzeReadingChunks(chunk);
    if (!result.ok) result = await callAnalyzeReadingChunks(chunk);
    if (!result.ok) {
      console.warn("[analyzeReadingChunksInChunks] bỏ qua 1 đoạn thất bại cả 2 lượt:", result.reason);
      allItems.push({ index: i, reading_chunks: [] });
      continue;
    }
    allItems.push(...result.items);
  }
  return { ok: true, items: allItems };
}

export async function analyze_lesson_reading_chunks(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!data.lesson_id) return { error: "Thiếu 'lesson_id'.", status: 400 };

  const loaded = await loadLessonForPatch(data.lesson_id, data.is_news, ctx.studentId);
  if (!loaded.ok) return { error: loaded.error, status: loaded.status };
  const { table, content } = loaded;

  const missingIdx = content.map((it, i) => (itemReadingChunksCoverageOk(it) ? -1 : i)).filter((i) => i >= 0);
  if (!missingIdx.length) {
    return { content: JSON.stringify({ content }) };
  }
  // LƯU NGAY SAU MỖI ITEM (2026-08-13) — cùng lý do/fix đã áp dụng ở analyze_lesson_phrase_groups
  // (bài dài nhiều lượt thoại có thể vượt trần thời gian 1 lượt gọi Vercel; PATCH 1 lần duy nhất ở
  // cuối làm timeout giữa chừng mất hết việc đã làm, retry lại từ đầu lặp lại đúng lỗi).
  for (const origIdx of missingIdx) {
    const result = await analyzeReadingChunksInChunks([{ text: content[origIdx].text }]);
    if (!result.ok) {
      console.error("[analyze_lesson_reading_chunks] thất bại tại item", origIdx, result.reason);
      continue;
    }
    const match = result.items.find((x) => x.index === 0) || result.items[0];
    content[origIdx] = { ...content[origIdx], reading_chunks: match.reading_chunks };
    const stepPatchRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(data.lesson_id)}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ content }),
    });
    if (!stepPatchRes.ok) console.error("analyze_lesson_reading_chunks step-patch error:", stepPatchRes.status, await stepPatchRes.text());
  }

  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(data.lesson_id)}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ content }),
  });
  if (!patchRes.ok) {
    console.error("analyze_lesson_reading_chunks patch error:", patchRes.status, await patchRes.text());
    return { error: "Phân tích xong nhưng lưu thất bại, vui lòng thử lại.", status: 502 };
  }

  return { content: JSON.stringify({ content }) };
}

// Đặt tiền tố số hiệu (vd "#1-A2 ") cho bài mẫu — 2026-08-13, Minh: "tại sao không đánh # để tôi
// dễ nhận biết" khi kiểm tra bài mẫu sinh thử. CÙNG PATTERN set_lesson_cover_image (client bị
// REVOKE UPDATE cột "title"/"title_vi" trực tiếp, xem supabase/019_lessons.sql) — chỉ chủ bài
// mới đặt được tiền tố cho bài của mình (lọc "user_id=eq.${ctx.studentId}" ở câu PATCH).
export async function set_lesson_title_tag(data, ctx) {
  if (!ctx?.studentId) return { error: "Chỉ áp dụng cho Student.", status: 400 };
  if (!data.lesson_id || !data.tag) return { error: "Thiếu 'lesson_id' hoặc 'tag'.", status: 400 };

  const selectRes = await fetch(`${SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(data.lesson_id)}&user_id=eq.${encodeURIComponent(ctx.studentId)}&select=title,title_vi`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!selectRes.ok) return { error: "Không tải được bài học.", status: 502 };
  const rows = await selectRes.json();
  const lesson = rows?.[0];
  if (!lesson) return { error: "Không tìm thấy bài học.", status: 404 };

  const tag = data.tag.trim();
  const stripOldTag = (s) => (s || "").replace(/^#\S+\s+/, "");
  const newTitle = `${tag} ${stripOldTag(lesson.title)}`;
  const newTitleVi = `${tag} ${stripOldTag(lesson.title_vi)}`;

  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(data.lesson_id)}&user_id=eq.${encodeURIComponent(ctx.studentId)}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ title: newTitle, title_vi: newTitleVi }),
  });
  if (!patchRes.ok) {
    console.error("set_lesson_title_tag patch error:", patchRes.status, await patchRes.text());
    return { error: "Không đặt được số hiệu bài học.", status: 502 };
  }
  return { content: JSON.stringify({ ok: true, title: newTitle, title_vi: newTitleVi }) };
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
