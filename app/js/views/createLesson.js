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
// SỬA TIẾP 2026-07-28 ("Khoá chip + xác nhận đổi lộ trình") — bản đó khoá 2 hàng chip Cấp
// độ/Loại nội dung + ẩn hẳn Tuỳ chọn nâng cao khi đang có mục tiêu hoạt động, bắt buộc qua modal
// xác nhận mới đổi được lĩnh vực.
//
// SỬA LẠI CÙNG NGÀY, LẦN 2 ("khôi phục hiển thị chọn lĩnh vực tự do" — Minh phản hồi sau khi
// test thật: giới hạn 5 lĩnh vực CHỈ là giới hạn PHÂN LOẠI trong Thư mục AI, KHÔNG PHẢI giới hạn
// SINH BÀI — đang ở lĩnh vực nào vẫn sinh bài bình thường ở lĩnh vực đó, người dùng phải đổi
// được lĩnh vực tự do bất cứ lúc nào, không cần khoá/modal xác nhận): bỏ hẳn khoá chip + modal.
// Đủ 5/5 -> Tuỳ chọn nâng cao đổi ô nhập tự do thành DANH SÁCH 5 lĩnh vực đã tạo (chip), CHỌN
// LẠI 1 trong 5 đó KHÔNG tốn thêm lượt (không insert dòng mới, chỉ archive goal active khác rồi
// kích hoạt lại — xem mentor_select_goal trong api/_generate/mentor.js). Gõ lại ĐÚNG tên 1 lĩnh
// vực đã có (khi CHƯA đủ 5) cũng tự nhận ra và chọn lại thay vì tạo trùng, xem
// findExistingGoalByText() bên dưới. "Giao tiếp tổng quát" (bỏ trống form) không tính vào giới
// hạn 5, luôn tạo/tiếp tục tự do.
//
// SỬA LẠI LẦN 3 (2026-07-29, Minh test thật trên điện thoại, phản hồi cụ thể): "form luôn hiện
// đầy đủ" ở trên đi QUÁ XA — khi ĐÃ có 1 lĩnh vực đang hoạt động, Minh muốn lại đúng giao diện
// GỌN cũ: 1 dòng "Bạn đang ở lĩnh vực X (đổi)" + nút "Tạo bài học tiếp" (bấm là sinh bài NGAY
// theo đúng lộ trình đang có, không cần chọn gì thêm — level/loại nội dung/lĩnh vực khi ĐANG
// TIẾP TỤC 1 mục tiêu vốn dĩ KHÔNG được dùng tới, xem mentor_next_lesson trong
// api/_generate/mentor.js: content_type luôn lấy từ spine slot, KHÔNG phải state.content_type).
// Toàn bộ form đầy đủ (chip Cấp độ/Loại nội dung + Tuỳ chọn nâng cao) giờ CHỈ hiện khi CHƯA có
// mục tiêu nào (lần đầu) HOẶC bấm "(đổi)" (xem isCompact()/compactGoalHtml()/fullFormHtml()
// bên dưới) — KHÔNG còn modal/gate nào, "(đổi)" chỉ đơn thuần hiện lại form, bấm "Huỷ" quay về
// đúng dòng gọn ban đầu mà KHÔNG gửi gì lên server.
import { navigate } from "../router.js";
import { fetchAndSaveLessonCover, prefetchLessonAudio } from "../lessonApi.js";
import { inferGoalProfile, createGoal, generateNextLessonForGoal, autoCreateGoal, getGoalUsage, listGoals, selectGoal, setGoalLevel } from "../mentorApi.js";
// getActiveLearningGoal() dùng ở CẢ 2 chỗ: tải sẵn lúc mount (quyết định hiện dòng gọn hay form
// đầy đủ, xem isCompact()) VÀ đọc lại TRỰC TIẾP trong resolveGoalId() lúc submit (không dùng
// state.activeGoal đã tải trước đó — tránh dữ liệu cũ nếu người dùng để màn mở lâu).
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
    // Giới hạn 5 lĩnh vực trọn đời (2026-07-28) — {used, max}, tải cùng lúc với goals để biết
    // ngay có nên hiện ô nhập tự do hay danh sách chọn lại (xem advancedOptionsHtml()).
    goalUsage: null,
    // Danh sách lĩnh vực chuyên ngành đã từng tạo (mentor_list_goals) — null = đang tải, [] =
    // chưa từng tạo lĩnh vực nào. Dùng để hiện chip chọn lại khi đủ 5/5 VÀ để nhận ra người dùng
    // gõ lại ĐÚNG tên 1 lĩnh vực đã có (findExistingGoalByText()) thay vì tạo trùng.
    goals: null,
    // id lĩnh vực người dùng vừa bấm chọn lại (chip, khi đủ 5/5) — ưu tiên cao nhất trong
    // resolveGoalId(), ghi đè field/industry đang gõ dở nếu có.
    selectedGoalId: null,
    // "Bạn đang ở lĩnh vực X (đổi)" (2026-07-29) — goalLoaded=false lúc đầu (đang hỏi Supabase)
    // để KHÔNG đoán bừa hiện dòng gọn hay form đầy đủ, tránh nháy UI (xem isCompact()).
    // changingGoal=true sau khi bấm "(đổi)" -> ép hiện form đầy đủ dù activeGoal vẫn còn, bấm
    // "Huỷ" trả lại false — KHÔNG gọi API nào ở 2 bước này, thuần hiển thị.
    goalLoaded: false,
    activeGoal: null,
    changingGoal: false,
  };
  // header.js::appHeaderHtml() tự đọc cache streak/tier CHUNG CẤP MODULE (2026-07-29) — không
  // cần tự quản 1 bản cache RIÊNG ở đây nữa (bản cũ chỉ giúp trong lượt mount NÀY, không giúp
  // được lúc mới CHUYỂN TỚI màn này từ 1 tab khác — xem ghi chú sharedStatsCache trong header.js).
  render();
  loadAppHeaderStats(mount);
  Promise.all([getActiveLearningGoal(), getGoalUsage(), listGoals()])
    .then(([goal, usageRes, goalsRes]) => {
      state.goalLoaded = true;
      state.activeGoal = goal;
      // Chip trình độ ở dòng gọn (xem compactGoalHtml()) mặc định đúng trình độ THẬT của lĩnh
      // vực đang hoạt động, không phải giá trị nhớ ở localStorage (2 thứ khác nhau — level ở
      // đây gắn với 1 goal_id cụ thể, remembered.level chỉ là gợi ý cho form TẠO MỚI).
      if (goal?.level) state.level = goal.level;
      if (usageRes.ok) state.goalUsage = usageRes.data;
      state.goals = goalsRes.ok ? goalsRes.data.goals : [];
      render();
    })
    .catch(() => {
      // Lỗi mạng lúc CHỈ ĐỌC trạng thái/danh sách lĩnh vực — không nên chặn hẳn việc tạo bài (ô
      // nhập tự do vẫn dùng được, chỉ là chưa hiện được chip chọn lại nếu đang đủ 5/5 cho tới F5,
      // và tạm coi như "chưa có mục tiêu" nên hiện form đầy đủ thay vì dòng gọn).
      state.goalLoaded = true;
      state.goals = state.goals || [];
      render();
    });

  // Tiêu đề màn NẰM NGAY TRONG app-header (không còn avatar riêng — yêu cầu người dùng "bỏ
  // icon người dùng"), giống hệt cách Yêu thích/Thư viện AI làm (header.js) — không còn <h1>
  // rời bên dưới nữa (tránh lặp tiêu đề 2 lần).
  function levelAndContentTypeHtml() {
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

  // Đủ 5/5 lĩnh vực chuyên ngành trọn đời -> KHÔNG cho gõ tự do nữa (chắc chắn sẽ bị chặn ở
  // server), thay bằng chọn lại 1 trong các lĩnh vực đã tạo (xem mentor_select_goal, KHÔNG tốn
  // thêm lượt). goalUsage lỗi tải (null) -> coi như "chưa chắc đủ 5", vẫn hiện ô nhập tự do như
  // bình thường (server vẫn chặn thật nếu sai, đây chỉ là lớp hiển thị sớm).
  function limitReached() {
    return !!state.goalUsage && state.goalUsage.used >= state.goalUsage.max;
  }

  // Đang có 1 mục tiêu hoạt động VÀ chưa bấm "(đổi)" -> hiện dòng gọn (compactGoalHtml()) thay
  // vì cả form (2026-07-29, Minh: "thích giao diện Bạn đang ở lĩnh vực... (đổi), tạo bài học
  // tiếp"). Lúc goalLoaded=false (đang hỏi Supabase), coi như CHƯA có mục tiêu để không tự
  // đoán/nháy UI sai — form đầy đủ hiện tạm vài trăm ms đầu, không phải dòng gọn.
  function isCompact() {
    return state.goalLoaded && !!state.activeGoal && !state.changingGoal;
  }

  function compactGoalHtml() {
    return `
      <div class="current-goal-row">
        <span>Bạn đang ở lĩnh vực <strong>${escapeHtml(state.activeGoal.title)}</strong></span>
        <button type="button" class="link-btn" id="change-goal-btn">Đổi</button>
      </div>
      <label class="field">
        <span class="field-question">Trình độ cho bài tiếp theo</span>
      </label>
      <div class="filter-row" id="level-chip-row">
        ${LEVELS.map((l) => `<button type="button" class="filter-chip level-chip ${l === state.level ? "active" : ""}" data-level="${l}">${l}</button>`).join("")}
      </div>
    `;
  }

  function industryFieldsHtml() {
    if (limitReached()) {
      // Số "đã dùng" có thể VƯỢT 5 (dữ liệu cũ từ trước khi giới hạn có hiệu lực, xem
      // countLifetimeIndustryGoals trong mentor.js không lùi ngày) — hiện "8/5" là con số ĐÚNG
      // nhưng gây hiểu lầm "giới hạn tính sai" (Minh phản hồi thật) nên bỏ hẳn số "đã dùng",
      // chỉ nói rõ giới hạn (max) — không cần chính xác tuyệt đối cho người dùng thấy.
      if (state.goals === null) {
        return `<p class="field-hint">Bạn đã đạt giới hạn ${state.goalUsage.max} lĩnh vực chuyên ngành. Đang tải danh sách...</p>`;
      }
      return `
        <label class="field">
          <span class="field-question">Bạn đã đạt giới hạn ${state.goalUsage.max} lĩnh vực chuyên ngành.</span>
        </label>
        <p class="field-hint">Chọn một lĩnh vực đã tạo để tiếp tục khám phá.</p>
        <div class="goal-chip-list">
          ${state.goals
            .map(
              (g) =>
                `<button type="button" class="goal-pick-btn ${state.selectedGoalId === g.id ? "active" : ""}" data-goal-id="${g.id}">${escapeHtml(g.title)}</button>`
            )
            .join("")}
        </div>
      `;
    }
    return `
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
    `;
  }

  function advancedOptionsHtml() {
    return `
      <details class="advanced-options">
        <summary>Tuỳ chọn nâng cao</summary>
        ${industryFieldsHtml()}
        <label class="field">
          <span class="field-question">Bạn muốn khám phá từ vựng chuyên ngành ở mức độ nào trong mỗi bài học?</span>
        </label>
        <div class="filter-row filter-row-wrap">
          ${TERM_DENSITY_OPTIONS.map((n) => `<button type="button" class="filter-chip term-density-chip ${state.term_density === n ? "active" : ""}" data-term-density="${n}">${n}</button>`).join("")}
        </div>
      </details>
    `;
  }

  // Form đầy đủ (chip Cấp độ/Loại nội dung + Tuỳ chọn nâng cao) — CHỈ dùng khi CHƯA có mục tiêu
  // nào (lần đầu) hoặc đang "(đổi)". Có "activeGoal" -> thêm nút "Huỷ" quay lại dòng gọn, KHÔNG
  // gửi gì lên server (chỉ đổi UI).
  function fullFormHtml() {
    return `
      ${levelAndContentTypeHtml()}
      ${advancedOptionsHtml()}
      ${state.activeGoal ? `<button type="button" class="btn btn-ghost btn-block" id="cancel-change-goal-btn">Huỷ, tiếp tục lĩnh vực hiện tại</button>` : ""}
    `;
  }

  // "loading" (2026-07-29, Minh bắt được): TRƯỚC đây lúc goalLoaded=false, render() tạm coi như
  // "chưa có mục tiêu" nên vẽ NGAY form đầy đủ, rồi vài trăm ms sau goalLoaded xong lại vẽ LẠI
  // thành dòng gọn nếu hoá ra CÓ mục tiêu — người dùng thấy rõ màn hình "nhảy" từ form sang dòng
  // gọn. Giờ khi CHƯA biết chắc, hiện 1 trạng thái TRUNG LẬP (không phải form, không phải dòng
  // gọn) — chỉ vẽ ĐÚNG 1 LẦN sau khi đã biết chắc nên hiện gì.
  function render() {
    const loading = !state.goalLoaded;
    const compact = isCompact();
    const bodyHtml = loading ? `<p class="muted">Đang tải...</p>` : compact ? compactGoalHtml() : fullFormHtml();
    const submitLabel = loading ? "Đang tải..." : compact ? "Tạo bài học tiếp" : "Tạo bài học";
    mount.innerHTML = `
      <div class="screen">
        ${appHeaderHtml(`${icon("library", { size: 22 })} Tạo bài học`, undefined, { showBack: true })}

        ${bodyHtml}

        <div id="create-result-slot"></div>
        <button type="button" class="btn btn-primary btn-block" id="create-submit-btn" ${loading ? "disabled" : ""}>${submitLabel}</button>
      </div>
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
    // Gõ lại ô Lĩnh vực/Ngành nghề -> bỏ chọn chip lĩnh vực cũ nếu có (2 cách chọn loại trừ
    // nhau — tránh gửi cả selectedGoalId lẫn field/industry cùng lúc, resolveGoalId() chỉ ưu
    // tiên selectedGoalId nên field/industry mới gõ sẽ bị ngó lơ nếu không bỏ chọn ở đây).
    mount.querySelector("#field-input")?.addEventListener("input", (e) => {
      state.field = e.target.value;
      state.selectedGoalId = null;
    });
    mount.querySelector("#industry-input")?.addEventListener("input", (e) => {
      state.industry = e.target.value;
      state.selectedGoalId = null;
    });
    mount.querySelector("#create-submit-btn").addEventListener("click", submit);

    // Chip chọn lại 1 lĩnh vực đã tạo (chỉ hiện khi đủ 5/5, xem industryFieldsHtml()) — bấm lại
    // chip đang chọn -> bỏ chọn (giống các chip lọc khác trong app).
    mount.querySelectorAll(".goal-pick-btn").forEach((chip) => {
      chip.addEventListener("click", () => {
        const id = chip.dataset.goalId;
        state.selectedGoalId = state.selectedGoalId === id ? null : id;
        render();
      });
    });

    // "(đổi)" ở dòng gọn / "Huỷ" ở form đầy đủ (2026-07-29) — THUẦN đổi UI, không gọi API nào.
    mount.querySelector("#change-goal-btn")?.addEventListener("click", () => {
      state.changingGoal = true;
      render();
    });
    mount.querySelector("#cancel-change-goal-btn")?.addEventListener("click", () => {
      state.changingGoal = false;
      state.selectedGoalId = null;
      render();
    });
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

  // Tìm 1 lĩnh vực ĐÃ TỪNG tạo (bất kể đang active/archived) có raw_keywords khớp NGUYÊN VĂN
  // với chữ vừa gõ — tránh tạo trùng (tốn 1/5 lượt trọn đời vô ích) khi người dùng gõ lại đúng 1
  // lĩnh vực cũ thay vì bấm chip (chip chỉ hiện khi đã đủ 5/5, khi CHƯA đủ vẫn có thể gõ lại).
  function findExistingGoalByText(industryText) {
    if (!state.goals?.length) return null;
    const norm = (s) => (s || "").trim().toLowerCase();
    return state.goals.find((g) => norm(g.raw_keywords) === norm(industryText)) || null;
  }

  // Xác định goal_id sẽ dùng để sinh bài:
  // (0) đã bấm chip chọn lại 1 lĩnh vực cũ (chỉ hiện khi đủ 5/5) -> kích hoạt lại lĩnh vực đó,
  //     KHÔNG tốn thêm lượt (mentor_select_goal, không insert dòng mới).
  // (1) không điền Lĩnh vực/Ngành nghề khác mục tiêu hiện có -> TIẾP TỤC mục tiêu đó.
  // (2) có điền, khớp ĐÚNG 1 lĩnh vực đã từng tạo trước đó -> kích hoạt lại lĩnh vực đó (như 0).
  // (3) có điền và KHÔNG khớp lĩnh vực nào đã có -> TẠO mục tiêu mới đúng luồng mentor_infer_goal
  //     -> mentor_create_goal (chặn thật ở server nếu đã đủ 5/5, xem insertLearningGoal()).
  // (4) hoàn toàn chưa điền gì VÀ chưa từng có mục tiêu nào -> mentor_auto_goal (rơi về
  //     "Giao tiếp tổng quát"/skin_general.json, không tốn lượt AI tạo gói ngành mới).
  async function resolveGoalId(onProgress) {
    if (state.selectedGoalId) {
      onProgress("Đang chuyển lĩnh vực...");
      const selectRes = await selectGoal(state.selectedGoalId);
      if (!selectRes.ok) return { ok: false, error: selectRes.error };
      return { ok: true, goalId: selectRes.data.goal.id };
    }

    const activeGoal = await getActiveLearningGoal();
    const industryText = (state.industry || state.field || "").trim();

    if (activeGoal && (!industryText || matchesActiveGoal(industryText, activeGoal))) {
      return { ok: true, goalId: activeGoal.id };
    }

    if (industryText) {
      const existing = findExistingGoalByText(industryText);
      if (existing) {
        onProgress("Đang chuyển lĩnh vực...");
        const selectRes = await selectGoal(existing.id);
        if (!selectRes.ok) return { ok: false, error: selectRes.error };
        return { ok: true, goalId: selectRes.data.goal.id };
      }

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

    // "Tạo bài học tiếp" (dòng gọn, đang có mục tiêu hoạt động VÀ chưa bấm "(đổi)") -> đi THẲNG
    // tới mục tiêu đang hoạt động, KHÔNG qua resolveGoalId() — cố tình BỎ QUA field/industry
    // đang nhớ trong localStorage (có thể còn sót giá trị từ lượt TẠO MỚI trước đó, không liên
    // quan gì tới lượt "tiếp tục" này, lỡ đọc nhầm sẽ vô tình đổi sang lĩnh vực khác).
    const goalResult = isCompact() ? { ok: true, goalId: state.activeGoal.id } : await resolveGoalId(setProgress);
    if (!goalResult.ok) {
      btn.disabled = false;
      resultSlot.innerHTML = `<div class="result-panel result-error">${escapeHtml(goalResult.error || "Có lỗi xảy ra, vui lòng thử lại.")}</div>`;
      return;
    }

    // Chip trình độ ở dòng gọn (2026-07-29, "thêm chọn trình độ ra ngoài này") — đổi trước khi
    // sinh bài NẾU khác trình độ hiện có của lĩnh vực này, để mentor_next_lesson đọc đúng level
    // mới ngay lượt này. Bỏ qua khi đang ở form đầy đủ (level ở đó đi kèm resolveGoalId phía trên
    // rồi, không cần PATCH riêng).
    if (isCompact() && state.level !== state.activeGoal.level) {
      setProgress("Đang đổi trình độ...");
      const levelRes = await setGoalLevel(goalResult.goalId, state.level);
      if (!levelRes.ok) {
        btn.disabled = false;
        resultSlot.innerHTML = `<div class="result-panel result-error">${escapeHtml(levelRes.error || "Có lỗi xảy ra, vui lòng thử lại.")}</div>`;
        return;
      }
      state.activeGoal.level = state.level;
    }

    // Thử lại TỰ ĐỘNG ở tầng client (2026-07-28, "Tạo bài học phải luôn ra bài" — mỗi lượt ở đây
    // là 1 request HTTP MỚI, ngân sách 60s MỚI TINH cho server). Đo tỷ lệ lỗi thật phát hiện: 1
    // lượt gọi B2/C1 đơn lẻ đã mất ~27-40s — KHÔNG còn đủ thời gian cho retry NỘI BỘ trong CÙNG
    // request (generate_lesson) chạy trọn vẹn ở 2 cấp này, nên retry ở TẦNG NÀY (fresh request)
    // là cửa DUY NHẤT thật sự hữu ích cho B2/C1. Từ lượt thứ 2 trở đi, CHUYỂN SANG model mạnh
    // hơn (useStrongModel — xem generate_lesson trong lesson.js) thay vì chỉ lặp lại y hệt lượt
    // đầu với cùng model rẻ (đo thật: model rẻ gần như luôn hụt từ ở B2/C1 dù thử bao nhiêu lần).
    const MAX_CLIENT_ATTEMPTS = 3;
    let res;
    for (let attempt = 1; attempt <= MAX_CLIENT_ATTEMPTS; attempt++) {
      setProgress(attempt === 1 ? "AI đang soạn bài theo lộ trình..." : `AI đang thử soạn lại bài (lần ${attempt}/${MAX_CLIENT_ATTEMPTS})...`);
      res = await generateNextLessonForGoal(goalResult.goalId, attempt > 1);
      // Chỉ retry lỗi 502 (AI sinh bài thất bại — CÓ THỂ khác kết quả ở lượt sau). Lỗi khác (403
      // hết hạn mức, 400 lộ trình đã dừng...) sẽ KHÔNG đổi dù thử lại bao nhiêu lần — dừng ngay,
      // đỡ tốn thời gian người dùng chờ vô ích.
      if (res.ok || res.status !== 502) break;
    }
    btn.disabled = false;
    if (!res.ok) {
      // status 502 = "AI trả về dữ liệu không hợp lệ" (lỗi kỹ thuật của LƯỢT SINH BÀI, thứ đang
      // thử retry ở trên) -> thay bằng câu dễ hiểu, không lộ thuật ngữ kỹ thuật. Các status khác
      // (403 hết hạn mức/hết lượt lĩnh vực, 400 lộ trình đã dừng...) đã có message tiếng Việt rõ
      // ràng sẵn từ backend — hiện thẳng, không phải lỗi kỹ thuật cần che.
      const friendlyError = res.status === 502 ? "Không thể tạo bài lúc này, vui lòng thử lại sau ít phút." : res.error;
      resultSlot.innerHTML = `<div class="result-panel result-error">${escapeHtml(friendlyError)}</div>`;
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
    prefetchLessonAudio(res.data.lesson);
    navigate(`/lesson/${res.data.lesson.id}`);
  }
}
