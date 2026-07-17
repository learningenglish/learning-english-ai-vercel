// app/js/views/lesson.js — render TỪ 1 bản ghi "lessons", KHÔNG gọi AI để sinh nội dung
// (kiến trúc Lesson-first). "Hỏi AI" (word_lookup, sentence_tip) là action lẻ, realtime,
// không lưu — khác hoàn toàn với generate_lesson/analyze_user_text. Đọc-to dùng
// app/js/tts.js (Web Speech API, không gọi AI, không tốn credit).
import { getLessonById, getLessonProgress, upsertLessonProgress, setLessonFavorite } from "../db.js";
import { callChatAction } from "../chatApi.js";
import { escapeHtml } from "../utils.js";
import { createPlayer, isTTSSupported } from "../tts.js";

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const SPEEDS = [0.75, 1, 1.25, 1.5];

// Danh sách tên phổ biến để đoán giới tính nhân vật hội thoại — KHÔNG đầy đủ tuyệt đối
// (không có API nào cho việc này), chỉ đủ bao phủ phần lớn tên AI hay đặt cho nhân vật.
// Vai trò chung chung (Staff/Customer/Guest...) hoặc tên lạ không đoán được -> để
// computeGenderHints() luân phiên gán, vẫn đảm bảo mỗi nhân vật có 1 giọng riêng biệt.
const FEMALE_NAMES = new Set([
  "anna", "mary", "emma", "sarah", "lisa", "laura", "emily", "jessica", "jennifer", "amanda",
  "michelle", "kelly", "nancy", "susan", "karen", "linda", "patricia", "barbara", "elizabeth",
  "maria", "helen", "sandra", "donna", "carol", "ruth", "sharon", "cynthia", "kathleen", "amy",
  "angela", "brenda", "pamela", "nicole", "samantha", "katherine", "christine", "debra", "rachel",
  "catherine", "carolyn", "janet", "virginia", "olivia", "sophia", "ava", "isabella", "mia",
  "charlotte", "amelia", "harper", "evelyn", "abigail", "rose", "grace", "chloe", "victoria",
  "hannah", "alice", "julia", "natalie", "diana", "claire", "megan", "waitress", "mom", "mother",
]);
const MALE_NAMES = new Set([
  "steve", "tim", "john", "james", "robert", "michael", "william", "david", "richard", "joseph",
  "thomas", "charles", "christopher", "daniel", "matthew", "anthony", "mark", "donald", "paul",
  "george", "kenneth", "andrew", "joshua", "kevin", "brian", "edward", "ronald", "timothy",
  "jason", "jeffrey", "ryan", "jacob", "gary", "nicholas", "eric", "jonathan", "stephen", "larry",
  "justin", "scott", "brandon", "benjamin", "samuel", "frank", "raymond", "alexander", "patrick",
  "jack", "dennis", "jerry", "tyler", "aaron", "peter", "henry", "adam", "nathan", "waiter",
  "dad", "father",
]);

function guessGenderFromName(name) {
  const n = (name || "").toLowerCase().trim();
  if (FEMALE_NAMES.has(n)) return "female";
  if (MALE_NAMES.has(n)) return "male";
  return null;
}

