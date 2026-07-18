// app/js/views/createLesson.js — màn "Tạo bài học", 2 tab. Đây là màn dùng để đo thời gian
// thật (Phase 0/3 timing test): hiện đồng hồ giây khi đang chờ, và khi xong/lỗi hiện rõ
// tổng thời gian + token + chi phí ước tính + mã lỗi nếu có.
import { navigate } from "../router.js";
import { createLessonFromAI, createLessonFromText, fetchAndSaveLessonCover } from "../lessonApi.js";
import { escapeHtml, countWords } from "../utils.js";
import { icon } from "../icons.js";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const LENGTH_OPTIONS = [
  { value: 100, label: "Ngắn (~100 từ)" },
  { value: 200, label: "Vừa (~200 từ)" },
  { value: 300, label: "Dài (~300 từ)" },
];

// Giá gpt-4o-mini công bố tại thời điểm viết (USD/token) — CHỈ để ước tính hiển thị lúc đo
// Phase 0/3, không dùng để tính tiền thật; có thể lệch nếu OpenAI đổi giá sau này.
const PRICE_PER_TOKEN = { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 };

export function renderCreateLesson(mount, params) {
  const initialTab = params?.[0] === "text" ? "text" : "ai";
  let timerInterval = null;

  mount.innerHTML = `
    <div class="screen">
      <h1 class="screen-title">Tạo bài học</h1>
      <div class="tabs" role="tablist">
        <button type="button" class="tab-btn ${initialTab === "ai" ? "active" : ""}" data-tab="ai">AI tạo bài học</button>
        <button type="button" class="tab-btn ${initialTab === "text" ? "active" : ""}" data-tab="text">Tôi có văn bản</button>
      </div>
      <div id="tab-panel"></div>
    </div>
  `;

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  mount.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      mount.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      stopTimer();
      renderPanel(btn.dataset.tab);
    });
  });

  renderPanel(initialTab);

  function renderPanel(tab) {
    const panel = mount.querySelector("#tab-panel");
    panel.innerHTML = tab === "ai" ? aiFormHtml() : textFormHtml();
    if (tab === "ai") wireAiForm(panel);
    else wireTextForm(panel);
  }

  function aiFormHtml() {
    return `
      <form id="ai-form" class="lesson-form">
        <label class="field">
          <span>Mô tả ý tưởng của bạn</span>
          <textarea name="description" maxlength="500" rows="3" placeholder="VD: Hội thoại tại quầy check-in sân bay"></textarea>
        </label>
        <div class="field-row">
          <label class="field">
            <span>Cấp độ</span>
            <select name="level">${LEVELS.map((l) => `<option value="${l}">${l}</option>`).join("")}</select>
          </label>
          <label class="field">
            <span>Loại nội dung</span>
            <select name="content_type">
              <option value="dialogue">Hội thoại</option>
              <option value="reading">Bài đọc</option>
            </select>
          </label>
        </div>
        <label class="field">
          <span>Chủ đề</span>
          <input type="text" name="topic" placeholder="VD: Giao tiếp hằng ngày" />
        </label>
        <label class="field">
          <span>Độ dài</span>
          <select name="length_words">${LENGTH_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}</select>
        </label>

        <details class="advanced-options">
          <summary>Tùy chọn nâng cao</summary>
          <label class="field">
            <span>Lĩnh vực</span>
            <input type="text" name="field" placeholder="VD: Du lịch" />
          </label>
          <label class="field">
            <span>Ngành nghề</span>
            <input type="text" name="industry" placeholder="VD: Khách sạn" />
          </label>
          <label class="field">
            <span>Sản phẩm / Dịch vụ</span>
            <input type="text" name="product" placeholder="VD: Dịch vụ đặt phòng" />
          </label>
          <label class="field">
            <span>Tình huống</span>
            <textarea name="situation" rows="2" placeholder="VD: Khách phàn nàn vì phòng chưa dọn, nhân viên xin lỗi và xử lý"></textarea>
          </label>
          <label class="field">
            <span>Lượng từ chuyên ngành</span>
            <select name="term_density">
              <option value="0">Không</option>
              <option value="10">10 từ</option>
              <option value="20">20 từ</option>
              <option value="30">30 từ</option>
              <option value="40">40 từ</option>
              <option value="50">50 từ</option>
            </select>
          </label>
        </details>

        <!-- CHỈ DÙNG ĐỂ ĐO THỜI GIAN (Phase 0/3) — TODO(xoá trước khi merge feature/student-app vào main) -->
        <button type="button" class="btn btn-ghost btn-block test-fill-btn" id="test-fill-btn">
          ${icon("flask", { size: 16 })} Điền mẫu test (bài nặng nhất) — xoá trước khi merge
        </button>

        <div id="result-slot"></div>
        <button type="submit" class="btn btn-primary btn-block" id="ai-submit">Tạo nội dung</button>
      </form>
    `;
  }

  function textFormHtml() {
    return `
      <form id="text-form" class="lesson-form">
        <label class="field">
          <span>Dán văn bản của bạn</span>
          <textarea name="user_text" rows="10" placeholder="Dán văn bản tiếng Anh vào đây..."></textarea>
        </label>
        <p class="field-hint" id="text-wordcount">0 từ (tối thiểu 20, tối đa 3000)</p>
        <label class="field">
          <span>Cấp độ của tôi</span>
          <select name="level">${LEVELS.map((l) => `<option value="${l}">${l}</option>`).join("")}</select>
        </label>
        <div id="result-slot"></div>
        <button type="submit" class="btn btn-primary btn-block" id="text-submit">Phân tích</button>
      </form>
    `;
  }

  function wireAiForm(panel) {
    const form = panel.querySelector("#ai-form");

    panel.querySelector("#test-fill-btn").addEventListener("click", () => {
      form.description.value = "Khách phàn nàn vì phòng chưa dọn, nhân viên khách sạn xin lỗi và xử lý tình huống";
      form.level.value = "B2";
      form.content_type.value = "dialogue";
      form.topic.value = "Khách sạn - Xử lý phàn nàn";
      form.length_words.value = "300";
      form.field.value = "Du lịch";
      form.industry.value = "Khách sạn";
      form.product.value = "Dịch vụ đặt phòng khách sạn";
      form.situation.value = "Khách phàn nàn vì phòng chưa dọn, nhân viên xin lỗi và xử lý";
      form.term_density.value = "30";
      panel.querySelector("details.advanced-options").open = true;
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = {
        description: (fd.get("description") || "").trim(),
        level: fd.get("level"),
        content_type: fd.get("content_type"),
        topic: (fd.get("topic") || "").trim(),
        length_words: Number(fd.get("length_words")) || 200,
        field: (fd.get("field") || "").trim(),
        industry: (fd.get("industry") || "").trim(),
        product: (fd.get("product") || "").trim(),
        situation: (fd.get("situation") || "").trim(),
        term_density: Number(fd.get("term_density")) || 0,
      };
      await submitCreate(panel, form, () => createLessonFromAI(payload));
    });
  }

  function wireTextForm(panel) {
    const form = panel.querySelector("#text-form");
    const textarea = form.user_text;
    const wc = panel.querySelector("#text-wordcount");

    textarea.addEventListener("input", () => {
      const n = countWords(textarea.value);
      const outOfRange = n < 20 || n > 3000;
      wc.textContent = `${n} từ` + (n < 20 ? " (tối thiểu 20 từ)" : n > 3000 ? " (tối đa 3000 từ, chia nhỏ ra)" : "");
      wc.classList.toggle("field-hint-error", outOfRange);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = form.user_text.value;
      const n = countWords(text);
      const resultSlot = panel.querySelector("#result-slot");
      if (n < 20) {
        resultSlot.innerHTML = `<div class="result-panel result-error">Văn bản quá ngắn (tối thiểu 20 từ).</div>`;
        return;
      }
      if (n > 3000) {
        resultSlot.innerHTML = `<div class="result-panel result-error">Văn bản quá dài (tối đa 3000 từ), vui lòng chia nhỏ.</div>`;
        return;
      }
      await submitCreate(panel, form, () => createLessonFromText(text, form.level.value));
    });
  }

  async function submitCreate(panel, form, callFn) {
    const submitBtn = form.querySelector('button[type="submit"]');
    const resultSlot = panel.querySelector("#result-slot");
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true; // chống bấm đúp

    const startedAt = performance.now();
    resultSlot.innerHTML = `
      <div class="result-panel result-pending">
        <div class="spinner"></div>
        <div>Đang tạo bài học... <strong id="elapsed-seconds">0.0s</strong></div>
        <div class="muted">Việc này thường mất 20–60 giây, đừng tắt màn hình.</div>
      </div>
    `;
    const elapsedEl = resultSlot.querySelector("#elapsed-seconds");
    stopTimer();
    timerInterval = setInterval(() => {
      elapsedEl.textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
    }, 200);

    try {
      const res = await callFn();
      stopTimer();
      const totalSeconds = (performance.now() - startedAt) / 1000;
      if (!res.ok) {
        resultSlot.innerHTML = errorPanelHtml(totalSeconds, res.status, res.error);
      } else {
        const { lesson, meta } = res.data;
        resultSlot.innerHTML = successPanelHtml(totalSeconds, meta, lesson);
        resultSlot.querySelector("#goto-lesson-btn")?.addEventListener("click", () => navigate(`/lesson/${lesson.id}`));
        // Tự động lấy + lưu ảnh bìa NGAY, không cần bấm gì — chạy RỜI, không await (không
        // trễ màn kết quả đang hiện). Xem ghi chú đầy đủ ở lessonApi.js.
        fetchAndSaveLessonCover(lesson);
      }
    } catch (err) {
      stopTimer();
      const totalSeconds = (performance.now() - startedAt) / 1000;
      resultSlot.innerHTML = errorPanelHtml(totalSeconds, null, err?.message || "Lỗi không xác định.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  }

  function successPanelHtml(totalSeconds, meta, lesson) {
    const usage = meta?.usage;
    const cost = usage
      ? usage.prompt_tokens * PRICE_PER_TOKEN.input + usage.completion_tokens * PRICE_PER_TOKEN.output
      : null;
    return `
      <div class="result-panel result-success">
        <div class="result-title icon-text">${icon("check-circle", { size: 18 })} Đã tạo xong: ${escapeHtml(lesson.title_vi || lesson.title)}</div>
        <div class="result-metrics">
          <div class="icon-text">${icon("clock", { size: 14 })} Tổng thời gian: <strong>${totalSeconds.toFixed(1)}s</strong>${meta?.openai_duration_ms != null ? ` (AI: ${(meta.openai_duration_ms / 1000).toFixed(1)}s)` : ""}</div>
          ${usage ? `<div class="icon-text">${icon("hash", { size: 14 })} Token: ${usage.prompt_tokens} in / ${usage.completion_tokens} out (${usage.total_tokens} tổng)</div>` : ""}
          ${cost != null ? `<div class="icon-text">${icon("dollar-sign", { size: 14 })} Chi phí ước tính: $${cost.toFixed(5)}</div>` : ""}
        </div>
        <button type="button" class="btn btn-primary btn-block" id="goto-lesson-btn">Xem bài học ${icon("chevron-right", { size: 16 })}</button>
      </div>
    `;
  }

  function errorPanelHtml(totalSeconds, status, message) {
    return `
      <div class="result-panel result-error">
        <div class="result-title icon-text">${icon("x-circle", { size: 18 })} Không tạo được bài học</div>
        <div class="icon-text">${icon("clock", { size: 14 })} Đã chờ: <strong>${totalSeconds.toFixed(1)}s</strong></div>
        <div>Mã lỗi: ${status != null ? escapeHtml(String(status)) : "—"} — ${escapeHtml(message || "")}</div>
      </div>
    `;
  }

  return function teardown() {
    stopTimer();
  };
}
