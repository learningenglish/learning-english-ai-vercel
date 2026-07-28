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
// content_type/function_name_vi...) — mentor.js dùng để xác định "slot kế tiếp" khi nối
// next_slot vào da lĩnh vực (2026-07-22), KHÔNG tự đọc file JSON riêng để tránh 2 nơi cùng biết
// đường dẫn file.
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

MẠCH CHỦ ĐỀ LIÊN TỤC (bắt buộc): user prompt sẽ cho bạn ĐÚNG THỨ TỰ các bài học sẽ diễn ra trong
cấp độ này (mục "THỨ TỰ BÀI HỌC"), mỗi dòng 1 vị trí = 1 bài, kèm khung tình huống của vị trí đó.
Coi danh sách này là 1 chuỗi "chương truyện" tuần tự — với MỖI biến thể "topic" bạn sinh ra, hãy
gán nó cho ĐÚNG 1 vị trí cụ thể trong danh sách (dùng số thứ tự vị trí để tự đối chiếu, không cần
ghi số đó vào JSON đầu ra — chỉ cần ĐÚNG THỨ TỰ mảng biến thể của từng khung khớp với thứ tự các
vị trí của khung đó xuất hiện trong danh sách, đọc từ trên xuống). Nhóm các vị trí LIÊN TIẾP
(thường 2-3 vị trí, có thể dao động, không bắt buộc bằng nhau) — dù cùng khung hay khác khung —
thành 1 CHỦ ĐỀ LỚN DUY NHẤT có mạch truyện: mở đầu ở vị trí đầu chuỗi, phát triển/diễn biến thêm
ở (các) vị trí giữa, có kết quả/kết thúc rõ ràng ở vị trí cuối chuỗi (vd cùng 1 nhân vật/khách
hàng/công ty/địa điểm xuyên suốt cả chuỗi). Hết 1 chuỗi thì CHUYỂN HẲN sang 1 câu chuyện khác cho
chuỗi vị trí tiếp theo — không dùng lại nhân vật/bối cảnh của chuỗi trước (để tránh học viên thấy
mọi bài giống 1 series bất tận). Chuỗi có thể GỘP nhiều khung khác nhau (mỗi khung vẫn phải đúng
chức năng giao tiếp riêng của nó — KHÔNG đổi khung để hợp câu chuyện) hoặc chỉ 1 khung lặp 2 lần
liên tiếp — cả 2 dạng đều hợp lệ.

ĐẦU RA: CHỈ trả JSON hợp lệ theo đúng khuôn dưới đây, không thêm chữ nào ngoài JSON, không bọc
markdown code fence:

{
  "level": "<mã level của lượt này, vd A1>",
  "frames": {
    "<frame_key>": [ { "topic": "<chủ đề cụ thể đúng ngành, tiếng Việt, ngắn gọn kiểu tên chủ đề bài học>", "fallback": false } ]
  }
}

