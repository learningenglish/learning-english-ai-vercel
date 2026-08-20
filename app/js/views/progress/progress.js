// app/js/views/progress.js — tab "Tiến trình" MỚI (2026-08-04, gộp Lịch sử+Thống kê "giống
// hình" — Minh). GIAO DIỆN RIÊNG, KHÔNG tái dùng .stat-card/.history-item/.writing-criteria-*
// cũ (xem block CSS riêng "Tiến trình mới" trong style.css) — tổng quan kỹ năng × level (thanh
// tiến trình) + lịch sử học NHÓM THEO NGÀY bên dưới. history.js/stats.js GIỮ NGUYÊN file, không
// xoá, chỉ không còn route/nav nào trỏ tới nữa.
//
// SỬA 2026-08-05 (Minh bắt bug thật: "Tiến trình không tải được" — màn này gọi 5 restFetch()
// RIÊNG BIỆT cùng lúc qua 3 Promise.all khác nhau, đúng nguyên nhân khiến bug race-condition
// refresh_token lộ ra rõ nhất ở đây, xem ghi chú ensureValidSession() trong db.js) — GỘP còn 1
// lượt gọi DUY NHẤT (getProgressOverview(), tự gộp 3 lượt restFetch() bên trong nó) thay vì 5.
import { navigate } from "../../router.js";
import { getProgressOverview } from "../../db.js";
import { escapeHtml } from "../../utils.js";
import { icon } from "../../icons.js";
import { wireAppHeader } from "../../header.js";
import { getCreditBalance } from "../../packageApi.js";
import { t, registerTranslations } from "../../i18n.js";

registerTranslations({
  // "streak" (2026-08-12, bỏ chữ tiếng Anh lẫn trong khung tiếng Việt — không phải từ mượn thông
  // dụng như "email").
  "Kỷ lục chuỗi ngày": "Longest streak",
  "Bài đã học": "Lessons completed",
  "Chuỗi ngày": "Streak (days)",
  "Tiến trình": "Progress",
  "Hồ sơ &amp; cài đặt": "Profile &amp; settings",
  "Bài đọc": "Reading",
  "Hội thoại": "Dialogue",
  "Luyện viết": "Writing practice",
  "Lịch sử học": "Learning history",
  "Đang tải...": "Loading...",
  "Chưa có bài nào.": "No lessons yet.",
  "Chưa có bài luyện viết nào.": "No writing exercises yet.",
  "Hôm nay": "Today",
  "Hôm qua": "Yesterday",
  "Chưa có hoạt động hôm nay hoặc hôm qua.": "No activity today or yesterday.",
  "(Bài học đã xoá)": "(Lesson deleted)",
  "Đã học": "Completed",
  "Chưa học": "Not started",
  "Không tải được.": "Couldn't load.",
  "Không tải được lịch sử học.": "Couldn't load learning history.",
  "Credit còn lại": "Credits left",
});

