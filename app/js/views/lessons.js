// app/js/views/lessons.js — màn "Bài học" (màn chính sau đăng nhập), bám theo ảnh mẫu:
// header avatar+streak+cài đặt, ô tìm kiếm + nút lọc, tab Bài đọc/Hội thoại, danh sách thẻ
// bài học. Route "/favorites" và "/ai-library" TÁI DÙNG ĐÚNG hàm này qua params[0] ("favorite"
// / "library") — cùng 1 bố cục khung sườn (yêu cầu người dùng: 3 màn Phổ biến/Yêu thích/Thư
// viện AI phải "giống về bố cục nhưng không nhầm lẫn"), chỉ khác nguồn dữ liệu lọc + 1 tiêu đề
// riêng thay cho hàng "quick actions"+"Bài đang đọc" (2 khối đó CHỈ có ý nghĩa ở màn chính).
//
// GHI CHÚ MAPPING DỮ LIỆU (chưa có "giá trị" cụ thể người dùng chỉ định — xem hội thoại):
// - Dòng tiêu đề đậm = lessons.title_vi (thay vì nhãn cố định "BÀI HỌC HÀNG NGÀY" như ảnh
//   mẫu, vì mỗi bài cần phân biệt được nhau; nhãn cố định lặp lại mọi thẻ sẽ vô nghĩa).
// - Dòng phụ màu cam = lessons.situation (bảng "lessons" hiện KHÔNG lưu cột "chủ đề" riêng
//   — trường "topic" chỉ dùng để dựng prompt lúc tạo bài, không persist).
import { navigate } from "../router.js";
import {
  listLessons,
  listAiGeneratedLessons,
  listInProgressLessons,
  setLessonFavorite,
  listWritingFavorites,
  listGoalStatuses,
  listNewsLessons,
  listTextAnalyzedLessons,
} from "../db.js";
import { icon } from "../icons.js";
import { lessonCardHtml, continueCardHtml, industryCardHtml, wireLessonCards } from "../lessonCard.js";
import { showToast } from "../toast.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats } from "../header.js";
import { escapeHtml, formatDate } from "../utils.js";

// 4 lối tạo bài học nhanh (thay cho luồng Mentor AI nhiều bước đã tắt) — "Văn bản" là tính
// năng CŨ "Tôi có văn bản" (analyze_user_text) trước đây chỉ vào được qua màn Mentor AI, nay
// bị mồ côi vì route /mentor-goal đã gỡ; đưa lên đây mới có đường vào lại. "Luyện viết"
// (2026-07-27) có backend + route riêng (/writing, xem views/writingPractice.js) — không còn
// comingSoon. "Các khoá học" (2026-07-29, thay chỗ "Máy ảnh" — CHƯA làm, admin dự định chèn
// quảng cáo tạm ở đây trước khi có khoá học thật) CŨNG comingSoon như "Máy ảnh" trước đó, chỉ
// đổi nhãn/icon — nhãn dài hơn hẳn 3 nhãn còn lại nên tự cuộn chữ (marquee) thay vì tràn/ngắt
// cứng, xem CSS ".quick-action-label"/"quick-action-marquee" trong style.css.
const QUICK_ACTIONS = [
  { id: "text", label: "Văn bản", icon: "file-text", path: "/create-text" },
  { id: "courses", label: "Các khoá học", icon: "graduation-cap", comingSoon: true },
  { id: "ai", label: "AI", icon: "sparkles", path: "/create" },
  { id: "writing", label: "Luyện viết", icon: "edit-3", path: "/writing" },
];

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

