// app/js/views/progress.js — tab "Tiến trình" MỚI (2026-08-04, gộp Lịch sử+Thống kê "giống
// hình" — Minh). GIAO DIỆN RIÊNG, KHÔNG tái dùng .stat-card/.history-item/.writing-criteria-*
// cũ (xem block CSS riêng "Tiến trình mới" trong style.css) — tổng quan kỹ năng × level (thanh
// tiến trình, dữ liệu thật từ getSkillLevelBreakdown/getWritingGenreBreakdown trong db.js) +
// lịch sử học NHÓM THEO NGÀY bên dưới. history.js/stats.js GIỮ NGUYÊN file, không xoá, chỉ
// không còn route/nav nào trỏ tới nữa.
import { navigate } from "../router.js";
import { getProfileStats, getStreakDays, getHistory, getSkillLevelBreakdown, getWritingGenreBreakdown } from "../db.js";
import { escapeHtml } from "../utils.js";
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

// Màu thanh theo MỨC % (2026-08-05, Minh: "hình mẫu các thanh có nhiều màu, thanh chỉ 1 màu
// không đẹp" — đối chiếu số liệu trong ảnh mẫu thật khớp ĐÚNG 1 quy luật theo mức, không phải
// màu random: 0%→xám(chưa có gì), 1-19%→cam(mới bắt đầu), 20-59%→tím(đang tiến bộ), ≥60%→xanh lá
// (tốt) — dùng biến "--chip-*" CỐ ĐỊNH (không đổi theo Theme Color Palette, xem style.css) vì
// đây là MÀU Ý NGHĨA mức độ, không phải màu nhận diện thương hiệu như --purple.
function progressTier(pct) {
  if (pct <= 0) return "empty";
  if (pct < 20) return "low";
  if (pct < 60) return "mid";
  return "high";
}

// "row" (KHÔNG còn thẻ .progress-bar-row riêng từng level, 2026-08-04 — Minh: "tất cả level
// vào 1 card") — mỗi level/thể loại giờ chỉ là 1 KHỐI trong CÙNG 1 card bọc ngoài
// (.progress-bars-card, xem skillSectionHtml/writingSectionHtml), phân cách bằng viền mảnh.
// BỎ dòng phụ "x bài đã học" (2026-08-05, Minh: "giao diện thiết kế chiếm quá nhiều không gian
// so với hình mẫu") — chỉ còn nhãn + % + thanh, ĐÚNG độ gọn của hình mẫu tham khảo.
function barRowHtml(label, pct) {
  return `
    <div class="progress-bar-item">
      <div class="progress-bar-head"><span>${escapeHtml(label)}</span><span>${pct}%</span></div>
      <div class="progress-bar-track"><div class="progress-bar-fill progress-bar-fill-${progressTier(pct)}" style="width:${pct}%"></div></div>
    </div>
  `;
}

function skillSectionHtml(rows) {
  if (!rows.length) return `<p class="muted">Chưa có bài nào.</p>`;
  return `<div class="progress-bars-card">${rows.map((r) => barRowHtml(r.level, r.pct)).join("")}</div>`;
}

function writingSectionHtml(rows) {
  if (!rows.length) return `<p class="muted">Chưa có bài luyện viết nào.</p>`;
  return `<div class="progress-bars-card">${rows.map((r) => barRowHtml(r.genre, r.pct)).join("")}</div>`;
}

// Nhãn ngày kiểu mockup ("Hôm nay — dd/mm/yyyy", "Hôm qua — ...") — so theo NGÀY LỊCH (không
// phải 24h trước), khớp cách getStreakDays() đang tính streak. CHỈ 2 giá trị (null nghĩa là
// "quá cũ, không hiện" — xem lọc ở loadHistory(), Minh: "chỉ cần hôm nay và hôm qua là đủ").
function dayGroupLabel(iso) {
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString("vi-VN");
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return `Hôm nay — ${dateStr}`;
  if (diffDays === 1) return `Hôm qua — ${dateStr}`;
  return null;
}

const CONTENT_TYPE_ICON = { reading: "book", dialogue: "message-circle" };

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

  // CHỈ Hôm nay + Hôm qua (2026-08-05, Minh: "chỉ cần hôm nay và hôm qua là đủ, không cần liệt
  // kê tất cả") — lọc bỏ NGAY các ngày cũ hơn (dayGroupLabel() trả null cho ngày đó). Mỗi dòng
  // hiện icon LOẠI NỘI DUNG (Bài đọc/Hội thoại) + level + dấu tick Đã học (nghe hết audio
  // tổng, fully_listened_at)/Chưa học — THAY % và giờ (số liệu không thật/không cần thiết ở
  // đây, Minh: "% và thời gian đổi lại thành dấu tick Đã học/Chưa học").
  async function loadHistory() {
    const listEl = mount.querySelector("#history-list");
    try {
      const rows = (await getHistory()).filter((r) => dayGroupLabel(r.last_opened_at) !== null);
      if (!rows.length) {
        listEl.innerHTML = `<p class="muted">Chưa có hoạt động hôm nay hoặc hôm qua.</p>`;
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
        const done = !!r.fully_listened_at;
        parts.push(`
          <div class="progress-history-item" data-id="${r.lesson_id}">
            <span class="progress-history-icon">${icon(CONTENT_TYPE_ICON[lesson?.content_type] || "book", { size: 20 })}</span>
            <div class="progress-history-body">
              <div class="progress-history-title">${escapeHtml(lesson?.title_vi || lesson?.title || "(Bài học đã xoá)")}</div>
              <div class="progress-history-meta"><span class="badge">${escapeHtml(lesson?.level || "")}</span></div>
            </div>
            <span class="learn-status-badge ${done ? "learn-status-done" : "learn-status-not-started"}">${done ? icon("check-circle", { size: 12 }) : ""} ${done ? "Đã học" : "Chưa học"}</span>
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
