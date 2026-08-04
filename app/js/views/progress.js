// app/js/views/progress.js — tab "Tiến trình" MỚI (2026-08-04, gộp Lịch sử+Thống kê "giống
// hình" — Minh). GIAO DIỆN RIÊNG, KHÔNG tái dùng .stat-card/.history-item/.writing-criteria-*
// cũ (xem block CSS riêng "Tiến trình mới" trong style.css) — tổng quan kỹ năng × level (thanh
// tiến trình, dữ liệu thật từ getSkillLevelBreakdown/getWritingGenreBreakdown trong db.js) +
// lịch sử học NHÓM THEO NGÀY bên dưới. history.js/stats.js GIỮ NGUYÊN file, không xoá, chỉ
// không còn route/nav nào trỏ tới nữa.
import { navigate } from "../router.js";
import { getProfileStats, getStreakDays, getHistory, getSkillLevelBreakdown, getWritingGenreBreakdown } from "../db.js";
import { escapeHtml, formatDate } from "../utils.js";
import { icon } from "../icons.js";
import { wireAppHeader } from "../header.js";

function summaryCardsHtml() {
  return `
    <div class="progress-summary-grid" id="progress-summary">
      <div class="progress-summary-card"><div class="progress-summary-value">--</div><div class="progress-summary-label">Tổng XP</div></div>
      <div class="progress-summary-card"><div class="progress-summary-value">--</div><div class="progress-summary-label">Bài đã học</div></div>
      <div class="progress-summary-card"><div class="progress-summary-value">--</div><div class="progress-summary-label">Streak (ngày)</div></div>
    </div>
  `;
}

// "row" (KHÔNG còn thẻ .progress-bar-row riêng từng level, 2026-08-04 — Minh: "tất cả level
// vào 1 card") — mỗi level/thể loại giờ chỉ là 1 KHỐI trong CÙNG 1 card bọc ngoài
// (.progress-bars-card, xem skillSectionHtml/writingSectionHtml), phân cách bằng viền mảnh.
function barRowHtml(label, pct, subLabel) {
  return `
    <div class="progress-bar-item">
      <div class="progress-bar-head"><span>${escapeHtml(label)}</span><span>${pct}%</span></div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <p class="progress-bar-sub">${escapeHtml(subLabel)}</p>
    </div>
  `;
}

function skillSectionHtml(rows) {
  if (!rows.length) return `<p class="muted">Chưa có bài nào.</p>`;
  return `<div class="progress-bars-card">${rows.map((r) => barRowHtml(r.level, r.pct, `${r.done}/${r.total} bài đã học`)).join("")}</div>`;
}

function writingSectionHtml(rows) {
  if (!rows.length) return `<p class="muted">Chưa có bài luyện viết nào.</p>`;
  return `<div class="progress-bars-card">${rows.map((r) => barRowHtml(r.genre, r.pct, `${r.count} bài đã chấm`)).join("")}</div>`;
}

// Nhãn ngày kiểu mockup ("Hôm nay — dd/mm/yyyy", "Hôm qua — ...", còn lại là ngày thường) —
// so theo NGÀY LỊCH (không phải 24h trước), khớp cách getStreakDays() đang tính streak.
function dayGroupLabel(iso) {
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString("vi-VN");
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return `Hôm nay — ${dateStr}`;
  if (diffDays === 1) return `Hôm qua — ${dateStr}`;
  return dateStr;
}

export function renderProgress(mount) {
  mount.innerHTML = `
    <div class="screen">
      <div class="home-topbar">
        <h1 class="progress-title">${icon("bar-chart", { size: 22 })} Tiến trình</h1>
        <button type="button" class="home-settings-btn" id="settings-btn" aria-label="Hồ sơ &amp; cài đặt">${icon("settings", { size: 20 })}</button>
      </div>

      ${summaryCardsHtml()}

      <p class="progress-section-title">Bài đọc</p>
      <div id="progress-reading"><p class="muted">Đang tải...</p></div>

      <p class="progress-section-title">Hội thoại</p>
      <div id="progress-dialogue"><p class="muted">Đang tải...</p></div>

      <p class="progress-section-title">Luyện viết</p>
      <div id="progress-writing"><p class="muted">Đang tải...</p></div>

      <p class="progress-section-title">Lịch sử học</p>
      <div id="history-list"><p class="muted">Đang tải...</p></div>
    </div>
  `;
  wireAppHeader(mount);
  loadStats();
  loadBreakdown();
  loadHistory();

  async function loadStats() {
    const grid = mount.querySelector("#progress-summary");
    try {
      const [stats, streak] = await Promise.all([getProfileStats(), getStreakDays()]);
      const cards = grid.querySelectorAll(".progress-summary-value");
      cards[0].textContent = stats.totalXp;
      cards[1].textContent = stats.completedCount;
      cards[2].textContent = streak;
    } catch {
      // Lỗi tải thống kê không nên chặn các khối bên dưới — cứ để "--" mặc định.
    }
  }

  async function loadBreakdown() {
    try {
      const [skills, writing] = await Promise.all([getSkillLevelBreakdown(), getWritingGenreBreakdown()]);
      mount.querySelector("#progress-reading").innerHTML = skillSectionHtml(skills.reading);
      mount.querySelector("#progress-dialogue").innerHTML = skillSectionHtml(skills.dialogue);
      mount.querySelector("#progress-writing").innerHTML = writingSectionHtml(writing);
    } catch {
      mount.querySelector("#progress-reading").innerHTML = `<p class="error-text">Không tải được.</p>`;
      mount.querySelector("#progress-dialogue").innerHTML = `<p class="error-text">Không tải được.</p>`;
      mount.querySelector("#progress-writing").innerHTML = `<p class="error-text">Không tải được.</p>`;
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
      let lastGroup = null;
      const parts = [];
      for (const r of rows) {
        const group = dayGroupLabel(r.last_opened_at);
        if (group !== lastGroup) {
          parts.push(`<div class="progress-history-day">${escapeHtml(group)}</div>`);
          lastGroup = group;
        }
        const lesson = r.lessons;
        const done = !!r.completed_at;
        parts.push(`
          <div class="progress-history-item" data-id="${r.lesson_id}">
            <span class="progress-history-icon ${done ? "is-done" : ""}">${icon(done ? "check-circle" : "book", { size: 20 })}</span>
            <div class="progress-history-body">
              <div class="progress-history-title">${escapeHtml(lesson?.title_vi || lesson?.title || "(Bài học đã xoá)")}</div>
              <div class="progress-history-meta">
                <span class="badge">${escapeHtml(lesson?.level || "")}</span>
                ${formatDate(r.last_opened_at)} · ${done ? `+${r.xp_earned || 0} XP` : "đang học dở"}
              </div>
            </div>
          </div>
        `);
      }
      listEl.innerHTML = parts.join("");
      listEl.querySelectorAll(".progress-history-item").forEach((item) => {
        item.addEventListener("click", () => navigate(`/lesson/${item.dataset.id}`));
      });
    } catch {
      listEl.innerHTML = `<p class="error-text">Không tải được lịch sử học.</p>`;
    }
  }
}
