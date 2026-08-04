// app/js/views/industrySelect.js — màn "Chọn chuyên ngành" MỚI (2026-08-04, làm mới khung điều
// hướng, Phần A2/B). THAY HẲN màn ô-gõ-tự-do+6-chip cũ (views/mentorGoal.js, hiện KHÔNG có route
// nào trỏ tới, mồ côi từ lúc tắt UI Mentor AI 2026-07-23) bằng 1 danh mục CỐ ĐỊNH 2 tầng: lĩnh
// vực (tầng 1) xổ ra vị trí (tầng 2, nút tròn). mentorGoal.js GIỮ NGUYÊN, không đụng, không import
// lẫn nhau — file này độc lập, chỉ gọi lại đúng backend đã có (mentorApi.js). KHÔNG còn gọi
// checkGoalGate() nữa (bỏ 2026-08-04, xem ghi chú tại renderIndustrySelect() bên dưới) — "1 goal
// active" vẫn giữ ĐÚNG cấu trúc cũ, chỉ không hiện màn "gate" cảnh báo trước khi vào đây nữa.
//
// SỬA LẠI 2026-08-04 (Minh: "xây luồng truy cập trước" — CHỈ Kế toán là lĩnh vực THẬT, 8 vị trí
// đều phải CHỌN ĐƯỢC NGAY, không còn "Sắp ra mắt"/không còn phụ thuộc industry_skins đã có sẵn
// hay chưa): mỗi vị trí Kế toán có occupation_profile SOẠN SẴN (KHÔNG gọi AI để suy luận —
// đúng dữ liệu đã biết về nghiệp vụ từng vị trí, viết thẳng ở đây) — chọn xong gọi THẲNG
// createGoal(profile, ...), giống hệt cơ chế "Giao tiếp" (autoCreateGoal) nhưng dùng profile
// riêng. Tầng 1 (400 chủ đề/vị trí) vẫn sinh LƯỜI theo chunk khi có người thật bấm học (cơ chế
// ensureSkinChunk có sẵn trong mentor.js, KHÔNG cần chạy trước hàng loạt nữa — tự nhiên đúng
// "Tầng 2 sinh khi cần" mà không cần thêm bước "kích hoạt Tầng 1" riêng như bản trước).
// checkIndustrySkinStatus() không còn dùng ở đây nữa (action backend vẫn giữ nguyên, không xoá).
//
// Các lĩnh vực KHÁC (Minh: "ghi ra và cho toggle, các vị trí cụ thể nhưng để sắp ra mắt") — CHỈ
// để tham khảo/đúng khung ảnh mẫu, KHÔNG chọn được, mọi vị trí con đều "Sắp ra mắt" vĩnh viễn.
import { navigate } from "../router.js";
import { autoCreateGoal, createGoal } from "../mentorApi.js";
import { escapeHtml } from "../utils.js";
import { icon } from "../icons.js";
import { showToast } from "../toast.js";

function accountingProfile(mergedOccupation, scope, interlocutors, coreTerms) {
  return {
    is_general: false,
    // "is_fixed_catalog" (2026-08-04) — khớp đúng cờ mới thêm ở insertLearningGoal() trong
    // api/_generate/mentor.js: miễn giới hạn "5 lĩnh vực trọn đời" (giới hạn đó sinh ra để chặn
    // đường TỰ DO gõ chữ, không áp dụng cho danh mục CỐ ĐỊNH 8 vị trí ở đây).
    is_fixed_catalog: true,
    merged_occupation: mergedOccupation,
    primary_communication_scope: scope,
    interlocutors,
    core_terms: coreTerms,
    confidence: { merged_occupation: "cao", interlocutors: "cao", core_terms: "cao" },
  };
}

