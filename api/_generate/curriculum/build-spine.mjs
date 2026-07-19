// api/_generate/curriculum/build-spine.mjs — script SINH curriculum_spine.json bằng thuật
// toán tất định (KHÔNG gọi AI — blocker OPENAI_API_KEY bị sandbox che giá trị thật, xem
// feedback_sandbox_blocks_real_api_keys trong memory). Không chạy lúc runtime của app — chỉ
// chạy TAY khi cần tạo lại spine (đổi catalog/theme/quy tắc phân bổ), giữ trong repo để tái
// tạo được, không phải hộp đen. Chạy: node api/_generate/curriculum/build-spine.mjs
//
// QUY TẮC PHÂN BỔ đã chốt với Minh (2026-07-19, CẬP NHẬT lần 2 — bỏ số cứng 80/level):
// - KHÔNG còn tổng slot cố định. Spine mỗi level phải PHỦ HẾT grammar catalog của level đó
//   (mỗi điểm: 1 slot dạy MỚI + ~2 slot ôn tập cách quãng REVIEW_GAP) — tổng số slot RƠI TỰ
//   NHIÊN từ lịch dạy+ôn này, không áp đặt trước.
// - Đọc/hội thoại vẫn ~50/50, xen kẽ nghiêm ngặt (lẻ=đọc, chẵn=hội thoại).
// - Nếu tổng > MAX_SLOTS (90): GỘP các cặp điểm ngữ pháp NHỎ/LIÊN QUAN thành 1 sự kiện DẠY
//   CHUNG (giảm số sự kiện dạy độc lập -> rút ngắn lịch) — xem GROUP_TEACH_PAIRS, và IN CẢNH
//   BÁO ra console để báo lại Minh, không tự ý gộp thêm ngoài danh sách đã khai báo rõ.
// - Nếu tổng < MIN_SLOTS_EXPECTED (70): CHỈ in cảnh báo (không tự bù slot) — trường hợp này
//   Minh chưa ra quy tắc xử lý, cần hỏi lại trước khi tự thêm slot đệm.
// - Từ mới + mật độ chuyên ngành tăng dần theo level (WORD_CYCLE/DENSITY_CYCLE).
// - MỚI: mỗi slot có "vocab_stretch" — 1 câu HƯỚNG DẪN tĩnh (nguyên lý i+1: phần lớn từ
//   vựng đúng cấp, xen vài từ tự nhiên nhô lên cấp kế tiếp) để đưa vào prompt generate_lesson
//   sau này NHƯ HƯỚNG DẪN, không phải % bắt buộc.
// - Chủ đề TRUNG TÍNH, chưa gắn lĩnh vực (lĩnh vực là lớp phủ áp dụng sau, việc riêng).
import { GRAMMAR_CATALOG, realGrammarPointsByLevel } from "./grammar-catalog.js";
import { functionsByLevel } from "./functions-catalog.js";
import { TEACH_ORDER } from "./grammar-order.js";
import { SITUATION_FRAMES } from "./situation-frames.js";
import { FRAME_FUNCTIONS } from "./frame-function-map.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Danh từ chỉ địa điểm/ngành CỤ THỂ — không được xuất hiện trong tên khung tình huống
// (situation_frame). Nếu có, đó là dấu hiệu lớp "da" (chủ đề/lĩnh vực) đã lọt vào "xương"
// (spine phải trung tính lĩnh vực — xem chỉ thị kiến trúc 2026-07-19 lần 2).
const BANNED_SUBSTRINGS = [
  "cà phê", "sân bay", "siêu thị", "nhà hàng", "khách sạn", "bệnh viện", "ngân hàng",
  "trường học", "công ty", "văn phòng", "cửa hàng", "quán ăn", "quán cà", "tiệm",
  "hiệu thuốc", "phòng khám", "nhà ga", "bến xe", "phi trường",
  // Bổ sung 2026-07-19 (lần 4) — máy quét từ khoá vòng trước bỏ sót 3 khung vẫn dính da cụ
  // thể: "món" (chỉ ngành ăn uống cụ thể) và "thời tiết" (1 chủ đề cụ thể của da Tổng quát,
  // không phải loại tình huống trừu tượng). LƯU Ý: "thanh toán" (trả tiền/thanh toán) KHÔNG
  // cấm đơn lẻ — đây là hành vi giao tiếp chung cho mọi ngành (dịch vụ, y tế, logistics đều
  // có bước thanh toán); chỉ cấm khi đi kèm danh từ ngành cụ thể (đã có trong danh sách trên,
  // vd "thanh toán ở quán cà phê" sẽ bị bắt bởi từ khoá "cà phê", không cần thêm "thanh toán".
  "món", "thời tiết",
];

