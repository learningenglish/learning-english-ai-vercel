// app/js/views/profile.js
import { getSession, clearSession } from "../session.js";
import { getProfileStats } from "../db.js";
import { navigate } from "../router.js";
import { escapeHtml } from "../utils.js";

export function renderProfile(mount) {
  const session = getSession();
  mount.innerHTML = `
    <div class="screen">
      <h1 class="screen-title">Hồ sơ</h1>
      <div class="card profile-card">
        <div class="profile-email">${escapeHtml(session?.user?.email || "")}</div>
        <div id="profile-stats" class="stat-row"><div class="stat-pill muted">Đang tải...</div></div>
      </div>
      <button type="button" class="btn btn-danger btn-block" id="logout-btn">Đăng xuất</button>
    </div>
  `;

  mount.querySelector("#logout-btn").addEventListener("click", () => {
    clearSession();
    navigate("/login");
  });

  loadStats(mount);
}

async function loadStats(mount) {
  const slot = mount.querySelector("#profile-stats");
  try {
    const { totalXp, completedCount } = await getProfileStats();
    slot.innerHTML = `
      <div class="stat-pill">⭐ Tổng XP: <strong>${totalXp}</strong></div>
      <div class="stat-pill">📚 Bài đã học: <strong>${completedCount}</strong></div>
    `;
  } catch {
    slot.innerHTML = `<div class="stat-pill muted">Không tải được thống kê.</div>`;
  }
}
