// app/js/views/industrySelect.js — màn "Chọn chuyên ngành" MỚI (2026-08-04, làm mới khung điều
// hướng, Phần A2/B). THAY HẲN màn ô-gõ-tự-do+6-chip cũ (views/mentorGoal.js, hiện KHÔNG có route
// nào trỏ tới, mồ côi từ lúc tắt UI Mentor AI 2026-07-23) bằng 1 danh mục CỐ ĐỊNH 2 tầng: lĩnh
// vực (tầng 1) xổ ra vị trí (tầng 2, nút tròn). mentorGoal.js GIỮ NGUYÊN, không đụng, không import
// lẫn nhau — file này độc lập, chỉ gọi lại đúng backend đã có (mentorApi.js), KHÔNG viết logic
// mới nào ở tầng "1 goal active"/gate — checkGoalGate() y hệt bước 0 cũ.
//
// "Tiếng Anh Giao Tiếp" = skin_general có sẵn — bấm chọn gọi THẲNG autoCreateGoal() (mentor_
// auto_goal, mentorApi.js): KHÔNG lịch sử -> GENERAL_OCCUPATION_PROFILE, CÓ lịch sử -> lặp lại
// occupation_profile gần nhất — cả 2 nhánh đều KHÔNG gọi AI (đúng yêu cầu "0 lượt gọi AI" cho cả
// đợt việc này). KHÔNG tự sinh bài học đầu tiên ở đây (generateNextLessonForGoal tốn 1 lượt AI
// thật) — chỉ khoá goal rồi vào thẳng Home, bài đầu tiên sinh khi người dùng THẬT SỰ bấm học.
//
// 8 vị trí Kế toán (Phần B2): TẤT CẢ đang "Sắp ra mắt" (industry_skins chưa có occupation_key
// nào trong 8 cái — Tầng 1 chưa được kích hoạt, đó là lệnh riêng có xác nhận chi phí, KHÔNG
// chạy ở đây) — occupation_key dùng slug ascii cố định (không phụ thuộc chữ AI suy luận ra) để
// sau này kích hoạt Tầng 1 ghi thẳng đúng key này vào industry_skins, khớp 100% với danh mục.
import { navigate } from "../router.js";
import { checkGoalGate, autoCreateGoal, checkIndustrySkinStatus } from "../mentorApi.js";
import { escapeHtml } from "../utils.js";
import { icon } from "../icons.js";
import { showToast } from "../toast.js";

// Thực tập sinh kế toán ĐẦU danh sách (yêu cầu rõ: vị trí đáng ưu tiên, chủ đề phong phú từ cơ
// bản tới nghiệp vụ) — thứ tự các vị trí còn lại theo đúng danh sách đã chốt.
const ACCOUNTING_POSITIONS = [
  { key: "thuc_tap_sinh_ke_toan", label: "Thực tập sinh kế toán" },
  { key: "ke_toan_tong_hop", label: "Kế toán tổng hợp" },
  { key: "ke_toan_truong", label: "Kế toán trưởng" },
  { key: "ke_toan_kho", label: "Kế toán kho" },
  { key: "ke_toan_ban_hang", label: "Kế toán bán hàng" },
  { key: "ke_toan_cong_no", label: "Kế toán công nợ" },
  { key: "ke_toan_thue", label: "Kế toán thuế" },
  { key: "ke_toan_thanh_toan", label: "Kế toán thanh toán" },
];

const INDUSTRIES = [
  { key: "general", label: "Tiếng Anh Giao Tiếp", icon: "message-circle", positions: null },
  { key: "accounting", label: "Tiếng Anh Kế toán", icon: "dollar-sign", positions: ACCOUNTING_POSITIONS },
];

export function renderIndustrySelect(mount) {
  const state = {
    step: "loading", // loading | gate | select
    gateInfo: null,
    expandedIndustry: null, // "accounting" khi đang xổ ra
    skinStatus: null, // { [occupation_key]: { exists, level_status } } — tải lười khi xổ Kế toán lần đầu
    submitting: false,
  };

  checkGoalGate()
    .then((res) => {
      if (res.ok && res.data.shouldGate) {
        state.gateInfo = res.data;
        state.step = "gate";
      } else {
        state.step = "select";
      }
      render();
    })
    .catch(() => {
      state.step = "select"; // lỗi mạng lúc kiểm tra chặn -> không chặn oan, cho chọn thẳng
      render();
    });

  render();

  function render() {
    if (state.step === "loading") return renderShell(`<p class="muted">Đang kiểm tra...</p>`);
    if (state.step === "gate") return renderGate();
    return renderSelect();
  }

  function renderShell(innerHtml) {
    mount.innerHTML = `
      <div class="screen screen-center">
        <h1 class="screen-title">Chọn chuyên ngành để bắt đầu</h1>
        <p class="muted">Nội dung được thiết kế riêng cho công việc của bạn</p>
        ${innerHtml}
      </div>
    `;
  }

  function renderGate() {
    renderShell(`
      <div class="card">
        <p>${escapeHtml(state.gateInfo.message)}</p>
        <div class="director-card-actions">
          <button type="button" class="btn btn-primary btn-block" id="gate-keep-old">Học tiếp cái cũ</button>
          <button type="button" class="btn btn-ghost btn-block" id="gate-new">Vẫn muốn tạo mới</button>
        </div>
      </div>
    `);
    mount.querySelector("#gate-keep-old").addEventListener("click", () => navigate("/home"));
    mount.querySelector("#gate-new").addEventListener("click", () => {
      state.step = "select";
      render();
    });
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
          <span class="industry-select-icon">${icon(ind.icon, { size: 22 })}</span>
          <span class="industry-select-label">${escapeHtml(ind.label)}</span>
          ${ind.positions ? `<span class="industry-select-chevron">${icon(expanded ? "chevron-down" : "chevron-right", { size: 18 })}</span>` : ""}
        </button>
        ${ind.positions && expanded ? `<div class="industry-position-list" id="position-list-${ind.key}">${positionListHtml(ind)}</div>` : ""}
      </div>
    `;
  }

  function positionListHtml(ind) {
    if (!state.skinStatus) return `<p class="muted" style="padding:8px 12px">Đang tải...</p>`;
    return ind.positions
      .map((p) => {
        const st = state.skinStatus[p.key];
        const available = !!st?.exists;
        return `
          <button type="button" class="industry-position-row ${available ? "" : "is-coming-soon"}" data-position="${p.key}" data-available="${available}">
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
      btn.addEventListener("click", async () => {
        const key = btn.dataset.industryToggle;
        const ind = INDUSTRIES.find((i) => i.key === key);
        if (!ind.positions) return selectGeneral();
        if (state.expandedIndustry === key) {
          state.expandedIndustry = null;
          render();
          return;
        }
        state.expandedIndustry = key;
        render();
        if (!state.skinStatus) {
          const res = await checkIndustrySkinStatus(ind.positions.map((p) => p.key));
          state.skinStatus = res.ok ? res.data.status : {};
          render();
        }
      });
    });

    mount.querySelectorAll("[data-position]").forEach((row) => {
      row.addEventListener("click", () => {
        if (row.dataset.available !== "true") {
          showToast("Vị trí này sắp ra mắt, chưa có nội dung để học.");
          return;
        }
        // Vị trí kế toán đã kích hoạt Tầng 1 (chưa có ca thật ở đợt này) sẽ tạo goal ở đây,
        // cùng cơ chế selectGeneral() bên dưới — để trống chủ đích cho lệnh kích hoạt Tầng 1 sau.
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
}
