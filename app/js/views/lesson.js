// app/js/views/lesson.js — render TỪ 1 bản ghi "lessons", KHÔNG gọi AI để sinh nội dung
// (kiến trúc Lesson-first). Tra từ/cụm ĐỌC THẲNG dữ liệu "phrase_groups" đã lưu sẵn trong bài
// (sinh cùng lúc tạo bài, hoặc vá 1 lần cho bài cũ — xem ensurePhraseGroupsPatched() bên dưới),
// KHÔNG còn gọi AI mỗi lần bấm (2026-08-05, "sửa gốc tính năng tra từ", xem
// docs/NHAT-KY-LAM-VIEC.md). "sentence_tip" vẫn là action lẻ, realtime, không lưu. Đọc-to dùng
// app/js/tts.js (Web Speech API, không gọi AI, không tốn credit).
import { getLessonWithProgress, upsertLessonProgress, setLessonFavorite, getNewsLessonById } from "../db.js";
import { analyzeLessonPhraseGroups, getLessonFullAudioUrl, fetchAndSaveLessonCover } from "../lessonApi.js";
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
  // Khung "xương" GIỐNG HÌNH DẠNG màn thật (header + tabs, mục B1 — 2026-07-30, Minh: "chớp
  // giao diện khi chuyển route, ví dụ vào 1 bài học") — trước đây khung chờ chỉ là 1 dòng chữ
  // giữa màn hình rỗng, khi dữ liệu về (thường rất nhanh vì Supabase REST nhẹ) toàn bộ mount bị
  // thay bằng khung THẬT khác hẳn hình dạng -> mắt người thấy như 1 cú "chớp" dù không có
  // khoảng trắng thật sự (cùng nguyên nhân/cách sửa như card lĩnh vực ở Thư viện AI trước đó:
  // giữ hình dạng ổn định xuyên suốt lúc chờ, không đổi bố cục đột ngột khi dữ liệu về).
  mount.innerHTML = `
    <div class="screen">
      <div class="lesson-header-row">
        ${backChevronHtml()}
        <h1 class="screen-title skeleton-line skeleton-shimmer" style="height:1.2em;width:60%"></h1>
      </div>
      <div class="tabs sticky-tabs" role="tablist">
        <button type="button" class="tab-btn active" disabled>Nội dung</button>
        <button type="button" class="tab-btn" disabled>Từ vựng</button>
        <button type="button" class="tab-btn" disabled>Ngữ pháp</button>
        <button type="button" class="tab-btn" disabled>Luyện tập</button>
      </div>
      <div class="content-page">
        <div class="skeleton-line skeleton-shimmer" style="width:100%;height:14px;margin-bottom:10px"></div>
        <div class="skeleton-line skeleton-shimmer" style="width:90%;height:14px;margin-bottom:10px"></div>
        <div class="skeleton-line skeleton-shimmer" style="width:75%;height:14px"></div>
      </div>
    </div>
  `;
  wireBackLink(mount, () => history.back());

  let lesson, progress;
  try {
    if (isNews) {
      lesson = await getNewsLessonById(lessonId);
      progress = null;
    } else {
      // 1 lượt gọi DUY NHẤT (2026-08-05, trước đó Promise.all(getLessonById, getLessonProgress)
      // = 2 lượt restFetch() riêng — gộp bằng embed quan hệ FK, xem getLessonWithProgress()
      // trong db.js, cùng đợt rà soát bug race-condition refresh_token).
      ({ lesson, progress } = await getLessonWithProgress(lessonId));
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

  const ttsSupported = isTTSSupported();
  const genderHints = computeGenderHints(lesson.content); // 1 giọng cố định/nhân vật suốt bài

  // Gộp cặp lượt thoại (2026-07-30, mục 9 — Minh: "gộp mỗi CẶP hỏi-đáp vào chung 1 khung", yêu
  // cầu lại từ Đợt 2). CHỈ áp dụng cho hội thoại (có "speaker") — bài đọc thường (không có
  // speaker) giữ nguyên 1 đoạn/1 trang như trước, không có khái niệm "cặp". "pairIndexFor"/
  // "pairStartIndex" quy đổi 2 chiều giữa chỉ số TRANG hiển thị (CẶP cho hội thoại, ĐOẠN cho bài
  // đọc — chỉ dùng cục bộ trong renderContentTab() để tính phân trang/điều hướng) và chỉ số CÂU
  // THẬT trong "lesson.content"/"ttsPlayer.items"/"state.page" (state.page LUÔN là chỉ số câu
  // thật, KHÔNG đổi đơn vị — khớp completed_paragraphs đã lưu + progress_page dùng ở nơi khác,
  // xem ghi chú tại chỗ gọi ttsPlayer.load()).
  const isDialogueLesson = (lesson.content || []).some((it) => it?.speaker);
  function pairIndexFor(itemIdx) {
    return isDialogueLesson ? Math.floor(itemIdx / 2) : itemIdx;
  }
  function pairStartIndex(pageIdx) {
    return isDialogueLesson ? pageIdx * 2 : pageIdx;
  }

  // Âm thanh trả phí — CHỈ bài đọc/hội thoại CÓ lĩnh vực trong Thư viện AI, xem
  // api/_generate/audio.js. "audioEligible" chặn SỚM ở client (không hỏi server cho bài rõ
  // ràng không đủ điều kiện, đỡ 1 lượt round-trip vô ích) — server VẪN tự kiểm tra lại y hệt
  // (phòng hờ dữ liệu client cũ/sai), đây không phải lớp chặn duy nhất.
  // SỬA LẠI TOÀN BỘ KIẾN TRÚC (2026-07-30, xem ghi chú đầu tts.js) — ĐÚNG 1 lượt gọi
  // generate_lesson_full_audio, KHÔNG còn cache/dedup theo TỪNG CÂU nữa (server tự cache
  // NGUYÊN CẢ FILE). lessonApi.js::prefetchLessonAudio() đã gọi action này NGAY lúc tạo bài
  // (fire-and-forget) — ở đây gọi LẠI làm lưới đỡ (idempotent, server trả thẳng URL đã lưu nếu
  // có) cho ca mở bài quá nhanh trước khi lượt gọi sớm kịp xong.
  const audioEligible = !isNews && lesson.source === "ai_generated" && !!lesson.industry;
  if (audioEligible) {
    getLessonFullAudioUrl(lesson.id, genderHints)
      .then((res) => {
        if (res.ok && res.data.eligible && res.data.url) ttsPlayer.setFullAudioUrl(res.data.url, res.data.segmentTimes);
      })
      .catch(() => {
        // Im lặng — lỗi ở đây chỉ có nghĩa "chưa nâng cấp được lên audio thật", vẫn nghe được
        // bằng Web Speech miễn phí ngay lập tức, không phải lỗi cần hiện thông báo.
      });
  }

  // Ảnh bìa còn thiếu -> thử lại NGAY LÚC MỞ BÀI (2026-07-30, mục 7 — Minh: "một số bài có
  // ảnh, một số không"). fetchAndSaveLessonCover() vốn chỉ gọi ĐÚNG 1 LẦN lúc tạo bài
  // (fire-and-forget) — thất bại thoáng qua (mạng chập chờn/không tìm được ảnh lúc đó) thì
  // KHÔNG có cơ chế thử lại nào, và bài tạo TRƯỚC khi tính năng này tồn tại thì chưa từng được
  // gọi lần nào cả. Gọi lại ở đây (cũng fire-and-forget, không chặn hiển thị bài) mỗi lần mở 1
  // bài chưa có ảnh — cùng nguyên tắc idempotent như getLessonFullAudioUrl() ở trên: có ảnh rồi
  // thì hàm đó tự thoát sớm (title rỗng/đã có ảnh), gọi thêm không tốn kém gì. Chỉ áp dụng bài
  // cá nhân (không phải Tin tức — news.js tự lo ảnh riêng lúc sinh tin).
  if (!isNews && !lesson.cover_image_url) {
    fetchAndSaveLessonCover(lesson).catch(() => {});
  }

  // Player dùng CHUNG cho toàn bộ tab "Nội dung" — nạp 1 lần với TẤT CẢ đoạn/lượt thoại
  // (không phụ thuộc đang xem "Từng câu" hay "Tất cả"), để nút back/tua/lặp lại của thanh
  // audio có thể đi xuyên trang khi ở chế độ "Từng câu" mà không cần tải lại player.
  let ttsLoaded = false;
  let renderContentBodyFn = null;
  // Cập nhật CHỈ highlight câu đang đọc bên trong 1 khung cặp, KHÔNG render lại cả khung (mục 9)
  // — gán lại mỗi lần renderContentBody() vẽ khung "Từng câu" mới, xem bên dưới.
  let updateActiveTurnFn = null;
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
      // "Đã học" (2026-08-04) = nghe TRỌN VẸN audio thật, không phải chỉ bấm Play — s.justEnded
      // chỉ true ĐÚNG 1 lần lúc tts.js xác nhận đã phát hết toàn bộ playlist (file ghép sẵn HOẶC
      // fallback Web Speech, xem ghi chú tại tts.js::justEnded). Đứng NGOÀI "if showAllContent
      // return" bên dưới vì đây không liên quan gì tới trang/khung đang hiển thị.
      if (s.justEnded) saveProgress({ fullyListened: true });
      if (state.showAllContent || s.itemIndex === state.page) return;
      // "state.page" LUÔN lưu chỉ số CÂU thật (khớp completed_paragraphs/progress_page dùng ở
      // nơi khác, xem ghi chú ttsPlayer.load()) — chỉ khác NHAU giữa 2 lượt gọi ở đơn vị TRANG
      // (pairIndexFor) mới quyết định có cần render lại cả khung hay không.
      const pairChanged = pairIndexFor(s.itemIndex) !== pairIndexFor(state.page);
      state.page = s.itemIndex;
      saveProgress();
      if (pairChanged || !updateActiveTurnFn) {
        // Sang CẶP mới (hoặc sang đoạn mới, bài đọc thường) -> đổi khung, render lại toàn bộ.
        if (renderContentBodyFn) renderContentBodyFn();
      } else {
        // VẪN trong CÙNG 1 cặp (vd câu 1 -> câu 2 của cùng 1 lượt hỏi-đáp, mục 9 — Minh: "không
        // chuyển card khi chuyển từ câu 1 sang câu 2 trong cùng 1 cặp") -> CHỈ đổi highlight bên
        // trong khung đang hiện, không render lại (tránh giật/nhấp nháy vô ích).
        updateActiveTurnFn(s.itemIndex);
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
    // Tổng số "trang" hiển thị ở chế độ "Từng câu" — CẶP cho hội thoại (2 câu/trang, mục 9),
    // ĐOẠN cho bài đọc thường (không đổi, 1 câu/trang như trước).
    const totalPages = isDialogueLesson ? Math.max(1, Math.ceil(pages.length / 2)) : Math.max(1, pages.length);
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
        // "state.page" LUÔN là chỉ số câu THẬT (khớp completed_paragraphs đã lưu/đọc lại +
        // progress_page dùng ở thẻ "Bài đang đọc", xem lessonCard.js) — KHÔNG đổi đơn vị thành
        // "cặp" dù hiển thị gộp cặp (mục 9), tránh làm sai % tiến độ ở nơi khác. Việc gộp cặp
        // chỉ ảnh hưởng CÁCH HIỂN THỊ (renderContentBody/goToPage bên dưới), không ảnh hưởng
        // đơn vị lưu trữ.
        ttsPlayer.load(
          pages.map((p, i) => ({ text: p?.text || "", genderHint: genderHints[i] })),
          Math.min(Math.max(0, state.page), Math.max(0, pages.length - 1))
        );
        ttsLoaded = true;
      }
      updateAudioBarUI(ttsPlayer.getState());
    }

    renderContentBodyFn = renderContentBody;
    renderContentBody();

    function renderContentBody() {
      const body = panel.querySelector("#content-body");
      // "idx" = chỉ số CÂU thật (đơn vị lưu trữ, xem ghi chú ttsPlayer.load ở trên). "pageIdx" =
      // chỉ số TRANG hiển thị (CẶP cho hội thoại, mục 9) — CHỈ dùng để tính toán phân trang/điều
      // hướng, không lưu riêng.
      const idx = Math.min(Math.max(0, state.page), Math.max(0, pages.length - 1));
      const pageIdx = Math.min(pairIndexFor(idx), totalPages - 1);

      if (state.showAllContent) {
        updateActiveTurnFn = null;
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
              <div class="content-text" data-item-idx="${i}">${renderInteractiveHtml(item?.text || "", lesson.vocabulary || [], item?.phrase_groups)}</div>
              ${state.showTranslation ? `<div class="content-translation">${escapeHtml(item?.translation || "")}</div>` : ""}
            `
              )
              .join("")}
          </div>
        `;
      } else if (isDialogueLesson) {
        // Cặp lượt thoại (mục 9) — 2 câu liên tiếp trong CÙNG 1 khung, mỗi câu đánh dấu
        // "data-turn-idx" đúng chỉ số THẬT (để updateActiveTurnFn tô sáng đúng câu đang đọc mà
        // không cần render lại cả khung khi chuyển từ câu 1 sang câu 2 của cùng cặp).
        const start = pairStartIndex(pageIdx);
        const turnIndices = [start, start + 1].filter((i) => i < pages.length);
        const activeItemIdx = ttsSupported ? ttsPlayer.getState().itemIndex : idx;
        body.innerHTML = `
          <div class="content-nav">
            <div class="content-progress muted">Trang ${pageIdx + 1}/${totalPages}</div>
            <div class="content-nav-btns">
              <button type="button" class="content-nav-btn" id="content-prev-btn" title="Cặp trước" ${pageIdx === 0 ? "disabled" : ""}>${icon("chevron-left", { size: 20 })}</button>
              <button type="button" class="content-nav-btn" id="content-next-btn" title="Cặp tiếp theo" ${pageIdx === totalPages - 1 ? "disabled" : ""}>${icon("chevron-right", { size: 20 })}</button>
            </div>
          </div>
          <div class="content-page">
            ${turnIndices
              .map(
                (i) => `
              ${i > start ? '<div class="content-divider"></div>' : ""}
              <div class="content-turn ${i === activeItemIdx ? "active-turn" : ""}" data-turn-idx="${i}">
                <div class="content-item-header">
                  <span class="speaker-name">${pages[i]?.speaker ? escapeHtml(pages[i].speaker) : ""}</span>
                  ${contentActionsHtml(i)}
                </div>
                <div class="content-text" data-item-idx="${i}">${renderInteractiveHtml(pages[i]?.text || "", lesson.vocabulary || [], pages[i]?.phrase_groups)}</div>
                ${state.showTranslation ? `<div class="content-translation">${escapeHtml(pages[i]?.translation || "")}</div>` : ""}
              </div>
            `
              )
              .join("")}
          </div>
        `;
        body.querySelector("#content-prev-btn").addEventListener("click", () => goToPage(pageIdx - 1));
        body.querySelector("#content-next-btn").addEventListener("click", () => goToPage(pageIdx + 1));
        updateActiveTurnFn = (itemIdx) => {
          body.querySelectorAll("[data-turn-idx]").forEach((el) => {
            el.classList.toggle("active-turn", Number(el.dataset.turnIdx) === itemIdx);
          });
        };
      } else {
        updateActiveTurnFn = null;
        const item = pages[pageIdx];
        body.innerHTML = `
          <div class="content-nav">
            <div class="content-progress muted">Trang ${pageIdx + 1}/${totalPages}</div>
            <div class="content-nav-btns">
              <button type="button" class="content-nav-btn" id="content-prev-btn" title="Câu trước" ${pageIdx === 0 ? "disabled" : ""}>${icon("chevron-left", { size: 20 })}</button>
              <button type="button" class="content-nav-btn" id="content-next-btn" title="Câu tiếp theo" ${pageIdx === totalPages - 1 ? "disabled" : ""}>${icon("chevron-right", { size: 20 })}</button>
            </div>
          </div>
          <div class="content-page">
            <div class="content-item-header">
              <span class="speaker-name">${item?.speaker ? escapeHtml(item.speaker) : ""}</span>
              ${contentActionsHtml(pageIdx)}
            </div>
            <div class="content-text" data-item-idx="${pageIdx}">${renderInteractiveHtml(item?.text || "", lesson.vocabulary || [], item?.phrase_groups)}</div>
            ${state.showTranslation ? `<div class="content-translation">${escapeHtml(item?.translation || "")}</div>` : ""}
          </div>
        `;
        body.querySelector("#content-prev-btn").addEventListener("click", () => goToPage(pageIdx - 1));
        body.querySelector("#content-next-btn").addEventListener("click", () => goToPage(pageIdx + 1));
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
            // 2026-07-30 (mục 1+2) — phát ĐÚNG đoạn audio thật đã cắt sẵn cho câu này (nếu bài
            // đã có), KHÔNG còn luôn luôn Web Speech như trước — xem playSegment() trong tts.js.
            ttsPlayer.playSegment(itemIdx);
          } else {
            showSentenceExplain(btn, item);
          }
        });
      });
    }

    // Chuyển trang thủ công (nút ‹/›) — "newIdx" là chỉ số TRANG (CẶP cho hội thoại, ĐOẠN cho
    // bài đọc, xem totalPages/pairStartIndex ở trên), độc lập với việc trình duyệt có hỗ trợ
    // đọc-to hay không. Có TTS -> đi qua ttsPlayer (nhảy tới CÂU ĐẦU của trang/cặp đích) để
    // thanh audio + trạng thái phát luôn khớp đúng đoạn đang xem (onStateChange ở trên tự cập
    // nhật state.page + render lại). Không có TTS -> tự cập nhật state.page rồi render lại,
    // không đụng gì tới ttsPlayer (gọi vào sẽ lỗi vì window.speechSynthesis không tồn tại).
    function goToPage(newIdx) {
      const clamped = Math.max(0, Math.min(totalPages - 1, newIdx));
      // So sánh theo ĐƠN VỊ TRANG (pairIndexFor(state.page)), KHÔNG so trực tiếp với state.page
      // — state.page giữ chỉ số CÂU thật (xem ghi chú ttsPlayer.load ở trên), khác đơn vị với
      // "clamped" khi đang gộp cặp.
      if (clamped === pairIndexFor(state.page)) return;
      if (ttsSupported) {
        ttsPlayer.goTo(pairStartIndex(clamped));
      } else {
        state.page = pairStartIndex(clamped);
        saveProgress();
        renderContentBody();
      }
    }
  }

  // SỬA GỐC (2026-08-05, "sửa gốc tính năng tra từ" — Minh) — BỎ HẲN prefetchAllLessonWords()
  // (trước đây tự tra TOÀN BỘ từ CHƯA CÓ DỮ LIỆU ngay khi mở bài, mỗi từ 1 lượt gọi AI riêng
  // qua word_lookup — đây CHÍNH LÀ nguyên nhân thật gây 952+381 request bất thường 31/7-1/8, xem
  // docs/NHAT-KY-LAM-VIEC.md). Bài MỚI sinh ra giờ LUÔN có sẵn "phrase_groups" cho MỌI từ ngay
  // lúc tạo (0 lượt AI khi bấm, xem PHRASE_COVERAGE_REQUIRED_LEVELS trong lesson.js — ép 100%
  // mọi cấp độ). Bài CŨ (chưa có) — CHỈ khi người dùng THỰC SỰ bấm vào 1 từ thiếu dữ liệu mới vá
  // (ensurePhraseGroupsPatched() bên dưới), phân tích LẠI CẢ BÀI 1 lượt gọi AI DUY NHẤT (không
  // phải 1 lượt/từ), lưu lại — mọi lượt bấm SAU (kể cả từ khác) đọc thẳng dữ liệu vừa lưu.
  let phraseGroupsPatchPromise = null;
  let phraseGroupsPatched = false;

  async function ensurePhraseGroupsPatched() {
    if (phraseGroupsPatched) return true;
    if (!phraseGroupsPatchPromise) {
      phraseGroupsPatchPromise = (async () => {
        try {
          const res = await analyzeLessonPhraseGroups(lesson.id, isNews);
          if (!res.ok) return false;
          // Gán thẳng vào TỪNG phần tử của "lesson.content" (renderContentTab()'s "pages" CHÍNH
          // LÀ mảng này, cùng tham chiếu — nhưng "pages" không truy cập được từ đây, hàm này nằm
          // NGOÀI closure của renderContentTab, nên đọc thẳng "lesson.content") — để MỌI nơi đọc
          // "lesson.content[i].phrase_groups" (renderInteractiveHtml/computeInteractiveSpans) tự
          // thấy dữ liệu mới, không cần gọi gì thêm.
          const content = lesson.content || [];
          (res.data.content || []).forEach((item, i) => {
            if (content[i]) content[i].phrase_groups = item.phrase_groups;
          });
          phraseGroupsPatched = true;
          return true;
        } catch {
          return false;
        } finally {
          // CHỈ xoá promise đang chờ khi THẤT BẠI (cho phép lượt bấm SAU thử lại) — thành công
          // thì "phraseGroupsPatched" đã bật vĩnh viễn, không cần giữ promise nữa.
          phraseGroupsPatchPromise = null;
        }
      })();
    }
    return phraseGroupsPatchPromise;
  }

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
  // Thanh audio thiết kế lại (2026-07-30, mục B2) — 2 lý do gộp làm 1 lần vì cùng 1 chỗ code:
  // (1) yêu cầu thẩm mỹ chuyên nghiệp hơn, (2) BUG THẬT đã xác nhận không phải do tính sai tỉ
  // lệ (progress.fraction dùng CHUNG 1 công thức cho cả elapsedSeconds/totalSeconds hiển thị
  // lẫn vị trí thanh, không thể lệch nhau về mặt số học) — mà do bản CŨ dùng
  // <input type="range"> gốc trình duyệt: ở tỉ lệ % rất nhỏ, riêng chấm tròn (thumb) kéo
  // MẶC ĐỊNH của trình duyệt đã chiếm 1 phần đáng kể chiều ngang thanh (nhất là thanh hẹp do
  // chung hàng với nhiều nút khác), khiến MẮT NHÌN thấy như đã chạy 15-20% dù giá trị thật chỉ
  // 2-3%, dù thanh vẫn "đúng" theo đúng nghĩa kỹ thuật input.value. Thay hẳn bằng 1 thanh tự vẽ
  // (track + fill + thumb, xem CSS ".audio-progress-*"): độ rộng lớp "fill" đặt TRỰC TIẾP bằng
  // đúng % của progress.fraction, không còn ảo giác từ kích thước thumb gốc trình duyệt.
  function audioBarHtml() {
    return `
      <div class="audio-bar" id="audio-bar">
        <button type="button" class="audio-btn audio-btn-play" id="audio-play" title="Phát">${icon("play", { size: 18, filled: true })}</button>
        <div class="audio-progress-track" id="audio-progress-track">
          <div class="audio-progress-fill" id="audio-progress-fill"></div>
          <div class="audio-progress-thumb" id="audio-progress-thumb"></div>
        </div>
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

  // Vẽ lại vị trí lớp fill/thumb theo 1 tỉ lệ 0-1 — dùng CHUNG cho cả lúc phát (updateAudioBarUI)
  // lẫn lúc NGÓN TAY đang kéo (wireAudioBar) để 2 luồng luôn khớp nhau tuyệt đối.
  function setProgressVisual(fraction) {
    const pct = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    const fill = document.getElementById("audio-progress-fill");
    const thumb = document.getElementById("audio-progress-thumb");
    if (fill) fill.style.width = pct;
    if (thumb) thumb.style.left = pct;
  }

  function wireAudioBar(panel) {
    panel.querySelector("#audio-replay").addEventListener("click", () => ttsPlayer.replay());
    panel.querySelector("#audio-play").addEventListener("click", () => ttsPlayer.playPause());

    // "audioSeeking" (khai báo cùng ensureProgressTimer() ở trên) — bật khi NGÓN TAY đang kéo,
    // chặn timer/onStateChange ghi đè vị trí thanh giữa chừng; chỉ thật sự tua khi NHẢ tay
    // (pointerup) — kéo xong mới gọi 1 lần, không gọi liên tục theo từng pixel kéo. Dùng
    // Pointer Events (thay "input"/"change" của <input type=range> cũ) vì giờ là 1 <div> tự vẽ,
    // cần tự tính vị trí từ toạ độ X thay vì trình duyệt tự lo.
    const track = panel.querySelector("#audio-progress-track");
    function fractionFromEvent(e) {
      const rect = track.getBoundingClientRect();
      const x = Math.max(rect.left, Math.min(rect.right, e.clientX));
      return rect.width ? (x - rect.left) / rect.width : 0;
    }
    let dragging = false;
    function updateDrag(e) {
      const fraction = fractionFromEvent(e);
      setProgressVisual(fraction);
      const progress = ttsPlayer.getProgress();
      const elapsedEl = document.getElementById("audio-time-elapsed");
      if (elapsedEl) elapsedEl.textContent = formatAudioTime(fraction * progress.totalSeconds);
    }
    track.addEventListener("pointerdown", (e) => {
      dragging = true;
      audioSeeking = true;
      track.setPointerCapture(e.pointerId);
      updateDrag(e);
    });
    track.addEventListener("pointermove", (e) => {
      if (dragging) updateDrag(e);
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      ttsPlayer.seekToFraction(fractionFromEvent(e));
      audioSeeking = false;
    }
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);

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
    // SỬA 2026-07-30 (ghép 1 file audio duy nhất, xem tts.js đầu file) — không còn trạng thái
    // "đang chờ audio" nào nữa (URL đã sinh sẵn từ trước hoặc chưa có -> Web Speech phát ngay,
    // cả 2 đều tức thời), bỏ hẳn spinner thay nút phát.
    if (playBtn) {
      playBtn.innerHTML = s.playing ? icon("pause", { size: 18, filled: true }) : icon("play", { size: 18, filled: true });
    }
    if (speedBtn) speedBtn.textContent = `${s.rate}x`;
    if (volSlider) volSlider.value = String(s.volume);

    // Không đụng thanh/nhãn "elapsed" khi người dùng ĐANG kéo tay (audioSeeking) — tránh giật
    // ngược giữa chừng lúc kéo, xem wireAudioBar().
    if (audioSeeking) return;
    const track = document.getElementById("audio-progress-track");
    const elapsedEl = document.getElementById("audio-time-elapsed");
    const totalEl = document.getElementById("audio-time-total");
    if (!track) return;
    const progress = ttsPlayer.getProgress();
    setProgressVisual(progress.fraction);
    if (elapsedEl) elapsedEl.textContent = formatAudioTime(progress.elapsedSeconds);
    if (totalEl) totalEl.textContent = formatAudioTime(progress.totalSeconds);
  }

  // "spans" tính LẠI MỖI LẦN BẤM (2026-08-05, KHÔNG snapshot lúc wire nữa) — đọc trực tiếp
  // "lesson.content[itemIdx].phrase_groups" TẠI THỜI ĐIỂM BẤM, vì dữ liệu này có thể vừa được VÁ
  // xong (ensurePhraseGroupsPatched(), bài cũ) sau khi màn đã wire — nếu vẫn dùng bản snapshot cũ
  // lúc wire, những từ vừa vá xong sẽ không được các span ĐÃ WIRE TỪ TRƯỚC nhận ra. "itemIdx" đọc
  // từ "data-item-idx" đã có sẵn trên chính "container" (gắn lúc render, xem renderContentBody()).
  function wireInteractiveWords(container, sentence, genderHint) {
    const itemIdx = Number(container.dataset.itemIdx);
    container.querySelectorAll("[data-token-idx]").forEach((span) => {
      const idx = Number(span.dataset.tokenIdx);
      const word = span.textContent;
      // CHỈ trigger bằng click/chạm — hiện NGAY, không delay (đó là lỗi trước: chờ 250ms).
      // KHÔNG trigger bằng mouseenter nữa: chuột chỉ LƯỚT NGANG QUA từ (vd đang di chuyển
      // tới nút khác) cũng đủ kích hoạt tra từ, gây tooltip bị đè lẫn nhau giữa từ vừa lướt
      // qua và từ vừa bấm.
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        const spans = computeInteractiveSpans(sentence, lesson.vocabulary || [], lesson.content?.[itemIdx]?.phrase_groups);
        const entry = spans[idx]?.entry || null;
        showWordTooltip(span, word, sentence, genderHint, entry, itemIdx, idx);
      });
    });
  }

  // Tooltip TỐI GIẢN: level (màu theo cấp độ) + từ + nghĩa + cụm từ đi kèm (nếu có) + icon
  // loa đọc từ/cụm đó (đúng giọng nhân vật của câu chứa từ này) — không giải thích, không
  // ví dụ, không lưu ý.
  function renderTooltipContent(anchorEl, word, genderHint, data) {
    showPopoverHtml(
      anchorEl,
      `
      <div class="word-popover-head">
        <span class="word-popover-level" data-level="${escapeHtml(data.level)}">${escapeHtml(data.level)}</span>
        <span class="word-popover-word">${escapeHtml(word)}</span>
        ${ttsSupported ? `<button type="button" class="word-popover-speak-btn" id="word-popover-speak" title="Đọc từ này">${icon("volume", { size: 14 })}</button>` : ""}
      </div>
      <div class="word-popover-meaning">${escapeHtml(data.meaning || "")}</div>
      ${
        data.is_multiword
          ? `
        <div class="word-popover-phrase-tag">${escapeHtml(data.type || "Cụm từ")}</div>
        ${
          data.word_meanings
            ? `<div class="word-popover-breakdown">${Object.entries(data.word_meanings)
                .map(([w, m]) => `<span class="word-popover-breakdown-item"><b>${escapeHtml(w)}</b>: ${escapeHtml(m)}</span>`)
                .join("")}</div>`
            : ""
        }
      `
          : ""
      }
      ${data.collocation ? `<div class="word-popover-colloc">${escapeHtml(data.collocation)}</div>` : ""}
    `
    );
    document.getElementById("word-popover-speak")?.addEventListener("click", (e) => {
      e.stopPropagation();
      ttsPlayer.speakOnce(data.collocation || word, genderHint);
    });
  }

  // "vocabEntry" (2026-07-28) — từ/cụm này ĐÃ có nghĩa sẵn trong "phrase_groups" (sinh cùng lúc
  // tạo bài, hoặc vá xong ở lượt bấm trước đó trong CÙNG phiên xem) -> dùng THẲNG, hiện NGAY LẬP
  // TỨC, KHÔNG gọi AI.
  //
  // KHÔNG "vocabEntry" (2026-08-05, "sửa gốc tính năng tra từ" — THAY HẲN cơ chế word_lookup
  // gọi AI mỗi lần bấm cũ) — bài CŨ chưa có "phrase_groups" cho câu này. VÁ NGUYÊN BÀI 1 LẦN
  // DUY NHẤT (ensurePhraseGroupsPatched(), không phải riêng từ vừa bấm) — nhiều lượt bấm liên
  // tiếp (kể cả từ KHÁC câu khác) trong lúc đang vá đều dùng CHUNG 1 promise đang chạy, không tự
  // tạo thêm lượt gọi AI nào. Vá xong -> vẽ lại nội dung (renderContentBodyFn(), để MỌI từ khác
  // trong bài cũng được tô màu/có dữ liệu theo đúng phrase_groups mới) rồi tìm lại ĐÚNG span vừa
  // bấm (DOM đã bị thay khi vẽ lại — dùng "mount" chứ không phải "panel", hàm này nằm NGOÀI
  // closure của renderContentTab nên không có biến "panel" cục bộ đó).
  async function showWordTooltip(anchorEl, word, sentence, genderHint, vocabEntry, itemIdx, tokenIdx) {
    if (vocabEntry) {
      // 2026-07-30 ("gom cụm từ khi sinh bài") — "vocabEntry" từ phrase_groups mang theo ĐỦ
      // level/type/word_meanings riêng của chính cụm/từ này (không còn hardcode lesson.level
      // như trước — 1 câu B1 vẫn có thể chứa 1 cụm cố định A1 quen thuộc, cấp độ RIÊNG mới đúng).
      renderTooltipContent(anchorEl, word, genderHint, {
        level: vocabEntry.level || lesson.level,
        meaning: vocabEntry.meaning,
        type: vocabEntry.type,
        word_meanings: vocabEntry.word_meanings,
        is_multiword: vocabEntry.is_multiword,
      });
      return;
    }

    showPopoverHtml(anchorEl, `<div class="word-popover-loading"><span class="spinner spinner-sm"></span></div>`);
    const patched = await ensurePhraseGroupsPatched();
    if (!patched) {
      showPopoverHtml(anchorEl, `<div class="word-popover-meaning error-text">Không tra được từ.</div>`);
      return;
    }
    renderContentBodyFn?.();
    const freshSpan = mount.querySelector(`[data-item-idx="${itemIdx}"] [data-token-idx="${tokenIdx}"]`);
    const spans = computeInteractiveSpans(sentence, lesson.vocabulary || [], lesson.content?.[itemIdx]?.phrase_groups);
    const entry = spans[tokenIdx]?.entry || null;
    if (!freshSpan || !entry) {
      showPopoverHtml(anchorEl, `<div class="word-popover-meaning error-text">Không tra được từ.</div>`);
      return;
    }
    renderTooltipContent(freshSpan, word, genderHint, {
      level: entry.level || lesson.level,
      meaning: entry.meaning,
      type: entry.type,
      word_meanings: entry.word_meanings,
      is_multiword: entry.is_multiword,
    });
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

  function saveProgress({ fullyListened = false } = {}) {
    // Tin tức (2026-07-28) — bài KHÔNG thuộc user_id nào (public, "news_lessons"), không có
    // tiến trình cá nhân để lưu (lesson_progress FK tới "lessons", không tới "news_lessons").
    if (isNews) return;
    const total = (lesson.exercises || []).length;
    const allDone = total > 0 && state.completedExercises.size === total;
    const patch = {
      completed_paragraphs: state.page,
      completed_exercises: Array.from(state.completedExercises),
      exercise_results: state.exerciseResults,
      xp_earned: state.xpEarned,
      last_opened_at: new Date().toISOString(),
      completed_at: allDone ? new Date().toISOString() : null,
    };
    // "Đã học" (2026-08-04, migration 033) — CHỈ ghi khi thật sự vừa nghe hết (không ghi đè lại
    // null mỗi lần saveProgress() khác chạy vì lý do khác, giữ mốc CŨ nếu đã từng đạt trước đó).
    if (fullyListened) patch.fully_listened_at = new Date().toISOString();
    upsertLessonProgress(lesson.id, patch).catch(() => {
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
// riêng từng từ như cũ. Dùng CHUNG cho dựng HTML (renderInteractiveHtml) lẫn tra từ lúc bấm
// (wireInteractiveWords) để chỉ có 1 nơi định nghĩa "thế nào là khớp cụm".
// Dựng entry hiển thị từ 1 phần tử "phrase_groups" (2026-07-30, "gom cụm từ khi sinh bài") —
// KHÔNG phải AI call, dữ liệu đã có sẵn trong bài. "highlight" tách RIÊNG khỏi việc có dữ liệu
// tra cứu hay không: cụm nhiều từ LUÔN tô màu (giữ đúng hành vi "gộp cụm" cũ); từ ĐƠN chỉ tô
// màu khi CŨNG khớp "lesson.vocabulary" (không đổi ngưỡng "từ nào đáng tô màu" đã có) — nhưng
// MỌI từ (kể cả không tô màu) vẫn có đủ nghĩa/cấp độ để tra ngay khi bấm, không cần gọi AI.
function phraseGroupToEntry(group, vocabMap) {
  const words = Array.isArray(group?.words) ? group.words : [];
  const wholeText = words.join(" ");
  const isMultiWord = words.length > 1;
  const vocabMatch = !isMultiWord ? findVocabEntry(wholeText, vocabMap) : null;
  return {
    word: wholeText,
    meaning: group.meaning || vocabMatch?.meaning || "",
    level: group.level || vocabMatch?.level || "",
    type: group.type || vocabMatch?.type || "",
    word_meanings: isMultiWord && group.word_meanings ? group.word_meanings : null,
    is_multiword: isMultiWord,
    is_specialized: !!vocabMatch?.is_specialized,
    highlight: isMultiWord || !!vocabMatch,
    fromPhraseGroups: true, // dữ liệu này đã NẰM SẴN vĩnh viễn trong content của bài (sinh cùng
    // lúc tạo bài, hoặc vá 1 lần cho bài cũ — xem ensurePhraseGroupsPatched()), không cần lưu
    // thêm 1 bản riêng vào lesson.vocabulary/DB nữa.
  };
}

// Ghép "tokens" (đã tokenize theo "text") với "phraseGroups" (nhãn cụm AI gắn sẵn lúc sinh bài)
// theo ĐÚNG THỨ TỰ tuần tự — KHÔNG cần khớp lại bằng cách dò tìm (khác hẳn nhánh "vocabulary"
// bên dưới, vốn phải TỰ SUY ĐOÁN vị trí bằng cách dò text) vì phraseGroups đã được sinh CÙNG
// LÚC với chính câu này, thứ tự đảm bảo đúng. Trả về null nếu có bất kỳ sai lệch nào (từ trong
// nhóm không khớp đúng token kế tiếp, hoặc còn dư/thiếu token) — B2/C1 KHÔNG bắt buộc phủ 100%
// (xem validatePhraseCoverage phía server) nên vẫn có thể lệch ở 2 cấp đó; lệch thì RƠI VỀ cách
// khớp "vocabulary" cũ bên dưới, không hiển thị sai/thiếu.
function spansFromPhraseGroups(tokens, text, phraseGroups, vocabMap) {
  const spans = [];
  let tIdx = 0;
  for (const group of phraseGroups) {
    const words = Array.isArray(group?.words) ? group.words : [];
    if (!words.length) continue;
    for (const w of words) {
      if (tIdx >= tokens.length || tokens[tIdx].word.toLowerCase() !== String(w).toLowerCase()) return null;
      tIdx++;
    }
    const startTok = tokens[tIdx - words.length];
    const endTok = tokens[tIdx - 1];
    spans.push({ text: text.slice(startTok.start, endTok.end), start: startTok.start, end: endTok.end, entry: phraseGroupToEntry(group, vocabMap) });
  }
  if (tIdx !== tokens.length) return null; // còn token của câu chưa được phủ hết -> không dùng
  return spans;
}

// "phraseGroups" (tuỳ chọn, 2026-07-30) — nhãn cụm AI gắn sẵn cho ĐÚNG phần tử content này lúc
// sinh bài, xem docs/prompt-ai-tao-bai-hoc.md mục "QUY TẮC VỀ GOM CỤM TỪ". ƯU TIÊN dùng nếu có
// VÀ phủ đúng đủ toàn câu (validate lại ở client cho chắc, phòng ca B2/C1 sót từ) — CHÍNH XÁC
// tuyệt đối, không suy đoán. Bài CŨ (trước khi có trường này, hoặc lệch) rơi về cách khớp
// "vocabulary" cũ phía dưới, hành vi giữ nguyên y hệt trước đây.
function computeInteractiveSpans(text, vocabulary, phraseGroups) {
  const { tokens } = tokenizeWords(text);
  if (!tokens.length) return [];
  const vocabMap = buildVocabMap(vocabulary);

  if (Array.isArray(phraseGroups) && phraseGroups.length) {
    const spansFromGroups = spansFromPhraseGroups(tokens, text, phraseGroups, vocabMap);
    if (spansFromGroups) return spansFromGroups;
  }

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
// "s.entry.highlight === false" (2026-07-30, nhánh phraseGroups) — CỐ Ý phân biệt với "không có
// entry": từ đơn không đáng chú ý vẫn CÓ entry (để tra được nghĩa/cụm ngay không cần gọi AI)
// nhưng KHÔNG tô màu — khác "undefined" (nhánh vocabulary cũ, mọi entry tồn tại đều tô màu như
// trước, không đổi hành vi bài cũ).
function renderInteractiveHtml(text, vocabulary, phraseGroups) {
  if (!text) return "";
  const spans = computeInteractiveSpans(text, vocabulary, phraseGroups);
  if (!spans.length) return escapeHtml(text);

  let html = "";
  let cursor = 0;
  spans.forEach((s, i) => {
    html += escapeHtml(text.slice(cursor, s.start));
    const cls = s.entry && s.entry.highlight !== false ? (s.entry.is_specialized ? "vocab-highlight-specialized" : "vocab-highlight") : "hover-word";
    html += `<span class="${cls}" data-token-idx="${i}">${escapeHtml(s.text)}</span>`;
    cursor = s.end;
  });
  html += escapeHtml(text.slice(cursor));
  return html;
}
