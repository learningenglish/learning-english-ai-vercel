// app/js/views/stats.js — tab "Thống kê": bản đơn giản (tổng XP, số bài, streak). Bản đầy
// đủ (biểu đồ theo tuần, phân bố theo kỹ năng...) thuộc Phase 4, chưa làm ở đây — người
// dùng chủ động chọn đưa 1 bản Thống kê tối giản lên sớm cùng lúc đổi nav.
import { getProfileStats, getStreakDays } from "../db.js";
import { icon } from "../icons.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats } from "../header.js";

export function renderStats(mount) {
  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(`<span style="color:var(--purple)">${icon("bar-chart", { size: 22 })}</span> Thống kê`)}
      <div class="stats-grid" id="stats-grid">
        <div class="stat-card"><div class="stat-card-value">--</div><div class="stat-card-label">Tổng XP</div></div>
        <div class="stat-card"><div class="stat-card-value">--</div><div class="stat-card-label">Bài đã học</div></div>
        <div class="stat-card"><div class="stat-card-value">--</div><div class="stat-card-label">Streak (ngày)</div></div>
      </div>
      <p class="muted" id="stats-note"></p>
    </div>
  `;
  wireAppHeader(mount);
  loadAppHeaderStats(mount);
  load();

  async function load() {
    const grid = mount.querySelector("#stats-grid");
    try {
      const [stats, streak] = await Promise.all([getProfileStats(), getStreakDays()]);
      const cards = grid.querySelectorAll(".stat-card-value");
      cards[0].textContent = stats.totalXp;
      cards[1].textContent = stats.completedCount;
      cards[2].textContent = streak;
    } catch {
      mount.querySelector("#stats-note").textContent = "Không tải được thống kê, thử lại sau.";
    }
  }
}
