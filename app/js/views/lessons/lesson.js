// app/js/views/lesson.js — render TỪ 1 bản ghi "lessons", KHÔNG gọi AI để sinh nội dung
// (kiến trúc Lesson-first). Tra từ/cụm ĐỌC THẲNG dữ liệu "phrase_groups"/"reading_chunks" đã lưu
// sẵn trong bài — 2026-08-11, Minh: "AI làm trước hoàn chỉnh, click vào mới tra từ không còn phù
// hợp" — phân tích cụm từ + tách câu giờ LUÔN chạy XONG lúc TẠO bài (xem createLesson.js/
// createFromText.js, gọi analyzeLessonPhraseGroups/analyzeLessonReadingChunks tuần tự trước khi
// điều hướng sang xem bài), file này KHÔNG còn tự vá lúc mở bài/lúc bấm nữa (đã bỏ hẳn
// ensurePhraseGroupsPatched()/ensureReadingChunksPatched() — hạ tầng backend vẫn còn, chỉ không
// còn ai gọi từ client). "sentence_tip" vẫn là action lẻ, realtime, không lưu. Đọc-to dùng
// app/js/tts.js (Web Speech API, không gọi AI, không tốn credit).
import { getLessonWithProgress, upsertLessonProgress, getNewsLessonById } from "../../db.js";
import { getLessonFullAudioUrl, fetchAndSaveLessonCover } from "../../lessonApi.js";
import { escapeHtml } from "../../utils.js";
import { createPlayer, isTTSSupported, computeGenderHints } from "../../tts.js";
import { icon } from "../../icons.js";
import { showToast } from "../../toast.js";
import { backChevronHtml, wireBackLink } from "../../header.js";
import { getAutoScrollPreference } from "../../autoScroll.js";
import { getLessonDisplayPrefs, setLessonDisplayPref } from "../../lessonDisplayPrefs.js";
import { t, registerTranslations } from "../../i18n.js";

registerTranslations({
  "Thiếu mã bài học.": "Missing lesson ID.",
  "Không tải được bài học, thử lại sau.": "Could not load the lesson, please try again later.",
  "Không tìm thấy bài học.": "Lesson not found.",
  "Không tìm thấy bài học (có thể không thuộc tài khoản này).": "Lesson not found (it may not belong to this account).",
  "Nội dung": "Content",
  "Từ vựng": "Vocabulary",
  "Ngữ pháp": "Grammar",
  "Luyện tập": "Exercises",
  "Đoạn gốc": "Original text",
  "Ẩn/hiện bản dịch": "Show/hide translation",
  "Tách câu": "Split sentences",
  "Chưa có dữ liệu tách câu cho bài này.": "No sentence-split data for this lesson yet.",
  "Câu": "Sentence",
  "Đọc câu này": "Read this sentence",
  "Phát": "Play",
  "Âm lượng": "Volume",
  "Lặp lại": "Repeat",
  "Tốc độ đọc": "Playback speed",
  "Đọc từ này": "Read this word",
  "Không tra được từ.": "Could not look up this word.",
  "Bài này không có từ vựng nổi bật.": "This lesson has no highlighted vocabulary.",
  "Bài này không có điểm ngữ pháp nổi bật để học riêng.": "This lesson has no highlighted grammar points to study separately.",
  "Cấu trúc câu đáng chú ý": "Notable sentence patterns",
  "Kiểm tra": "Check",
  "Chính xác! ": "Correct! ",
  "Chưa đúng. ": "Not quite. ",
  "Chính xác!": "Correct!",
  "Đáp án đúng: ": "Correct answer: ",
  "Bài này bạn đang học dở, mình lưu lại rồi, khi nào quay lại mình học tiếp nhé":
    "You're partway through this lesson, we've saved your progress, come back and continue anytime",
});

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const SPEEDS = [0.75, 1, 1.25, 1.5];

