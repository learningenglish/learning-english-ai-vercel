// app/js/views/industrySelect.js — màn "Chọn chuyên ngành" MỚI (2026-08-04, làm mới khung điều
// hướng, Phần A2/B). THAY HẲN màn ô-gõ-tự-do+6-chip cũ (views/mentorGoal.js, hiện KHÔNG có route
// nào trỏ tới, mồ côi từ lúc tắt UI Mentor AI 2026-07-23). mentorGoal.js GIỮ NGUYÊN, không đụng,
// không import lẫn nhau — file này độc lập, chỉ gọi lại đúng backend đã có (goalApi.js). KHÔNG
// còn gọi checkGoalGate() nữa (bỏ 2026-08-04) — "1 goal active" vẫn giữ ĐÚNG cấu trúc cũ, chỉ
// không hiện màn "gate" cảnh báo trước khi vào đây nữa.
//
// BỎ TẦNG "VỊ TRÍ CÔNG VIỆC" (2026-08-05, Minh: "bỏ các lựa chọn vị trí công việc, chỉ dùng
// chuyên ngành. Cụ thể: Kế toán, Điều dưỡng,... không còn các vị trí công việc nữa") — DANH SÁCH
// PHẲNG 1 TẦNG, mỗi chuyên ngành bấm chọn thẳng, không còn accordion xổ ra vị trí con (khác hẳn
// bản trước có 8 vị trí Kế toán riêng biệt). "Kế toán" giờ là 1 occupation_profile DUY NHẤT gộp
// chung phạm vi nghiệp vụ của cả 8 vị trí cũ (soạn tay, KHÔNG gọi AI để suy luận) — chọn xong gọi
// THẲNG createGoal(profile, ...), giống hệt cơ chế "Giao tiếp" (xem GENERAL_PROFILE bên dưới,
// SỬA 2026-08-07 sau khi phát hiện bug thật dùng nhầm autoCreateGoal()). Tầng 2 (400 chủ đề) vẫn
// sinh LƯỜI theo chunk khi có người thật bấm học (ensureSkinChunk — ĐÃ ARCHIVE cùng mentor.js
// 2026-08-11, xem _archive/mentor-ai-personal-flow/).
//
// Các chuyên ngành KHÁC (Minh: "ghi ra và cho toggle... để sắp ra mắt") — CHỈ để tham khảo/đúng
// khung ảnh mẫu, KHÔNG chọn được, bấm vào báo "Sắp ra mắt" vĩnh viễn.
import { navigate } from "../../router.js";
import { createGoal } from "../../goalApi.js";
import { escapeHtml } from "../../utils.js";
import { icon } from "../../icons.js";
import { showToast } from "../../toast.js";
import { t, registerTranslations } from "../../i18n.js";

registerTranslations({
  "Chọn chuyên ngành<br />để bắt đầu": "Choose an industry<br />to get started",
  "HỌC TIẾNG ANH CÙNG MOSAIC STUDY": "LEARN ENGLISH WITH MOSAIC STUDY",
  "Nội dung được thiết kế riêng<br />cho công việc của bạn": "Content designed specifically<br />for your job",
  "Sắp ra mắt": "Coming soon",
  "Chuyên ngành này sắp ra mắt, chưa có nội dung để học.": "This industry is coming soon, no content to learn yet.",
  "Không tạo được lộ trình, thử lại nhé.": "Couldn't create your learning path, please try again.",
  "Giao Tiếp Tổng Quát": "General English",
  "Anh văn chuyên ngành": "English for",
  "Kế toán": "Accounting",
  "Làm Đẹp": "Beauty",
  // Nhãn OTHER_INDUSTRIES (2026-08-12, dịch từ tiếng Anh sang tiếng Việt tự nhiên — Minh: "giao
  // diện tiếng Việt không lẫn tiếng Anh trừ từ mượn thông dụng").
  "Công nghệ thông tin": "Information Technology",
  "Kinh doanh": "Business",
  "Điều dưỡng": "Nursing",
  "Du lịch": "Tourism",
  "Kỹ thuật": "Engineering",
  "Tài chính": "Finance",
  // "Logistics"/"Marketing" giữ nguyên (từ mượn thông dụng trong tiếng Việt, giống "email").
  "Logistics": "Logistics",
  "Marketing": "Marketing",
});

