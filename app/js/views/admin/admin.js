// app/js/views/admin.js — tab "Admin". 2026-08-04: ban đầu chỉ icon + màn tĩnh "Sắp ra mắt" (không
// có logic quyền hạn/nội dung nào, ghi chú gốc: "xây phần này ở lệnh riêng sau").
//
// 2026-08-20 (spec "CƠ CẤU GÓI MOSAIC" — Minh: "tài khoản admin kimchinamvn@gmail.com, toàn quyền")
// — THÊM 2 việc quản trị thật đầu tiên: duyệt đơn thanh toán VietQR (thủ công, chờ Minh nối
// SePay/Casso mới tự động được) + "tặng gói" (cấp thủ công A1_A2/B1/B2 trong 3/6/12 tháng, không
// qua thanh toán thật, xem api/_generate/billing.js admin_grant_package). MỌI tài khoản KHÁC vẫn
// thấy "Sắp ra mắt" y hệt cũ — gate hiển thị bằng email session CHỈ để UX (ẩn UI không liên quan),
// quyền THẬT luôn do server tự kiểm tra lại qua ADMIN_EMAILS (isAdmin() trong billing.js), không
// tin bất kỳ gì phía client.
import { icon } from "../../icons.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats } from "../../header.js";
import { getSession } from "../../session.js";
import { showToast } from "../../toast.js";
import { escapeHtml } from "../../utils.js";
import { adminListPendingPayments, adminConfirmPayment, adminGrantPackage } from "../../packageApi.js";
import { PACKAGE_LABELS, UPGRADABLE_TIERS, formatVnd } from "../../packageConfig.js";
import { t, registerTranslations } from "../../i18n.js";

registerTranslations({
  // "Quảng Cáo" (2026-08-20, Minh: "ẩn chức năng Quản Trị dưới vỏ bọc quảng cáo") — chỉ đổi
  // NHÃN + ICON hiển thị (xem app.js NAV_TABS), toàn bộ phân quyền thật giữ nguyên bên dưới.
  "Quảng Cáo": "Ads",
  "Sắp ra mắt": "Coming soon",
  "Đơn hàng chờ duyệt": "Orders pending approval",
  "Không có đơn hàng nào đang chờ.": "No orders pending.",
  "Xác nhận": "Confirm",
  "Tặng gói": "Gift a plan",
  "Email tài khoản": "Account email",
  "Gói": "Plan",
  "Thời hạn": "Duration",
  "3 ngày": "3 days",
  "5 ngày": "5 days",
  "3 tháng": "3 months",
  "6 tháng": "6 months",
  "1 năm": "1 year",
  "Tặng": "Gift",
  "Đã xác nhận đơn hàng.": "Order confirmed.",
  "Đã tặng gói.": "Plan gifted.",
  "Chưa có tài khoản — đã lên lịch, tự áp dụng khi đăng ký.": "No account yet — scheduled, will apply automatically once they sign up.",
  "Có lỗi xảy ra.": "Something went wrong.",
});

// Chỉ để ẨN/HIỆN UI (không phải lớp bảo mật thật — server tự kiểm tra lại qua ADMIN_EMAILS trong
// billing.js::isAdmin()). App này KHÔNG có build step/biến môi trường phía client (xem config.js)
// nên phải lặp lại giá trị ở đây, giống cách APP_SECRET đã nhúng thẳng client từ trước.
const ADMIN_EMAIL_ALLOWLIST = ["kimchinamvn@gmail.com"];

// THÊM 3/5 ngày (2026-08-20, Minh: "Trong gói tặng, thêm cho tôi gói 3 ngày và 5 ngày" — dùng thử
// nghiệm ngắn hạn, cạnh 3/6/12 THÁNG cũ dành cho khách thật) — "value" gộp "<số>:<đơn vị>" thành 1
// chuỗi duy nhất để dùng trực tiếp làm value <option> (HTML <option> chỉ nhận 1 chuỗi), tách lại ở
// submitGrant() bên dưới, xem supabase/046_package_grant_duration_days.sql.
const GRANT_DURATION_OPTIONS = [
  { value: "3:day", label: "3 ngày" },
  { value: "5:day", label: "5 ngày" },
  { value: "3:month", label: "3 tháng" },
  { value: "6:month", label: "6 tháng" },
  { value: "12:month", label: "1 năm" },
];

function pendingOrderRowHtml(order) {
  const label = order.students?.full_name || order.students?.email || "?";
  return `
    <div class="admin-order-row">
      <div class="admin-order-info">
        <div class="admin-order-user">${escapeHtml(label)}</div>
        <div class="admin-order-meta">${escapeHtml(order.order_ref)} · ${escapeHtml(PACKAGE_LABELS[order.target_tier]?.label || order.target_tier)} · ${formatVnd(order.amount)}</div>
      </div>
      <button type="button" class="btn btn-primary" data-confirm-order="${order.order_ref}">${t("Xác nhận")}</button>
    </div>
  `;
}

