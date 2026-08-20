// app/js/views/home.js — màn "Home" MỚI (2026-08-04, làm mới khung điều hướng, Phần A3). Dựng
// GIAO DIỆN RIÊNG bám sát ảnh mẫu (Minh: "không phải sử dụng lại giao diện app trước") — KHÔNG
// tái dùng .card/.stat-card cũ, xem block CSS riêng "Home mới" trong style.css. 4 card ĐÚNG THỨ
// TỰ Bài đọc/Hội thoại/Phân tích/Luyện Viết (chốt lại theo đúng văn bản gốc, ưu tiên hơn vị trí
// trong ảnh mẫu — Minh xác nhận 2026-08-04), mỗi card chỉ ĐIỀU HƯỚNG tới đúng màn đã có sẵn
// (KHÔNG viết lại nội dung màn nào).
import { navigate } from "../../router.js";
import { getActiveLearningGoal, getStreakAndStats } from "../../db.js";
import { getSession } from "../../session.js";
import { icon } from "../../icons.js";
import { escapeHtml } from "../../utils.js";
import { primeSharedStats } from "../../header.js";
import { t, registerTranslations } from "../../i18n.js";

registerTranslations({
  "Xin chào": "Hello",
  "Hôm nay bạn muốn học gì?": "What do you want to learn today?",
  "Chuỗi ngày học": "Learning streak",
  "Bài đọc": "Reading",
  "Rèn luyện kỹ năng đọc hiểu": "Build your reading skills",
  "Hội thoại": "Dialogue",
  "Thực hành giao tiếp thực tế": "Practice real conversations",
  "Phân tích": "Analysis",
  "AI phân tích và đánh giá": "AI analysis and feedback",
  "Luyện viết": "Writing practice",
  "Luyện viết theo chủ đề": "Practice writing by topic",
  "ngày": "days",
  "bài đã học": "lessons done",
});

// "goal.title" (2026-08-13, Minh: giao diện tiếng Anh vẫn hiện tên chuyên ngành tiếng Việt) là
// câu TĨNH dựng sẵn ở server LÚC TẠO goal (buildGoalConfirmationDisplay()/buildConfirmationDisplay()
// trong goal.js/skin.js) — không tự đổi theo ngôn ngữ giao diện hiện tại. Tự dựng lại câu hiển thị
// ở ĐÂY từ "occupation_profile" (đã có sẵn trong response getActiveLearningGoal(), xem db.js) qua
// ĐÚNG cùng bảng dịch industrySelect.js dùng (t()) — vừa ra tiếng Anh đúng khi đổi ngôn ngữ, vừa
// ĐỒNG BỘ nhãn với màn "Chọn chuyên ngành" (trước đây lệch: màn chọn "Tiếng Anh Giao Tiếp" nhưng
// Home lại "Giao tiếp tổng quát" — 2 chuỗi khác nhau cho cùng 1 lựa chọn).
function goalDisplayTitle(goal) {
  const profile = goal?.occupation_profile;
  if (profile?.is_general) return t("Giao Tiếp Tổng Quát");
  if (profile?.merged_occupation) return `${t("Anh văn chuyên ngành")} ${t(profile.merged_occupation)}`;
  return goal.title; // lưới đỡ cho goal cũ (nếu có) thiếu occupation_profile
}

// "chip" = màu icon vuông bo góc riêng cho từng card, KHÔNG đổi theo Theme Color Palette (màu
// nhận diện thể loại, cố định) — khác hẳn --purple (accent chọn được) dùng cho nút/tab active.
// SỬA 2026-08-07 (Minh: "Tôi không hề yêu cầu tách thành luồng dấu + cho những cái không đúng
// luồng... Home -> Luyện viết (icon) + -> Luyện viết (Không icon). Bị dư thừa") — RÚT LẠI đợt
// 2026-08-06 (từng đổi "analyze"/"writing" trỏ qua analysisArchive.js/writingArchive.js trước,
// thêm 1 màn "Lưu trữ" trung gian + nút "+") — 2 card này trỏ THẲNG lại vào đúng màn tạo mới như
// TRƯỚC tái cấu trúc, KHÔNG qua màn danh sách trung gian nữa. Xem lại
// createFromText.js/writingPractice.js — đã có sẵn icon Lưu trữ riêng (archivePath) dẫn qua
// analysisArchive.js/writingArchive.js NGAY TRONG màn tạo mới, không cần lặp lại ở Home.
const HOME_CARDS = [
  { id: "reading", label: "Bài đọc", sub: "Rèn luyện kỹ năng đọc hiểu", icon: "book", path: "/lessons/reading", chip: "blue" },
  { id: "dialogue", label: "Hội thoại", sub: "Thực hành giao tiếp thực tế", icon: "message-circle", path: "/lessons/dialogue", chip: "green" },
  { id: "analyze", label: "Phân tích", sub: "AI phân tích và đánh giá", icon: "flask", path: "/create-text", chip: "orange" },
  { id: "writing", label: "Luyện viết", sub: "Luyện viết theo chủ đề", icon: "edit-3", path: "/writing", chip: "purple" },
];

