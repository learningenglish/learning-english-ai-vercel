// app/js/views/createLesson.js — form tự nhập "Tạo bài học" / "AI tạo nội dung", KHÔI PHỤC
// 2026-07-23 sau khi tắt UI Mentor AI (chất lượng thật không đạt, "như spam" — quyết định của
// Minh, backend mentor.js/mentor-lines/industry_skins/learning_goals VẪN giữ nguyên, không xoá).
//
// SỬA LẠI 2026-07-27 (chốt lần 2 — "tắt Mentor AI = chỉ tắt LỚP HỘI THOẠI, KHÔNG tắt việc bám
// lộ trình cá nhân"): submit() KHÔNG còn gọi generate_lesson trực tiếp — giờ ĐI QUA đúng cơ chế
// mục tiêu/spine đã xây cho Mentor AI (learning_goals + next_slot + industry_skins), CHỈ bỏ lớp
// hội thoại (nghi thức xưng hô, thẻ đạo diễn, câu "Tôi đã hiểu...", hỏi-đáp tuần tự). Xem
// resolveGoalId() bên dưới cho toàn bộ logic quyết định "tiếp tục mục tiêu hiện có" hay "đổi
// mục tiêu" hay "chưa có gì -> mục tiêu chung".
//
// ĐƠN GIẢN HOÁ (2026-07-23, yêu cầu người dùng): bỏ hẳn Độ dài (luôn "medium"), Chủ đề (AI tự
// sinh — xem QUY TẮC VỀ CHỦ ĐỀ trong api/_generate/lesson.js), Sản phẩm/Dịch vụ, Tình huống cụ
// thể, và field "Mô tả thêm" ĐỨNG NGOÀI Tuỳ chọn nâng cao (câu hỏi của nó dời VÀO trong, gắn
// vào "Ngành nghề" — xem ghi chú bên dưới). SỬA LẠI 2026-07-23 lần 2: Lĩnh vực + Ngành nghề
// KHÔNG gộp làm 1 — người dùng chỉ yêu cầu bỏ field TRÙNG LẶP nằm NGOÀI "Tuỳ chọn nâng cao",
// còn 2 field NẰM TRONG "Tuỳ chọn nâng cao" (Lĩnh vực, Ngành nghề) vẫn GIỮ NGUYÊN, tách biệt.
// GIỮ NGUYÊN CHƯA ĐỤNG (2026-07-27, chờ xác nhận riêng — xem báo cáo cuối phiên): ý nghĩa của 2
// field này khi đã bám lộ trình theo slot (chủ đề giờ do slot+gói ngành quyết định) — CHỈ đổi
// logic PHÍA SAU khi bấm submit, không đổi UI/field nào ở form này.
//
// SỬA TIẾP 2026-07-28 ("Khoá chip + xác nhận đổi lộ trình"): mục trên giờ đã có câu trả lời —
// khi ĐANG có 1 mục tiêu hoạt động, 2 hàng chip Cấp độ/Loại nội dung (vốn KHÔNG có tác dụng
// thật lúc đó, xem resolveGoalId() bên dưới — submit() chỉ dùng chúng để TẠO mục tiêu MỚI) được
// thay bằng 1 hàng "đang khoá" + Tuỳ chọn nâng cao bị ẩn hẳn — tránh hiểu lầm "đổi chip/điền lại
// ngành là đổi được ngay" trong khi thực chất đang bị bỏ qua. Muốn đổi PHẢI đi qua modal xác
// nhận (goal cũ -> archived, bài cũ -> Yêu thích, KHÔNG xoá gì, xem mentor_switch_goal trong
// api/_generate/mentor.js) rồi mới mở lại đúng luồng chọn ngành như khi CHƯA có mục tiêu nào.
import { navigate } from "../router.js";
import { fetchAndSaveLessonCover } from "../lessonApi.js";
import { inferGoalProfile, createGoal, generateNextLessonForGoal, autoCreateGoal, switchGoal } from "../mentorApi.js";
import { getActiveLearningGoal } from "../db.js";
import { escapeHtml } from "../utils.js";
import { icon } from "../icons.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats, wireBackLink } from "../header.js";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
// Bỏ "Không có" (0) và "50" (yêu cầu người dùng) — không chọn gì = ngầm hiểu "không có",
// không cần 1 chip riêng để nói điều đó.
const TERM_DENSITY_OPTIONS = [10, 20, 30, 40];

