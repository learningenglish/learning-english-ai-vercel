// app/js/views/lesson.js — render TỪ 1 bản ghi "lessons", KHÔNG gọi AI để sinh nội dung
// (kiến trúc Lesson-first). "Hỏi AI" (word_tip/phrase_explain/sentence_tip) là action lẻ,
// realtime, không lưu — khác hoàn toàn với generate_lesson/analyze_user_text.
import { getLessonById, getLessonProgress, upsertLessonProgress } from "../db.js";
import { callChatAction } from "../chatApi.js";
import { escapeHtml } from "../utils.js";

export async function renderLessonDetail(mount, params) {
  const lessonId = params?.[0];
  if (!lessonId) {
    mount.innerHTML = `<div class="screen"><p class="error-text">Thiếu mã bài học.</p></div>`;
    return;
  }
  mount.innerHTML = `<div class="screen"><p class="muted">Đang tải bài học...</p></div>`;

  let lesson, progress;
  try {
    [lesson, progress] = await Promise.all([getLessonById(lessonId), getLessonProgress(lessonId)]);
  } catch {
    mount.innerHTML = `<div class="screen"><p class="error-text">Không tải được bài học, thử lại sau.</p></div>`;
    return;
  }
  if (!lesson) {
    mount.innerHTML = `<div class="screen"><p class="error-text">Không tìm thấy bài học (có thể không thuộc tài khoản này).</p></div>`;
    return;
  }

  const state = {
    tab: "content",
    page: progress?.completed_paragraphs || 0,
    completedExercises: new Set(progress?.completed_exercises || []),
    xpEarned: progress?.xp_earned || 0,
  };

  mount.innerHTML = `
    <div class="screen">
      <h1 class="screen-title">${escapeHtml(lesson.title_vi || lesson.title)}</h1>
      <div class="tabs" role="tablist">
        <button type="button" class="tab-btn active" data-tab="content">Đoạn</button>
        <button type="button" class="tab-btn" data-tab="vocabulary">Từ vựng</button>
        <button type="button" class="tab-btn" data-tab="grammar">Ngữ pháp</button>
        <button type="button" class="tab-btn" data-tab="exercises">Luyện tập</button>
      </div>
      <div id="lesson-panel"></div>
    </div>
  `;

  mount.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      mount.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.tab = btn.dataset.tab;
      renderPanel();
    });
  });

  renderPanel();
  saveProgress(); // ghi last_opened_at ngay khi mở, để "Tiếp tục học" ở Trang chủ thấy đúng

  function renderPanel() {
    const panel = mount.querySelector("#lesson-panel");
    if (state.tab === "content") return renderContentTab(panel);
    if (state.tab === "vocabulary") return renderVocabularyTab(panel);
    if (state.tab === "grammar") return renderGrammarTab(panel);
    return renderExercisesTab(panel);
  }

  function renderContentTab(panel) {
    const pages = lesson.content || [];
    const idx = Math.min(state.page, Math.max(0, pages.length - 1));
    const item = pages[idx];
    panel.innerHTML = `
      <div class="content-page">
        <div class="content-progress muted">Trang ${idx + 1}/${pages.length}</div>
        ${item?.speaker ? `<div class="speaker-name">${escapeHtml(item.speaker)}</div>` : ""}
        <div class="content-text" id="content-text"></div>
        <button type="button" class="btn btn-ghost" id="toggle-translation">Hiện bản dịch</button>
        <div class="content-translation" id="content-translation" hidden>${escapeHtml(item?.translation || "")}</div>
        <div class="content-nav">
          <button type="button" class="btn btn-ghost" id="prev-page" ${idx === 0 ? "disabled" : ""}>← Trước</button>
          <button type="button" class="btn btn-ghost" id="next-page" ${idx === pages.length - 1 ? "disabled" : ""}>Sau →</button>
        </div>
      </div>
    `;
    panel.querySelector("#content-text").innerHTML = highlightVocabulary(item?.text || "", lesson.vocabulary || []);

    panel.querySelector("#toggle-translation").addEventListener("click", (e) => {
      const t = panel.querySelector("#content-translation");
      t.hidden = !t.hidden;
      e.currentTarget.textContent = t.hidden ? "Hiện bản dịch" : "Ẩn bản dịch";
    });
    panel.querySelector("#prev-page")?.addEventListener("click", () => {
      state.page = Math.max(0, idx - 1);
      saveProgress();
      renderPanel();
    });
    panel.querySelector("#next-page")?.addEventListener("click", () => {
      state.page = Math.min(pages.length - 1, idx + 1);
      saveProgress();
      renderPanel();
    });
    panel.querySelectorAll(".vocab-highlight, .vocab-highlight-specialized").forEach((span) => {
      span.addEventListener("click", async () => {
        showWordPopover(span, "Đang tra từ...");
        const text = await askWordTip(span.dataset.word, item?.text || "");
        showWordPopover(span, text);
      });
    });
  }

  function renderVocabularyTab(panel) {
    const words = lesson.vocabulary || [];
    panel.innerHTML = `
      <div class="vocab-list">
        ${words
          .map(
            (w) => `
          <div class="vocab-item ${w.is_specialized ? "vocab-item-specialized" : ""}">
            <div class="vocab-word">${escapeHtml(w.word)} <span class="vocab-ipa muted">${escapeHtml(w.ipa || "")}</span></div>
            <div class="vocab-type muted">${escapeHtml(w.type || "")}</div>
            <div class="vocab-meaning">${escapeHtml(w.meaning || "")}</div>
            <div class="vocab-example muted">${escapeHtml(w.example || "")}</div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  function renderGrammarTab(panel) {
    const points = lesson.grammar || [];
    panel.innerHTML = `
      <div class="grammar-list">
        ${points
          .map(
            (g) => `
          <div class="grammar-item">
            <div class="grammar-name">${escapeHtml(g.name)}</div>
            <div class="grammar-structure badge">${escapeHtml(g.structure || "")}</div>
            <div class="grammar-explanation">${escapeHtml(g.explanation || "")}</div>
            <div class="grammar-example muted">"${escapeHtml(g.example_from_lesson || "")}"</div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  function renderExercisesTab(panel) {
    const exercises = lesson.exercises || [];
    panel.innerHTML = `<div class="exercises-list">${exercises.map((ex, i) => exerciseHtml(ex, i)).join("")}</div>`;
    exercises.forEach((ex, i) => wireExercise(panel, ex, i));
  }

  function exerciseHtml(ex, i) {
    const done = state.completedExercises.has(i);
    if (ex.type === "multiple_choice") {
      return `
        <div class="exercise-item ${done ? "exercise-done" : ""}" data-idx="${i}">
          <div class="exercise-question">${i + 1}. ${escapeHtml(ex.question)}</div>
          <div class="exercise-options">
            ${(ex.options || [])
              .map((opt, oi) => `<button type="button" class="option-btn" data-oi="${oi}" ${done ? "disabled" : ""}>${escapeHtml(opt)}</button>`)
              .join("")}
          </div>
          <div class="exercise-feedback" hidden></div>
        </div>
      `;
    }
    return `
      <div class="exercise-item ${done ? "exercise-done" : ""}" data-idx="${i}">
        <div class="exercise-question">${i + 1}. ${escapeHtml((ex.sentence || "").replace("___", "____"))}</div>
        <input type="text" class="fill-blank-input" placeholder="${escapeHtml(ex.hint || "")}" ${done ? "disabled" : ""} />
        <button type="button" class="btn btn-ghost check-fill-btn" ${done ? "disabled" : ""}>Kiểm tra</button>
        <div class="exercise-feedback" hidden></div>
      </div>
    `;
  }

  function wireExercise(panel, ex, i) {
    if (state.completedExercises.has(i)) return;
    const item = panel.querySelector(`.exercise-item[data-idx="${i}"]`);
    if (!item) return;
    const feedback = item.querySelector(".exercise-feedback");

    if (ex.type === "multiple_choice") {
      item.querySelectorAll(".option-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const chosen = Number(btn.dataset.oi);
          const correct = chosen === ex.answer;
          item.querySelectorAll(".option-btn").forEach((b) => (b.disabled = true));
          btn.classList.add(correct ? "option-correct" : "option-wrong");
          feedback.hidden = false;
          feedback.textContent = (correct ? "✅ Chính xác! " : "❌ Chưa đúng. ") + (ex.explanation || "");
          markExerciseDone(i, correct);
        });
      });
    } else {
      const input = item.querySelector(".fill-blank-input");
      item.querySelector(".check-fill-btn").addEventListener("click", () => {
        const correct = normalizeAnswer(input.value) === normalizeAnswer(ex.answer);
        input.disabled = true;
        item.querySelector(".check-fill-btn").disabled = true;
        feedback.hidden = false;
        feedback.textContent = correct ? "✅ Chính xác!" : `❌ Đáp án đúng: ${ex.answer}`;
        markExerciseDone(i, correct);
      });
    }
  }

  function markExerciseDone(i, correct) {
    state.completedExercises.add(i);
    if (correct) {
      const total = (lesson.exercises || []).length || 1;
      state.xpEarned += Math.max(1, Math.round((lesson.xp_reward || 20) / total));
    }
    saveProgress();
  }

  function saveProgress() {
    const total = (lesson.exercises || []).length;
    const allDone = total > 0 && state.completedExercises.size === total;
    upsertLessonProgress(lesson.id, {
      completed_paragraphs: state.page,
      completed_exercises: Array.from(state.completedExercises),
      xp_earned: state.xpEarned,
      last_opened_at: new Date().toISOString(),
      completed_at: allDone ? new Date().toISOString() : null,
    }).catch(() => {
      // Không chặn UI vì 1 lần ghi progress lỗi mạng — lần thao tác kế tiếp sẽ ghi lại.
    });
  }

  async function askWordTip(word, sentenceContext) {
    const res = await callChatAction("word_tip", { word, sentence: sentenceContext });
    return res.ok ? res.content : res.error || "Không lấy được giải thích.";
  }

  function showWordPopover(anchorEl, text) {
    document.getElementById("word-popover")?.remove();
    const popover = document.createElement("div");
    popover.id = "word-popover";
    popover.className = "word-popover";
    popover.textContent = text;
    document.body.appendChild(popover);
    const rect = anchorEl.getBoundingClientRect();
    popover.style.top = `${window.scrollY + rect.bottom + 6}px`;
    popover.style.left = `${Math.max(8, rect.left)}px`;
    setTimeout(() => {
      const closeHandler = (e) => {
        if (!popover.contains(e.target)) {
          popover.remove();
          document.removeEventListener("click", closeHandler);
        }
      };
      document.addEventListener("click", closeHandler);
    }, 0);
  }

  return function teardown() {
    document.getElementById("word-popover")?.remove();
  };
}