"<frame_key>" phải khớp CHÍNH XÁC danh sách frame key được cung cấp trong user prompt cho level
này — không tự thêm/bớt/đổi tên key, không lẫn frame_key của level khác. Mảng biến thể của MỖI
frame_key PHẢI theo ĐÚNG THỨ TỰ các vị trí của khung đó trong mục "THỨ TỰ BÀI HỌC" (phần tử đầu =
vị trí đầu tiên khung đó xuất hiện, phần tử 2 = vị trí kế tiếp khung đó xuất hiện, v.v. — nếu sinh
dư biến thể so với required_count, các phần tử dư thêm vào CUỐI mảng, không phá thứ tự các phần
tử đã khớp vị trí).`;

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
  return problems;
}

async function callLevelOnce({ occupationProfile, level, frames, requiredCounts, skinGeneralForLevel, spineSlots }) {
  const messages = [
    { role: "system", content: LEVEL_SYSTEM_PROMPT },
    { role: "user", content: buildLevelUserPrompt({ occupationProfile, level, frames, requiredCounts, skinGeneralForLevel, spineSlots }) },
  ];
  const r = await generateStructuredJSON({ tier: SKIN_MODEL_TIER, temperature: 0.7, maxTokens: 3500, messages });
  const telemetry = { model: r.model, usage: r.usage, durationMs: r.durationMs };
  return r.ok ? { ok: true, data: r.data, ...telemetry } : { ok: false, parseError: !!r.parseError, ...telemetry };
}

// Gọi lại RIÊNG lượt B của 1 level khi gãy — cap MAX_SKIN_LEVEL_ATTEMPTS, đúng mục 10.
// "model"/"usage"/"durationMs" ở output là của LƯỢT GỌI CUỐI, giống generateOccupationProfile.
// "spineSlots" (2026-07-28, "mạch chủ đề liên tục") = curriculum_spine.json levels[level] ĐÚNG
// THỨ TỰ — optional (caller cũ chưa truyền thì bằng undefined, buildLevelUserPrompt tự bỏ qua
// mục "THỨ TỰ BÀI HỌC", coi như trước đây) để không ép mọi call site cũ (nếu có script test cũ)
// phải sửa theo.
export async function generateLevelTopics({ occupationProfile, level, requiredCounts, skinGeneralForLevel, spineSlots }) {
  const frames = SITUATION_FRAMES[level];
  let lastProblems = ["chưa gọi lần nào"];
  let lastTelemetry = {};
  for (let attempt = 1; attempt <= MAX_SKIN_LEVEL_ATTEMPTS; attempt++) {
    const result = await callLevelOnce({ occupationProfile, level, frames, requiredCounts, skinGeneralForLevel, spineSlots });
    lastTelemetry = { model: result.model, usage: result.usage, durationMs: result.durationMs };
    if (!result.ok || result.parseError) {
      lastProblems = ["gọi API hoặc parse JSON thất bại"];
      continue;
    }
    const problems = validateLevelPayload(level, result.data, frames, requiredCounts);
    if (!problems.length) return { ok: true, level, frames: result.data.frames, attempts: attempt, ...lastTelemetry };
    lastProblems = problems;
  }
  return { ok: false, level, problems: lastProblems, attempts: MAX_SKIN_LEVEL_ATTEMPTS, ...lastTelemetry };
}

// ====== Điều phối toàn bộ 6 lượt gọi (mục 0 + mục 10) ======
//
// Gọi generateOccupationProfile() trước, đợi UI hiện màn xác nhận + người dùng bấm "Bắt đầu
// học" rồi mới gọi generateLevelTopicsForAllLevels() — 2 hàm TÁCH RIÊNG (không gộp thành 1 hàm
// generateSkin() duy nhất) để khớp đúng luồng chẻ lượt: lượt chân dung phải xong và hiện màn
// xác nhận cho người dùng TRƯỚC KHI 5 lượt level bắt đầu, không phải gọi liền tù tì.

export async function generateLevelTopicsForAllLevels(occupationProfile) {
  const requiredCounts = requiredCountsByLevel();
  const skinGeneral = loadSkinGeneral();
  const spine = loadCurriculumSpine();
  const levels = {};
  const levelRetries = {};
  for (const level of LEVELS) {
    const r = await generateLevelTopics({
      occupationProfile,
      level,
      requiredCounts: requiredCounts[level],
      skinGeneralForLevel: skinGeneral[level] || {},
      spineSlots: spine[level] || [],
    });
    if (!r.ok) {
      return { status: "level_generation_failed", level, problems: r.problems };
    }
    levels[level] = r.frames;
    levelRetries[level] = r.attempts - 1;
  }
  return { status: "ok", levels, levelRetries };
}

// Ghép kết quả Lượt A + Lượt B thành 1 file da hoàn chỉnh, kèm generation_meta do CODE tự ghi
// (không phải model trả về) — đúng khuôn cuối mục 10.
export function assembleSkin({ industryKeywords, profileResult, levelResult }) {
  return {
    industry_keywords: industryKeywords,
    occupation_profile: profileResult.data.occupation_profile,
    generation_meta: {
      web_search_used: profileResult.webSearchUsed,
      profile_call_attempts: profileResult.attempts,
      level_call_retries: levelResult.levelRetries,
    },
    levels: levelResult.levels,
  };
}