// Nhớ lại lựa chọn LẦN TRƯỚC (yêu cầu người dùng) — level/từ chuyên ngành là đặc điểm khá ổn
// định của người học nên tự chọn SẴN làm mặc định (đổi thì bấm chip khác, không cần hỏi lại).
// field/industry là Ô CHỮ TỰ DO — hiện rõ "Lần trước: ..." kèm 2 lựa chọn Giữ nguyên/Điền mới
// thay vì âm thầm điền sẵn (yêu cầu người dùng: "hỏi người dùng muốn giữ nguyên hay chọn điền
// mới"). CHỈ lưu ở trình duyệt (localStorage) — không phải dữ liệu cần đồng bộ nhiều thiết bị,
// không cần cột DB riêng.
const PROFILE_KEY = "lea_create_lesson_profile";

function loadRememberedProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
    // Tương thích bản LƯU CŨ (bản gộp Lĩnh vực+Ngành nghề làm 1 "field" duy nhất, đã sửa lại
    // ngay sau khi phát hiện hiểu lầm) — nếu "industry" cũ trống nhưng "description" cũ (bản
    // còn cũ hơn nữa) có giá trị, dùng tạm cho Ngành nghề để không mất trắng dữ liệu đã lưu.
    return { ...raw, industry: raw.industry || raw.description || "" };
  } catch {
    return {};
  }
}

function saveRememberedProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Lỗi lưu (vd Storage đầy/bị chặn) không nên chặn việc tạo bài — bỏ qua, coi như chưa lưu.
  }
}

