// app/js/views/mentor.js — màn "Mentor AI" (Đợt 3), thay hẳn màn "Tạo bài học" cũ sau nút (+)
// ở bottom nav. Đầu màn: thẻ đạo diễn (lớp Lời thoại, dựng sẵn ở backend, hiện NGAY không
// chờ AI — xem api/_generate/mentor.js). Dưới thẻ: lưới Thư Viện AI, giao diện dùng CHUNG
// component thẻ với tab "Bài học" (xem lessonCard.js), chỉ khác nguồn dữ liệu (goal_id NOT
// NULL) và có nhóm theo tên mục tiêu. Nút (+) nổi TRONG màn này (khác nút (+) ở bottom nav —
// đó là nút ĐI ĐẾN màn này) mở luồng tạo mục tiêu mới (views/mentorGoal.js).
import { navigate } from "../router.js";
import { listMentorLibraryLessons, listLearningGoals, setLessonFavorite } from "../db.js";
import { getMentorAction, generateNextLessonForGoal } from "../mentorApi.js";
import { fetchAndSaveLessonCover } from "../lessonApi.js";
import { escapeHtml } from "../utils.js";
import { icon } from "../icons.js";
import { lessonCardHtml, wireLessonCards } from "../lessonCard.js";

export function renderMentorHub(mount) {
  const state = { contentType: "reading", favoriteOnly: false };

  mount.innerHTML = `
    <div class="screen">
      <h1 class="screen-title">Mentor AI</h1>
      <div id="director-card-slot"><div class="card director-card director-card-loading"><div class="spinner spinner-sm"></div> Đang xem tình hình học của bạn...</div></div>

      <div class="content-tabs" role="tablist">
        <button type="button" class="content-tab-btn active" data-type="reading">${icon("book", { size: 17 })} Bài đọc</button>
        <button type="button" class="content-tab-btn" data-type="dialogue">${icon("message-circle", { size: 17 })} Hội thoại</button>
        <button type="button" class="content-tab-btn" data-type="favorite">${icon("heart", { size: 17 })} Yêu thích</button>
      </div>

      <div id="mentor-library" class="lessons-list"><p class="muted">Đang tải...</p></div>
    </div>
    <button type="button" class="fab-inscreen" id="mentor-new-goal-btn" aria-label="Tạo mục tiêu mới">${icon("plus", { size: 26 })}</button>
  `;

  mount.querySelector("#mentor-new-goal-btn").addEventListener("click", () => navigate("/mentor-goal"));

  mount.querySelectorAll(".content-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      mount.querySelectorAll(".content-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.favoriteOnly = btn.dataset.type === "favorite";
      state.contentType = state.favoriteOnly ? state.contentType : btn.dataset.type;
      renderLibrary(mount, state);
    });
  });

  loadDirectorCard(mount);
  renderLibrary(mount, state);
}

async function loadDirectorCard(mount) {
  const slot = mount.querySelector("#director-card-slot");
  try {
    const res = await getMentorAction();
    if (!res.ok) {
      slot.innerHTML = "";
      return;
    }
    slot.innerHTML = directorCardHtml(res.data.card);
    wireDirectorCard(mount, slot, res.data.card);
  } catch {
    slot.innerHTML = "";
  }
}

function directorCardHtml(card) {
  return `
    <div class="card director-card">
      <div class="director-card-title">${escapeHtml(card.title)}</div>
      <div class="director-card-body">${escapeHtml(card.body)}</div>
      <div class="director-card-actions">
        <button type="button" class="btn btn-primary" id="director-primary-btn">${escapeHtml(card.primary.label)}</button>
        ${card.secondary ? `<button type="button" class="btn btn-ghost" id="director-secondary-btn">${escapeHtml(card.secondary.label)}</button>` : ""}
      </div>
    </div>
  `;
}

function wireDirectorCard(mount, slot, card) {
  slot.querySelector("#director-primary-btn").addEventListener("click", (e) => runDirectorAction(mount, e.target, card.primary));
  slot.querySelector("#director-secondary-btn")?.addEventListener("click", (e) => runDirectorAction(mount, e.target, card.secondary));
}

async function runDirectorAction(mount, btn, action) {
  if (action.kind === "open_lesson") return navigate(`/lesson/${action.lessonId}`);
  if (action.kind === "open_goal_flow") return navigate("/mentor-goal");
  if (action.kind === "open_hub") {
    if (action.goalId) mount.querySelector(`[data-goal-id="${action.goalId}"]`)?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  if (action.kind === "next_lesson") {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Đang chuẩn bị bài học...";
    const res = await generateNextLessonForGoal(action.goalId);
    if (!res.ok) {
      btn.disabled = false;
      btn.textContent = original;
      alert(res.error || "Không tạo được bài học, thử lại sau.");
      return;
    }
    fetchAndSaveLessonCover(res.data.lesson);
    navigate(`/lesson/${res.data.lesson.id}`);
  }
}

async function renderLibrary(mount, state) {
  const listEl = mount.querySelector("#mentor-library");
  listEl.innerHTML = `<p class="muted">Đang tải...</p>`;
  try {
    const filter = state.favoriteOnly ? "favorite" : state.contentType;
    const [lessons, goals] = await Promise.all([listMentorLibraryLessons({ filter }), listLearningGoals()]);
    const filtered = state.favoriteOnly && state.contentType ? lessons.filter((l) => l.content_type === state.contentType) : lessons;
    if (!filtered.length) {
      listEl.innerHTML = `<p class="muted">Chưa có bài học nào trong Thư Viện AI. Bấm nút (+) để tạo mục tiêu học đầu tiên.</p>`;
      return;
    }
    const goalTitleById = new Map(goals.map((g) => [g.id, g.title]));
    const groups = new Map(); // goal_id -> lessons[]
    for (const l of filtered) {
      const key = l.goal_id || "_";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    }
    listEl.innerHTML = Array.from(groups.entries())
      .map(([goalId, items]) => {
        const title = goalTitleById.get(goalId) || "Bài học AI";
        return `
          <div class="mentor-goal-group" data-goal-id="${escapeHtml(goalId)}">
            <div class="mentor-goal-group-title">${escapeHtml(title)}</div>
            ${items.map(lessonCardHtml).join("")}
          </div>
        `;
      })
      .join("");
    wireLessonCards(listEl, {
      onOpen: (id) => navigate(`/lesson/${id}`),
      onToggleFavorite: async (id, nextFav) => {
        await setLessonFavorite(id, nextFav);
        if (state.favoriteOnly) renderLibrary(mount, state); // bỏ tim ở tab Yêu thích -> biến mất khỏi danh sách
      },
    });
  } catch {
    listEl.innerHTML = `<p class="error-text">Không tải được Thư Viện AI.</p>`;
  }
}