// Thực tập sinh kế toán ĐẦU danh sách (yêu cầu rõ: vị trí đáng ưu tiên, chủ đề phong phú từ cơ
// bản tới nghiệp vụ) — thứ tự các vị trí còn lại theo đúng danh sách đã chốt. "profile" soạn
// sẵn (không gọi AI) — xem ghi chú đầu file.
const ACCOUNTING_POSITIONS = [
  {
    key: "thuc_tap_sinh_ke_toan",
    label: "Thực tập sinh kế toán",
    profile: accountingProfile(
      "Thực tập sinh kế toán",
      "Học việc và hỗ trợ các nghiệp vụ kế toán cơ bản trong doanh nghiệp",
      [
        { role: "Kế toán trưởng / người hướng dẫn", register: "trang trọng, xin phép, cầu thị" },
        { role: "Đồng nghiệp phòng kế toán", register: "thân thiện, hỏi-đáp" },
      ],
      ["invoice", "receipt", "ledger", "journal entry", "accounts payable", "accounts receivable", "balance sheet", "reconciliation", "petty cash", "filing"]
    ),
  },
  {
    key: "ke_toan_tong_hop",
    label: "Kế toán tổng hợp",
    profile: accountingProfile(
      "Kế toán tổng hợp",
      "Tổng hợp số liệu, lập báo cáo tài chính và phối hợp giữa các bộ phận kế toán",
      [
        { role: "Ban giám đốc", register: "trang trọng, báo cáo" },
        { role: "Kiểm toán viên", register: "chính xác, chuyên môn" },
      ],
      ["general ledger", "trial balance", "financial statement", "income statement", "cash flow statement", "accrual", "depreciation", "closing entry", "chart of accounts", "fiscal year"]
    ),
  },
  {
    key: "ke_toan_truong",
    label: "Kế toán trưởng",
    profile: accountingProfile(
      "Kế toán trưởng",
      "Quản lý toàn bộ hoạt động kế toán, tư vấn tài chính cho ban lãnh đạo",
      [
        { role: "Giám đốc điều hành", register: "trang trọng, tư vấn chiến lược" },
        { role: "Cơ quan thuế / kiểm toán", register: "chính thức, tuân thủ" },
      ],
      ["audit", "compliance", "budget forecast", "internal control", "tax filing", "financial planning", "cost accounting", "variance analysis", "regulatory reporting", "cash management"]
    ),
  },
  {
    key: "ke_toan_kho",
    label: "Kế toán kho",
    profile: accountingProfile(
      "Kế toán kho",
      "Theo dõi nhập-xuất-tồn kho, đối chiếu số liệu hàng hoá",
      [
        { role: "Thủ kho", register: "trực tiếp, thực tế" },
        { role: "Bộ phận mua hàng", register: "phối hợp, xác nhận số liệu" },
      ],
      ["inventory count", "stock take", "goods received note", "stock ledger", "warehouse receipt", "FIFO", "inventory valuation", "stock discrepancy", "purchase order", "delivery note"]
    ),
  },
  {
    key: "ke_toan_ban_hang",
    label: "Kế toán bán hàng",
    profile: accountingProfile(
      "Kế toán bán hàng",
      "Ghi nhận doanh thu, theo dõi hoá đơn bán hàng và công nợ khách hàng",
      [
        { role: "Nhân viên kinh doanh", register: "phối hợp, xác nhận đơn hàng" },
        { role: "Khách hàng", register: "lịch sự, giải thích hoá đơn" },
      ],
      ["sales invoice", "revenue recognition", "credit note", "customer ledger", "sales order", "discount", "VAT invoice", "payment term", "sales report", "returned goods"]
    ),
  },
  {
    key: "ke_toan_cong_no",
    label: "Kế toán công nợ",
    profile: accountingProfile(
      "Kế toán công nợ",
      "Theo dõi công nợ phải thu, phải trả và nhắc nợ khách hàng/nhà cung cấp",
      [
        { role: "Nhà cung cấp", register: "trang trọng, thương lượng" },
        { role: "Khách hàng nợ quá hạn", register: "lịch sự nhưng kiên quyết" },
      ],
      ["accounts receivable", "accounts payable", "aging report", "debt collection", "payment reminder", "outstanding balance", "credit terms", "write-off", "reconciliation statement", "overdue invoice"]
    ),
  },
  {
    key: "ke_toan_thue",
    label: "Kế toán thuế",
    profile: accountingProfile(
      "Kế toán thuế",
      "Kê khai thuế, đảm bảo tuân thủ quy định thuế của doanh nghiệp",
      [
        { role: "Cơ quan thuế", register: "chính thức, tuân thủ" },
        { role: "Kế toán trưởng", register: "báo cáo, tư vấn" },
      ],
      ["VAT declaration", "corporate income tax", "tax invoice", "tax return", "withholding tax", "tax audit", "tax deduction", "e-invoice", "tax code", "penalty for late filing"]
    ),
  },
  {
    key: "ke_toan_thanh_toan",
    label: "Kế toán thanh toán",
    profile: accountingProfile(
      "Kế toán thanh toán",
      "Xử lý thanh toán, quản lý dòng tiền và giao dịch ngân hàng",
      [
        { role: "Ngân hàng", register: "chính thức, giao dịch" },
        { role: "Nhà cung cấp", register: "xác nhận thanh toán" },
      ],
      ["bank transfer", "payment voucher", "cash flow", "bank reconciliation", "wire transfer", "payment approval", "disbursement", "remittance", "standing order", "bank statement"]
    ),
  },
];