export function renderCreateLesson(mount) {
  const remembered = loadRememberedProfile();
  const state = {
    level: remembered.level || "B1",
    content_type: "dialogue",
    term_density: remembered.term_density ?? 0,
    // Mặc định "Giữ nguyên" (điền sẵn) nếu có giá trị nhớ từ lần trước — người dùng bấm "Điền
    // mới" thì state.field/industry rỗng lại, xem wire() phần "[data-remember]".
    field: remembered.field || "",
    industry: remembered.industry || "",
    // "Khoá chip + xác nhận đổi lộ trình" — goalLoaded=false lúc đầu (đang hỏi Supabase có mục
    // tiêu 'active' nào không) để KHÔNG đoán bừa hiện chip hay hiện khoá, tránh nháy UI. unlocked
    // = true sau khi người dùng xác nhận "Tạo lộ trình mới" thành công (goal cũ đã archived) —
    // ép form vào đúng trạng thái "chưa có mục tiêu" dù activeGoal có thể còn cache cũ đâu đó.
    goalLoaded: false,
    activeGoal: null,
    unlocked: false,
    confirmOpen: false,
    switching: false,
    switchError: "",
  };
  // Cache streak/tier SAU khi tải xong 1 lần (xem header.js::appHeaderHtml() tham số "cache")
  // — render() gọi lại nhiều lần mỗi khi đổi chip (cấp độ/loại nội dung...), nếu không cache
  // thì header sẽ nhảy về "--"/"..." mỗi lần đổi chip dù đã tải xong trước đó.
  let headerCache = {};

  render();
  loadAppHeaderStats(mount).then((r) => {
    if (r) headerCache = { streakText: r.streak, tierText: r.tier };
  });
  getActiveLearningGoal()
    .then((goal) => {
      state.goalLoaded = true;
      state.activeGoal = goal;
      render();
    })
    .catch(() => {
      // Lỗi mạng lúc CHỈ ĐỌC trạng thái khoá — không nên chặn hẳn việc tạo bài (submit() vẫn tự
      // gọi lại getActiveLearningGoal() thật qua resolveGoalId()), coi như "chưa có mục tiêu" để
      // form vẫn dùng được, chỉ có thể hiện sai icon khoá 1 lần cho tới khi F5.
      state.goalLoaded = true;
      render();
    });

  // Tiêu đề màn NẰM NGAY TRONG app-header (không còn avatar riêng — yêu cầu người dùng "bỏ
  // icon người dùng"), giống hệt cách Yêu thích/Thư viện AI làm (header.js) — không còn <h1>
  // rời bên dưới nữa (tránh lặp tiêu đề 2 lần).
  // ĐANG khoá = đã biết chắc có 1 mục tiêu hoạt động VÀ chưa vừa xác nhận đổi lộ trình. Lúc
  // goalLoaded=false (đang hỏi Supabase), coi như CHƯA khoá để không tự đoán/nháy UI sai —
  // chip vẫn hiện bình thường, chỉ là tạm thời "chưa chắc" trong vài trăm ms đầu.
  function isLocked() {
    return state.goalLoaded && !!state.activeGoal && !state.unlocked;
  }

  function levelAndContentTypeHtml() {
    if (isLocked()) {
      return `
        <button type="button" class="goal-lock-row" id="goal-lock-btn">
          ${icon("lock", { size: 18 })}
          <span>Đang theo lộ trình <strong>${escapeHtml(state.activeGoal.title)}</strong> — bấm để đổi</span>
        </button>
      `;
    }
    return `
      <label class="field">
        <span class="field-question">Bạn đang ở cấp độ nào?</span>
      </label>
      <div class="filter-row" id="level-chip-row">
        ${LEVELS.map((l) => `<button type="button" class="filter-chip level-chip ${l === state.level ? "active" : ""}" data-level="${l}">${l}</button>`).join("")}
      </div>

      <label class="field">
        <span class="field-question">Loại nội dung</span>
      </label>
      <div class="filter-row">
        <button type="button" class="filter-chip content-type-chip ${state.content_type === "dialogue" ? "active" : ""}" data-content-type="dialogue">Hội thoại</button>
        <button type="button" class="filter-chip content-type-chip ${state.content_type === "reading" ? "active" : ""}" data-content-type="reading">Bài đọc</button>
      </div>
    `;
  }

  function advancedOptionsHtml() {
    // Ẩn hẳn khi đang khoá — điền Lĩnh vực/Ngành nghề lúc này KHÔNG có tác dụng thật (submit()
    // vẫn tiếp tục mục tiêu cũ, xem resolveGoalId()), hiện ra dễ hiểu lầm "đổi được ngay".
    if (isLocked()) return "";
    return `
      <details class="advanced-options" ${state.unlocked ? "open" : ""}>
        <summary>Tuỳ chọn nâng cao</summary>
        <label class="field">
          <span class="field-question">Chọn một lĩnh vực bạn muốn khám phá hoặc phát triển.</span>
          ${rememberToggleHtml("field", remembered.field)}
          <input type="text" id="field-input" placeholder="VD: Du lịch" value="${escapeHtml(state.field || "")}" />
        </label>
        <label class="field">
          <span class="field-question">AI cần bạn mô tả một chút về công việc hiện tại để những bài học và chủ đề được tạo ra gần gũi, thiết thực hơn với công việc hằng ngày của bạn.</span>
          ${rememberToggleHtml("industry", remembered.industry)}
          <textarea id="industry-input" rows="2" maxlength="300" placeholder="">${escapeHtml(state.industry || "")}</textarea>
        </label>
        <label class="field">
          <span class="field-question">Bạn muốn khám phá từ vựng chuyên ngành ở mức độ nào trong mỗi bài học?</span>
        </label>
        <div class="filter-row filter-row-wrap">
          ${TERM_DENSITY_OPTIONS.map((n) => `<button type="button" class="filter-chip term-density-chip ${state.term_density === n ? "active" : ""}" data-term-density="${n}">${n}</button>`).join("")}
        </div>
      </details>
    `;
  }

  function confirmModalHtml() {
    if (!state.confirmOpen || !state.activeGoal) return "";
    return `
      <div class="modal-overlay" id="switch-goal-overlay">
        <div class="modal-card">
          <h3>Bạn đã có một lộ trình cho <strong>${escapeHtml(state.activeGoal.title)}</strong></h3>
          <p>AI đang tạo bài học theo lộ trình này. Nếu tạo lộ trình mới, các bài học hiện tại sẽ được <strong>CHUYỂN VÀO MỤC YÊU THÍCH</strong> để bạn giữ lại và học riêng — không bị xoá. AI sẽ ngừng tạo bài tiếp theo cho lộ trình cũ.</p>
          <p>Bạn có chắc muốn tạo lộ trình mới không?</p>
          ${state.switchError ? `<p class="field-hint-error">${escapeHtml(state.switchError)}</p>` : ""}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" id="switch-goal-cancel" ${state.switching ? "disabled" : ""}>Hủy</button>
            <button type="button" class="btn btn-primary" id="switch-goal-confirm" ${state.switching ? "disabled" : ""}>
              ${state.switching ? `<span class="spinner spinner-sm"></span> Đang chuyển...` : "Tạo lộ trình mới"}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    mount.innerHTML = `
      <div class="screen">
        ${appHeaderHtml(`${icon("library", { size: 22 })} Tạo bài học`, headerCache, { showBack: true })}

        ${levelAndContentTypeHtml()}
        ${advancedOptionsHtml()}

        <div id="create-result-slot"></div>
        <button type="button" class="btn btn-primary btn-block" id="create-submit-btn">Tạo bài học</button>
      </div>
      ${confirmModalHtml()}
    `;
    wire();
  }

  // "rememberedValue" có (không rỗng) -> hiện "Lần trước: ..." + 2 nút Giữ nguyên/Điền mới
  // (yêu cầu người dùng) — KHÔNG có (người dùng mới, chưa từng tạo bài) -> không hiện gì,
  // giữ form gọn như cũ.
  function rememberToggleHtml(key, rememberedValue) {
    if (!rememberedValue) return "";
    const isKeeping = state[key] === rememberedValue;
    return `
      <div class="remember-row">
        <span class="remember-hint">Lần trước: “${escapeHtml(rememberedValue)}”</span>
        <div class="remember-actions">
          <button type="button" class="remember-btn ${isKeeping ? "active" : ""}" data-remember="${key}" data-choice="keep">Giữ nguyên</button>
          <button type="button" class="remember-btn ${!isKeeping ? "active" : ""}" data-remember="${key}" data-choice="new">Điền mới</button>
        </div>
      </div>
    `;
  }

  function wire() {
    wireBackLink(mount, () => navigate("/lessons"));
    wireAppHeader(mount);
    mount.querySelectorAll("[data-remember]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.remember;
        state[key] = btn.dataset.choice === "keep" ? remembered[key] : "";
        render();
      });
    });
    mount.querySelectorAll(".level-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.level = chip.dataset.level;
        render();
      });
    });
    mount.querySelectorAll(".content-type-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.content_type = chip.dataset.contentType;
        render();
      });
    });
    mount.querySelectorAll(".term-density-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.term_density = Number(chip.dataset.termDensity);
        render();
      });
    });
    // "Tuỳ chọn nâng cao" (và cả field-input/industry-input bên trong) không render khi đang
    // khoá (advancedOptionsHtml() trả "") — optional chaining để wire() không lỗi trong ca đó.
    mount.querySelector("#field-input")?.addEventListener("input", (e) => (state.field = e.target.value));
    mount.querySelector("#industry-input")?.addEventListener("input", (e) => (state.industry = e.target.value));
    mount.querySelector("#create-submit-btn").addEventListener("click", submit);

    mount.querySelector("#goal-lock-btn")?.addEventListener("click", () => {
      state.confirmOpen = true;
      state.switchError = "";
      render();
    });
    mount.querySelector("#switch-goal-cancel")?.addEventListener("click", () => {
      state.confirmOpen = false;
      render();
    });
    mount.querySelector("#switch-goal-overlay")?.addEventListener("click", (e) => {
      if (e.target.id === "switch-goal-overlay" && !state.switching) {
        state.confirmOpen = false;
        render();
      }
    });
    mount.querySelector("#switch-goal-confirm")?.addEventListener("click", confirmSwitchGoal);
  }

  // "Tạo lộ trình mới" trong modal — gọi mentor_switch_goal (archive goal cũ + favorite bài cũ,
  // KHÔNG xoá gì, xem api/_generate/mentor.js), rồi mở lại đúng luồng chọn ngành như khi CHƯA
  // có mục tiêu nào (unlocked=true -> advancedOptionsHtml() tự render <details open>).
  async function confirmSwitchGoal() {
    state.switching = true;
    state.switchError = "";
    render();
    const res = await switchGoal();
    if (!res.ok) {
      state.switching = false;
      state.switchError = res.error || "Có lỗi xảy ra, vui lòng thử lại.";
      render();
      return;
    }
    state.switching = false;
    state.confirmOpen = false;
    state.activeGoal = null;
    state.unlocked = true;
    render();
  }

  // So khớp Lĩnh vực/Ngành nghề vừa điền với mục tiêu ĐANG HOẠT ĐỘNG hiện tại — KHÔNG PHẢI
  // dùng AI/so khớp ngữ nghĩa (tốn thêm 1 lượt gọi chỉ để "biết có đổi hay không"), so THẲNG với
  // "raw_keywords" đã lưu lúc tạo mục tiêu đó (nguyên văn người dùng từng điền) — vì hồ sơ nhớ
  // lại (loadRememberedProfile ở trên) tự điền lại ĐÚNG NGUYÊN VĂN nếu người dùng không đổi gì,
  // nên so khớp text đơn giản là đủ tin cậy cho ca thường gặp nhất (giữ nguyên, không đổi).
  function matchesActiveGoal(industryText, activeGoal) {
    if (!activeGoal) return false;
    const norm = (s) => (s || "").trim().toLowerCase();
    return norm(industryText) === norm(activeGoal.raw_keywords);
  }

  // Xác định goal_id sẽ dùng để sinh bài — ĐÚNG 3 nhánh theo yêu cầu gốc (Phần A mục 1-4):
  // (1) không điền Lĩnh vực/Ngành nghề khác mục tiêu hiện có -> TIẾP TỤC mục tiêu đó.
  // (2) có điền và KHÁC mục tiêu hiện có (hoặc chưa có mục tiêu nào) -> ĐỔI/TẠO mục tiêu mới
  //     đúng luồng mentor_infer_goal -> mentor_create_goal (bỏ qua bước xác nhận bằng lời của
  //     luồng hội thoại cũ — không còn lớp hội thoại).
  // (3) hoàn toàn chưa điền gì VÀ chưa từng có mục tiêu nào -> mentor_auto_goal (rơi về
  //     "Giao tiếp tổng quát"/skin_general.json, không tốn lượt AI tạo gói ngành mới).
  async function resolveGoalId(onProgress) {
    const activeGoal = await getActiveLearningGoal();
    const industryText = (state.industry || state.field || "").trim();

    if (activeGoal && (!industryText || matchesActiveGoal(industryText, activeGoal))) {
      return { ok: true, goalId: activeGoal.id };
    }

    if (industryText) {
      onProgress("Đang tạo hồ sơ lĩnh vực...");
      const inferRes = await inferGoalProfile(industryText, state.level);
      if (!inferRes.ok) return { ok: false, error: inferRes.error };
      if (inferRes.data.status !== "ok") {
        return { ok: false, error: "AI chưa hiểu rõ lĩnh vực/ngành nghề bạn mô tả, vui lòng viết cụ thể hơn." };
      }
      const createRes = await createGoal(inferRes.data.occupation_profile, industryText, state.level);
      if (!createRes.ok) return { ok: false, error: createRes.error };
      return { ok: true, goalId: createRes.data.goal.id };
    }

    const autoRes = await autoCreateGoal();
    if (!autoRes.ok) return { ok: false, error: autoRes.error };
    return { ok: true, goalId: autoRes.data.goal.id };
  }

  async function submit() {
    const resultSlot = mount.querySelector("#create-result-slot");
    const btn = mount.querySelector("#create-submit-btn");
    btn.disabled = true;
    const setProgress = (text) => {
      resultSlot.innerHTML = `<div class="result-panel result-pending"><div class="spinner spinner-sm"></div> ${escapeHtml(text)}</div>`;
    };
    setProgress("Đang xác định lộ trình...");

    const goalResult = await resolveGoalId(setProgress);
    if (!goalResult.ok) {
      btn.disabled = false;
      resultSlot.innerHTML = `<div class="result-panel result-error">${escapeHtml(goalResult.error || "Có lỗi xảy ra, vui lòng thử lại.")}</div>`;
      return;
    }

    setProgress("AI đang soạn bài theo lộ trình...");
    const res = await generateNextLessonForGoal(goalResult.goalId);
    btn.disabled = false;
    if (!res.ok) {
      resultSlot.innerHTML = `<div class="result-panel result-error">${escapeHtml(res.error || "Có lỗi xảy ra, vui lòng thử lại.")}</div>`;
      return;
    }
    // Nhớ lại cho lần tạo bài KẾ TIẾP (yêu cầu người dùng) — CHỈ lưu sau khi tạo bài THÀNH
    // CÔNG, tránh nhớ nhầm giá trị của 1 lượt gọi lỗi.
    saveRememberedProfile({
      level: state.level,
      term_density: state.term_density,
      field: state.field || "",
      industry: state.industry || "",
    });
    fetchAndSaveLessonCover(res.data.lesson);
    navigate(`/lesson/${res.data.lesson.id}`);
  }
}
