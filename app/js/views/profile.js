// app/js/views/profile.js
import { getSession, clearSession } from "../session.js";
import { getProfileStats } from "../db.js";
import { navigate } from "../router.js";
import { escapeHtml } from "../utils.js";
import { icon } from "../icons.js";
import { getThemePreference, setThemePreference } from "../theme.js";
import {
  getBackgroundPreference,
  setBackgroundPreference,
  BACKGROUND_GROUPS,
  getCustomBackgrounds,
  addCustomBackground,
  removeCustomBackground,
  customPrefFor,
} from "../background.js";

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
        <div id="bg-picker-slot"></div>
        <p class="field-hint bg-picker-error" id="bg-picker-error" hidden></p>
        <input type="file" id="bg-file-input" accept="image/*" hidden />
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

  renderBgPicker(mount);
  loadStats(mount);
}

// Khu chọn hình nền: các nhóm chủ đề có sẵn + "Ảnh của bạn" (tự thêm từ máy, tối đa 6, có
// nút xoá từng ảnh). Render lại NGUYÊN khu này sau mỗi thao tác thêm/xoá/chọn — đơn giản
// hơn là tự đồng bộ từng nút active/thumbnail bằng tay.
function renderBgPicker(mount) {
  const slot = mount.querySelector("#bg-picker-slot");
  const errorEl = mount.querySelector("#bg-picker-error");
  const fileInput = mount.querySelector("#bg-file-input");
  const currentBg = getBackgroundPreference();
  const customs = getCustomBackgrounds();

  slot.innerHTML = `
    ${BACKGROUND_GROUPS.map(
      (g) => `
      <div class="bg-group-label">${escapeHtml(g.label)}</div>
      <div class="bg-picker">
        ${g.items
          .map(
            (b) => `
          <button type="button" class="bg-option ${currentBg === b.value ? "active" : ""}" data-bg="${b.value}">
            <span class="bg-option-thumb" style="${b.file ? `background-image:url('../icons/${b.file}')` : ""}"></span>
            <span>${escapeHtml(b.label)}</span>
          </button>
        `
          )
          .join("")}
      </div>
    `
    ).join("")}
    <div class="bg-group-label">Ảnh của bạn</div>
    <div class="bg-picker">
      ${customs
        .map(
          (c) => `
        <div class="bg-option-wrap">
          <button type="button" class="bg-option ${currentBg === customPrefFor(c.id) ? "active" : ""}" data-bg="${customPrefFor(c.id)}">
            <span class="bg-option-thumb" style="background-image:url('${c.dataUrl}')"></span>
            <span>Ảnh riêng</span>
          </button>
          <button type="button" class="bg-option-delete" data-delete="${c.id}" aria-label="Xoá ảnh này">${icon("x-circle", { size: 16 })}</button>
        </div>
      `
        )
        .join("")}
      <button type="button" class="bg-option bg-option-add" id="bg-add-btn">
        <span class="bg-option-thumb bg-option-thumb-add">${icon("plus", { size: 22 })}</span>
        <span>Thêm ảnh</span>
      </button>
    </div>
  `;

  slot.querySelectorAll(".bg-option[data-bg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setBackgroundPreference(btn.dataset.bg);
      renderBgPicker(mount);
    });
  });

  slot.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeCustomBackground(btn.dataset.delete);
      renderBgPicker(mount);
    });
  });

  slot.querySelector("#bg-add-btn").addEventListener("click", () => fileInput.click());
  // Gắn onchange (ghi đè) thay vì addEventListener: renderBgPicker chạy lại nhiều lần trong
  // 1 phiên xem Hồ sơ nhưng fileInput nằm NGOÀI slot (không bị render lại) — addEventListener
  // sẽ cộng dồn handler, mỗi lần chọn ảnh bị thêm N lần.
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    fileInput.value = ""; // cho phép chọn lại đúng file cũ lần sau vẫn kích hoạt change
    if (!file) return;
    errorEl.hidden = true;
    const res = await addCustomBackground(file);
    if (!res.ok) {
      errorEl.textContent = res.message;
      errorEl.hidden = false;
      return;
    }
    setBackgroundPreference(customPrefFor(res.id));
    renderBgPicker(mount);
  };
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