// Lĩnh vực KHÁC — chỉ trưng bày đúng khung ảnh mẫu, KHÔNG chọn được (Minh: "ghi ra và cho
// toggle, các vị trí cụ thể nhưng để sắp ra mắt"). "positions" ở đây CHỈ LÀ TÊN, không có
// profile — click luôn báo "Sắp ra mắt".
const OTHER_INDUSTRIES = [
  { key: "it", label: "Information Technology", icon: "monitor", chip: "blue", positions: ["Lập trình viên", "Kỹ sư hệ thống"] },
  { key: "business", label: "Business", icon: "briefcase", chip: "green", positions: ["Chuyên viên kinh doanh", "Quản lý dự án"] },
  { key: "nursing", label: "Nursing", icon: "flask", chip: "orange", positions: ["Điều dưỡng viên", "Trợ lý y tế"] },
  { key: "tourism", label: "Tourism", icon: "compass", chip: "purple", positions: ["Hướng dẫn viên du lịch", "Lễ tân khách sạn"] },
  { key: "logistics", label: "Logistics", icon: "library", chip: "blue", positions: ["Nhân viên kho vận", "Điều phối vận tải"] },
  { key: "engineering", label: "Engineering", icon: "settings", chip: "green", positions: ["Kỹ sư cơ khí", "Kỹ sư xây dựng"] },
  { key: "finance", label: "Finance", icon: "hash", chip: "orange", positions: ["Chuyên viên tài chính", "Giao dịch viên ngân hàng"] },
  { key: "marketing", label: "Marketing", icon: "star", chip: "purple", positions: ["Chuyên viên marketing", "Chuyên viên truyền thông"] },
];

const INDUSTRIES = [
  { key: "general", label: "Tiếng Anh Giao Tiếp", icon: "message-circle", chip: "blue", positions: null },
  { key: "accounting", label: "Tiếng Anh Kế toán", icon: "dollar-sign", chip: "orange", positions: ACCOUNTING_POSITIONS, real: true },
  ...OTHER_INDUSTRIES.map((ind) => ({ ...ind, positions: ind.positions.map((label) => ({ label })) })),
];

