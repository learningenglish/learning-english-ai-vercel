// app/js/views/writingPractice.js — tính năng MỚI "Luyện viết" (2026-07-27), độc lập hoàn
// toàn với luồng Lesson-first (Phase B-H cũ KHÔNG bị đụng tới). 1 route "/writing", 5 bước
// (chọn cấp độ/lĩnh vực -> AI giao đề -> viết -> AI chấm -> chi tiết) dựng lại trong CÙNG 1
// view bằng state machine nội bộ (giống cách createLesson.js/createFromText.js tự re-render),
// KHÔNG tách route riêng cho từng bước — 5 bước là 1 trải nghiệm liên tục, không cần
// back/forward trình duyệt giữa chừng.
//
// LỌC BỎ so với ảnh mock 6 màn hình tham khảo (yêu cầu người dùng: "phân tích lọc bỏ những
// cái không cần thiết, không hoàn toàn sao chép hình"):
// - Gộp 2 màn "Luyện viết" (lộ đề) + "Hướng dẫn" (chủ đề+mục tiêu+cấu trúc) của mock thành 1
//   bước duy nhất — 2 màn đó lặp lại gần như y hệt thông tin (đề bài + mục tiêu), tách 2 màn
//   chỉ thêm 1 lượt bấm thừa.
// - BỎ HẲN màn 6 "Bài viết tiếp theo" (AI đề xuất bài kế tiếp) — yêu cầu gốc ghi rõ "KHÔNG
//   thêm 'đề xuất bài viết tiếp theo' — ngoài phạm vi đợt này".
// - Bước "Chi tiết bài viết" (Bước 5) KHÁC HẲN cách trình bày "Sửa lỗi" dạng danh sách bullet
//   của mock — dựng lại thành 1 khối văn bản liền mạch với đánh dấu inline, đúng yêu cầu gốc
//   (xem annotatedBlockHtml() bên dưới), KHÔNG làm theo mẫu "mỗi câu 1 dòng gạch đầu dòng".
// - "Xem bài viết hoàn chỉnh" (bản đã sửa sạch) — ĐỂ BACKLOG (yêu cầu gốc cho phép), chưa làm.
import { navigate } from "../router.js";
import { generateWritingTask, gradeWriting } from "../writingApi.js";
import { escapeHtml, countWords } from "../utils.js";
import { icon } from "../icons.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats, wireBackLink } from "../header.js";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

const STEP_TITLES = {
  setup: `${icon("edit-3", { size: 22 })} Luyện viết`,
  task: `${icon("edit-3", { size: 22 })} Đề bài`,
  write: `${icon("edit-3", { size: 22 })} Viết bài`,
  result: `${icon("edit-3", { size: 22 })} Kết quả`,
  detail: `${icon("edit-3", { size: 22 })} Chi tiết bài viết`,
};