// "subDomains" (2026-08-19, TÙY CHỌN — chỉ ngành có nhiều mảng dịch vụ con rõ rệt mới cần, vd
// Làm Đẹp: mỹ phẩm/spa/trang điểm/nail/tóc) — đọc bởi skin.js để BẮT BUỘC + kiểm tra bằng code
// việc chia đều chủ đề qua các mảng con, xem validateSubDomainDiversity() trong skin.js. Ngành
// không có mảng con (vd Kế toán) truyền mảng rỗng/bỏ qua tham số, giữ nguyên hành vi cũ.
function occupationProfile(mergedOccupation, scope, interlocutors, coreTerms, subDomains) {
  return {
    is_general: false,
    // "is_fixed_catalog" (2026-08-04) — khớp đúng cờ mới thêm ở insertLearningGoal() trong
    // api/_generate/goal.js: miễn giới hạn "5 lĩnh vực trọn đời" (giới hạn đó sinh ra để chặn
    // đường TỰ DO gõ chữ, không áp dụng cho danh mục CỐ ĐỊNH ở đây).
    is_fixed_catalog: true,
    merged_occupation: mergedOccupation,
    primary_communication_scope: scope,
    interlocutors,
    core_terms: coreTerms,
    ...(subDomains?.length ? { sub_domains: subDomains } : {}),
    confidence: { merged_occupation: "cao", interlocutors: "cao", core_terms: "cao" },
  };
}

// "Kế toán" (2026-08-05, GỘP 8 vị trí cũ thành 1 profile duy nhất — xem ghi chú đầu file) —
// phạm vi + thuật ngữ chọn lọc trải rộng đủ các mảng nghiệp vụ phổ biến (sổ sách, công nợ, kho,
// bán hàng, thuế, ngân hàng) thay vì chỉ 1 vị trí hẹp, để nội dung sinh ra (Tầng 2) vẫn phong
// phú như trước dù không còn chọn riêng từng vị trí nữa.
const ACCOUNTING_PROFILE = occupationProfile(
  "Kế toán",
  "Thực hiện các nghiệp vụ kế toán trong doanh nghiệp: ghi sổ, đối chiếu công nợ, quản lý kho/bán hàng, lập báo cáo tài chính, kê khai thuế và giao dịch thanh toán ngân hàng",
  [
    { role: "Kế toán trưởng / Ban giám đốc", register: "trang trọng, báo cáo" },
    { role: "Đồng nghiệp phòng kế toán", register: "thân thiện, hỏi-đáp, phối hợp" },
    { role: "Cơ quan thuế / Kiểm toán viên", register: "chính thức, tuân thủ" },
    { role: "Khách hàng và nhà cung cấp", register: "lịch sự, xác nhận số liệu, thương lượng" },
    { role: "Ngân hàng", register: "chính thức, giao dịch" },
  ],
  [
    "invoice",
    "general ledger",
    "accounts payable",
    "accounts receivable",
    "financial statement",
    "bank reconciliation",
    "VAT declaration",
    "inventory valuation",
    "sales invoice",
    "audit",
    "cash flow",
    "payment voucher",
  ]
);

