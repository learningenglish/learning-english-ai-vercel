// app/js/views/writingArchive.js — nhánh "Luyện viết" dưới Chuyên ngành (2026-08-04, thay chỗ
// tab "Bài viết" trong Yêu thích cũ, đã gỡ — Minh: "Luyện viết có icon Lưu trữ bài Tham khảo, bài
// đã sửa"). Đọc THẲNG writing_favorites qua RLS (đã có sẵn, xem listWritingFavorites() trong
// db.js) — KHÔNG đổi cơ chế lưu (save_writing_favorite trong api/_generate/writing.js), chỉ
// thêm 1 màn liệt kê để xem lại, mở từng mục qua route "/writing-favorite" có sẵn
// (views/writingFavoriteDetail.js).
//
// SỬA 2026-08-06 (tái cấu trúc theo cây mới, Minh: "Luyện viết -> danh sách nội dung đã luyện
// viết", CỦA ĐÚNG Chuyên ngành đang active) — lọc theo goal_id đang active (kèm chính sách
// "goal_id null cũng hiện", xem ghi chú listWritingFavorites() trong db.js — CẦN migration
// 034_writing_favorites_goal_id.sql đã chạy). Đây giờ là ĐÍCH ĐẾN CHÍNH của nhánh "Luyện viết" ở
// Home (trước đây Home trỏ thẳng "/writing", màn này chỉ là "Lưu trữ" phụ) — thêm nút "+" header
// dẫn tới "/writing" để luyện viết bài mới.
import { navigate } from "../router.js";
import { listWritingFavorites, getActiveLearningGoal } from "../db.js";
import { escapeHtml, formatDate } from "../utils.js";
import { icon } from "../icons.js";
import { appHeaderHtml, wireAppHeader, wireBackLink } from "../header.js";

const KIND_LABELS = {
  detailed: "Bài đã sửa",
  clean_rewrite: "Bài viết hoàn chỉnh",
  reference_essay: "Bài tham khảo",
};

export async function renderWritingArchive(mount) {
  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(`${icon("edit-3", { size: 22 })} Luyện viết`, {}, { showBack: true, createPath: "/writing" })}
      <div id="writing-archive-list"><p class="muted">Đang tải...</p></div>
    </div>
  `;
  wireBackLink(mount, () => navigate("/home"));
  wireAppHeader(mount);

  const listEl = mount.querySelector("#writing-archive-list");
  try {
    const goal = await getActiveLearningGoal().catch(() => null);
    const rows = await listWritingFavorites({ goalId: goal?.id });
    if (!rows.length) {
      listEl.innerHTML = `<p class="muted">Chưa lưu bài viết nào. Bấm "+" ở góc trên để bắt đầu luyện viết.</p>`;
      return;
    }
    listEl.innerHTML = rows
      .map((r) => {
        const label = KIND_LABELS[r.variant] || KIND_LABELS[r.kind] || "Bài viết";
        return `
          <div class="history-item" data-id="${r.id}">
            <div class="history-status">${icon("edit-3", { size: 22 })}</div>
            <div>
              <div class="history-title">${escapeHtml(label)}${r.task?.genre_vi ? ` — ${escapeHtml(r.task.genre_vi)}` : ""}</div>
              <div class="history-date muted">
                <span class="badge">${escapeHtml(r.level)}</span>
                ${formatDate(r.created_at)}${Number.isFinite(r.overall_score) ? ` · ${r.overall_score}/100` : ""}
              </div>
            </div>
          </div>
        `;
      })
      .join("");
    listEl.querySelectorAll(".history-item").forEach((item) => {
      item.addEventListener("click", () => navigate(`/writing-favorite/${item.dataset.id}`));
    });
  } catch {
    listEl.innerHTML = `<p class="error-text">Không tải được danh sách đã lưu.</p>`;
  }
}