// Cặp điểm ngữ pháp NHỎ/LIÊN QUAN được DẠY CHUNG 1 sự kiện (giảm số sự kiện dạy độc lập) —
// CHỈ áp dụng cho level thật sự vượt MAX_SLOTS sau khi tính tự nhiên (xem console log cuối
// script để biết level nào bị áp dụng). Chọn theo mức độ liên quan ngữ nghĩa thật (không
// gộp tuỳ tiện): "a/an/the" và số nhiều gần như luôn dạy cùng lúc trong ESL A1 chuẩn.
const GROUP_TEACH_PAIRS = {
  A1: [["articles", "plural_nouns"]],
};

const WORD_CYCLE = { A1: [6, 7, 8], A2: [8, 9, 10], B1: [10, 11, 12], B2: [12, 13, 14, 15], C1: [14, 15, 16, 17, 18] };
const DENSITY_CYCLE = { A1: [5, 7, 10], A2: [10, 12, 15], B1: [15, 17, 20], B2: [20, 22, 25], C1: [25, 27, 30] };
const REVIEW_GAP = 12;
const TEACH_INTERVAL = 4; // khoảng cách giữa 2 sự kiện dạy MỚI liên tiếp
const MAX_SLOTS = 90;
const MIN_SLOTS_EXPECTED = 70;
// Tổng slot/level đã ĐÓNG BĂNG ở commit d327414 (đối chiếu bắt buộc — lệch là fail, xem
// "BÀI HỌC ĐẮT NHẤT" trong chỉ thị: quyết định đã duyệt không được để script mới âm thầm
// ghi đè). C1=61 là quyết định có chủ đích (không đệm slot rỗng), không phải lỗi.
const FROZEN_TOTALS = { A1: 89, A2: 81, B1: 85, B2: 85, C1: 61 };
// Đổi tên từ "spine_draft.json" -> "curriculum_spine.json" khi đóng băng (2026-07-19,
// commit 0c47c9d) — cùng 1 file trong suốt vòng đời draft->frozen, không có file draft rời.
const OUTPUT_FILE = "curriculum_spine.json";
const VOCAB_STRETCH_NOTE =
  "Phần lớn từ vựng đúng cấp độ hiện tại; xen một vài từ tự nhiên nhô lên cấp kế tiếp (nguyên lý i+1) — không ép tỷ lệ %, chỉ là hướng dẫn định tính.";

