// app/js/views/lessons.js — màn "Bài học" (màn chính sau đăng nhập), bám theo ảnh mẫu:
// header avatar+streak+cài đặt, ô tìm kiếm + nút lọc, tab Bài đọc/Hội thoại, danh sách thẻ
// bài học. Route "/favorites" tái dùng ĐÚNG hàm này với filter mặc định = "favorite"
// (params[0]) — cùng 1 UI, khác mỗi trạng thái lọc ban đầu.
//
// GHI CHÚ MAPPING DỮ LIỆU (chưa có "giá trị" cụ thể người dùng chỉ định — xem hội thoại):
// - Dòng tiêu đề đậm = lessons.title_vi (thay vì nhãn cố định "BÀI HỌC HÀNG NGÀY" như ảnh
//   mẫu, vì mỗi bài cần phân biệt được nhau; nhãn cố định lặp lại mọi thẻ sẽ vô nghĩa).
// - Dòng phụ màu cam = lessons.situation (bảng "lessons" hiện KHÔNG lưu cột "chủ đề" riêng
//   — trường "topic" chỉ dùng để dựng prompt lúc tạo bài, không persist).
import { navigate } from "../router.js";
import { listLessons, setLessonFavorite, getStreakDays, getProfileStats } from "../db.js";
import { icon } from "../icons.js";
import { lessonCardHtml, wireLessonCards } from "../lessonCard.js";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const XP_TIERS = [
  { min: 0, label: "Người mới" },
  { min: 50, label: "Explorer" },
  { min: 200, label: "Adventurer" },
  { min: 500, label: "Master" },
];

function tierLabel(xp) {
  return XP_TIERS.reduce((label, t) => (xp >= t.min ? t.label : label), XP_TIERS[0].label);
}

export function renderLessons(mount, params) {
  const state = {
    contentType: "reading",
    level: "all",
    favoriteOnly: params?.[0] === "favorite",
    search: "",
  };

  mount.innerHTML = `
    <div class="screen">
      <div class="app-header">
        <div class="header-avatar-block">
          <div class="header-avatar"><img src="icons/avatar-placeholder.svg" alt="" /></div>
          <div class="explorer-badge">${icon("compass", { size: 15 })} <span id="tier-label">...</span></div>
        </div>
        <div class="header-right">
          <div class="streak-badge">${icon("flame", { size: 16, filled: true })} <span id="streak-value">--</span> ngày học</div>
          <button type="button" class="settings-btn" id="settings-btn" aria-label="Hồ sơ &amp; cài đặt">${icon("settings", { size: 20 })}</button>
        </div>
      </div>

      <div class="search-row">
        <button type="button" class="filter-btn" id="toggle-level-filter">${icon("filter", { size: 16 })} Tìm lọc</button>
        <div class="search-box">
          <span class="search-icon">${icon("search", { size: 18 })}</span>
          <input type="text" id="search-input" placeholder="Tìm kiếm bài học..." />
        </div>
      </div>

      <div class="filter-row" id="level-filter-row" hidden>
        <button type="button" class="filter-chip active" data-level="all">Tất cả</button>
        ${LEVELS.map((l) => `<button type="button" class="filter-chip" data-level="${l}">${l}</button>`).join("")}
      </div>

      <div class="content-tabs" role="tablist">
        <button type="button" class="content-tab-btn active" data-type="reading">${icon("book", { size: 17 })} Bài đọc</button>
        <button type="button" class="content-tab-btn" data-type="dialogue">${icon("message-circle", { size: 17 })} Hội thoại</button>
      </div>

      <div id="lessons-list" class="lessons-list"><p class="muted">Đang tải...</p></div>
    </div>
  `;

  mount.querySelector("#settings-btn").addEventListener("click", () => navigate("/profile"));

  mount.querySelector("#toggle-level-filter").addEventListener("click", () => {
    const row = mount.querySelector("#level-filter-row");
    row.hidden = !row.hidden;
  });
  mount.querySelectorAll("#level-filter-row .filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      mount.querySelectorAll("#level-filter-row .filter-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.level = chip.dataset.level;
      renderList();
    });
  });

  mount.querySelectorAll(".content-tab-btn").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      mount.querySelectorAll(".content-tab-btn").forEach((b) => b.classList.remove("active"));
      tabBtn.classList.add("active");
      state.contentType = tabBtn.dataset.type;
      renderList();
    });
  });

  let searchDebounce = null;
  mount.querySelector("#search-input").addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.search = e.target.value.trim().toLowerCase();
      renderList();
    }, 200);
  });

  loadHeaderStats(mount);
  renderList();

  async function renderList() {
    const listEl = mount.querySelector("#lessons-list");
    listEl.innerHTML = `<p class="muted">Đang tải...</p>`;
    try {
      const filter = state.favoriteOnly ? "favorite" : state.contentType;
      let lessons = await listLessons({ filter });
      if (state.favoriteOnly && state.contentType) {
        lessons = lessons.filter((l) => l.content_type === state.contentType);
      }
      if (state.level !== "all") {
        lessons = lessons.filter((l) => l.level === state.level);
      }
      if (state.search) {
        lessons = lessons.filter(
          (l) =>
            (l.title_vi || l.title || "").toLowerCase().includes(state.search) ||
            (l.situation || "").toLowerCase().includes(state.search)
        );
      }
      if (!lessons.length) {
        listEl.innerHTML = `<p class="muted">Chưa có bài học nào.</p>`;
        return;
      }
      listEl.innerHTML = lessons.map(lessonCardHtml).join("");
      wireLessonCards(listEl, {
        onOpen: (id) => navigate(`/lesson/${id}`),
        onToggleFavorite: async (id, nextFav) => {
          await setLessonFavorite(id, nextFav);
          if (state.favoriteOnly) renderList(); // đang ở tab Yêu thích -> bỏ tim thì phải biến mất khỏi danh sách
        },
      });
    } catch {
      listEl.innerHTML = `<p class="error-text">Không tải được danh sách bài học.</p>`;
    }
  }
}

async function loadHeaderStats(mount) {
  try {
    const [streak, stats] = await Promise.all([getStreakDays(), getProfileStats()]);
    mount.querySelector("#streak-value").textContent = streak;
    mount.querySelector("#tier-label").textContent = tierLabel(stats.totalXp);
  } catch {
    // Lỗi tải streak/tier không nên chặn cả màn — cứ để "--" / "..." như mặc định.
  }
}
