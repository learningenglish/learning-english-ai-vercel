// app/js/views/lessons.js — nhánh "Bài học"/"Hội thoại" dưới Chuyên ngành (2026-08-06, VIẾT LẠI
// HOÀN TOÀN theo yêu cầu tái cấu trúc — Minh: "Chuyên ngành (đã chọn, khoá 1 vị trí active) ->
// Bài học -> theo Level (A1-C1) -> danh sách bài / Hội thoại -> theo Level -> danh sách bài").
//
// Bản GỐC (mode "main"/"favorite"/"library", carousel Lĩnh vực, tab Tin tức, Quick Actions...) đã
// LƯU TRỮ nguyên vẹn ở _archive/old-nav/lessons.js — file này KHÔNG còn khớp cây cấu trúc mới:
// - "Yêu thích"/"Thư viện AI" (mode "favorite"/"library"): route đã gỡ từ trước (app.js), không
//   ai gọi renderLessons() với params đó nữa — bỏ hẳn khỏi file, không cần giữ nhánh chết.
// - "Tin tức" (Phổ biến): loại bỏ hoàn toàn khỏi luồng đang chạy theo yêu cầu Minh, xem
//   _archive/news-feature/ + docs/NHAT-KY-LAM-VIEC.md mục 2026-08-06.
// - Carousel "Lĩnh vực": vô nghĩa khi chỉ còn ĐÚNG 1 Chuyên ngành active tại 1 thời điểm.
//
// Route MỚI: "/lessons/:contentType" (contentType = "reading" | "dialogue", mặc định "reading")
// — CHỈ 1 chế độ, luôn lọc theo goal_id của Chuyên ngành ĐANG ACTIVE (bài goal_id=null CŨ, sinh
// trước khi có hệ thống Chuyên ngành, vẫn hiện — xem chính sách "goal_id khớp HOẶC null" trong
// db.js::listAiGeneratedLessons()).
import { navigate } from "../router.js";
import { listAiGeneratedLessons, listInProgressLessons, getActiveLearningGoal, setLessonFavorite } from "../db.js";
import { icon } from "../icons.js";
import { lessonCardHtml, continueCardHtml, wireLessonCards } from "../lessonCard.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats, wireBackLink } from "../header.js";

const LEVEL_CARDS = [
  { level: "A1", sub: "Begin.", chip: "blue" },
  { level: "A2", sub: "Elem.", chip: "green" },
  { level: "B1", sub: "Inter.", chip: "purple" },
  { level: "B2", sub: "Upper", chip: "orange" },
  { level: "C1", sub: "Adv.", chip: "blue" },
];

// Khung "xương" (skeleton) thay cho dòng chữ "Đang tải..." — TÁI DÙNG nguyên hình dạng từ bản
// gốc (cùng lý do: tránh giật bố cục khi dữ liệu về, xem _archive/old-nav/lessons.js).
function skeletonListHtml(count = 3) {
  return Array.from(
    { length: count },
    () => `
    <div class="lesson-card lesson-card-skeleton">
      <div class="lesson-card-cover skeleton-shimmer"></div>
      <div class="lesson-card-body">
        <div class="skeleton-line skeleton-shimmer" style="width:70%;height:14px;margin-bottom:8px"></div>
        <div class="skeleton-line skeleton-shimmer" style="width:45%;height:11px;margin-bottom:8px"></div>
        <div class="skeleton-line skeleton-shimmer" style="width:30%;height:11px"></div>
      </div>
    </div>
  `
  ).join("");
}

export function renderLessons(mount, params) {
  const contentType = params?.[0] === "dialogue" ? "dialogue" : "reading";
  const state = { level: "all" };
  const titleText = contentType === "dialogue" ? "Hội thoại" : "Bài đọc";

  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(`<span>${titleText}</span>`, undefined, { showBack: true })}

      <div class="level-card-row">
        ${LEVEL_CARDS.map(
          (l) => `
          <button type="button" class="level-card chip-${l.chip} ${state.level === l.level ? "active" : ""}" data-level="${l.level}">
            <span class="level-card-icon">${icon("book-open", { size: 18 })}</span>
            <span class="level-card-name">${l.level}</span>
            <span class="level-card-sub">${l.sub}</span>
          </button>
        `
        ).join("")}
      </div>

      <div id="continue-section" hidden>
        <div class="section-label-row"><span class="section-label-tab">Bài học gần đây</span></div>
        <div id="continue-scroll" class="continue-scroll"></div>
      </div>

      <div id="lessons-list" class="lessons-list">${skeletonListHtml()}</div>
    </div>
  `;

  wireAppHeader(mount);
  wireBackLink(mount, () => navigate("/home"));
  loadAppHeaderStats(mount);

  mount.querySelectorAll(".level-card").forEach((card) => {
    card.addEventListener("click", () => {
      const lv = card.dataset.level;
      state.level = state.level === lv ? "all" : lv;
      mount.querySelectorAll(".level-card").forEach((c) => c.classList.toggle("active", c.dataset.level === state.level));
      renderList();
    });
  });

  let allLessons = [];

  function renderContinueSection(lessons) {
    const section = mount.querySelector("#continue-section");
    const inType = lessons.filter((l) => l.content_type === contentType);
    if (!inType.length) {
      section.hidden = true;
      return;
    }
    const scroll = mount.querySelector("#continue-scroll");
    scroll.innerHTML = inType.map(continueCardHtml).join("");
    // continueCardHtml() LUÔN vẽ sẵn nút tim (không có tuỳ chọn ẩn như lessonCardHtml) — không
    // còn màn "Yêu thích" riêng để XEM LẠI danh sách đã tim, nhưng bấm tim ở đây vẫn phải THẬT
    // (gọi setLessonFavorite thật) thay vì no-op giả vờ thành công, tránh nút "nói dối" người
    // dùng — is_favorite vẫn còn nguyên trên schema, chỉ không có nơi duyệt riêng nữa.
    wireLessonCards(scroll, {
      cardSelector: ".continue-card",
      onOpen: (id) => navigate(`/lesson/${id}`),
      onToggleFavorite: (id, nextFav) => setLessonFavorite(id, nextFav),
    });
    section.hidden = false;
  }

  function renderList() {
    const listEl = mount.querySelector("#lessons-list");
    let lessons = allLessons;
    if (state.level !== "all") lessons = lessons.filter((l) => l.level === state.level);
    if (!lessons.length) {
      listEl.innerHTML = `<p class="muted">Chưa có bài ${contentType === "dialogue" ? "hội thoại" : "đọc"} nào${
        state.level !== "all" ? ` ở cấp độ ${state.level}` : ""
      }.</p>`;
      return;
    }
    listEl.innerHTML = lessons.map((l) => lessonCardHtml(l, { hideFavorite: true })).join("");
    wireLessonCards(listEl, { onOpen: (id) => navigate(`/lesson/${id}`) });
  }

  async function load() {
    try {
      const goal = await getActiveLearningGoal().catch(() => null);
      const goalId = goal?.id || null;
      const [lessons, inProgress] = await Promise.all([
        listAiGeneratedLessons({ filter: contentType, goalId }),
        listInProgressLessons({ limit: 6, goalId }).catch(() => []),
      ]);
      allLessons = lessons;
      renderContinueSection(inProgress);
      renderList();
    } catch {
      mount.querySelector("#lessons-list").innerHTML = `<p class="error-text">Không tải được danh sách bài học.</p>`;
    }
  }

  load();
}
