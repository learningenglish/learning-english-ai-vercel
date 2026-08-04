// app/js/views/home.js — màn "Home" MỚI (2026-08-04, làm mới khung điều hướng, Phần A3). Dựng
// GIAO DIỆN RIÊNG bám sát ảnh mẫu (Minh: "không phải sử dụng lại giao diện app trước") — KHÔNG
// tái dùng .card/.stat-card cũ, xem block CSS riêng "Home mới" trong style.css. 4 card ĐÚNG THỨ
// TỰ Bài đọc/Hội thoại/Phân tích/Luyện Viết (chốt lại theo đúng văn bản gốc, ưu tiên hơn vị trí
// trong ảnh mẫu — Minh xác nhận 2026-08-04), mỗi card chỉ ĐIỀU HƯỚNG tới đúng màn đã có sẵn
// (KHÔNG viết lại nội dung màn nào). views/mentor.js (hub Mentor AI cũ) GIỮ NGUYÊN không đụng.
import { navigate } from "../router.js";
import { getActiveLearningGoal, getStreakDays } from "../db.js";
import { getSession } from "../session.js";
import { icon } from "../icons.js";
import { escapeHtml } from "../utils.js";
import { wireAppHeader } from "../header.js";

// "chip" = màu icon vuông bo góc riêng cho từng card, KHÔNG đổi theo Theme Color Palette (màu
// nhận diện thể loại, cố định) — khác hẳn --purple (accent chọn được) dùng cho nút/tab active.
const HOME_CARDS = [
  { id: "reading", label: "Bài đọc", sub: "Rèn luyện kỹ năng đọc hiểu", icon: "book", path: "/lessons", chip: "blue" },
  { id: "dialogue", label: "Hội thoại", sub: "Thực hành giao tiếp thực tế", icon: "message-circle", path: "/lessons/main/dialogue", chip: "green" },
  { id: "analyze", label: "Phân tích", sub: "AI phân tích và đánh giá", icon: "flask", path: "/create-text", chip: "orange" },
  { id: "writing", label: "Luyện viết", sub: "Luyện viết theo chủ đề", icon: "edit-3", path: "/writing", chip: "purple" },
];

// Streak "mục tiêu tuần" (2026-08-04, thẻ riêng theo ảnh mẫu — Minh: "dựng thẻ riêng, không cần
// ảnh") — CHƯA có khái niệm "mục tiêu/ngày" nào khác trong hệ thống, dùng mốc 7 ngày/tuần làm
// thang đo trực quan cho thanh tiến độ (streak thật ÷ 7, chặn tối đa 100%) — số NGÀY hiển thị
// LUÔN là số thật từ getStreakDays(), thanh chỉ là cách trực quan hoá, không phải số bịa thêm.
const STREAK_WEEKLY_GOAL = 7;

function firstName(session) {
  const full = session?.user?.user_metadata?.full_name;
  if (full) return full.trim().split(/\s+/).slice(-1)[0];
  return session?.user?.email?.split("@")[0] || "";
}

export function renderHome(mount) {
  const session = getSession();
  const name = firstName(session);

  mount.innerHTML = `
    <div class="screen home-screen">
      <div class="home-topbar">
        <div class="home-track-chip" id="home-track-chip" hidden></div>
        <button type="button" class="home-settings-btn" id="settings-btn" aria-label="Hồ sơ &amp; cài đặt">${icon("settings", { size: 20 })}</button>
      </div>
      <h1 class="home-greeting">Xin chào${name ? " " + escapeHtml(name) : ""} 👋</h1>
      <p class="home-subgreeting">Hôm nay bạn muốn học gì?</p>

      <div class="streak-card">
        <div class="streak-card-label">Chuỗi ngày học</div>
        <div class="streak-card-row">
          <span class="streak-card-value" id="streak-value">--</span>
          <div class="streak-card-bar"><div class="streak-card-bar-fill" id="streak-bar-fill" style="width:0%"></div></div>
        </div>
      </div>

      <div class="home-card-grid">
        ${HOME_CARDS.map(
          (c) => `
          <button type="button" class="feature-card" data-path="${c.path}">
            <span class="feature-card-icon chip-${c.chip}">${icon(c.icon, { size: 22 })}</span>
            <span class="feature-card-label">${escapeHtml(c.label)}</span>
            <span class="feature-card-sub">${escapeHtml(c.sub)}</span>
          </button>
        `
        ).join("")}
      </div>
    </div>
  `;
  wireAppHeader(mount);

  mount.querySelectorAll(".feature-card").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.path));
  });

  getStreakDays()
    .then((days) => {
      mount.querySelector("#streak-value").textContent = `${days} ngày`;
      const pct = Math.min(100, Math.round((days / STREAK_WEEKLY_GOAL) * 100));
      mount.querySelector("#streak-bar-fill").style.width = `${pct}%`;
    })
    .catch(() => {
      mount.querySelector("#streak-value").textContent = "0 ngày";
    });

  // Chưa có mục tiêu đang hoạt động (lần đầu, hoặc vừa "Đổi vị trí" ở Setting) -> Home không có
  // gì để hiện, đưa thẳng vào màn chọn chuyên ngành thay vì hiện Home rỗng. CÓ mục tiêu -> hiện
  // chip "đang học lộ trình nào" ở đầu màn (2026-08-04, Minh: "chọn lĩnh vực nào sẽ xuất hiện
  // luồng Home có dòng [tên lộ trình] đó") — "goal.title" đã là câu hoàn chỉnh dựng sẵn ở server
  // (buildConfirmationDisplay()/buildGoalConfirmationDisplay() trong skin.js/mentor.js, xem
  // views/industrySelect.js), KHÔNG tự ghép chữ gì thêm ở đây.
  getActiveLearningGoal()
    .then((goal) => {
      if (!goal) {
        navigate("/industry-select");
        return;
      }
      const chip = mount.querySelector("#home-track-chip");
      chip.textContent = goal.title;
      chip.hidden = false;
    })
    .catch(() => {
      // Lỗi mạng lúc kiểm tra -> không chặn Home, cứ để người dùng dùng bình thường.
    });
}
