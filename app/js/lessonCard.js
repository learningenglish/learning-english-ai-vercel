// app/js/lessonCard.js — thẻ danh sách bài học DÙNG CHUNG cho tab "Bài học" (views/lessons.js)
// và lưới thư viện Mentor AI (views/mentor.js) — Đợt 3 mục 6.1 yêu cầu lưới Thư Viện AI
// "giao diện giống hệt tab Phổ biến", nên tách hàm ra đây thay vì viết lại lần 2.
import { escapeHtml, formatDate } from "./utils.js";
import { icon } from "./icons.js";

// Trích đoạn hiện ở thẻ: ưu tiên NỘI DUNG THẬT (câu/đoạn đầu bài) — "situation" chỉ dùng khi
// bài cũ chưa có "content" (không nên xảy ra với dữ liệu hiện tại, chỉ là lớp phòng hờ).
export function lessonCardExcerpt(l) {
  const first = (l.content || [])[0];
  if (first?.translation) return first.translation;
  if (first?.text) return first.text;
  return l.situation || "";
}

export function lessonCardHtml(l) {
  const excerpt = lessonCardExcerpt(l);
  return `
    <div class="lesson-card" data-id="${l.id}">
      <div class="lesson-card-body">
        <div class="lesson-card-title">${escapeHtml(l.title_vi || l.title)}</div>
        ${excerpt ? `<div class="lesson-card-sub">${escapeHtml(excerpt)}</div>` : ""}
        <div class="lesson-card-meta">
          <span class="badge">${escapeHtml(l.level)}</span>
          <span class="muted icon-text">${icon("calendar", { size: 13 })} ${formatDate(l.created_at)}</span>
        </div>
      </div>
      <div class="lesson-card-cover">${
        l.cover_image_url
          ? `<img src="${escapeHtml(l.cover_image_url)}" alt="" />`
          : `<div class="cover-placeholder">${icon(l.content_type === "dialogue" ? "message-circle" : "book", { size: 28 })}</div>`
      }</div>
      <button type="button" class="fav-btn ${l.is_favorite ? "is-favorite" : ""}" data-fav="${l.is_favorite}">${icon("heart", { size: 18, filled: l.is_favorite })}</button>
    </div>
  `;
}

// onOpen(lessonId) / onToggleFavorite(lessonId, nextFavState) -> Promise — người gọi tự lo
// điều hướng + gọi API + quyết định render lại gì (2 màn dùng cùng thẻ nhưng khác cách phản
// ứng: /favorites biến mất khỏi danh sách khi bỏ tim, mentor hub thì không).
export function wireLessonCards(listEl, { onOpen, onToggleFavorite }) {
  listEl.querySelectorAll(".lesson-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".fav-btn")) return;
      onOpen(card.dataset.id);
    });
  });
  listEl.querySelectorAll(".fav-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const nowFav = btn.dataset.fav === "true";
      btn.disabled = true;
      try {
        await onToggleFavorite(btn.closest(".lesson-card").dataset.id, !nowFav);
        btn.dataset.fav = String(!nowFav);
        btn.innerHTML = icon("heart", { size: 18, filled: !nowFav });
        btn.classList.toggle("is-favorite", !nowFav);
      } catch {
        // Giữ nguyên trạng thái cũ nếu lỗi mạng — không cần thông báo ồn ào cho 1 toggle nhỏ.
      } finally {
        btn.disabled = false;
      }
    });
  });
}