// "opts.news" (2026-07-28, "Tin tức tự sinh") — true khi vào từ route /news-lesson/:id (mục
// con "Tin tức" dưới Phổ biến): đọc từ "news_lessons" (public, KHÔNG user_id) thay vì "lessons"
// cá nhân, tắt hẳn lưu tiến trình + nút Yêu thích (2 thứ đó gắn với user_id, không áp dụng được
// cho nội dung dùng chung) — MỌI phần còn lại (tooltip từ vựng, TTS, bài tập trong phiên xem)
// hoạt động Y HỆT bài cá nhân vì cùng 1 hình dạng dữ liệu (content/vocabulary/grammar/exercises).
// MỒ CÔI (2026-08-06, tái cấu trúc theo cây mới) — route "/news-lesson" đã gỡ khỏi app.js
// (Minh: "loại bỏ Tin tức/Phổ biến hoàn toàn khỏi luồng đang chạy"), KHÔNG còn nơi nào gọi
// renderLessonDetail() với opts.news=true nữa — "isNews" bên dưới luôn là false trong thực tế.
// GIỮ NGUYÊN toàn bộ nhánh isNews (nhiều chỗ rải rác trong file, không sửa từng chỗ để tránh
// rủi ro cho luồng bài cá nhân đang dùng thật) — chỉ đánh dấu mồ côi ở đây, xem
// docs/NHAT-KY-LAM-VIEC.md mục 2026-08-06.
export async function renderLessonDetail(mount, params, opts = {}) {
  const isNews = !!opts.news;
  const lessonId = params?.[0];
  if (!lessonId) {
    mount.innerHTML = `<div class="screen"><p class="error-text">${t("Thiếu mã bài học.")}</p></div>`;
    return;
  }
  // Khung "xương" GIỐNG HÌNH DẠNG màn thật (header + hàng icon, mục B1 — 2026-07-30, Minh: "chớp
  // giao diện khi chuyển route, ví dụ vào 1 bài học") — trước đây khung chờ chỉ là 1 dòng chữ
  // giữa màn hình rỗng, khi dữ liệu về (thường rất nhanh vì Supabase REST nhẹ) toàn bộ mount bị
  // thay bằng khung THẬT khác hẳn hình dạng -> mắt người thấy như 1 cú "chớp" dù không có
  // khoảng trắng thật sự (cùng nguyên nhân/cách sửa như card lĩnh vực ở Thư viện AI trước đó:
  // giữ hình dạng ổn định xuyên suốt lúc chờ, không đổi bố cục đột ngột khi dữ liệu về).
  // SỬA 2026-08-09 (Đợt 4, mục 2 — Minh: "chớp giao diện chữ Nội dung/Từ vựng/Ngữ pháp/Luyện tập
  // rồi mới vào giao diện icon") — BUG THẬT: khung này vẫn dùng layout tab-chữ CŨ
  // (.tabs.sticky-tabs + .tab-btn) từ trước khi đợt 2 đổi sang hàng icon
  // (.section-nav-row/.section-icon-btn) — không ai cập nhật khung chờ khi đổi giao diện thật.
  // Đây CHÍNH LÀ cú "chớp" Minh thấy, không phải cache/tab cũ như từng kết luận sai ở đợt 3.
  mount.innerHTML = `
    <div class="screen">
      <div class="lesson-header-row">
        ${backChevronHtml()}
        <h1 class="screen-title skeleton-line skeleton-shimmer" style="height:1.2em;width:60%"></h1>
      </div>
      <div class="section-nav-row">
        <div class="section-icon-tabs" role="tablist">
          <div class="skeleton-line skeleton-shimmer" style="width:40px;height:40px;border-radius:10px"></div>
          <div class="skeleton-line skeleton-shimmer" style="width:40px;height:40px;border-radius:10px"></div>
          <div class="skeleton-line skeleton-shimmer" style="width:40px;height:40px;border-radius:10px"></div>
          <div class="skeleton-line skeleton-shimmer" style="width:40px;height:40px;border-radius:10px"></div>
        </div>
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
    mount.innerHTML = `<div class="screen"><p class="error-text">${t("Không tải được bài học, thử lại sau.")}</p></div>`;
    return;
  }
  if (!lesson) {
    mount.innerHTML = `<div class="screen"><p class="error-text">${isNews ? t("Không tìm thấy bài học.") : t("Không tìm thấy bài học (có thể không thuộc tài khoản này).")}</p></div>`;
    return;
  }

  // 2026-08-11 (Minh: "tránh việc người dùng quay lại bài học toàn bị trở về mặc định") — đọc
  // lại 3 toggle hiển thị từ lần bấm gần nhất (lessonDisplayPrefs.js, localStorage — tuỳ chọn
  // CHUNG mọi bài, giống autoScroll.js) thay vì luôn hardcode về mặc định mỗi lần mở bài.
  const displayPrefs = getLessonDisplayPrefs();
  const state = {
    tab: "content",
    page: progress?.completed_paragraphs || 0,
    completedExercises: new Set(progress?.completed_exercises || []),
    exerciseResults: Array.isArray(progress?.exercise_results) ? [...progress.exercise_results] : [],
    xpEarned: progress?.xp_earned || 0,
    showTranslation: displayPrefs.showTranslation,
    showChunks: displayPrefs.showChunks,
    showOriginal: displayPrefs.showOriginal,
  };
  // SỬA 2026-08-09 (Đợt 4 — lỗi thật phát hiện qua verify sống: "ReferenceError: Cannot access
  // 'ABBREV_PLACEHOLDER' before initialization"): hằng số này TRƯỚC ĐÂY khai báo ngay sát chỗ
  // dùng (gần splitIntoSentences() bên dưới), NHƯNG "renderPanel()" gọi renderContentBody()
  // SỚM HƠN (ngay sau khi wire xong các nút toggle, còn hằng số kia thì mãi sau đó mới tới lượt
  // chạy) — vốn "vô hại" vì trước đây splitIntoSentences() chỉ chạy khi state.showChunks=true
  // (short-circuit && bỏ qua lúc showChunks mặc định false ở lượt render đầu), tới khi mục 6 đợt
  // 4 đổi renderContentBody() gọi splitIntoSentences() KHÔNG ĐIỀU KIỆN (đếm số câu liên tục) mới
  // lộ ra lỗi thứ tự khai báo có sẵn. Dời hẳn lên đây (đầu hàm, trước MỌI lượt gọi render nào) để
  // không còn phụ thuộc thứ tự gọi hàm bên dưới nữa.
  const ABBREV_PLACEHOLDER = " ";
  // BUG THẬT (2026-08-10, Đợt 13 mục 7 — cùng lớp lỗi thứ tự khai báo ở "ABBREV_PLACEHOLDER"
  // ngay trên: "renderPanel()" gọi "splitIntoSentences()" (dùng hằng số này) SỚM hơn vị trí khai
  // báo gốc ngay sát hàm đó — dời hẳn lên đây, cùng lý do, để không phụ thuộc thứ tự gọi hàm bên
  // dưới. Xác nhận qua verify sống: "ReferenceError: Cannot access 'SENTENCE_END_TRAILING_CHARS'
  // before initialization"). Ký tự ngoặc đóng TUỲ CHỌN (thẳng + kiểu in + tròn/vuông) cho phép
  // sau "[.!?]+" khi tách câu — xem splitIntoSentences()/splitTranslationSentences() bên dưới.
  const SENTENCE_END_TRAILING_CHARS = `["'“”‘’)\\]]*`;
  // Tiêu đề mặc định tiếng Việt (title_vi) — tắt bản dịch thì đổi sang tiếng Anh (title),
  // nhất quán với việc ẩn/hiện bản dịch trong nội dung bài (icon "văn/A" ở tab Nội dung).
  function lessonTitleFor(showTranslation) {
    return showTranslation ? lesson.title_vi || lesson.title : lesson.title || lesson.title_vi;
  }

  const ttsSupported = isTTSSupported();
  const genderHints = computeGenderHints(lesson.content, lesson.characters); // 1 giọng cố định/nhân vật suốt bài

  // Âm thanh trả phí — CHỈ bài đọc/hội thoại CÓ lĩnh vực trong Thư viện AI, xem
  // api/_generate/audio.js. "audioEligible" chặn SỚM ở client (không hỏi server cho bài rõ
  // ràng không đủ điều kiện, đỡ 1 lượt round-trip vô ích) — server VẪN tự kiểm tra lại y hệt
  // (phòng hờ dữ liệu client cũ/sai), đây không phải lớp chặn duy nhất.
  // SỬA LẠI TOÀN BỘ KIẾN TRÚC (2026-07-30, xem ghi chú đầu tts.js) — ĐÚNG 1 lượt gọi
  // generate_lesson_full_audio, KHÔNG còn cache/dedup theo TỪNG CÂU nữa (server tự cache
  // NGUYÊN CẢ FILE). lessonApi.js::prefetchLessonAudio() đã gọi action này NGAY lúc tạo bài
  // (fire-and-forget) — ở đây gọi LẠI làm lưới đỡ (idempotent, server trả thẳng URL đã lưu nếu
  // có) cho ca mở bài quá nhanh trước khi lượt gọi sớm kịp xong.
  // "fullAudioPending" (2026-08-14, Minh real-device: "vẫn bị lỗi hiển thị audio đọc free, sau
  // đó mới chạy audio có phí" — race condition) — comment CŨ ở updateAudioBarUI() bên dưới nói
  // "không còn trạng thái đang chờ audio nào nữa" nhưng ĐÓ LÀ SAI: getLessonFullAudioUrl() vẫn là
  // 1 lượt fetch BẤT ĐỒNG BỘ, nếu người dùng bấm Phát TRƯỚC khi fetch xong thì playPause() (tts.js)
  // không thấy fullAudioEl nên chạy Web Speech miễn phí trước, rồi lượt fetch xong mới "nhảy"
  // sang giọng thật giữa chừng — đúng hiện tượng Minh mô tả. Với bài đủ điều kiện audio thật
  // (audioEligible), CHẶN nút Phát (hiện spinner) cho tới khi biết chắc có audio thật hay không —
  // do publish-lesson.mjs giờ bắt buộc audio là 1 điều kiện xuất bản, lượt fetch này trong thực tế
  // chỉ là đọc lại URL ĐÃ CÓ SẴN trong DB (không phải sinh mới), nên độ trễ chặn cực ngắn, không
  // đáng kể với người dùng thật.
  const audioEligible = !isNews && lesson.source === "ai_generated" && !!lesson.industry;
  let fullAudioPending = audioEligible;
  if (audioEligible) {
    getLessonFullAudioUrl(lesson.id, genderHints)
      .then((res) => {
        if (res.ok && res.data.eligible && res.data.url) ttsPlayer.setFullAudioUrl(res.data.url, res.data.segmentTimes);
      })
      .catch(() => {
        // Im lặng — lỗi ở đây chỉ có nghĩa "chưa nâng cấp được lên audio thật", vẫn nghe được
        // bằng Web Speech miễn phí ngay lập tức, không phải lỗi cần hiện thông báo.
      })
      .finally(() => {
        fullAudioPending = false;
        refreshPlayButtonPendingState();
      });
  }
  // Cập nhật lại icon/khả năng bấm nút Phát khi trạng thái "đang chờ audio thật" đổi — tách hàm
  // riêng vì audioBarHtml()/wireAudioBar() có thể chưa mount (người dùng đang ở tab khác) lúc
  // promise trên resolve, nên phải tự kiểm tra querySelector rỗng, không giả định phần tử tồn tại.
  function refreshPlayButtonPendingState() {
    const btn = document.getElementById("audio-play");
    if (!btn) return;
    btn.disabled = fullAudioPending;
    btn.classList.toggle("audio-btn-loading", fullAudioPending);
    if (fullAudioPending) {
      btn.innerHTML = `<span class="spinner spinner-sm"></span>`;
    } else if (!ttsPlayer.getState().playing) {
      btn.innerHTML = icon("play", { size: 18, filled: true });
    }
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
  // Thanh tiến trình (2026-07-29, thay 3 nút Về đoạn trước/Lùi 10s/Tiến 10s) — Web Speech API
  // không bắn sự kiện tiến trình liên tục trong lúc đọc (chỉ có onend/onstart cho MỖI utterance),
  // nên cần tự chạy 1 timer NHẸ để cập nhật thanh + nhãn thời gian mượt trong lúc đang phát;
  // "audioSeeking" chặn timer ghi đè vị trí thanh NGAY LÚC người dùng đang kéo tay (xem
  // wireAudioBar()/updateAudioBarUI() bên dưới).
  let progressTimer = null;
  let audioSeeking = false;
  function ensureProgressTimer(playing) {
    if (playing && !progressTimer) {
      progressTimer = setInterval(() => {
        updateAudioBarUI(ttsPlayer.getState());
        autoScrollToCurrentSentence();
      }, 500);
    } else if (!playing && progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }
  // "Auto Scroll" (2026-08-09, Đợt 4 mục 8) — SỬA 2026-08-11 (Minh: "audio đọc câu mới nhưng câu
  // đó không hiển thị ngay giữa màn hình") — TRƯỚC ĐÂY chỉ cuộn khi đổi HẲN "itemIndex" (1 item =
  // 1 đoạn/lượt thoại, có thể chứa NHIỀU câu) — audio chuyển sang câu thứ 2, 3... trong CÙNG 1
  // đoạn dài không hề cuộn, vì "s.itemIndex" không đổi. Giờ tính ĐÚNG CÂU đang đọc (không chỉ
  // đoạn) bằng "wordOffset" (kể cả giá trị NỘI SUY giữa chừng, xem getCurrentPosition() trong
  // tts.js) so với độ dài từng câu trong "item.text" — cuộn tới đúng khối
  // ".content-sentence-block[data-sentence-idx]" của câu đó (bài đọc, luôn tách câu — xem
  // readingChunkedItemHtml()), hoặc cả khối đoạn nếu là hội thoại (không tách câu).
  // SỬA 2026-08-11 lần 2 (Minh: "bật toggle thì auto-scroll không khớp câu, tắt hết mới đúng") —
  // TRƯỚC ĐÂY nhắm ".content-text[data-sentence-idx]", nhưng khối đó CHỈ render khi
  // "state.showOriginal" đang BẬT (xem readingChunkedItemHtml()) — tắt "đoạn gốc" (dù còn bật
  // dịch/tách câu) làm khối đó KHÔNG TỒN TẠI trong DOM, auto-scroll rơi về lưới đỡ (cả đoạn) một
  // cách âm thầm. Đổi sang nhắm ".content-sentence-block" — 1 wrapper BAO NGOÀI cả header + text +
  // dịch + breakdown của MỖI câu, LUÔN tồn tại bất kể tổ hợp 3 toggle nào (chỉ mất khi cả 3 toggle
  // đều tắt — forceOriginal, lúc đó không tách câu ở DOM nữa, đúng hành vi rơi về khối cả đoạn).
  // "sentenceKey" (chuỗi "itemIndex:sentenceIdx") thay cho "lastAutoScrolledItemIdx" cũ để không
  // cuộn lặp lại mỗi tick 500ms khi vẫn đang ở CÙNG 1 câu.
  let lastAutoScrolledSentenceKey = null;
  function currentSentenceIdxForItem(itemIdx, wordOffset) {
    const item = lesson.content?.[itemIdx];
    if (!item || item.speaker) return null; // hội thoại: không tách câu, không có data-sentence-idx
    const sentences = splitIntoSentences(item.text || "");
    if (sentences.length <= 1) return null;
    let cum = 0;
    for (let i = 0; i < sentences.length; i++) {
      cum += (sentences[i].match(/\S+/g) || []).length;
      if (wordOffset < cum || i === sentences.length - 1) return i;
    }
    return null;
  }
  function autoScrollToCurrentSentence() {
    if (!getAutoScrollPreference()) return;
    const s = ttsPlayer.getState();
    if (!s.playing) return;
    const pos = ttsPlayer.getCurrentPosition();
    const sentenceIdx = currentSentenceIdxForItem(pos.itemIndex, pos.wordOffset);
    const key = `${pos.itemIndex}:${sentenceIdx}`;
    if (key === lastAutoScrolledSentenceKey) return;
    lastAutoScrolledSentenceKey = key;
    const el =
      (sentenceIdx !== null && mount.querySelector(`.content-sentence-block[data-item-idx="${pos.itemIndex}"][data-sentence-idx="${sentenceIdx}"]`)) ||
      mount.querySelector(`.content-item-block[data-content-item-idx="${pos.itemIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  const ttsPlayer = createPlayer({
    onStateChange: (s) => {
      updateAudioBarUI(s);
      ensureProgressTimer(s.playing);
      // "Đã học" (2026-08-04) = nghe TRỌN VẸN audio thật, không phải chỉ bấm Play — s.justEnded
      // chỉ true ĐÚNG 1 lần lúc tts.js xác nhận đã phát hết toàn bộ playlist (file ghép sẵn HOẶC
      // fallback Web Speech, xem ghi chú tại tts.js::justEnded).
      if (s.justEnded) saveProgress({ fullyListened: true });
      // Bỏ phân trang (2026-08-08) — nội dung luôn hiện liên tục 1 khối duy nhất (xem
      // renderContentBody() bên dưới), không còn khái niệm "trang/cặp đang xem" cần đổi khung
      // theo audio nữa — KHÔNG còn lưu "đang đọc dở câu nào" theo từng câu trong lúc phát (chỉ
      // còn lưu lúc mở bài + lúc nghe xong hẳn ở trên), đánh đổi đã có sẵn từ trước khi bật "Xem
      // tất cả", giờ là hành vi mặc định.
      if (s.playing) autoScrollToCurrentSentence();
    },
  });

  // Ảnh bìa (2026-08-08, mục 8) — "lesson.cover_image_url" đã có sẵn từ trước (dùng cho thẻ danh
  // sách/carousel) nhưng CHƯA TỪNG hiện trong màn đọc bài — thêm 1 khối ảnh phủ đầu, bài chưa có
  // ảnh (chưa tìm được/lỗi lúc sinh) thì không hiện khối này, không vỡ layout.
  // SỬA 2026-08-09 (Đợt 3, mục 1/2/3 — Minh: "hình quá lớn", "tiêu đề nên là chữ lồng trong
  // hình", "icon < nên cố định đồng bộ toàn giao diện"): ảnh hạ thấp hẳn (không còn full 16:9)
  // + back/tiêu đề chuyển thành LỚP PHỦ đè lên ảnh (dùng lại đúng gradient tối dần của
  // .continue-card-overlay để chữ trắng luôn đọc được bất kể ảnh nền màu gì) — nhờ vậy nút back
  // luôn nằm CỐ ĐỊNH ở góc trên-trái như mọi màn khác, không còn bị đẩy xuống dưới ảnh.
  // 2026-08-14, Minh: "hiện tại bài phân tích không có hình. dùng icon gắn vào, không để trống"
  // — bài từ Phân tích KHÔNG có cover_image_url (đã bỏ hẳn phần ảnh cho luồng này) nên trước đây
  // rơi vào nhánh return "" (không hiện khối ảnh nào cả, chỉ còn headerRowHtml() thường). Thêm 1
  // banner ICON PLACEHOLDER (cùng chiều cao/bo góc ".lesson-cover", nền trung tính, KHÔNG overlay
  // tối + không đè chữ trắng lên vì không có ảnh làm nền) — headerRowHtml() vẫn tự hiện header
  // thường ngay bên dưới (điều kiện của nó chỉ bỏ qua khi CÓ cover_image_url thật), không cần đổi.
  function coverImageHtml() {
    if (isNews) return "";
    if (!lesson.cover_image_url) {
      return `
        <div class="lesson-cover lesson-cover-placeholder">
          ${icon(lesson.content_type === "dialogue" ? "message-circle" : "book", { size: 40 })}
        </div>`;
    }
    return `
      <div class="lesson-cover">
        <img src="${escapeHtml(lesson.cover_image_url)}" alt="" loading="lazy" />
        <div class="lesson-cover-overlay"></div>
        <div class="lesson-cover-header">
          ${backChevronHtml()}
          <h1 class="screen-title lesson-cover-title" id="lesson-title">${escapeHtml(lessonTitleFor(state.showTranslation))}</h1>
        </div>
      </div>`;
  }

  // Khi CÓ ảnh bìa, back+tiêu đề đã nằm đè lên ảnh (xem coverImageHtml() trên) — không lặp lại
  // hàng riêng nữa. Khi KHÔNG có ảnh, giữ nguyên hàng ngang bình thường như trước.
  function headerRowHtml() {
    if (!isNews && lesson.cover_image_url) return "";
    return `
      <div class="lesson-header-row">
        ${backChevronHtml()}
        <h1 class="screen-title" id="lesson-title">${escapeHtml(lessonTitleFor(state.showTranslation))}</h1>
      </div>`;
  }

  // Gộp hàng tab (Nội dung/Từ vựng/Ngữ pháp/Luyện tập) VÀ hàng toolbar (đoạn gốc/dịch/tách câu,
  // trước đây chỉ có bên trong panel Nội dung) thành 1 HÀNG DUY NHẤT (2026-08-08, mục 10 — Minh:
  // "chiếm không gian rất nhiều... đổi thành icon hình vuông bo góc... 3 icon tắt/mở cho icon
  // tròn nhỏ nằm bên phải để tiết kiệm không gian"). 3 icon tắt/mở CHỈ có ý nghĩa ở tab Nội dung
  // — ẩn hẳn (không chỉ mờ đi) khi đang xem tab khác, xem wireSectionTabs() bên dưới.
  mount.innerHTML = `
    <div class="screen">
      ${coverImageHtml()}
      ${headerRowHtml()}
      <div class="section-nav-row">
        <div class="section-icon-tabs" role="tablist">
          <button type="button" class="section-icon-btn active" data-tab="content" title="${t("Nội dung")}">${icon("book", { size: 18 })}</button>
          <button type="button" class="section-icon-btn" data-tab="vocabulary" title="${t("Từ vựng")}">${icon("book-open", { size: 18 })}</button>
          <button type="button" class="section-icon-btn" data-tab="grammar" title="${t("Ngữ pháp")}">${icon("graduation-cap", { size: 18 })}</button>
          <button type="button" class="section-icon-btn" data-tab="exercises" title="${t("Luyện tập")}">${icon("check-circle", { size: 18 })}</button>
        </div>
        <div class="section-toggle-icons" id="content-toggle-icons">
          <button type="button" class="icon-toggle-btn ${state.showOriginal ? "active" : ""}" id="toggle-original-btn" title="${t("Đoạn gốc")}">${icon("file-text", { size: 16 })}</button>
          <button type="button" class="icon-toggle-btn ${state.showTranslation ? "active" : ""}" id="toggle-translate-btn" title="${t("Ẩn/hiện bản dịch")}">${icon("languages", { size: 16 })}</button>
          <button type="button" class="icon-toggle-btn ${state.showChunks ? "active" : ""}" id="toggle-chunks-btn" title="${t("Tách câu")}">${icon("list", { size: 16 })}</button>
        </div>
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

  function updateToggleIconsVisibility() {
    const row = mount.querySelector("#content-toggle-icons");
    if (row) row.hidden = state.tab !== "content";
  }
  updateToggleIconsVisibility();

  mount.querySelectorAll(".section-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      mount.querySelectorAll(".section-icon-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (state.tab === "content" && btn.dataset.tab !== "content") {
        ttsPlayer.stop();
        renderContentBodyFn = null;
      }
      state.tab = btn.dataset.tab;
      updateToggleIconsVisibility();
      renderPanel();
    });
  });

  // 3 icon tắt/mở tab Nội dung — dời ra hàng chung (mục 10), gọi thẳng "renderContentBodyFn"
  // (đã lưu ở scope ngoài renderContentTab() từ trước, xem let renderContentBodyFn bên dưới) để
  // vẽ lại đúng phần thân, không cần vẽ lại cả panel.
  mount.querySelector("#toggle-original-btn").addEventListener("click", (e) => {
    state.showOriginal = !state.showOriginal;
    setLessonDisplayPref("showOriginal", state.showOriginal);
    e.currentTarget.classList.toggle("active", state.showOriginal);
    renderContentBodyFn?.();
  });
  mount.querySelector("#toggle-translate-btn").addEventListener("click", (e) => {
    state.showTranslation = !state.showTranslation;
    setLessonDisplayPref("showTranslation", state.showTranslation);
    e.currentTarget.classList.toggle("active", state.showTranslation);
    renderContentBodyFn?.();
    // Tiêu đề bài học cũng đổi theo: mặc định tiếng Việt (title_vi), tắt dịch thì hiện tiếng Anh
    // (title) — nhất quán với việc ẩn/hiện bản dịch trong nội dung bài.
    const titleEl = document.getElementById("lesson-title");
    if (titleEl) titleEl.textContent = lessonTitleFor(state.showTranslation);
  });
  mount.querySelector("#toggle-chunks-btn").addEventListener("click", (e) => {
    state.showChunks = !state.showChunks;
    setLessonDisplayPref("showChunks", state.showChunks);
    e.currentTarget.classList.toggle("active", state.showChunks);
    renderContentBodyFn?.();
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
  // Bỏ phân trang (2026-08-08, Minh: "bỏ tính năng hiển thị từng trang") — luôn hiện TOÀN BỘ nội
  // dung liên tục trong 1 khối, không còn "Trang X/Y" + nút ‹›. Đây chính là nhánh "Xem tất cả"
  // cũ (trước đây là 1 lựa chọn qua toggle, giờ là hành vi DUY NHẤT).
  // Tách câu tiếng Anh theo dấu . ! ? (giữ dấu câu lại với câu đó) — dùng để chia 1 ĐOẠN bài đọc
  // (nhiều câu) thành từng khối riêng khi bật "tách câu" (mục 1, đúng mẫu file Minh gửi: mỗi câu
  // 1 icon loa + breakdown riêng, không phải liệt kê phẳng cả đoạn). Hội thoại không cần hàm này
  // — 1 lượt thoại đã gần như luôn là 1 câu.
  // BUG THẬT (2026-08-09, ảnh chụp Minh gửi: "Câu 1: S." — do "U.S." bị tách làm 2 "câu" rời,
  // regex cũ coi MỌI dấu "." là kết câu) — bảo vệ dấu "." bên trong viết tắt TRƯỚC khi tách câu:
  // (a) chuỗi "chữ hoa + chấm" lặp ≥2 lần liền nhau (U.S., U.K., D.C., U.S.A....) — quy tắc CHUNG,
  // không cần liệt kê hết; (b) vài viết tắt tiếng Anh thường gặp không theo mẫu (a). Thay tạm các
  // dấu "." này bằng ký tự an toàn (không bao giờ xuất hiện trong văn bản thật), tách câu xong
  // khôi phục lại.
  function protectAbbreviations(text) {
    return text
      .replace(/\b([A-Z]\.){2,}/g, (m) => m.replace(/\./g, ABBREV_PLACEHOLDER))
      .replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|vs|etc|approx|Ltd|Co|Inc)\.(?=\s)/gi, (m) => m.replace(/\./g, ABBREV_PLACEHOLDER))
      .replace(/\b(e\.g|i\.e|a\.m|p\.m)\.(?=\s|$)/gi, (m) => m.replace(/\./g, ABBREV_PLACEHOLDER));
  }
  function restoreAbbreviations(text) {
    return text.replace(new RegExp(ABBREV_PLACEHOLDER, "g"), ".");
  }

  function splitIntoSentences(text) {
    if (!text) return [];
    const protectedText = protectAbbreviations(text);
    const matches = protectedText.match(new RegExp(`[^.!?]+[.!?]+${SENTENCE_END_TRAILING_CHARS}(\\s+|$)|[^.!?]+$`, "g"));
    return (matches || [protectedText]).map((s) => restoreAbbreviations(s).trim()).filter(Boolean);
  }

  // Chia "phrase_groups" (đã có sẵn, phủ đủ CẢ ĐOẠN) thành từng nhóm con theo TỪNG CÂU — CHỈ xử
  // lý ở client, không cần trường AI mới. Đi tuần tự theo nhóm, cộng dồn số từ, cắt sang câu kế
  // khi số từ cộng dồn CHẠM ĐÚNG số từ thật của câu đó (tự tokenize riêng từng câu, dùng CHUNG
  // tokenizeWords() đã sửa để khớp số — xem BUG THẬT đầu file).
  function bucketPhraseGroupsBySentence(sentences, phraseGroups) {
    const groups = Array.isArray(phraseGroups) ? phraseGroups : [];
    const sentenceWordCounts = sentences.map((s) => tokenizeWords(s).tokens.length);
    const buckets = sentences.map(() => []);
    let sIdx = 0;
    let wordsUsedInSentence = 0;
    for (const g of groups) {
      const target = Math.min(sIdx, buckets.length - 1);
      buckets[target].push(g);
      wordsUsedInSentence += Array.isArray(g?.words) ? g.words.length : 0;
      while (sIdx < sentences.length && wordsUsedInSentence >= sentenceWordCounts[sIdx]) {
        wordsUsedInSentence -= sentenceWordCounts[sIdx];
        sIdx++;
      }
    }
    return buckets;
  }

  // CÙNG THUẬT TOÁN bucketPhraseGroupsBySentence() ở trên, áp dụng cho "reading_chunks" (Đợt 14
  // — field RIÊNG cho "Tách câu", KHÔNG dùng chung phrase_groups nữa, xem READING_CHUNKS_RULES
  // trong api/_generate/lesson.js) — khác 1 điểm: đếm số từ của mỗi khối qua tokenize "chunk.text"
  // (reading_chunks không có mảng "words" tách rời từng từ như phrase_groups, chỉ có "text").
  function bucketReadingChunksBySentence(sentences, readingChunks) {
    const chunks = Array.isArray(readingChunks) ? readingChunks : [];
    const sentenceWordCounts = sentences.map((s) => tokenizeWords(s).tokens.length);
    const buckets = sentences.map(() => []);
    let sIdx = 0;
    let wordsUsedInSentence = 0;
    for (const c of chunks) {
      const target = Math.min(sIdx, buckets.length - 1);
      buckets[target].push(c);
      wordsUsedInSentence += tokenizeWords(c?.text || "").tokens.length;
      while (sIdx < sentences.length && wordsUsedInSentence >= sentenceWordCounts[sIdx]) {
        wordsUsedInSentence -= sentenceWordCounts[sIdx];
        sIdx++;
      }
    }
    return buckets;
  }

  // Tách bản dịch tiếng Việt theo câu SONG SONG với splitIntoSentences() ở trên — chỉ DÙNG ĐƯỢC
  // khi số câu 2 bên khớp nhau (bản dịch tự nhiên không phải lúc nào cũng giữ đúng 1-1 ranh giới
  // câu với bản gốc) — khớp thì ghép đúng câu-với-câu, KHÔNG khớp thì hiện nguyên bản dịch CẢ
  // ĐOẠN 1 lần ở cuối thay vì ghép liều sai câu.
  function splitTranslationSentences(text) {
    if (!text) return [];
    const protectedText = protectAbbreviations(text);
    // Cùng lưới đỡ dấu ngoặc kép/đơn đóng như splitIntoSentences() ở trên (Đợt 13 mục 7).
    const matches = protectedText.match(new RegExp(`[^.!?…]+[.!?…]+${SENTENCE_END_TRAILING_CHARS}(\\s+|$)|[^.!?…]+$`, "g"));
    return (matches || [protectedText]).map((s) => restoreAbbreviations(s).trim()).filter(Boolean);
  }

  // SỬA 2026-08-10 (Đợt 14 — Minh: "phần tách câu là phần tinh hoa, không chắp vá" + đối chiếu
  // tool tham khảo "learning_english_v11_v6.html" của Minh: tooltip và "tách câu" là 2 HỆ THỐNG
  // TÁCH BIỆT HOÀN TOÀN trong tool đó — tooltip đọc dict "words" riêng, "tách câu" đọc "chunks"
  // riêng, KHÔNG có logic windowing/leftover-join nào ở tầng hiển thị) — thay hẳn
  // contentChunkLinesHtml() cũ (tự cắt cửa sổ ≤5 từ + tự vá phần thiếu bằng cách ghép
  // Anh-Việt, xem lịch sử đợt 12-13) bằng hàm ĐƠN GIẢN đọc thẳng "reading_chunks" — field RIÊNG
  // do AI sinh sạch sẵn (không giới hạn 5 từ, luôn có "meaning" tiếng Việt đầy đủ cho ĐÚNG khối
  // đó, xem READING_CHUNKS_RULES trong api/_generate/lesson.js) — client CHỈ ĐỌC, không tự
  // cắt/ghép/suy đoán gì nữa. Bài nào chưa có "reading_chunks" (lỗi lúc phân tích khi tạo bài,
  // xem createLesson.js/createFromText.js — hiếm, không phải luồng chính) hiện thẳng 1 dòng báo
  // thiếu dữ liệu, KHÔNG còn hiện spinner "đang tải" (2026-08-11: không còn cơ chế tự vá lúc mở
  // bài để dòng chờ đó chờ tới).
  function readingChunksLinesHtml(chunks) {
    if (!chunks.length) {
      return `<div class="content-chunks muted">${t("Chưa có dữ liệu tách câu cho bài này.")}</div>`;
    }
    return `
      <div class="content-chunks">
        ${chunks.map((c) => `<div class="content-chunk-line">${escapeHtml(c?.text || "")} = ${escapeHtml(c?.meaning || "")}</div>`).join("")}
      </div>
    `;
  }

  function renderContentTab(panel) {
    const pages = lesson.content || [];
    panel.innerHTML = `
      <div id="content-body"></div>
      ${ttsSupported ? audioBarHtml() : ""}
    `;

    if (ttsSupported) {
      wireAudioBar(panel);
      if (!ttsLoaded) {
        // "state.page" LUÔN là chỉ số câu THẬT (khớp completed_paragraphs đã lưu/đọc lại +
        // progress_page dùng ở thẻ "Bài đang đọc", xem lessonCard.js) — dùng làm vị trí BẮT ĐẦU
        // phát khi mở lại bài đang đọc dở.
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

    // Khối "tách câu" cho 1 ĐOẠN bài đọc (nhiều câu) — mỗi câu 1 khối riêng: icon loa (Web Speech
    // "đọc 1 lần", KHÔNG dùng audio thật đã cắt sẵn vì đó chỉ cắt theo ĐOẠN chứ không theo câu),
    // đoạn gốc (nếu bật), bản dịch CÂU ĐÓ (nếu khớp số câu, xem splitTranslationSentences ở
    // trên), và breakdown cụm CHỈ của câu đó — đúng mẫu file Minh gửi (mục 1).
    function readingChunkedItemHtml(item, itemIdx, startSentenceNo) {
      const sentences = splitIntoSentences(item?.text || "");
      // "buckets" (phrase_groups) CHỈ phục vụ tra-từ/tooltip — "readingChunkBuckets"
      // (reading_chunks) CHỈ phục vụ breakdown "Tách câu" — 2 NGUỒN TÁCH BIỆT (Đợt 14), không
      // dùng chung nữa. Xem ghi chú tại readingChunksLinesHtml().
      const buckets = bucketPhraseGroupsBySentence(sentences, item?.phrase_groups);
      const readingChunkBuckets = bucketReadingChunksBySentence(sentences, item?.reading_chunks);
      const viSentences = splitTranslationSentences(item?.translation || "");
      const viMatch = viSentences.length === sentences.length;
      // SỬA 2026-08-09 (Đợt 4, mục 9 — Minh: "tắt hết 3 toggle thì trống, hãy hiện toàn bộ nội
      // dung thay vì trống"): tắt cả đoạn gốc lẫn dịch cùng lúc trước đây không render gì —
      // LUÔN hiện ít nhất bản gốc trong trường hợp đó, không bao giờ để trống hẳn.
      // SỬA 2026-08-10 (Đợt 13, mục 8 — Minh: hiển thị không đồng bộ giữa các tổ hợp toggle):
      // TRƯỚC ĐÂY chỉ tính 2/3 toggle (thiếu showChunks) — bật RIÊNG "Tách câu" (tắt cả 2 toggle
      // còn lại) vẫn bị coi là "tắt hết" nên GỘP LẠI 1 đoạn, ngược với chính tên icon "Tách câu".
      // Phải tính ĐỦ CẢ 3 mới đúng quy tắc đã chốt "chỉ gộp khi tắt hết CẢ 3 toggle".
      const forceOriginal = !state.showOriginal && !state.showTranslation && !state.showChunks;
      const perSentence = sentences
        .map(
          (sentence, sIdx) => `
        ${sIdx > 0 ? '<div class="content-divider"></div>' : ""}
        <div class="content-sentence-block" data-item-idx="${itemIdx}" data-sentence-idx="${sIdx}">
        <div class="content-item-header">
          <span class="sentence-number">${t("Câu")} ${startSentenceNo + sIdx}</span>
          ${ttsSupported ? `<button type="button" class="sentence-icon-btn" data-sentence-idx="${itemIdx}:${sIdx}" title="${t("Đọc câu này")}">${icon("volume", { size: 15 })}</button>` : ""}
        </div>
        ${
          state.showOriginal || forceOriginal
            ? // BUG THẬT (2026-08-10, Minh: "tra từ bị lỗi không tra được từ") — trước đây dùng
              // escapeHtml() thuần cho câu ở đây, KHÔNG bọc span tra-từ nào cả (khác hẳn nhánh
              // không-tách-câu dùng renderInteractiveHtml() ngay dưới) — mọi từ trong "Tách câu"
              // hoàn toàn không bấm được, không phải do dữ liệu AI thiếu. Dùng lại đúng
              // renderInteractiveHtml() với "buckets[sIdx]" (phrase_groups CHỈ của câu này, đã
              // tách sẵn ở trên) để câu trong từng khối cũng tra từ được như đoạn gốc.
              `<div class="content-text" data-item-idx="${itemIdx}" data-sentence-idx="${sIdx}">${renderInteractiveHtml(sentence, lesson.vocabulary || [], buckets[sIdx] || [])}</div>`
            : ""
        }
        ${state.showTranslation && viMatch ? `<div class="content-translation">${escapeHtml(viSentences[sIdx])}</div>` : ""}
        ${state.showChunks ? readingChunksLinesHtml(readingChunkBuckets[sIdx] || []) : ""}
        </div>
      `
        )
        .join("");
      const wholeTranslation =
        state.showTranslation && !viMatch ? `<div class="content-translation">${escapeHtml(item?.translation || "")}</div>` : "";
      return perSentence + wholeTranslation;
    }

    function renderContentBody() {
      const body = panel.querySelector("#content-body");
      // SỬA 2026-08-09 (Đợt 4, mục 6 — Minh: "câu nào cũng câu 1"): đếm số câu LIÊN TỤC xuyên
      // suốt cả bài thay vì reset về 1 mỗi đoạn — bài đọc nhiều đoạn ngắn (1-2 câu/đoạn) trước
      // đây gần như đoạn nào cũng hiện "Câu 1".
      let sentenceCounter = 1;
      // Mục 9/Đợt 13 mục 8 — xem ghi chú ở readingChunkedItemHtml(), áp dụng CHUNG cho cả nhánh
      // không-chunked.
      const forceOriginal = !state.showOriginal && !state.showTranslation && !state.showChunks;
      body.innerHTML = `
        <div class="content-page">
          ${pages
            .map((item, i) => {
              const sentencesForItem = splitIntoSentences(item?.text || "");
              // SỬA 2026-08-10 (Minh: "câu gốc: 3 câu thành 1 đoạn, phần tách: mỗi câu — phải
              // thống nhất để phần hiển thị không bị nhảy"): trước đây chỉ tách câu khi bật icon
              // "Tách câu" (state.showChunks) — bật/tắt icon đó đổi hẳn cấu trúc khối (1 khối cả
              // đoạn <-> nhiều khối từng câu), gây giật bố cục. Giờ LUÔN tách câu cho bài đọc
              // (không đụng hội thoại — !item?.speaker) MỖI KHI còn hiện ít nhất 1 trong 2 nội
              // dung (đoạn gốc/dịch) — CHỈ gộp lại thành 1 khối cả đoạn ở đúng ca "tắt hết 3
              // toggle" (forceOriginal, xem Nhóm I đợt 4) như Minh đề xuất (Hình 4). "Tách câu"
              // (state.showChunks) giờ CHỈ còn quyết định có hiện dòng breakdown cụm từ dưới mỗi
              // câu hay không (xem readingChunkedItemHtml()), không còn quyết định CẤU TRÚC nữa.
              const useChunkedReading = !item?.speaker && sentencesForItem.length > 0 && !forceOriginal;
              const startSentenceNo = sentenceCounter;
              if (useChunkedReading) sentenceCounter += sentencesForItem.length;
              return `
            ${i > 0 ? '<div class="content-divider"></div>' : ""}
            <div class="content-item-block" data-content-item-idx="${i}">
            ${
              useChunkedReading
                ? readingChunkedItemHtml(item, i, startSentenceNo)
                : `
              <div class="content-item-header">
                <span class="speaker-name">${item?.speaker ? escapeHtml(item.speaker) : ""}</span>
                ${contentActionsHtml(i)}
              </div>
              ${state.showOriginal || forceOriginal ? `<div class="content-text" data-item-idx="${i}">${renderInteractiveHtml(item?.text || "", lesson.vocabulary || [], item?.phrase_groups)}</div>` : ""}
              ${state.showTranslation ? `<div class="content-translation">${escapeHtml(item?.translation || "")}</div>` : ""}
              ${state.showChunks ? readingChunksLinesHtml(item?.reading_chunks || []) : ""}
            `
            }
            </div>
          `;
            })
            .join("")}
        </div>
      `;

      body.querySelectorAll(".content-text[data-item-idx]").forEach((el) => {
        const itemIdx = Number(el.dataset.itemIdx);
        // "data-sentence-idx" chỉ có ở khối "tách câu" (readingChunkedItemHtml()) — cần đúng CÂU
        // đó (không phải cả đoạn) làm "sentence" cho wireInteractiveWords(), khớp với text ĐÃ
        // DÙNG lúc renderInteractiveHtml() tạo ra các span data-token-idx bên trong.
        const sIdx = el.dataset.sentenceIdx !== undefined ? Number(el.dataset.sentenceIdx) : null;
        const text = sIdx === null ? pages[itemIdx]?.text || "" : splitIntoSentences(pages[itemIdx]?.text || "")[sIdx] || "";
        wireInteractiveWords(el, text, genderHints[itemIdx]);
      });
      body.querySelectorAll(".sentence-icon-btn[data-idx]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          // 2026-08-14 — cùng lý do chặn nút Phát chính (xem "fullAudioPending" đầu hàm): bấm
          // icon loa từng câu TRƯỚC khi biết chắc có audio thật cũng rơi về Web Speech miễn phí,
          // đúng hiện tượng Minh báo. Chặn tạm trong lúc đang chờ, không lặng lẽ phát giọng máy.
          if (fullAudioPending) return;
          const itemIdx = Number(btn.dataset.idx);
          // 2026-07-30 (mục 1+2) — phát ĐÚNG đoạn audio thật đã cắt sẵn cho câu này (nếu bài đã
          // có), KHÔNG còn luôn luôn Web Speech như trước — xem playSegment() trong tts.js.
          ttsPlayer.playSegment(itemIdx);
        });
      });
      // Icon loa TỪNG CÂU trong chế độ "tách câu" bài đọc — không có audio thật cắt theo câu,
      // luôn Web Speech "đọc 1 lần" (giống icon loa từ vựng), không đụng playlist chính.
      body.querySelectorAll(".sentence-icon-btn[data-sentence-idx]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const [itemIdx, sIdx] = btn.dataset.sentenceIdx.split(":").map(Number);
          const sentence = splitIntoSentences(pages[itemIdx]?.text || "")[sIdx] || "";
          ttsPlayer.speakOnce(sentence, genderHints[itemIdx]);
        });
      });
    }
  }

  // 2026-08-11: bỏ hẳn cơ chế "vá lúc mở bài" (ensurePhraseGroupsPatched()/
  // ensureReadingChunksPatched() cũ) — phrase_groups/reading_chunks giờ LUÔN được phân tích XONG
  // ngay lúc tạo bài (createLesson.js/createFromText.js gọi analyzeLessonPhraseGroups/
  // analyzeLessonReadingChunks tuần tự trước khi điều hướng sang xem bài), nên bài đã LUÔN đủ dữ
  // liệu trước khi bất kỳ ai mở/bấm vào — không còn lý do để chờ/gọi AI ở tầng client nữa.

  // Bỏ nút "Hỏi AI"/giải thích câu (2026-08-08, Minh: "bỏ tính năng Hỏi AI kế bên icon đọc câu")
  // — chỉ còn nút đọc-to, và chỉ hiện khi trình duyệt hỗ trợ Web Speech API (không có gì để bấm
  // nếu không hỗ trợ đọc-to).
  function contentActionsHtml(idx) {
    if (!ttsSupported) return "";
    return `
      <div class="content-item-actions">
        <button type="button" class="sentence-icon-btn" data-action="speak" data-idx="${idx}" title="${t("Đọc câu này")}">${icon("volume", { size: 15 })}</button>
      </div>
    `;
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
        <button type="button" class="audio-btn audio-btn-play${fullAudioPending ? " audio-btn-loading" : ""}" id="audio-play" title="${t("Phát")}"${fullAudioPending ? " disabled" : ""}>${fullAudioPending ? `<span class="spinner spinner-sm"></span>` : icon("play", { size: 18, filled: true })}</button>
        <div class="audio-progress-track" id="audio-progress-track">
          <div class="audio-progress-fill" id="audio-progress-fill"></div>
          <div class="audio-progress-thumb" id="audio-progress-thumb"></div>
        </div>
        <span class="audio-time"><span id="audio-time-elapsed">0:00</span>/<span id="audio-time-total">0:00</span></span>
        <div class="audio-volume-wrap">
          <button type="button" class="audio-btn" id="audio-volume-btn" title="${t("Âm lượng")}">${icon("volume", { size: 15 })}</button>
          <input type="range" id="audio-volume-slider" class="audio-volume-slider" min="0" max="1" step="0.1" value="1" hidden />
        </div>
        <button type="button" class="audio-btn audio-btn-loop" id="audio-replay" title="${t("Lặp lại")}">${icon("repeat", { size: 15 })}<span class="audio-loop-badge">1</span></button>
        <button type="button" class="audio-btn audio-btn-speed" id="audio-speed" title="${t("Tốc độ đọc")}">1x</button>
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
    panel.querySelector("#audio-replay").addEventListener("click", () => ttsPlayer.toggleLoop());
    panel.querySelector("#audio-play").addEventListener("click", () => {
      if (fullAudioPending) return; // đang chờ xác nhận audio thật — xem refreshPlayButtonPendingState()
      ttsPlayer.playPause();
    });

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
      // "dragging" (2026-08-09, Đợt 5 mục 3) — tắt transition CSS mượt khi đang kéo tay (xem
      // .audio-progress-track.dragging trong style.css), tránh thanh/chấm bị trễ theo ngón tay.
      track.classList.add("dragging");
      track.setPointerCapture(e.pointerId);
      updateDrag(e);
    });
    track.addEventListener("pointermove", (e) => {
      if (dragging) updateDrag(e);
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      track.classList.remove("dragging");
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
    const loopBtn = document.getElementById("audio-replay");
    // SỬA 2026-08-14 (Minh real-device bắt được race condition free/trả phí — xem
    // "fullAudioPending" đầu hàm renderLessonView) — comment CŨ ở đây (2026-07-30) khẳng định
    // "không còn trạng thái đang chờ audio nào" là SAI trên thực tế: getLessonFullAudioUrl() vẫn
    // fetch bất đồng bộ. Khi đang chờ (fullAudioPending), GIỮ NGUYÊN spinner đã vẽ ở
    // audioBarHtml()/refreshPlayButtonPendingState() — không ghi đè bằng icon play/pause ở đây.
    if (playBtn && !fullAudioPending) {
      playBtn.innerHTML = s.playing ? icon("pause", { size: 18, filled: true }) : icon("play", { size: 18, filled: true });
    }
    if (speedBtn) speedBtn.textContent = `${s.rate}x`;
    if (volSlider) volSlider.value = String(s.volume);
    // Badge "1" (2026-08-08) — nút lặp lại đổi màu/nổi bật khi bật loop, đúng kiểu "repeat one"
    // của các trình phát nhạc.
    if (loopBtn) loopBtn.classList.toggle("active", !!s.loop);

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
  // "lesson.content[itemIdx].phrase_groups" TẠI THỜI ĐIỂM BẤM (dữ liệu đã đủ ngay từ lúc tạo bài,
  // xem đầu file — đọc tươi thay vì snapshot chỉ để đơn giản, không có ý nghĩa "chờ vá" nữa).
  // "itemIdx" đọc từ "data-item-idx" đã có sẵn trên chính "container" (gắn lúc render, xem
  // renderContentBody()).
  function wireInteractiveWords(container, sentence, genderHint) {
    const itemIdx = Number(container.dataset.itemIdx);
    // Khối "tách câu" (data-sentence-idx có mặt) chỉ nên tra theo phrase_groups CỦA ĐÚNG CÂU đó
    // (bucket đã tách sẵn), không phải phrase_groups CẢ ĐOẠN — "sentence" truyền vào đây cũng
    // chỉ là 1 câu (xem call site ở renderContentBody()), dùng phrase_groups cả đoạn sẽ lệch
    // token-idx với các span đã render.
    const sentenceIdx = container.dataset.sentenceIdx !== undefined ? Number(container.dataset.sentenceIdx) : null;
    container.querySelectorAll("[data-token-idx]").forEach((span) => {
      const idx = Number(span.dataset.tokenIdx);
      const word = span.textContent;
      // CHỈ trigger bằng click/chạm — hiện NGAY, không delay (đó là lỗi trước: chờ 250ms).
      // KHÔNG trigger bằng mouseenter nữa: chuột chỉ LƯỚT NGANG QUA từ (vd đang di chuyển
      // tới nút khác) cũng đủ kích hoạt tra từ, gây tooltip bị đè lẫn nhau giữa từ vừa lướt
      // qua và từ vừa bấm.
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        const itemPhraseGroups = lesson.content?.[itemIdx]?.phrase_groups;
        const phraseGroups =
          sentenceIdx === null
            ? itemPhraseGroups
            : bucketPhraseGroupsBySentence(splitIntoSentences(lesson.content?.[itemIdx]?.text || ""), itemPhraseGroups)[sentenceIdx];
        const spans = computeInteractiveSpans(sentence, lesson.vocabulary || [], phraseGroups);
        const entry = spans[idx]?.entry || null;
        showWordTooltip(span, word, sentence, genderHint, entry, itemIdx, idx);
      });
    });
  }

  // Tooltip TỐI GIẢN — cấp độ + từ + loại từ + nghĩa CỦA TỪ, không giải thích, không ví dụ.
  // SỬA 2026-08-11 (Minh: "Loại bỏ nhận dạng cụm ra khỏi tooltip... Không hiển thị cụm trong
  // tooltip nữa") — bỏ hẳn khối "phrase"/cụm phụ (data.phrase, data.is_multiword/word_meanings)
  // từng hiện bên dưới nghĩa từ. KHÔNG xoá việc AI sinh/lưu "phrase_groups" ở backend (Minh: "đưa
  // vào lưu trữ ngoài app, sau này nâng cấp sẽ bàn") — chỉ bỏ HIỂN THỊ ở tooltip, dữ liệu vẫn được
  // phân tích/lưu như cũ để dùng lại khi cần trong tương lai.
  // SỬA TIẾP (Minh: "tooltip thiếu chức năng từ (noun, verb,...)") — lúc bỏ khối "cụm" ở trên đã
  // lỡ bỏ luôn "type" (loại từ) — thêm lại làm badge nhỏ cạnh cấp độ, KHÁC bản trước (badge đó là
  // loại CỤM, đứng riêng 1 dòng dưới nghĩa) — giờ "type" là loại CỦA TỪ, đứng ngay đầu, cùng hàng
  // cấp độ + từ.
  function renderTooltipContent(anchorEl, word, genderHint, data) {
    showPopoverHtml(
      anchorEl,
      `
      <div class="word-popover-head">
        <span class="word-popover-level" data-level="${escapeHtml(data.level)}">${escapeHtml(data.level)}</span>
        <span class="word-popover-word">${escapeHtml(word)}</span>
        ${ttsSupported ? `<button type="button" class="word-popover-speak-btn" id="word-popover-speak" title="${t("Đọc từ này")}">${icon("volume", { size: 14 })}</button>` : ""}
      </div>
      ${data.type ? `<div class="word-popover-type">${escapeHtml(data.type)}</div>` : ""}
      <div class="word-popover-meaning">${escapeHtml(data.meaning || "")}</div>
      ${data.phraseText ? `<div class="word-popover-phrase-context">${escapeHtml(data.phraseText)}</div>` : ""}
    `
    );
    document.getElementById("word-popover-speak")?.addEventListener("click", (e) => {
      e.stopPropagation();
      ttsPlayer.speakOnce(word, genderHint);
    });
  }

  // "vocabEntry" ĐÃ có nghĩa sẵn trong "phrase_groups" (phân tích XONG lúc tạo bài, xem đầu file)
  // -> dùng THẲNG, hiện NGAY LẬP TỨC, KHÔNG gọi AI. Không còn nhánh chờ/vá nào nữa (2026-08-11) —
  // nếu không tìm được entry, đó là do thuật toán khớp span (computeInteractiveSpans) chứ không
  // phải thiếu dữ liệu (bài đã luôn đủ dữ liệu từ lúc tạo) — báo lỗi ngay, kèm console.warn để có
  // dấu vết debug nếu Minh gặp lại.
  function showWordTooltip(anchorEl, word, sentence, genderHint, vocabEntry, itemIdx, tokenIdx) {
    if (!vocabEntry) {
      console.warn("[lesson] từ không có entry:", { lessonId: lesson.id, itemIdx, tokenIdx, word, sentence });
      showPopoverHtml(anchorEl, `<div class="word-popover-meaning error-text">${t("Không tra được từ.")}</div>`);
      return;
    }
    // 2026-07-30 ("gom cụm từ khi sinh bài") — "vocabEntry" mang theo ĐỦ level/meaning/type riêng
    // của chính TỪ này (không còn hardcode lesson.level như trước — 1 câu B1 vẫn có thể chứa 1
    // từ A1 quen thuộc, cấp độ RIÊNG mới đúng). "type" giờ LUÔN là loại NGỮ PHÁP của từ (noun/
    // verb/...), không phải tên loại cụm (xem wordEntryFromPhraseGroup()). "phraseText" (2026-08-
    // 12, Minh: "hiển thị cụm nhưng không hiển thị nghĩa của cụm") — cụm chứa từ này, hiện làm
    // dòng ngữ cảnh, KHÔNG kèm nghĩa/bản dịch riêng của cụm.
    renderTooltipContent(anchorEl, word, genderHint, {
      level: vocabEntry.level || lesson.level,
      type: vocabEntry.type,
      meaning: vocabEntry.meaning,
      phraseText: vocabEntry.phraseText,
    });
  }

  // ====== Tab Từ vựng ======
  // Danh sách PHẲNG (2026-08-08, Minh: "chỉ cần hiển thị từ trong bài, không cần tách thành 4
  // phần") — bỏ hẳn 4 tab lọc theo loại (Chuyên ngành/Cụm/Từ/Đã tra) cũ, giữ badge "chuyên
  // ngành" (viền cam, vocab-item-specialized) inline trên từng thẻ để vẫn phân biệt được mà
  // không cần tách màn hình riêng.
  function renderVocabularyTab(panel) {
    const words = lesson.vocabulary || [];
    if (!words.length) {
      panel.innerHTML = `<p class="muted">${t("Bài này không có từ vựng nổi bật.")}</p>`;
      return;
    }
    panel.innerHTML = `
      <div class="vocab-list">
        ${words
          .map(
            (w) => `
          <div class="vocab-item ${w.is_specialized ? "vocab-item-specialized" : ""}">
            <div class="vocab-word-row">
              <div class="vocab-word ${ttsSupported ? "vocab-word-clickable" : ""} ${w.is_specialized ? "vocab-word-specialized" : ""}" data-word="${escapeHtml(w.word)}">
                ${escapeHtml(w.word)} <span class="vocab-ipa muted">${escapeHtml(w.ipa || "")}</span>
              </div>
              ${ttsSupported ? `<button type="button" class="sentence-icon-btn vocab-speak-btn" data-word="${escapeHtml(w.word)}" title="${t("Đọc từ này")}">${icon("volume", { size: 15 })}</button>` : ""}
            </div>
            ${w.type ? `<div class="vocab-type-badge badge">${escapeHtml(w.type)}</div>` : ""}
            <div class="vocab-meaning">${escapeHtml(w.meaning || "")}</div>
            <div class="vocab-example muted">${escapeHtml(w.example || "")}</div>
            ${w.example_translation ? `<div class="vocab-example-translation muted">${icon("languages", { size: 12 })}<span>${escapeHtml(w.example_translation)}</span></div>` : ""}
          </div>
        `
          )
          .join("")}
      </div>
    `;
    if (ttsSupported) {
      // Cả icon loa lẫn bấm thẳng vào từ đều phát âm — không bắt buộc phải dùng icon.
      panel.querySelectorAll(".vocab-speak-btn, .vocab-word-clickable").forEach((el) => {
        el.addEventListener("click", () => ttsPlayer.speakOnce(el.dataset.word));
      });
    }
  }

  function renderGrammarTab(panel) {
    const points = lesson.grammar || [];
    const patterns = lesson.sentence_patterns || [];
    if (!points.length && !patterns.length) {
      panel.innerHTML = `<p class="muted">${t("Bài này không có điểm ngữ pháp nổi bật để học riêng.")}</p>`;
      return;
    }
    panel.innerHTML = `
      ${
        points.length
          ? `
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
      `
          : ""
      }
      ${
        patterns.length
          ? `
        <div class="section-label-row"><span class="section-label-tab">${t("Cấu trúc câu đáng chú ý")}</span></div>
        <div class="grammar-list">
          ${patterns
            .map(
              // 2026-08-08 (Minh: "bỏ giải thích chữ đen và chữ nghiêng, chỉ cần thêm dịch cho ví
              // dụ") — bỏ hẳn "note"/"why_worth_it" khỏi hiển thị (VẪN sinh ở prompt để model tự
              // lọc chất lượng khuôn câu đáng chọn, chỉ không render ra UI nữa), chỉ còn khuôn
              // câu + ví dụ tiếng Anh + dịch. Bài cũ chưa có "example_translation" -> ẩn dòng dịch.
              (p) => `
            <div class="pattern-item">
              <div class="grammar-name">${escapeHtml(p.pattern || "")}</div>
              <div class="grammar-example muted">"${escapeHtml(p.example_from_lesson || "")}"</div>
              ${p.example_translation ? `<div class="grammar-example-translation">${escapeHtml(p.example_translation)}</div>` : ""}
            </div>
          `
            )
            .join("")}
        </div>
      `
          : ""
      }
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
        <button type="button" class="btn btn-ghost check-fill-btn" ${done ? "disabled" : ""}>${t("Kiểm tra")}</button>
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
          feedback.innerHTML = feedbackHtml(correct, correct ? t("Chính xác! ") : t("Chưa đúng. "), ex.explanation);
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
        feedback.innerHTML = correct ? feedbackHtml(true, t("Chính xác!")) : feedbackHtml(false, t("Đáp án đúng: "), ex.answer);
        markExerciseDone(i, correct, ex.grammar_tag);
      });
    }
  }

  // exerciseResults: nguồn dữ liệu DUY NHẤT cho Review Queue của Mentor AI cá nhân hoá cũ
  // (computeReviewQueue, ĐÃ ARCHIVE 2026-08-11 cùng mentor.js — xem
  // _archive/mentor-ai-personal-flow/) — khác completedExercises (Set chỉ số, chỉ biết "đã làm hay
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
      showToast(t("Bài này bạn đang học dở, mình lưu lại rồi, khi nào quay lại mình học tiếp nhé"));
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

// BUG THẬT (2026-08-13, Minh: "bài A2 tô đậm từ chuyên ngành, bài B2 lại không" — cấp cao hơn có
// nhiều từ chuyên ngành GHÉP THÀNH CỤM nhiều từ hơn, ví dụ "bank reconciliation") — vocabMap ở
// trên chỉ khớp theo CẢ CỤM nguyên văn, nhưng khi 1 từ trong cụm đó lại rơi vào 1 phrase_group
// KHÁC của AI (vd chỉ còn "reconciliation" trong 1 nhóm riêng), so khớp đơn-từ không tìm lại được
// "is_specialized" của từ vựng gốc. Tách riêng TỪNG TỪ ĐƠN bên trong mọi từ vựng nhiều-từ CHUYÊN
// NGÀNH thành 1 tập riêng — bất kỳ đâu từ đó xuất hiện trong bài đều được tô đậm đúng, không cần
// khớp lại nguyên cụm.
function buildSpecializedWordSet(vocabulary) {
  const set = new Set();
  (vocabulary || []).forEach((w) => {
    if (w.is_specialized && w.word) {
      w.word
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .forEach((part) => set.add(normalizeAnswer(part)));
    }
  });
  return set;
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
// BUG THẬT (2026-08-08, xác nhận bằng test trực tiếp: bấm từ "am" trong câu có chứa "24" ở lượt
// sau ra "Không tra được từ." dù phrase_groups phủ đủ 100%) — regex trước đây thiếu chữ số,
// KHÔNG khớp "sentenceWordTokens()" phía server (api/_generate/lesson.js, có chữ số trong lớp ký
// tự) dùng để sinh "words" của phrase_groups — bất kỳ đoạn nào chứa số ("24 years old", giá
// tiền, giờ...) làm lệch toàn bộ phép so khớp CẢ ĐOẠN đó, không riêng từ chứa số. Đổi khớp CHÍNH
// XÁC quy tắc token hoá phía server.
// SỬA 2026-08-12 — regex PHẢI khớp chính xác sentenceWordTokens() phía server (đã sửa cùng
// ngày: dấu nháy đơn MỞ ĐẦU 1 từ, dùng để trích lời nói ('This is...'), không còn bị coi là 1
// phần của từ liền sau — chỉ dấu nháy đứng GIỮA 2 ký tự chữ/số như "don't" mới được giữ).
function tokenizeWords(text) {
  const tokens = [];
  // Nhận cả dấu nháy đơn CONG "’" (U+2019, "smart quote" — model hay tự sinh trong văn xuôi,
  // vd "organization’s") — PHẢI khớp ĐÚNG sentenceWordTokens() phía server (api/_generate/
  // lesson.js), 2 quy tắc tokenize khác nhau làm coverage-check thất bại dai dẳng (bug thật
  // 2026-08-13, bài #1-B2). Nhận cả SỐ có "$" trước/dấu phẩy phân nhóm nghìn (vd "$10,000") làm
  // 1 token DUY NHẤT (bug thật 2026-08-14, bài #a-B2 — "$10,000" bị tách "10"+"000"). Nhận cả
  // dấu gạch nối trong từ ghép (vd "long-term") làm 1 token DUY NHẤT (bug thật 2026-08-14, LẶP
  // LẠI 2 LẦN độc lập ở #a-B2 và #b-B2 — "long-term" bị tách "long"+"term").
  const re = /\$?\d[\d,]*(?:\.\d+)?|[A-Za-z0-9]+(?:['’ʼ-][A-Za-z0-9]+)*/g;
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

// Dựng entry theo TỪNG TỪ (word=chính từ đó, meaning=nghĩa riêng từ đó từ "word_meanings") —
// KHÔNG còn field "phrase" (2026-08-11, Minh: "loại bỏ nhận dạng cụm ra khỏi tooltip... không
// hiển thị cụm trong tooltip nữa" — bỏ hẳn phần cụm+nghĩa cụm phụ từng hiện dưới nghĩa từ chính;
// "phrase_groups" vẫn được AI phân tích/lưu ở DB như cũ, chỉ không đọc "windowing" này ở đây nữa
// vì không còn nơi nào hiển thị nó). Cấp độ mượn của CẢ NHÓM (data hiện không có cấp độ riêng
// từng từ).
// "type" (2026-08-12, Minh: "tooltip: bỏ 'cụm động từ, cụm danh từ', chỉ hiện chức năng từ đó:
// noun, verb, adj, adv") — TRƯỚC ĐÂY ưu tiên "group.type" (tên loại CỤM, vd "Cụm động từ") rồi
// mới tới loại từ thật — SAI Ý, giờ đảo lại: ưu tiên "group.word_types[word]" (loại NGỮ PHÁP
// RIÊNG của chính từ này, field mới thêm 2026-08-12 trong PHRASE_GROUPS_RULES) hoặc
// "vocabMatch.type" (từ đơn khớp lesson.vocabulary) — CHỈ rơi về "group.type" (tên loại cụm) khi
// bài CŨ chưa có "word_types" (trước ngày thêm field này), coi là lưới đỡ tạm cho dữ liệu cũ.
// "phraseText" (mới, 2026-08-12, Minh: "hiển thị cụm nhưng không hiển thị nghĩa của cụm" — ví dụ
// "A2 morning / noun / buổi sáng / in the morning") — cụm chứa từ này, hiện làm dòng NGỮ CẢNH
// dưới nghĩa từ, KHÔNG kèm bản dịch/nghĩa cụm riêng.
function wordEntryFromPhraseGroup(group, word, vocabMap, specializedWordSet) {
  const allWords = Array.isArray(group?.words) ? group.words : [];
  const isMultiWord = allWords.length > 1;
  const vocabMatch = !isMultiWord ? findVocabEntry(word, vocabMap) : null;
  const ownMeaning = isMultiWord && group.word_meanings ? group.word_meanings[word] : null;
  const ownType = group.word_types ? group.word_types[word] : null;
  // "word_levels" (2026-08-13, Minh: "nhận diện cấp độ từ chưa chính xác" — cấp độ trước đây LUÔN
  // lấy của CẢ NHÓM (group.level), quá thô cho nhóm nhiều từ có độ khó lẫn nhau, vd nhóm "is often
  // described as" không thể dùng 1 cấp độ chung cho cả "is" (A1) và "described" (B1)) — ưu tiên
  // cấp độ RIÊNG của chính từ này, chỉ rơi về "group.level" khi bài CŨ chưa có field này.
  const ownLevel = group.word_levels ? group.word_levels[word] : null;
  // BUG THẬT (2026-08-13, Minh: "bài A2 có tô đậm từ chuyên ngành, bài B2 lại không" — cấp cao
  // hơn nhiều từ chuyên ngành GHÉP CỤM nhiều từ hơn (vd "bank reconciliation"), rơi vào nhánh
  // isMultiWord=true, "vocabMatch" ở trên LUÔN null cho nhóm nhiều từ -> is_specialized luôn
  // false dù từ đó CHÍNH LÀ từ chuyên ngành đã chọn trong "vocabulary") — kiểm THÊM qua tập từ
  // đơn tách ra từ MỌI từ vựng chuyên ngành nhiều-từ (specializedWordSet, xem buildVocabMap()),
  // không chỉ khớp CẢ CỤM y nguyên.
  const isSpecialized = !!vocabMatch?.is_specialized || !!specializedWordSet?.has(normalizeAnswer(word));

  return {
    word,
    meaning: ownMeaning || group.meaning || vocabMatch?.meaning || "",
    level: ownLevel || vocabMatch?.level || group.level || "",
    type: ownType || vocabMatch?.type || group.type || "",
    phraseText: isMultiWord ? allWords.join(" ") : "",
    is_specialized: isSpecialized,
    highlight: isMultiWord || !!vocabMatch,
    fromPhraseGroups: true, // dữ liệu này đã NẰM SẴN vĩnh viễn trong content của bài (phân tích
    // xong ngay lúc tạo bài, xem đầu file), không cần lưu thêm 1 bản riêng vào lesson.vocabulary/
    // DB nữa.
  };
}

// Ghép "tokens" (đã tokenize theo "text") với "phraseGroups" (nhãn cụm AI gắn sẵn lúc sinh bài)
// theo ĐÚNG THỨ TỰ tuần tự — KHÔNG cần khớp lại bằng cách dò tìm (khác hẳn nhánh "vocabulary"
// bên dưới, vốn phải TỰ SUY ĐOÁN vị trí bằng cách dò text) vì phraseGroups đã được sinh CÙNG
// LÚC với chính câu này, thứ tự đảm bảo đúng. Trả về null nếu có bất kỳ sai lệch nào (từ trong
// nhóm không khớp đúng token kế tiếp, hoặc còn dư/thiếu token) — B2/C1 KHÔNG bắt buộc phủ 100%
// (xem validatePhraseCoverage phía server) nên vẫn có thể lệch ở 2 cấp đó; lệch thì RƠI VỀ cách
// khớp "vocabulary" cũ bên dưới, không hiển thị sai/thiếu.
// BUG THẬT (2026-08-08, xác nhận qua dữ liệu sống: nhóm "Hello!" giữ nguyên dấu "!" bên trong
// "words") — so khớp trực tiếp .toLowerCase() KHÔNG bỏ dấu câu, trong khi "tokens" (từ
// tokenizeWords()) ĐÃ tách sạch dấu câu — "hello" (token) !== "hello!" (word có dấu) làm toàn bộ
// span của CẢ ĐOẠN trả về null dù coverage-check (có chuẩn hoá bỏ dấu câu) coi là ĐẠT. Chuẩn hoá
// CẢ 2 vế giống hệt cách chuẩn hoá coverage-check phía server (itemPhraseCoverageOk()) trước khi
// so khớp.
function normalizeMatchWord(w) {
  return (w || "")
    .toString()
    .toLowerCase()
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[^a-z0-9'-]/g, "");
}

// SỬA 2026-08-10 (Đợt 13 mục 4) — mỗi TỪ giờ là 1 span RIÊNG (trước đây cả cụm là 1 span DUY
// NHẤT) để bấm đúng từ nào ra đúng entry của từ đó — xem wordEntryFromPhraseGroup(). Các span
// liền kề của CÙNG 1 nhóm vẫn tô CÙNG 1 class màu (renderInteractiveHtml() đọc entry.highlight),
// khoảng trắng giữa 2 từ nằm NGOÀI mọi span (không tô màu) — không cần span "cha" bọc ngoài,
// nhìn vẫn liền mạch vì không có viền/margin chen giữa.
function spansFromPhraseGroups(tokens, text, phraseGroups, vocabMap, specializedWordSet) {
  const spans = [];
  let tIdx = 0;
  for (const group of phraseGroups) {
    const words = Array.isArray(group?.words) ? group.words : [];
    if (!words.length) continue;
    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const w = words[wIdx];
      if (tIdx >= tokens.length || normalizeMatchWord(tokens[tIdx].word) !== normalizeMatchWord(w)) return null;
      const tok = tokens[tIdx];
      spans.push({
        text: text.slice(tok.start, tok.end),
        start: tok.start,
        end: tok.end,
        entry: wordEntryFromPhraseGroup(group, w, vocabMap, specializedWordSet),
      });
      tIdx++;
    }
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
  const specializedWordSet = buildSpecializedWordSet(vocabulary);

  if (Array.isArray(phraseGroups) && phraseGroups.length) {
    const spansFromGroups = spansFromPhraseGroups(tokens, text, phraseGroups, vocabMap, specializedWordSet);
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
