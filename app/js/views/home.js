// app/js/views/home.js — màn "Home" MỚI (2026-08-04, làm mới khung điều hướng, Phần A3). Thay
// hẳn chỗ /lessons từng giữ vai trò màn chính — 4 card ĐÚNG THỨ TỰ Bài đọc/Hội thoại/Phân
// tích/Luyện Viết, mỗi card chỉ ĐIỀU HƯỚNG tới đúng màn đã có sẵn (KHÔNG viết lại nội dung màn
// nào). views/mentor.js (hub Mentor AI cũ, đã tắt UI 2026-07-23) GIỮ NGUYÊN không đụng — file
// này độc lập, không import từ đó.
import { navigate } from "../router.js";
import { getActiveLearningGoal } from "../db.js";
import { icon } from "../icons.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats } from "../header.js";

const HOME_CARDS = [
  { id: "reading", label: "Bài đọc", sub: "Rèn luyện kỹ năng đọc hiểu", icon: "book", path: "/lessons" },
  { id: "dialogue", label: "Hội thoại", sub: "Thực hành giao tiếp thực tế", icon: "message-circle", path: "/lessons/main/dialogue" },
  { id: "analyze", label: "Phân tích", sub: "AI phân tích và đánh giá", icon: "flask", path: "/create-text" },
  { id: "writing", label: "Luyện viết", sub: "Luyện viết theo chủ đề", icon: "edit-3", path: "/writing" },
];

export function renderHome(mount) {
  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml()}
      <h1 class="home-greeting" id="home-greeting">Xin chào 👋</h1>
      <p class="muted" id="home-subgreeting">Hôm nay bạn muốn học gì?</p>
      <div class="home-card-grid">
        ${HOME_CARDS.map(
          (c) => `
          <button type="button" class="home-card" data-path="${c.path}">
            <span class="home-card-icon">${icon(c.icon, { size: 22 })}</span>
            <span class="home-card-label">${c.label}</span>
            <span class="home-card-sub">${c.sub}</span>
          </button>
        `
        ).join("")}
      </div>
    </div>
  `;
  wireAppHeader(mount);
  loadAppHeaderStats(mount);

  mount.querySelectorAll(".home-card").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.path));
  });

  // Chưa có mục tiêu đang hoạt động (lần đầu, hoặc vừa "Đổi vị trí" ở Setting) -> Home không có
  // gì để hiện, đưa thẳng vào màn chọn chuyên ngành thay vì hiện Home rỗng.
  getActiveLearningGoal()
    .then((goal) => {
      if (!goal) navigate("/industry-select");
    })
    .catch(() => {
      // Lỗi mạng lúc kiểm tra -> không chặn Home, cứ để người dùng dùng bình thường.
    });
}
