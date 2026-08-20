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
import { listAiGeneratedLessons, listInProgressLessons, getActiveLearningGoal } from "../../db.js";
import { listLessonPreviews } from "../../lessonApi.js";
import { icon } from "../../icons.js";
import { lessonCardHtml, lockedLessonCardHtml, continueCardHtml, wireLessonCards } from "../../lessonCard.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats, wireBackLink } from "../../header.js";
import { showToast } from "../../toast.js";
import { t, registerTranslations } from "../../i18n.js";

registerTranslations({
  "Hội thoại": "Dialogue",
  "Bài đọc": "Reading",
  "Bài học gần đây": "Recent lessons",
  "Chưa có bài hội thoại nào": "No dialogue lessons yet",
  "Chưa có bài đọc nào": "No reading lessons yet",
  "ở cấp độ": "at level",
  "Không tải được danh sách bài học.": "Couldn't load the lesson list.",
  "Sắp ra mắt": "Coming soon",
  "Cấp độ này sắp ra mắt, chưa có bài nào để học.": "This level is coming soon, no lessons yet.",
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
const VALID_LEVEL_FILTERS = new Set(["A1", "A2", "B1", "B2", "C1"]);
// SỬA 2026-08-13 (Minh: "nếu không nhấn level nào thì luôn mặc định mở A1 — không để như hiện
// tại là tôi có thể tắt A1 và toàn bộ bài đều hiển thị") — TRƯỚC ĐÂY có thể lưu "all" (bấm lại
// đúng level đang chọn để "tắt" lọc, xem wire() bên dưới, đã BỎ hành vi đó) — "all" cũ có thể
// vẫn còn tồn trong localStorage từ trước khi sửa, PHẢI tự coi là không hợp lệ, rơi về "A1".
function getLevelPreference(contentType) {
  try {
    const saved = localStorage.getItem(`lea_lessons_level_${contentType}`);
    return VALID_LEVEL_FILTERS.has(saved) ? saved : "A1";
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
  // "levelsWithContent" (2026-08-20, Minh: "Chưa có bài hội thoại ở B2, C1 thì dùng khóa: đồng
  // thời B2 và C1 thêm dòng sắp ra mắt. Click không vào... Không cho truy cập vào") — null nghĩa
  // là CHƯA BIẾT (chưa tải xong dữ liệu), tính thật SAU load() từ CHÍNH dữ liệu đã có (allLessons+
  // allPreviews, xem bên dưới) — KHÔNG hard-code cứng B2/C1, để tự cập nhật khi sau này có bài
  // thật cho các cấp đó, không cần sửa lại code.
  const state = { level: getLevelPreference(contentType), levelsWithContent: null };
  const titleText = t(contentType === "dialogue" ? "Hội thoại" : "Bài đọc");

  function levelCardRowHtml() {
    return LEVEL_CARDS.map((l) => {
      const noContent = state.levelsWithContent && !state.levelsWithContent.has(l.level);
      return `
        <button type="button" class="level-card chip-${l.chip} ${state.level === l.level ? "active" : ""} ${noContent ? "is-coming-soon" : ""}" data-level="${l.level}">
          <span class="level-card-icon">${icon(noContent ? "lock" : "book-open", { size: 18 })}</span>
          <span class="level-card-name">${l.level}</span>
          <span class="level-card-sub">${noContent ? t("Sắp ra mắt") : t(l.sub)}</span>
        </button>
      `;
    }).join("");
  }

  function wireLevelCards() {
    mount.querySelectorAll(".level-card").forEach((card) => {
      card.addEventListener("click", () => {
        const lv = card.dataset.level;
        if (state.levelsWithContent && !state.levelsWithContent.has(lv)) {
          showToast(t("Cấp độ này sắp ra mắt, chưa có bài nào để học."));
          return;
        }
        // KHÔNG còn "tắt" level đang chọn để hiện "Tất cả" (2026-08-13, Minh: "không để như hiện
        // tại là tôi có thể tắt A1 và toàn bộ bài đều hiển thị") — bấm lại đúng level đang active
        // thì giữ nguyên, chỉ đổi khi bấm 1 level KHÁC.
        if (state.level === lv) return;
        state.level = lv;
        setLevelPreference(contentType, state.level);
        mount.querySelectorAll(".level-card").forEach((c) => c.classList.toggle("active", c.dataset.level === state.level));
        renderList();
      });
    });
  }

  mount.innerHTML = `
    <div class="screen lessons-screen">
      ${appHeaderHtml(`<span>${titleText}</span>`, undefined, { showBack: true })}

      <div class="level-card-row" id="level-card-row">${levelCardRowHtml()}</div>

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
  wireLevelCards();

  let allLessons = [];
  // "allPreviews" (2026-08-20, Minh: "các bài khác phải hiển thị nhưng khóa và để icon khóa") —
  // SIÊU TẬP metadata mọi bài ai_generated khớp industry+content_type (bất kể gói, service role
  // bỏ qua RLS, xem list_lesson_previews() trong lesson.js) — dùng để vẽ thẻ khoá cho bài NGOÀI
  // hạn mức gói Free, vốn đã bị RLS ẩn hoàn toàn khỏi "allLessons" ở trên.
  let allPreviews = [];

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
    // "state.level" LUÔN là 1 trong 5 cấp độ hợp lệ (không còn "all" — xem getLevelPreference()/
    // wire() phía trên) — luôn lọc, không còn nhánh "hiện hết".
    const lessons = allLessons.filter((l) => l.level === state.level);
    const previews = allPreviews.filter((p) => p.level === state.level);
    if (!lessons.length && !previews.length) {
      const base = t(contentType === "dialogue" ? "Chưa có bài hội thoại nào" : "Chưa có bài đọc nào");
      const suffix = ` ${t("ở cấp độ")} ${state.level}`;
      listEl.innerHTML = `<p class="muted">${base}${suffix}.</p>`;
      return;
    }
    // Duyệt THEO THỨ TỰ "previews" (server đã sắp spine_slot) làm khung chính — bài nào ĐÃ mở
    // (RLS cho qua, có mặt trong "lessons") render thẻ thường, bài nào KHÔNG (Free vượt hạn mức)
    // render thẻ khoá — giữ ĐÚNG vị trí trong khung giáo trình thay vì dồn hết bài khoá xuống cuối.
    const unlockedById = new Map(lessons.map((l) => [l.id, l]));
    const coveredIds = new Set();
    const cardsHtml = previews.map((p) => {
      coveredIds.add(p.id);
      const full = unlockedById.get(p.id);
      return full ? lessonCardHtml(full) : lockedLessonCardHtml(p);
    });
    // Bài ĐÃ mở nhưng không khớp preview nào (hiếm — vd lệch industry/content_type do dữ liệu cũ)
    // — vẫn hiện, nối cuối, không để mất bài khỏi danh sách.
    lessons.forEach((l) => {
      if (!coveredIds.has(l.id)) cardsHtml.push(lessonCardHtml(l));
    });
    listEl.innerHTML = cardsHtml.join("");
    // "cardSelector" loại trừ thẻ khoá — locked card CỐ Ý dùng chung class ".lesson-card" (đồng bộ
    // khung/kích thước) nhưng KHÔNG được bấm mở (không có data-id để mở đúng bài, thẻ khoá không
    // dẫn đi đâu cả).
    wireLessonCards(listEl, { onOpen: (id) => navigate(`/lesson/${id}`), cardSelector: ".lesson-card:not(.lesson-card-locked)" });
  }

  async function load() {
    try {
      // Bộ giáo trình dùng chung mọi tài khoản (2026-08-10, Minh: "tất cả bài học đều hiển thị ở
      // tất cả tài khoản" — không còn lọc theo goal_id/user_id CỦA RIÊNG user hiện tại, xem ghi
      // chú đầy đủ ở listAiGeneratedLessons() trong db.js) — NHƯNG vẫn PHẢI lọc theo INDUSTRY
      // (2026-08-14, Minh: "luồng Giao tiếp tổng quát không hiển thị bài qua luồng kế toán và
      // ngược lại") — 2 chính sách khác nhau, không mâu thuẫn: dùng chung GIỮA các tài khoản
      // CÙNG 1 chuyên ngành, nhưng KHÔNG trộn GIỮA các chuyên ngành khác nhau.
      const goal = await getActiveLearningGoal().catch(() => null);
      const industryFilter = goal ? (goal.occupation_profile?.is_general ? null : goal.raw_keywords) : undefined;
      const [lessons, inProgress, previewsRes] = await Promise.all([
        listAiGeneratedLessons({ filter: contentType, industryFilter }),
        listInProgressLessons({ limit: 6, industryFilter }).catch(() => []),
        // Lỗi tải preview KHÔNG chặn cả màn — chỉ đơn giản là chưa vẽ được thẻ khoá lần này, bài
        // ĐÃ MỞ vẫn hiện bình thường (allPreviews rỗng -> renderList() coi như mọi bài "phủ" hết
        // qua nhánh fallback cuối, xem renderList()).
        listLessonPreviews({ contentType, industry: industryFilter }).catch(() => ({ ok: false })),
      ]);
      allLessons = lessons;
      allPreviews = previewsRes.ok ? previewsRes.data.lessons || [] : [];
      // Chỉ tính levelsWithContent khi CẢ 2 nguồn tải xong bình thường — nếu preview lỗi mạng
      // (previewsRes.ok === false), KHÔNG được kết luận nhầm "cấp độ chưa có bài" chỉ vì thiếu dữ
      // liệu preview, dễ khoá NHẦM cấp độ thật ra có bài (Free chỉ thấy 1 phần allLessons, không
      // đại diện đủ để tính rỗng/không-rỗng).
      if (previewsRes.ok) {
        state.levelsWithContent = new Set([...allLessons, ...allPreviews].map((l) => l.level));
        // Level đang chọn (từ localStorage lần trước) hoá ra KHÔNG có bài nào -> rơi về cấp độ
        // ĐẦU TIÊN thật sự có bài (thường A1), tránh vào thẳng 1 màn trống/khoá bất ngờ.
        if (state.levelsWithContent.size && !state.levelsWithContent.has(state.level)) {
          const fallback = LEVEL_CARDS.map((l) => l.level).find((lv) => state.levelsWithContent.has(lv));
          if (fallback) {
            state.level = fallback;
            setLevelPreference(contentType, state.level);
          }
        }
        mount.querySelector("#level-card-row").innerHTML = levelCardRowHtml();
        wireLevelCards();
      }
      renderContinueSection(inProgress);
      renderList();
    } catch {
      mount.querySelector("#lessons-list").innerHTML = `<p class="error-text">${t("Không tải được danh sách bài học.")}</p>`;
    }
  }

  load();
}
