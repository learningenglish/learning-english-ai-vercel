// app/js/views/mentorGoal.js — luồng "tạo mục tiêu mới" (Đợt 3 mục 6.3 + Bước 4 mục 3.4), mở từ
// nút (+) nổi trong màn Mentor AI. TOÀN BỘ câu chữ ở đây phải qua được QUY TẮC ĐỒNG HÀNH: bất kỳ
// lúc nào cũng phải có đường tiếp tục nếu người dùng muốn, không được dùng nút mặc định để khoá
// lối. AI CHỈ được gọi đúng 1 lần ở Bước 3 (inferGoalProfile -> chân dung nghề, hoặc bỏ qua hoàn
// toàn nếu bấm "Bạn cứ để tôi tự chọn giúp") — Bước 4 gọi generateNextLessonForGoal là lượt AI
// CÒN LẠI trong 2 điểm cho phép của Đợt 3 mục 5 (sinh bài học thật, không phải sinh câu thoại).
//
// Câu thoại Mentor ở màn này lấy từ kho lời thoại (api/_generate/mentor-lines/*.json, đã đóng
// băng) qua backend — mentor_check_goal_gate trả sẵn inviteLine/resumeTop/resumeBottom/message,
// mentor_infer_goal trả sẵn confirm_text; view này CHỈ hiển thị, không tự ghép câu.
import { navigate } from "../router.js";
import {
  checkGoalGate,
  inferGoalProfile,
  createGoal,
  autoCreateGoal,
  generateNextLessonForGoal,
  getTransientLine,
} from "../mentorApi.js";
import { createLessonFromText, fetchAndSaveLessonCover } from "../lessonApi.js";
import { escapeHtml, countWords } from "../utils.js";
import { icon } from "../icons.js";

const GOAL_CHIPS = ["Giao tiếp", "Phỏng vấn xin việc", "IT", "Du lịch", "Kinh doanh", "Xuất nhập khẩu"];
const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const DEFAULT_CREATING_TEXT = "Đang chuẩn bị bài học đầu tiên cho bạn...";