function normalizeAnswer(s) {
  return (s || "").trim().toLowerCase();
}

function buildVocabMap(vocabulary) {
  const map = new Map();
  (vocabulary || []).forEach((w) => {
    if (w.word) map.set(normalizeAnswer(w.word), w);
  });
  return map;
}

function findVocabEntry(matchedText, vocabMap) {
  const lower = normalizeAnswer(matchedText);
  if (vocabMap.has(lower)) return vocabMap.get(lower);
  for (const suf of ["ing", "ed", "es", "s"]) {
    if (lower.endsWith(suf) && lower.length > suf.length) {
      const base = lower.slice(0, -suf.length);
      if (vocabMap.has(base)) return vocabMap.get(base);
    }
  }
  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// So khớp không phân biệt hoa thường, bắt biến thể s/es/ed/ing — đúng ghi chú tích hợp
// trong docs/prompt-ai-tao-bai-hoc.md mục 4.3. Từ chuyên ngành (is_specialized) tô màu
// khác từ thường qua class CSS riêng.
function highlightVocabulary(text, vocabulary) {
  if (!text) return "";
  const vocabMap = buildVocabMap(vocabulary);
  const words = Array.from(vocabMap.keys()).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!words.length) return escapeHtml(text);

  const pattern = words.map((w) => `${escapeRegex(w)}(?:s|es|ed|ing)?`).join("|");
  const re = new RegExp(`\\b(?:${pattern})\\b`, "gi");

  let html = "";
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    html += escapeHtml(text.slice(lastIndex, match.index));
    const matchedText = match[0];
    const entry = findVocabEntry(matchedText, vocabMap);
    const cls = entry?.is_specialized ? "vocab-highlight-specialized" : "vocab-highlight";
    html += `<span class="${cls}" data-word="${escapeHtml(entry?.word || matchedText)}">${escapeHtml(matchedText)}</span>`;
    lastIndex = match.index + matchedText.length;
    if (match.index === re.lastIndex) re.lastIndex += 1; // tránh vòng lặp vô hạn khi match rỗng
  }
  html += escapeHtml(text.slice(lastIndex));
  return html;
}
