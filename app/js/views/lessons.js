// app/js/views/lessons.js — danh sách bài học của user, mới nhất trước.
import { navigate } from "../router.js";
import { listLessons, setLessonFavorite } from "../db.js";
import { escapeHtml, formatDate } from "../utils.js";

const FILTERS = [
  { key: "all", label: "Tất cả" },
  { key: "favorite", label: "Yêu thích" },
  { key: "dialogue", label: "Hội thoại" },
  { key: "reading", label: "Bài đọc" },
];

export function renderLessons(mount) {
  let activeFilter = "all";

  mount.innerHTML = `
    <div class="screen">
      <h1 class="screen-title">Bài học của tôi</h1>
      <div class="filter-row">
        ${FILTERS.map((f) => `<button type="button" class="filter-chip ${f.key === "all" ? "active" : ""}" data-filter="${f.key}">${f.label}</button>`).join("")}
      </div>
      <div id="lessons-list" class="lessons-list"><p class="muted">Đang tải...</p></div>
    </div>
  `;

  mount.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      mount.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      activeFilter = chip.dataset.filter;
      load();
    });
  });

  load();

  async function load() {
    const listEl = mount.querySelector("#lessons-list");
    listEl.innerHTML = `<p class="muted">Đang tải...</p>`;
    try {
      const lessons = await listLessons({ filter: activeFilter });
      if (!lessons.length) {
        listEl.innerHTML = `<p class="muted">Chưa có bài học nào.</p>`;
        return;
      }
      listEl.innerHTML = lessons.map(cardHtml).join("");
      wireCards(listEl);
    } catch {
      listEl.innerHTML = `<p class="error-text">Không tải được danh sách bài học.</p>`;
    }
  }

  function wireCards(listEl) {
    listEl.querySelectorAll(".lesson-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".fav-btn")) return;
        navigate(`/lesson/${card.dataset.id}`);
      });
    });
    listEl.querySelectorAll(".fav-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const nowFav = btn.dataset.fav === "true";
        btn.disabled = true;
        try {
          await setLessonFavorite(btn.closest(".lesson-card").dataset.id, !nowFav);
          btn.dataset.fav = String(!nowFav);
          btn.textContent = !nowFav ? "❤️" : "🤍";
        } catch {
          // Giữ nguyên trạng thái cũ nếu lỗi mạng — không cần thông báo ồn ào cho 1 toggle nhỏ.
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function cardHtml(l) {
    return `
      <div class="lesson-card" data-id="${l.id}">
        <div class="lesson-card-cover">${
          l.cover_image_url
            ? `<img src="${escapeHtml(l.cover_image_url)}" alt="" />`
            : `<div class="cover-placeholder">${l.content_type === "dialogue" ? "💬" : "📖"}</div>`
        }</div>
        <div class="lesson-card-body">
          <div class="lesson-card-title">${escapeHtml(l.title_vi || l.title)}</div>
          ${l.situation ? `<div class="lesson-card-sub muted">${escapeHtml(l.situation)}</div>` : ""}
          <div class="lesson-card-meta">
            <span class="badge">${escapeHtml(l.level)}</span>
            <span class="muted">${formatDate(l.created_at)}</span>
          </div>
        </div>
        <button type="button" class="fav-btn" data-fav="${l.is_favorite}">${l.is_favorite ? "❤️" : "🤍"}</button>
      </div>
    `;
  }
}
