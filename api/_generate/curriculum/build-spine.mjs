// api/_generate/curriculum/build-spine.mjs — script SINH curriculum_spine.json bằng thuật
// toán tất định (KHÔNG gọi AI — blocker OPENAI_API_KEY bị sandbox che giá trị thật, xem ghi
// chú trong lịch sử trao đổi 2026-07-19). Không chạy lúc runtime của app — chỉ chạy TAY khi
// cần tạo lại spine (đổi catalog/theme/quy tắc phân bổ), giữ trong repo để tái tạo được,
// không phải hộp đen. Chạy: node api/_generate/curriculum/build-spine.mjs
//
// QUY TẮC PHÂN BỔ đã chốt với Minh (2026-07-19):
// - 80 slot/level, 40 đọc/40 hội thoại XEN KẼ NGHIÊM NGẶT (lẻ=đọc, chẵn=hội thoại).
// - Spiral repetition: mỗi điểm ngữ pháp dạy MỚI đúng 1 slot, ôn tập lại ~2 lần cách quãng
//   REVIEW_GAP slot sau đó (không tính idiomatic_collocations — type:"vocab", xem
//   realGrammarPointsByLevel() trong grammar-catalog.js).
// - Từ mới + mật độ chuyên ngành tăng dần theo level (xem WORD_CYCLE/DENSITY_CYCLE).
// - Chủ đề TRUNG TÍNH (20 theme/level x 4 slot/theme = 80) — CHƯA gắn lĩnh vực cụ thể, lĩnh
//   vực là lớp phủ áp dụng sau (việc riêng, chưa làm ở đợt này).
import { GRAMMAR_CATALOG, realGrammarPointsByLevel } from "./grammar-catalog.js";
import { functionsByLevel } from "./functions-catalog.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const THEMES = {
  A1: ["Giới thiệu bản thân","Gia đình","Bạn bè","Số đếm & tuổi","Ngày tháng & giờ giấc","Thời tiết","Màu sắc & đồ vật","Phòng ốc trong nhà","Đồ ăn thức uống cơ bản","Tại quán cà phê","Mua sắm đơn giản","Phương tiện đi lại","Chỉ đường cơ bản","Trường học & lớp học","Công việc hàng ngày","Sở thích","Thể thao cơ bản","Sức khoẻ cơ bản (đau ốm nhẹ)","Tại nhà hàng (gọi món)","Đặt phòng khách sạn đơn giản"],
  A2: ["Kỳ nghỉ đã qua","Kể lại một ngày","Lên kế hoạch cuối tuần","Mua sắm quần áo","Tại siêu thị","Hỏi đường phức tạp hơn","Phương tiện công cộng","Đặt vé (xe/máy bay)","Tại sân bay","Khách sạn (check-in/check-out)","Nhà hàng (gọi món & thanh toán)","Sức khoẻ (khám bệnh)","Thời tiết & hoạt động ngoài trời","Công việc & đồng nghiệp","Trường học & bài tập","Gia đình mở rộng","Lễ hội & ngày lễ","Sở thích & thời gian rảnh","Công nghệ cơ bản (điện thoại/máy tính)","So sánh nơi chốn (thành phố/quê)"],
  B1: ["Kể chuyện quá khứ chi tiết","Trải nghiệm du lịch","Dự định tương lai","Phàn nàn dịch vụ","Đổi trả hàng","Xin lời khuyên","Đặt lịch hẹn (nha sĩ/bác sĩ)","Phỏng vấn xin việc cơ bản","Thảo luận công việc nhóm","Email công việc đơn giản","Thói quen đã thay đổi","Kế hoạch nghề nghiệp","Vấn đề môi trường cơ bản","Mua nhà / thuê nhà","Ngân hàng & tài chính cá nhân","Giải trí (phim/nhạc) & đánh giá","Tin tức thời sự đơn giản","Giáo dục & học tập","Công nghệ trong đời sống","Sức khoẻ & lối sống"],
  B2: ["Thuyết phục đồng nghiệp","Đàm phán hợp đồng","Giải quyết xung đột nơi làm việc","Thuyết trình ý tưởng","Phản hồi & phê bình xây dựng","Xu hướng công nghệ","Môi trường & phát triển bền vững","Truyền thông xã hội & ảnh hưởng","Giáo dục trực tuyến","Sức khoẻ tâm lý","Đa dạng văn hoá nơi làm việc","Khởi nghiệp & kinh doanh nhỏ","Quản lý thời gian","Làm việc từ xa","Đạo đức trong kinh doanh","Tin giả & báo chí","Toàn cầu hoá","Biến đổi khí hậu","Trí tuệ nhân tạo trong đời sống","Cân bằng công việc-cuộc sống"],
  C1: ["Tranh luận chính sách công","Đạo đức AI","Bất bình đẳng kinh tế","Tự do ngôn luận vs kiểm duyệt","Khủng hoảng khí hậu & chính sách","Tương lai giáo dục","Toàn cầu hoá & bản sắc văn hoá","Đổi mới sáng tạo & rủi ro","Lãnh đạo trong khủng hoảng","Truyền thông & thao túng dư luận","Đạo đức y sinh","Tự động hoá & thị trường lao động","Bất đồng quan điểm mang tính xây dựng","Ngoại giao & đàm phán quốc tế","Triết học đời sống hiện đại","Nghệ thuật & xã hội","Khoa học & niềm tin công chúng","Đô thị hoá & phát triển bền vững","Quyền riêng tư trong kỷ nguyên số","Ý nghĩa thành công trong sự nghiệp"],
};

