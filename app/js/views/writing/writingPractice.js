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
// - "Xem bài viết hoàn chỉnh" (Bước 5, 2 tab Nội dung/Từ vựng+Ngữ pháp) — ĐÃ LÀM 2026-07-27
//   (Việc 2), gộp vào CÙNG 1 lượt gọi grade_writing (không tách action riêng), xem
//   api/_generate/writing.js::GRADE_SYSTEM_PROMPT phần "clean_rewrite".
import { navigate } from "../../router.js";
import { generateWritingTask, gradeWriting, saveWritingFavorite, listWritingGenres } from "../../writingApi.js";
import { getActiveLearningGoal } from "../../db.js";
import { escapeHtml, countWords } from "../../utils.js";
import { icon } from "../../icons.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats, wireBackLink } from "../../header.js";
import { callChatAction } from "../../chatApi.js";
import { createPlayer, isTTSSupported } from "../../tts.js";
import { t, registerTranslations } from "../../i18n.js";

registerTranslations({
  "Luyện viết": "Writing practice",
  "Nhiệm vụ": "Task",
  "Viết bài": "Write",
  "Kết quả": "Result",
  "Chi tiết bài viết": "Writing details",
  "Bài viết hoàn chỉnh": "Polished essay",
  "Bài tham khảo": "Reference essay",
  "Đang tải...": "Loading...",
  "Chọn thể loại luyện viết": "Choose a writing genre",
  "Cấp độ luyện tập": "Practice level",
  "AI Giao Nhiệm Vụ": "AI Assign Task",
  "Mục tiêu bài viết": "Writing goals",
  "Cấu trúc gợi ý": "Suggested structure",
  "Đổi đề khác": "Try another topic",
  "Bắt đầu viết": "Start writing",
  "Bắt đầu viết bài của bạn...": "Start writing your essay...",
  "từ": "words",
  "Mục tiêu": "Target",
  "Cấu trúc": "Structure",
  "Từ vựng": "Vocabulary",
  "Cụm từ": "Phrases",
  "Gửi bài viết": "Submit essay",
  "Không có gợi ý từ vựng riêng cho đề này.": "No specific vocabulary suggestions for this topic.",
  "Không có gợi ý cụm từ riêng cho đề này.": "No specific phrase suggestions for this topic.",
  "Điểm mạnh": "Strengths",
  "Xem chi tiết bài viết": "View writing details",
  "Hoàn tất": "Finish",
  "Xem bài tham khảo": "View reference essay",
  "Xem bài viết hoàn chỉnh": "View polished essay",
  "Đã lưu bài đã sửa": "Corrected essay saved",
  "Lưu bài đã sửa": "Save corrected essay",
  "Quay lại kết quả": "Back to result",
  "Đã lưu bài tham khảo": "Reference essay saved",
  "Lưu bài tham khảo": "Save reference essay",
  "Quay lại chi tiết": "Back to details",
  "Nội dung": "Content",
  "Từ vựng &amp; Ngữ pháp": "Vocabulary &amp; Grammar",
  "Đã lưu bài hoàn chỉnh": "Polished essay saved",
  "Lưu bài hoàn chỉnh": "Save polished essay",
  "Bài mẫu không nổi bật từ chuyên ngành nào riêng.": "The sample doesn't highlight any field-specific vocabulary.",
  "Không chọn lĩnh vực nên không có từ chuyên ngành để gợi ý.": "No industry selected, so there's no specialized vocabulary to suggest.",
  "Bài mẫu không có cấu trúc nào nổi bật hơn hẳn cách viết gốc của bạn.": "The sample has no structure that stands out compared to your original writing.",
  "Từ vựng chuyên ngành đã dùng": "Specialized vocabulary used",
  "Cấu trúc đáng chú ý": "Notable structures",
  "Tạm dừng": "Pause",
  "Phát": "Play",
  "AI đang chọn nhiệm vụ...": "AI is choosing a task...",
  "Có lỗi xảy ra, vui lòng thử lại.": "Something went wrong, please try again.",
  "Bài viết quá ngắn (tối thiểu 10 từ).": "Your essay is too short (minimum 10 words).",
  "AI đang chấm bài viết...": "AI is grading your essay...",
  "Lưu thất bại, vui lòng thử lại.": "Save failed, please try again.",
  // 14 thể loại luyện viết (2026-08-13, Minh: "card thể loại luyện viết vẫn còn tiếng Việt trong
  // giao diện tiếng Anh") — khớp ĐÚNG nguyên văn khoá trong api/_generate/writingTopicPool.json
  // (list_writing_genres trả về, xem GENRE_STYLES ngay dưới) — cũng dùng lại ở writingArchive.js
  // (r.task.genre_vi) nên KHÔNG gộp vào registerTranslations riêng của file đó, để 1 nguồn DUY
  // NHẤT tại đây (module này luôn được app.js import tĩnh từ đầu, xem i18n.js).
  "Nghị luận": "Argumentative essay",
  "Đánh giá": "Review",
  "Kể chuyện": "Storytelling",
  "Viết thư": "Letter writing",
  "Báo cáo": "Report",
  "Tin nhắn": "Message",
  "Mô tả": "Description",
  "Hướng dẫn": "Instructions",
  "Bài đăng mạng xã hội": "Social media post",
  "Thư ngỏ": "Open letter",
  "Ghi chú": "Notes",
  "Tường thuật sự việc": "Incident report",
});

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