export function renderWritingPractice(mount) {
  const state = {
    step: "setup",
    level: "B1",
    industry: "",
    task: null,
    targetWordsMin: 0,
    targetWordsMax: 0,
    text: "",
    supportTab: "structure",
    grading: null, // { overall_score, criteria, strengths, segments, notices }
  };

  // Cache streak/tier SAU khi tải xong 1 lần (xem header.js::appHeaderHtml() tham số "cache")
  // — render() gọi lại nhiều lần mỗi khi đổi bước, nếu không cache header sẽ nhảy về "--"/"..."
  // mỗi lần đổi bước dù đã tải xong trước đó (đúng bug đã gặp ở createLesson.js).
  let headerCache = {};

  render();
  loadAppHeaderStats(mount).then((r) => {
    if (r) headerCache = { streakText: r.streak, tierText: r.tier };
  });

  function render() {
    mount.innerHTML = `
      <div class="screen">
        ${appHeaderHtml(STEP_TITLES[state.step], headerCache, { showBack: true })}
        ${
          state.step === "setup"
            ? renderSetupStep()
            : state.step === "task"
            ? renderTaskStep()
            : state.step === "write"
            ? renderWriteStep()
            : state.step === "result"
            ? renderResultStep()
            : renderDetailStep()
        }
      </div>
    `;
    wire();
  }

  // ====== Bước 1: chọn cấp độ + lĩnh vực (tuỳ chọn) ======
  function renderSetupStep() {
    return `
      <label class="field">
        <span class="field-question">Bạn đang ở cấp độ nào?</span>
      </label>
      <div class="filter-row" id="level-chip-row">
        ${LEVELS.map((l) => `<button type="button" class="filter-chip level-chip ${l === state.level ? "active" : ""}" data-level="${l}">${l}</button>`).join("")}
      </div>

      <label class="field">
        <span class="field-question">Lĩnh vực (không bắt buộc)</span>
        <input type="text" id="industry-input" placeholder="VD: Nhà hàng - Khách sạn" value="${escapeHtml(state.industry)}" />
      </label>

      <div id="setup-result-slot"></div>
      <button type="button" class="btn btn-primary btn-block" id="setup-submit-btn">AI giao đề bài</button>
    `;
  }

  // ====== Bước 2: AI giao nhiệm vụ ======
  function renderTaskStep() {
    const t = state.task;
    return `
      <div class="card writing-task-card">
        <div class="writing-genre-badge">${escapeHtml(t.genre_vi || "Đề bài")} <span class="level-pill">${state.level}</span></div>
        <p class="writing-topic-en">${escapeHtml(t.topic_en)}</p>
        <p class="writing-topic-vi muted">${escapeHtml(t.topic_vi)}</p>
      </div>

      <div class="card">
        <div class="writing-section-title">Mục tiêu bài viết</div>
        <ul class="writing-goals-list">
          ${t.goals.map((g) => `<li>${icon("check-circle", { size: 16 })} <span>${escapeHtml(g)}</span></li>`).join("")}
        </ul>
      </div>

      <div class="card">
        <div class="writing-section-title">Cấu trúc gợi ý</div>
        <ol class="writing-structure-list">
          ${t.structure.map((s) => `<li><strong>${escapeHtml(s.label)}</strong> <span class="muted">${s.label_vi ? `(${escapeHtml(s.label_vi)})` : ""}</span></li>`).join("")}
        </ol>
      </div>

      <div id="task-result-slot"></div>
      <button type="button" class="btn btn-ghost btn-block" id="task-reroll-btn">Đổi đề khác</button>
      <button type="button" class="btn btn-primary btn-block" id="task-start-btn">Bắt đầu viết</button>
    `;
  }

  // ====== Bước 3: người dùng viết ======
  function renderWriteStep() {
    const t = state.task;
    const n = countWords(state.text);
    return `
      <div class="card writing-task-recap">
        <div class="writing-genre-badge">${escapeHtml(t.genre_vi || "Đề bài")} <span class="level-pill">${state.level}</span></div>
        <p class="writing-topic-en">${escapeHtml(t.topic_en)}</p>
      </div>

      <textarea id="writing-textarea" rows="10" placeholder="Bắt đầu viết bài của bạn...">${escapeHtml(state.text)}</textarea>
      <p class="field-hint" id="writing-wordcount">${n} từ · Mục tiêu: ${state.targetWordsMin}-${state.targetWordsMax} từ</p>

      <div class="tabs" id="support-tabs">
        <button type="button" class="tab-btn ${state.supportTab === "structure" ? "active" : ""}" data-tab="structure">Cấu trúc</button>
        <button type="button" class="tab-btn ${state.supportTab === "vocab" ? "active" : ""}" data-tab="vocab">Từ vựng</button>
        <button type="button" class="tab-btn ${state.supportTab === "phrases" ? "active" : ""}" data-tab="phrases">Cụm từ</button>
      </div>
      <div class="card writing-support-panel" id="support-panel">${renderSupportPanel()}</div>

      <div id="write-result-slot"></div>
      <button type="button" class="btn btn-primary btn-block" id="submit-writing-btn">Gửi bài viết</button>
    `;
  }

  function renderSupportPanel() {
    const t = state.task;
    if (state.supportTab === "structure") {
      return `<ol class="writing-structure-list">${t.structure.map((s) => `<li><strong>${escapeHtml(s.label)}</strong> <span class="muted">${s.label_vi ? `(${escapeHtml(s.label_vi)})` : ""}</span></li>`).join("")}</ol>`;
    }
    if (state.supportTab === "vocab") {
      if (!t.vocabulary_suggestions?.length) return `<p class="muted">Không có gợi ý từ vựng riêng cho đề này.</p>`;
      return `<ul class="writing-suggestion-list">${t.vocabulary_suggestions.map((v) => `<li><strong>${escapeHtml(v.word)}</strong> — ${escapeHtml(v.meaning)}</li>`).join("")}</ul>`;
    }
    if (!t.useful_phrases?.length) return `<p class="muted">Không có gợi ý cụm từ riêng cho đề này.</p>`;
    return `<ul class="writing-suggestion-list">${t.useful_phrases.map((p) => `<li><strong>${escapeHtml(p.phrase)}</strong> — ${escapeHtml(p.meaning)}</li>`).join("")}</ul>`;
  }

  // ====== Bước 4: AI chấm điểm tổng quan ======
  function renderResultStep() {
    const g = state.grading;
    return `
      <div class="card writing-score-card">
        <div class="writing-score-ring" style="--pct:${g.overall_score}">
          <div class="writing-score-ring-inner">
            <span class="writing-score-value">${g.overall_score}</span>
            <span class="muted">/100</span>
          </div>
        </div>
      </div>

      <div class="writing-criteria-list">
        ${g.criteria
          .map(
            (c) => `
          <div class="writing-criteria-row">
            <div class="writing-criteria-head"><span>${escapeHtml(c.label)}</span><span>${c.score}/20</span></div>
            <div class="writing-criteria-bar"><div class="writing-criteria-bar-fill" style="width:${(c.score / 20) * 100}%"></div></div>
            <p class="writing-criteria-comment muted">${escapeHtml(c.comment)}</p>
          </div>
        `
          )
          .join("")}
      </div>

      <div class="result-panel result-success">
        <div class="result-title">Điểm mạnh</div>
        <p>${escapeHtml(g.strengths)}</p>
      </div>

      <button type="button" class="btn btn-ghost btn-block" id="view-detail-btn">Xem chi tiết bài viết</button>
      <button type="button" class="btn btn-primary btn-block" id="finish-writing-btn">Hoàn tất</button>
    `;
  }

  // ====== Bước 5: chi tiết bài viết — 1 khối văn bản liền mạch, đánh dấu inline ======
  function renderDetailStep() {
    const g = state.grading;
    return `
      <div class="card">
        <p class="writing-annotated-text">${annotatedBlockHtml(g.segments)}</p>
      </div>
      ${g.notices.length ? `<div class="writing-notices">${g.notices.map((n) => `<p class="writing-notice">${escapeHtml(n)}</p>`).join("")}</div>` : ""}
      <button type="button" class="btn btn-ghost btn-block" id="back-to-result-btn">Quay lại kết quả</button>
    `;
  }

  function annotatedBlockHtml(segments) {
    return segments
      .map((seg) => {
        if (seg.issue_type === "unnatural") {
          return `<span class="w-seg w-seg-unnatural"><del>${escapeHtml(seg.text)}</del> <strong>${escapeHtml(seg.replacement)}</strong></span>`;
        }
        if (seg.issue_type === "improvable") {
          return `<span class="w-seg w-seg-improvable"><mark>${escapeHtml(seg.text)}</mark> <span class="w-suggestion">(${escapeHtml(seg.suggestion)})</span></span>`;
        }
        return `<span class="w-seg w-seg-ok">${escapeHtml(seg.text)}</span>`;
      })
      .join(" ");
  }

  // ====== wiring ======
  function wire() {
    wireAppHeader(mount);
    wireBackLink(mount, () => {
      if (state.step === "task") {
        state.step = "setup";
        render();
      } else if (state.step === "write") {
        state.step = "task";
        render();
      } else if (state.step === "detail") {
        state.step = "result";
        render();
      } else {
        navigate("/lessons");
      }
    });

    if (state.step === "setup") wireSetupStep();
    else if (state.step === "task") wireTaskStep();
    else if (state.step === "write") wireWriteStep();
    else if (state.step === "result") wireResultStep();
    else wireDetailStep();
  }

  function wireSetupStep() {
    mount.querySelectorAll(".level-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.level = chip.dataset.level;
        render();
      });
    });
    mount.querySelector("#industry-input").addEventListener("input", (e) => (state.industry = e.target.value));
    mount.querySelector("#setup-submit-btn").addEventListener("click", () => requestTask());
  }

  function wireTaskStep() {
    mount.querySelector("#task-reroll-btn").addEventListener("click", () => requestTask());
    mount.querySelector("#task-start-btn").addEventListener("click", () => {
      state.step = "write";
      render();
    });
  }

  function wireWriteStep() {
    const textarea = mount.querySelector("#writing-textarea");
    const wc = mount.querySelector("#writing-wordcount");
    textarea.addEventListener("input", () => {
      state.text = textarea.value;
      wc.textContent = `${countWords(state.text)} từ · Mục tiêu: ${state.targetWordsMin}-${state.targetWordsMax} từ`;
    });
    mount.querySelectorAll("#support-tabs .tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.supportTab = btn.dataset.tab;
        mount.querySelectorAll("#support-tabs .tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
        mount.querySelector("#support-panel").innerHTML = renderSupportPanel();
      });
    });
    mount.querySelector("#submit-writing-btn").addEventListener("click", () => submitWriting());
  }

  function wireResultStep() {
    mount.querySelector("#view-detail-btn").addEventListener("click", () => {
      state.step = "detail";
      render();
    });
    mount.querySelector("#finish-writing-btn").addEventListener("click", () => navigate("/lessons"));
  }

  function wireDetailStep() {
    mount.querySelector("#back-to-result-btn").addEventListener("click", () => {
      state.step = "result";
      render();
    });
  }

  // ====== gọi API ======
  async function requestTask() {
    const resultSlot = mount.querySelector(state.step === "setup" ? "#setup-result-slot" : "#task-result-slot");
    const submitBtns = mount.querySelectorAll("#setup-submit-btn, #task-reroll-btn, #task-start-btn");
    submitBtns.forEach((b) => b && (b.disabled = true));
    resultSlot.innerHTML = `<div class="result-panel result-pending"><div class="spinner spinner-sm"></div> AI đang chuẩn bị đề bài...</div>`;

    const res = await generateWritingTask(state.level, state.industry);
    submitBtns.forEach((b) => b && (b.disabled = false));
    if (!res.ok) {
      resultSlot.innerHTML = `<div class="result-panel result-error">${escapeHtml(res.error || "Có lỗi xảy ra, vui lòng thử lại.")}</div>`;
      return;
    }
    state.task = res.data.task;
    state.targetWordsMin = res.data.target_words_min;
    state.targetWordsMax = res.data.target_words_max;
    state.step = "task";
    render();
  }

  async function submitWriting() {
    const resultSlot = mount.querySelector("#write-result-slot");
    const n = countWords(state.text);
    if (n < 10) {
      resultSlot.innerHTML = `<div class="result-panel result-error">Bài viết quá ngắn (tối thiểu 10 từ).</div>`;
      return;
    }
    const btn = mount.querySelector("#submit-writing-btn");
    btn.disabled = true;
    resultSlot.innerHTML = `<div class="result-panel result-pending"><div class="spinner spinner-sm"></div> AI đang chấm bài viết...</div>`;

    const res = await gradeWriting({ level: state.level, industry: state.industry, task: state.task, text: state.text });
    btn.disabled = false;
    if (!res.ok) {
      resultSlot.innerHTML = `<div class="result-panel result-error">${escapeHtml(res.error || "Có lỗi xảy ra, vui lòng thử lại.")}</div>`;
      return;
    }
    state.grading = res.data;
    state.step = "result";
    render();
  }
}
