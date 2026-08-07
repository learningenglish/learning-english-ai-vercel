// app/js/views/analysisArchive.js — nhánh "Phân tích" dưới Chuyên ngành (2026-08-04, thay chỗ
// tab "Phân tích" trong Thư viện AI cũ, đã gỡ — Minh: "Bài sinh phân tích sẽ có icon Lưu trữ
// trong Phân tích"). Đọc THẲNG lessons có source='user_text' (đã có sẵn, xem
// listTextAnalyzedLessons() trong db.js — kết quả của createFromText.js) — KHÔNG đổi cơ chế
// phân tích/lưu, chỉ thêm 1 màn liệt kê lại, mở từng bài qua route "/lesson" có sẵn.
//
// SỬA 2026-08-06 (tái cấu trúc theo cây mới, Minh: "Phân tích -> danh sách nội dung đã phân
// tích", CỦA ĐÚNG Chuyên ngành đang active) — trước đây liệt kê TOÀN BỘ không phân biệt Chuyên
// ngành nào; giờ lọc theo goal_id đang active (kèm chính sách "goal_id null cũng hiện", xem ghi
// chú listTextAnalyzedLessons() trong db.js). Đây giờ là ĐÍCH ĐẾN CHÍNH của nhánh "Phân tích" ở
// Home (trước đây Home trỏ thẳng "/create-text", màn này chỉ là "Lưu trữ" phụ) — thêm nút "+"
// header dẫn tới "/create-text" để phân tích văn bản mới.
import { navigate } from "../router.js";
import { listTextAnalyzedLessons, getActiveLearningGoal } from "../db.js";
import { icon } from "../icons.js";
import { lessonCardHtml, wireLessonCards } from "../lessonCard.js";
import { appHeaderHtml, wireAppHeader, wireBackLink } from "../header.js";

export async function renderAnalysisArchive(mount) {
  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(`${icon("flask", { size: 22 })} Phân tích`, {}, { showBack: true, createPath: "/create-text" })}
      <div id="analysis-archive-list" class="lessons-list"><p class="muted">Đang tải...</p></div>
    </div>
  `;
  wireBackLink(mount, () => navigate("/home"));
  wireAppHeader(mount);

  const listEl = mount.querySelector("#analysis-archive-list");
  try {
    const goal = await getActiveLearningGoal().catch(() => null);
    const rows = await listTextAnalyzedLessons({ goalId: goal?.id });
    if (!rows.length) {
      listEl.innerHTML = `<p class="muted">Chưa có bài phân tích nào. Bấm "+" ở góc trên để phân tích văn bản mới.</p>`;
      return;
    }
    listEl.innerHTML = rows.map((l) => lessonCardHtml(l, { hideFavorite: true })).join("");
    wireLessonCards(listEl, { onOpen: (id) => navigate(`/lesson/${id}`) });
  } catch {
    listEl.innerHTML = `<p class="error-text">Không tải được danh sách đã lưu.</p>`;
  }
}