export function renderMentorGoalFlow(mount) {
  const state = {
    step: "loading-gate",
    rawText: "",
    level: null,
    occupationProfile: null,
    confirmText: "",
    creatingText: DEFAULT_CREATING_TEXT,
    inviteLine: "",
    gateInfo: null,
    resumeInfo: null,
    goal: null,
    retryFn: null,
  };

  checkGoalGate()
    .then((res) => {
      if (!res.ok) {
        state.step = "input";
        renderStep();
        return;
      }
      state.inviteLine = res.data.inviteLine || "";
      state.gateInfo = res.data.shouldGate ? res.data : null;
      state.resumeInfo = res.data.hasHistory ? res.data : null;
      if (state.resumeInfo) {
        state.rawText = state.resumeInfo.rawKeywords || "";
        state.level = state.resumeInfo.level || null;
      }
      state.step = state.gateInfo ? "gate" : state.resumeInfo ? "resume" : "input";
      renderStep();
    })
    .catch(() => {
      state.step = "input"; // lỗi mạng lúc kiểm tra chặn -> không chặn oan, cứ cho vào thẳng Bước 1
      renderStep();
    });

  renderStep();

  function renderStep() {
    if (state.step === "loading-gate") return renderShell(`<p class="muted">Đang kiểm tra...</p>`);
    if (state.step === "gate") return renderGate();
    if (state.step === "resume") return renderResume();
    if (state.step === "input") return renderInput();
    if (state.step === "level") return renderLevel();
    if (state.step === "confirm-loading") return renderConfirmLoading();
    if (state.step === "confirm") return renderConfirm();
    if (state.step === "confirm-unclear") return renderConfirmUnclear();
    if (state.step === "creating") return renderCreating();
    if (state.step === "creating-error") return renderCreatingError();
    if (state.step === "result") return renderResult();
  }

  function renderShell(innerHtml) {
    mount.innerHTML = `<div class="screen"><h1 class="screen-title">Mục tiêu mới</h1>${innerHtml}</div>`;
  }

  // Bước 0 — chặn CÓ ĐIỀU KIỆN, [Vẫn muốn tạo mới] LUÔN bấm được (Quy tắc Đồng hành).
  function renderGate() {
    renderShell(`
      <div class="card">
        <p>${escapeHtml(state.gateInfo.message)}</p>
        <div class="director-card-actions">
          <button type="button" class="btn btn-primary btn-block" id="gate-keep-old">Học tiếp cái cũ</button>
          <button type="button" class="btn btn-ghost btn-block" id="gate-new">Vẫn muốn tạo mới</button>
        </div>
      </div>
    `);
    mount.querySelector("#gate-keep-old").addEventListener("click", () => navigate("/mentor"));
    mount.querySelector("#gate-new").addEventListener("click", () => {
      state.step = state.resumeInfo ? "resume" : "input";
      renderStep();
    });
  }

  // Trường hợp B (Bước 4 mục 3.4 điểm 2) — đã có mục tiêu trước đó. Lớp trên CHỈ ĐỌC (resumeTop,
  // ghi nhận sự kiện, không suy diễn), lớp dưới SỬA ĐƯỢC (raw_keywords + cấp độ trong 1 ô, vì dữ
  // liệu gốc là 1 đoạn tự do, không phải 3 field riêng như skin.js).
  function renderResume() {
    renderShell(`
      <div class="card">
        <p class="muted">${escapeHtml(state.resumeInfo.resumeTop)}</p>
      </div>
      <label class="field">
        <span>${escapeHtml(state.resumeInfo.resumeBottom)}</span>
        <textarea id="resume-keywords-text" rows="3" maxlength="500">${escapeHtml(state.rawText)}</textarea>
      </label>
      <label class="field">
        <span>Cấp độ của bạn</span>
        <select id="resume-level-select">
          <option value="">Chưa chắc, gợi ý giúp</option>
          ${LEVELS.map((l) => `<option value="${l}" ${state.level === l ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </label>
      <button type="button" class="btn btn-primary btn-block" id="resume-continue">Dùng những thông tin này, tạo mục tiêu mới</button>
      <button type="button" class="btn btn-ghost btn-block" id="resume-fresh">Bắt đầu một hướng hoàn toàn mới</button>
    `);
    mount.querySelector("#resume-continue").addEventListener("click", () => {
      const text = mount.querySelector("#resume-keywords-text").value.trim();
      if (!text) return;
      state.rawText = text;
      state.level = mount.querySelector("#resume-level-select").value || null;
      state.step = "confirm-loading";
      renderStep();
      runInferProfile();
    });
    mount.querySelector("#resume-fresh").addEventListener("click", () => {
      state.rawText = "";
      state.level = null;
      state.resumeInfo = null; // rời hẳn màn B trong phiên này, không quay lại nữa
      state.step = "input";
      renderStep();
    });
  }

  // Bước 1 — câu mở TRUNG TÍNH lấy từ kho (shared.invite_goal, KHÔNG phải câu hỏi/mời chọn —
  // xem README.md của kho), + chip + lựa chọn phụ "Tôi có văn bản" (GIỮ NGUYÊN chức năng cũ) +
  // nút riêng "Bạn cứ để tôi tự chọn giúp" (mục 3.3/3.4 Đợt 3, input rỗng -> không gọi AI).
  function renderInput() {
    renderShell(`
      <label class="field">
        <span>${escapeHtml(state.inviteLine || "Bạn muốn học tiếng Anh cho việc gì cũng được, không bắt buộc phải điền.")}</span>
        <textarea id="goal-input-text" rows="3" maxlength="500" placeholder="VD: Logistics xuất nhập khẩu, giao tiếp với đối tác nước ngoài">${escapeHtml(state.rawText)}</textarea>
      </label>
      <div class="filter-row goal-chip-row">
        ${GOAL_CHIPS.map((c) => `<button type="button" class="filter-chip goal-chip" data-chip="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("")}
      </div>
      <button type="button" class="btn btn-ghost btn-block" id="toggle-paste-text">${icon("bookmark", { size: 16 })} Hoặc dán sẵn một đoạn văn bản bạn muốn học</button>
      <div id="paste-text-panel" hidden></div>
      <button type="button" class="btn btn-primary btn-block" id="goal-input-continue">Tiếp tục</button>
      <button type="button" class="btn btn-ghost btn-block" id="goal-auto-btn">Bạn cứ để tôi tự chọn giúp</button>
    `);

    mount.querySelectorAll(".goal-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        mount.querySelector("#goal-input-text").value = chip.dataset.chip;
      });
    });
    mount.querySelector("#toggle-paste-text").addEventListener("click", () => {
      const panel = mount.querySelector("#paste-text-panel");
      panel.hidden = !panel.hidden;
      if (!panel.hidden && !panel.dataset.wired) {
        panel.dataset.wired = "1";
        renderPasteTextPanel(panel);
      }
    });
    mount.querySelector("#goal-input-continue").addEventListener("click", () => {
      const text = mount.querySelector("#goal-input-text").value.trim();
      if (!text) return;
      state.rawText = text;
      state.step = "level";
      renderStep();
    });
    mount.querySelector("#goal-auto-btn").addEventListener("click", runAutoGoal);
  }

  // "Tôi có văn bản" — GIỮ NGUYÊN hành vi cũ (analyze_user_text, 20-3000 từ), phân tích RIÊNG
  // thành 1 bài đọc/hội thoại độc lập, KHÔNG đi qua mục tiêu (khác luồng chân dung nghề).
  function renderPasteTextPanel(panel) {
    panel.innerHTML = `
      <label class="field">
        <span>Dán văn bản của bạn</span>
        <textarea id="paste-text-input" rows="8" placeholder="Dán văn bản tiếng Anh vào đây..."></textarea>
      </label>
      <p class="field-hint" id="paste-wordcount">0 từ (tối thiểu 20, tối đa 3000)</p>
      <label class="field">
        <span>Cấp độ của bạn</span>
        <select id="paste-level">${LEVELS.map((l) => `<option value="${l}">${l}</option>`).join("")}</select>
      </label>
      <div id="paste-result-slot"></div>
      <button type="button" class="btn btn-primary btn-block" id="paste-submit-btn">Phân tích</button>
    `;
    const textarea = panel.querySelector("#paste-text-input");
    const wc = panel.querySelector("#paste-wordcount");
    textarea.addEventListener("input", () => {
      const n = countWords(textarea.value);
      const outOfRange = n < 20 || n > 3000;
      wc.textContent = `${n} từ` + (n < 20 ? " (tối thiểu 20 từ)" : n > 3000 ? " (tối đa 3000 từ, chia nhỏ ra)" : "");
      wc.classList.toggle("field-hint-error", outOfRange);
    });
    panel.querySelector("#paste-submit-btn").addEventListener("click", async () => {
      const text = textarea.value;
      const n = countWords(text);
      const resultSlot = panel.querySelector("#paste-result-slot");
      if (n < 20) {
        resultSlot.innerHTML = `<div class="result-panel result-error">Văn bản quá ngắn (tối thiểu 20 từ).</div>`;
        return;
      }
      if (n > 3000) {
        resultSlot.innerHTML = `<div class="result-panel result-error">Văn bản quá dài (tối đa 3000 từ), vui lòng chia nhỏ.</div>`;
        return;
      }
      const btn = panel.querySelector("#paste-submit-btn");
      btn.disabled = true;
      resultSlot.innerHTML = `<div class="result-panel result-pending"><div class="spinner spinner-sm"></div> Đang phân tích...</div>`;
      const res = await createLessonFromText(text, panel.querySelector("#paste-level").value);
      btn.disabled = false;
      if (!res.ok) {
        resultSlot.innerHTML = `<div class="result-panel result-error">${escapeHtml(res.error || "Có lỗi xảy ra.")}</div>`;
        return;
      }
      fetchAndSaveLessonCover(res.data.lesson);
      navigate(`/lesson/${res.data.lesson.id}`);
    });
  }

  // Bước 2 — cấp độ (tùy chọn).
  function renderLevel() {
    renderShell(`
      <p class="muted">Cấp độ hiện tại của bạn</p>
      <div class="filter-row">
        ${LEVELS.map((l) => `<button type="button" class="filter-chip level-chip" data-level="${l}">${l}</button>`).join("")}
        <button type="button" class="filter-chip level-chip" data-level="">Chưa chắc, gợi ý giúp</button>
      </div>
      <button type="button" class="btn btn-ghost btn-block" id="level-back">Quay lại</button>
    `);
    mount.querySelectorAll(".level-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.level = chip.dataset.level || null;
        state.step = "confirm-loading";
        renderStep();
        runInferProfile();
      });
    });
    mount.querySelector("#level-back").addEventListener("click", () => {
      state.step = "input";
      renderStep();
    });
  }

  // Bước 3 (đang chờ AI) — AI CALL #1/2 của Đợt 3 mục 5.
  function renderConfirmLoading() {
    renderShell(`<div class="card"><div class="spinner"></div><p class="muted" style="text-align:center">Tôi đang tìm hiểu mục tiêu của bạn...</p></div>`);
  }

  async function runInferProfile() {
    const res = await inferGoalProfile(state.rawText, state.level);
    if (!res.ok || res.data.status !== "ok") {
      state.step = "confirm-unclear";
      renderStep();
      return;
    }
    state.occupationProfile = res.data.occupation_profile;
    state.confirmText = res.data.confirm_text;
    state.step = "confirm";
    renderStep();
  }

  // Chưa suy luận rõ được (skin.js "needs_user_question") — QUY TẮC ĐỒNG HÀNH: KHÔNG phải
  // màn lỗi chặn đường, luôn có nút quay lại sửa mô tả, giữ nguyên nội dung đã nhập.
  function renderConfirmUnclear() {
    renderShell(`
      <div class="card">
        <p>Tôi chưa hiểu rõ mục tiêu này lắm, bạn mô tả chi tiết hơn được không?</p>
        <button type="button" class="btn btn-primary btn-block" id="unclear-retry">Mô tả lại</button>
      </div>
    `);
    mount.querySelector("#unclear-retry").addEventListener("click", () => {
      state.step = "input";
      renderStep();
    });
  }

  // Bước 3 (đã có kết quả) — confirm_text ghép sẵn ở backend (confirm_wrapper.open/close từ kho
  // + dữ liệu occupation_profile THẬT ở giữa), view chỉ hiển thị, KHÔNG tự ghép câu.
  function renderConfirm() {
    renderShell(`
      <div class="card">
        <p>${escapeHtml(state.confirmText)}</p>
        <div class="director-card-actions">
          <button type="button" class="btn btn-primary btn-block" id="confirm-yes">Đúng rồi, bắt đầu</button>
          <button type="button" class="btn btn-ghost btn-block" id="confirm-retry">Nói lại cho rõ hơn</button>
        </div>
      </div>
    `);
    mount.querySelector("#confirm-yes").addEventListener("click", () => goToCreating(runCreateGoalAndFirstLesson));
    // Quay về Bước 1 GIỮ nguyên nội dung đã nhập để sửa nhanh, không mất trắng (yêu cầu rõ ở mục 6.3).
    mount.querySelector("#confirm-retry").addEventListener("click", () => {
      state.step = "input";
      renderStep();
    });
  }

  // Bước 4 — chờ, giữ giọng đồng hành (transient.loading_first_lesson từ kho). AI CALL #2/2 của
  // Đợt 3 mục 5 (sinh bài học thật) chạy trong runFn truyền vào goToCreating().
  async function goToCreating(runFn) {
    state.retryFn = runFn;
    const lineRes = await getTransientLine("loading_first_lesson").catch(() => null);
    state.creatingText = lineRes?.ok ? lineRes.data.text : DEFAULT_CREATING_TEXT;
    state.step = "creating";
    renderStep();
    runFn();
  }

  function renderCreating() {
    renderShell(`<div class="card"><div class="spinner"></div><p class="muted" style="text-align:center">${escapeHtml(state.creatingText)}</p></div>`);
  }

  async function runCreateGoalAndFirstLesson() {
    const goalRes = await createGoal(state.occupationProfile, state.rawText, state.level);
    if (!goalRes.ok) {
      state.step = "creating-error";
      renderStep();
      return;
    }
    state.goal = goalRes.data.goal;
    state.confirmation = goalRes.data.confirmation;
    await runGenerateLessonOnly();
  }

  async function runGenerateLessonOnly() {
    const lessonRes = await generateNextLessonForGoal(state.goal.id);
    if (!lessonRes.ok) {
      state.step = "creating-error";
      renderStep();
      return;
    }
    state.lesson = lessonRes.data.lesson;
    fetchAndSaveLessonCover(state.lesson);
    state.step = "result";
    renderStep();
  }

  // "Bạn cứ để tôi tự chọn giúp" (mục 3.3/3.4 Đợt 3) — KHÔNG gọi AI: có lịch sử thì lặp lại mục
  // tiêu gần nhất, trắng hoàn toàn thì dùng "Giao tiếp tổng quát" (backend: mentor_auto_goal).
  // Bỏ qua Bước 2/3 vì không có gì mới để hỏi lại.
  async function runAutoGoal() {
    const btn = mount.querySelector("#goal-auto-btn");
    if (btn) btn.disabled = true;
    const res = await autoCreateGoal();
    if (!res.ok) {
      if (btn) btn.disabled = false;
      alert(res.error || "Không tạo được mục tiêu, thử lại nhé.");
      return;
    }
    state.goal = res.data.goal;
    state.confirmation = res.data.confirmation;
    await goToCreating(runGenerateLessonOnly);
  }

  function renderCreatingError() {
    renderShell(`
      <div class="card">
        <p class="error-text">Có lỗi khi chuẩn bị bài học, thử lại nhé.</p>
        <button type="button" class="btn btn-primary btn-block" id="creating-retry">Thử lại</button>
        <button type="button" class="btn btn-ghost btn-block" id="creating-back">Quay lại Mentor AI</button>
      </div>
    `);
    mount.querySelector("#creating-retry").addEventListener("click", () => goToCreating(state.retryFn));
    mount.querySelector("#creating-back").addEventListener("click", () => navigate("/mentor"));
  }

  // Bước 5 — màn 3 dòng ĐÃ DUYỆT TỪ TRƯỚC (buildConfirmationDisplay ở skin.js), giữ nguyên.
  function renderResult() {
    const c = state.confirmation;
    renderShell(`
      <div class="card mentor-result-card">
        <div class="mentor-result-line-1">${escapeHtml(c.title_line)}</div>
        <div class="mentor-result-line-2">${escapeHtml(c.topic_line)}</div>
        <div class="mentor-result-line-3">${escapeHtml(c.invite_line)}</div>
        <button type="button" class="btn btn-primary btn-block" id="result-start-btn">Bắt đầu học</button>
      </div>
    `);
    mount.querySelector("#result-start-btn").addEventListener("click", () => navigate(`/lesson/${state.lesson.id}`));
  }
}
