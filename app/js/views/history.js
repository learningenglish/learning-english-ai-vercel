// app/js/views/history.js — tab "Lịch sử": danh sách bài đã mở, mới nhất trước.
import { navigate } from "../router.js";
import { getHistory } from "../db.js";
import { escapeHtml, formatDate } from "../utils.js";

export function renderHistory(mount) {
  mount.innerHTML = `
    <div class="screen">
      <h1 class="screen-title">Lịch sử học</h1>
      <div id="history-list" class="history-list"><p class="muted">Đang tải...</p></div>
    </div>
  `;
  load();

  async function load() {
    const listEl = mount.querySelector("#history-list");
    try {
      const rows = await getHistory();
      if (!rows.length) {
        listEl.innerHTML = `<p class="muted">Bạn chưa học bài nào.</p>`;
        return;
      }
      listEl.innerHTML = rows
        .map((r) => {
          const lesson = r.lessons;
          const done = !!r.completed_at;
          return `
            <div class="history-item" data-id="${r.lesson_id}">
              <div class="history-status">${done ? "✅" : "📖"}</div>
              <div>
                <div class="history-title">${escapeHtml(lesson?.title_vi || lesson?.title || "(Bài học đã xoá)")}</div>
                <div class="history-date muted">
                  <span class="badge">${escapeHtml(lesson?.level || "")}</span>
                  ${formatDate(r.last_opened_at)} · ${done ? `+${r.xp_earned || 0} XP` : "đang học dở"}
                </div>
              </div>
            </div>
          `;
        })
        .join("");
      listEl.querySelectorAll(".history-item").forEach((item) => {
        item.addEventListener("click", () => navigate(`/lesson/${item.dataset.id}`));
      });
    } catch {
      listEl.innerHTML = `<p class="error-text">Không tải được lịch sử học.</p>`;
    }
  }
}