function buildLevelSpine(level) {
  const allPoints = realGrammarPointsByLevel(level); // loại type:"vocab"
  const groupPairs = GROUP_TEACH_PAIRS[level] || [];

  // "teachEvents": mỗi phần tử là 1 SỰ KIỆN dạy mới, có thể mang 1 điểm hoặc 1 CẶP điểm gộp.
  // Thứ tự lấy từ TEACH_ORDER (soạn tay, tôn trọng phụ thuộc ngữ pháp) — KHÔNG dùng thứ tự
  // khai báo tình cờ trong catalog.
  const order = TEACH_ORDER[level];
  if (!order) throw new Error(`Thiếu TEACH_ORDER cho level ${level}`);
  const teachEvents = order.map((entry) => entry.split("+"));

  // Tự kiểm: TEACH_ORDER phải phủ đúng — không thiếu, không thừa, không trùng — so với
  // catalog (đối chiếu cả cặp gộp khai báo trong GROUP_TEACH_PAIRS).
  const orderKeys = teachEvents.flat();
  const catalogKeys = allPoints.map((p) => p.key);
  const orderSet = new Set(orderKeys);
  const catalogSet = new Set(catalogKeys);
  const missing = catalogKeys.filter((k) => !orderSet.has(k));
  const extra = orderKeys.filter((k) => !catalogSet.has(k));
  const dup = orderKeys.filter((k, i) => orderKeys.indexOf(k) !== i);
  if (missing.length || extra.length || dup.length) {
    throw new Error(
      `TEACH_ORDER[${level}] không khớp catalog — thiếu: [${missing}] thừa: [${extra}] trùng: [${dup}]`
    );
  }
  const expectedGrouped = new Set(groupPairs.map((p) => p.join("+")));
  const actualGrouped = new Set(order.filter((e) => e.includes("+")));
  if (expectedGrouped.size !== actualGrouped.size || [...expectedGrouped].some((g) => !actualGrouped.has(g))) {
    throw new Error(`TEACH_ORDER[${level}] không khớp GROUP_TEACH_PAIRS đã khai báo`);
  }

  const frames = SITUATION_FRAMES[level];
  const frameFnMap = FRAME_FUNCTIONS[level] || {};
  const wordBounds = WORD_CYCLE[level];
  const densityBounds = DENSITY_CYCLE[level];
  const wordMin = Math.min(...wordBounds), wordMax = Math.max(...wordBounds);
  const densityMin = Math.min(...densityBounds), densityMax = Math.max(...densityBounds);

  const teachSlotOfEvent = teachEvents.map((_, i) => 1 + i * TEACH_INTERVAL);
  const assignments = {};
  function add(slot, key, status) {
    if (!assignments[slot]) assignments[slot] = [];
    if (!assignments[slot].some((a) => a.key === key)) assignments[slot].push({ key, status });
  }
  let maxSlotUsed = 1;
  teachEvents.forEach((keys, i) => {
    const t = teachSlotOfEvent[i];
    keys.forEach((key) => add(t, key, "moi"));
    const r1 = t + REVIEW_GAP;
    keys.forEach((key) => add(r1, key, "on_tap"));
    const r2 = t + REVIEW_GAP * 2;
    keys.forEach((key) => add(r2, key, "on_tap"));
    maxSlotUsed = Math.max(maxSlotUsed, r2);
  });

  const totalSlots = maxSlotUsed;

  // Rotation counter cho từng frame — chọn function TRONG danh sách hợp nghĩa của frame đó,
  // xoay vòng để cân bằng tần suất (cấm ghép ngoài bảng FRAME_FUNCTIONS).
  const fnRotationByFrame = {};
  function pickFunctionForFrame(frameKey) {
    const allowed = frameFnMap[frameKey] || [];
    if (!allowed.length) return null;
    const i = fnRotationByFrame[frameKey] || 0;
    fnRotationByFrame[frameKey] = i + 1;
    const key = allowed[i % allowed.length];
    const fn = functionsByLevel(level).find((f) => f.key === key);
    return fn || null;
  }

  // Phân bổ khung tình huống: khối 2 slot/lần xuất hiện (1 cặp đọc+thoại — đủ để không lặp
  // câu chuyện ngay, không dài tới mức ngán). Chu kỳ ĐẦU TIÊN đi đúng thứ tự khai báo trong
  // SITUATION_FRAMES (giữ nguyên ràng buộc phụ thuộc ngữ pháp/chức năng của thứ tự đó — lần
  // xuất hiện ĐẦU TIÊN của mỗi khung không đổi so với bản duyệt trước). Từ chu kỳ thứ 2 trở
  // đi, xoay (rotate) thứ tự thêm 1 vị trí mỗi chu kỳ — không lặp lại y nguyên trật tự nửa
  // đầu (kiểu "chiếu lại"), tương tự cách ôn tập ngữ pháp cách quãng. Với F khung, hiệu số vị
  // trí giữa khối cuối chu kỳ n và khối đầu chu kỳ n+1 là F-2 (mod F) — luôn khác 0 khi F>2,
  // nên không bao giờ 2 khối liền kề trùng khung (đảm bảo 1 khung tối đa 2 slot liên tiếp).
  const F = frames.length;
  function frameForBlock(blockIndex) {
    const cycle = Math.floor(blockIndex / F);
    const pos = blockIndex % F;
    return frames[(pos + cycle) % F];
  }

  const slots = [];
  for (let slot = 1; slot <= totalSlots; slot++) {
    const blockIdx = Math.floor((slot - 1) / 2);
    const frame = frameForBlock(blockIdx);
    const content_type = slot % 2 === 1 ? "reading" : "dialogue";
    const grammar = (assignments[slot] || []).map((a) => ({
      key: a.key,
      name_vi: GRAMMAR_CATALOG[a.key].name_vi,
      status: a.status,
    }));
    const fnPoint = pickFunctionForFrame(frame.key);
    // Leo dốc đơn điệu theo VỊ TRÍ trong level (đầu level = cận dưới, cuối level = cận trên),
    // thay cho kiểu lặp chu kỳ cũ.
    const progress = totalSlots > 1 ? (slot - 1) / (totalSlots - 1) : 0;
    const new_words_target = Math.round(wordMin + (wordMax - wordMin) * progress);
    const specialized_density_target_percent = Math.round(densityMin + (densityMax - densityMin) * progress);
    slots.push({
      level,
      slot,
      situation_frame_key: frame.key,
      situation_frame: frame.name_vi,
      content_type,
      grammar,
      function_key: fnPoint ? fnPoint.key : null,
      function_name_vi: fnPoint ? fnPoint.name : null,
      new_words_target,
      specialized_density_target_percent,
      vocab_stretch: VOCAB_STRETCH_NOTE,
    });
  }
  return { slots, totalSlots, teachEventCount: teachEvents.length, pointCount: allPoints.length };
}