// Streak "mục tiêu tuần" (2026-08-04, thẻ riêng theo ảnh mẫu — Minh: "dựng thẻ riêng, không cần
// ảnh") — CHƯA có khái niệm "mục tiêu/ngày" nào khác trong hệ thống, dùng mốc 7 ngày/tuần làm
// thang đo trực quan cho thanh tiến độ (streak thật ÷ 7, chặn tối đa 100%) — số NGÀY hiển thị
// LUÔN là số thật từ getStreakAndStats(), thanh chỉ là cách trực quan hoá, không phải số bịa thêm.
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
      <!-- "home-track-chip" (2026-08-04, Minh: "đồng bộ với các mục khác về font chữ và vị trí
           hiển thị" — trước đây 1 chip màu tím nhỏ, giờ dùng ĐÚNG class tiêu đề header dùng
           chung .screen-title/.app-header-title như mọi màn khác) + BỎ nút cài đặt góc phải
           (Minh: "bỏ nút setting góc phải trên cao" — Setting đã có sẵn icon riêng ở bottom
           nav, không cần trùng lặp).
           SỬA 2026-08-06 (Minh bắt bug thật: "giao diện Home bị chớp") — trước đây dòng này
           dùng thuộc tính "hidden" (gỡ khỏi luồng layout hoàn toàn) rồi mới hiện SAU khi
           getActiveLearningGoal() tải xong, khiến nội dung bên dưới bị ĐẨY XUỐNG đột ngột lúc
           chữ xuất hiện — đúng cảm giác "chớp/giật". Đổi sang "visibility:hidden" (vẫn chiếm
           đúng chỗ trong layout ngay từ lúc vẽ trang đầu tiên) + text rỗng "&nbsp;" giữ chiều
           cao dòng, JS chỉ đổi text + visibility, không còn phát sinh dịch chuyển bố cục. -->
      <h1 class="screen-title app-header-title home-track-title" id="home-track-title" style="visibility:hidden">&nbsp;</h1>
      <h1 class="home-greeting">${t("Xin chào")}${name ? " " + escapeHtml(name) : ""} 👋</h1>
      <p class="home-subgreeting">${t("Hôm nay bạn muốn học gì?")}</p>

      <div class="streak-card">
        <div class="streak-card-top">
          <div class="streak-card-label">${t("Chuỗi ngày học")}</div>
          <span class="streak-card-lessons-count" id="streak-lessons-count">--</span>
        </div>
        <div class="streak-card-row">
          <span class="streak-card-value" id="streak-value">--</span>
          <div class="streak-card-bar"><div class="streak-card-bar-fill" id="streak-bar-fill" style="width:0%"></div></div>
          <span class="streak-card-flame">${icon("flame", { size: 20, filled: true })}</span>
        </div>
      </div>

      <div class="home-card-grid">
        ${HOME_CARDS.map(
          (c) => `
          <button type="button" class="feature-card" data-path="${c.path}">
            <span class="feature-card-icon chip-${c.chip}">${icon(c.icon, { size: 22 })}</span>
            <span class="feature-card-label">${escapeHtml(t(c.label))}</span>
            <span class="feature-card-sub">${escapeHtml(t(c.sub))}</span>
          </button>
        `
        ).join("")}
      </div>
    </div>
  `;

  mount.querySelectorAll(".feature-card").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.path));
  });

  getStreakAndStats()
    .then(({ streak: days, totalXp, completedCount }) => {
      mount.querySelector("#streak-value").textContent = `${days} ${t("ngày")}`;
      // Số bài đã học ở góc trên bên phải card chuỗi ngày (2026-08-20, Minh: "Thêm số bài đã học
      // ở card chuỗi ngày học ở góc trên bên phải") — TÁI DÙNG completedCount đã tính sẵn trong
      // CÙNG lượt getStreakAndStats() này, không gọi thêm API riêng.
      mount.querySelector("#streak-lessons-count").textContent = `${completedCount} ${t("bài đã học")}`;
      const pct = Math.min(100, Math.round((days / STREAK_WEEKLY_GOAL) * 100));
      mount.querySelector("#streak-bar-fill").style.width = `${pct}%`;
      // 2026-08-07 (Minh bắt bug thật: "Chuỗi ngày học ở ngoài là 0, nhưng vào trong là --") —
      // Home KHÔNG dùng appHeaderHtml() nên trước đây không hề "làm ấm" sharedStatsCache (xem
      // header.js) — màn ĐẦU TIÊN mở sau Home (luôn là Home, vì đó là trang chính sau đăng
      // nhập) luôn thấy badge streak "--" dù Home đã có số thật. Làm ấm cache NGAY TẠI ĐÂY bằng
      // đúng số vừa tải, không cần gọi mạng thêm lần nữa.
      primeSharedStats(days, totalXp);
    })
    .catch(() => {
      mount.querySelector("#streak-value").textContent = `0 ${t("ngày")}`;
    });

  // Chưa có mục tiêu đang hoạt động (lần đầu, hoặc vừa "Đổi vị trí" ở Setting) -> Home không có
  // gì để hiện, đưa thẳng vào màn chọn chuyên ngành thay vì hiện Home rỗng. CÓ mục tiêu -> hiện
  // chip "đang học lộ trình nào" ở đầu màn (2026-08-04, Minh: "chọn lĩnh vực nào sẽ xuất hiện
  // luồng Home có dòng [tên lộ trình] đó") — "goal.title" đã là câu hoàn chỉnh dựng sẵn ở server
  // (buildConfirmationDisplay()/buildGoalConfirmationDisplay() trong skin.js/goal.js, xem
  // views/industrySelect.js), KHÔNG tự ghép chữ gì thêm ở đây.
  getActiveLearningGoal()
    .then((goal) => {
      if (!goal) {
        navigate("/industry-select");
        return;
      }
      const titleEl = mount.querySelector("#home-track-title");
      titleEl.textContent = goalDisplayTitle(goal);
      titleEl.style.visibility = "visible";
    })
    .catch(() => {
      // Lỗi mạng lúc kiểm tra -> không chặn Home, cứ để người dùng dùng bình thường.
    });
}
