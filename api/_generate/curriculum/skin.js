// api/_generate/curriculum/skin.js — sinh "da lĩnh vực" (industry skin) theo đúng bản duyệt
// docs/prompt-da-linh-vuc.md (commit 53048ef + 1f0018f, duyệt 2026-07-19 lần 8). ĐÃ ĐƯỢC PHÉP
// viết module thật nhưng CHƯA CHẠY THỬ — sandbox không có OPENAI_API_KEY thật (xem
// feedback_sandbox_blocks_real_api_keys trong memory). Bài kiểm nghiệm thu 3 ngành (bộ đã chốt
// 2026-07-19 lần 9: Logistics / Cửa hàng sửa xe / Vệ sinh buồng máy bay — xem
// docs/prompt-da-linh-vuc.md mục 11) chạy khi có lệnh deploy, TRƯỚC KHI tích hợp da vào app.
//
// Sửa prompt ở ĐÂY phải sửa ĐỒNG BỘ cả docs/prompt-da-linh-vuc.md (nguồn chân lý nội dung
// prompt) — không để 2 nơi lệch nhau, giống quy tắc đã áp dụng cho lesson.js/docs/prompt-ai-
// tao-bai-hoc.md.
//
// KHÔNG import ngược chat.js (đóng băng). Gọi AI qua api/_shared/aiProvider.js (lớp trừu
// tượng OpenAI/Gemini dùng chung toàn repo) — giống các module khác trong api/_generate/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateStructuredJSON } from "../../_shared/aiProvider.js";
import { SITUATION_FRAMES } from "./situation-frames.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

// Trần cứng chống lồng đệ quy — đúng như đã duyệt trong docs/prompt-da-linh-vuc.md mục 4 + 10.
// "MAX_SKIN_LEVEL_RETRIES" trong doc mang Ý NGHĨA TỔNG SỐ LẦN GỌI/level (giống
// MAX_SKIN_PROFILE_ATTEMPTS cho lượt chân dung), KHÔNG phải số lần retry cộng thêm vào lần gọi
// đầu — đặt tên biến ở đây theo đúng ý nghĩa để khỏi nhầm khi đọc code.
const MAX_SKIN_PROFILE_ATTEMPTS = 2;
const MAX_SKIN_LEVEL_ATTEMPTS = 2;

// Model mạnh dùng cho TOÀN BỘ lượt sinh da (cả lượt chân dung lẫn 5 lượt/level) — xem
// project_ai_model_routing_spec trong memory. Truyền tier: "strong" cho aiProvider.js thay vì
// tự chọn tên model ở đây (tên model là chi tiết riêng từng hãng) — aiProvider.js đọc
// OPENAI_MODEL_STRONG, hoặc MODEL_SKIN nếu chưa set biến mới, PHẢI set 1 trong 2 biến đó thật
// trước khi triển khai, KHÔNG để mặc định âm thầm chạy model yếu cho việc sinh da (tài sản
// dùng vĩnh viễn).
const SKIN_MODEL_TIER = "strong";

function loadJSON(fileName) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, fileName), "utf8"));
}

// Đếm số lần mỗi situation_frame_key xuất hiện trong spine đã đóng băng — required_count cho
// từng khung/level, tính bằng CODE (không nhờ model đếm), đúng spec mục 2.
export function requiredCountsByLevel() {
  const spine = loadJSON("curriculum_spine.json");
  const counts = {};
  for (const level of LEVELS) {
    counts[level] = {};
    for (const slot of spine.levels[level]) {
      counts[level][slot.situation_frame_key] = (counts[level][slot.situation_frame_key] || 0) + 1;
    }
  }
  return counts;
}

export function loadSkinGeneral() {
  return loadJSON("skin_general.json").levels;
}

// Danh sách slot đã đóng băng theo thứ tự (level -> mảng slot, mỗi slot có situation_frame_key/
// content_type/function_name_vi...) — luồng "next_slot" (mentor_next_lesson trong mentor.js,
// ĐÃ ARCHIVE 2026-08-11, xem _archive/mentor-ai-personal-flow/) dùng để xác định "slot kế tiếp"
// khi nối vào da lĩnh vực (2026-07-22), KHÔNG tự đọc file JSON riêng để tránh 2 nơi cùng biết
// đường dẫn file. Hàm này vẫn giữ (dùng cho batch sinh giáo trình chung tương lai).
export function loadCurriculumSpine() {
  return loadJSON("curriculum_spine.json").levels;
}

