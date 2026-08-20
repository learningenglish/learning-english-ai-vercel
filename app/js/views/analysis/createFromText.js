// app/js/views/createFromText.js — màn "Văn bản" (lối tạo bài học nhanh #1 ở màn Bài học),
// TÁCH RA từ luồng "Tôi có văn bản" trong views/mentorGoal.js (Mentor AI đã tắt UI 2026-07-23,
// route /mentor-goal không còn đăng ký nên tính năng này bị mồ côi — không ai gọi tới nữa dù
// backend analyze_user_text vẫn hoạt động bình thường).
//
// SỬA 2026-07-27 (Phần B, "AI tự phân loại trình độ"): BỎ HẲN control chọn cấp độ A1-C1 — AI tự
// đọc văn bản và tự xác định level (xem api/_generate/lesson.js::ANALYZE_TEXT_SYSTEM_PROMPT mục
// "TỰ PHÂN LOẠI CẤP ĐỘ"), dùng thẳng làm căn cứ duy nhất cho từ vựng/giải thích/bài tập — không
// còn "cấp độ người học khai báo" để so sánh, nên bỏ luôn cơ chế level_warning cũ. Sau khi phân
// tích xong, hiện RÕ badge cấp độ đã xác định NGAY tại đây (không đợi sang màn Bài học chi tiết
// — màn đó thuộc Phase B-H đang khoá, không đụng) trước khi cho vào xem bài.
import { navigate } from "../../router.js";
import { createLessonFromText, fetchAndSaveLessonCover, analyzeLessonPhraseGroups, analyzeLessonReadingChunks } from "../../lessonApi.js";
import { getActiveLearningGoal } from "../../db.js";
import { escapeHtml, countWords } from "../../utils.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats, wireBackLink } from "../../header.js";
import { icon } from "../../icons.js";
import { t, registerTranslations } from "../../i18n.js";

registerTranslations({
  "Văn bản": "Text",
  "Dán văn bản của bạn": "Paste your text",
  "Dán văn bản tiếng Anh vào đây...": "Paste English text here...",
  "0 từ (tối thiểu 20, tối đa 600)": "0 words (min 20, max 600)",
  "Phân tích": "Analyze",
  "từ": "words",
  "tối thiểu 20 từ": "minimum 20 words",
  "tối đa": "maximum",
  "từ, chia nhỏ ra": "words, please split it up",
  "Văn bản quá ngắn (tối thiểu 20 từ).": "Text too short (minimum 20 words).",
  "Văn bản quá dài (tối đa": "Text too long (maximum",
  "từ), vui lòng chia nhỏ.": "words), please split it into smaller parts.",
  "Đang phân tích...": "Analyzing...",
  "Đang phân tích cụm từ...": "Analyzing phrase groups...",
  "Đang tải ảnh bìa...": "Loading cover image...",
  "Đã phân tích xong": "Analysis complete",
  "Cấp độ văn bản:": "Text level:",
  "Xem bài học": "View lesson",
  "Có lỗi xảy ra.": "Something went wrong.",
  "Bạn đã hết Credit tháng này. Nâng cấp gói để dùng tiếp.": "You're out of credits this month. Upgrade your plan to keep using this.",
  "Nâng cấp gói": "Upgrade plan",
});