export function renderAdmin(mount) {
  const session = getSession();
  const isAdminUser = ADMIN_EMAIL_ALLOWLIST.includes((session?.user?.email || "").toLowerCase());
  const state = { pendingOrders: [], loading: isAdminUser };

  render();
  wireAppHeader(mount);
  loadAppHeaderStats(mount);
  if (isAdminUser) loadPendingOrders();

  function render() {
    mount.innerHTML = `
      <div class="screen">
        ${appHeaderHtml(`<span style="color:var(--purple)">${icon("megaphone", { size: 22 })}</span> ${t("Quảng Cáo")}`)}
        ${isAdminUser ? adminPanelHtml() : comingSoonHtml()}
      </div>
    `;
    wireAppHeader(mount);
    if (isAdminUser) wire();
  }

  function comingSoonHtml() {
    return `
      <div class="screen-center" style="padding-top:60px">
        <div class="card" style="text-align:center">
          ${icon("megaphone", { size: 40 })}
          <p class="muted" style="margin-top:12px">${t("Sắp ra mắt")}</p>
        </div>
      </div>
    `;
  }

  function adminPanelHtml() {
    return `
      <p class="progress-section-title">${t("Đơn hàng chờ duyệt")}</p>
      <div id="admin-orders-list">
        ${
          state.loading
            ? `<p class="muted">...</p>`
            : state.pendingOrders.length
            ? state.pendingOrders.map(pendingOrderRowHtml).join("")
            : `<p class="muted">${t("Không có đơn hàng nào đang chờ.")}</p>`
        }
      </div>

      <p class="progress-section-title">${t("Tặng gói")}</p>
      <div class="card admin-grant-card">
        <label class="field">
          <span class="field-question">${t("Email tài khoản")}</span>
          <input type="email" id="grant-email-input" placeholder="user@example.com" />
        </label>
        <label class="field">
          <span class="field-question">${t("Gói")}</span>
          <select id="grant-tier-select">
            ${UPGRADABLE_TIERS.map((tk) => `<option value="${tk}">${escapeHtml(PACKAGE_LABELS[tk].label)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span class="field-question">${t("Thời hạn")}</span>
          <select id="grant-duration-select">
            ${GRANT_DURATION_OPTIONS.map((o) => `<option value="${o.value}">${t(o.label)}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="btn btn-primary btn-block" id="grant-submit-btn">${t("Tặng")}</button>
      </div>
    `;
  }

  function wire() {
    mount.querySelectorAll("[data-confirm-order]").forEach((btn) => {
      btn.addEventListener("click", () => confirmOrder(btn.dataset.confirmOrder, btn));
    });
    mount.querySelector("#grant-submit-btn")?.addEventListener("click", submitGrant);
  }

  async function loadPendingOrders() {
    const res = await adminListPendingPayments();
    state.loading = false;
    state.pendingOrders = res.ok ? res.data.orders || [] : [];
    render();
  }

  async function confirmOrder(orderRef, btn) {
    btn.disabled = true;
    const res = await adminConfirmPayment(orderRef);
    btn.disabled = false;
    if (!res.ok) {
      showToast(res.error || t("Có lỗi xảy ra."));
      return;
    }
    showToast(t("Đã xác nhận đơn hàng."));
    loadPendingOrders();
  }

  async function submitGrant() {
    const email = mount.querySelector("#grant-email-input").value.trim();
    const tier = mount.querySelector("#grant-tier-select").value;
    // "3:day"/"12:month" -> { durationValue: 3, durationUnit: "day" } (xem GRANT_DURATION_OPTIONS).
    const [durationValueStr, durationUnit] = mount.querySelector("#grant-duration-select").value.split(":");
    if (!email) return;
    const btn = mount.querySelector("#grant-submit-btn");
    btn.disabled = true;
    const res = await adminGrantPackage(email, tier, Number(durationValueStr), durationUnit);
    btn.disabled = false;
    if (!res.ok) {
      showToast(res.error || t("Có lỗi xảy ra."));
      return;
    }
    // "scheduled" (2026-08-20, Minh: "phải set luôn, không đợi người ta đăng ký mới tặng được") —
    // email chưa có tài khoản -> billing.js tự LÊN LỊCH thay vì báo lỗi, tự áp dụng lúc email đó
    // đăng ký. Hiện rõ 2 trạng thái khác nhau, tránh Minh tưởng nhầm đã tặng thành công NGAY.
    showToast(res.data.scheduled ? t("Chưa có tài khoản — đã lên lịch, tự áp dụng khi đăng ký.") : t("Đã tặng gói."));
    mount.querySelector("#grant-email-input").value = "";
  }
}
