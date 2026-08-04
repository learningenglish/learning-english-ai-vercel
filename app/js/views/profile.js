// app/js/views/profile.js
import { getSession, clearSession } from "../session.js";
import { getProfileStats } from "../db.js";
import { navigate } from "../router.js";
import { escapeHtml } from "../utils.js";
import { icon } from "../icons.js";
import { backChevronHtml, wireBackLink } from "../header.js";
import { getThemePreference, setThemePreference } from "../theme.js";
import { getPalettePreference, setPalettePreference, PALETTES } from "../palette.js";

const THEME_OPTIONS = [
  { value: "light", label: "Sáng", icon: "sun" },
  { value: "dark", label: "Tối", icon: "moon" },
  { value: "system", label: "Hệ thống", icon: "monitor" },
];

export function renderProfile(mount) {
  const session = getSession();
  const currentTheme = getThemePreference();
  const currentPalette = getPalettePreference();
  mount.innerHTML = `
    <div class="screen">
      <div class="app-header-left">${backChevronHtml()}<h1 class="screen-title icon-text app-header-title">${icon("settings", { size: 22 })} Hồ sơ</h1></div>
      <div class="card profile-card">
        <div class="profile-email">${escapeHtml(session?.user?.email || "")}</div>
        <div id="profile-stats" class="stat-row"><div class="stat-pill muted">Đang tải...</div></div>
      </div>

      <div class="card profile-card">
        <!-- "Ngôn ngữ" (2026-08-04) — hàng TĨNH, app hiện chỉ có tiếng Việt (không có hệ thống
             i18n thật) nên KHÔNG xây control chọn ngôn ngữ chức năng, chỉ hiện đúng mockup. -->
        <div class="settings-row">
          <span class="icon-text">${icon("languages", { size: 18 })} Ngôn ngữ</span>
          <span class="muted">Tiếng Việt</span>
        </div>
        <div class="settings-row settings-row-clickable" id="change-industry-row">
          <span class="icon-text">${icon("briefcase", { size: 18 })} Đổi vị trí công việc</span>
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

      <!-- Theme (Color Palette) (2026-08-04) — BỎ HẲN ảnh nền/nhóm màu nền dựng sẵn/upload ảnh
           riêng (yêu cầu Minh: "Nền bỏ hình nền, bỏ up hình nền, code dùng nền theo bộ màu") —
           chọn 1 trong 4 bộ màu ở đây tự đổi LUÔN cả nền full màn hình (xem
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

  // history.back() — Hồ sơ có thể vào từ CẢ 4 tab chính (nút cài đặt luôn có mặt), quay đúng
  // về màn vừa đứng thay vì cố định 1 đích đến (giống lesson.js).
  wireBackLink(mount, () => history.back());

  mount.querySelector("#logout-btn").addEventListener("click", () => {
    clearSession();
    navigate("/login");
  });

  // "Đổi vị trí công việc" (2026-08-04) — vào ĐÚNG luồng chọn lĩnh vực/vị trí đã có
  // (views/industrySelect.js), TÁI DÙNG nguyên cơ chế "1 goal active"/gate ở đó (checkGoalGate())
  // để khoá/xác nhận đổi lộ trình — KHÔNG viết logic riêng ở đây.
  mount.querySelector("#change-industry-row").addEventListener("click", () => navigate("/industry-select"));

  mount.querySelectorAll(".theme-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      setThemePreference(btn.dataset.theme);
      mount.querySelectorAll(".theme-option").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  mount.querySelectorAll(".palette-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      setPalettePreference(btn.dataset.palette);
      mount.querySelectorAll(".palette-option").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  loadStats(mount);
}

async function loadStats(mount) {
  const slot = mount.querySelector("#profile-stats");
  try {
    const { totalXp, completedCount } = await getProfileStats();
    slot.innerHTML = `
      <div class="stat-pill icon-text">${icon("star", { size: 15, filled: true })} Tổng XP: <strong>${totalXp}</strong></div>
      <div class="stat-pill icon-text">${icon("book-open", { size: 15 })} Bài đã học: <strong>${completedCount}</strong></div>
    `;
  } catch {
    slot.innerHTML = `<div class="stat-pill muted">Không tải được thống kê.</div>`;
  }
}
