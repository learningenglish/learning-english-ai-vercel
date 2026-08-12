// app/js/views/analysisArchive.js — "Lưu trữ" CỤC BỘ cho Phân tích (2026-08-04, thay chỗ tab
// "Phân tích" trong Thư viện AI cũ, đã gỡ — Minh: "Bài sinh phân tích sẽ có icon Lưu trữ trong
// Phân tích"). Đọc THẲNG lessons có source='user_text' (đã có sẵn, xem listTextAnalyzedLessons()
// trong db.js — kết quả của createFromText.js) — KHÔNG đổi cơ chế phân tích/lưu, chỉ thêm 1 màn
// liệt kê lại, mở từng bài qua route "/lesson" có sẵn. Vào từ icon Lưu trữ trong
// views/createFromText.js (opts.archivePath), KHÔNG phải đích đến trực tiếp từ Home.
//
// SỬA 2026-08-06 rồi RÚT LẠI 2026-08-07 (Minh: "Tôi không hề yêu cầu tách thành luồng dấu +...
// Home -> Phân tích -> + -> Văn bản. Bị dư thừa") — đợt 08-06 từng đổi màn này thành đích đến
// CHÍNH của Home (thêm nút "+" dẫn qua create-text) — Minh xác nhận không cần, quay lại đúng vai
// trò "Lưu trữ" phụ ban đầu. CHỈ giữ lại phần lọc theo goal_id đang active (v.v yêu cầu gốc "Phân
// tích -> danh sách nội dung đã phân tích của đúng Chuyên ngành" vẫn còn hiệu lực).
import { navigate } from "../../router.js";
import { listTextAnalyzedLessons, getActiveLearningGoal } from "../../db.js";
import { lessonCardHtml, wireLessonCards } from "../../lessonCard.js";
import { appHeaderHtml, wireAppHeader, wireBackLink } from "../../header.js";

export async function renderAnalysisArchive(mount) {
  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(`Lưu trữ`, undefined, { showBack: true })}
      <div id="analysis-archive-list" class="lessons-list"><p class="muted">Đang tải...</p></div>
    </div>
  `;
  wireBackLink(mount, () => history.back());
  wireAppHeader(mount);

  const listEl = mount.querySelector("#analysis-archive-list");
  try {
    const goal = await getActiveLearningGoal().catch(() => null);
    const rows = await listTextAnalyzedLessons({ goalId: goal?.id });
    if (!rows.length) {
      listEl.innerHTML = `<p class="muted">Chưa có bài phân tích nào được lưu.</p>`;
      return;
    }
    listEl.innerHTML = rows.map((l) => lessonCardHtml(l)).join("");
    wireLessonCards(listEl, { onOpen: (id) => navigate(`/lesson/${id}`) });
  } catch {
    listEl.innerHTML = `<p class="error-text">Không tải được danh sách đã lưu.</p>`;
  }
}
