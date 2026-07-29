// app/js/views/lesson.js — render TỪ 1 bản ghi "lessons", KHÔNG gọi AI để sinh nội dung
// (kiến trúc Lesson-first). "Hỏi AI" (word_lookup, sentence_tip) là action lẻ, realtime,
// không lưu — khác hoàn toàn với generate_lesson/analyze_user_text. Đọc-to dùng
// app/js/tts.js (Web Speech API, không gọi AI, không tốn credit).
import { getLessonById, getLessonProgress, upsertLessonProgress, setLessonFavorite, getNewsLessonById } from "../db.js";
import { addLookedUpWord, getLessonAudioUrl } from "../lessonApi.js";
import { callChatAction } from "../chatApi.js";
import { escapeHtml } from "../utils.js";
import { createPlayer, isTTSSupported, computeGenderHints } from "../tts.js";
import { icon } from "../icons.js";
import { showToast } from "../toast.js";
import { backChevronHtml, wireBackLink } from "../header.js";

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const SPEEDS = [0.75, 1, 1.25, 1.5];

// "opts.news" (2026-07-28, "Tin tức tự sinh") — true khi vào từ route /news-lesson/:id (mục
// con "Tin tức" dưới Phổ biến): đọc từ "news_lessons" (public, KHÔNG user_id) thay vì "lessons"
// cá nhân, tắt hẳn lưu tiến trình + nút Yêu thích (2 thứ đó gắn với user_id, không áp dụng được
// cho nội dung dùng chung) — MỌI phần còn lại (tooltip từ vựng, TTS, bài tập trong phiên xem)
// hoạt động Y HỆT bài cá nhân vì cùng 1 hình dạng dữ liệu (content/vocabulary/grammar/exercises).
export async function renderLessonDetail(mount, params, opts = {}) {
  const isNews = !!opts.news;
  const lessonId = params?.[0];
  if (!lessonId) {
    mount.innerHTML = `<div class="screen"><p class="error-text">Thiếu mã bài học.</p></div>`;
    return;
  }
  mount.innerHTML = `<div class="screen"><p class="muted">Đang tải bài học...</p></div>`;

  let lesson, progress;
  try {
    if (isNews) {
      lesson = await getNewsLessonById(lessonId);
      progress = null;
    } else {
      [lesson, progress] = await Promise.all([getLessonById(lessonId), getLessonProgress(lessonId)]);
    }
  } catch {
    mount.innerHTML = `<div class="screen"><p class="error-text">Không tải được bài học, thử lại sau.</p></div>`;
    return;
  }
  if (!lesson) {
    mount.innerHTML = `<div class="screen"><p class="error-text">Không tìm thấy bài học${isNews ? "" : " (có thể không thuộc tài khoản này)"}.</p></div>`;
    return;
  }

  const state = {
    tab: "content",
    page: progress?.completed_paragraphs || 0,
    completedExercises: new Set(progress?.completed_exercises || []),
    exerciseResults: Array.isArray(progress?.exercise_results) ? [...progress.exercise_results] : [],
    xpEarned: progress?.xp_earned || 0,
    showAllContent: false,
    showTranslation: true, // luôn hiện dịch mặc định, tắt được qua icon
    isFavorite: !!lesson.is_favorite,
    vocabView: "specialized", // mặc định hiện từ chuyên ngành ở tab Từ vựng (xem VOCAB_VIEWS)
  };
  // Tiêu đề mặc định tiếng Việt (title_vi) — tắt bản dịch thì đổi sang tiếng Anh (title),
  // nhất quán với việc ẩn/hiện bản dịch trong nội dung bài (icon "văn/A" ở tab Nội dung).
  function lessonTitleFor(showTranslation) {
    return showTranslation ? lesson.title_vi || lesson.title : lesson.title || lesson.title_vi;
  }

  // Cache trong phiên xem bài này — tra lại đúng 1 từ không gọi AI thêm lần nữa.
  const wordLookupCache = new Map();
  const ttsSupported = isTTSSupported();
  const genderHints = computeGenderHints(lesson.content); // 1 giọng cố định/nhân vật suốt bài

  // Âm thanh trả phí (2026-07-29) — CHỈ bài đọc/hội thoại CÓ lĩnh vực trong Thư viện AI, xem
  // api/_generate/audio.js. "audioEligible" chặn SỚM ở client (không hỏi server cho bài rõ
  // ràng không đủ điều kiện, đỡ 1 lượt round-trip vô ích) — server VẪN tự kiểm tra lại y hệt
  // (phòng hờ dữ liệu client cũ/sai), đây không phải lớp chặn duy nhất.
  const audioEligible = !isNews && lesson.source === "ai_generated" && !!lesson.industry;
  // index -> URL (string) | null (đã hỏi xong, không có/lỗi -> rơi về Web Speech). CHƯA có key
  // trong Map = CHƯA hỏi lần nào — khác "null" (đã hỏi, biết chắc không có).
  const audioUrlByIndex = new Map();
  const pendingAudioRequests = new Map(); // index -> Promise, chặn gọi trùng nếu chuyển đoạn dồn dập.

  function getCachedAudioUrl(index) {
    const v = audioUrlByIndex.get(index);
    return typeof v === "string" ? v : null;
  }

  // Gọi từ tts.js khi cần audio cho 1 đoạn CHƯA có cache — sinh lười ĐÚNG 1 LẦN/đoạn (server
  // tự cache vĩnh viễn vào lessons.audio_urls, xem api/_generate/audio.js), dedup ở ĐÂY cho
  // trường hợp người dùng bấm qua lại quá nhanh trước khi lượt gọi trước kịp xong.
  async function onNeedAudio(index) {
    if (pendingAudioRequests.has(index)) {
      await pendingAudioRequests.get(index);
      ttsPlayer.retryCurrentIfWaiting();
      return;
    }
    const p = (async () => {
      try {
        const res = await getLessonAudioUrl(lesson.id, index, genderHints[index]);
        audioUrlByIndex.set(index, res.ok && res.data.eligible && res.data.url ? res.data.url : null);
      } catch {
        audioUrlByIndex.set(index, null);
      }
    })();
    pendingAudioRequests.set(index, p);
    await p;
    pendingAudioRequests.delete(index);
    ttsPlayer.retryCurrentIfWaiting();
  }

  // Player dùng CHUNG cho toàn bộ tab "Nội dung" — nạp 1 lần với TẤT CẢ đoạn/lượt thoại
  // (không phụ thuộc đang xem "Từng câu" hay "Tất cả"), để nút back/tua/lặp lại của thanh
  // audio có thể đi xuyên trang khi ở chế độ "Từng câu" mà không cần tải lại player.
  let ttsLoaded = false;
  let lastSyncedPage = state.page;
  let renderContentBodyFn = null;
  // Thanh tiến trình (2026-07-29, thay 3 nút Về đoạn trước/Lùi 10s/Tiến 10s) — Web Speech API
  // không bắn sự kiện tiến trình liên tục trong lúc đọc (chỉ có onend/onstart cho MỖI utterance),
  // nên cần tự chạy 1 timer NHẸ để cập nhật thanh + nhãn thời gian mượt trong lúc đang phát;
  // "audioSeeking" chặn timer ghi đè vị trí thanh NGAY LÚC người dùng đang kéo tay (xem
  // wireAudioBar()/updateAudioBarUI() bên dưới).
  let progressTimer = null;
  let audioSeeking = false;
  function ensureProgressTimer(playing) {
    if (playing && !progressTimer) {
      progressTimer = setInterval(() => updateAudioBarUI(ttsPlayer.getState()), 500);
    } else if (!playing && progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }
  const ttsPlayer = createPlayer({
    onStateChange: (s) => {
      updateAudioBarUI(s);
      ensureProgressTimer(s.playing);
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
        ${backChevronHtml()}
        <h1 class="screen-title" id="lesson-title">${escapeHtml(lessonTitleFor(state.showTranslation))}</h1>
        ${isNews ? "" : `<button type="button" class="lesson-fav-btn ${state.isFavorite ? "is-favorite" : ""}" id="lesson-fav-btn" aria-label="Yêu thích">${icon("heart", { size: 19, filled: state.isFavorite })}</button>`}
      </div>
      <div class="tabs sticky-tabs" role="tablist">
        <button type="button" class="tab-btn active" data-tab="content">Nội dung</button>
        <button type="button" class="tab-btn" data-tab="vocabulary">Từ vựng</button>
        <button type="button" class="tab-btn" data-tab="grammar">Ngữ pháp</button>
        <button type="button" class="tab-btn" data-tab="exercises">Luyện tập</button>
      </div>
      <div id="lesson-panel"></div>
    </div>
  `;

  wireBackLink(mount, () => {
    ttsPlayer.stop();
    // history.back() thay vì navigate cố định "/lessons" — quay đúng về chỗ đã vào bài
    // (Bài học / Yêu thích / Lịch sử đều dẫn tới đây), hash router hoạt động đúng với
    // Back trình duyệt nên history.back() an toàn.
    history.back();
  });

  mount.querySelector("#lesson-fav-btn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const next = !state.isFavorite;
    btn.disabled = true;
    try {
      await setLessonFavorite(lesson.id, next);
      state.isFavorite = next;
      btn.innerHTML = icon("heart", { size: 19, filled: next });
      btn.classList.toggle("is-favorite", next);
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
        <button type="button" class="icon-toggle-btn ${state.showAllContent ? "active" : ""}" id="toggle-all-btn" title="Xem tất cả">${icon("list", { size: 18 })}</button>
        <button type="button" class="icon-toggle-btn ${state.showTranslation ? "active" : ""}" id="toggle-translate-btn" title="Ẩn/hiện bản dịch">${icon("languages", { size: 18 })}</button>
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
      // Tiêu đề bài học cũng đổi theo: mặc định tiếng Việt (title_vi), tắt dịch thì hiện
      // tiếng Anh (title) — nhất quán với việc tắt dịch trong nội dung bài.
      const titleEl = document.getElementById("lesson-title");
      if (titleEl) titleEl.textContent = lessonTitleFor(state.showTranslation);
    });

    if (ttsSupported) {
      wireAudioBar(panel);
      if (!ttsLoaded) {
        ttsPlayer.load(
          pages.map((p, i) => ({ text: p?.text || "", genderHint: genderHints[i] })),
          Math.min(state.page, Math.max(0, pages.length - 1)),
          { audioEligible, getAudioUrl: getCachedAudioUrl, onNeedAudio }
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
            <div class="content-nav">
              <button type="button" class="content-nav-btn" id="content-prev-btn" title="Câu trước" ${idx === 0 ? "disabled" : ""}>${icon("chevron-left", { size: 20 })}</button>
              <div class="content-progress muted">Trang ${idx + 1}/${pages.length}</div>
              <button type="button" class="content-nav-btn" id="content-next-btn" title="Câu tiếp theo" ${idx === pages.length - 1 ? "disabled" : ""}>${icon("chevron-right", { size: 20 })}</button>
            </div>
            <div class="content-item-header">
              <span class="speaker-name">${item?.speaker ? escapeHtml(item.speaker) : ""}</span>
              ${contentActionsHtml(idx)}
            </div>
            <div class="content-text" data-item-idx="${idx}">${renderInteractiveHtml(item?.text || "", lesson.vocabulary || [])}</div>
            ${state.showTranslation ? `<div class="content-translation">${escapeHtml(item?.translation || "")}</div>` : ""}
          </div>
        `;
        body.querySelector("#content-prev-btn").addEventListener("click", () => goToPage(idx - 1));
        body.querySelector("#content-next-btn").addEventListener("click", () => goToPage(idx + 1));
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

    // Chuyển câu thủ công (nút ‹/›), độc lập với việc trình duyệt có hỗ trợ đọc-to hay
    // không. Có TTS -> đi qua ttsPlayer để thanh audio + trạng thái phát luôn khớp đúng
    // đoạn đang xem (onStateChange ở trên tự cập nhật state.page + render lại). Không có
    // TTS -> tự cập nhật state.page rồi render lại, không đụng gì tới ttsPlayer (gọi vào sẽ
    // lỗi vì window.speechSynthesis không tồn tại).
    function goToPage(newIdx) {
      const clamped = Math.max(0, Math.min(pages.length - 1, newIdx));
      if (clamped === state.page) return;
      if (ttsSupported) {
        ttsPlayer.goTo(clamped);
      } else {
        state.page = clamped;
        saveProgress();
        renderContentBody();
      }
    }
  }

  // Tra trước TOÀN BỘ từ trong CẢ BÀI (mọi trang, không chỉ trang/câu đang xem, không chỉ chế
  // độ "Từng câu") ngay khi mở bài (2026-07-29, yêu cầu người dùng: "không chấp nhận treo vài
  // giây, đảm bảo 100% click vào hiện ngay" — trước đó chỉ prefetch câu đang xem ở chế độ
  // "Từng câu", "Xem tất cả" hoàn toàn không prefetch nên MỌI lần bấm đều phải chờ gọi AI).
  // Gọi ĐÚNG 1 LẦN lúc mount (bên dưới), không phụ thuộc tab/trang đang mở.
  //
  // "pendingLookups": key -> Promise, GẮN NGAY khi lên lịch tra (kể cả chưa thật sự gọi AI, xem
  // hàng đợi giới hạn song song bên dưới) — để showWordTooltip() LUÔN tìm thấy đúng promise đang
  // chờ mà DÙNG LẠI, không tự tạo 1 lượt gọi AI trùng lặp cho cùng 1 từ dù bấm sớm hơn lúc
  // prefetch thật sự xong. Giới hạn tối đa 8 lượt gọi AI song song (MAX_CONCURRENT_PREFETCH,
  // 4->8 ngày 2026-07-29 — Minh vẫn thấy tooltip xoay vòng ở bài "Tôi có văn bản": văn bản dán
  // vào tối đa 600 từ, nhiều gấp 2-4 lần 1 bài AI-tạo thông thường (~150-300 từ), nên hàng đợi
  // 4-song-song trước đó cần QUÁ LÂU mới tới lượt các từ cuối bài — 8 rút ngắn đáng kể thời gian
  // hàng đợi mà vẫn chưa đủ lớn để dễ đụng rate limit OpenAI) — 1 bài có thể có vài chục từ chưa
  // biết, gọi hết cùng lúc dễ đụng rate limit OpenAI/kéo dài thời gian phản hồi chung (xem rủi
  // ro đã ghi nhận về nhiều người dùng đồng thời).
  const pendingLookups = new Map();
  const MAX_CONCURRENT_PREFETCH = 8;
  let activePrefetchCount = 0;
  const prefetchQueue = [];

  function runPrefetchQueue() {
    while (activePrefetchCount < MAX_CONCURRENT_PREFETCH && prefetchQueue.length) {
      const job = prefetchQueue.shift();
      activePrefetchCount += 1;
      job().finally(() => {
        activePrefetchCount -= 1;
        runPrefetchQueue();
      });
    }
  }

  // Dùng ĐÚNG computeInteractiveSpans() để tra trước theo từng ĐƠN VỊ BẤM ĐƯỢC thật sự (cụm đã
  // gộp thành 1 khối, hoặc từ đơn lẻ) — không tra rời từng từ trong 1 cụm (vd "give"/"up" tách
  // rời), vì lúc bấm span đã gộp gửi ĐÚNG chuỗi cụm ("give up") làm "word", tra rời sẽ tạo
  // cache-key khác không bao giờ dùng tới (vừa sai vừa tốn thêm lượt AI).
  function scheduleLookup(word, sentence) {
    const key = `${word.toLowerCase()}|${sentence}`;
    if (wordLookupCache.has(key) || pendingLookups.has(key)) return;
    let resolveFn;
    const promise = new Promise((resolve) => {
      resolveFn = resolve;
    });
    pendingLookups.set(key, promise);
    prefetchQueue.push(async () => {
      const res = await callChatAction("word_lookup", { word, sentence }).catch(() => ({ ok: false }));
      let data = null;
      if (res.ok) {
        try {
          data = JSON.parse(res.content);
        } catch {
          data = null;
        }
      }
      if (data) {
        wordLookupCache.set(key, data);
        persistLookedUpWord(word, data);
      }
      resolveFn(data);
    });
    return promise;
  }

  function prefetchAllLessonWords() {
    (lesson.content || []).forEach((item) => {
      if (!item?.text) return;
      computeInteractiveSpans(item.text, lesson.vocabulary || []).forEach((s) => {
        // "s.entry" — từ/cụm này ĐÃ có nghĩa sẵn trong lesson.vocabulary (sinh cùng lúc tạo bài
        // hoặc đã có người tra/lưu trước đó), showWordTooltip() dùng thẳng KHÔNG cần gọi AI.
        if (s.entry) return;
        scheduleLookup(s.text, item.text);
      });
    });
    runPrefetchQueue();
  }

  // Gọi ĐÚNG 1 LẦN ở đây, NGAY SAU khi màn đã vẽ xong lần đầu (renderPanel() ở trên) — chạy NỀN,
  // không chặn hiển thị nội dung. KHÔNG gọi lại mỗi khi đổi tab/trang/chế độ xem: cache/
  // pendingLookups đã bao trọn CẢ bài ngay từ đầu, mọi trang/chế độ xem sau này chỉ đọc lại
  // đúng 1 bộ cache này.
  prefetchAllLessonWords();

  function contentActionsHtml(idx) {
    if (!ttsSupported) {
      return `<div class="content-item-actions"><button type="button" class="sentence-icon-btn" data-action="explain" data-idx="${idx}" title="Giải thích câu này">${icon("message-circle", { size: 15 })}</button></div>`;
    }
    return `
      <div class="content-item-actions">
        <button type="button" class="sentence-icon-btn" data-action="speak" data-idx="${idx}" title="Đọc câu này">${icon("volume", { size: 15 })}</button>
        <button type="button" class="sentence-icon-btn" data-action="explain" data-idx="${idx}" title="Giải thích câu này">${icon("message-circle", { size: 15 })}</button>
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
  // "mm:ss" — âm/NaN (playlist rỗng, chưa load xong) rơi về "0:00" thay vì hiện "NaN:NaN".
  function formatAudioTime(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds || 0));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, "0")}`;
  }

  // Bỏ 3 nút Về đoạn trước/Lùi 10s/Tiến 10s (2026-07-29, yêu cầu người dùng), thay bằng 1 thanh
  // tiến trình kéo được + nhãn thời gian — vừa gọn vừa cho tua tới bất kỳ đâu (không chỉ lùi/
  // tiến 10s cố định). "audio-seek" dùng thang 0-1000 (không phải 0-1) để bước kéo mượt hơn hẳn
  // input[type=range] step=0.001 trên 1 số trình duyệt di động.
  // 1 HÀNG DUY NHẤT (2026-07-29, Minh: "thanh bar audio quá lớn, đưa icon và thanh thời gian
  // nằm cùng 1 hàng" — bản 2 hàng trước đó cao hơn hẳn cần thiết) — gộp nhãn elapsed/total
  // thành 1 cụm "m:ss/m:ss" đặt SAU thanh kéo (không còn flanking 2 bên) để dồn hết chỗ ngang
  // cho thanh kéo, đủ chỗ cho Phát + Kéo + Thời gian + Âm lượng + Phát lại + Tốc độ trên 1 hàng.
  function audioBarHtml() {
    return `
      <div class="audio-bar" id="audio-bar">
        <button type="button" class="audio-btn audio-btn-play" id="audio-play" title="Phát">${icon("play", { size: 18, filled: true })}</button>
        <input type="range" id="audio-seek" class="audio-seek" min="0" max="1000" step="1" value="0" />
        <span class="audio-time"><span id="audio-time-elapsed">0:00</span>/<span id="audio-time-total">0:00</span></span>
        <div class="audio-volume-wrap">
          <button type="button" class="audio-btn" id="audio-volume-btn" title="Âm lượng">${icon("volume", { size: 15 })}</button>
          <input type="range" id="audio-volume-slider" class="audio-volume-slider" min="0" max="1" step="0.1" value="1" hidden />
        </div>
        <button type="button" class="audio-btn" id="audio-replay" title="Phát lại">${icon("repeat", { size: 15 })}</button>
        <button type="button" class="audio-btn audio-btn-speed" id="audio-speed" title="Tốc độ đọc">1x</button>
      </div>
    `;
  }

  function wireAudioBar(panel) {
    panel.querySelector("#audio-replay").addEventListener("click", () => ttsPlayer.replay());
    panel.querySelector("#audio-play").addEventListener("click", () => ttsPlayer.playPause());

    // "audioSeeking" (khai báo cùng ensureProgressTimer() ở trên) — bật khi NGÓN TAY đang kéo
    // (input), chặn timer/onStateChange ghi đè vị trí thanh giữa chừng; chỉ thật sự tua khi
    // NHẢ tay (change) — kéo xong mới gọi 1 lần, không gọi liên tục theo từng pixel kéo.
    const seek = panel.querySelector("#audio-seek");
    seek.addEventListener("input", () => {
      audioSeeking = true;
      const progress = ttsPlayer.getProgress();
      document.getElementById("audio-time-elapsed").textContent = formatAudioTime((Number(seek.value) / 1000) * progress.totalSeconds);
    });
    seek.addEventListener("change", () => {
      ttsPlayer.seekToFraction(Number(seek.value) / 1000);
      audioSeeking = false;
    });

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
    // "loadingAudio" (âm thanh trả phí đang sinh/tải cho đoạn hiện tại, xem tts.js) -> spinner
    // thay nút phát/tạm dừng, tránh người dùng tưởng bấm không ăn (bấm lại chỉ làm rối thêm).
    if (playBtn) {
      playBtn.innerHTML = s.loadingAudio
        ? `<span class="spinner spinner-sm"></span>`
        : s.playing
        ? icon("pause", { size: 18, filled: true })
        : icon("play", { size: 18, filled: true });
    }
    if (speedBtn) speedBtn.textContent = `${s.rate}x`;
    if (volSlider) volSlider.value = String(s.volume);

    // Không đụng thanh/nhãn "elapsed" khi người dùng ĐANG kéo tay (audioSeeking) — tránh giật
    // ngược giữa chừng lúc kéo, xem wireAudioBar().
    if (audioSeeking) return;
    const seek = document.getElementById("audio-seek");
    const elapsedEl = document.getElementById("audio-time-elapsed");
    const totalEl = document.getElementById("audio-time-total");
    if (!seek) return;
    const progress = ttsPlayer.getProgress();
    seek.value = String(Math.round(progress.fraction * 1000));
    if (elapsedEl) elapsedEl.textContent = formatAudioTime(progress.elapsedSeconds);
    if (totalEl) totalEl.textContent = formatAudioTime(progress.totalSeconds);
  }

  // "spans" tính lại NGUYÊN VẸN bằng computeInteractiveSpans() (2026-07-28, sửa lỗi tooltip xoay
  // vòng chờ trước khi ra nghĩa) — ĐÚNG hàm dùng để render các span [data-token-idx] ở trên nên
  // thứ tự khớp 1-1 theo index, cho phép lấy lại "entry" (mục lesson.vocabulary đã sinh SẴN lúc
  // tạo bài — word/meaning/type/example) mà renderInteractiveHtml() vốn đã tính nhưng không
  // truyền tiếp xuống đây. Có "entry" -> hiện tooltip NGAY, không gọi AI/không qua cache.
  function wireInteractiveWords(container, sentence, genderHint) {
    const spans = computeInteractiveSpans(sentence, lesson.vocabulary || []);
    container.querySelectorAll("[data-token-idx]").forEach((span) => {
      const idx = Number(span.dataset.tokenIdx);
      const word = span.textContent;
      const entry = spans[idx]?.entry || null;
      // CHỈ trigger bằng click/chạm — hiện NGAY, không delay (đó là lỗi trước: chờ 250ms).
      // KHÔNG trigger bằng mouseenter nữa: chuột chỉ LƯỚT NGANG QUA từ (vd đang di chuyển
      // tới nút khác) cũng đủ kích hoạt tra từ, gây gọi AI thừa và tooltip bị đè lẫn nhau
      // giữa từ vừa lướt qua và từ vừa bấm.
      const trigger = () => showWordTooltip(span, word, sentence, genderHint, entry);
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        trigger();
      });
    });
  }

  // Tooltip TỐI GIẢN: level (màu theo cấp độ) + từ + nghĩa + cụm từ đi kèm (nếu có) + icon
  // loa đọc từ/cụm đó (đúng giọng nhân vật của câu chứa từ này) — không giải thích, không
  // ví dụ, không lưu ý.
  //
  // "vocabEntry" (2026-07-28, sửa lỗi tooltip xoay vòng chờ trước khi ra nghĩa) — từ/cụm này ĐÃ
  // có nghĩa sẵn trong lesson.vocabulary (từ computeInteractiveSpans(), sinh cùng lúc tạo bài
  // hoặc đã có người tra/lưu trước đó) -> dùng THẲNG, hiện NGAY LẬP TỨC, không đụng cache/API/
  // spinner gì cả.
  //
  // KHÔNG "vocabEntry" (2026-07-29, "đảm bảo 100% click vào hiện ngay") — prefetchAllLessonWords()
  // đã lên lịch tra TOÀN BỘ từ của cả bài NGAY khi mở bài (không chỉ câu đang xem), nên hầu như
  // luôn đã CÓ SẴN trong wordLookupCache hoặc ít nhất đang có 1 Promise trong pendingLookups —
  // DÙNG LẠI đúng promise đó (KHÔNG tự tạo 1 lượt gọi AI trùng lặp) thay vì tự bắn 1 request mới
  // như bản cũ. Chỉ khi cả 2 đều không có (trường hợp cực hiếm — từ mới do renderInteractiveHtml/
  // prefetchAllLessonWords lệch nhau) mới tự gọi API riêng làm phương án cuối.
  async function showWordTooltip(anchorEl, word, sentence, genderHint, vocabEntry) {
    const cacheKey = `${word.toLowerCase()}|${sentence}`;
    let data = vocabEntry ? { level: lesson.level, meaning: vocabEntry.meaning } : wordLookupCache.get(cacheKey);

    if (!data) {
      showPopoverHtml(anchorEl, `<div class="word-popover-loading"><span class="spinner spinner-sm"></span></div>`);
      const pending = pendingLookups.get(cacheKey);
      if (pending) {
        data = await pending;
      } else {
        const res = await callChatAction("word_lookup", { word, sentence });
        if (res.ok) {
          try {
            data = JSON.parse(res.content);
          } catch {
            data = null;
          }
        }
        if (data) {
          wordLookupCache.set(cacheKey, data);
          persistLookedUpWord(word, data);
        }
      }
    }

    if (!data || !CEFR_LEVELS.includes(data.level)) {
      showPopoverHtml(anchorEl, `<div class="word-popover-meaning error-text">Không tra được từ.</div>`);
      return;
    }
    persistLookedUpWord(word, data);
    showPopoverHtml(
      anchorEl,
      `
      <div class="word-popover-head">
        <span class="word-popover-level" data-level="${escapeHtml(data.level)}">${escapeHtml(data.level)}</span>
        <span class="word-popover-word">${escapeHtml(word)}</span>
        ${ttsSupported ? `<button type="button" class="word-popover-speak-btn" id="word-popover-speak" title="Đọc từ này">${icon("volume", { size: 14 })}</button>` : ""}
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

  // Tra 1 từ/cụm xong (dù do người dùng bấm hay do prefetchAllLessonWords() chạy nền) -> tự
  // thêm vào bảng Từ vựng của bài (nhóm "Đã tra", xem VOCAB_VIEWS trong renderVocabularyTab) —
  // cập nhật NGAY trong bộ nhớ (để computeInteractiveSpans() sau đó tự thấy "s.entry", không
  // cần chờ gọi AI lại trong CÙNG phiên xem) + lưu thật xuống DB (fire-and-forget qua
  // lessonApi.js, "isNews" chọn đúng bảng — xem addLookedUpWord/add_news_vocab_word) để LẦN SAU
  // mở lại bài (kể cả người dùng KHÁC, với bài Tin tức dùng chung) vẫn có sẵn, không cần tra
  // lại AI — đây là điều kiện để "prefetch cả bài" không lặp lại chi phí AI mỗi lần mở bài.
  function persistLookedUpWord(word, data) {
    const key = word.trim().toLowerCase();
    const exists = (lesson.vocabulary || []).some((w) => (w.word || "").trim().toLowerCase() === key);
    if (exists) return;
    if (!lesson.vocabulary) lesson.vocabulary = [];
    lesson.vocabulary.push({
      word,
      meaning: data.meaning || "",
      ipa: "",
      type: "",
      example: "",
      is_specialized: false,
      source: "user_lookup",
    });
    addLookedUpWord(lesson.id, word, data, isNews);
  }

  // ====== Tab Từ vựng ======
  // "word" trong vocabulary có thể là 1 từ đơn hoặc 1 cụm từ (đúng schema "từ hoặc cụm từ"
  // trong 2 file prompt). 4 nhóm hiển thị, ưu tiên theo thứ tự (1 từ chỉ thuộc ĐÚNG 1 nhóm):
  // "looked_up" (người học tự tra thêm — source==="user_lookup") > "specialized"
  // (is_specialized, MẶC ĐỊNH hiện đầu tiên vì đây là mục đích chính của bài) > "phrase"
  // (nhiều từ) > "word" (từ đơn thường).
  const VOCAB_VIEWS = [
    { value: "specialized", label: "Chuyên ngành", icon: "briefcase", empty: "Bài này không có từ chuyên ngành nổi bật." },
    { value: "phrase", label: "Cụm", icon: "languages", empty: "Bài này không có cụm từ nổi bật." },
    { value: "word", label: "Từ", icon: "book-open", empty: "Bài này không có từ đơn nổi bật." },
    { value: "looked_up", label: "Đã tra", icon: "bookmark", empty: "Chưa tra thêm từ nào — bấm vào từ trong bài để tra, từ đó sẽ tự xuất hiện ở đây." },
  ];

  function isPhrase(word) {
    return /\s/.test((word || "").trim());
  }

  function categorizeVocabWord(w) {
    if (w.source === "user_lookup") return "looked_up";
    if (w.is_specialized) return "specialized";
    if (isPhrase(w.word)) return "phrase";
    return "word";
  }

  function renderVocabularyTab(panel) {
    panel.innerHTML = `
      <div class="content-toolbar">
        ${VOCAB_VIEWS.map((v) => `<button type="button" class="icon-toggle-btn" id="vocab-view-${v.value}" title="${escapeHtml(v.label)}">${icon(v.icon, { size: 15 })}</button>`).join("")}
      </div>
      <div id="vocab-list-body"></div>
    `;
    VOCAB_VIEWS.forEach((v) => {
      panel.querySelector(`#vocab-view-${v.value}`).addEventListener("click", () => {
        state.vocabView = v.value;
        renderVocabBody();
      });
    });
    renderVocabBody();

    function renderVocabBody() {
      VOCAB_VIEWS.forEach((v) => {
        panel.querySelector(`#vocab-view-${v.value}`).classList.toggle("active", state.vocabView === v.value);
      });
      const viewDef = VOCAB_VIEWS.find((v) => v.value === state.vocabView) || VOCAB_VIEWS[0];
      const words = (lesson.vocabulary || []).filter((w) => categorizeVocabWord(w) === state.vocabView);
      const body = panel.querySelector("#vocab-list-body");
      if (!words.length) {
        body.innerHTML = `<p class="muted">${escapeHtml(viewDef.empty)}</p>`;
        return;
      }
      body.innerHTML = `
        <div class="vocab-list">
          ${words
            .map(
              (w) => `
            <div class="vocab-item ${w.is_specialized ? "vocab-item-specialized" : ""}">
              <div class="vocab-word-row">
                <div class="vocab-word ${ttsSupported ? "vocab-word-clickable" : ""}" data-word="${escapeHtml(w.word)}">
                  ${escapeHtml(w.word)} <span class="vocab-ipa muted">${escapeHtml(w.ipa || "")}</span>
                </div>
                ${ttsSupported ? `<button type="button" class="sentence-icon-btn vocab-speak-btn" data-word="${escapeHtml(w.word)}" title="Đọc từ này">${icon("volume", { size: 15 })}</button>` : ""}
              </div>
              ${
                categorizeVocabWord(w) === "phrase" && w.type
                  ? `<div class="vocab-type-badge badge">${escapeHtml(w.type)}</div>`
                  : `<div class="vocab-type muted">${escapeHtml(w.type || "")}</div>`
              }
              <div class="vocab-meaning">${escapeHtml(w.meaning || "")}</div>
              <div class="vocab-example muted">${escapeHtml(w.example || "")}</div>
            </div>
          `
            )
            .join("")}
        </div>
      `;
      if (ttsSupported) {
        // Cả icon loa lẫn bấm thẳng vào từ đều phát âm — không bắt buộc phải dùng icon.
        body.querySelectorAll(".vocab-speak-btn, .vocab-word-clickable").forEach((el) => {
          el.addEventListener("click", () => ttsPlayer.speakOnce(el.dataset.word));
        });
      }
    }
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

  function feedbackHtml(correct, label, rest) {
    const cls = correct ? "feedback-correct" : "feedback-wrong";
    return `<span class="feedback-icon ${cls}">${icon(correct ? "check-circle" : "x-circle", { size: 16 })}</span> ${escapeHtml(label)}${escapeHtml(rest || "")}`;
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
          feedback.innerHTML = feedbackHtml(correct, correct ? "Chính xác! " : "Chưa đúng. ", ex.explanation);
          markExerciseDone(i, correct, ex.grammar_tag);
        });
      });
    } else {
      const input = item.querySelector(".fill-blank-input");
      item.querySelector(".check-fill-btn").addEventListener("click", () => {
        const correct = normalizeAnswer(input.value) === normalizeAnswer(ex.answer);
        input.disabled = true;
        item.querySelector(".check-fill-btn").disabled = true;
        feedback.hidden = false;
        feedback.innerHTML = correct ? feedbackHtml(true, "Chính xác!") : feedbackHtml(false, "Đáp án đúng: ", ex.answer);
        markExerciseDone(i, correct, ex.grammar_tag);
      });
    }
  }

  // exerciseResults: nguồn dữ liệu DUY NHẤT cho Review Queue của Mentor AI (api/_generate/
  // mentor.js computeReviewQueue) — khác completedExercises (Set chỉ số, chỉ biết "đã làm hay
  // chưa"), mảng này lưu ĐÚNG/SAI + grammar_tag từng câu, mới phân biệt được "hay sai điểm
  // ngữ pháp nào" để Mentor gợi ý ôn tập đúng chỗ.
  function markExerciseDone(i, correct, grammarTag) {
    state.completedExercises.add(i);
    state.exerciseResults.push({ index: i, correct, grammar_tag: grammarTag || null });
    if (correct) {
      const total = (lesson.exercises || []).length || 1;
      state.xpEarned += Math.max(1, Math.round((lesson.xp_reward || 20) / total));
    }
    saveProgress();
  }

  function saveProgress() {
    // Tin tức (2026-07-28) — bài KHÔNG thuộc user_id nào (public, "news_lessons"), không có
    // tiến trình cá nhân để lưu (lesson_progress FK tới "lessons", không tới "news_lessons").
    if (isNews) return;
    const total = (lesson.exercises || []).length;
    const allDone = total > 0 && state.completedExercises.size === total;
    upsertLessonProgress(lesson.id, {
      completed_paragraphs: state.page,
      completed_exercises: Array.from(state.completedExercises),
      exercise_results: state.exerciseResults,
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
    if (progressTimer) clearInterval(progressTimer);
    document.getElementById("word-popover")?.remove();
    // Rời bài CHƯA hoàn thành nhưng ĐÃ có chút tiến độ (đọc dở/làm dở bài tập) — giọng rủ rê,
    // KHÔNG trách móc (mục 6.4 Đợt 3: cấm giọng "bạn chưa hoàn thành"). Bài chưa động tới gì
    // (mở ra rồi thoát ngay) thì không có gì để "lưu lại", không hiện thông báo.
    const total = (lesson.exercises || []).length;
    const allDone = total > 0 && state.completedExercises.size === total;
    const hasProgress = state.completedExercises.size > 0 || state.page > 0;
    if (!allDone && hasProgress) {
      showToast("Bài này bạn đang học dở, mình lưu lại rồi, khi nào quay lại mình học tiếp nhé");
    }
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

// Xác định các "đơn vị bấm được" trong 1 câu: mục "vocabulary" là CỤM (nhiều từ, vd "give
// up") được GỘP thành 1 khối bấm được DUY NHẤT bao trọn cả cụm, thay vì để rời từng từ
// "give"/"up" bấm riêng — đúng hành vi "gộp cụm" đã dùng ở app cũ
// (learning-english-ai/render/render-interactive.js: khớp cụm DÀI NHẤT trước, các token đã
// dùng cho 1 cụm thì không dùng lại cho cụm khác). Từ còn lại (không thuộc cụm nào) vẫn bấm
// riêng từng từ như cũ. Dùng CHUNG cho dựng HTML (renderInteractiveHtml) lẫn tra trước
// (prefetchAllLessonWords) để chỉ có 1 nơi định nghĩa "thế nào là khớp cụm".
function computeInteractiveSpans(text, vocabulary) {
  const { tokens } = tokenizeWords(text);
  if (!tokens.length) return [];
  const vocabMap = buildVocabMap(vocabulary);

  const phraseEntries = (vocabulary || [])
    .filter((w) => w.word && /\s/.test(w.word.trim()))
    .map((w) => ({ entry: w, words: w.word.trim().toLowerCase().split(/\s+/) }))
    .sort((a, b) => b.words.length - a.words.length || b.entry.word.length - a.entry.word.length);

  const usedTokenIdx = new Set();
  const matchByStart = new Map(); // token index bắt đầu -> { endIdx, entry }
  phraseEntries.forEach(({ entry, words }) => {
    for (let i = 0; i <= tokens.length - words.length; i++) {
      if (usedTokenIdx.has(i)) continue;
      let ok = true;
      for (let j = 0; j < words.length; j++) {
        const idx = i + j;
        if (usedTokenIdx.has(idx) || !tokens[idx] || tokens[idx].word.toLowerCase() !== words[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        for (let j = 0; j < words.length; j++) usedTokenIdx.add(i + j);
        matchByStart.set(i, { endIdx: i + words.length - 1, entry });
        break; // 1 cụm chỉ cần khớp lần xuất hiện đầu tiên trong câu là đủ để bấm/tra
      }
    }
  });

  const spans = [];
  let i = 0;
  while (i < tokens.length) {
    const phrase = matchByStart.get(i);
    if (phrase) {
      const startTok = tokens[i];
      const endTok = tokens[phrase.endIdx];
      spans.push({ text: text.slice(startTok.start, endTok.end), start: startTok.start, end: endTok.end, entry: phrase.entry });
      i = phrase.endIdx + 1;
    } else {
      const t = tokens[i];
      spans.push({ text: t.word, start: t.start, end: t.end, entry: findVocabEntry(t.word, vocabMap) });
      i += 1;
    }
  }
  return spans;
}

// Bọc TẤT CẢ từ/cụm trong "text" thành span rê/chạm được — không chỉ riêng từ trong
// "vocabulary". Từ/cụm khớp vocabulary (kể cả biến thể s/es/ed/ing với từ đơn) vẫn tô màu
// nổi bật; từ thường khác vẫn tương tác được nhưng không tô màu (chữ đen).
function renderInteractiveHtml(text, vocabulary) {
  if (!text) return "";
  const spans = computeInteractiveSpans(text, vocabulary);
  if (!spans.length) return escapeHtml(text);

  let html = "";
  let cursor = 0;
  spans.forEach((s, i) => {
    html += escapeHtml(text.slice(cursor, s.start));
    const cls = s.entry ? (s.entry.is_specialized ? "vocab-highlight-specialized" : "vocab-highlight") : "hover-word";
    html += `<span class="${cls}" data-token-idx="${i}">${escapeHtml(s.text)}</span>`;
    cursor = s.end;
  });
  html += escapeHtml(text.slice(cursor));
  return html;
}
