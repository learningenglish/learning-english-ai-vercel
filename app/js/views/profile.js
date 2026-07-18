// app/js/views/profile.js
import { getSession, clearSession } from "../session.js";
import { getProfileStats } from "../db.js";
import { navigate } from "../router.js";
import { escapeHtml } from "../utils.js";
import { icon } from "../icons.js";
import { getThemePreference, setThemePreference } from "../theme.js";
import { getBackgroundPreference, setBackgroundPreference, BACKGROUNDS } from "../background.js";

const THEME_OPTIONS = [
  { value: "light", label: "Sáng", icon: "sun" },
  { value: "dark", label: "Tối", icon: "moon" },
  { value: "system", label: "Hệ thống", icon: "monitor" },
];

export function renderProfile(mount) {
  const session = getSession();
  const currentTheme = getThemePreference();
  const currentBg = getBackgroundPreference();
  mount.innerHTML = `
    <div class="screen">
      <h1 class="screen-title">Hồ sơ</h1>
      <div class="card profile-card">
        <div class="profile-email">${escapeHtml(session?.user?.email || "")}</div>
        <div id="profile-stats" class="stat-row"><div class="stat-pill muted">Đang tải...</div></div>
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

      <div class="card profile-card">
        <div class="profile-section-title">Hình nền</div>
        <div class="bg-picker" id="bg-picker">
          ${BACKGROUNDS.map(
            (b) => `
            <button type="button" class="bg-option ${currentBg === b.value ? "active" : ""}" data-bg="${b.value}">
              <span class="bg-option-thumb" style="${b.file ? `background-image:url('../icons/${b.file}')` : ""}"></span>
              <span>${escapeHtml(b.label)}</span>
            </button>
          `
          ).join("")}
        </div>
      </div>

      <button type="button" class="btn btn-danger btn-block" id="logout-btn">${icon("logout", { size: 18 })} Đăng xuất</button>
    </div>
  `;

  mount.querySelector("#logout-btn").addEventListener("click", () => {
    clearSession();
    navigate("/login");
  });

  mount.querySelectorAll(".theme-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      setThemePreference(btn.dataset.theme);
      mount.querySelectorAll(".theme-option").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  mount.querySelectorAll(".bg-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      setBackgroundPreference(btn.dataset.bg);
      mount.querySelectorAll(".bg-option").forEach((b) => b.classList.toggle("active", b === btn));
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
