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
import { listLessons, listAiGeneratedLessons, listInProgressLessons, setLessonFavorite } from "../db.js";
import { icon } from "../icons.js";
import { lessonCardHtml, continueCardHtml, industryCardHtml, wireLessonCards } from "../lessonCard.js";
import { showToast } from "../toast.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats } from "../header.js";

// 4 lối tạo bài học nhanh (thay cho luồng Mentor AI nhiều bước đã tắt) — "Văn bản" là tính
// năng CŨ "Tôi có văn bản" (analyze_user_text) trước đây chỉ vào được qua màn Mentor AI, nay
// bị mồ côi vì route /mentor-goal đã gỡ; đưa lên đây mới có đường vào lại. "Máy ảnh"/"Luyện
// viết" CHƯA có backend — bấm vào chỉ báo "sắp ra mắt", không giả vờ hoạt động.
const QUICK_ACTIONS = [
  { id: "text", label: "Văn bản", icon: "file-text", path: "/create-text" },
  { id: "camera", label: "Máy ảnh", icon: "camera", comingSoon: true },
  { id: "ai", label: "AI", icon: "sparkles", path: "/create" },
  { id: "writing", label: "Luyện viết", icon: "edit-3", comingSoon: true },
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
            <span class="quick-action-label">${a.label}</span>
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

      <div class="content-tabs" role="tablist">
        <button type="button" class="content-tab-btn active" data-type="reading">${icon("book", { size: 17 })} Bài đọc</button>
        <button type="button" class="content-tab-btn" data-type="dialogue">${icon("message-circle", { size: 17 })} Hội thoại</button>
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
  renderList();

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
  function renderIndustrySection(lessons) {
    const section = mount.querySelector("#industry-section");
    if (!section) return;
    const groups = new Map();
    lessons.forEach((l) => {
      const key = l.industry || "Chưa phân loại";
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    if (groups.size < 2) {
      section.hidden = true;
      return;
    }
    const scroll = section.querySelector("#industry-scroll");
    scroll.innerHTML = Array.from(groups.entries())
      .map(([name, count]) => industryCardHtml(name, count, state.industry === name))
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
    try {
      // 3 nguồn dữ liệu khác nhau theo mode — CÙNG áp dụng tiếp bộ lọc cấp độ/tìm kiếm/tab
      // Bài đọc-Hội thoại bên dưới, không phân biệt nữa sau bước này.
      let lessons;
      if (mode === "library") {
        lessons = await listAiGeneratedLessons({ filter: state.contentType });
      } else {
        const filter = mode === "favorite" ? "favorite" : state.contentType;
        lessons = await listLessons({ filter });
        if (mode === "favorite" && state.contentType) {
          lessons = lessons.filter((l) => l.content_type === state.contentType);
        }
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
          mode === "favorite"
            ? "Bạn chưa yêu thích bài học nào."
            : mode === "library"
            ? "Chưa có bài học nào tạo từ Thư viện AI."
            : "Chưa có bài học nào.";
        listEl.innerHTML = `<p class="muted">${emptyText}</p>`;
        return;
      }
      listEl.innerHTML = lessons.map(lessonCardHtml).join("");
      wireLessonCards(listEl, {
        onOpen: (id) => navigate(`/lesson/${id}`),
        onToggleFavorite: async (id, nextFav) => {
          await setLessonFavorite(id, nextFav);
          if (mode === "favorite") renderList(); // đang ở tab Yêu thích -> bỏ tim thì phải biến mất khỏi danh sách
        },
      });
    } catch {
      listEl.innerHTML = `<p class="error-text">Không tải được danh sách bài học.</p>`;
    }
  }
}
