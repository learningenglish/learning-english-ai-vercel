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
import { navigate } from "../router.js";
import { createLessonFromText, fetchAndSaveLessonCover } from "../lessonApi.js";
import { escapeHtml, countWords } from "../utils.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats, wireBackLink } from "../header.js";

export function renderCreateFromText(mount) {
  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(`Văn bản`, {}, { showBack: true, archivePath: "/analysis-archive" })}

      <label class="field">
        <span class="field-question">Dán văn bản của bạn</span>
        <textarea id="paste-text-input" rows="10" placeholder="Dán văn bản tiếng Anh vào đây..."></textarea>
      </label>
      <p class="field-hint" id="paste-wordcount">0 từ (tối thiểu 20, tối đa 600)</p>
      <div id="paste-result-slot"></div>
      <button type="button" class="btn btn-primary btn-block" id="paste-submit-btn">Phân tích</button>
    </div>
  `;

  // 2026-08-04 (Minh bắt lỗi thật) — "/lessons" không còn là màn chính sau đăng nhập, Home mới
  // giữ vai trò đó, back từ đây phải về Home.
  wireBackLink(mount, () => navigate("/home"));
  wireAppHeader(mount);
  loadAppHeaderStats(mount);

  // Mốc 600 từ (2026-07-28, chốt với Minh — thay 3000 cũ) — chặn NGAY ở UI trước khi gửi AI:
  // nút "Phân tích" tự vô hiệu hoá khi ngoài khoảng, không phải chỉ báo lỗi SAU khi bấm.
  const MAX_WORDS = 600;
  const textarea = mount.querySelector("#paste-text-input");
  const wc = mount.querySelector("#paste-wordcount");
  const submitBtn = mount.querySelector("#paste-submit-btn");
  textarea.addEventListener("input", () => {
    const n = countWords(textarea.value);
    const outOfRange = n < 20 || n > MAX_WORDS;
    wc.textContent = `${n} từ` + (n < 20 ? " (tối thiểu 20 từ)" : n > MAX_WORDS ? ` (tối đa ${MAX_WORDS} từ, chia nhỏ ra)` : "");
    wc.classList.toggle("field-hint-error", outOfRange);
    submitBtn.disabled = outOfRange;
  });
  submitBtn.disabled = true; // rỗng lúc đầu (0 từ) -> dưới ngưỡng tối thiểu, khoá sẵn cho khớp

  mount.querySelector("#paste-submit-btn").addEventListener("click", async () => {
    const text = textarea.value;
    const n = countWords(text);
    const resultSlot = mount.querySelector("#paste-result-slot");
    if (n < 20) {
      resultSlot.innerHTML = `<div class="result-panel result-error">Văn bản quá ngắn (tối thiểu 20 từ).</div>`;
      return;
    }
    if (n > MAX_WORDS) {
      resultSlot.innerHTML = `<div class="result-panel result-error">Văn bản quá dài (tối đa ${MAX_WORDS} từ), vui lòng chia nhỏ.</div>`;
      return;
    }
    const btn = mount.querySelector("#paste-submit-btn");
    btn.disabled = true;
    resultSlot.innerHTML = `<div class="result-panel result-pending"><div class="spinner spinner-sm"></div> Đang phân tích...</div>`;
    const res = await createLessonFromText(text);
    btn.disabled = false;
    if (!res.ok) {
      resultSlot.innerHTML = `<div class="result-panel result-error">${escapeHtml(res.error || "Có lỗi xảy ra.")}</div>`;
      return;
    }
    const lesson = res.data.lesson;
    fetchAndSaveLessonCover(lesson);
    btn.hidden = true;
    resultSlot.innerHTML = `
      <div class="result-panel result-success">
        <div class="result-title">Đã phân tích xong</div>
        <p>Cấp độ văn bản: <span class="level-pill">${escapeHtml(lesson.level)}</span></p>
      </div>
      <button type="button" class="btn btn-primary btn-block" id="paste-view-lesson-btn">Xem bài học</button>
    `;
    mount.querySelector("#paste-view-lesson-btn").addEventListener("click", () => navigate(`/lesson/${lesson.id}`));
  });
}