// Icon + màu chip riêng cho từng thể loại (2026-08-04, Minh: "các tab có icon giống giao diện
// chọn ngành để đồng bộ thị giác") — khớp ĐÚNG 14 khoá trong api/_generate/writingTopicPool.json
// (list_writing_genres trả nguyên văn tên này). Tên KHÔNG khớp map (nếu sau này thêm thể loại
// mới) rơi về DEFAULT_GENRE_STYLE, không vỡ giao diện.
// KHÔI PHỤC 2026-08-10 (Đợt 7 — Minh: "Khôi phục các icon của các card trong luyện viết") — đợt
// 4 từng bỏ icon này theo yêu cầu khác, giờ Minh đổi ý muốn giữ lại.
const GENRE_STYLES = {
  "Nghị luận": { icon: "list", chip: "blue" },
  "Phân tích": { icon: "flask", chip: "orange" },
  "Đánh giá": { icon: "star", chip: "purple" },
  "Kể chuyện": { icon: "book-open", chip: "green" },
  "Viết thư": { icon: "bookmark", chip: "blue" },
  "Báo cáo": { icon: "briefcase", chip: "orange" },
  Email: { icon: "file-text", chip: "purple" },
  "Tin nhắn": { icon: "message-circle", chip: "green" },
  "Mô tả": { icon: "compass", chip: "blue" },
  "Hướng dẫn": { icon: "graduation-cap", chip: "orange" },
  "Bài đăng mạng xã hội": { icon: "camera", chip: "purple" },
  "Thư ngỏ": { icon: "file-text", chip: "green" },
  "Ghi chú": { icon: "edit-3", chip: "blue" },
  "Tường thuật sự việc": { icon: "book", chip: "orange" },
};
const DEFAULT_GENRE_STYLE = { icon: "file-text", chip: "blue" };

// Bỏ icon trước tiêu đề (2026-08-04, Minh: "bỏ icon Chọn dạng bài viết") — chỉ CÒN icon ở 2
// bước cuối (Bài viết hoàn chỉnh/Bài tham khảo, dùng "sparkles" phân biệt rõ với các bước
// trước, giữ nguyên như cũ).
const STEP_TITLES = {
  genre: t("Luyện viết"),
  task: t("Nhiệm vụ"),
  write: t("Viết bài"),
  result: t("Kết quả"),
  detail: t("Chi tiết bài viết"),
  clean: `${icon("sparkles", { size: 22 })} ${t("Bài viết hoàn chỉnh")}`,
  reference: `${icon("sparkles", { size: 22 })} ${t("Bài tham khảo")}`,
};

