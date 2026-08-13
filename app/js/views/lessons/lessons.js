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
import { navigate } from "../../router.js";
import { listAiGeneratedLessons, listInProgressLessons } from "../../db.js";
import { icon } from "../../icons.js";
import { lessonCardHtml, continueCardHtml, wireLessonCards } from "../../lessonCard.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats, wireBackLink } from "../../header.js";
import { t, registerTranslations } from "../../i18n.js";

registerTranslations({
  "Hội thoại": "Dialogue",
  "Bài đọc": "Reading",
  "Bài học gần đây": "Recent lessons",
  "Chưa có bài hội thoại nào": "No dialogue lessons yet",
  "Chưa có bài đọc nào": "No reading lessons yet",
  "ở cấp độ": "at level",
  "Không tải được danh sách bài học.": "Couldn't load the lesson list.",
  // Nhãn phụ LEVEL_CARDS (2026-08-12, dịch bỏ chữ tiếng Anh viết tắt trong khung tiếng Việt —
  // Minh: "giao diện tiếng Việt không lẫn tiếng Anh trừ từ mượn thông dụng").
  "Sơ cấp": "Begin.",
  "Cơ bản": "Elem.",
  "Trung cấp": "Inter.",
  "Cao trung cấp": "Upper",
  "Cao cấp": "Adv.",
});

const LEVEL_CARDS = [
  { level: "A1", sub: "Sơ cấp", chip: "blue" },
  { level: "A2", sub: "Cơ bản", chip: "green" },
  { level: "B1", sub: "Trung cấp", chip: "purple" },
  { level: "B2", sub: "Cao trung cấp", chip: "orange" },
  { level: "C1", sub: "Cao cấp", chip: "blue" },
];

// Nhớ level đang lọc theo TỪNG loại nội dung (2026-08-09, Đợt 4 mục 11 — Minh: "lần đầu vào mặc
// định A1 (danh sách 'Tất cả' quá dài khi có tới 400 bài), lần sau nhớ level gần nhất") — cùng
// pattern localStorage đơn giản như app/js/palette.js/theme.js/fontSize.js, 2 key riêng vì Bài
// đọc/Hội thoại là 2 màn khác nhau dùng CHUNG file này.
function getLevelPreference(contentType) {
  try {
    return localStorage.getItem(`lea_lessons_level_${contentType}`) || "A1";
  } catch {
    return "A1";
  }
}
function setLevelPreference(contentType, level) {
  try {
    localStorage.setItem(`lea_lessons_level_${contentType}`, level);
  } catch {
    // Lỗi lưu không nên chặn lọc trong phiên hiện tại.
  }
}

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
  const state = { level: getLevelPreference(contentType) };
  const titleText = t(contentType === "dialogue" ? "Hội thoại" : "Bài đọc");

  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(`<span>${titleText}</span>`, undefined, { showBack: true })}

      <div class="level-card-row">
        ${LEVEL_CARDS.map(
          (l) => `
          <button type="button" class="level-card chip-${l.chip} ${state.level === l.level ? "active" : ""}" data-level="${l.level}">
            <span class="level-card-icon">${icon("book-open", { size: 18 })}</span>
            <span class="level-card-name">${l.level}</span>
            <span class="level-card-sub">${t(l.sub)}</span>
          </button>
        `
        ).join("")}
      </div>

      <div id="continue-section" hidden>
        <div class="section-label-row"><span class="section-label-tab">${t("Bài học gần đây")}</span></div>
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
      setLevelPreference(contentType, state.level);
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
    wireLessonCards(scroll, {
      cardSelector: ".continue-card",
      onOpen: (id) => navigate(`/lesson/${id}`),
    });
    section.hidden = false;
  }

  function renderList() {
    const listEl = mount.querySelector("#lessons-list");
    let lessons = allLessons;
    if (state.level !== "all") lessons = lessons.filter((l) => l.level === state.level);
    if (!lessons.length) {
      const base = t(contentType === "dialogue" ? "Chưa có bài hội thoại nào" : "Chưa có bài đọc nào");
      const suffix = state.level !== "all" ? ` ${t("ở cấp độ")} ${state.level}` : "";
      listEl.innerHTML = `<p class="muted">${base}${suffix}.</p>`;
      return;
    }
    listEl.innerHTML = lessons.map((l) => lessonCardHtml(l)).join("");
    wireLessonCards(listEl, { onOpen: (id) => navigate(`/lesson/${id}`) });
  }

  async function load() {
    try {
      // Bộ giáo trình dùng chung mọi tài khoản (2026-08-10, Minh: "tất cả bài học đều hiển thị ở
      // tất cả tài khoản" — không còn lọc theo Chuyên ngành/goal_id của riêng user hiện tại, xem
      // ghi chú đầy đủ ở listAiGeneratedLessons() trong db.js).
      const [lessons, inProgress] = await Promise.all([
        listAiGeneratedLessons({ filter: contentType }),
        listInProgressLessons({ limit: 6 }).catch(() => []),
      ]);
      allLessons = lessons;
      renderContinueSection(inProgress);
      renderList();
    } catch {
      mount.querySelector("#lessons-list").innerHTML = `<p class="error-text">${t("Không tải được danh sách bài học.")}</p>`;
    }
  }

  load();
}