// "Làm Đẹp" (2026-08-19, thứ tự triển khai chốt: Kế toán -> Làm Đẹp -> Điều Dưỡng -> Giao Tiếp
// Tổng Quát — xem project_industry_rollout_roadmap trong bộ nhớ) — GỘP 5 mảng dịch vụ phổ biến
// (mỹ phẩm, spa, trang điểm, làm móng, tóc) thành 1 profile duy nhất, giống cách "Kế toán" gộp 8
// vị trí cũ — core_terms CỐ Ý ưu tiên DANH TỪ VẬT DỤNG/SẢN PHẨM CỤ THỂ của từng mảng (Minh: "xây
// dựng bộ giáo trình có từ chuyên ngành về các vật dụng, sản phẩm của ngành đó thật hay"), không
// dùng từ dịch vụ chung chung ("beauty service", "treatment").
const BEAUTY_PROFILE = occupationProfile(
  "Làm Đẹp",
  "Tư vấn và phục vụ khách hàng trong ngành làm đẹp: mỹ phẩm, chăm sóc da/spa, trang điểm, làm móng và chăm sóc tóc — giới thiệu sản phẩm, thực hiện quy trình dịch vụ, xử lý yêu cầu và phản hồi của khách",
  [
    { role: "Khách hàng", register: "lịch sự, tư vấn, xác nhận nhu cầu" },
    { role: "Khách hàng nước ngoài", register: "lịch sự, giải thích rõ ràng, chậm rãi" },
    { role: "Đồng nghiệp/kỹ thuật viên khác", register: "thân thiện, phối hợp ca làm" },
    { role: "Quản lý spa/salon", register: "trang trọng, báo cáo, xin phép" },
    { role: "Nhà cung cấp mỹ phẩm/dụng cụ", register: "trao đổi đặt hàng, xác nhận số lượng" },
  ],
  [
    "moisturizer",
    "serum",
    "sunscreen",
    "exfoliating scrub",
    "essential oil",
    "massage therapy",
    "facial treatment",
    "foundation",
    "eyeliner",
    "makeup brush",
    "acrylic nails",
    "nail polish",
    "cuticle care",
    "hair dye",
    "flat iron",
    "conditioner",
    "hair treatment",
    "skin type",
  ],
  ["Mỹ phẩm", "Spa", "Trang điểm", "Nail", "Tóc"]
);

// Chuyên ngành KHÁC — chỉ trưng bày đúng khung ảnh mẫu, KHÔNG chọn được (Minh: "ghi ra và cho
// toggle... để sắp ra mắt").
const OTHER_INDUSTRIES = [
  { key: "it", label: "Công nghệ thông tin", icon: "monitor", chip: "blue" },
  { key: "business", label: "Kinh doanh", icon: "briefcase", chip: "green" },
  { key: "nursing", label: "Điều dưỡng", icon: "flask", chip: "orange" },
  { key: "tourism", label: "Du lịch", icon: "compass", chip: "purple" },
  { key: "logistics", label: "Logistics", icon: "library", chip: "blue" },
  { key: "engineering", label: "Kỹ thuật", icon: "settings", chip: "green" },
  { key: "finance", label: "Tài chính", icon: "hash", chip: "orange" },
  { key: "marketing", label: "Marketing", icon: "star", chip: "purple" },
];

// "GENERAL_PROFILE" (2026-08-07, sửa BUG THẬT — Minh: "Tôi chọn chuyên ngành Tiếng Anh Giao
// Tiếp: nhưng hiển thị luồng Anh văn chuyên ngành Kế toán") — selectGeneral() TRƯỚC ĐÂY gọi
// autoCreateGoal() (action mentor_auto_goal, ĐÃ ARCHIVE 2026-08-11 cùng mentor.js — xem
// _archive/mentor-ai-personal-flow/), nhưng hàm đó KHÔNG hề tạo goal "Giao tiếp" — nó
// LẤY LẠI occupation_profile của learning_goals GẦN NHẤT (bất kể active hay archived) làm mẫu,
// đúng ý nghĩa gốc "Bạn cứ để tôi tự chọn giúp" của luồng nhập tự do CŨ (mentorGoal.js, đã
// archive) khi người dùng bỏ trống ô nhập — nếu lần gần nhất là "Kế toán", bấm "Giao Tiếp" ở
// MÀN NÀY sẽ vô tình TẠO LẠI ĐÚNG GOAL KẾ TOÁN, không phải Giao Tiếp. Sửa: dựng thẳng profile
// "chung" tại đây (GENERAL_PROFILE ngay dưới — độc lập, KHÔNG còn phụ thuộc hằng số nào ở
// api/_generate/goal.js) rồi gọi
// createGoal() y hệt selectPosition() bên dưới — ĐÚNG yêu cầu "mỗi chuyên ngành là 1 luồng độc
// lập, tạo mới luồng cho mỗi chuyên ngành", không tái sử dụng/suy luận từ goal cũ nào cả.
const GENERAL_PROFILE = {
  is_general: true,
  is_fixed_catalog: true,
  merged_occupation: null,
  primary_communication_scope: "giao tiếp tiếng Anh trong nhiều tình huống hàng ngày",
  interlocutors: [],
  core_terms: [],
  confidence: { merged_occupation: "thấp", interlocutors: "thấp", core_terms: "thấp" },
};