export function renderIndustrySelect(mount) {
  const state = {
    expandedIndustry: null,
    submitting: false,
  };

  render();

  // "gate" (mentor_check_goal_gate) BỎ HẲN khỏi màn này (2026-08-04, Minh: "đây là thiết kế
  // luồng app MỚI" — màn "gate" cũ hiện lại câu nhắc dựa trên learning_goals CŨ, tài khoản test
  // đã tích luỹ rất nhiều từ các đợt test khác không liên quan, gây cảm giác "sao có thông tin
  // cũ"). "1 goal active" VẪN được giữ đúng cấu trúc — insertLearningGoal() (mentor.js) LUÔN tự
  // archive goal active cũ trước khi tạo/chọn goal mới, KHÔNG phụ thuộc màn hình này có hỏi lại
  // hay không — tự bấm vào 1 vị trí ở màn CHỌN CHUYÊN NGÀNH đã LÀ hành động xác nhận rõ ràng
  // rồi, không cần thêm 1 lớp xác nhận phụ nữa.
  function render() {
    return renderSelect();
  }

  function renderShell(innerHtml) {
    mount.innerHTML = `
      <div class="screen industry-select-screen">
        <h1 class="industry-select-title">Chọn chuyên ngành để bắt đầu</h1>
        <p class="industry-select-subtitle">Nội dung được thiết kế riêng cho công việc của bạn</p>
        ${innerHtml}
      </div>
    `;
  }

  function renderSelect() {
    renderShell(`
      <div class="industry-list">
        ${INDUSTRIES.map((ind) => industryCardBlockHtml(ind)).join("")}
      </div>
    `);
    wireSelect();
  }

  function industryCardBlockHtml(ind) {
    const expanded = state.expandedIndustry === ind.key;
    return `
      <div class="industry-select-card ${expanded ? "expanded" : ""}" data-industry="${ind.key}">
        <button type="button" class="industry-select-header" data-industry-toggle="${ind.key}" ${state.submitting ? "disabled" : ""}>
          <span class="industry-select-icon chip-${ind.chip}">${icon(ind.icon, { size: 22 })}</span>
          <span class="industry-select-label">${escapeHtml(ind.label)}</span>
          ${ind.positions ? `<span class="industry-select-chevron">${icon(expanded ? "chevron-down" : "chevron-right", { size: 18 })}</span>` : ""}
        </button>
        ${ind.positions && expanded ? `<div class="industry-position-list" id="position-list-${ind.key}">${positionListHtml(ind)}</div>` : ""}
      </div>
    `;
  }

  function positionListHtml(ind) {
    return ind.positions
      .map((p, i) => {
        const available = !!ind.real;
        return `
          <button type="button" class="industry-position-row ${available ? "" : "is-coming-soon"}" data-industry-key="${ind.key}" data-position-index="${i}" data-available="${available}">
            <span class="industry-position-radio"></span>
            <span class="industry-position-label">${escapeHtml(p.label)}</span>
            ${available ? "" : `<span class="industry-position-badge">Sắp ra mắt</span>`}
          </button>
        `;
      })
      .join("");
  }

  function wireSelect() {
    mount.querySelectorAll("[data-industry-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.industryToggle;
        const ind = INDUSTRIES.find((i) => i.key === key);
        if (!ind.positions) return selectGeneral();
        state.expandedIndustry = state.expandedIndustry === key ? null : key;
        render();
      });
    });

    mount.querySelectorAll("[data-position-index]").forEach((row) => {
      row.addEventListener("click", () => {
        if (row.dataset.available !== "true") {
          showToast("Lĩnh vực này sắp ra mắt, chưa có nội dung để học.");
          return;
        }
        const ind = INDUSTRIES.find((i) => i.key === row.dataset.industryKey);
        const position = ind.positions[Number(row.dataset.positionIndex)];
        selectPosition(position.profile, position.label);
      });
    });
  }

  async function selectGeneral() {
    if (state.submitting) return;
    state.submitting = true;
    render();
    const res = await autoCreateGoal();
    if (!res.ok) {
      state.submitting = false;
      render();
      showToast(res.error || "Không tạo được lộ trình, thử lại nhé.");
      return;
    }
    navigate("/home");
  }

  // Vị trí Kế toán (profile soạn sẵn, KHÔNG gọi AI) — cùng cơ chế khoá "1 goal active" như
  // selectGeneral(), chỉ khác nguồn occupation_profile (createGoal() vốn đã nhận thẳng profile
  // làm tham số, không tự suy luận gì — xem mentor_create_goal trong api/_generate/mentor.js).
  async function selectPosition(profile, rawKeywords) {
    if (state.submitting) return;
    state.submitting = true;
    render();
    const res = await createGoal(profile, rawKeywords, null);
    if (!res.ok) {
      state.submitting = false;
      render();
      showToast(res.error || "Không tạo được lộ trình, thử lại nhé.");
      return;
    }
    navigate("/home");
  }
}
