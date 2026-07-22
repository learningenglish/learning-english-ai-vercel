// app/js/views/createLesson.js — form tự nhập "Tạo bài học", KHÔI PHỤC 2026-07-23 sau khi tắt
// UI Mentor AI (chất lượng thật không đạt, "như spam" — quyết định của Minh, backend
// mentor.js/mentor-lines/industry_skins/learning_goals VẪN giữ nguyên, không xoá). Gọi thẳng
// generate_lesson qua createLessonFromAI() (lessonApi.js), KHÔNG qua goal_id/next_slot.
//
// Độ dài: A1/A2 KHÔNG hiện control chọn độ dài (bảng LEVEL_LENGTH_TABLE ở lesson.js cố định 1
// mức cho 2 cấp này — văn bản CEFR A1/A2 là đoạn rời rạc ngắn, không có khái niệm "Dài"). B1
// trở lên hiện 3 chip Ngắn/Vừa/Dài, gửi lên đúng field "length_tier" (server tự tra số từ theo
// cấp, client không tự tính/gửi length_words).
import { navigate } from "../router.js";
import { createLessonFromAI, fetchAndSaveLessonCover } from "../lessonApi.js";
import { escapeHtml } from "../utils.js";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const LEVELS_WITH_LENGTH_CHOICE = ["B1", "B2", "C1"];
const LENGTH_TIERS = [
  { value: "short", label: "Ngắn" },
  { value: "medium", label: "Vừa" },
  { value: "long", label: "Dài" },
];
const TERM_DENSITY_OPTIONS = [10, 20, 30, 40, 50];

export function renderCreateLesson(mount) {
  const state = {
    level: "B1",
    content_type: "dialogue",
    length_tier: "medium",
    term_density: 0,
  };

  render();

  function render() {
    mount.innerHTML = `
      <div class="screen">
        <h1 class="screen-title">Tạo bài học</h1>

        <label class="field">
          <span>Cấp độ</span>
        </label>
        <div class="filter-row" id="level-chip-row">
          ${LEVELS.map((l) => `<button type="button" class="filter-chip level-chip ${l === state.level ? "active" : ""}" data-level="${l}">${l}</button>`).join("")}
        </div>

        <label class="field">
          <span>Loại nội dung</span>
        </label>
        <div class="filter-row">
          <button type="button" class="filter-chip content-type-chip ${state.content_type === "dialogue" ? "active" : ""}" data-content-type="dialogue">Hội thoại</button>
          <button type="button" class="filter-chip content-type-chip ${state.content_type === "reading" ? "active" : ""}" data-content-type="reading">Bài đọc</button>
        </div>

        <div id="length-tier-section" ${LEVELS_WITH_LENGTH_CHOICE.includes(state.level) ? "" : "hidden"}>
          <label class="field">
            <span>Độ dài</span>
          </label>
          <div class="filter-row">
            ${LENGTH_TIERS.map((t) => `<button type="button" class="filter-chip length-tier-chip ${t.value === state.length_tier ? "active" : ""}" data-length-tier="${t.value}">${t.label}</button>`).join("")}
          </div>
        </div>

        <label class="field">
          <span>Chủ đề</span>
          <input type="text" id="topic-input" placeholder="VD: Đặt phòng khách sạn" value="${escapeHtml(state.topic || "")}" />
        </label>

        <label class="field">
          <span>Mô tả thêm (không bắt buộc)</span>
          <textarea id="description-input" rows="2" maxlength="500" placeholder="VD: Dùng thì hiện tại đơn, có tình huống phàn nàn nhẹ">${escapeHtml(state.description || "")}</textarea>
        </label>

        <details class="advanced-options">
          <summary>Tuỳ chọn nâng cao</summary>
          <label class="field">
            <span>Lĩnh vực</span>
            <input type="text" id="field-input" placeholder="VD: Du lịch" value="${escapeHtml(state.field || "")}" />
          </label>
          <label class="field">
            <span>Ngành nghề</span>
            <input type="text" id="industry-input" placeholder="VD: Khách sạn" value="${escapeHtml(state.industry || "")}" />
          </label>
          <label class="field">
            <span>Sản phẩm / Dịch vụ</span>
            <input type="text" id="product-input" placeholder="VD: Phòng deluxe" value="${escapeHtml(state.product || "")}" />
          </label>
          <label class="field">
            <span>Tình huống cụ thể</span>
            <textarea id="situation-input" rows="2" placeholder="VD: Khách phàn nàn vì phòng chưa dọn">${escapeHtml(state.situation || "")}</textarea>
          </label>
          <label class="field">
            <span>Lượng từ chuyên ngành</span>
          </label>
          <div class="filter-row">
            <button type="button" class="filter-chip term-density-chip ${state.term_density === 0 ? "active" : ""}" data-term-density="0">Không có</button>
            ${TERM_DENSITY_OPTIONS.map((n) => `<button type="button" class="filter-chip term-density-chip ${state.term_density === n ? "active" : ""}" data-term-density="${n}">${n}</button>`).join("")}
          </div>
        </details>

        <div id="create-result-slot"></div>
        <button type="button" class="btn btn-primary btn-block" id="create-submit-btn">Tạo bài học</button>
      </div>
    `;
    wire();
  }

  function wire() {
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
    mount.querySelectorAll(".length-tier-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.length_tier = chip.dataset.lengthTier;
        render();
      });
    });
    mount.querySelectorAll(".term-density-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.term_density = Number(chip.dataset.termDensity);
        render();
      });
    });
    mount.querySelector("#topic-input").addEventListener("input", (e) => (state.topic = e.target.value));
    mount.querySelector("#description-input").addEventListener("input", (e) => (state.description = e.target.value));
    mount.querySelector("#field-input").addEventListener("input", (e) => (state.field = e.target.value));
    mount.querySelector("#industry-input").addEventListener("input", (e) => (state.industry = e.target.value));
    mount.querySelector("#product-input").addEventListener("input", (e) => (state.product = e.target.value));
    mount.querySelector("#situation-input").addEventListener("input", (e) => (state.situation = e.target.value));
    mount.querySelector("#create-submit-btn").addEventListener("click", submit);
  }

  async function submit() {
    const resultSlot = mount.querySelector("#create-result-slot");
    const btn = mount.querySelector("#create-submit-btn");
    btn.disabled = true;
    resultSlot.innerHTML = `<div class="result-panel result-pending"><div class="spinner spinner-sm"></div> Đang tạo bài học...</div>`;

    const payload = {
      description: state.description || "",
      level: state.level,
      content_type: state.content_type,
      topic: state.topic || "",
      field: state.field || "",
      industry: state.industry || "",
      product: state.product || "",
      situation: state.situation || "",
      term_density: state.term_density || 0,
    };
    // A1/A2 KHÔNG gửi length_tier — server tự dùng mức cố định của cấp đó (xem lesson.js
    // resolveLengthRange), gửi thừa cũng vô hại (server bỏ qua) nhưng không gửi cho rõ ý.
    if (LEVELS_WITH_LENGTH_CHOICE.includes(state.level)) {
      payload.length_tier = state.length_tier;
    }

    const res = await createLessonFromAI(payload);
    btn.disabled = false;
    if (!res.ok) {
      resultSlot.innerHTML = `<div class="result-panel result-error">${escapeHtml(res.error || "Có lỗi xảy ra, vui lòng thử lại.")}</div>`;
      return;
    }
    fetchAndSaveLessonCover(res.data.lesson);
    navigate(`/lesson/${res.data.lesson.id}`);
  }
}
