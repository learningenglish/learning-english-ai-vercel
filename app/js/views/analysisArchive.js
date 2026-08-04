// app/js/views/analysisArchive.js — "Lưu trữ" CỤC BỘ cho Phân tích (2026-08-04, thay chỗ tab
// "Phân tích" trong Thư viện AI cũ, đã gỡ — Minh: "Bài sinh phân tích sẽ có icon Lưu trữ trong
// Phân tích"). Đọc THẲNG lessons có source='user_text' (đã có sẵn, xem listTextAnalyzedLessons()
// trong db.js — kết quả của createFromText.js) — KHÔNG đổi cơ chế phân tích/lưu, chỉ thêm 1 màn
// liệt kê lại, mở từng bài qua route "/lesson" có sẵn.
import { navigate } from "../router.js";
import { listTextAnalyzedLessons } from "../db.js";
import { icon } from "../icons.js";
import { lessonCardHtml, wireLessonCards } from "../lessonCard.js";
import { appHeaderHtml, wireAppHeader, wireBackLink } from "../header.js";

export async function renderAnalysisArchive(mount) {
  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(`${icon("bookmark", { size: 22 })} Lưu trữ`, {}, { showBack: true })}
      <div id="analysis-archive-list" class="lessons-list"><p class="muted">Đang tải...</p></div>
    </div>
  `;
  wireBackLink(mount, () => history.back());
  wireAppHeader(mount);

  const listEl = mount.querySelector("#analysis-archive-list");
  try {
    const rows = await listTextAnalyzedLessons();
    if (!rows.length) {
      listEl.innerHTML = `<p class="muted">Chưa có bài phân tích nào được lưu.</p>`;
      return;
    }
    listEl.innerHTML = rows.map((l) => lessonCardHtml(l, { hideFavorite: true })).join("");
    wireLessonCards(listEl, { onOpen: (id) => navigate(`/lesson/${id}`) });
  } catch {
    listEl.innerHTML = `<p class="error-text">Không tải được danh sách đã lưu.</p>`;
  }
}
