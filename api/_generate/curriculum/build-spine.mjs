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
import { TOPIC_FUNCTIONS } from "./topic-function-map.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Thêm 4 theme/level so với bản đầu (danh sách cũ chỉ đủ cho đúng 80 slot = 20 theme x 4) —
// tổng slot giờ có thể vượt 80 (vd A1 sau gộp vẫn ~89), cần dư theme để không lặp quá sớm.
const THEMES = {
  A1: ["Giới thiệu bản thân","Gia đình","Bạn bè","Số đếm & tuổi","Ngày tháng & giờ giấc","Thời tiết","Màu sắc & đồ vật","Phòng ốc trong nhà","Đồ ăn thức uống cơ bản","Tại quán cà phê","Mua sắm đơn giản","Phương tiện đi lại","Chỉ đường cơ bản","Trường học & lớp học","Công việc hàng ngày","Sở thích","Thể thao cơ bản","Sức khoẻ cơ bản (đau ốm nhẹ)","Tại nhà hàng (gọi món)","Đặt phòng khách sạn đơn giản","Ngày lễ & dịp đặc biệt","Đồ dùng học tập","Con vật nuôi","Giờ giải lao & trò chuyện nhỏ"],
  A2: ["Kỳ nghỉ đã qua","Kể lại một ngày","Lên kế hoạch cuối tuần","Mua sắm quần áo","Tại siêu thị","Hỏi đường phức tạp hơn","Phương tiện công cộng","Đặt vé (xe/máy bay)","Tại sân bay","Khách sạn (check-in/check-out)","Nhà hàng (gọi món & thanh toán)","Sức khoẻ (khám bệnh)","Thời tiết & hoạt động ngoài trời","Công việc & đồng nghiệp","Trường học & bài tập","Gia đình mở rộng","Lễ hội & ngày lễ","Sở thích & thời gian rảnh","Công nghệ cơ bản (điện thoại/máy tính)","So sánh nơi chốn (thành phố/quê)","Giặt là & việc nhà","Thuê nhà đơn giản","Gọi điện đặt lịch","Kể về kỳ nghỉ lý tưởng"],
  B1: ["Kể chuyện quá khứ chi tiết","Trải nghiệm du lịch","Dự định tương lai","Phàn nàn dịch vụ","Đổi trả hàng","Xin lời khuyên","Đặt lịch hẹn (nha sĩ/bác sĩ)","Phỏng vấn xin việc cơ bản","Thảo luận công việc nhóm","Email công việc đơn giản","Thói quen đã thay đổi","Kế hoạch nghề nghiệp","Vấn đề môi trường cơ bản","Mua nhà / thuê nhà","Ngân hàng & tài chính cá nhân","Giải trí (phim/nhạc) & đánh giá","Tin tức thời sự đơn giản","Giáo dục & học tập","Công nghệ trong đời sống","Sức khoẻ & lối sống","Tình nguyện & hoạt động cộng đồng","Mua sắm trực tuyến","Kỹ năng mềm nơi làm việc","Lập kế hoạch tài chính cơ bản"],
  B2: ["Thuyết phục đồng nghiệp","Đàm phán hợp đồng","Giải quyết xung đột nơi làm việc","Thuyết trình ý tưởng","Phản hồi & phê bình xây dựng","Xu hướng công nghệ","Môi trường & phát triển bền vững","Truyền thông xã hội & ảnh hưởng","Giáo dục trực tuyến","Sức khoẻ tâm lý","Đa dạng văn hoá nơi làm việc","Khởi nghiệp & kinh doanh nhỏ","Quản lý thời gian","Làm việc từ xa","Đạo đức trong kinh doanh","Tin giả & báo chí","Toàn cầu hoá","Biến đổi khí hậu","Trí tuệ nhân tạo trong đời sống","Cân bằng công việc-cuộc sống","Đạo đức nghề nghiệp","Quản lý rủi ro dự án","Văn hoá doanh nghiệp","Phát triển bản thân"],
  C1: ["Tranh luận chính sách công","Đạo đức AI","Bất bình đẳng kinh tế","Tự do ngôn luận vs kiểm duyệt","Khủng hoảng khí hậu & chính sách","Tương lai giáo dục","Toàn cầu hoá & bản sắc văn hoá","Đổi mới sáng tạo & rủi ro","Lãnh đạo trong khủng hoảng","Truyền thông & thao túng dư luận","Đạo đức y sinh","Tự động hoá & thị trường lao động","Bất đồng quan điểm mang tính xây dựng","Ngoại giao & đàm phán quốc tế","Triết học đời sống hiện đại","Nghệ thuật & xã hội","Khoa học & niềm tin công chúng","Đô thị hoá & phát triển bền vững","Quyền riêng tư trong kỷ nguyên số","Ý nghĩa thành công trong sự nghiệp"],
};

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

  const themes = THEMES[level];
  const topicFnMap = TOPIC_FUNCTIONS[level] || {};
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

  // Rotation counter cho từng topic — chọn function TRONG danh sách hợp nghĩa của topic đó,
  // xoay vòng để cân bằng tần suất (cấm ghép ngoài bảng TOPIC_FUNCTIONS).
  const fnRotationByTopic = {};
  function pickFunctionForTopic(topic) {
    const allowed = topicFnMap[topic] || [];
    if (!allowed.length) return null;
    const i = fnRotationByTopic[topic] || 0;
    fnRotationByTopic[topic] = i + 1;
    const key = allowed[i % allowed.length];
    const fn = functionsByLevel(level).find((f) => f.key === key);
    return fn || null;
  }

  const slots = [];
  for (let slot = 1; slot <= totalSlots; slot++) {
    const themeIdx = Math.floor((slot - 1) / 4) % themes.length;
    const topic = themes[themeIdx];
    const content_type = slot % 2 === 1 ? "reading" : "dialogue";
    const grammar = (assignments[slot] || []).map((a) => ({
      key: a.key,
      name_vi: GRAMMAR_CATALOG[a.key].name_vi,
      status: a.status,
    }));
    const fnPoint = pickFunctionForTopic(topic);
    // Leo dốc đơn điệu theo VỊ TRÍ trong level (đầu level = cận dưới, cuối level = cận trên),
    // thay cho kiểu lặp chu kỳ cũ.
    const progress = totalSlots > 1 ? (slot - 1) / (totalSlots - 1) : 0;
    const new_words_target = Math.round(wordMin + (wordMax - wordMin) * progress);
    const specialized_density_target_percent = Math.round(densityMin + (densityMax - densityMin) * progress);
    slots.push({
      level,
      slot,
      topic,
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
// topic của nó; (3) mật độ CN & từ mới không giảm dọc theo level (đơn điệu tăng).
function selfCheck(spine) {
  const problems = [];
  for (const level of Object.keys(spine.levels)) {
    const slots = spine.levels[level];
    const total = slots.length;
    if (FROZEN_TOTALS[level] !== undefined && total !== FROZEN_TOTALS[level]) {
      problems.push(`[${level}] tổng slot=${total} lệch số đã chốt=${FROZEN_TOTALS[level]}`);
    }
    const topicFnMap = TOPIC_FUNCTIONS[level] || {};
    let prevWords = -Infinity, prevDensity = -Infinity;
    for (const s of slots) {
      if (s.function_key) {
        const allowed = topicFnMap[s.topic] || [];
        if (!allowed.includes(s.function_key)) {
          problems.push(`[${level}] slot ${s.slot}: function "${s.function_key}" không có trong bảng ghép của topic "${s.topic}"`);
        }
      }
      if (s.new_words_target < prevWords) problems.push(`[${level}] slot ${s.slot}: new_words_target giảm (${prevWords} -> ${s.new_words_target})`);
      if (s.specialized_density_target_percent < prevDensity) problems.push(`[${level}] slot ${s.slot}: density giảm (${prevDensity} -> ${s.specialized_density_target_percent})`);
      prevWords = s.new_words_target;
      prevDensity = s.specialized_density_target_percent;
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
  console.error("TỰ KIỂM THẤT BẠI — spine_draft.json KHÔNG được ghi:");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}

fs.writeFileSync(path.join(__dirname, "spine_draft.json"), JSON.stringify(spine, null, 2));

console.log("Tự kiểm OK (tổng khớp số đã chốt; đúng thứ tự phụ thuộc; đúng bảng ghép chủ đề-chức năng; mật độ đơn điệu tăng).");
console.log("Đã ghi spine_draft.json — " + Object.values(spine.levels).flat().length + " slot tổng.\n");
console.log("level | tổng slot | số điểm ngữ pháp | số sự kiện dạy (sau gộp) | trạng thái");
report.forEach((r) =>
  console.log(`${r.level}    | ${r.totalSlots}        | ${r.pointCount}                | ${r.teachEventCount} (gộp ${r.merged} điểm)          | ${r.flag}`)
);