export function renderWritingPractice(mount) {
  const state = {
    // "genre" (2026-08-04, KHÔI PHỤC màn "Chọn dạng bài viết" — Minh chốt lại, xem ghi chú
    // "genre" trong api/_generate/writing.js::generate_writing_task) LUÔN là bước ĐẦU TIÊN — GỘP
    // CHUNG với chọn cấp độ (2026-08-04 lần 2, Minh: "bớt được 1 luồng, không phải Tiếp tục rồi
    // mới AI giao nhiệm vụ nữa") — KHÔNG còn bước "setup" riêng, chọn thể loại + cấp độ đều trên
    // CÙNG 1 màn, bấm "AI Giao Nhiệm Vụ" duy nhất 1 lần. BỎ chọn "lĩnh vực" (2026-08-04 lần 3,
    // Minh: nhầm lẫn giữa "dạng bài viết" và "lĩnh vực" — không cần chọn lĩnh vực ở đây nữa),
    // "industry" giữ nguyên field rỗng cố định (server vẫn nhận tham số này, chỉ không có UI đặt).
    step: "genre",
    genres: null, // null = đang tải danh sách thể loại
    genre: null, // thể loại đã CHỌN (tên tiếng Việt, khớp key WRITING_TOPIC_POOL_BY_GENRE)
    level: "B1",
    industry: "",
    task: null,
    targetWordsMin: 0,
    targetWordsMax: 0,
    text: "",
    supportTab: "structure",
    grading: null, // { overall_score, tier, tier_label, criteria, strengths, segments, notices, clean_rewrite, reference_essay }
    cleanTab: "content",
    savedDetailed: false,
    savedClean: false,
    savedReference: false,
    cleanCoverImage: null, // Item 3 (2026-07-27) — ảnh minh hoạ CHỈ cho Bài viết hoàn chỉnh (khá/giỏi), tải LƯỜI khi mở màn đó, tái dùng pipeline ảnh miễn phí có sẵn (search_lesson_cover_image).
    goalId: null, // 2026-08-06, tái cấu trúc theo cây mới — tải NGẦM ngay dưới đây, dùng khi lưu (saveFavorite()).
  };
  getActiveLearningGoal()
    .then((g) => {
      state.goalId = g?.id || null;
    })
    .catch(() => {
      // Lỗi mạng lúc tải goal đang active không nên chặn cả luồng luyện viết — lưu bài vẫn hoạt
      // động bình thường, chỉ không gắn được goal_id (server tự hiểu là null, không lỗi).
    });

  // Cache streak/tier SAU khi tải xong 1 lần (xem header.js::appHeaderHtml() tham số "cache")
  // — render() gọi lại nhiều lần mỗi khi đổi bước, nếu không cache header sẽ nhảy về "--"/"..."
  // mỗi lần đổi bước dù đã tải xong trước đó (đúng bug đã gặp ở createLesson.js).
  let headerCache = {};

  // Item 6 (2026-07-27) — nút Play/Pause + dải tiến trình cho "Bài viết hoàn chỉnh", CHỈ ở màn
  // này (KHÔNG đụng thanh audio có sẵn ở màn Bài học chi tiết — thuộc Phase B-H, đang khoá).
  // Dùng LẠI ĐÚNG engine phát (createPlayer() trong tts.js, Web Speech — chưa đổi sang TTS chất
  // lượng cao, việc đó giao riêng đợt sau) — chỉ xây UI điều khiển mới, không sửa tts.js.
  // "elapsedSec"/"playStartedAt" tự ước lượng thời gian đã phát (Web Speech không có sự kiện
  // tiến trình đáng tin cậy đa trình duyệt) — tua bằng cách gọi player.skip(giây lệch), đúng cơ
  // chế "tua = cắt lại câu từ vị trí ước lượng" đã ghi chú sẵn trong tts.js, không phát minh cơ
  // chế mới.
  let ttsPlayer = null;
  let audioProgressTimer = null;
  let audioElapsedSec = 0;
  let audioPlayStartedAt = null;
  let audioTotalSec = 0;

  render();
  loadAppHeaderStats(mount).then((r) => {
    if (r) headerCache = { streakText: r.streak, tierText: r.tier };
  });
  loadGenres();

  async function loadGenres() {
    const res = await listWritingGenres();
    state.genres = res.ok ? res.data.genres : [];
    if (state.step === "genre") render();
  }

  function render() {
    mount.innerHTML = `
      <div class="screen">
        ${appHeaderHtml(STEP_TITLES[state.step], headerCache, {
          showBack: true,
          archivePath: state.step === "genre" ? "/writing-archive" : undefined,
        })}
        ${
          state.step === "genre"
            ? renderGenreStep()
            : state.step === "task"
            ? renderTaskStep()
            : state.step === "write"
            ? renderWriteStep()
            : state.step === "result"
            ? renderResultStep()
            : state.step === "detail"
            ? renderDetailStep()
            : state.step === "clean"
            ? renderCleanStep()
            : renderReferenceStep()
        }
      </div>
    `;
    wire();
  }

  // ====== Bước 0 (2026-08-04, GỘP với chọn cấp độ 2026-08-04 lần 2 — Minh: "bớt được 1 luồng"):
  // chọn dạng bài viết (tick chọn 1 trong các thể loại có sẵn, writingTopicPool.json qua
  // list_writing_genres, KHÔNG gọi AI) + cấp độ + lĩnh vực (tuỳ chọn), TẤT CẢ trên CÙNG 1 màn —
  // ĐÚNG 1 nút "AI Giao Nhiệm Vụ" duy nhất, không còn màn "setup" riêng. ======
  function renderGenreStep() {
    if (state.genres === null) return `<p class="muted">${t("Đang tải...")}</p>`;
    return `
      <label class="field">
        <span class="field-question">${t("Chọn thể loại luyện viết")}</span>
      </label>
      <div class="genre-list">
        ${state.genres
          .map((g) => {
            const style = GENRE_STYLES[g] || DEFAULT_GENRE_STYLE;
            return `
          <button type="button" class="genre-row ${state.genre === g ? "active" : ""}" data-genre="${escapeHtml(g)}">
            <span class="genre-row-icon chip-${style.chip}">${icon(style.icon, { size: 18 })}</span>
            <span class="genre-row-label">${escapeHtml(t(g))}</span>
            ${state.genre === g ? icon("check-circle", { size: 20, filled: true }) : ""}
          </button>
        `;
          })
          .join("")}
      </div>

      <label class="field">
        <span class="field-question">${t("Cấp độ luyện tập")}</span>
      </label>
      <div class="filter-row" id="level-chip-row">
        ${LEVELS.map((l) => `<button type="button" class="filter-chip level-chip ${l === state.level ? "active" : ""}" data-level="${l}">${l}</button>`).join("")}
      </div>

      <div id="genre-result-slot"></div>
      <button type="button" class="btn btn-primary btn-block" id="genre-continue-btn" ${state.genre ? "" : "disabled"}>${t("AI Giao Nhiệm Vụ")}</button>
    `;
  }

  // ====== Bước 2: AI giao nhiệm vụ ======
  function renderTaskStep() {
    const task = state.task;
    return `
      <div class="card writing-card writing-task-card">
        <div class="writing-genre-badge">${escapeHtml(task.genre_vi || t("Nhiệm vụ"))} <span class="level-pill">${state.level}</span></div>
        <p class="writing-topic-en">${escapeHtml(task.topic_en)}</p>
        <p class="writing-topic-vi muted">${escapeHtml(task.topic_vi)}</p>
        ${task.topic_note ? `<p class="writing-topic-note">${icon("compass", { size: 14 })} ${escapeHtml(task.topic_note)}</p>` : ""}
      </div>

      <div class="card writing-card">
        <div class="writing-section-title">${t("Mục tiêu bài viết")}</div>
        <ul class="writing-goals-list">
          ${task.goals.map((g) => `<li>${icon("check-circle", { size: 16 })} <span>${escapeHtml(g)}</span></li>`).join("")}
        </ul>
      </div>

      <div class="card writing-card">
        <div class="writing-section-title">${t("Cấu trúc gợi ý")}</div>
        <ol class="writing-structure-list">
          ${task.structure.map((s) => `<li><strong>${escapeHtml(s.label)}</strong> <span class="muted">${s.label_vi ? `(${escapeHtml(s.label_vi)})` : ""}</span></li>`).join("")}
        </ol>
      </div>

      <div id="task-result-slot"></div>
      <div class="director-card-actions">
        <button type="button" class="btn btn-ghost btn-block" id="task-reroll-btn">${t("Đổi đề khác")}</button>
        <button type="button" class="btn btn-primary btn-block" id="task-start-btn">${t("Bắt đầu viết")}</button>
      </div>
    `;
  }

  // ====== Bước 3: người dùng viết ======
  function renderWriteStep() {
    const task = state.task;
    const n = countWords(state.text);
    return `
      <div class="card writing-task-recap">
        <div class="writing-genre-badge">${escapeHtml(task.genre_vi || t("Nhiệm vụ"))} <span class="level-pill">${state.level}</span></div>
        <p class="writing-topic-en">${escapeHtml(task.topic_en)}</p>
      </div>

      <textarea id="writing-textarea" rows="10" placeholder="${t("Bắt đầu viết bài của bạn...")}">${escapeHtml(state.text)}</textarea>
      <p class="field-hint" id="writing-wordcount">${n} ${t("từ")} · ${t("Mục tiêu")}: ${state.targetWordsMin}-${state.targetWordsMax} ${t("từ")}</p>

      <div class="tabs" id="support-tabs">
        <button type="button" class="tab-btn ${state.supportTab === "structure" ? "active" : ""}" data-tab="structure">${t("Cấu trúc")}</button>
        <button type="button" class="tab-btn ${state.supportTab === "vocab" ? "active" : ""}" data-tab="vocab">${t("Từ vựng")}</button>
        <button type="button" class="tab-btn ${state.supportTab === "phrases" ? "active" : ""}" data-tab="phrases">${t("Cụm từ")}</button>
      </div>
      <div class="card writing-support-panel" id="support-panel">${renderSupportPanel()}</div>

      <div id="write-result-slot"></div>
      <button type="button" class="btn btn-primary btn-block" id="submit-writing-btn">${t("Gửi bài viết")}</button>
    `;
  }

  function renderSupportPanel() {
    const task = state.task;
    if (state.supportTab === "structure") {
      return `<ol class="writing-structure-list">${task.structure.map((s) => `<li><strong>${escapeHtml(s.label)}</strong> <span class="muted">${s.label_vi ? `(${escapeHtml(s.label_vi)})` : ""}</span></li>`).join("")}</ol>`;
    }
    if (state.supportTab === "vocab") {
      if (!task.vocabulary_suggestions?.length) return `<p class="muted">${t("Không có gợi ý từ vựng riêng cho đề này.")}</p>`;
      return `<ul class="writing-suggestion-list">${task.vocabulary_suggestions.map((v) => `<li><strong>${escapeHtml(v.word)}</strong> — ${escapeHtml(v.meaning)}</li>`).join("")}</ul>`;
    }
    if (!task.useful_phrases?.length) return `<p class="muted">${t("Không có gợi ý cụm từ riêng cho đề này.")}</p>`;
    return `<ul class="writing-suggestion-list">${task.useful_phrases.map((p) => `<li><strong>${escapeHtml(p.phrase)}</strong> — ${escapeHtml(p.meaning)}</li>`).join("")}</ul>`;
  }

  // ====== Bước 4: AI chấm điểm tổng quan ======
  function renderResultStep() {
    const g = state.grading;
    const isWeak = g.tier === "weak";
    return `
      <div class="card writing-score-card">
        <div class="writing-score-ring" style="--pct:${g.overall_score}">
          <div class="writing-score-ring-inner">
            <span class="writing-score-value">${g.overall_score}</span>
            <span class="muted">/100</span>
          </div>
        </div>
        <div class="writing-tier-label">${escapeHtml(g.tier_label)}</div>
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

      ${
        isWeak
          ? `<div class="result-panel result-error"><p>${escapeHtml(g.weak_message)}</p></div>`
          : `<div class="result-panel result-success">
              <div class="result-title">${t("Điểm mạnh")}</div>
              <p>${escapeHtml(g.strengths)}</p>
            </div>`
      }

      <div class="director-card-actions">
        ${isWeak ? "" : `<button type="button" class="btn btn-ghost btn-block" id="view-detail-btn">${t("Xem chi tiết bài viết")}</button>`}
        <button type="button" class="btn btn-primary btn-block" id="finish-writing-btn">${t("Hoàn tất")}</button>
      </div>
    `;
  }

  // ====== Bước 5: chi tiết bài viết — 1 khối văn bản liền mạch, đánh dấu inline ======
  function renderDetailStep() {
    const g = state.grading;
    // Bài tham khảo (mức Trung bình) và Bài viết hoàn chỉnh (mức Khá/Giỏi) LOẠI TRỪ NHAU theo
    // mức điểm (xem SCORE_TIERS trong api/_generate/writing.js) — chỉ 1 trong 2 nút hiện ra.
    const secondaryBtnHtml =
      g.tier === "average" && g.reference_essay
        ? `<button type="button" class="btn btn-ghost btn-block" id="view-reference-btn">${icon("sparkles", { size: 18 })} ${t("Xem bài tham khảo")}</button>`
        : (g.tier === "good" || g.tier === "excellent") && g.clean_rewrite
        ? `<button type="button" class="btn btn-ghost btn-block" id="view-clean-btn">${icon("sparkles", { size: 18 })} ${t("Xem bài viết hoàn chỉnh")}</button>`
        : "";
    return `
      <div class="card writing-card">
        <p class="writing-annotated-text">${annotatedBlockHtml(g.segments)}</p>
      </div>
      ${g.notices.length ? `<div class="writing-notices">${g.notices.map((n) => `<p class="writing-notice">${escapeHtml(n)}</p>`).join("")}</div>` : ""}
      <div id="save-detailed-slot"></div>
      <div class="director-card-actions">
        <button type="button" class="btn btn-ghost btn-block" id="save-detailed-btn" ${state.savedDetailed ? "disabled" : ""}>${icon("bookmark", { size: 16 })} ${state.savedDetailed ? t("Đã lưu bài đã sửa") : t("Lưu bài đã sửa")}</button>
        ${secondaryBtnHtml}
        <button type="button" class="btn btn-ghost btn-block" id="back-to-result-btn">${t("Quay lại kết quả")}</button>
      </div>
    `;
  }

  // ====== Bước 5 phụ: "Xem bài tham khảo" (mức Trung bình) — bài AI viết MỚI HOÀN TOÀN cho
  // cùng đề bài, KHÔNG dựa nội dung học viên đã viết. 1 khối duy nhất, KHÔNG có 2 tab như Bài
  // viết hoàn chỉnh (khác mục đích: cho thấy "nên viết từ đầu ra sao", không phải nâng cấp bài
  // đã có). ======
  function renderReferenceStep() {
    const g = state.grading;
    return `
      <div class="card writing-card">
        <p class="writing-clean-text">${escapeHtml(g.reference_essay.text)}</p>
      </div>
      <div id="save-reference-slot"></div>
      <div class="director-card-actions">
        <button type="button" class="btn btn-ghost btn-block" id="save-reference-btn" ${state.savedReference ? "disabled" : ""}>${icon("bookmark", { size: 16 })} ${state.savedReference ? t("Đã lưu bài tham khảo") : t("Lưu bài tham khảo")}</button>
        <button type="button" class="btn btn-ghost btn-block" id="back-to-detail-from-reference-btn">${t("Quay lại chi tiết")}</button>
      </div>
    `;
  }

  function wireReferenceStep() {
    mount.querySelector("#save-reference-btn").addEventListener("click", async () => {
      await saveFavorite({
        kind: "complete",
        variant: "reference_essay",
        content: { text: state.grading.reference_essay.text },
        slotSelector: "#save-reference-slot",
        markSaved: () => (state.savedReference = true),
      });
    });
    mount.querySelector("#back-to-detail-from-reference-btn").addEventListener("click", () => {
      state.step = "detail";
      render();
    });
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

  // ====== Bước 5 phụ: "Xem bài viết hoàn chỉnh" — 2 tab Nội dung / Từ vựng+Ngữ pháp (Việc 2,
  // 2026-07-27). Bài mẫu chuyên nghiệp AI viết lại dựa ĐÚNG ý người học đã viết, không phải
  // bản đối chiếu lỗi như Bước 5 chính — hiển thị SẠCH, không ký hiệu đánh dấu gì. ======
  function renderCleanStep() {
    const c = state.grading.clean_rewrite;
    return `
      ${state.cleanCoverImage ? `<img class="writing-clean-cover" src="${escapeHtml(state.cleanCoverImage)}" alt="" />` : ""}
      ${state.cleanTab === "content" && isTTSSupported() ? renderAudioPlayerHtml() : ""}
      <div class="tabs" id="clean-tabs">
        <button type="button" class="tab-btn ${state.cleanTab === "content" ? "active" : ""}" data-tab="content">${t("Nội dung")}</button>
        <button type="button" class="tab-btn ${state.cleanTab === "vocab-grammar" ? "active" : ""}" data-tab="vocab-grammar">${t("Từ vựng &amp; Ngữ pháp")}</button>
      </div>
      <div class="card writing-card" id="clean-panel">${renderCleanPanel()}</div>
      <div id="save-clean-slot"></div>
      <div class="director-card-actions">
        <button type="button" class="btn btn-ghost btn-block" id="save-clean-btn" ${state.savedClean ? "disabled" : ""}>${icon("bookmark", { size: 16 })} ${state.savedClean ? t("Đã lưu bài hoàn chỉnh") : t("Lưu bài hoàn chỉnh")}</button>
        <button type="button" class="btn btn-ghost btn-block" id="back-to-detail-btn">${t("Quay lại chi tiết")}</button>
      </div>
    `;
  }

  function renderCleanPanel() {
    const c = state.grading.clean_rewrite;
    if (state.cleanTab === "content") {
      return `<p class="writing-clean-text">${escapeHtml(c.text)}</p>`;
    }
    const vocabHtml = c.vocab.length
      ? `<ul class="writing-suggestion-list">${c.vocab.map((v) => `<li><strong>${escapeHtml(v.word)}</strong>${v.meaning ? ` — ${escapeHtml(v.meaning)}` : ""}</li>`).join("")}</ul>`
      : `<p class="muted">${state.industry ? t("Bài mẫu không nổi bật từ chuyên ngành nào riêng.") : t("Không chọn lĩnh vực nên không có từ chuyên ngành để gợi ý.")}</p>`;
    const patternsHtml = c.patterns.length
      ? c.patterns
          .map(
            (p) => `
        <div class="writing-pattern-row">
          <div class="writing-pattern-structure">${escapeHtml(p.structure)}</div>
          <p class="writing-pattern-example">“${escapeHtml(p.example)}”</p>
          <p class="writing-pattern-note muted">${escapeHtml(p.note || "")}</p>
        </div>
      `
          )
          .join("")
      : `<p class="muted">${t("Bài mẫu không có cấu trúc nào nổi bật hơn hẳn cách viết gốc của bạn.")}</p>`;
    return `
      <div class="writing-section-title">${t("Từ vựng chuyên ngành đã dùng")}</div>
      ${vocabHtml}
      <div class="writing-section-title writing-section-title-spaced">${t("Cấu trúc đáng chú ý")}</div>
      ${patternsHtml}
    `;
  }

  // ====== Item 6: nút Play/Pause + dải tiến trình cho "Bài viết hoàn chỉnh" ======
  const WORDS_PER_SECOND = 2.3; // khớp WORDS_PER_SECOND_AT_RATE_1 trong tts.js — dùng lại đúng hằng số ước lượng, không tự bịa số khác.

  function renderAudioPlayerHtml() {
    const playing = ttsPlayer?.getState().playing || false;
    return `
      <div class="audio-player" id="clean-audio-player">
        <button type="button" class="audio-play-btn" id="clean-audio-playpause" aria-label="${playing ? t("Tạm dừng") : t("Phát")}">
          ${icon(playing ? "pause" : "play", { size: 18 })}
        </button>
        <div class="clean-audio-track" id="clean-audio-track">
          <div class="clean-audio-fill" id="clean-audio-fill" style="width:${audioTotalSec ? (audioElapsedSec / audioTotalSec) * 100 : 0}%"></div>
          <div class="clean-audio-handle" id="clean-audio-handle" style="left:${audioTotalSec ? (audioElapsedSec / audioTotalSec) * 100 : 0}%"></div>
        </div>
        <span class="clean-audio-time muted" id="clean-audio-time">${formatAudioTime(audioElapsedSec)}/${formatAudioTime(audioTotalSec)}</span>
      </div>
    `;
  }

  function formatAudioTime(sec) {
    const s = Math.max(0, Math.round(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  // TẤT CẢ việc cập nhật audioElapsedSec/audioPlayStartedAt/timer/UI khi trạng thái phát đổi
  // GOM VỀ 1 CHỖ DUY NHẤT (onStateChange) — tránh 2 nơi tự tính lệch nhau. Phân biệt "phát xong
  // hết" với "tạm dừng giữa chừng" bằng THỜI GIAN ƯỚC LƯỢNG đã trôi qua so với tổng thời lượng
  // ước lượng (KHÔNG dùng itemIndex/wordOffset của tts.js để suy luận — với danh sách 1 phần tử
  // duy nhất, itemIndex luôn là 0 và wordOffset không tự cập nhật liên tục trong lúc đọc, nên
  // "wordOffset===0" KHÔNG phân biệt được pause sớm với đọc xong — lỗi thật phát hiện khi tự
  // rà lại logic trước khi triển khai).
  function ensureAudioPlayer() {
    if (ttsPlayer) return;
    const text = state.grading?.clean_rewrite?.text || "";
    const totalWords = text.split(/\s+/).filter(Boolean).length;
    audioTotalSec = totalWords / WORDS_PER_SECOND;
    audioElapsedSec = 0;
    audioPlayStartedAt = null;
    ttsPlayer = createPlayer({
      onStateChange: (s) => {
        const btn = mount.querySelector("#clean-audio-playpause");
        if (btn) btn.innerHTML = icon(s.playing ? "pause" : "play", { size: 18 });
        if (s.playing) {
          audioPlayStartedAt = Date.now();
          startAudioProgressTimer();
          return;
        }
        stopAudioProgressTimer();
        updateCurrentElapsed();
        audioPlayStartedAt = null;
        // Ước lượng đã trôi gần/hết tổng thời lượng -> coi như phát xong hết, về đầu để bấm
        // Play lại là nghe từ đầu. CÒN THIẾU nhiều so với tổng -> chỉ là tạm dừng, giữ nguyên vị
        // trí (KHÔNG reset về 0).
        if (audioElapsedSec >= audioTotalSec - 1) audioElapsedSec = 0;
        updateAudioProgressUI();
      },
    });
    ttsPlayer.load([{ text }], 0);
  }

  function updateCurrentElapsed() {
    if (audioPlayStartedAt) {
      audioElapsedSec = Math.min(audioTotalSec, audioElapsedSec + (Date.now() - audioPlayStartedAt) / 1000);
      audioPlayStartedAt = Date.now();
    }
  }

  function updateAudioProgressUI() {
    const fill = mount.querySelector("#clean-audio-fill");
    const handle = mount.querySelector("#clean-audio-handle");
    const time = mount.querySelector("#clean-audio-time");
    const pct = audioTotalSec ? (audioElapsedSec / audioTotalSec) * 100 : 0;
    if (fill) fill.style.width = `${pct}%`;
    if (handle) handle.style.left = `${pct}%`;
    if (time) time.textContent = `${formatAudioTime(audioElapsedSec)}/${formatAudioTime(audioTotalSec)}`;
  }

  function startAudioProgressTimer() {
    stopAudioProgressTimer();
    audioProgressTimer = setInterval(() => {
      updateCurrentElapsed();
      updateAudioProgressUI();
    }, 250);
  }

  function stopAudioProgressTimer() {
    if (audioProgressTimer) clearInterval(audioProgressTimer);
    audioProgressTimer = null;
  }

  // onStateChange (đăng ký ở ensureAudioPlayer) lo hết phần cập nhật elapsed/timer/UI khi
  // playing đổi — hàm này chỉ cần gọi playPause(), không tự tính toán gì thêm (tránh 2 nơi tự
  // suy ra cùng 1 trạng thái rồi lệch nhau).
  function toggleAudioPlayPause() {
    ensureAudioPlayer();
    ttsPlayer.playPause();
  }

  // Tua bằng CÁCH DUY NHẤT tts.js hỗ trợ (skip(giây lệch), xem ghi chú "GIỚI HẠN THẬT" đầu
  // tts.js) — tính lệch giữa vị trí hiện tại (ước lượng) và vị trí muốn tới, không phát minh cơ
  // chế seek mới trong tts.js.
  function seekAudioToFraction(fraction) {
    ensureAudioPlayer();
    updateCurrentElapsed();
    const targetSec = Math.max(0, Math.min(audioTotalSec, fraction * audioTotalSec));
    const deltaSec = targetSec - audioElapsedSec;
    ttsPlayer.skip(deltaSec);
    audioElapsedSec = targetSec;
    audioPlayStartedAt = ttsPlayer.getState().playing ? Date.now() : null;
    updateAudioProgressUI();
  }

  // 2 listener gắn ở "window" (không phải ở #clean-audio-handle) vì cần bắt được pointermove/up
  // NGAY CẢ khi con trỏ trượt ra ngoài track lúc kéo — nhưng "window" KHÔNG bị dọn tự động khi
  // #clean-audio-player bị thay DOM (render() dựng lại toàn bộ HTML mỗi lần đổi bước) — PHẢI tự
  // gỡ listener CŨ trước khi gắn listener MỚI mỗi lần wireAudioPlayer() chạy lại, nếu không rò
  // rỉ thêm 1 cặp listener mỗi lần người dùng mở lại màn "Bài viết hoàn chỉnh".
  let audioDragMoveHandler = null;
  let audioDragUpHandler = null;

  function wireAudioPlayer() {
    const player = mount.querySelector("#clean-audio-player");
    if (audioDragMoveHandler) window.removeEventListener("pointermove", audioDragMoveHandler);
    if (audioDragUpHandler) window.removeEventListener("pointerup", audioDragUpHandler);
    audioDragMoveHandler = null;
    audioDragUpHandler = null;
    if (!player) return;
    mount.querySelector("#clean-audio-playpause").addEventListener("click", toggleAudioPlayPause);
    const track = mount.querySelector("#clean-audio-track");
    const fractionFromEvent = (e) => {
      const rect = track.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };
    track.addEventListener("click", (e) => seekAudioToFraction(fractionFromEvent(e)));
    const handle = mount.querySelector("#clean-audio-handle");
    let dragging = false;
    handle.addEventListener("pointerdown", (e) => {
      dragging = true;
      e.preventDefault();
    });
    audioDragMoveHandler = (e) => {
      if (!dragging) return;
      const pct = fractionFromEvent(e) * 100;
      handle.style.left = `${pct}%`;
      mount.querySelector("#clean-audio-fill").style.width = `${pct}%`; // hiển thị mượt trong lúc kéo, chưa thật sự tua tới khi thả tay
    };
    audioDragUpHandler = (e) => {
      if (!dragging) return;
      dragging = false;
      seekAudioToFraction(fractionFromEvent(e));
    };
    window.addEventListener("pointermove", audioDragMoveHandler);
    window.addEventListener("pointerup", audioDragUpHandler);
  }

  function stopAudioIfAny() {
    if (audioDragMoveHandler) window.removeEventListener("pointermove", audioDragMoveHandler);
    if (audioDragUpHandler) window.removeEventListener("pointerup", audioDragUpHandler);
    audioDragMoveHandler = null;
    audioDragUpHandler = null;
    if (!ttsPlayer) return;
    ttsPlayer.stop();
    stopAudioProgressTimer();
    audioPlayStartedAt = null;
  }

  // ====== wiring ======
  function wire() {
    wireAppHeader(mount);
    wireBackLink(mount, () => {
      if (state.step === "task") {
        state.step = "genre";
        render();
      } else if (state.step === "write") {
        state.step = "task";
        render();
      } else if (state.step === "detail") {
        state.step = "result";
        render();
      } else if (state.step === "clean" || state.step === "reference") {
        stopAudioIfAny();
        state.step = "detail";
        render();
      } else {
        // 2026-08-04 (Minh bắt lỗi thật: "back từ Luyện Viết đáng lẽ về Home lại nhảy vào Bài
        // học") — "/lessons" không còn là màn chính sau đăng nhập nữa, Home mới giữ vai trò đó.
        navigate("/home");
      }
    });

    if (state.step === "genre") wireGenreStep();
    else if (state.step === "task") wireTaskStep();
    else if (state.step === "write") wireWriteStep();
    else if (state.step === "result") wireResultStep();
    else if (state.step === "detail") wireDetailStep();
    else if (state.step === "clean") wireCleanStep();
    else wireReferenceStep();
  }

  // GỘP chọn thể loại + cấp độ + lĩnh vực (2026-08-04 lần 2) — 1 hàm wire duy nhất cho cả màn.
  function wireGenreStep() {
    mount.querySelectorAll(".genre-row").forEach((row) => {
      row.addEventListener("click", () => {
        state.genre = row.dataset.genre;
        render();
      });
    });
    mount.querySelectorAll(".level-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.level = chip.dataset.level;
        render();
      });
    });
    // "#genre-continue-btn" CHƯA tồn tại lúc state.genres === null (renderGenreStep() chỉ vẽ
    // "Đang tải...", chưa có nút) — optional chaining tránh crash trong khoảng chờ đó.
    mount.querySelector("#genre-continue-btn")?.addEventListener("click", () => {
      if (!state.genre) return;
      requestTask();
    });
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
      wc.textContent = `${countWords(state.text)} ${t("từ")} · ${t("Mục tiêu")}: ${state.targetWordsMin}-${state.targetWordsMax} ${t("từ")}`;
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
    // SỬA 2026-08-09 (Đợt 4, mục 10 — Minh: "Hoàn tất nhảy về Home, mất bài vừa chấm") — về đúng
    // Lưu trữ (nơi xem lại được bài vừa chấm nếu đã lưu) thay vì Home (không liên quan gì tới
    // bài vừa làm).
    mount.querySelector("#finish-writing-btn").addEventListener("click", () => navigate("/writing-archive"));
  }

  function wireDetailStep() {
    mount.querySelector("#save-detailed-btn").addEventListener("click", async () => {
      const g = state.grading;
      await saveFavorite({
        kind: "detailed",
        content: { criteria: g.criteria, strengths: g.strengths, segments: g.segments, notices: g.notices },
        slotSelector: "#save-detailed-slot",
        markSaved: () => (state.savedDetailed = true),
      });
    });
    mount.querySelector("#view-clean-btn")?.addEventListener("click", () => {
      state.cleanTab = "content";
      state.step = "clean";
      render();
      fetchCleanCoverImage(); // tải LƯỜI, không chặn chuyển màn (giống fetchAndSaveLessonCover ở lessonApi.js) — chỉ khi mở "Bài viết hoàn chỉnh", KHÔNG áp dụng cho Bài tham khảo.
    });
    mount.querySelector("#view-reference-btn")?.addEventListener("click", () => {
      state.step = "reference";
      render();
    });
    mount.querySelector("#back-to-result-btn").addEventListener("click", () => {
      state.step = "result";
      render();
    });
  }

  function wireCleanStep() {
    wireAudioPlayer(); // chỉ tồn tại khi cleanTab==="content" && isTTSSupported(), xem renderCleanStep()
    mount.querySelectorAll("#clean-tabs .tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.cleanTab = btn.dataset.tab;
        mount.querySelectorAll("#clean-tabs .tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
        mount.querySelector("#clean-panel").innerHTML = renderCleanPanel();
        // Đổi tab KHÔNG render() lại toàn Bước (giữ nguyên #clean-audio-player DOM ngoài
        // #clean-panel, đúng chỗ nó đứng) — chỉ ẩn/hiện + tạm dừng phát khi rời tab "Nội dung"
        // (nghe tiếp trong lúc xem tab khác dễ gây hiểu lầm "đang đọc phần nào").
        const player = mount.querySelector("#clean-audio-player");
        if (player) {
          if (state.cleanTab !== "content") {
            if (ttsPlayer?.getState().playing) toggleAudioPlayPause();
            player.hidden = true;
          } else {
            player.hidden = false;
          }
        }
      });
    });
    mount.querySelector("#save-clean-btn").addEventListener("click", async () => {
      const c = state.grading.clean_rewrite;
      await saveFavorite({
        kind: "complete",
        variant: "clean_rewrite",
        content: { text: c.text, vocab: c.vocab, patterns: c.patterns, cover_image_url: state.cleanCoverImage || null },
        slotSelector: "#save-clean-slot",
        markSaved: () => (state.savedClean = true),
      });
    });
    mount.querySelector("#back-to-detail-btn").addEventListener("click", () => {
      stopAudioIfAny();
      state.step = "detail";
      render();
    });
  }

  // Dùng chung cho cả 3 nút lưu (Bước 5 / Bài hoàn chỉnh / Bài tham khảo) — chỉ khác "kind"/
  // "variant"/"content" truyền vào, phần gọi API + phản hồi UI giống hệt nhau.
  async function saveFavorite({ kind, variant, content, slotSelector, markSaved }) {
    const slot = mount.querySelector(slotSelector);
    const res = await saveWritingFavorite({
      kind,
      variant,
      level: state.level,
      industry: state.industry,
      task: state.task,
      overallScore: state.grading.overall_score,
      content,
      goalId: state.goalId,
    });
    if (!res.ok) {
      if (slot) slot.innerHTML = `<p class="field-hint field-hint-error">${escapeHtml(res.error || t("Lưu thất bại, vui lòng thử lại."))}</p>`;
      return;
    }
    // SỬA 2026-08-09 (Đợt 4, mục 10 — Minh: "bỏ chớp Đã lưu thừa"): bỏ toast, GIỮ đổi label nút
    // (markSaved() + render()) — 1 tín hiệu rõ ràng, thường trực là đủ, 2 tín hiệu cho cùng 1
    // hành động là dư.
    markSaved();
    render();
  }

  // Item 3 (2026-07-27) — ảnh minh hoạ cho "Bài viết hoàn chỉnh", tái dùng ĐÚNG pipeline ảnh
  // miễn phí có sẵn (Wikimedia/Unsplash/Pexels, action "search_lesson_cover_image" đã dùng cho
  // ảnh bìa bài học) — KHÔNG thêm action/lượt gọi AI sinh ảnh riêng nào. Không chặn UI (giống
  // fetchAndSaveLessonCover ở lessonApi.js): gọi RỜI sau khi màn "Bài viết hoàn chỉnh" đã hiện,
  // không tìm được ảnh thì đơn giản là không có ảnh, không báo lỗi.
  async function fetchCleanCoverImage() {
    if (state.cleanCoverImage || !state.task) return; // đã có ảnh (hoặc đã thử) -> không gọi lại
    try {
      const res = await callChatAction("search_lesson_cover_image", { title: state.task.topic_en, content_type: "reading" });
      if (!res.ok) return;
      const { image } = JSON.parse(res.content);
      // 2026-08-14 — search_lesson_cover_image đổi trả về 2 cỡ (thumbUrl/detailUrl) thay vì 1
      // "url" duy nhất (xem api/_generate/coverImage.js) vì bài học giờ tự tải-lưu ảnh vào kho
      // riêng của app. Ảnh minh hoạ ở đây KHÔNG qua set_lesson_cover_image (không phải "lesson",
      // không cần lưu bền) nên vẫn dùng thẳng link ngoài như trước, chỉ đổi tên field đọc.
      if (!image?.detailUrl) return;
      state.cleanCoverImage = image.detailUrl;
      if (state.step === "clean") render();
    } catch {
      // Im lặng — tính năng "cố gắng tốt nhất", không có ảnh thì thôi, không chặn trải nghiệm chính.
    }
  }

  // ====== gọi API ======
  async function requestTask() {
    const resultSlot = mount.querySelector(state.step === "genre" ? "#genre-result-slot" : "#task-result-slot");
    const submitBtns = mount.querySelectorAll("#genre-continue-btn, #task-reroll-btn, #task-start-btn");
    submitBtns.forEach((b) => b && (b.disabled = true));
    resultSlot.innerHTML = `<div class="result-panel result-pending"><div class="spinner spinner-sm"></div> ${t("AI đang chọn nhiệm vụ...")}</div>`;

    const res = await generateWritingTask(state.level, state.industry, state.genre);
    submitBtns.forEach((b) => b && (b.disabled = false));
    if (!res.ok) {
      resultSlot.innerHTML = `<div class="result-panel result-error">${escapeHtml(res.error || t("Có lỗi xảy ra, vui lòng thử lại."))}</div>`;
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
      resultSlot.innerHTML = `<div class="result-panel result-error">${t("Bài viết quá ngắn (tối thiểu 10 từ).")}</div>`;
      return;
    }
    const btn = mount.querySelector("#submit-writing-btn");
    btn.disabled = true;
    resultSlot.innerHTML = `<div class="result-panel result-pending"><div class="spinner spinner-sm"></div> ${t("AI đang chấm bài viết...")}</div>`;

    const res = await gradeWriting({ level: state.level, industry: state.industry, task: state.task, text: state.text });
    btn.disabled = false;
    if (!res.ok) {
      resultSlot.innerHTML = `<div class="result-panel result-error">${escapeHtml(res.error || t("Có lỗi xảy ra, vui lòng thử lại."))}</div>`;
      return;
    }
    state.grading = res.data;
    state.savedDetailed = false;
    state.savedClean = false;
    state.savedReference = false;
    state.cleanCoverImage = null;
    state.step = "result";
    render();
  }

  // router.js gọi hàm trả về này (nếu có) TRƯỚC khi vẽ màn kế tiếp — dừng phát nếu người dùng
  // rời khỏi /writing hẳn trong lúc "Bài viết hoàn chỉnh" đang đọc to, tránh giọng đọc "ma" tiếp
  // tục chạy nền không còn control nào để tắt.
  return stopAudioIfAny;
}
