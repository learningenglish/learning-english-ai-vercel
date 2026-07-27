// app/js/views/createLesson.js — form tự nhập "Tạo bài học", KHÔI PHỤC 2026-07-23 sau khi tắt
// UI Mentor AI (chất lượng thật không đạt, "như spam" — quyết định của Minh, backend
// mentor.js/mentor-lines/industry_skins/learning_goals VẪN giữ nguyên, không xoá). Gọi thẳng
// generate_lesson qua createLessonFromAI() (lessonApi.js), KHÔNG qua goal_id/next_slot.
//
// ĐƠN GIẢN HOÁ (2026-07-23, yêu cầu người dùng): bỏ hẳn Độ dài (luôn "medium"), Chủ đề (AI tự
// sinh — xem QUY TẮC VỀ CHỦ ĐỀ trong api/_generate/lesson.js), Sản phẩm/Dịch vụ, Tình huống cụ
// thể, và field "Mô tả thêm" ĐỨNG NGOÀI Tuỳ chọn nâng cao (câu hỏi của nó dời VÀO trong, gắn
// vào "Ngành nghề" — xem ghi chú bên dưới). SỬA LẠI 2026-07-23 lần 2: Lĩnh vực + Ngành nghề
// KHÔNG gộp làm 1 — người dùng chỉ yêu cầu bỏ field TRÙNG LẶP nằm NGOÀI "Tuỳ chọn nâng cao",
// còn 2 field NẰM TRONG "Tuỳ chọn nâng cao" (Lĩnh vực, Ngành nghề) vẫn GIỮ NGUYÊN, tách biệt.
import { navigate } from "../router.js";
import { createLessonFromAI, fetchAndSaveLessonCover } from "../lessonApi.js";
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
  };
  // Cache streak/tier SAU khi tải xong 1 lần (xem header.js::appHeaderHtml() tham số "cache")
  // — render() gọi lại nhiều lần mỗi khi đổi chip (cấp độ/loại nội dung...), nếu không cache
  // thì header sẽ nhảy về "--"/"..." mỗi lần đổi chip dù đã tải xong trước đó.
  let headerCache = {};

  render();
  loadAppHeaderStats(mount).then((r) => {
    if (r) headerCache = { streakText: r.streak, tierText: r.tier };
  });

  // Tiêu đề màn NẰM NGAY TRONG app-header (không còn avatar riêng — yêu cầu người dùng "bỏ
  // icon người dùng"), giống hệt cách Yêu thích/Thư viện AI làm (header.js) — không còn <h1>
  // rời bên dưới nữa (tránh lặp tiêu đề 2 lần).
  function render() {
    mount.innerHTML = `
      <div class="screen">
        ${appHeaderHtml(`${icon("library", { size: 22 })} Tạo bài học`, headerCache, { showBack: true })}

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

        <details class="advanced-options">
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

        <div id="create-result-slot"></div>
        <button type="button" class="btn btn-primary btn-block" id="create-submit-btn">Tạo bài học</button>
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
    mount.querySelector("#field-input").addEventListener("input", (e) => (state.field = e.target.value));
    mount.querySelector("#industry-input").addEventListener("input", (e) => (state.industry = e.target.value));
    mount.querySelector("#create-submit-btn").addEventListener("click", submit);
  }

  async function submit() {
    const resultSlot = mount.querySelector("#create-result-slot");
    const btn = mount.querySelector("#create-submit-btn");
    btn.disabled = true;
    resultSlot.innerHTML = `<div class="result-panel result-pending"><div class="spinner spinner-sm"></div> Đang tạo bài học...</div>`;

    // topic/product/situation LUÔN rỗng — không còn ô nhập riêng (đã bỏ/tự động hoá), server
    // tự suy ra chủ đề + tình huống dựa trên Lĩnh vực/Ngành nghề (xem QUY TẮC VỀ CHỦ ĐỀ / QUY
    // TẮC VỀ TÌNH HUỐNG trong api/_generate/lesson.js). length_tier KHÔNG gửi -> server tự
    // dùng mức "medium" mặc định (đã bỏ chọn Độ dài khỏi UI).
    const payload = {
      description: "",
      level: state.level,
      content_type: state.content_type,
      topic: "",
      field: state.field || "",
      industry: state.industry || "",
      product: "",
      situation: "",
      term_density: state.term_density || 0,
    };

    const res = await createLessonFromAI(payload);
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
