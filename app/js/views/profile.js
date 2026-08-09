// app/js/views/profile.js
import { getSession, clearSession } from "../session.js";
import { navigate } from "../router.js";
import { icon } from "../icons.js";
import { showToast } from "../toast.js";
import { getThemePreference, setThemePreference } from "../theme.js";
import { getPalettePreference, setPalettePreference, PALETTES } from "../palette.js";
import { getFontSizePreference, setFontSizePreference, FONT_SIZES } from "../fontSize.js";
import { getAutoScrollPreference, setAutoScrollPreference } from "../autoScroll.js";

const APP_NAME = "Learning English AI";
const APP_VERSION = "1.0.0";

const THEME_OPTIONS = [
  { value: "light", label: "Sáng", icon: "sun" },
  { value: "dark", label: "Tối", icon: "moon" },
  { value: "system", label: "Hệ thống", icon: "monitor" },
];

export function renderProfile(mount) {
  const session = getSession();
  const currentTheme = getThemePreference();
  const currentPalette = getPalettePreference();
  const currentFontSize = getFontSizePreference();
  const currentAutoScroll = getAutoScrollPreference();
  mount.innerHTML = `
    <div class="screen">
      <h1 class="screen-title icon-text app-header-title">${icon("settings", { size: 22 })} Cài đặt</h1>

      <div class="card profile-card">
        <!-- "Ngôn ngữ" (2026-08-04) — hàng TĨNH, app hiện chỉ có tiếng Việt (không có hệ thống
             i18n thật) nên KHÔNG xây control chọn ngôn ngữ chức năng, chỉ hiện đúng mockup. -->
        <div class="settings-row">
          <span class="icon-text">${icon("languages", { size: 18 })} Ngôn ngữ</span>
          <span class="muted">Tiếng Việt</span>
        </div>
        <div class="settings-row settings-row-clickable" id="change-industry-row">
          <span class="icon-text">${icon("briefcase", { size: 18 })} Đổi chuyên ngành</span>
          ${icon("chevron-right", { size: 18 })}
        </div>
        <!-- "Tài khoản"/"Thông tin ứng dụng" (2026-08-05, sửa lỗi tràn khung — Minh: "chữ bị tràn
             khung, dùng > như Đổi chuyên ngành, cần xem mới click") — KHÔNG hiện email/version
             dài ngay trên hàng nữa (email dài vỡ layout), bấm vào mới hiện qua toast. -->
        <div class="settings-row settings-row-clickable" id="account-row">
          <span class="icon-text">${icon("user", { size: 18 })} Tài khoản</span>
          ${icon("chevron-right", { size: 18 })}
        </div>
        <div class="settings-row settings-row-clickable" id="app-info-row">
          <span class="icon-text">${icon("info", { size: 18 })} Thông tin ứng dụng</span>
          ${icon("chevron-right", { size: 18 })}
        </div>
      </div>

      <div class="card profile-card">
        <div class="profile-section-title">Giao diện</div>
        <div class="theme-picker" id="theme-picker">
          ${THEME_OPTIONS.map(
            (o) => `
            <button type="button" class="theme-option ${currentTheme === o.value ? "active" : ""}" data-theme="${o.value}">
              ${icon(o.icon, { size: 20 })}
              <span>${o.label}</span>
            </button>
          `
          ).join("")}
        </div>
      </div>

      <!-- "Kích thước chữ" (2026-08-05, mới) — cùng cơ chế theme/palette (app/js/fontSize.js),
           co giãn TOÀN app vì mọi cỡ chữ đều dùng đơn vị rem. -->
      <div class="card profile-card">
        <div class="profile-section-title">Kích thước chữ</div>
        <div class="theme-picker" id="font-size-picker">
          ${FONT_SIZES.map(
            (f) => `
            <button type="button" class="theme-option ${currentFontSize === f.value ? "active" : ""}" data-font-size="${f.value}">
              <span>${f.label}</span>
            </button>
          `
          ).join("")}
        </div>
      </div>

      <!-- "Auto Scroll" (2026-08-09, Đợt 4 mục 8) — Minh: tự cuộn trang theo câu/đoạn đang phát
           audio trong màn đọc bài. Đặt ở đây (không phải icon riêng trong màn đọc bài — hàng
           toggle ở đó đã đủ 3 icon) vì đây là tuỳ chọn hành vi lâu dài, cùng nhóm với Kích thước
           chữ/Theme hơn là toggle theo-từng-bài. -->
      <div class="card profile-card">
        <div class="profile-section-title">Tự cuộn theo audio</div>
        <div class="theme-picker" id="auto-scroll-picker">
          <button type="button" class="theme-option ${!currentAutoScroll ? "active" : ""}" data-auto-scroll="0">
            <span>Tắt</span>
          </button>
          <button type="button" class="theme-option ${currentAutoScroll ? "active" : ""}" data-auto-scroll="1">
            <span>Bật</span>
          </button>
        </div>
      </div>

      <!-- Theme (Color Palette) (2026-08-04) — BỎ HẲN ảnh nền/nhóm màu nền dựng sẵn/upload ảnh
           riêng (yêu cầu Minh: "Nền bỏ hình nền, bỏ up hình nền, code dùng nền theo bộ màu") —
           chọn 1 trong các bộ màu ở đây tự đổi LUÔN cả nền full màn hình (xem
           body::before trong style.css, đọc lại var(--purple-soft) do palette.js set), không
           còn mục "Ảnh nền" riêng nữa. -->
      <div class="card profile-card">
        <div class="profile-section-title">Theme (Color Palette)</div>
        <div class="palette-picker" id="palette-picker">
          ${PALETTES.map(
            (p) => `
            <button type="button" class="palette-option ${currentPalette === p.value ? "active" : ""}" data-palette="${p.value}">
              <span class="palette-option-swatch" style="background:${p.swatch}"></span>
              <span>${p.label}</span>
            </button>
          `
          ).join("")}
        </div>
      </div>

      <button type="button" class="btn btn-danger btn-block" id="logout-btn">${icon("logout", { size: 18 })} Đăng xuất</button>
    </div>
  `;

  // KHÔNG còn nút back (2026-08-05, Minh: "bỏ icon < ở Cài đặt") — Cài đặt giờ là 1 trong 4 tab
  // CHÍNH ở bottom nav (xem app.js NAV_TABS), giống Home/Tiến trình/Admin đều không có back.

  mount.querySelector("#logout-btn").addEventListener("click", () => {
    clearSession();
    navigate("/login");
  });

  // "/industry-select/change" (2026-08-05, khác "/industry-select" trơn — Minh: "đổi chuyên
  // ngành đang ở BÊN TRONG luồng, không phải lần chọn đầu tiên, cần icon Home/Tiến trình... để
  // quay lại") — cùng renderIndustrySelect(), chỉ khác app.js::renderBottomNav() đọc thêm
  // "/change" ở cuối hash để quyết định hiện/ẩn thanh điều hướng ngoài (xem app.js).
  mount.querySelector("#change-industry-row").addEventListener("click", () => navigate("/industry-select/change"));

  mount.querySelector("#account-row").addEventListener("click", () => {
    showToast(session?.user?.email || "Chưa đăng nhập");
  });
  mount.querySelector("#app-info-row").addEventListener("click", () => {
    showToast(`${APP_NAME} · v${APP_VERSION}`);
  });

  mount.querySelectorAll(".theme-option[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setThemePreference(btn.dataset.theme);
      mount.querySelectorAll(".theme-option[data-theme]").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  mount.querySelectorAll(".theme-option[data-font-size]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setFontSizePreference(btn.dataset.fontSize);
      mount.querySelectorAll(".theme-option[data-font-size]").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  mount.querySelectorAll(".theme-option[data-auto-scroll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setAutoScrollPreference(btn.dataset.autoScroll === "1");
      mount.querySelectorAll(".theme-option[data-auto-scroll]").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  mount.querySelectorAll(".palette-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      setPalettePreference(btn.dataset.palette);
      mount.querySelectorAll(".palette-option").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });
}
