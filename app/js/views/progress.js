// app/js/views/progress.js — tab "Tiến trình" MỚI (2026-08-04, làm mới khung điều hướng): gộp
// 2 màn cũ Lịch sử (history.js) + Thống kê (stats.js) thành 1 màn duy nhất, tái dùng NGUYÊN VẸN
// 2 nguồn dữ liệu đã có (getProfileStats/getStreakDays/getHistory trong db.js) — chỉ đổi cách
// trình bày, không đổi truy vấn. history.js/stats.js giữ nguyên file (không xoá), chỉ không còn
// route/nav nào trỏ tới nữa.
import { navigate } from "../router.js";
import { getProfileStats, getStreakDays, getHistory } from "../db.js";
import { escapeHtml, formatDate } from "../utils.js";
import { icon } from "../icons.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats } from "../header.js";

export function renderProgress(mount) {
  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(`<span style="color:var(--purple)">${icon("bar-chart", { size: 22 })}</span> Tiến trình`)}
      <div class="stats-grid" id="stats-grid">
        <div class="stat-card"><div class="stat-card-value">--</div><div class="stat-card-label">Tổng XP</div></div>
        <div class="stat-card"><div class="stat-card-value">--</div><div class="stat-card-label">Bài đã học</div></div>
        <div class="stat-card"><div class="stat-card-value">--</div><div class="stat-card-label">Streak (ngày)</div></div>
      </div>
      <p class="section-label-tab" style="margin-top:20px">Lịch sử học</p>
      <div id="history-list" class="history-list"><p class="muted">Đang tải...</p></div>
    </div>
  `;
  wireAppHeader(mount);
  loadAppHeaderStats(mount);
  loadStats();
  loadHistory();

  async function loadStats() {
    const grid = mount.querySelector("#stats-grid");
    try {
      const [stats, streak] = await Promise.all([getProfileStats(), getStreakDays()]);
      const cards = grid.querySelectorAll(".stat-card-value");
      cards[0].textContent = stats.totalXp;
      cards[1].textContent = stats.completedCount;
      cards[2].textContent = streak;
    } catch {
      // Lỗi tải thống kê không nên chặn khối lịch sử bên dưới — cứ để "--" mặc định.
    }
  }

  async function loadHistory() {
    const listEl = mount.querySelector("#history-list");
    try {
      const rows = await getHistory();
      if (!rows.length) {
        listEl.innerHTML = `<p class="muted">Bạn chưa học bài nào.</p>`;
        return;
      }
      listEl.innerHTML = rows
        .map((r) => {
          const lesson = r.lessons;
          const done = !!r.completed_at;
          return `
            <div class="history-item" data-id="${r.lesson_id}">
              <div class="history-status ${done ? "history-status-done" : ""}">${icon(done ? "check-circle" : "book", { size: 22 })}</div>
              <div>
                <div class="history-title">${escapeHtml(lesson?.title_vi || lesson?.title || "(Bài học đã xoá)")}</div>
                <div class="history-date muted">
                  <span class="badge">${escapeHtml(lesson?.level || "")}</span>
                  ${formatDate(r.last_opened_at)} · ${done ? `+${r.xp_earned || 0} XP` : "đang học dở"}
                </div>
              </div>
            </div>
          `;
        })
        .join("");
      listEl.querySelectorAll(".history-item").forEach((item) => {
        item.addEventListener("click", () => navigate(`/lesson/${item.dataset.id}`));
      });
    } catch {
      listEl.innerHTML = `<p class="error-text">Không tải được lịch sử học.</p>`;
    }
  }
}