// Tính giọng cho MỖI đoạn/lượt thoại 1 LẦN khi mở bài (ổn định suốt phiên xem):
// - Hội thoại: đoán theo tên nhân vật; cùng 1 người nói luôn cùng 1 giọng suốt bài. Tên
//   không đoán được (vai trò chung chung, tên lạ) -> gán theo giới đang ÍT DÙNG HƠN để cân
//   bằng, vẫn đảm bảo phân biệt được các nhân vật.
// - Bài đọc (không có speaker): luân phiên theo TỪNG ĐOẠN cho đỡ đơn điệu, không liên quan
//   giới tính nhân vật nào.
function computeGenderHints(content) {
  const speakerGenderMap = new Map();
  let maleCount = 0;
  let femaleCount = 0;
  function assignBalanced() {
    if (maleCount <= femaleCount) {
      maleCount += 1;
      return "male";
    }
    femaleCount += 1;
    return "female";
  }
  return (content || []).map((item) => {
    if (!item?.speaker) return assignBalanced();
    if (speakerGenderMap.has(item.speaker)) return speakerGenderMap.get(item.speaker);
    let g = guessGenderFromName(item.speaker);
    if (g === "male") maleCount += 1;
    else if (g === "female") femaleCount += 1;
    else g = assignBalanced();
    speakerGenderMap.set(item.speaker, g);
    return g;
  });
}

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
    showTranslation: true, // luôn hiện dịch mặc định, tắt được qua icon
    isFavorite: !!lesson.is_favorite,
  };
  // Cache trong phiên xem bài này — tra lại đúng 1 từ không gọi AI thêm lần nữa.
  const wordLookupCache = new Map();
  const ttsSupported = isTTSSupported();
  const genderHints = computeGenderHints(lesson.content); // 1 giọng cố định/nhân vật suốt bài

  // Player dùng CHUNG cho toàn bộ tab "Nội dung" — nạp 1 lần với TẤT CẢ đoạn/lượt thoại
  // (không phụ thuộc đang xem "Từng câu" hay "Tất cả"), để nút back/tua/lặp lại của thanh
  // audio có thể đi xuyên trang khi ở chế độ "Từng câu" mà không cần tải lại player.
  let ttsLoaded = false;
  let lastSyncedPage = state.page;
  let renderContentBodyFn = null;
  const ttsPlayer = createPlayer({
    onStateChange: (s) => {
      updateAudioBarUI(s);
      if (!state.showAllContent && s.itemIndex !== lastSyncedPage) {
        lastSyncedPage = s.itemIndex;
        state.page = s.itemIndex;
        saveProgress();
        if (renderContentBodyFn) renderContentBodyFn();
      }
    },
  });

  mount.innerHTML = `
    <div class="screen">
      <div class="lesson-header-row">
        <button type="button" class="lesson-back-btn" id="lesson-back-btn" aria-label="Quay lại">←</button>
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

  mount.querySelector("#lesson-back-btn").addEventListener("click", () => {
    ttsPlayer.stop();
    // history.back() thay vì navigate cố định "/lessons" — quay đúng về chỗ đã vào bài
    // (Bài học / Yêu thích / Lịch sử đều dẫn tới đây), hash router hoạt động đúng với
    // Back trình duyệt nên history.back() an toàn.
    history.back();
  });

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
      if (state.tab === "content" && btn.dataset.tab !== "content") {
        ttsPlayer.stop();
        renderContentBodyFn = null;
      }
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

  // ====== Tab Nội dung ======
  function renderContentTab(panel) {
    const pages = lesson.content || [];
    panel.innerHTML = `
      <div class="content-toolbar">
        <button type="button" class="icon-toggle-btn ${state.showAllContent ? "active" : ""}" id="toggle-all-btn" title="Xem tất cả">☰</button>
        <button type="button" class="icon-toggle-btn ${state.showTranslation ? "active" : ""}" id="toggle-translate-btn" title="Ẩn/hiện bản dịch">
          <span class="translate-icon">文A</span>
        </button>
      </div>
      <div id="content-body"></div>
      ${ttsSupported ? audioBarHtml() : ""}
    `;

    panel.querySelector("#toggle-all-btn").addEventListener("click", () => {
      state.showAllContent = !state.showAllContent;
      panel.querySelector("#toggle-all-btn").classList.toggle("active", state.showAllContent);
      renderContentBody();
    });
    panel.querySelector("#toggle-translate-btn").addEventListener("click", () => {
      state.showTranslation = !state.showTranslation;
      panel.querySelector("#toggle-translate-btn").classList.toggle("active", state.showTranslation);
      renderContentBody();
    });

    if (ttsSupported) {
      wireAudioBar(panel);
      if (!ttsLoaded) {
        ttsPlayer.load(
          pages.map((p, i) => ({ text: p?.text || "", genderHint: genderHints[i] })),
          Math.min(state.page, Math.max(0, pages.length - 1))
        );
        ttsLoaded = true;
      }
      updateAudioBarUI(ttsPlayer.getState());
    }

    renderContentBodyFn = renderContentBody;
    renderContentBody();

    function renderContentBody() {
      const body = panel.querySelector("#content-body");
      const idx = Math.min(state.page, Math.max(0, pages.length - 1));

      if (state.showAllContent) {
        body.innerHTML = `
          <div class="content-page">
            ${pages
              .map(
                (item, i) => `
              ${i > 0 ? '<div class="content-divider"></div>' : ""}
              <div class="content-item-header">
                <span class="speaker-name">${item?.speaker ? escapeHtml(item.speaker) : ""}</span>
                ${contentActionsHtml(i)}
              </div>
              <div class="content-text" data-item-idx="${i}">${renderInteractiveHtml(item?.text || "", lesson.vocabulary || [])}</div>
              ${state.showTranslation ? `<div class="content-translation">${escapeHtml(item?.translation || "")}</div>` : ""}
            `
              )
              .join("")}
          </div>
        `;
      } else {
        const item = pages[idx];
        body.innerHTML = `
          <div class="content-page">
            <div class="content-progress muted">Trang ${idx + 1}/${pages.length}</div>
            <div class="content-item-header">
              <span class="speaker-name">${item?.speaker ? escapeHtml(item.speaker) : ""}</span>
              ${contentActionsHtml(idx)}
            </div>
            <div class="content-text" data-item-idx="${idx}">${renderInteractiveHtml(item?.text || "", lesson.vocabulary || [])}</div>
            ${state.showTranslation ? `<div class="content-translation">${escapeHtml(item?.translation || "")}</div>` : ""}
          </div>
        `;
      }

      body.querySelectorAll(".content-text").forEach((el) => {
        const itemIdx = Number(el.dataset.itemIdx);
        wireInteractiveWords(el, pages[itemIdx]?.text || "", genderHints[itemIdx]);
      });
      body.querySelectorAll(".sentence-icon-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const itemIdx = Number(btn.dataset.idx);
          const item = pages[itemIdx];
          if (btn.dataset.action === "speak") {
            ttsPlayer.speakOnce(item?.text || "", genderHints[itemIdx]);
          } else {
            showSentenceExplain(btn, item);
          }
        });
      });
    }
  }

  function contentActionsHtml(idx) {
    if (!ttsSupported) {
      return `<div class="content-item-actions"><button type="button" class="sentence-icon-btn" data-action="explain" data-idx="${idx}" title="Giải thích câu này">💬</button></div>`;
    }
    return `
      <div class="content-item-actions">
        <button type="button" class="sentence-icon-btn" data-action="speak" data-idx="${idx}" title="Đọc câu này">🔊</button>
        <button type="button" class="sentence-icon-btn" data-action="explain" data-idx="${idx}" title="Giải thích câu này">💬</button>
      </div>
    `;
  }

  // Bài học tạo SAU khi có tính năng này: "explanation" đã được AI phân tích sẵn LÚC TẠO
  // BÀI, hiện ra NGAY không cần gọi AI lại. Bài học tạo TRƯỚC đó (chưa có trường này trong
  // "content") vẫn cần fallback gọi sentence_tip như cũ để không bị hỏng tính năng.
  async function showSentenceExplain(anchorEl, item) {
    if (item?.explanation) {
      showPopoverHtml(anchorEl, `<div class="word-popover-meaning">${escapeHtml(item.explanation)}</div>`);
      return;
    }
    showPopoverHtml(anchorEl, `<div class="word-popover-meaning muted">Đang phân tích câu...</div>`);
    const res = await callChatAction("sentence_tip", { sentence: item?.text || "" });
    const text = res.ok ? res.content : res.error || "Không lấy được giải thích.";
    showPopoverHtml(anchorEl, `<div class="word-popover-meaning">${escapeHtml(text)}</div>`);
  }

  // ====== Thanh audio (chỉ hiện khi trình duyệt hỗ trợ Web Speech API) ======
  function audioBarHtml() {
    return `
      <div class="audio-bar" id="audio-bar">
        <button type="button" class="audio-btn" id="audio-back" title="Về đoạn trước">⏮</button>
        <button type="button" class="audio-btn" id="audio-back10" title="Lùi 10 giây">⏪</button>
        <button type="button" class="audio-btn audio-btn-play" id="audio-play" title="Phát">▶️</button>
        <button type="button" class="audio-btn" id="audio-fwd10" title="Tiến 10 giây">⏩</button>
        <div class="audio-volume-wrap">
          <button type="button" class="audio-btn" id="audio-volume-btn" title="Âm lượng">🔊</button>
          <input type="range" id="audio-volume-slider" class="audio-volume-slider" min="0" max="1" step="0.1" value="1" hidden />
        </div>
        <button type="button" class="audio-btn" id="audio-replay" title="Phát lại">🔁</button>
        <button type="button" class="audio-btn audio-btn-speed" id="audio-speed" title="Tốc độ đọc">1x</button>
      </div>
    `;
  }

  function wireAudioBar(panel) {
    panel.querySelector("#audio-back").addEventListener("click", () => ttsPlayer.back());
    panel.querySelector("#audio-back10").addEventListener("click", () => ttsPlayer.skip(-10));
    panel.querySelector("#audio-fwd10").addEventListener("click", () => ttsPlayer.skip(10));
    panel.querySelector("#audio-replay").addEventListener("click", () => ttsPlayer.replay());
    panel.querySelector("#audio-play").addEventListener("click", () => ttsPlayer.playPause());

    const volBtn = panel.querySelector("#audio-volume-btn");
    const volSlider = panel.querySelector("#audio-volume-slider");
    volBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      volSlider.hidden = !volSlider.hidden;
    });
    volSlider.addEventListener("input", (e) => ttsPlayer.setVolume(Number(e.target.value)));
    document.addEventListener("click", (e) => {
      if (!volSlider.hidden && !volBtn.contains(e.target) && !volSlider.contains(e.target)) volSlider.hidden = true;
    });

    panel.querySelector("#audio-speed").addEventListener("click", () => {
      const cur = ttsPlayer.getState().rate;
      const next = SPEEDS[(SPEEDS.indexOf(cur) + 1) % SPEEDS.length];
      ttsPlayer.setRate(next);
    });
  }

  function updateAudioBarUI(s) {
    const playBtn = document.getElementById("audio-play");
    const speedBtn = document.getElementById("audio-speed");
    const volSlider = document.getElementById("audio-volume-slider");
    if (playBtn) playBtn.textContent = s.playing ? "⏸" : "▶️";
    if (speedBtn) speedBtn.textContent = `${s.rate}x`;
    if (volSlider) volSlider.value = String(s.volume);
  }

  function wireInteractiveWords(container, sentence, genderHint) {
    container.querySelectorAll("[data-token-idx]").forEach((span) => {
      const word = span.textContent;
      // CHỈ trigger bằng click/chạm — hiện NGAY, không delay (đó là lỗi trước: chờ 250ms).
      // KHÔNG trigger bằng mouseenter nữa: chuột chỉ LƯỚT NGANG QUA từ (vd đang di chuyển
      // tới nút khác) cũng đủ kích hoạt tra từ, gây gọi AI thừa và tooltip bị đè lẫn nhau
      // giữa từ vừa lướt qua và từ vừa bấm.
      const trigger = () => showWordTooltip(span, word, sentence, genderHint);
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        trigger();
      });
    });
  }

  // Tooltip TỐI GIẢN: level (màu theo cấp độ) + từ + nghĩa + cụm từ đi kèm (nếu có) + icon
  // loa đọc từ/cụm đó (đúng giọng nhân vật của câu chứa từ này) — không giải thích, không
  // ví dụ, không lưu ý.
  async function showWordTooltip(anchorEl, word, sentence, genderHint) {
    showPopoverHtml(anchorEl, `<div class="word-popover-meaning muted">Đang tra...</div>`);

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
      showPopoverHtml(anchorEl, `<div class="word-popover-meaning error-text">Không tra được từ.</div>`);
      return;
    }
    showPopoverHtml(
      anchorEl,
      `
      <div class="word-popover-head">
        <span class="word-popover-level" data-level="${escapeHtml(data.level)}">${escapeHtml(data.level)}</span>
        <span class="word-popover-word">${escapeHtml(word)}</span>
        ${ttsSupported ? `<button type="button" class="word-popover-speak-btn" id="word-popover-speak" title="Đọc từ này">🔊</button>` : ""}
      </div>
      <div class="word-popover-meaning">${escapeHtml(data.meaning || "")}</div>
      ${data.collocation ? `<div class="word-popover-colloc">${escapeHtml(data.collocation)}</div>` : ""}
    `
    );
    document.getElementById("word-popover-speak")?.addEventListener("click", (e) => {
      e.stopPropagation();
      ttsPlayer.speakOnce(data.collocation || word, genderHint);
    });
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
    if (!points.length) {
      panel.innerHTML = `<p class="muted">Bài này không có điểm ngữ pháp nổi bật để học riêng.</p>`;
      return;
    }
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

  // Popover DÙNG CHUNG cho tooltip từ vựng + giải thích câu — tự định vị lại nếu không đủ
  // chỗ bên dưới (hiện lên TRÊN từ thay vì tràn ra ngoài màn hình).
  function showPopoverHtml(anchorEl, html) {
    document.getElementById("word-popover")?.remove();
    const popover = document.createElement("div");
    popover.id = "word-popover";
    popover.className = "word-popover";
    popover.innerHTML = html;
    document.body.appendChild(popover);

    const rect = anchorEl.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow < popRect.height + 16 && rect.top > popRect.height + 16
        ? window.scrollY + rect.top - popRect.height - 6
        : window.scrollY + rect.bottom + 6;
    const maxLeft = window.innerWidth - popRect.width - 8;
    const left = Math.max(8, Math.min(rect.left, maxLeft));
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;

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
    ttsPlayer.stop();
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
// "vocabulary". Từ khớp vocabulary (kể cả biến thể s/es/ed/ing) vẫn tô màu nổi bật; từ
// thường khác vẫn tương tác được nhưng không tô màu (chữ đen).
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