// Khoá dùng chung cho bảng industry_skins (supabase/023_industry_skins.sql) — nhiều
// learning_goals cùng 1 ngành thật (theo CHỮ, không gộp ngữ nghĩa, xem note nợ kỹ thuật trong
// migration) chia sẻ 1 hàng da, không sinh lại mỗi mục tiêu.
export function normalizeOccupationKey(mergedOccupation) {
  return (mergedOccupation || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// ====== Lượt A — chân dung nghề (mục 8a/9a) ======

const PROFILE_SYSTEM_PROMPT = `Bạn là chuyên gia thiết kế giáo trình tiếng Anh chuyên ngành. Nhiệm vụ CỦA LƯỢT NÀY: nhận 3 từ
khóa (Lĩnh vực / Ngành nghề / Sản phẩm-dịch vụ) do người dùng khai báo, dựng "chân dung nghề"
để dùng làm nền tảng sinh nội dung tiếng Anh chuyên ngành sau này. LƯỢT NÀY CHƯA sinh chủ đề bài
học — chỉ dựng chân dung. KHÔNG hỏi lại người dùng dưới bất kỳ hình thức nào — nếu thiếu thông
tin, TỰ SUY LUẬN hợp lý nhất theo hướng dẫn dưới đây.

Gộp 3 từ khóa thành 1 nghề/ngành cụ thể (merged_occupation) — nếu từ khóa quá hẹp (một sản
phẩm/dịch vụ/thương hiệu/công việc đơn lẻ), tự nâng lên NGÀNH MẸ gần nhất đủ rộng để có nhiều
chủ đề giao tiếp tự nhiên khác nhau (vd "sửa chuột không dây Logitech" -> "Sửa chữa & bảo trì
thiết bị điện tử"; "trà sữa trân châu đường đen" -> "Nhà hàng - Đồ uống").

Liệt kê các cặp người đối thoại điển hình + văn phong từng vai (interlocutors).

Liệt kê thuật ngữ tiếng Anh chuyên ngành THẬT (core_terms) — TỐI ĐA 20, KHÔNG có sàn tối
thiểu. Nếu không chắc chắn 1 thuật ngữ có thật sự tồn tại/đúng dùng trong ngành này, KHÔNG đưa
vào — thà liệt kê ít còn hơn bịa ra thuật ngữ nghe có vẻ đúng nhưng sai. Danh sách ngắn là tín
hiệu trung thực hợp lệ, không phải lỗi.
MỖI phần tử BẮT BUỘC là từ/cụm từ TIẾNG ANH (English) — KHÔNG được dịch sang hoặc viết bằng
tiếng Việt. Nếu ngành này không có thuật ngữ tiếng Anh chuyên biệt nào bạn thật sự chắc chắn, để
danh sách NGẮN hoặc RỖNG — KHÔNG thay bằng từ tiếng Việt cho "đủ số".

Viết 1 cụm ngắn mô tả phạm vi giao tiếp chính (primary_communication_scope, dùng hiển thị cho
người dùng, vd "Giao tiếp với khách nước ngoài tại cửa hàng").

Tự chấm độ tự tin "cao"/"vừa"/"thấp" cho TỪNG mục trong field confidence, theo đúng ngưỡng sau
(không tự đánh giá cảm tính):
- merged_occupation = "thấp" khi KHÔNG gọi được tên nghề cụ thể hơn 3 từ khóa gốc.
- interlocutors = "thấp" khi KHÔNG nêu được ít nhất 2 cặp vai giao tiếp điển hình khác nhau.
- core_terms = "thấp" khi danh sách có dưới 8 thuật ngữ thật sự chắc chắn.
Đạt rõ hơn ngưỡng "thấp" = tối thiểu "vừa"; đầy đủ + chi tiết + chắc chắn = "cao".

Nếu THỰC SỰ không thể dựng merged_occupation (từ khóa vô nghĩa/gõ nhầm), trả
"merged_occupation": null và "khong_xac_dinh": true — đây là tín hiệu DUY NHẤT hệ thống dùng để
quay lại hỏi người dùng, không tự bịa một nghề không liên quan gì đến từ khóa.

ĐẦU RA: CHỈ trả JSON hợp lệ theo đúng khuôn dưới đây, không thêm chữ nào ngoài JSON, không bọc
markdown code fence:

{
  "industry_keywords": { "field": "<nguyên văn>", "industry": "<nguyên văn>", "product": "<nguyên văn>" },
  "occupation_profile": {
    "merged_occupation": "<nghề/ngành cụ thể đã suy luận, hoặc null nếu không xác định được>",
    "khong_xac_dinh": false,
    "primary_communication_scope": "<cụm ngắn mô tả phạm vi giao tiếp chính>",
    "interlocutors": [ { "role": "<vai>", "register": "<văn phong>" } ],
    "core_terms": ["<thuật ngữ>"],
    "confidence": { "merged_occupation": "cao|vừa|thấp", "interlocutors": "cao|vừa|thấp", "core_terms": "cao|vừa|thấp" }
  }
}`;

function buildProfileUserPrompt({ field, industry, product }, { webSearch } = {}) {
  const lines = [
    `Lĩnh vực: ${field}`,
    `Ngành nghề: ${industry}`,
    `Sản phẩm / Dịch vụ: ${product}`,
    "",
    "Dựng chân dung nghề theo đúng hướng dẫn trong system prompt, trả đúng khuôn JSON đã mô tả.",
  ];
  if (webSearch) {
    lines.push(
      "(Đã bật tra cứu web — dùng thông tin thật về ngành này nếu cần, đặc biệt cho core_terms và interlocutors.)"
    );
  }
  return lines.join("\n");
}

// Bắt lỗi THẬT đã gặp ở bài kiểm nghiệm thu vòng 1 (2026-07-22): core_terms trả về tiếng Việt
// dù prompt yêu cầu tiếng Anh — dò ký tự có dấu tiếng Việt, đủ bắt các trường hợp thật đã gặp,
// không cần thư viện phát hiện ngôn ngữ đầy đủ.
const VIETNAMESE_CHAR_RE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/;

function validateProfilePayload(data) {
  const op = data && data.occupation_profile;
  if (!op) return { valid: false, reason: "missing_occupation_profile" };
  if (op.khong_xac_dinh === true || !op.merged_occupation) return { valid: false, reason: "khong_xac_dinh" };
  if ((op.core_terms || []).some((t) => VIETNAMESE_CHAR_RE.test(String(t)))) {
    return { valid: false, reason: "core_terms_not_english" };
  }
  return { valid: true };
}

function profileConfidenceIsLow(data) {
  const c = (data.occupation_profile && data.occupation_profile.confidence) || {};
  return c.merged_occupation === "thấp" || c.interlocutors === "thấp" || c.core_terms === "thấp";
}

async function callProfileOnce(keywords, { webSearch }) {
  const messages = [
    { role: "system", content: PROFILE_SYSTEM_PROMPT },
    { role: "user", content: buildProfileUserPrompt(keywords, { webSearch }) },
  ];
  const r = await generateStructuredJSON({
    tier: SKIN_MODEL_TIER,
    temperature: 0.4,
    maxTokens: 1500,
    messages,
    webSearch,
  });
  const telemetry = { model: r.model, usage: r.usage, durationMs: r.durationMs };
  return r.ok ? { ok: true, data: r.data, ...telemetry } : { ok: false, parseError: !!r.parseError, ...telemetry };
}

// Nấc 1 (không web search) -> Nấc 2 (web search) nếu confidence thấp hoặc gãy — trần cứng 2
// lượt gọi, đúng docs/prompt-da-linh-vuc.md mục 4. "model"/"usage"/"durationMs" ở output là
// của LƯỢT GỌI CUỐI (không cộng dồn nhiều lượt) — đủ cho việc ước tính chi phí/hiệu năng, xem
// project_ai_provider_abstraction trong memory (nguồn cần số liệu này lần đầu: bài kiểm
// nghiệm thu 3 ngành).
export async function generateOccupationProfile(keywords) {
  for (let attempt = 1; attempt <= MAX_SKIN_PROFILE_ATTEMPTS; attempt++) {
    const isFinalAttempt = attempt === MAX_SKIN_PROFILE_ATTEMPTS;
    const webSearch = attempt > 1; // chỉ Nấc 2 (attempt 2) bật web search
    const result = await callProfileOnce(keywords, { webSearch });
    const telemetry = { model: result.model, usage: result.usage, durationMs: result.durationMs };

    if (!result.ok || result.parseError) {
      if (isFinalAttempt) return { status: "needs_user_question", reason: "call_or_parse_failed", attempts: attempt, webSearchUsed: webSearch, ...telemetry };
      continue;
    }
    const check = validateProfilePayload(result.data);
    if (!check.valid) {
      if (isFinalAttempt) return { status: "needs_user_question", reason: check.reason, attempts: attempt, webSearchUsed: webSearch, ...telemetry };
      continue;
    }
    const low = profileConfidenceIsLow(result.data);
    if (!low) return { status: "ok", data: result.data, attempts: attempt, webSearchUsed: webSearch, lowConfidence: false, ...telemetry };
    if (isFinalAttempt) {
      // Nghề hiếm/hẹp nhưng CÓ THẬT (merged_occupation dựng được) — vẫn tiếp tục, không hỏi.
      return { status: "ok", data: result.data, attempts: attempt, webSearchUsed: webSearch, lowConfidence: true, ...telemetry };
    }
    // còn trần, confidence thấp -> thử tiếp Nấc 2
  }
  // Không nên tới đây (vòng lặp luôn return ở isFinalAttempt) — phòng hờ.
  return { status: "needs_user_question", reason: "profile_generation_exhausted", attempts: MAX_SKIN_PROFILE_ATTEMPTS, webSearchUsed: true };
}

// Màn xác nhận 3 dòng — ghép bởi CODE (không để model tự viết), đúng mục 5.
export function buildConfirmationDisplay(occupationProfile) {
  return {
    title_line: `Anh văn chuyên ngành ${occupationProfile.merged_occupation}`,
    topic_line: `Chủ đề: ${occupationProfile.primary_communication_scope}`,
    invite_line: "Mời bạn học",
  };
}

// ====== Lượt B — sinh chủ đề theo level, gọi 5 lần (mục 8b/9b) ======

const LEVEL_SYSTEM_PROMPT = `Bạn là chuyên gia thiết kế giáo trình tiếng Anh chuyên ngành. Nhiệm vụ CỦA LƯỢT NÀY: nhận 1
CHÂN DUNG NGHỀ đã chốt sẵn (không tự suy luận lại, dùng nguyên) và danh sách KHUNG TÌNH HUỐNG
GIAO TIẾP trừu tượng CỦA ĐÚNG 1 CẤP ĐỘ CEFR, sinh bộ CHỦ ĐỀ CỤ THỂ đúng ngành cho từng khung ở
cấp độ đó — để dùng làm "da" phủ lên 1 xương giáo trình chung, KHÔNG đổi ngữ pháp/chức năng
giao tiếp của khung.

Với MỖI khung tình huống được cung cấp, khung mô tả một CHỨC NĂNG GIAO TIẾP trừu tượng (vd "yêu
cầu sản phẩm/dịch vụ tại quầy", "phàn nàn & xử lý sự cố dịch vụ/sản phẩm"), KHÔNG phải một bối
cảnh cố định. Dùng merged_occupation + interlocutors + core_terms của chân dung nghề được cung
cấp làm nguồn. Quy tắc thích nghi:
- Nếu ngành khớp nghĩa đen với khung (vd ngành "Nhà hàng" + khung "yêu cầu sản phẩm/dịch vụ tại
  quầy"): sinh chủ đề đúng ngành, càng cụ thể càng tốt.
- Nếu ngành KHÔNG khớp nghĩa đen (vd ngành "Kế toán" + khung "yêu cầu sản phẩm/dịch vụ tại
  quầy"): GIỮ NGUYÊN chức năng giao tiếp (vẫn là "yêu cầu 1 thứ tại 1 nơi"), đổi VAI và BỐI
  CẢNH cho hợp ngành (vd "khách hàng yêu cầu bộ hồ sơ quyết toán tại quầy tiếp nhận của công ty
  kế toán"). KHÔNG được bỏ khung, không được lờ đi.
- Nếu thật sự không thể thích nghi dù đã thử đổi vai/bối cảnh (hiếm, chỉ dùng khi thực sự bế
  tắc): trả về CHỦ ĐỀ TỔNG QUÁT (sẽ được cung cấp sẵn trong dữ liệu đầu vào cho mỗi khung) và
  đánh dấu "fallback": true cho mục đó — không được tự bịa 1 chủ đề gượng ép chỉ để có vẻ đúng
  ngành.
  TIÊU CHÍ KIỂM ĐƯỢC cho "thật sự không thể thích nghi": nếu thay tên ngành trong chủ đề bạn sắp
  viết bằng MỘT NGÀNH BẤT KỲ khác mà câu vẫn đúng y nguyên, không cần sửa gì thêm ngoài đúng cái
  tên ngành/vai — nghĩa là chủ đề đó chỉ đang GẮN NHÃN ngành lên một ý chung chung, không chứa
  chi tiết/thuật ngữ/tình huống ĐẶC THÙ của riêng ngành này — thì đó là dấu hiệu PHẢI đánh dấu
  "fallback": true, KHÔNG được cố nghĩ ra 1 câu nghe hợp lý rồi để "fallback": false.
  Ví dụ minh hoạ (chỉ để hiểu Ý, không phải nội dung thật của ngành nào trong hệ thống): ngành
  "Đánh giày dạo" gặp khung trừu tượng "quyền riêng tư số" — câu "Quyền riêng tư của khách hàng
  khi đánh giày" chỉ gắn nhãn ngành lên 1 ý chung, xoá "đánh giày" đi câu vẫn đúng với BẤT KỲ dịch
  vụ nào khác -> PHẢI "fallback": true. Cùng ngành "Đánh giày dạo" gặp khung "đàm phán hợp
  đồng/thương lượng" thì KHÔNG cần fallback: "Thương lượng giá đánh giày trọn gói với khách quen
  lâu năm" là tình huống THẬT của riêng nghề này (khách quen, giá trọn gói là chi tiết đặc thù),
  không phải nhãn dán chung chung.
- Mỗi khung cần ÍT NHẤT số biến thể ghi trong "required_count" của khung đó (có thể sinh dư 1-2
  cho an toàn, không được ít hơn). CÁC BIẾN THỂ TRONG CÙNG 1 KHUNG PHẢI KHÁC NHAU RÕ RỆT — không
  lặp lại cùng 1 câu chuyện/bối cảnh dưới cách diễn đạt khác, để học viên không thấy 2 bài liền
  nhau giống hệt nhau dù đổi vài từ. NGOẠI LỆ DUY NHẤT: 2 lần xuất hiện của CÙNG 1 khung nằm
  trong CÙNG 1 "mạch chủ đề" (xem mục MẠCH CHỦ ĐỀ LIÊN TỤC bên dưới) — lúc đó KHÔNG cần khác
  nhau rõ rệt, thậm chí NÊN là 2 góc nhìn/khoảnh khắc của CÙNG một tình huống/nhân vật/địa điểm.

MẠCH CHỦ ĐỀ LIÊN TỤC — QUY TRÌNH BẮT BUỘC 2 BƯỚC, ĐÚNG THỨ TỰ (sửa 2026-07-28 sau khi phát hiện
lỗi thật: chỉ nhắc "phải nối mạch" chung chung không đủ, model từng để 2 bài cùng chuỗi nói về 2
NHÂN VẬT khác nhau — "hỏi về đồng nghiệp thân thiết" rồi sang "nói về bạn cùng lớp" — đọc thì có
vẻ cùng chủ đề nhưng KHÔNG phải cùng 1 câu chuyện). User prompt cho bạn ĐÚNG THỨ TỰ các bài học
sẽ diễn ra trong cấp độ này (mục "THỨ TỰ BÀI HỌC"), mỗi dòng 1 vị trí = 1 bài, kèm khung tình
huống của vị trí đó — TUYỆT ĐỐI KHÔNG được viết bất kỳ "topic" nào trước khi hoàn thành BƯỚC 1
dưới đây.

BƯỚC 1 — DỰNG "story_chains" (khung câu chuyện) TRƯỚC, cho TỪNG chuỗi: chia danh sách vị trí
thành các chuỗi VỊ TRÍ LIÊN TIẾP (thường 2-3 vị trí, có thể dao động, không bắt buộc bằng nhau —
dù cùng khung hay khác khung đều gộp được, mỗi khung trong chuỗi vẫn phải đúng chức năng giao
tiếp riêng của nó, KHÔNG đổi khung để hợp câu chuyện). Với MỖI chuỗi, viết ra ĐỦ 3 phần, CỤ THỂ
(không viết chung chung):
- "character": nhân vật chính của chuỗi — TÊN RIÊNG hoặc VAI TRÒ CỤ THỂ (vd "một khách hàng tên
  Lan", "đồng nghiệp mới tên Minh") — PHẢI GIỮ NGUYÊN, không đổi, ở MỌI vị trí trong chuỗi đó.
- "setting": bối cảnh/không gian cụ thể (địa điểm + tình huống nền, vd "quầy pha chế của quán cà
  phê vào ca sáng") — PHẢI GIỮ NGUYÊN, không đổi, ở MỌI vị trí trong chuỗi đó.
- "arc": 1-2 câu mô tả mạch diễn biến CỦA CẢ CHUỖI — vị trí đầu MỞ ĐẦU câu chuyện, vị trí giữa
  (nếu có) PHÁT TRIỂN TIẾP NỐI TRỰC TIẾP (không phải chuyện mới), vị trí cuối có KẾT QUẢ/KẾT
  THÚC rõ ràng. Đây PHẢI là 1 CÂU CHUYỆN DUY NHẤT chảy xuyên suốt cả chuỗi, KHÔNG PHẢI 2-3 câu
  chuyện tách rời chỉ tình cờ cùng 1 chủ đề chung chung.
Hết 1 chuỗi thì CHUYỂN HẲN sang nhân vật/bối cảnh khác cho chuỗi tiếp theo (không dùng lại nhân
vật/bối cảnh của chuỗi trước — tránh cảm giác 1 series bất tận xuyên suốt cả level).

BƯỚC 2 — SAU KHI ĐÃ CÓ story_chains, MỚI viết "topic" cho từng vị trí: mỗi topic PHẢI nhắc TRỰC
TIẾP đến ĐÚNG "character" + "setting" của đúng chuỗi chứa vị trí đó (gắn kèm "chain_id" của chuỗi
đó) — KHÔNG được tự ý đổi sang nhân vật/bối cảnh khác dù vẫn cùng khung tình huống trừu tượng.
LỖI CẤM cụ thể (đối chiếu lỗi thật đã bắt được): vị trí 1 trong 1 chuỗi viết "hỏi về đồng nghiệp
thân thiết" rồi vị trí 2 CÙNG chuỗi đó lại viết "nói về bạn cùng lớp" — đây là 2 NHÂN VẬT khác
nhau dù cùng khung "người thân thuộc", SAI. ĐÚNG phải là: cả 2 vị trí CÙNG xoay quanh 1 người cụ
thể đã chốt ở "character" của chuỗi (vd cả 2 vị trí đều nói về "đồng nghiệp tên Minh" — vị trí 1
hỏi thông tin cơ bản về Minh, vị trí 2 tiếp tục nói về sở thích của CHÍNH Minh đó).
- Mỗi khung cần ÍT NHẤT số biến thể ghi trong "required_count" của khung đó (có thể sinh dư 1-2
  cho an toàn, không được ít hơn). CÁC BIẾN THỂ TRONG CÙNG 1 KHUNG PHẢI KHÁC NHAU RÕ RỆT — không
  lặp lại cùng 1 câu chuyện/bối cảnh dưới cách diễn đạt khác, để học viên không thấy 2 bài liền
  nhau giống hệt nhau dù đổi vài từ. NGOẠI LỆ DUY NHẤT: 2 lần xuất hiện của CÙNG 1 khung nằm
  trong CÙNG 1 chuỗi (cùng "chain_id") — lúc đó KHÔNG cần khác nhau rõ rệt, PHẢI cùng 1 nhân
  vật/bối cảnh như quy định ở trên, chỉ khác góc nhìn/khoảnh khắc trong câu chuyện.

ĐẦU RA: CHỈ trả JSON hợp lệ theo đúng khuôn dưới đây, không thêm chữ nào ngoài JSON, không bọc
markdown code fence:

{
  "level": "<mã level của lượt này, vd A1>",
  "story_chains": [
    {
      "chain_id": 1,
      "start_position": <số thứ tự vị trí đầu chuỗi, theo mục THỨ TỰ BÀI HỌC>,
      "end_position": <số thứ tự vị trí cuối chuỗi>,
      "character": "<nhân vật chính, cụ thể>",
      "setting": "<bối cảnh/không gian, cụ thể>",
      "arc": "<mạch diễn biến mở đầu -> phát triển -> kết thúc>"
    }
  ],
  "frames": {
    "<frame_key>": [ { "topic": "<chủ đề cụ thể đúng ngành, tiếng Việt, ngắn gọn kiểu tên chủ đề bài học, PHẢI nhắc tới character+setting của chain_id tương ứng>", "fallback": false, "chain_id": <đúng chain_id của chuỗi chứa vị trí này> } ]
  }
}

"<frame_key>" phải khớp CHÍNH XÁC danh sách frame key được cung cấp trong user prompt cho level
này — không tự thêm/bớt/đổi tên key, không lẫn frame_key của level khác. Mảng biến thể của MỖI
frame_key PHẢI theo ĐÚNG THỨ TỰ các vị trí của khung đó trong mục "THỨ TỰ BÀI HỌC" (phần tử đầu =
vị trí đầu tiên khung đó xuất hiện, phần tử 2 = vị trí kế tiếp khung đó xuất hiện, v.v. — nếu sinh
dư biến thể so với required_count, các phần tử dư thêm vào CUỐI mảng, không phá thứ tự các phần
tử đã khớp vị trí). "story_chains" PHẢI phủ HẾT mọi vị trí trong mục "THỨ TỰ BÀI HỌC" (không bỏ
sót vị trí nào ngoài mọi chuỗi), các "start_position"/"end_position" của các chuỗi liên tiếp
không chồng lấn nhau.`;

function buildLevelUserPrompt({ occupationProfile, level, frames, requiredCounts, skinGeneralForLevel, spineSlots }) {
  const interlocutorsLine = occupationProfile.interlocutors
    .map((i) => `${i.role} (${i.register})`)
    .join(", ");
  const lines = [
    "Chân dung nghề đã chốt (dùng nguyên, không suy luận lại):",
    `- Nghề/ngành: ${occupationProfile.merged_occupation}`,
    `- Phạm vi giao tiếp chính: ${occupationProfile.primary_communication_scope}`,
    `- Người đối thoại: ${interlocutorsLine}`,
    `- Thuật ngữ lõi: ${occupationProfile.core_terms.join(", ")}`,
    "",
    `Cấp độ cần sinh chủ đề: ${level}`,
    "",
    `Danh sách khung tình huống của cấp độ ${level} (frame_key | tên khung tiếng Việt | số biến thể tối thiểu | chủ đề da Tổng quát tham khảo/fallback):`,
    "",
  ];
  for (const frame of frames) {
    const fallbackTopics = (skinGeneralForLevel[frame.key] || []).join(" / ");
    lines.push(`${frame.key} | ${frame.name_vi} | tối thiểu ${requiredCounts[frame.key]} | ${fallbackTopics}`);
  }
  // THỨ TỰ BÀI HỌC (2026-07-28, "mạch chủ đề liên tục") — đúng thứ tự spine ĐÃ ĐÓNG BĂNG của
  // level này, dùng để model (a) biết vị trí nào liền kề vị trí nào mà nhóm chủ đề lớn, (b)
  // biết đúng thứ tự phải xếp mảng biến thể của mỗi frame_key (xem cuối LEVEL_SYSTEM_PROMPT).
  if (spineSlots?.length) {
    lines.push("", `THỨ TỰ BÀI HỌC của cấp độ ${level} (vị trí | frame_key | tên khung | chức năng giao tiếp):`, "");
    spineSlots.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.situation_frame_key} | ${s.situation_frame} | ${s.function_name_vi}`);
    });
  }
  lines.push("", "Sinh chủ đề cho TẤT CẢ frame_key liệt kê ở trên, đúng khuôn JSON đã mô tả trong system prompt.");
  return lines.join("\n");
}

function validateLevelPayload(level, data, frames, requiredCounts) {
  const problems = [];
  if (!data || data.level !== level) problems.push(`level trả về không khớp (kỳ vọng ${level})`);
  const frameKeys = frames.map((f) => f.key);
  const gotFrames = (data && data.frames) || {};
  const gotKeys = Object.keys(gotFrames);
  const missing = frameKeys.filter((k) => !gotKeys.includes(k));
  const extra = gotKeys.filter((k) => !frameKeys.includes(k));
  if (missing.length) problems.push(`thiếu frame: ${missing.join(", ")}`);
  if (extra.length) problems.push(`thừa frame ngoài danh sách: ${extra.join(", ")}`);
  for (const key of frameKeys) {
    const topics = (gotFrames[key] || []).map((t) => (t && t.topic ? String(t.topic).trim().toLowerCase() : ""));
    const need = requiredCounts[key] || 0;
    if (topics.length < need) problems.push(`${key}: chỉ có ${topics.length}/${need} biến thể`);
    const seen = new Set();
    for (const t of topics) {
      if (t && seen.has(t)) {
        problems.push(`${key}: trùng lặp topic "${t}"`);
        break;
      }
      seen.add(t);
    }
  }
  // "story_chains" (2026-07-28, "mạch chủ đề" bước 1 bắt buộc) — CHỈ kiểm cấu trúc tối thiểu
  // (mảng không rỗng, đủ 3 trường cốt lõi mỗi chuỗi), KHÔNG kiểm nội dung topic có THẬT SỰ nhắc
  // đúng character/setting hay không (việc đó cần đọc hiểu tự nhiên, không kiểm bằng code được
  // đáng tin cậy — dựa vào prompt + soát bằng mắt lúc nghiệm thu, xem ghi chú Việc 3 trước đó về
  // rủi ro validate quá chặt làm tăng tỷ lệ fail oan).
  const chains = Array.isArray(data?.story_chains) ? data.story_chains : [];
  if (!chains.length) {
    problems.push("thiếu story_chains (bước 1 bắt buộc của mạch chủ đề)");
  } else {
    const badChain = chains.find((c) => !c || !String(c.character || "").trim() || !String(c.setting || "").trim() || !String(c.arc || "").trim());
    if (badChain) problems.push("story_chains có mục thiếu character/setting/arc");
  }
  return problems;
}

async function callLevelOnce({ occupationProfile, level, frames, requiredCounts, skinGeneralForLevel, spineSlots }) {
  const messages = [
    { role: "system", content: LEVEL_SYSTEM_PROMPT },
    { role: "user", content: buildLevelUserPrompt({ occupationProfile, level, frames, requiredCounts, skinGeneralForLevel, spineSlots }) },
  ];
  // maxTokens 3500->6000 (2026-07-28, trần cứng MAX_TOKENS_CAP của aiProvider.js): thêm
  // "story_chains" + "chain_id" trên mỗi topic (mạch chủ đề, xem LEVEL_SYSTEM_PROMPT) làm JSON
  // dài hơn hẳn — lỗi thật đo được: A1 (89 slot) bị CẮT GIỮA JSON ở đúng 3500 completion tokens
  // (parse fail cả 2 lần thử), không phải lỗi nội dung.
  const r = await generateStructuredJSON({ tier: SKIN_MODEL_TIER, temperature: 0.7, maxTokens: 6000, messages });
  const telemetry = { model: r.model, usage: r.usage, durationMs: r.durationMs };
  return r.ok ? { ok: true, data: r.data, ...telemetry } : { ok: false, parseError: !!r.parseError, ...telemetry };
}

function requiredCountsForSlots(slots) {
  const counts = {};
  for (const s of slots) counts[s.situation_frame_key] = (counts[s.situation_frame_key] || 0) + 1;
  return counts;
}

// SINH DẦN TỪNG CHUNK KHI CẦN (2026-07-28, sửa lỗi thật LẦN 2 — bản đầu tiên trong ngày gọi Lượt
// B TUẦN TỰ cho HẾT mọi chunk của 1 level ngay trong request đầu tiên: dù từng lượt gọi riêng lẻ
// đủ nhanh, TỔNG thời gian nhiều lượt cộng dồn vẫn vượt hẳn trần 60s của Vercel — đo được thật
// FUNCTION_INVOCATION_TIMEOUT, A1/A2/B1/B2 đều ~80-89 slot nên không phải ca hiếm). Sửa đúng gốc
// bằng cách áp dụng NGUYÊN TẮC LƯỜI đã dùng cho cấp LEVEL (industry_skins chỉ sinh level nào
// ĐANG CẦN, xem ensureSkinChunk — ĐÃ ARCHIVE cùng mentor.js 2026-08-11, xem
// _archive/mentor-ai-personal-flow/) xuống thêm 1 tầng: CHỈ sinh CHUNK (~20 vị trí
// liên tiếp) chứa đúng slot đang cần cho bài SẮP TẠO, không sinh trước cả level. Slot ở chunk
// khác tự sinh chunk của NÓ khi tới lượt (next_lesson gọi kế tiếp) — vẫn CHỈ 1 lượt gọi AI/chunk
// suốt đời (dùng chung theo ngành, cache vĩnh viễn), không sinh lại khi đã có.
export const SKIN_CHUNK_SIZE = 20;

export function chunkIndexForSlot(slotIndex) {
  return Math.floor(slotIndex / SKIN_CHUNK_SIZE);
}

// occurrenceIndex trả về ở đây là CỤC BỘ TRONG CHUNK (đếm số lần frameKey xuất hiện tính từ ĐẦU
// CHUNK, không phải từ đầu level) — PHẢI khớp đúng cách frames[frameKey] của 1 chunk được sinh
// (generateSkinChunk chỉ yêu cầu đủ biến thể cho các lần frameKey xuất hiện TRONG chunk đó, xem
// requiredCountsForSlots), khác hẳn ý nghĩa cũ (occurrence tính từ đầu LEVEL) trước khi chunk hoá.
export function localOccurrenceInChunk(spineLevelSlots, slotIndex) {
  const slot = spineLevelSlots[slotIndex];
  const chunkIndex = chunkIndexForSlot(slotIndex);
  const chunkStart = chunkIndex * SKIN_CHUNK_SIZE;
  const chunkSlots = spineLevelSlots.slice(chunkStart, chunkStart + SKIN_CHUNK_SIZE);
  const localIndex = slotIndex - chunkStart;
  const occurrenceIndex =
    chunkSlots.slice(0, localIndex + 1).filter((s) => s.situation_frame_key === slot.situation_frame_key).length - 1;
  return { chunkIndex, occurrenceIndex };
}

// Sinh Lượt B cho ĐÚNG 1 CHUNK (~20 vị trí liên tiếp) của 1 level — đơn vị lười nhỏ nhất. Cap
// MAX_SKIN_LEVEL_ATTEMPTS, đúng mục 10 gốc (retry riêng khi gãy, không tính lượt ngoài trần).
// "model"/"usage"/"durationMs" ở output là của LƯỢT GỌI CUỐI, giống generateOccupationProfile.
export async function generateSkinChunk({ occupationProfile, level, spineLevelSlots, chunkIndex, skinGeneralForLevel }) {
  const chunkStart = chunkIndex * SKIN_CHUNK_SIZE;
  const chunkSlots = spineLevelSlots.slice(chunkStart, chunkStart + SKIN_CHUNK_SIZE);
  if (!chunkSlots.length) return { ok: false, level, chunkIndex, problems: [`chunkIndex ${chunkIndex} ngoài phạm vi level ${level}`] };

  const chunkFrameKeys = new Set(chunkSlots.map((s) => s.situation_frame_key));
  const frames = SITUATION_FRAMES[level].filter((f) => chunkFrameKeys.has(f.key));
  const requiredCounts = requiredCountsForSlots(chunkSlots);

  let lastProblems = ["chưa gọi lần nào"];
  let lastTelemetry = {};
  for (let attempt = 1; attempt <= MAX_SKIN_LEVEL_ATTEMPTS; attempt++) {
    const result = await callLevelOnce({ occupationProfile, level, frames, requiredCounts, skinGeneralForLevel, spineSlots: chunkSlots });
    lastTelemetry = { model: result.model, usage: result.usage, durationMs: result.durationMs };
    if (!result.ok || result.parseError) {
      lastProblems = ["gọi API hoặc parse JSON thất bại"];
      continue;
    }
    const problems = validateLevelPayload(level, result.data, frames, requiredCounts);
    if (!problems.length) {
      return {
        ok: true,
        level,
        chunkIndex,
        frames: result.data.frames,
        story_chains: result.data.story_chains || [],
        attempts: attempt,
        ...lastTelemetry,
      };
    }
    lastProblems = problems;
  }
  return { ok: false, level, chunkIndex, problems: lastProblems, attempts: MAX_SKIN_LEVEL_ATTEMPTS, ...lastTelemetry };
}
