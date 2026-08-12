// app/js/lessonCard.js — thẻ danh sách bài học DÙNG CHUNG cho tab "Bài học" (views/lessons.js)
// và lưới thư viện Mentor AI cá nhân hoá cũ (ĐÃ ARCHIVE 2026-08-11, xem
// _archive/mentor-ai-personal-flow/) — Đợt 3 mục 6.1 yêu cầu lưới Thư Viện AI "giao diện giống
// hệt tab Phổ biến", nên tách hàm ra đây thay vì viết lại lần 2.
import { escapeHtml, formatDate } from "./utils.js";
import { icon } from "./icons.js";
import { computeLearnStatus } from "./db.js";
import { t, registerTranslations } from "./i18n.js";

registerTranslations({
  "Chưa học": "Not learned",
  "Đã học": "Learned",
  "Đã dừng": "Stopped",
});

// "Đã học/Chưa học" (2026-08-04, Phần A4 — RÚT GỌN 2026-08-04 lần 2, Minh: "chỉ để Đã học
// (nghe hết audio tổng) và Chưa học") — bỏ hẳn nhãn "Đang học" riêng (gộp chung vào "Chưa học"
// trên thẻ danh sách, dữ liệu "đang học dở" thật vẫn còn nguyên trong lesson_progress, chỉ
// không tách nhãn riêng ở đây nữa) — chỉ vẽ badge khi lesson có nhúng sẵn lesson_progress (xem
// PROGRESS_EMBED trong db.js).
function learnStatusBadgeHtml(l) {
  if (!("lesson_progress" in l)) return "";
  const done = computeLearnStatus(l) === "done";
  if (!done) return `<span class="learn-status-badge learn-status-not-started">${t("Chưa học")}</span>`;
  return `<span class="learn-status-badge learn-status-done">${icon("check-circle", { size: 12 })} ${t("Đã học")}</span>`;
}

// Trích đoạn hiện ở thẻ: ưu tiên NỘI DUNG THẬT (câu/đoạn đầu bài) — "situation" chỉ dùng khi
// bài cũ chưa có "content" (không nên xảy ra với dữ liệu hiện tại, chỉ là lớp phòng hờ).
export function lessonCardExcerpt(l) {
  const first = (l.content || [])[0];
  if (first?.translation) return first.translation;
  if (first?.text) return first.text;
  return l.situation || "";
}

// BỎ ngày tạo + nhãn lĩnh vực khỏi meta (2026-08-04, Minh: "chủ đề được sinh trước nên card
// không cần đề ngày và lĩnh vực nữa, chỉ để Đã học/Chưa học") — CHỈ còn badge level + trạng
// thái học, xem learnStatusBadgeHtml() ở trên.
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
          ${Number.isInteger(l.spine_slot) ? `<span class="badge badge-slot">#${l.spine_slot}</span>` : ""}
          <span class="badge">${escapeHtml(l.level)}</span>
          ${learnStatusBadgeHtml(l)}
        </div>
      </div>
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
// (yêu cầu người dùng "giống bài đang đọc"). "coverImageUrl" (2026-07-29, Minh phản hồi thật:
// nền màu đặc trơn khiến thẻ "nhìn to/trống" dù ĐÃ cùng kích thước .continue-card) — dùng lại
// ẢNH BÌA của 1 BÀI BẤT KỲ trong nhóm lĩnh vực đó (đã có sẵn từ lúc tạo bài, không tốn thêm 1
// lượt tìm ảnh riêng) làm nền, cùng kiểu phủ mờ+tối ở đáy như .continue-card — nhóm nào chưa có
// bài nào có ảnh bìa thì rơi về nền gradient cũ (fallback). "active" -> đang được chọn làm bộ
// lọc (viền trắng nổi bật), xem views/lessons.js::state.industry. "archived" (2026-07-28, "giới
// hạn 5 lĩnh vực + Thư mục AI") -> nhóm này thuộc 1 learning_goals đã archived (người dùng đã
// đổi sang lộ trình khác) — gắn nhãn "Đã dừng" để phân biệt với lĩnh vực đang active, KHÔNG
// ẩn/xoá gì, bài vẫn xem/lọc được bình thường.
export function industryCardHtml(name, count, active, archived, coverImageUrl) {
  return `
    <div class="industry-card ${active ? "active" : ""}" data-industry="${escapeHtml(name)}" ${
    coverImageUrl ? `style="background-image:url('${escapeHtml(coverImageUrl)}')"` : ""
  }>
      ${!coverImageUrl ? '<div class="industry-card-fallback-bg"></div>' : ""}
      <div class="industry-card-overlay"></div>
      ${archived ? `<span class="industry-card-archived-badge">${t("Đã dừng")}</span>` : ""}
      <div class="industry-card-body">
        <div class="industry-card-count">${count}</div>
        <div class="industry-card-name">${escapeHtml(name)}</div>
      </div>
    </div>
  `;
}

// onOpen(lessonId) -> Promise — người gọi tự lo điều hướng. "cardSelector" cho phép dùng chung
// hàm này cho cả thẻ danh sách thường (.lesson-card) lẫn thẻ carousel "BÀI ĐANG ĐỌC"
// (.continue-card, xem continueCardHtml() ở trên) — chỉ khác class bọc ngoài.
export function wireLessonCards(listEl, { onOpen, cardSelector = ".lesson-card" }) {
  listEl.querySelectorAll(cardSelector).forEach((card) => {
    card.addEventListener("click", () => onOpen(card.dataset.id));
  });
}
