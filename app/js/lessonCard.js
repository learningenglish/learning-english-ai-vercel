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
      <div class="lesson-card-cover">${
        l.cover_image_url
          ? `<img src="${escapeHtml(l.cover_image_url)}" alt="" />`
          : `<div class="cover-placeholder">${icon(l.content_type === "dialogue" ? "message-circle" : "book", { size: 28 })}</div>`
      }<span class="lesson-card-type-badge">${icon(l.content_type === "dialogue" ? "message-circle" : "book", { size: 13 })}</span></div>
      <div class="lesson-card-body">
        <div class="lesson-card-title">${escapeHtml(l.title_vi || l.title)}</div>
        ${excerpt ? `<div class="lesson-card-sub">${escapeHtml(excerpt)}</div>` : ""}
        <div class="lesson-card-meta">
          <span class="badge">${escapeHtml(l.level)}</span>
          <span class="muted icon-text">${icon("calendar", { size: 13 })} ${formatDate(l.created_at)}</span>
        </div>
      </div>
      <button type="button" class="fav-btn ${l.is_favorite ? "is-favorite" : ""}" data-fav="${l.is_favorite}">${icon("heart", { size: 18, filled: l.is_favorite })}</button>
    </div>
  `;
}

// Thẻ carousel "BÀI ĐANG ĐỌC" (màn Bài học, lướt ngang) — ảnh bìa PHỦ KÍN thẻ + lớp gradient
// tối phía dưới để chữ không bị trộn vào nền minh hoạ (yêu cầu người dùng), khác hẳn thẻ danh
// sách thường (.lesson-card) vốn ảnh bìa chỉ là thumbnail nhỏ bên cạnh. Không có cover ->
// dùng nền tím-hồng gradient sẵn có của app thay vì ảnh, vẫn giữ chữ trắng dễ đọc.
export function continueCardHtml(l) {
  const total = (l.content || []).length || 1;
  const pagesSeen = Math.min(l.progress_page ?? 0, total - 1) + 1;
  const pct = Math.round((pagesSeen / total) * 100);
  const excerpt = lessonCardExcerpt(l);
  return `
    <div class="continue-card" data-id="${l.id}" ${l.cover_image_url ? `style="background-image:url('${escapeHtml(l.cover_image_url)}')"` : ""}>
      ${!l.cover_image_url ? '<div class="continue-card-fallback-bg"></div>' : ""}
      <div class="continue-card-overlay"></div>
      <button type="button" class="fav-btn continue-card-fav ${l.is_favorite ? "is-favorite" : ""}" data-fav="${l.is_favorite}">${icon("heart", { size: 17, filled: l.is_favorite })}</button>
      <div class="continue-card-body">
        <div class="continue-card-title">${escapeHtml(l.title_vi || l.title)}</div>
        ${excerpt ? `<div class="continue-card-sub">${escapeHtml(excerpt)}</div>` : ""}
        <div class="continue-card-meta">
          <span class="badge">${escapeHtml(l.level)}</span>
          <span class="icon-text">${icon("calendar", { size: 13 })} ${formatDate(l.created_at)}</span>
        </div>
      </div>
      <div class="continue-card-progress"><span style="width:${pct}%"></span></div>
    </div>
  `;
}

// Card "Lĩnh vực" (màn Thư viện AI, lướt ngang) — CÙNG kích thước/tỉ lệ với .continue-card
// (yêu cầu người dùng "giống bài đang đọc") nhưng không có ảnh bìa/tim (đây là 1 NHÓM bài,
// không phải 1 bài cụ thể) — chỉ tên lĩnh vực + số bài, nền gradient tím-hồng sẵn có của app.
// "active" -> đang được chọn làm bộ lọc (viền trắng nổi bật), xem views/lessons.js::state.industry.
export function industryCardHtml(name, count, active) {
  return `
    <div class="industry-card ${active ? "active" : ""}" data-industry="${escapeHtml(name)}">
      <div class="industry-card-count">${count}</div>
      <div class="industry-card-name">${escapeHtml(name)}</div>
    </div>
  `;
}

// onOpen(lessonId) / onToggleFavorite(lessonId, nextFavState) -> Promise — người gọi tự lo
// điều hướng + gọi API + quyết định render lại gì (2 màn dùng cùng thẻ nhưng khác cách phản
// ứng: /favorites biến mất khỏi danh sách khi bỏ tim, mentor hub thì không). "cardSelector"
// cho phép dùng chung hàm này cho cả thẻ danh sách thường (.lesson-card) lẫn thẻ carousel
// "BÀI ĐANG ĐỌC" (.continue-card, xem continueCardHtml() ở trên) — chỉ khác class bọc ngoài.
export function wireLessonCards(listEl, { onOpen, onToggleFavorite, cardSelector = ".lesson-card" }) {
  listEl.querySelectorAll(cardSelector).forEach((card) => {
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
        await onToggleFavorite(btn.closest(cardSelector).dataset.id, !nowFav);
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