export function renderLessons(mount, params) {
  const mode = params?.[0] === "favorite" || params?.[0] === "library" ? params[0] : "main";
  const state = {
    contentType: "reading",
    level: "all",
    industry: null,
    search: "",
  };
  // goalId -> 'active'|'archived' (2026-07-28) — CHỈ dùng ở mode "library" để gắn nhãn "Đã dừng"
  // cho nhóm lĩnh vực, xem isIndustryGroupArchived()/loadGoalStatuses() bên dưới.
  let goalStatusMap = new Map();

  // Yêu thích/Thư viện AI: BỎ icon người dùng (avatar+badge) — thay bằng CHÍNH tên màn hình,
  // đặt NGAY TRONG hàng app-header (không phải <h1> rời bên dưới) để đứng đúng vị trí avatar
  // cũ. header.js::appHeaderHtml() là NƠI DUY NHẤT dựng khung này (đã bị bắt lỗi 2 lần vì mỗi
  // view tự chép 1 bản riêng rồi trôi lệch nhau — avatar "nhảy" lúc trước, "độ cao/cỡ chữ
  // không đồng bộ" lần này — xem ghi chú đầu file header.js).
  const headerTitleHtml =
    mode === "favorite"
      ? `<span style="color:#ef4476">${icon("heart", { size: 22, filled: true })}</span> Yêu thích`
      : mode === "library"
      ? `<span style="color:var(--purple)">${icon("library", { size: 22 })}</span> Thư viện AI`
      : undefined; // undefined -> appHeaderHtml() tự vẽ avatar+badge (chỉ màn "Phổ biến")

  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(headerTitleHtml)}

      ${
        mode === "library"
          ? `
      <div id="industry-section" hidden>
        <div class="section-label-row"><span class="section-label-tab">Lĩnh vực</span></div>
        <div id="industry-scroll" class="continue-scroll"></div>
      </div>
      `
          : mode === "favorite"
          ? ""
          : `
      <div class="quick-actions">
        ${QUICK_ACTIONS.map(
          (a) => `
          <button type="button" class="quick-action-btn" data-action="${a.id}">
            <span class="quick-action-icon">${icon(a.icon, { size: 20 })}</span>
            <span class="quick-action-label"><span class="quick-action-label-text">${escapeHtml(a.label)}</span></span>
          </button>
        `
        ).join("")}
      </div>

      <div id="continue-section" hidden>
        <div class="section-label-row"><span class="section-label-tab">Bài đang đọc</span></div>
        <div id="continue-scroll" class="continue-scroll"></div>
      </div>
      `
      }

      ${
        mode === "main"
          ? `
      <div class="search-row">
        <button type="button" class="filter-btn" id="toggle-level-filter">${icon("filter", { size: 16 })} Tìm lọc</button>
        <div class="search-box">
          <span class="search-icon">${icon("search", { size: 18 })}</span>
          <input type="text" id="search-input" placeholder="Tìm kiếm bài học..." />
        </div>
      </div>

      <div class="filter-row" id="level-filter-row" hidden>
        <button type="button" class="filter-chip active" data-level="all">Tất cả</button>
        ${LEVELS.map((l) => `<button type="button" class="filter-chip" data-level="${l}">${l}</button>`).join("")}
      </div>
      `
          : // Yêu thích/Thư viện AI: KHÔNG có ô tìm kiếm/nút "Tìm lọc" (yêu cầu người dùng) —
            // thay bằng 1 hàng chip Level kèm SỐ BÀI trong level đó, luôn hiện sẵn (không ẩn/hiện
            // như #level-filter-row), tự tính lại số liệu mỗi khi renderList() chạy lại (xem hàm đó).
            `<div class="filter-row" id="level-count-row"></div>`
      }

      <div class="content-tabs sticky-tabs" role="tablist">
        <button type="button" class="content-tab-btn active" data-type="reading">${icon("book", { size: 17 })} Bài đọc</button>
        <button type="button" class="content-tab-btn" data-type="dialogue">${icon("message-circle", { size: 17 })} Hội thoại</button>
        ${
          mode === "favorite" || mode === "library"
            ? `<button type="button" class="content-tab-btn" data-type="writing">${icon("edit-3", { size: 17 })} Bài viết</button>
               <button type="button" class="content-tab-btn" data-type="analysis">${icon("search", { size: 17 })} Phân tích</button>`
            : ""
        }
      </div>

      <div id="lessons-list" class="lessons-list"><p class="muted">Đang tải...</p></div>
    </div>
  `;

  wireAppHeader(mount);

  mount.querySelectorAll(".quick-action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = QUICK_ACTIONS.find((a) => a.id === btn.dataset.action);
      if (action.comingSoon) {
        showToast("Tính năng đang phát triển, sẽ sớm ra mắt!");
        return;
      }
      navigate(action.path);
    });
  });

  // Nhãn dài hơn hẳn các nhãn khác (vd "Các khoá học") -> tự cuộn ngang (marquee) thay vì tràn
  // ra ngoài nút hoặc bị ngắt cứng (2026-07-29, yêu cầu người dùng) — CHỈ bật hiệu ứng cho nhãn
  // THẬT SỰ tràn (so scrollWidth/clientWidth sau khi đã render), nhãn ngắn (vừa khung) giữ
  // nguyên đứng yên. Nhân đôi chữ (kèm khoảng cách) để vòng lặp cuộn liền mạch, không giật.
  mount.querySelectorAll(".quick-action-label").forEach((label) => {
    const textEl = label.querySelector(".quick-action-label-text");
    if (!textEl || textEl.scrollWidth <= label.clientWidth) return;
    textEl.textContent = `${textEl.textContent}    ${textEl.textContent}`;
    label.classList.add("marquee");
  });

  // #toggle-level-filter/#search-input CHỈ tồn tại ở mode "main" (xem template ở trên) —
  // Yêu thích/Thư viện AI dùng #level-count-row (wire trong renderList(), vì chip render lại
  // mỗi lần đổi tab/search nên phải wire lại theo).
  if (mode === "main") {
    mount.querySelector("#toggle-level-filter").addEventListener("click", () => {
      const row = mount.querySelector("#level-filter-row");
      row.hidden = !row.hidden;
    });
    mount.querySelectorAll("#level-filter-row .filter-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        mount.querySelectorAll("#level-filter-row .filter-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        state.level = chip.dataset.level;
        renderList();
      });
    });

    let searchDebounce = null;
    mount.querySelector("#search-input").addEventListener("input", (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        state.search = e.target.value.trim().toLowerCase();
        renderList();
      }, 200);
    });
  }

  mount.querySelectorAll(".content-tab-btn").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      mount.querySelectorAll(".content-tab-btn").forEach((b) => b.classList.remove("active"));
      tabBtn.classList.add("active");
      state.contentType = tabBtn.dataset.type;
      renderList();
    });
  });

  loadAppHeaderStats(mount);
  if (mode === "main") loadContinueSection();
  if (mode === "library") loadGoalStatuses();
  renderList();

  // Nhãn "Đã dừng" (xem isIndustryGroupArchived()) — tải 1 lần lúc mount, render lại danh sách
  // khi xong (goalStatusMap rỗng lúc renderList() lần đầu chạy trước đó -> chưa gắn nhãn nào,
  // tự bổ sung ngay khi tải xong, không cần người dùng thao tác gì thêm).
  async function loadGoalStatuses() {
    try {
      const rows = await listGoalStatuses();
      goalStatusMap = new Map(rows.map((g) => [g.id, g.status]));
      renderList();
    } catch {
      // Không tải được -> giữ Map rỗng, đơn giản là chưa gắn nhãn cho tới F5 — không chặn màn.
    }
  }

  // NẰM TRONG renderLessons (đóng gói cùng "mount") thay vì hàm rời cấp module như bản đầu —
  // dùng chung closure "mount"/"navigate" với renderList() bên dưới.
  async function loadContinueSection() {
    try {
      const lessons = await listInProgressLessons({ limit: 6 });
      if (!lessons.length) return; // giữ [hidden], không có gì "đang đọc" thì không chiếm chỗ màn hình
      const section = mount.querySelector("#continue-section");
      const scroll = mount.querySelector("#continue-scroll");
      scroll.innerHTML = lessons.map(continueCardHtml).join("");
      wireLessonCards(scroll, {
        cardSelector: ".continue-card",
        onOpen: (id) => navigate(`/lesson/${id}`),
        onToggleFavorite: (id, nextFav) => setLessonFavorite(id, nextFav),
      });
      section.hidden = false;
      // KHÔNG tự động lướt (yêu cầu người dùng: để người dùng tự vuốt) — carousel vẫn lướt
      // ngang được bằng tay (overflow-x:auto + scroll-snap ở CSS), chỉ bỏ setInterval tự chạy.
    } catch {
      // Không tải được carousel "đang đọc" thì đơn giản là không hiện mục này — không chặn màn chính.
    }
  }

  // Hàng chip "Level (số bài)" thay cho ô tìm kiếm/nút Tìm lọc ở Yêu thích/Thư viện AI (yêu
  // cầu người dùng) — LUÔN hiện sẵn (không ẩn/hiện), tự tính lại số liệu theo đúng dữ liệu
  // đang xem (đã lọc theo tab Bài đọc/Hội thoại). Chỉ hiện level nào có ít nhất 1 bài, tránh
  // rối mắt với "A2 (0)".
  function renderLevelCountRow(lessons) {
    const row = mount.querySelector("#level-count-row");
    if (!row) return;
    const counts = LEVELS.reduce((acc, l) => {
      acc[l] = lessons.filter((x) => x.level === l).length;
      return acc;
    }, {});
    const levelsWithLessons = LEVELS.filter((l) => counts[l] > 0);
    row.innerHTML = `
      <button type="button" class="level-count-chip ${state.level === "all" ? "active" : ""}" data-level="all">
        <span class="level-count-chip-num">${lessons.length}</span> Tất cả
      </button>
      ${levelsWithLessons
        .map(
          (l) => `
        <button type="button" class="level-count-chip ${state.level === l ? "active" : ""}" data-level="${l}">
          <span class="level-count-chip-badge" data-level="${l}">${l}</span>
          <span class="level-count-chip-num">${counts[l]}</span> bài
        </button>
      `
        )
        .join("")}
    `;
    row.querySelectorAll(".level-count-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.level = chip.dataset.level;
        renderList();
      });
    });
  }

  // Card "Lĩnh vực" lướt ngang, CHỈ ở Thư viện AI (yêu cầu người dùng 2026-07-23) — nhóm theo
  // lessons.industry (migration 024_lessons_industry.sql, set lúc tạo bài qua form "Tạo bài
  // học" — ô "Ngành nghề" ưu tiên, rớt về "Lĩnh vực" nếu chỉ điền 1 trong 2, xem
  // api/_generate/lesson.js::generate_lesson). CHỈ hiện khi có TỪ 2 LĨNH VỰC KHÁC NHAU trở
  // lên (đúng yêu cầu) — 1 lĩnh vực duy nhất thì nhóm vô nghĩa, ẩn hẳn mục này đi.
  // "Đã dừng" (2026-07-28, "giới hạn 5 lĩnh vực + Thư mục AI") — 1 nhóm lĩnh vực archived khi CÓ
  // ít nhất 1 bài biết goal_id (qua goalStatusMap) VÀ KHÔNG bài nào trong nhóm còn goal 'active'
  // — mơ hồ (chưa biết) thì mặc định KHÔNG gắn nhãn, tránh gắn nhầm "Đã dừng" cho lĩnh vực còn
  // hoạt động.
  function isIndustryGroupArchived(groupLessons) {
    const statuses = groupLessons.map((l) => l.goal_id && goalStatusMap.get(l.goal_id)).filter(Boolean);
    if (!statuses.length) return false;
    return statuses.every((s) => s === "archived");
  }

  function renderIndustrySection(lessons) {
    const section = mount.querySelector("#industry-section");
    if (!section) return;
    const groups = new Map();
    lessons.forEach((l) => {
      const key = l.industry || "Chưa phân loại";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    });
    if (groups.size < 2) {
      section.hidden = true;
      return;
    }
    const scroll = section.querySelector("#industry-scroll");
    scroll.innerHTML = Array.from(groups.entries())
      .map(([name, groupLessons]) => {
        // Ảnh bìa đại diện (2026-07-29) — lấy TẠM ảnh bìa của 1 bài bất kỳ trong nhóm đã có sẵn
        // (không tốn thêm lượt tìm ảnh riêng cho từng lĩnh vực), xem industryCardHtml().
        const cover = groupLessons.find((l) => l.cover_image_url)?.cover_image_url || null;
        return industryCardHtml(name, groupLessons.length, state.industry === name, isIndustryGroupArchived(groupLessons), cover);
      })
      .join("");
    scroll.querySelectorAll(".industry-card").forEach((card) => {
      card.addEventListener("click", () => {
        const name = card.dataset.industry;
        state.industry = state.industry === name ? null : name; // bấm lại thẻ đang chọn -> bỏ lọc
        renderList();
      });
    });
    section.hidden = false;
  }

  async function renderList() {
    const listEl = mount.querySelector("#lessons-list");
    listEl.innerHTML = `<p class="muted">Đang tải...</p>`;
    // Tab "Bài viết" (Yêu thích + Thư viện AI, Việc 3/Item 7 — 2026-07-27) — nguồn dữ liệu HOÀN
    // TOÀN khác (writing_favorites, không phải lessons), tự thoát sớm khỏi luồng lessons bên
    // dưới, không dùng chung filter cấp độ/lĩnh vực/tìm kiếm (những control đó chỉ hiện cho lessons).
    if ((mode === "favorite" || mode === "library") && state.contentType === "writing") {
      const row = mount.querySelector("#level-count-row");
      if (row) row.innerHTML = "";
      return renderWritingFavoritesList(listEl);
    }
    try {
      // 3 nguồn dữ liệu khác nhau theo mode — CÙNG áp dụng tiếp bộ lọc cấp độ/tìm kiếm/tab
      // Bài đọc-Hội thoại bên dưới, không phân biệt nữa sau bước này.
      let lessons;
      if (state.contentType === "analysis") {
        // Tab "Phân tích" (2026-07-29) — bài từ "Tôi có văn bản", nguồn dữ liệu RIÊNG
        // (lessons.source='user_text'), không tách Bài đọc/Hội thoại như 2 tab đầu (giống cách
        // "Bài viết" cũng không tách) nên KHÔNG truyền content_type vào bộ lọc.
        lessons = await listTextAnalyzedLessons({ filter: mode === "favorite" ? "favorite" : "all" });
      } else if (mode === "library") {
        lessons = await listAiGeneratedLessons({ filter: state.contentType });
      } else if (mode === "favorite") {
        lessons = await listLessons({ filter: "favorite" });
        lessons = lessons.filter((l) => l.content_type === state.contentType);
      } else {
        // Phổ biến (2026-07-28, "bỏ toggle Của tôi/Tin tức"): bài của người dùng + Tin tức tự
        // sinh công khai hiện CHUNG 1 danh sách, sắp mới nhất trước — không còn mục con riêng,
        // phân biệt bằng lĩnh vực/chuyên mục cạnh ngày tạo trên thẻ (xem lessonCardHtml()).
        // "_source" gắn tạm để onOpen()/hideFavorite bên dưới biết mở đúng route/ẩn nút tim cho
        // bài Tin tức (không thuộc user_id nào, không PATCH is_favorite được).
        const [personal, news] = await Promise.all([
          listLessons({ filter: state.contentType }),
          listNewsLessons({ filter: state.contentType }).catch(() => []),
        ]);
        lessons = [...personal.map((l) => ({ ...l, _source: "personal" })), ...news.map((l) => ({ ...l, _source: "news" }))].sort(
          (a, b) => new Date(b.created_at || b.published_at) - new Date(a.created_at || a.published_at)
        );
      }
      // Yêu thích/Thư viện AI: hàng chip Level+số bài TÍNH TRÊN "lessons" TRƯỚC khi lọc theo
      // level (nếu tính sau thì bấm 1 level là các level khác biến mất luôn, không còn số để
      // bấm chuyển) — tab Bài đọc/Hội thoại vẫn ảnh hưởng số liệu vì đã lọc contentType ở trên.
      if (mode !== "main") renderLevelCountRow(lessons);
      if (mode === "library") renderIndustrySection(lessons);
      if (state.level !== "all") {
        lessons = lessons.filter((l) => l.level === state.level);
      }
      if (state.industry) {
        lessons = lessons.filter((l) => (l.industry || "Chưa phân loại") === state.industry);
      }
      if (state.search) {
        lessons = lessons.filter(
          (l) =>
            (l.title_vi || l.title || "").toLowerCase().includes(state.search) ||
            (l.situation || "").toLowerCase().includes(state.search)
        );
      }
      if (!lessons.length) {
        const emptyText =
          state.contentType === "analysis"
            ? "Bạn chưa phân tích văn bản nào từ mục \"Văn bản\"."
            : mode === "favorite"
            ? "Bạn chưa yêu thích bài học nào."
            : mode === "library"
            ? "Chưa có bài học nào tạo từ Thư viện AI."
            : "Chưa có bài học nào.";
        listEl.innerHTML = `<p class="muted">${emptyText}</p>`;
        return;
      }
      listEl.innerHTML = lessons.map((l) => lessonCardHtml(l, { hideFavorite: l._source === "news" })).join("");
      wireLessonCards(listEl, {
        onOpen: (id) => {
          const item = lessons.find((l) => String(l.id) === String(id));
          navigate(item?._source === "news" ? `/news-lesson/${id}` : `/lesson/${id}`);
        },
        onToggleFavorite: async (id, nextFav) => {
          await setLessonFavorite(id, nextFav);
          if (mode === "favorite") renderList(); // đang ở tab Yêu thích -> bỏ tim thì phải biến mất khỏi danh sách
        },
      });
    } catch {
      listEl.innerHTML = `<p class="error-text">Không tải được danh sách bài học.</p>`;
    }
  }

  // Tab "Bài viết" trong Yêu thích — liệt kê CẢ 2 loại đã lưu (Việc 3/Item 7), gắn nhãn phân
  // biệt rõ ("Đã sửa"/"Hoàn chỉnh"/"Tham khảo"). Bấm vào -> mở lại ĐÚNG dữ liệu tĩnh đã lưu
  // (route /writing-favorite/:id, xem views/writingFavoriteDetail.js) — KHÔNG chấm lại, KHÔNG
  // gọi AI lại.
  const FAVORITE_KIND_LABELS = {
    detailed: "Đã sửa",
    clean_rewrite: "Hoàn chỉnh",
    reference_essay: "Tham khảo",
  };

  async function renderWritingFavoritesList(listEl) {
    try {
      const favorites = await listWritingFavorites();
      if (!favorites.length) {
        listEl.innerHTML = `<p class="muted">Bạn chưa lưu bài viết nào từ Luyện viết.</p>`;
        return;
      }
      listEl.innerHTML = favorites
        .map((f) => {
          const labelKey = f.kind === "detailed" ? "detailed" : f.variant;
          const label = FAVORITE_KIND_LABELS[labelKey] || "Đã lưu";
          const scoreHtml = Number.isFinite(f.overall_score) ? `<span class="writing-favorite-score">${f.overall_score}/100</span>` : "";
          return `
          <div class="card writing-card writing-favorite-card" data-id="${f.id}">
            <div class="writing-favorite-head">
              <span class="level-pill">${escapeHtml(f.level)}</span>
              <span class="writing-favorite-kind">${label}</span>
              ${scoreHtml}
            </div>
            <p class="writing-favorite-title">${escapeHtml(f.task?.topic_en || "")}</p>
            <p class="muted writing-favorite-date">${formatDate(f.created_at)}</p>
          </div>
        `;
        })
        .join("");
      listEl.querySelectorAll(".writing-favorite-card").forEach((card) => {
        card.addEventListener("click", () => navigate(`/writing-favorite/${card.dataset.id}`));
      });
    } catch {
      listEl.innerHTML = `<p class="error-text">Không tải được danh sách bài viết đã lưu.</p>`;
    }
  }
}