// Tự kiểm sau khi sinh: (1) tổng khớp số đã chốt; (2) không có function ngoài bảng ghép cho
// frame của nó; (3) mật độ CN & từ mới không giảm dọc theo level (đơn điệu tăng); (4) không
// frame nào chứa danh từ chỉ địa điểm/ngành cụ thể (da lọt vào xương); (5) không khung nào
// chiếm quá 2 slot liên tiếp; (6) thứ tự lần-đầu-xuất-hiện của khung khớp đúng thứ tự khai
// báo trong SITUATION_FRAMES (không bị thuật toán phân bổ mới làm xáo trộn phụ thuộc).
function selfCheck(spine) {
  const problems = [];
  for (const level of Object.keys(spine.levels)) {
    const slots = spine.levels[level];
    const total = slots.length;
    if (FROZEN_TOTALS[level] !== undefined && total !== FROZEN_TOTALS[level]) {
      problems.push(`[${level}] tổng slot=${total} lệch số đã chốt=${FROZEN_TOTALS[level]}`);
    }
    const frameFnMap = FRAME_FUNCTIONS[level] || {};
    for (const frame of SITUATION_FRAMES[level]) {
      const lower = frame.name_vi.toLowerCase();
      const hit = BANNED_SUBSTRINGS.find((b) => lower.includes(b));
      if (hit) problems.push(`[${level}] frame "${frame.key}" ("${frame.name_vi}") chứa từ chỉ ngành/địa điểm cụ thể: "${hit}"`);
    }

    let prevWords = -Infinity, prevDensity = -Infinity;
    let streakFrame = null, streakLen = 0;
    const firstSeenOrder = [];
    const firstSeen = new Set();
    for (const s of slots) {
      if (s.function_key) {
        const allowed = frameFnMap[s.situation_frame_key] || [];
        if (!allowed.includes(s.function_key)) {
          problems.push(`[${level}] slot ${s.slot}: function "${s.function_key}" không có trong bảng ghép của frame "${s.situation_frame_key}"`);
        }
      }
      if (s.new_words_target < prevWords) problems.push(`[${level}] slot ${s.slot}: new_words_target giảm (${prevWords} -> ${s.new_words_target})`);
      if (s.specialized_density_target_percent < prevDensity) problems.push(`[${level}] slot ${s.slot}: density giảm (${prevDensity} -> ${s.specialized_density_target_percent})`);
      prevWords = s.new_words_target;
      prevDensity = s.specialized_density_target_percent;

      if (s.situation_frame_key === streakFrame) {
        streakLen++;
      } else {
        streakFrame = s.situation_frame_key;
        streakLen = 1;
      }
      if (streakLen > 2) problems.push(`[${level}] slot ${s.slot}: khung "${s.situation_frame_key}" chiếm quá 2 slot liên tiếp`);

      if (!firstSeen.has(s.situation_frame_key)) {
        firstSeen.add(s.situation_frame_key);
        firstSeenOrder.push(s.situation_frame_key);
      }
    }
    const declaredOrder = SITUATION_FRAMES[level].map((f) => f.key);
    if (JSON.stringify(firstSeenOrder) !== JSON.stringify(declaredOrder)) {
      problems.push(`[${level}] thứ tự lần-đầu-xuất-hiện của khung không khớp SITUATION_FRAMES: [${firstSeenOrder}] != [${declaredOrder}]`);
    }
  }
  return problems;
}

