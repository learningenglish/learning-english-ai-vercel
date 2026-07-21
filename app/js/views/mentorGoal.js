// app/js/views/mentorGoal.js — luồng "tạo mục tiêu mới" (Đợt 3 mục 6.3), mở từ nút (+) nổi
// trong màn Mentor AI. 6 bước (0 chặn có điều kiện, 1 câu hỏi mở, 2 cấp độ, 3 xác nhận bằng
// lời, 4 chờ, 5 kết quả) — TOÀN BỘ câu chữ ở đây phải qua được QUY TẮC ĐỒNG HÀNH: bất kỳ lúc
// nào cũng phải có đường tiếp tục nếu người dùng muốn, không được dùng nút mặc định để khoá
// lối. AI CHỈ được gọi đúng 1 lần ở Bước 3 (inferGoalProfile -> chân dung nghề) — Bước 4 gọi
// generateNextLessonForGoal là lượt AI CÒN LẠI trong 2 điểm cho phép của Đợt 3 mục 5 (sinh
// bài học thật, không phải sinh câu thoại).
import { navigate } from "../router.js";
import { checkGoalGate, inferGoalProfile, createGoal, generateNextLessonForGoal } from "../mentorApi.js";
import { createLessonFromText, fetchAndSaveLessonCover } from "../lessonApi.js";
import { escapeHtml, countWords } from "../utils.js";
import { icon } from "../icons.js";

const GOAL_CHIPS = ["Giao tiếp", "Phỏng vấn xin việc", "IT", "Du lịch", "Kinh doanh", "Xuất nhập khẩu"];
const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

export function renderMentorGoalFlow(mount) {
  const state = {
    step: "loading-gate",
    rawText: "",
    level: null,
    occupationProfile: null,
    goal: null,
  };

  checkGoalGate()
    .then((res) => {
      state.step = res.ok && res.data.shouldGate ? "gate" : "input";
      state.gateInfo = res.ok ? res.data : null;
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
      state.step = "input";
      renderStep();
    });
  }

  // Bước 1 — câu hỏi mở + chip + lựa chọn phụ "Tôi có văn bản" (GIỮ NGUYÊN chức năng cũ,
  // chỉ đổi vị trí thành 1 bước phụ ngay trong luồng này, không phải màn riêng).
  function renderInput() {
    renderShell(`
      <label class="field">
        <span>Kể mình nghe, bạn muốn học tiếng Anh để làm gì?</span>
        <textarea id="goal-input-text" rows="3" maxlength="500" placeholder="VD: Mình làm logistics xuất nhập khẩu, muốn giao tiếp với đối tác nước ngoài">${escapeHtml(state.rawText)}</textarea>
      </label>
      <div class="filter-row goal-chip-row">
        ${GOAL_CHIPS.map((c) => `<button type="button" class="filter-chip goal-chip" data-chip="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("")}
      </div>
      <button type="button" class="btn btn-ghost btn-block" id="toggle-paste-text">${icon("bookmark", { size: 16 })} Hoặc dán sẵn một đoạn văn bản bạn muốn học</button>
      <div id="paste-text-panel" hidden></div>
      <button type="button" class="btn btn-primary btn-block" id="goal-input-continue">Tiếp tục</button>
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
        <span>Cấp độ của tôi</span>
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
      <p class="muted">Bạn ở trình độ nào?</p>
      <div class="filter-row">
        ${LEVELS.map((l) => `<button type="button" class="filter-chip level-chip" data-level="${l}">${l}</button>`).join("")}
        <button type="button" class="filter-chip level-chip" data-level="">Mình chưa chắc, gợi ý giúp</button>
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
    renderShell(`<div class="card"><div class="spinner"></div><p class="muted" style="text-align:center">Mình đang tìm hiểu mục tiêu của bạn...</p></div>`);
  }

  async function runInferProfile() {
    const res = await inferGoalProfile(state.rawText, state.level);
    if (!res.ok || res.data.status !== "ok") {
      state.step = "confirm-unclear";
      renderStep();
      return;
    }
    state.occupationProfile = res.data.occupation_profile;
    state.step = "confirm";
    renderStep();
  }

  // Chưa suy luận rõ được (skin.js "needs_user_question") — QUY TẮC ĐỒNG HÀNH: KHÔNG phải
  // màn lỗi chặn đường, luôn có nút quay lại sửa mô tả, giữ nguyên nội dung đã nhập.
  function renderConfirmUnclear() {
    renderShell(`
      <div class="card">
        <p>Mình chưa hiểu rõ mục tiêu này lắm, bạn mô tả chi tiết hơn được không?</p>
        <button type="button" class="btn btn-primary btn-block" id="unclear-retry">Mô tả lại</button>
      </div>
    `);
    mount.querySelector("#unclear-retry").addEventListener("click", () => {
      state.step = "input";
      renderStep();
    });
  }

  // Bước 3 (đã có kết quả) — Mentor "nói lại bằng lời" ghép từ chân dung vừa suy luận (KHÔNG
  // gọi AI thêm lần nào để viết câu này).
  function renderConfirm() {
    const p = state.occupationProfile;
    renderShell(`
      <div class="card">
        <p>Mình hiểu bạn muốn học tiếng Anh cho <strong>${escapeHtml(p.merged_occupation)}</strong>, tập trung <strong>${escapeHtml(p.primary_communication_scope)}</strong>. Đúng ý bạn chứ?</p>
        <div class="director-card-actions">
          <button type="button" class="btn btn-primary btn-block" id="confirm-yes">Đúng rồi, bắt đầu</button>
          <button type="button" class="btn btn-ghost btn-block" id="confirm-retry">Nói lại cho rõ hơn</button>
        </div>
      </div>
    `);
    mount.querySelector("#confirm-yes").addEventListener("click", () => {
      state.step = "creating";
      renderStep();
      runCreateGoalAndFirstLesson();
    });
    // Quay về Bước 1 GIỮ nguyên nội dung đã nhập để sửa nhanh, không mất trắng (yêu cầu rõ ở mục 6.3).
    mount.querySelector("#confirm-retry").addEventListener("click", () => {
      state.step = "input";
      renderStep();
    });
  }

  // Bước 4 — chờ, giữ giọng đồng hành. AI CALL #2/2 của Đợt 3 mục 5 (sinh bài học thật).
  function renderCreating() {
    renderShell(`<div class="card"><div class="spinner"></div><p class="muted" style="text-align:center">Mình đang chuẩn bị bài học đầu tiên cho bạn...</p></div>`);
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

  function renderCreatingError() {
    renderShell(`
      <div class="card">
        <p class="error-text">Có lỗi khi chuẩn bị bài học, thử lại nhé.</p>
        <button type="button" class="btn btn-primary btn-block" id="creating-retry">Thử lại</button>
        <button type="button" class="btn btn-ghost btn-block" id="creating-back">Quay lại Mentor AI</button>
      </div>
    `);
    mount.querySelector("#creating-retry").addEventListener("click", () => {
      state.step = "creating";
      renderStep();
      runCreateGoalAndFirstLesson();
    });
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
