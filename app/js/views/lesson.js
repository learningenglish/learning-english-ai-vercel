// app/js/views/lesson.js — render TỪ 1 bản ghi "lessons", KHÔNG gọi AI để sinh nội dung
// (kiến trúc Lesson-first). "Hỏi AI" (word_lookup) là action lẻ, realtime, không lưu —
// khác hoàn toàn với generate_lesson/analyze_user_text.
import { getLessonById, getLessonProgress, upsertLessonProgress, setLessonFavorite } from "../db.js";
import { callChatAction } from "../chatApi.js";
import { escapeHtml } from "../utils.js";

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"];

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
    showAllContent: false,
    showTranslation: false,
    isFavorite: !!lesson.is_favorite,
  };
  // Cache trong phiên xem bài này — rê lại đúng 1 từ không gọi AI thêm lần nữa.
  const wordLookupCache = new Map();

  mount.innerHTML = `
    <div class="screen">
      <div class="lesson-header-row">
        <h1 class="screen-title">${escapeHtml(lesson.title_vi || lesson.title)}</h1>
        <button type="button" class="lesson-fav-btn" id="lesson-fav-btn" aria-label="Yêu thích">${state.isFavorite ? "❤️" : "🤍"}</button>
      </div>
      <div class="tabs" role="tablist">
        <button type="button" class="tab-btn active" data-tab="content">Nội dung</button>
        <button type="button" class="tab-btn" data-tab="vocabulary">Từ vựng</button>
        <button type="button" class="tab-btn" data-tab="grammar">Ngữ pháp</button>
        <button type="button" class="tab-btn" data-tab="exercises">Luyện tập</button>
      </div>
      <div id="lesson-panel"></div>
    </div>
  `;

  mount.querySelector("#lesson-fav-btn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const next = !state.isFavorite;
    btn.disabled = true;
    try {
      await setLessonFavorite(lesson.id, next);
      state.isFavorite = next;
      btn.textContent = next ? "❤️" : "🤍";
    } catch {
      // Lỗi mạng cho 1 toggle nhỏ — giữ nguyên trạng thái cũ, không cần báo ồn ào.
    } finally {
      btn.disabled = false;
    }
  });

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

  // ====== Tab Nội dung (trước là "Đoạn") ======
  function renderContentTab(panel) {
    const pages = lesson.content || [];
    panel.innerHTML = `
      <div class="content-toolbar">
        <button type="button" class="icon-toggle-btn ${state.showAllContent ? "active" : ""}" id="toggle-all-btn" title="Xem tất cả / từng câu">
          ${state.showAllContent ? "☰ Tất cả" : "▤ Từng câu"}
        </button>
        <button type="button" class="icon-toggle-btn ${state.showTranslation ? "active" : ""}" id="toggle-translate-btn" title="Hiện/ẩn bản dịch">
          🌐 Dịch
        </button>
      </div>
      <div id="content-body"></div>
    `;

    panel.querySelector("#toggle-all-btn").addEventListener("click", () => {
      state.showAllContent = !state.showAllContent;
      renderPanel();
    });
    panel.querySelector("#toggle-translate-btn").addEventListener("click", () => {
      state.showTranslation = !state.showTranslation;
      renderPanel();
    });

    const body = panel.querySelector("#content-body");
    const idx = Math.min(state.page, Math.max(0, pages.length - 1));
    const displayedPages = state.showAllContent ? pages : [pages[idx]];

    if (state.showAllContent) {
      // Yêu cầu: xem "Tất cả" không tách card riêng từng đoạn — gộp CHUNG 1 card, các đoạn
      // ngăn cách bằng 1 đường gạch đậm màu (.content-divider), không phải card/border riêng.
      body.innerHTML = `
        <div class="content-page">
          ${displayedPages
            .map(
              (item, i) => `
            ${i > 0 ? '<div class="content-divider"></div>' : ""}
            ${item?.speaker ? `<div class="speaker-name">${escapeHtml(item.speaker)}</div>` : ""}
            <div class="content-text">${renderInteractiveHtml(item?.text || "", lesson.vocabulary || [])}</div>
            ${state.showTranslation ? `<div class="content-translation">${escapeHtml(item?.translation || "")}</div>` : ""}
          `
            )
            .join("")}
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="content-page">
          <div class="content-progress muted">Trang ${idx + 1}/${pages.length}</div>
          ${displayedPages[0]?.speaker ? `<div class="speaker-name">${escapeHtml(displayedPages[0].speaker)}</div>` : ""}
          <div class="content-text">${renderInteractiveHtml(displayedPages[0]?.text || "", lesson.vocabulary || [])}</div>
          ${state.showTranslation ? `<div class="content-translation">${escapeHtml(displayedPages[0]?.translation || "")}</div>` : ""}
        </div>
        <div class="content-nav">
          <button type="button" class="btn btn-ghost" id="prev-page" ${idx === 0 ? "disabled" : ""}>← Trước</button>
          <button type="button" class="btn btn-ghost" id="next-page" ${idx === pages.length - 1 ? "disabled" : ""}>Sau →</button>
        </div>
      `;
      body.querySelector("#prev-page")?.addEventListener("click", () => {
        state.page = Math.max(0, idx - 1);
        saveProgress();
        renderPanel();
      });
      body.querySelector("#next-page")?.addEventListener("click", () => {
        state.page = Math.min(pages.length - 1, idx + 1);
        saveProgress();
        renderPanel();
      });
    }

    // Gắn tương tác rê/chạm cho TỪNG khối .content-text vừa render.
    body.querySelectorAll(".content-text").forEach((el, i) => {
      wireInteractiveWords(el, displayedPages[i]?.text || "");
    });
  }

  function wireInteractiveWords(container, sentence) {
    container.querySelectorAll("[data-token-idx]").forEach((span) => {
      const word = span.textContent;
      let hoverTimer = null;
      const trigger = () => showWordTooltip(span, word, sentence);
      span.addEventListener("mouseenter", () => {
        hoverTimer = setTimeout(trigger, 250);
      });
      span.addEventListener("mouseleave", () => clearTimeout(hoverTimer));
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        clearTimeout(hoverTimer);
        trigger();
      });
    });
  }

  // Tooltip TỐI GIẢN: level (màu theo cấp độ) + từ + nghĩa + cụm từ đi kèm (nếu có) — không
  // giải thích, không ví dụ, không lưu ý. Dữ liệu từ action "word_lookup" (JSON), khác hẳn
  // word_tip/word_explain (trả text tự do dài, không có level).
  async function showWordTooltip(anchorEl, word, sentence) {
    showWordPopoverHtml(anchorEl, `<div class="word-popover-meaning muted">Đang tra...</div>`);

    const cacheKey = `${word.toLowerCase()}|${sentence}`;
    let data = wordLookupCache.get(cacheKey);
    if (!data) {
      const res = await callChatAction("word_lookup", { word, sentence });
      if (res.ok) {
        try {
          data = JSON.parse(res.content);
        } catch {
          data = null;
        }
      }
      if (data) wordLookupCache.set(cacheKey, data);
    }

    if (!data || !CEFR_LEVELS.includes(data.level)) {
      showWordPopoverHtml(anchorEl, `<div class="word-popover-meaning error-text">Không tra được từ.</div>`);
      return;
    }
    showWordPopoverHtml(
      anchorEl,
      `
      <div class="word-popover-head">
        <span class="word-popover-level" data-level="${escapeHtml(data.level)}">${escapeHtml(data.level)}</span>
        <span class="word-popover-word">${escapeHtml(word)}</span>
      </div>
      <div class="word-popover-meaning">${escapeHtml(data.meaning || "")}</div>
      ${data.collocation ? `<div class="word-popover-colloc">${escapeHtml(data.collocation)}</div>` : ""}
    `
    );
  }

  // ====== Tab Từ vựng ======
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

  function showWordPopoverHtml(anchorEl, html) {
    document.getElementById("word-popover")?.remove();
    const popover = document.createElement("div");
    popover.id = "word-popover";
    popover.className = "word-popover";
    popover.innerHTML = html;
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

// Tách "text" thành các token TỪ (chuỗi chữ cái/dấu nháy liên tiếp), giữ vị trí start/end
// trong chuỗi gốc để ráp lại HTML đúng chỗ.
function tokenizeWords(text) {
  const tokens = [];
  const re = /[A-Za-z']+/g;
  let m;
  while ((m = re.exec(text || ""))) {
    tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return { tokens };
}

// Bọc TẤT CẢ từ trong "text" thành span rê/chạm được — không chỉ riêng từ trong
// "vocabulary" (khác hành vi cũ). Từ khớp vocabulary (kể cả biến thể s/es/ed/ing) vẫn tô
// màu nổi bật như trước; từ thường khác vẫn tương tác được nhưng không tô màu.
function renderInteractiveHtml(text, vocabulary) {
  if (!text) return "";
  const vocabMap = buildVocabMap(vocabulary);
  const { tokens } = tokenizeWords(text);
  if (!tokens.length) return escapeHtml(text);

  let html = "";
  let cursor = 0;
  tokens.forEach((t, i) => {
    html += escapeHtml(text.slice(cursor, t.start));
    const entry = findVocabEntry(t.word, vocabMap);
    const cls = entry ? (entry.is_specialized ? "vocab-highlight-specialized" : "vocab-highlight") : "hover-word";
    html += `<span class="${cls}" data-token-idx="${i}">${escapeHtml(t.word)}</span>`;
    cursor = t.end;
  });
  html += escapeHtml(text.slice(cursor));
  return html;
}
