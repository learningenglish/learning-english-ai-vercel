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
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats, backChevronHtml, wireBackLink } from "../header.js";
import { escapeHtml, formatDate } from "../utils.js";

// "Chọn level" (2026-08-04, bám ảnh mẫu — Minh: "giao diện Bài đọc/Hội thoại không đúng như
// hình") — thẻ bo viền màu riêng từng level thay cho hàng chip ẩn/hiện sau nút "Tìm lọc" cũ.
const LEVEL_CARDS = [
  { level: "A1", sub: "Beginner", chip: "blue" },
  { level: "A2", sub: "Elementary", chip: "green" },
  { level: "B1", sub: "Intermediate", chip: "purple" },
  { level: "B2", sub: "Upper Int.", chip: "orange" },
  { level: "C1", sub: "Advanced", chip: "blue" },
];

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

// Cache TẠM sống suốt phiên SPA (module-level, mất khi F5 thật) — 2026-07-30, Minh: "chuyển
// qua lại giữa các mục vẫn thấy khung xương rồi mới ra nội dung thật, đó cũng là 1 kiểu giật
// giao diện". Trước đây renderList() luôn vẽ khung xương RỒI MỚI gọi API mỗi lần chạy (kể cả
// quay lại ĐÚNG tab vừa xem giây trước) — giờ nhớ lại danh sách THẬT gần nhất theo từng tổ hợp
// (mode + loại nội dung), quay lại đúng tổ hợp đó trong CÙNG phiên thì hiện THẲNG dữ liệu cũ
// NGAY LẬP TỨC (không qua khung xương), rồi âm thầm tải lại ở nền — CHỈ vẽ lại nếu dữ liệu THẬT
// SỰ khác (so sánh JSON, xem renderList()) để không tự gây giật ngược lại chính nó khi dữ liệu
// không đổi. Cùng triết lý cache-1-lần đã dùng cho streak/tier ở header.js.
const listResultCache = new Map();

// Cùng lý do/cùng cơ chế như "listResultCache" ở trên, áp dụng cho 2 khối RIÊNG (2026-07-30,
// Minh: "vẫn chớp vì bài đang đọc và lĩnh vực hiển thị không cùng lúc khi chuyển mục") — 2 khối
// này trước đây KHÔNG có cache gì cả, tự tải MỚI HOÀN TOÀN mỗi lần MOUNT lại màn hình (khác
// listResultCache vốn theo mode+contentType) — nên dù danh sách bài học đã hiện tức thời nhờ
// cache ở trên, 2 khối carousel này vẫn "rơi" vào SAU MỘT NHỊP, đẩy danh sách xuống — chính là
// cảm giác "không cùng lúc" Minh mô tả. "continueSectionCache": mảng lessons hoặc null (chưa
// tải lần nào). "industrySectionCache": { allLessons, goalStatusEntries } hoặc null.
let continueSectionCache = null;
let industrySectionCache = null;

// Tách riêng để TÁI SỬ DỤNG (2026-07-30, mục B5 — Minh: "thêm 4 icon lối tắt vào đầu trang Thư
// viện AI, đồng bộ với Phổ biến") — trước đây khối này chỉ tồn tại NGAY TRONG template của mode
// "main", giờ gọi lại y nguyên cho cả "main" lẫn "library" (KHÔNG viết lại logic click/marquee).
function quickActionsHtml() {
  return `
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
  `;
}

// Wire click + marquee cho MỌI ".quick-action-btn"/".quick-action-label" hiện có trong "mount"
// — an toàn gọi vô điều kiện dù mode không có quick-actions (querySelectorAll rỗng, forEach
// không làm gì).
function wireQuickActions(mount) {
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
}