const WORD_CYCLE = { A1: [6, 7, 8], A2: [8, 9, 10], B1: [10, 11, 12], B2: [12, 13, 14, 15], C1: [14, 15, 16, 17, 18] };
const DENSITY_CYCLE = { A1: [5, 7, 10], A2: [10, 12, 15], B1: [15, 17, 20], B2: [20, 22, 25], C1: [25, 27, 30] };
const REVIEW_GAP = 12;
const TOTAL_SLOTS = 80;

function buildLevelSpine(level) {
  const grammarPoints = realGrammarPointsByLevel(level); // loại type:"vocab"
  const functionPoints = functionsByLevel(level);
  const themes = THEMES[level];
  const words = WORD_CYCLE[level];
  const density = DENSITY_CYCLE[level];

  const N = grammarPoints.length;
  const teachSlotOf = grammarPoints.map((g, i) => 1 + Math.round((i * 58) / Math.max(1, N - 1))); // rải 1..59
  const assignments = {};
  function add(slot, key, status) {
    if (!assignments[slot]) assignments[slot] = [];
    if (!assignments[slot].some((a) => a.key === key)) assignments[slot].push({ key, status });
  }
  grammarPoints.forEach((g, i) => {
    const t = teachSlotOf[i];
    add(t, g.key, "moi");
    const r1 = Math.min(TOTAL_SLOTS, t + REVIEW_GAP);
    if (r1 !== t) add(r1, g.key, "on_tap");
    const r2 = Math.min(TOTAL_SLOTS, t + REVIEW_GAP * 2);
    if (r2 !== t && r2 !== r1) add(r2, g.key, "on_tap");
  });

  const slots = [];
  for (let slot = 1; slot <= TOTAL_SLOTS; slot++) {
    const themeIdx = Math.floor((slot - 1) / 4) % themes.length;
    const content_type = slot % 2 === 1 ? "reading" : "dialogue";
    const grammar = (assignments[slot] || []).map((a) => ({
      key: a.key,
      name_vi: GRAMMAR_CATALOG[a.key].name_vi,
      status: a.status,
    }));
    const fn = functionPoints.length ? functionPoints[(slot - 1) % functionPoints.length] : null;
    slots.push({
      level,
      slot,
      topic: themes[themeIdx],
      content_type,
      grammar,
      function_key: fn ? fn.key : null,
      function_name_vi: fn ? fn.name : null,
      new_words_target: words[(slot - 1) % words.length],
      specialized_density_target_percent: density[(slot - 1) % density.length],
    });
  }
  return slots;
}

const spine = {
  status: "draft_pending_review",
  generated_at: new Date().toISOString(),
  note_vi: "Bản nháp tự soạn bằng thuật toán tất định (không gọi AI, xem build-spine.mjs) — CHƯA đóng băng, chờ Minh duyệt A1+A2 đầy đủ + mẫu B1-C1 trước khi dùng chính thức.",
  levels: {},
};
for (const level of ["A1", "A2", "B1", "B2", "C1"]) {
  spine.levels[level] = buildLevelSpine(level);
}

fs.writeFileSync(path.join(__dirname, "spine_draft.json"), JSON.stringify(spine, null, 2));
console.log("Đã ghi spine_draft.json — " + Object.values(spine.levels).flat().length + " slot tổng.");
