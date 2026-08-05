// app/js/views/profile.js
import { getSession, clearSession } from "../session.js";
import { navigate } from "../router.js";
import { escapeHtml } from "../utils.js";
import { icon } from "../icons.js";
import { backChevronHtml, wireBackLink } from "../header.js";
import { getThemePreference, setThemePreference } from "../theme.js";
import { getPalettePreference, setPalettePreference, PALETTES } from "../palette.js";
import { getFontSizePreference, setFontSizePreference, FONT_SIZES } from "../fontSize.js";

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
  mount.innerHTML = `
    <div class="screen">
      <div class="app-header-left">${backChevronHtml()}<h1 class="screen-title icon-text app-header-title">${icon("settings", { size: 22 })} Cài đặt</h1></div>

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
        <div class="settings-row">
          <span class="icon-text">${icon("user", { size: 18 })} Tài khoản</span>
          <span class="muted">${escapeHtml(session?.user?.email || "")}</span>
        </div>
        <div class="settings-row">
          <span class="icon-text">${icon("info", { size: 18 })} Thông tin ứng dụng</span>
          <span class="muted">${escapeHtml(APP_NAME)} · v${APP_VERSION}</span>
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

  // history.back() — Cài đặt có thể vào từ CẢ 4 tab chính (nút cài đặt luôn có mặt), quay đúng
  // về màn vừa đứng thay vì cố định 1 đích đến (giống lesson.js).
  wireBackLink(mount, () => history.back());

  mount.querySelector("#logout-btn").addEventListener("click", () => {
    clearSession();
    navigate("/login");
  });

  // "Đổi chuyên ngành" (2026-08-04, đổi tên 2026-08-05 — Minh: "Đổi vị trí công việc" ->
  // "Đổi chuyên ngành", khớp industrySelect.js đã bỏ tầng vị trí) — vào ĐÚNG luồng chọn chuyên
  // ngành đã có (views/industrySelect.js), TÁI DÙNG nguyên cơ chế "1 goal active" ở đó — KHÔNG
  // viết logic riêng ở đây.
  mount.querySelector("#change-industry-row").addEventListener("click", () => navigate("/industry-select"));

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

  mount.querySelectorAll(".palette-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      setPalettePreference(btn.dataset.palette);
      mount.querySelectorAll(".palette-option").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });
}