export function renderCreateFromText(mount) {
  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(`${t("Văn bản")} <span class="beta-badge">Beta</span>`, undefined, { showBack: true, archivePath: "/analysis-archive", showCreditCounter: true })}

      <label class="field">
        <span class="field-question">${t("Dán văn bản của bạn")}</span>
        <textarea id="paste-text-input" rows="10" placeholder="${t("Dán văn bản tiếng Anh vào đây...")}"></textarea>
      </label>
      <p class="field-hint" id="paste-wordcount">${t("0 từ (tối thiểu 20, tối đa 600)")}</p>
      <div id="paste-result-slot"></div>
      <button type="button" class="btn btn-primary btn-block" id="paste-submit-btn">${t("Phân tích")}</button>
    </div>
  `;

  // 2026-08-04 (Minh bắt lỗi thật) — "/lessons" không còn là màn chính sau đăng nhập, Home mới
  // giữ vai trò đó, back từ đây phải về Home.
  wireBackLink(mount, () => navigate("/home"));
  wireAppHeader(mount);
  // "creditLocked" (2026-08-20, Minh: "nếu hết khóa và hiển thị icon khóa") — TÁCH RIÊNG khỏi
  // "outOfRange" (độ dài văn bản) trong listener "input" bên dưới, cả 2 điều kiện CÙNG quyết định
  // nút có bấm được hay không — thiếu 1 trong 2 đều phải khoá.
  let creditLocked = false;
  loadAppHeaderStats(mount, { showCreditCounter: true }).then((r) => {
    if (r && r.balance <= 0) {
      creditLocked = true;
      submitBtn.disabled = true;
      mount.querySelector("#paste-result-slot").innerHTML =
        `<div class="result-panel result-error">${icon("lock", { size: 16 })} ${t("Bạn đã hết Credit tháng này. Nâng cấp gói để dùng tiếp.")} <button type="button" class="btn-link" id="paste-upgrade-link">${t("Nâng cấp gói")}</button></div>`;
      mount.querySelector("#paste-upgrade-link")?.addEventListener("click", () => navigate("/packages"));
    }
  });

  // Mốc 600 từ (2026-07-28, chốt với Minh — thay 3000 cũ) — chặn NGAY ở UI trước khi gửi AI:
  // nút "Phân tích" tự vô hiệu hoá khi ngoài khoảng, không phải chỉ báo lỗi SAU khi bấm.
  const MAX_WORDS = 600;
  const textarea = mount.querySelector("#paste-text-input");
  const wc = mount.querySelector("#paste-wordcount");
  const submitBtn = mount.querySelector("#paste-submit-btn");
  textarea.addEventListener("input", () => {
    const n = countWords(textarea.value);
    const outOfRange = n < 20 || n > MAX_WORDS;
    wc.textContent =
      `${n} ${t("từ")}` +
      (n < 20 ? ` (${t("tối thiểu 20 từ")})` : n > MAX_WORDS ? ` (${t("tối đa")} ${MAX_WORDS} ${t("từ, chia nhỏ ra")})` : "");
    wc.classList.toggle("field-hint-error", outOfRange);
    submitBtn.disabled = outOfRange || creditLocked;
  });
  submitBtn.disabled = true; // rỗng lúc đầu (0 từ) -> dưới ngưỡng tối thiểu, khoá sẵn cho khớp

  mount.querySelector("#paste-submit-btn").addEventListener("click", async () => {
    const text = textarea.value;
    const n = countWords(text);
    const resultSlot = mount.querySelector("#paste-result-slot");
    if (n < 20) {
      resultSlot.innerHTML = `<div class="result-panel result-error">${t("Văn bản quá ngắn (tối thiểu 20 từ).")}</div>`;
      return;
    }
    if (n > MAX_WORDS) {
      resultSlot.innerHTML = `<div class="result-panel result-error">${t("Văn bản quá dài (tối đa")} ${MAX_WORDS} ${t("từ), vui lòng chia nhỏ.")}</div>`;
      return;
    }
    const btn = mount.querySelector("#paste-submit-btn");
    btn.disabled = true;
    resultSlot.innerHTML = `<div class="result-panel result-pending"><div class="spinner spinner-sm"></div> ${t("Đang phân tích...")}</div>`;
    // "goal_id" (2026-08-06, tái cấu trúc theo cây mới) — gắn bài phân tích vào đúng Chuyên
    // ngành đang active để hiện đúng nhánh Phân tích của Chuyên ngành đó (xem analysisArchive.js).
    const activeGoal = await getActiveLearningGoal().catch(() => null);
    const res = await createLessonFromText(text, activeGoal?.id);
    btn.disabled = false;
    if (!res.ok) {
      resultSlot.innerHTML = `<div class="result-panel result-error">${escapeHtml(res.error || t("Có lỗi xảy ra."))}</div>`;
      return;
    }
    const lesson = res.data.lesson;
    // Vừa tiêu credit cho lượt phân tích này — làm mới số dư hiện trên header NGAY (không đợi
    // chuyển màn/mount lại), fire-and-forget vì không chặn luồng chính.
    loadAppHeaderStats(mount, { showCreditCounter: true });
    // Phân tích cụm từ + tách câu PHẢI XONG TRƯỚC khi hiện bài (2026-08-11, cùng lý do ở
    // createLesson.js — Minh: "AI làm trước hoàn chỉnh... không còn phù hợp việc click vào mới
    // tra từ"). Best-effort: lỗi tạm thời không chặn hẳn việc xem bài, chỉ log lại.
    resultSlot.innerHTML = `<div class="result-panel result-pending"><div class="spinner spinner-sm"></div> ${t("Đang phân tích cụm từ...")}</div>`;
    const phraseRes = await analyzeLessonPhraseGroups(lesson.id, false);
    if (!phraseRes.ok) console.warn("analyzeLessonPhraseGroups lỗi lúc tạo bài:", phraseRes.error);
    const chunksRes = await analyzeLessonReadingChunks(lesson.id, false);
    if (!chunksRes.ok) console.warn("analyzeLessonReadingChunks lỗi lúc tạo bài:", chunksRes.error);
    // KHÔNG còn chờ ảnh bìa (2026-08-13, Minh: "gọi hình ảnh tốn phí và lâu, bỏ qua bước đó để
    // không tốn thời gian người dùng — cái đó chủ yếu phục vụ nội dung [Thư viện AI dùng chung],
    // không cần thiết cho Phân tích cá nhân") — RÚT LẠI quy tắc "chờ ảnh xong mới hiện" từng áp
    // dụng ở đây 2026-08-10 (quy tắc đó vẫn đúng cho createLesson.js/Thư viện AI, nơi ảnh hiện
    // trong carousel/danh sách công khai). "Phân tích" vẫn tự sinh ảnh NGẦM (fire-and-forget,
    // cùng cơ chế lesson.js dùng cho bài thiếu ảnh) để hiện đẹp trong analysisArchive.js về sau,
    // chỉ không CHẶN người dùng chờ nữa.
    fetchAndSaveLessonCover(lesson).catch(() => {});
    btn.hidden = true;
    resultSlot.innerHTML = `
      <div class="result-panel result-success">
        <div class="result-title">${t("Đã phân tích xong")}</div>
        <p>${t("Cấp độ văn bản:")} <span class="level-pill">${escapeHtml(lesson.level)}</span></p>
      </div>
      <button type="button" class="btn btn-primary btn-block" id="paste-view-lesson-btn">${t("Xem bài học")}</button>
    `;
    mount.querySelector("#paste-view-lesson-btn").addEventListener("click", () => navigate(`/lesson/${lesson.id}`));
  });
}