const INDUSTRIES = [
  { key: "general", label: "Giao Tiếp Tổng Quát", icon: "message-circle", chip: "blue", real: true },
  { key: "accounting", label: "Kế toán", icon: "dollar-sign", chip: "orange", real: true, profile: ACCOUNTING_PROFILE },
  { key: "beauty", label: "Làm Đẹp", icon: "sparkles", chip: "purple", real: true, profile: BEAUTY_PROFILE },
  ...OTHER_INDUSTRIES.map((ind) => ({ ...ind, real: false })),
];

export function renderIndustrySelect(mount) {
  const state = {
    submitting: false,
  };

  render();

  // "gate" (mentor_check_goal_gate, ĐÃ ARCHIVE 2026-08-11 cùng mentor.js) BỎ HẲN khỏi màn này
  // (2026-08-04, Minh: "đây là thiết kế luồng app MỚI") — "1 goal active" VẪN được giữ đúng cấu
  // trúc — insertLearningGoal() (goal.js) LUÔN tự archive goal active cũ trước khi tạo/chọn goal
  // mới, KHÔNG phụ thuộc màn
  // hình này có hỏi lại hay không — tự bấm vào 1 chuyên ngành ở đây đã LÀ hành động xác nhận rõ
  // ràng rồi, không cần thêm 1 lớp xác nhận phụ nữa.
  function render() {
    mount.innerHTML = `
      <div class="screen industry-select-screen">
        <h1 class="industry-select-title">${t("Chọn chuyên ngành<br />để bắt đầu")}</h1>
        <p class="industry-select-tagline">${t("HỌC TIẾNG ANH CÙNG MOSAIC STUDY")}</p>
        <p class="industry-select-subtitle">${t("Nội dung được thiết kế riêng<br />cho công việc của bạn")}</p>
        <div class="industry-list">
          ${INDUSTRIES.map((ind) => industryRowHtml(ind)).join("")}
        </div>
      </div>
    `;
    wire();
  }

  // Danh sách PHẲNG 1 tầng (2026-08-05, bỏ accordion vị trí con) — mỗi hàng bấm chọn thẳng,
  // "Sắp ra mắt" hiện ngay trên hàng thay vì phải xổ ra mới thấy.
  function industryRowHtml(ind) {
    return `
      <button type="button" class="industry-select-row ${ind.real ? "" : "is-coming-soon"}" data-industry="${ind.key}" ${state.submitting ? "disabled" : ""}>
        <span class="industry-select-icon chip-${ind.chip}">${icon(ind.icon, { size: 22 })}</span>
        <span class="industry-select-label">${escapeHtml(t(ind.label))}</span>
        ${ind.real ? "" : `<span class="industry-position-badge">${t("Sắp ra mắt")}</span>`}
      </button>
    `;
  }

  function wire() {
    mount.querySelectorAll("[data-industry]").forEach((row) => {
      row.addEventListener("click", () => {
        const ind = INDUSTRIES.find((i) => i.key === row.dataset.industry);
        if (!ind.real) {
          showToast(t("Chuyên ngành này sắp ra mắt, chưa có nội dung để học."));
          return;
        }
        if (ind.key === "general") return selectGeneral();
        selectPosition(ind.profile, ind.label);
      });
    });
  }

  async function selectGeneral() {
    if (state.submitting) return;
    state.submitting = true;
    render();
    const res = await createGoal(GENERAL_PROFILE, "Giao Tiếp Tổng Quát", null);
    if (!res.ok) {
      state.submitting = false;
      render();
      showToast(res.error || t("Không tạo được lộ trình, thử lại nhé."));
      return;
    }
    navigate("/home");
  }

  // Chuyên ngành Kế toán (profile soạn sẵn, KHÔNG gọi AI) — cùng cơ chế khoá "1 goal active" như
  // selectGeneral(), chỉ khác nguồn occupation_profile (createGoal() vốn đã nhận thẳng profile
  // làm tham số, không tự suy luận gì — xem create_goal trong api/_generate/goal.js).
  async function selectPosition(profile, rawKeywords) {
    if (state.submitting) return;
    state.submitting = true;
    render();
    const res = await createGoal(profile, rawKeywords, null);
    if (!res.ok) {
      state.submitting = false;
      render();
      showToast(res.error || t("Không tạo được lộ trình, thử lại nhé."));
      return;
    }
    navigate("/home");
  }
}
