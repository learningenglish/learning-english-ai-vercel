// app/js/views/writingArchive.js — nhánh "Luyện viết" dưới Chuyên ngành (2026-08-04, thay chỗ
// tab "Bài viết" trong Yêu thích cũ, đã gỡ — Minh: "Luyện viết có icon Lưu trữ bài Tham khảo, bài
// đã sửa"). Đọc THẲNG writing_favorites qua RLS (đã có sẵn, xem listWritingFavorites() trong
// db.js) — KHÔNG đổi cơ chế lưu (save_writing_favorite trong api/_generate/writing.js), chỉ
// thêm 1 màn liệt kê để xem lại, mở từng mục qua route "/writing-favorite" có sẵn
// (views/writingFavoriteDetail.js).
//
// SỬA 2026-08-06 rồi RÚT LẠI 2026-08-07 (Minh: "Home -> Luyện viết (icon) + -> Luyện viết
// (Không icon). Bị dư thừa") — đợt 08-06 từng đổi màn này thành đích đến CHÍNH của Home (thêm
// nút "+" dẫn qua /writing) — Minh xác nhận không cần, quay lại đúng vai trò "Lưu trữ" phụ ban
// đầu (vào từ icon Lưu trữ trong views/writingPractice.js, opts.archivePath). CHỈ giữ lại phần
// lọc theo goal_id đang active (yêu cầu gốc "Luyện viết -> danh sách của đúng Chuyên ngành" vẫn
// còn hiệu lực — CẦN migration 034_writing_favorites_goal_id.sql đã chạy).
import { navigate } from "../../router.js";
import { listWritingFavorites, getActiveLearningGoal } from "../../db.js";
import { escapeHtml, formatDate } from "../../utils.js";
import { appHeaderHtml, wireAppHeader, wireBackLink } from "../../header.js";
import { t, registerTranslations } from "../../i18n.js";

registerTranslations({
  "Lưu trữ": "Archive",
  "Đang tải...": "Loading...",
  "Chưa lưu bài viết nào.": "No saved writing yet.",
  "Không tải được danh sách đã lưu.": "Couldn't load your saved list.",
  "Bài đã sửa": "Corrected essay",
  "Bài viết hoàn chỉnh": "Polished essay",
  "Bài tham khảo": "Reference essay",
  "Bài viết": "Essay",
});

const KIND_LABELS = {
  detailed: "Bài đã sửa",
  clean_rewrite: "Bài viết hoàn chỉnh",
  reference_essay: "Bài tham khảo",
};

export async function renderWritingArchive(mount) {
  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(t("Lưu trữ"), undefined, { showBack: true })}
      <div id="writing-archive-list"><p class="muted">${t("Đang tải...")}</p></div>
    </div>
  `;
  wireBackLink(mount, () => history.back());
  wireAppHeader(mount);

  const listEl = mount.querySelector("#writing-archive-list");
  try {
    const goal = await getActiveLearningGoal().catch(() => null);
    const rows = await listWritingFavorites({ goalId: goal?.id });
    if (!rows.length) {
      listEl.innerHTML = `<p class="muted">${t("Chưa lưu bài viết nào.")}</p>`;
      return;
    }
    listEl.innerHTML = rows
      .map((r) => {
        const label = t(KIND_LABELS[r.variant] || KIND_LABELS[r.kind] || "Bài viết");
        return `
          <div class="history-item" data-id="${r.id}">
            <div>
              <div class="history-title">${escapeHtml(label)}${r.task?.genre_vi ? ` — ${escapeHtml(t(r.task.genre_vi))}` : ""}</div>
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
    listEl.innerHTML = `<p class="error-text">${t("Không tải được danh sách đã lưu.")}</p>`;
  }
}