// Khung "xương" (skeleton) thay cho dòng chữ "Đang tải..." (2026-07-30, mục 4 — Minh: "bấm vào
// Thư viện AI bị nhảy giao diện", render 2 lần từ khung rỗng sang danh sách đầy). Cùng HÌNH DẠNG
// .lesson-card (ảnh bìa + 3 dòng chữ) nên khi dữ liệu về, bố cục không đổi đột ngột — chỉ đổi từ
// "xám nhấp nháy" sang nội dung thật, không co/giãn chiều cao khung chứa.
function skeletonListHtml(count = 3) {
  return Array.from({ length: count }, () => `
    <div class="lesson-card lesson-card-skeleton">
      <div class="lesson-card-cover skeleton-shimmer"></div>
      <div class="lesson-card-body">
        <div class="skeleton-line skeleton-shimmer" style="width:70%;height:14px;margin-bottom:8px"></div>
        <div class="skeleton-line skeleton-shimmer" style="width:45%;height:11px;margin-bottom:8px"></div>
        <div class="skeleton-line skeleton-shimmer" style="width:30%;height:11px"></div>
      </div>
    </div>
  `).join("");
}

export function renderLessons(mount, params) {
  const mode = params?.[0] === "favorite" || params?.[0] === "library" ? params[0] : "main";
  // params[1] (2026-08-04, card "Hội thoại" ở Home mới, xem views/home.js) — cho phép mở thẳng
  // đúng tab, vd navigate("/lessons/main/dialogue"). Không truyền -> mặc định "reading" như cũ.
  const state = {
    contentType: params?.[1] === "dialogue" ? "dialogue" : "reading",
    level: "all",
    industry: null,
    search: "",
  };
  // goalId -> 'active'|'archived' (2026-07-28) — CHỈ dùng ở mode "library" để gắn nhãn "Đã dừng"
  // cho nhóm lĩnh vực, xem isIndustryGroupArchived()/loadIndustrySection() bên dưới.
  let goalStatusMap = new Map();

  // Yêu thích/Thư viện AI: BỎ icon người dùng (avatar+badge) — thay bằng CHÍNH tên màn hình,
  // đặt NGAY TRONG hàng app-header (không phải <h1> rời bên dưới) để đứng đúng vị trí avatar
  // cũ. header.js::appHeaderHtml() là NƠI DUY NHẤT dựng khung này (đã bị bắt lỗi 2 lần vì mỗi
  // view tự chép 1 bản riêng rồi trôi lệch nhau — avatar "nhảy" lúc trước, "độ cao/cỡ chữ
  // không đồng bộ" lần này — xem ghi chú đầu file header.js).
  // "main" (2026-08-04, bám ảnh mẫu): màn này giờ là MÀN CON của Home (vào từ card Bài đọc/Hội
  // thoại), không còn là màn chính sau đăng nhập nữa -> đổi hẳn từ avatar+badge sang back+tiêu
  // đề đúng loại nội dung đang xem (cùng cách Yêu thích/Thư viện AI đã làm trước đó).
  function mainTitleText() {
    return state.contentType === "dialogue" ? "Hội thoại" : "Bài đọc";
  }
  const headerTitleHtml =
    mode === "favorite"
      ? `<span style="color:#ef4476">${icon("heart", { size: 22, filled: true })}</span> Yêu thích`
      : mode === "library"
      ? `<span style="color:var(--purple)">${icon("library", { size: 22 })}</span> Thư viện AI`
      : `<span id="main-list-title">${escapeHtml(mainTitleText())}</span>`;

  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(headerTitleHtml, {}, { showBack: mode === "main" })}

      ${mode === "library" ? quickActionsHtml() : ""}

      ${
        mode === "main"
          ? `
      <p class="level-picker-label">Chọn level</p>
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
      `
          : ""
      }

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
      <div id="continue-section" hidden>
        <div class="section-label-row"><span class="section-label-tab">Bài học gần đây</span></div>
        <div id="continue-scroll" class="continue-scroll"></div>
      </div>
      `
      }

      ${
        mode === "main"
          ? ""
          : // Yêu thích/Thư viện AI: hàng chip Level kèm SỐ BÀI trong level đó, luôn hiện sẵn, tự
            // tính lại số liệu mỗi khi renderList() chạy lại (xem hàm đó).
            `<div class="filter-row" id="level-count-row"></div>`
      }

      <div class="content-tabs sticky-tabs" role="tablist">
        <button type="button" class="content-tab-btn ${state.contentType === "reading" ? "active" : ""}" data-type="reading">${icon("book", { size: 17 })} Bài đọc</button>
        <button type="button" class="content-tab-btn ${state.contentType === "dialogue" ? "active" : ""}" data-type="dialogue">${icon("message-circle", { size: 17 })} Hội thoại</button>
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
  wireQuickActions(mount);
  if (mode === "main") wireBackLink(mount, () => navigate("/home"));

  // "Chọn level" (2026-08-04) — bấm lại ĐÚNG level đang chọn = bỏ lọc (giống các chip lọc khác
  // trong app), khác hẳn hàng chip ẩn/hiện sau nút "Tìm lọc" cũ đã gỡ.
  mount.querySelectorAll(".level-card").forEach((card) => {
    card.addEventListener("click", () => {
      const lv = card.dataset.level;
      state.level = state.level === lv ? "all" : lv;
      mount.querySelectorAll(".level-card").forEach((c) => c.classList.toggle("active", c.dataset.level === state.level));
      renderList();
    });
  });

  mount.querySelectorAll(".content-tab-btn").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      mount.querySelectorAll(".content-tab-btn").forEach((b) => b.classList.remove("active"));
      tabBtn.classList.add("active");
      state.contentType = tabBtn.dataset.type;
      if (mode === "main") {
        const titleEl = mount.querySelector("#main-list-title");
        if (titleEl) titleEl.textContent = mainTitleText();
      }
      renderList();
    });
  });

  loadAppHeaderStats(mount);
  if (mode === "main") loadContinueSection();
  if (mode === "library") loadIndustrySection();
  renderList();

  // Vẽ carousel "Bài đang đọc" (main) từ dữ liệu THẬT — tách khỏi loadContinueSection() để dùng
  // lại được cho cả đường "hiện cache ngay" lẫn "dữ liệu mới tải xong" (xem bên dưới, cùng mẫu
  // renderLessonsInto()/renderIndustrySection()).
  function renderContinueSection(lessons) {
    const section = mount.querySelector("#continue-section");
    if (!lessons.length) {
      section.hidden = true; // không có gì "đang đọc" thì không chiếm chỗ màn hình
      return;
    }
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
  }

  // NẰM TRONG renderLessons (đóng gói cùng "mount") thay vì hàm rời cấp module như bản đầu —
  // dùng chung closure "mount"/"navigate" với renderList() bên dưới. SỬA 2026-07-30 (Minh:
  // "bài đang đọc và lĩnh vực hiển thị không cùng lúc khi chuyển mục") — có cache (đã từng tải
  // trong phiên này) thì hiện THẲNG NGAY LẬP TỨC, không đợi round-trip mạng lần này nữa, rồi mới
  // âm thầm tải lại nền + chỉ vẽ lại nếu THẬT SỰ khác — cùng cơ chế listResultCache ở renderList().
  async function loadContinueSection() {
    if (continueSectionCache) renderContinueSection(continueSectionCache);
    let lessons;
    try {
      lessons = await listInProgressLessons({ limit: 6 });
    } catch {
      return; // Giữ cache cũ (nếu có) — 1 lượt làm mới nền lỗi không nên phá nội dung đang đúng.
    }
    const changed = !continueSectionCache || JSON.stringify(lessons) !== JSON.stringify(continueSectionCache);
    continueSectionCache = lessons;
    if (changed) renderContinueSection(lessons);
  }

  // Hàng chip "Level (số bài)" thay cho ô tìm kiếm/nút Tìm lọc ở Yêu thích/Thư viện AI (yêu
  // cầu người dùng) — LUÔN hiện sẵn (không ẩn/hiện), tự tính lại số liệu theo đúng dữ liệu
  // đang xem (đã lọc theo tab Bài đọc/Hội thoại). Chỉ hiện level nào có ít nhất 1 bài, tránh
  // rối mắt với "A2 (0)".
  //
  // SỬA 2026-07-30 (Minh: "chớp nhẹ nền trên tab khi bấm Bài đọc/Hội thoại/Bài viết/Phân tích")
  // — hàng chip này nằm NGAY TRÊN thanh tab (content-tabs), và trước đây BẤT KỲ lần gọi nào
  // (kể cả khi renderList() đã hiện dữ liệu THẲNG từ cache, xem listResultCache) đều
  // row.innerHTML = ... LẠI TỪ ĐẦU — dù nội dung/số liệu giống hệt lần trước, việc phá-rồi-dựng
  // lại DOM vẫn buộc trình duyệt vẽ lại (repaint) đúng dải này mỗi lần bấm tab, tạo đúng cảm
  // giác "chớp nhẹ nền" dù dữ liệu không đổi. "lastLevelCountHtml" nhớ lại HTML đã vẽ lần
  // trước — giống hệt thì bỏ qua hẳn (không đụng DOM), chỉ vẽ lại khi số liệu/chip active THẬT
  // SỰ khác (đổi tab dữ liệu khác, đổi cấp độ đang chọn...).
  let lastLevelCountHtml = null;
  function renderLevelCountRow(lessons) {
    const row = mount.querySelector("#level-count-row");
    if (!row) return;
    const counts = LEVELS.reduce((acc, l) => {
      acc[l] = lessons.filter((x) => x.level === l).length;
      return acc;
    }, {});
    const levelsWithLessons = LEVELS.filter((l) => counts[l] > 0);
    const html = `
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
    if (html === lastLevelCountHtml) return;
    lastLevelCountHtml = html;
    row.innerHTML = html;
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

  // SỬA LẠI TOÀN BỘ (2026-07-30, Minh: "giữ cố định các card lĩnh vực, 4 tab. Không tự động ẩn
  // để tab bị nhảy") — bản CŨ nhận "lessons" (đã lọc theo TAB đang xem) làm tham số, tính lại
  // nhóm lĩnh vực + ẩn/hiện MỖI LẦN renderList() chạy (tức MỖI LẦN đổi tab) — dù đã vá 2 lần
  // (ẩn đồng bộ, chỉ ẩn đúng lúc cần...) bản chất vẫn là 1 khối PHỤ THUỘC vào tab đang xem, luôn
  // còn khả năng đổi trạng thái khi chuyển tab. Giờ tách hẳn KHỎI renderList()/state.contentType
  // — tự tải dữ liệu RIÊNG (toàn bộ bài ai_generated, không lọc content_type), tự quyết định
  // hiện/ẩn ĐÚNG 1 LẦN lúc mount, KHÔNG bao giờ đụng lại khi đổi tab nữa — xem loadIndustrySection()
  // bên dưới, gọi Ở MOUNT (giống loadContinueSection()), KHÔNG gọi trong renderList().
  // Vẽ carousel "Lĩnh vực" + gắn nhãn "Đã dừng" từ dữ liệu THẬT ("allLessons" + mảng cặp
  // [goalId, status] đã tải) — tách khỏi loadIndustrySection() để dùng lại được cho cả đường
  // "hiện cache ngay" lẫn "dữ liệu mới tải xong", cùng mẫu renderLessonsInto()/
  // renderContinueSection() ở trên. Gộp LUÔN việc gắn nhãn "Đã dừng" vào ĐÂY (trước đây tách 2
  // hàm loadGoalStatuses()/loadIndustrySection() gọi nối tiếp nhau, giờ 1 lượt tải song song
  // duy nhất, xem loadIndustrySection() bên dưới) — goalStatusMap cập nhật NGAY TRƯỚC khi tính
  // nhóm, luôn khớp đúng dữ liệu đang vẽ, không còn phụ thuộc thứ tự 2 lượt gọi rời nhau.
  function renderIndustrySection(allLessons, goalStatusEntries) {
    const section = mount.querySelector("#industry-section");
    if (!section) return;
    goalStatusMap = new Map(goalStatusEntries);
    const groups = new Map();
    allLessons.forEach((l) => {
      const key = l.industry || "Chưa phân loại";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    });
    if (groups.size < 2) {
      section.hidden = true; // 1 lĩnh vực duy nhất thì nhóm vô nghĩa.
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
        card.classList.toggle("active", !!state.industry && state.industry === name);
        scroll.querySelectorAll(".industry-card").forEach((c) => c.classList.toggle("active", c.dataset.industry === state.industry));
        renderList();
      });
    });
    section.hidden = false;
  }

  // SỬA 2026-07-30 (Minh: "bài đang đọc và lĩnh vực hiển thị không cùng lúc khi chuyển mục") —
  // có cache (đã từng tải trong phiên này) thì hiện THẲNG NGAY LẬP TỨC (kèm nhãn "Đã dừng" đã
  // biết), không đợi round-trip mạng lần này, rồi mới âm thầm tải lại nền + chỉ vẽ lại nếu THẬT
  // SỰ khác — cùng cơ chế loadContinueSection()/listResultCache ở trên. Gộp 2 lượt gọi
  // listAiGeneratedLessons()/listGoalStatuses() (trước đây 2 hàm rời, nối tiếp nhau) thành 1
  // Promise.all duy nhất — vừa nhanh hơn (song song thay vì nối tiếp), vừa dễ cache đúng 1 lần.
  async function loadIndustrySection() {
    const section = mount.querySelector("#industry-section");
    if (!section) return;
    if (industrySectionCache) renderIndustrySection(industrySectionCache.allLessons, industrySectionCache.goalStatusEntries);
    let allLessons, goalStatusEntries;
    try {
      const [lessonsRes, statusRows] = await Promise.all([
        listAiGeneratedLessons({ filter: "all" }),
        listGoalStatuses().catch(() => []), // Lỗi -> coi như chưa biết nhãn "Đã dừng", không chặn cả khối.
      ]);
      allLessons = lessonsRes;
      goalStatusEntries = statusRows.map((g) => [g.id, g.status]);
    } catch {
      return; // Giữ cache cũ (nếu có) — 1 lượt làm mới nền lỗi không nên phá nội dung đang đúng.
    }
    const changed =
      !industrySectionCache ||
      JSON.stringify(allLessons) !== JSON.stringify(industrySectionCache.allLessons) ||
      JSON.stringify(goalStatusEntries) !== JSON.stringify(industrySectionCache.goalStatusEntries);
    industrySectionCache = { allLessons, goalStatusEntries };
    if (changed) renderIndustrySection(allLessons, goalStatusEntries);
  }

  // Vẽ danh sách THẬT từ "lessonsRaw" (chưa lọc level/lĩnh vực/tìm kiếm — lọc lại đây, đọc
  // state MỚI NHẤT mỗi lần gọi) vào "listEl" — tách khỏi renderList() để dùng lại được cho cả
  // đường "hiện cache ngay" lẫn đường "dữ liệu mới tải xong", xem renderList() bên dưới.
  function renderLessonsInto(listEl, lessonsRaw) {
    let lessons = lessonsRaw;
    // Yêu thích/Thư viện AI: hàng chip Level+số bài TÍNH TRÊN "lessons" TRƯỚC khi lọc theo
    // level (nếu tính sau thì bấm 1 level là các level khác biến mất luôn, không còn số để
    // bấm chuyển) — tab Bài đọc/Hội thoại vẫn ảnh hưởng số liệu vì đã lọc contentType từ trước.
    if (mode !== "main") renderLevelCountRow(lessons);
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
  }

  async function renderList() {
    const listEl = mount.querySelector("#lessons-list");
    // #industry-section KHÔNG còn đụng gì ở đây nữa (2026-07-30, Minh: "giữ cố định các card
    // lĩnh vực, 4 tab") — tự tải/tự quyết định hiện-ẩn ĐÚNG 1 LẦN lúc mount, xem
    // loadIndustrySection() phía trên, hoàn toàn tách khỏi renderList()/đổi tab.
    // Tab "Bài viết" (Yêu thích + Thư viện AI, Việc 3/Item 7 — 2026-07-27) — nguồn dữ liệu HOÀN
    // TOÀN khác (writing_favorites, không phải lessons), tự thoát sớm khỏi luồng lessons bên
    // dưới, không dùng chung filter cấp độ/lĩnh vực/tìm kiếm (những control đó chỉ hiện cho lessons).
    if ((mode === "favorite" || mode === "library") && state.contentType === "writing") {
      return renderWritingFavoritesList(listEl);
    }
    // SỬA 2026-07-30 (mục B1/B3 tiếp — Minh: "chuyển qua lại giữa các mục vẫn thấy khung xương
    // rồi mới ra nội dung thật, cũng là 1 kiểu giật giao diện") — quay lại ĐÚNG tổ hợp
    // mode+contentType đã tải trong CÙNG phiên: hiện THẲNG dữ liệu cũ, KHÔNG qua khung xương,
    // rồi mới âm thầm tải lại ở nền bên dưới.
    const cacheKey = `${mode}:${state.contentType}`;
    const cached = listResultCache.get(cacheKey);
    if (cached) {
      renderLessonsInto(listEl, cached);
    } else {
      listEl.innerHTML = skeletonListHtml();
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
        // SỬA LẠI 2026-07-30 (Minh: "bài do người dùng tự tạo đang lộ ra ở mục Phổ biến, thay
        // vì chỉ nằm trong Thư viện AI" — mục G) — bản 2026-07-28 CỐ Ý trộn bài cá nhân + Tin
        // tức chung 1 danh sách (đọc lại comment cũ: "bỏ toggle Của tôi/Tin tức"), nhưng Minh
        // giờ chốt lại ranh giới CHẶT: Phổ biến CHỈ chứa nội dung hệ thống tự sinh (news_lessons,
        // không user_id, không phải của riêng ai); mọi bài cá nhân (Tạo nội dung/Phân tích) chỉ
        // ở Thư viện AI. Bỏ hẳn listLessons() (bài cá nhân) khỏi nhánh này — CHỈ còn Tin tức.
        // KHÔNG phải lỗi rò rỉ dữ liệu (đã xác nhận RLS "auth.uid()=user_id" chặn đúng, mỗi
        // người trước đây chỉ từng thấy ĐÚNG bài của chính họ trộn vào, không phải của người
        // khác) — đây là đổi lại 1 quyết định thiết kế, không phải vá lỗ hổng bảo mật.
        lessons = (await listNewsLessons({ filter: state.contentType }).catch(() => [])).map((l) => ({ ...l, _source: "news" }));
      }
      // Chỉ vẽ lại nếu KHÔNG có cache (lần đầu) hoặc dữ liệu mới tải THẬT SỰ khác cache — dữ
      // liệu giống hệt thì bỏ qua, tránh tự gây giật ngược lại chính mình mỗi lần đổi tab dù
      // chẳng có gì mới (đây là phần cốt lõi giải quyết "chấm dứt tình trạng" Minh yêu cầu).
      const changed = !cached || JSON.stringify(lessons) !== JSON.stringify(cached);
      listResultCache.set(cacheKey, lessons);
      if (changed) renderLessonsInto(listEl, lessons);
    } catch {
      // Có cache đang hiện đúng -> GIỮ NGUYÊN, coi như 1 lượt làm mới nền thất bại, không phá
      // nội dung đang hiển thị đúng chỉ vì mạng chập chờn ở lần tải lại.
      if (!cached) listEl.innerHTML = `<p class="error-text">Không tải được danh sách bài học.</p>`;
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
      let favorites = await listWritingFavorites();
      // Hàng chip Level (2026-07-29, sửa lỗi "nhảy" khi chuyển qua lại Bài viết/Phân tích) —
      // trước đây tab này TỰ XOÁ #level-count-row (dữ liệu writing_favorites không có cùng
      // hình dạng "lessons"), khiến hàng chip biến mất/xuất hiện đột ngột mỗi lần đổi tab, đẩy
      // cả danh sách bên dưới nhảy lên/xuống — giờ TÍNH TRÊN "favorites" y hệt các tab khác
      // (renderLevelCountRow() dùng chung, chỉ cần field "level" — writing_favorites vốn đã
      // có), giữ chiều cao ổn định xuyên suốt 4 tab, không còn nhảy.
      renderLevelCountRow(favorites);
      if (state.level !== "all") favorites = favorites.filter((f) => f.level === state.level);
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
