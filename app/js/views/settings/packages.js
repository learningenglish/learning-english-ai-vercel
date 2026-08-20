// app/js/views/settings/packages.js — màn "Gói của tôi" (2026-08-20, spec "CƠ CẤU GÓI MOSAIC",
// mục 5 Minh yêu cầu: "bổ sung những cái còn thiếu khi set gói user và thanh toán") — thay nhãn
// TĨNH "Thêm chuyên ngành (Nâng cấp gói)" trong Cài đặt bằng 1 màn THẬT hiển thị gói/credit hiện
// tại + nút nâng cấp mở QR VietQR (api/_generate/billing.js, xác nhận thủ công phía Minh trong
// giai đoạn khởi đầu — chưa có merchant account cổng nào).
import { navigate } from "../../router.js";
import { appHeaderHtml, wireAppHeader, wireBackLink } from "../../header.js";
import { icon } from "../../icons.js";
import { escapeHtml } from "../../utils.js";
import { showToast } from "../../toast.js";
import { getCreditBalance, getMyPaymentOrders, createPaymentOrder } from "../../packageApi.js";
import { PACKAGE_LABELS, UPGRADABLE_TIERS, formatVnd } from "../../packageConfig.js";
import { t, registerTranslations } from "../../i18n.js";

registerTranslations({
  "Gói hiện tại": "Current plan",
  "Credit còn lại": "Credits left",
  "credit/tháng": "credits/month",
  "Nâng cấp gói": "Upgrade plan",
  "Đang xử lý...": "Processing...",
  "Hiện tại": "Current",
  "Quét mã QR để chuyển khoản": "Scan the QR code to transfer",
  "Số tiền": "Amount",
  "Nội dung chuyển khoản (BẮT BUỘC đúng)": "Transfer note (must match exactly)",
  "Ngân hàng": "Bank",
  "Số tài khoản": "Account number",
  "Chủ tài khoản": "Account holder",
  "Sau khi chuyển khoản, gói sẽ được kích hoạt trong ít phút. Quay lại màn này sau để kiểm tra.": "After transferring, your plan will be activated within a few minutes. Come back to this screen later to check.",
  "Đóng": "Close",
  "Đơn hàng đang chờ xác nhận": "Order pending confirmation",
  "Không tạo được đơn hàng, vui lòng thử lại.": "Couldn't create the order, please try again.",
  "tháng": "month",
});

function tierCardHtml(tierKey, currentTier) {
  const cfg = PACKAGE_LABELS[tierKey];
  const isCurrent = tierKey === currentTier;
  return `
    <div class="package-tier-card ${isCurrent ? "is-current" : ""}">
      <div class="package-tier-head">
        <span class="package-tier-label">${escapeHtml(cfg.label)}</span>
        <span class="package-tier-price">${formatVnd(cfg.price)}/${t("tháng")}</span>
      </div>
      <div class="package-tier-meta">${cfg.monthlyCredits} ${t("credit/tháng")} · ${cfg.levels.join(", ")}</div>
      ${
        isCurrent
          ? `<span class="package-tier-current-badge">${t("Hiện tại")}</span>`
          : `<button type="button" class="btn btn-primary btn-block" data-upgrade-tier="${tierKey}">${t("Nâng cấp gói")}</button>`
      }
    </div>
  `;
}

function qrPanelHtml(order) {
  return `
    <div class="package-qr-overlay" id="package-qr-overlay">
      <div class="package-qr-panel">
        <h2 class="package-qr-title">${t("Quét mã QR để chuyển khoản")}</h2>
        <img class="package-qr-image" src="${order.qrUrl}" alt="VietQR" />
        <div class="package-qr-row"><span>${t("Số tiền")}</span><strong>${formatVnd(order.amount)}</strong></div>
        <div class="package-qr-row"><span>${t("Nội dung chuyển khoản (BẮT BUỘC đúng)")}</span><strong>${escapeHtml(order.orderRef)}</strong></div>
        <div class="package-qr-row"><span>${t("Ngân hàng")}</span><strong>${escapeHtml(order.bankCode)}</strong></div>
        <div class="package-qr-row"><span>${t("Số tài khoản")}</span><strong>${escapeHtml(order.bankAccountNumber)}</strong></div>
        <div class="package-qr-row"><span>${t("Chủ tài khoản")}</span><strong>${escapeHtml(order.bankAccountName)}</strong></div>
        <p class="package-qr-note">${t("Sau khi chuyển khoản, gói sẽ được kích hoạt trong ít phút. Quay lại màn này sau để kiểm tra.")}</p>
        <button type="button" class="btn btn-ghost btn-block" id="package-qr-close-btn">${t("Đóng")}</button>
      </div>
    </div>
  `;
}

export function renderPackages(mount) {
  const state = {
    balance: null,
    packageTier: "FREE",
    pendingOrder: null,
    qrOrder: null,
    upgrading: false,
  };

  render();
  load();

  function render() {
    mount.innerHTML = `
      <div class="screen">
        <!-- 2026-08-20 (Minh): "Gói của tôi (Hiện tại)" -> "Nâng cấp gói" — tên gói hiện tại đã lộ
             sẵn qua badge góc phải màn Cài đặt (xem profile.js), màn này giờ CHỈ còn vai trò
             nâng cấp, không cần tự xưng "của tôi" nữa. -->
        ${appHeaderHtml(t("Nâng cấp gói"), undefined, { showBack: true })}

        <div class="package-current-card">
          <div class="package-current-label">${t("Gói hiện tại")}</div>
          <div class="package-current-value">${escapeHtml(PACKAGE_LABELS[state.packageTier]?.label || state.packageTier)}</div>
          <div class="package-current-credit">${icon("sparkles", { size: 16 })} ${state.balance ?? "--"} ${t("Credit còn lại")}</div>
        </div>

        ${
          state.pendingOrder
            ? `<div class="package-pending-banner">${icon("clock", { size: 16 })} ${t("Đơn hàng đang chờ xác nhận")} — ${escapeHtml(state.pendingOrder.order_ref)}</div>`
            : ""
        }

        <div class="package-tier-list">
          ${UPGRADABLE_TIERS.map((tierKey) => tierCardHtml(tierKey, state.packageTier)).join("")}
        </div>

        ${state.qrOrder ? qrPanelHtml(state.qrOrder) : ""}
      </div>
    `;
    wireAppHeader(mount);
    wireBackLink(mount, () => navigate("/profile"));
    wire();
  }

  function wire() {
    mount.querySelectorAll("[data-upgrade-tier]").forEach((btn) => {
      btn.addEventListener("click", () => startUpgrade(btn.dataset.upgradeTier));
    });
    mount.querySelector("#package-qr-close-btn")?.addEventListener("click", () => {
      state.qrOrder = null;
      render();
    });
  }

  async function load() {
    const [creditRes, ordersRes] = await Promise.all([getCreditBalance(), getMyPaymentOrders()]);
    if (creditRes.ok) {
      state.balance = creditRes.data.balance;
      state.packageTier = creditRes.data.packageTier;
    }
    if (ordersRes.ok) {
      state.pendingOrder = (ordersRes.data.orders || []).find((o) => o.status === "pending") || null;
    }
    render();
  }

  async function startUpgrade(tierKey) {
    if (state.upgrading) return;
    state.upgrading = true;
    const res = await createPaymentOrder(tierKey);
    state.upgrading = false;
    if (!res.ok) {
      showToast(res.error || t("Không tạo được đơn hàng, vui lòng thử lại."));
      return;
    }
    state.qrOrder = res.data;
    state.pendingOrder = { order_ref: res.data.orderRef };
    render();
  }
}