// Card thứ 4 "Credit còn lại" (2026-08-20, spec "CƠ CẤU GÓI MOSAIC" — Minh: "Thêm bộ đếm credit
// ở màn Tiến trình bên cạnh bộ đếm bài đã học") — id RIÊNG (progress-summary-credit-value), tải
// SONG SONG với getProgressOverview() ở load() bên dưới (nguồn dữ liệu khác hẳn — get_credit_balance,
// không thuộc getProgressOverview()), không chặn nhau nếu 1 trong 2 lỗi.
function summaryCardsHtml() {
  return `
    <div class="progress-summary-grid" id="progress-summary">
      <div class="progress-summary-card"><div class="progress-summary-value">--</div><div class="progress-summary-label">${t("Kỷ lục chuỗi ngày")}</div></div>
      <div class="progress-summary-card"><div class="progress-summary-value">--</div><div class="progress-summary-label">${t("Bài đã học")}</div></div>
      <div class="progress-summary-card"><div class="progress-summary-value">--</div><div class="progress-summary-label">${t("Chuỗi ngày")}</div></div>
      <div class="progress-summary-card"><div class="progress-summary-value" id="progress-summary-credit-value">--</div><div class="progress-summary-label">${t("Credit còn lại")}</div></div>
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
  if (!rows.length) return `<p class="muted">${t("Chưa có bài nào.")}</p>`;
  return `<div class="progress-bars-card">${rows.map((r) => barRowHtml(r.level, r.pct)).join("")}</div>`;
}

function writingSectionHtml(rows) {
  if (!rows.length) return `<p class="muted">${t("Chưa có bài luyện viết nào.")}</p>`;
  return `<div class="progress-bars-card">${rows.map((r) => barRowHtml(r.genre, r.pct)).join("")}</div>`;
}

// Nhãn ngày kiểu mockup ("Hôm nay — dd/mm/yyyy", "Hôm qua — ...") — so theo NGÀY LỊCH (không
// phải 24h trước), khớp cách getProgressOverview() đang tính streak (computeStreakFromDates()
// trong db.js). CHỈ 2 giá trị (null nghĩa là "quá cũ, không hiện" — xem lọc ở renderHistory(),
// Minh: "chỉ cần hôm nay và hôm qua là đủ").
function dayGroupLabel(iso) {
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString("vi-VN");
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return `${t("Hôm nay")} — ${dateStr}`;
  if (diffDays === 1) return `${t("Hôm qua")} — ${dateStr}`;
  return null;
}

const CONTENT_TYPE_ICON = { reading: "book", dialogue: "message-circle" };

export function renderProgress(mount) {
  mount.innerHTML = `
    <div class="screen">
      <div class="home-topbar">
        <h1 class="progress-title">${icon("bar-chart", { size: 22 })} ${t("Tiến trình")}</h1>
        <button type="button" class="home-settings-btn" id="settings-btn" aria-label="${t("Hồ sơ &amp; cài đặt")}">${icon("settings", { size: 20 })}</button>
      </div>

      ${summaryCardsHtml()}

      <p class="progress-section-title">${t("Bài đọc")}</p>
      <div id="progress-reading"><p class="muted">${t("Đang tải...")}</p></div>

      <p class="progress-section-title">${t("Hội thoại")}</p>
      <div id="progress-dialogue"><p class="muted">${t("Đang tải...")}</p></div>

      <p class="progress-section-title">${t("Luyện viết")}</p>
      <div id="progress-writing"><p class="muted">${t("Đang tải...")}</p></div>

      <p class="progress-section-title">${t("Lịch sử học")}</p>
      <div id="history-list"><p class="muted">${t("Đang tải...")}</p></div>
    </div>
  `;
  wireAppHeader(mount);
  load();
  loadCredit();

  // Tách RIÊNG khỏi load() (getProgressOverview()) — nguồn khác hẳn (get_credit_balance đọc
  // "students", không đụng lesson_progress/writing_submissions) — lỗi ở đây không nên kéo cả
  // màn Tiến trình báo lỗi, chỉ để "--" ở đúng 1 card đó.
  async function loadCredit() {
    const res = await getCreditBalance();
    const el = mount.querySelector("#progress-summary-credit-value");
    if (el && res.ok) el.textContent = res.data.balance;
  }

  // 1 LƯỢT GỌI DUY NHẤT (getProgressOverview()) thay vì 5 lượt riêng biệt qua 3 Promise.all
  // trước đó — dựng LẠI toàn bộ nội dung (thống kê/thanh tiến trình/lịch sử) từ CÙNG 1 kết quả,
  // không còn 3 khối try/catch độc lập nữa (đúng ngữ nghĩa hơn: lỗi mạng giờ ảnh hưởng NGUYÊN
  // màn thay vì lộ ra 3 thông báo lỗi lặp lại như trước).
  async function load() {
    try {
      const data = await getProgressOverview();
      renderSummary(data);
      mount.querySelector("#progress-reading").innerHTML = skillSectionHtml(data.skills.reading);
      mount.querySelector("#progress-dialogue").innerHTML = skillSectionHtml(data.skills.dialogue);
      mount.querySelector("#progress-writing").innerHTML = writingSectionHtml(data.writing);
      renderHistory(data.history);
    } catch {
      mount.querySelector("#progress-reading").innerHTML = `<p class="error-text">${t("Không tải được.")}</p>`;
      mount.querySelector("#progress-dialogue").innerHTML = `<p class="error-text">${t("Không tải được.")}</p>`;
      mount.querySelector("#progress-writing").innerHTML = `<p class="error-text">${t("Không tải được.")}</p>`;
      mount.querySelector("#history-list").innerHTML = `<p class="error-text">${t("Không tải được lịch sử học.")}</p>`;
    }
  }

  // SỬA 2026-08-09 (Đợt 3, mục 14 — Minh: "Tổng XP không sử dụng, đổi thành kỉ lục ghi nhận
  // chuỗi ngày học cao nhất là mấy ngày"): ô đầu đổi từ totalXp sang longestStreak
  // (computeLongestStreakFromDates() trong db.js) — quét toàn bộ lịch sử, KHÁC "streak" ở ô thứ
  // 3 (chỉ tính streak HIỆN TẠI, lùi từ hôm nay/hôm qua).
  function renderSummary({ completedCount, streak, longestStreak }) {
    const cards = mount.querySelector("#progress-summary").querySelectorAll(".progress-summary-value");
    cards[0].textContent = longestStreak;
    cards[1].textContent = completedCount;
    cards[2].textContent = streak;
  }

  // CHỈ Hôm nay + Hôm qua (2026-08-05, Minh: "chỉ cần hôm nay và hôm qua là đủ, không cần liệt
  // kê tất cả") — lọc bỏ NGAY các ngày cũ hơn (dayGroupLabel() trả null cho ngày đó). Mỗi dòng
  // hiện icon LOẠI NỘI DUNG (Bài đọc/Hội thoại) + level + dấu tick Đã học (nghe hết audio
  // tổng, fully_listened_at)/Chưa học — THAY % và giờ (số liệu không thật/không cần thiết ở
  // đây, Minh: "% và thời gian đổi lại thành dấu tick Đã học/Chưa học").
  function renderHistory(allRows) {
    const listEl = mount.querySelector("#history-list");
    const rows = (allRows || []).filter((r) => dayGroupLabel(r.last_opened_at) !== null);
    if (!rows.length) {
      listEl.innerHTML = `<p class="muted">${t("Chưa có hoạt động hôm nay hoặc hôm qua.")}</p>`;
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
            <div class="progress-history-title">${escapeHtml(lesson?.title_vi || lesson?.title || t("(Bài học đã xoá)"))}</div>
            <div class="progress-history-meta"><span class="badge">${escapeHtml(lesson?.level || "")}</span></div>
          </div>
          <span class="learn-status-badge ${done ? "learn-status-done" : "learn-status-not-started"}">${done ? icon("check-circle", { size: 12 }) : ""} ${done ? t("Đã học") : t("Chưa học")}</span>
        </div>
      `);
    }
    listEl.innerHTML = parts.join("");
    listEl.querySelectorAll(".progress-history-item").forEach((item) => {
      item.addEventListener("click", () => navigate(`/lesson/${item.dataset.id}`));
    });
  }
}