const spine = {
  status: "draft_pending_review",
  generated_at: new Date().toISOString(),
  note_vi:
    "Bản nháp tự soạn bằng thuật toán tất định (không gọi AI) — tổng slot/level RƠI TỰ NHIÊN theo lịch dạy+ôn (không còn số cứng 80). CHƯA đóng băng, chờ Minh duyệt.",
  levels: {},
};
const report = [];
for (const level of ["A1", "A2", "B1", "B2", "C1"]) {
  const { slots, totalSlots, teachEventCount, pointCount } = buildLevelSpine(level);
  spine.levels[level] = slots;
  const flag = totalSlots > MAX_SLOTS ? "VƯỢT " + MAX_SLOTS : totalSlots < MIN_SLOTS_EXPECTED ? "DƯỚI " + MIN_SLOTS_EXPECTED : "OK";
  report.push({ level, totalSlots, teachEventCount, pointCount, merged: pointCount - teachEventCount, flag });
}

const problems = selfCheck(spine);
if (problems.length) {
  console.error("TỰ KIỂM THẤT BẠI — " + OUTPUT_FILE + " KHÔNG được ghi:");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}

// Spine đã ĐÓNG BĂNG (duyệt 2026-07-19, commit 0c47c9d) — chặn ghi đè im lặng. Chạy lại script
// này (vd để thử quy tắc phân bổ mới) sẽ LUÔN dừng ở đây nếu file đích đang ở trạng thái
// "frozen", trừ khi set ALLOW_OVERWRITE_FROZEN_SPINE=1 — và ngay cả khi đó, file ghi ra vẫn ở
// status "draft_pending_review" (script không tự phong "frozen"), phải xin duyệt lại thủ công
// như lần đầu (xem "BÀI HỌC ĐẮT NHẤT" đầu file: quyết định đã duyệt không được để script mới
// âm thầm ghi đè).
const outputPath = path.join(__dirname, OUTPUT_FILE);
if (fs.existsSync(outputPath)) {
  const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  if (existing.status === "frozen" && process.env.ALLOW_OVERWRITE_FROZEN_SPINE !== "1") {
    console.error(
      `${OUTPUT_FILE} đã ĐÓNG BĂNG (duyệt ${existing.approved_at}, commit ${existing.approved_commit}) — KHÔNG ghi đè.`
    );
    console.error("Cần sửa thật sự thì set ALLOW_OVERWRITE_FROZEN_SPINE=1 rồi chạy lại, và xin Minh duyệt lại trước khi đóng băng bản mới.");
    process.exit(1);
  }
}

fs.writeFileSync(outputPath, JSON.stringify(spine, null, 2));

console.log("Tự kiểm OK (tổng khớp số đã chốt; đúng thứ tự phụ thuộc; đúng bảng ghép chủ đề-chức năng; mật độ đơn điệu tăng).");
console.log("Đã ghi " + OUTPUT_FILE + " — " + Object.values(spine.levels).flat().length + " slot tổng.\n");
console.log("level | tổng slot | số điểm ngữ pháp | số sự kiện dạy (sau gộp) | trạng thái");
report.forEach((r) =>
  console.log(`${r.level}    | ${r.totalSlots}        | ${r.pointCount}                | ${r.teachEventCount} (gộp ${r.merged} điểm)          | ${r.flag}`)
);
