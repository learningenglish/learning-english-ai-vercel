// app/js/views/createFromText.js — màn "Văn bản" (lối tạo bài học nhanh #1 ở màn Bài học),
// TÁCH RA từ luồng "Tôi có văn bản" trong views/mentorGoal.js (Mentor AI đã tắt UI 2026-07-23,
// route /mentor-goal không còn đăng ký nên tính năng này bị mồ côi — không ai gọi tới nữa dù
// backend analyze_user_text vẫn hoạt động bình thường). Hành vi giữ NGUYÊN như cũ (20-3000 từ,
// analyze_user_text qua createLessonFromText()) — chỉ đổi vỏ ngoài thành 1 màn riêng có nút
// quay lại, thay vì 1 bước ẩn trong luồng hội thoại nhiều bước.
import { navigate } from "../router.js";
import { createLessonFromText, fetchAndSaveLessonCover } from "../lessonApi.js";
import { escapeHtml, countWords } from "../utils.js";
import { icon } from "../icons.js";
import { appHeaderHtml, wireAppHeader, loadAppHeaderStats, wireBackLink } from "../header.js";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

export function renderCreateFromText(mount) {
  mount.innerHTML = `
    <div class="screen">
      ${appHeaderHtml(`${icon("file-text", { size: 22 })} Phân tích văn bản`, {}, { showBack: true })}

      <label class="field">
        <span class="field-question">Dán văn bản của bạn</span>
        <textarea id="paste-text-input" rows="10" placeholder="Dán văn bản tiếng Anh vào đây..."></textarea>
      </label>
      <p class="field-hint" id="paste-wordcount">0 từ (tối thiểu 20, tối đa 3000)</p>
      <label class="field">
        <span class="field-question">Cấp độ của bạn</span>
        <select id="paste-level">${LEVELS.map((l) => `<option value="${l}">${l}</option>`).join("")}</select>
      </label>
      <div id="paste-result-slot"></div>
      <button type="button" class="btn btn-primary btn-block" id="paste-submit-btn">Phân tích</button>
    </div>
  `;

  wireBackLink(mount, () => navigate("/lessons"));
  wireAppHeader(mount);
  loadAppHeaderStats(mount);

  const textarea = mount.querySelector("#paste-text-input");
  const wc = mount.querySelector("#paste-wordcount");
  textarea.addEventListener("input", () => {
    const n = countWords(textarea.value);
    const outOfRange = n < 20 || n > 3000;
    wc.textContent = `${n} từ` + (n < 20 ? " (tối thiểu 20 từ)" : n > 3000 ? " (tối đa 3000 từ, chia nhỏ ra)" : "");
    wc.classList.toggle("field-hint-error", outOfRange);
  });

  mount.querySelector("#paste-submit-btn").addEventListener("click", async () => {
    const text = textarea.value;
    const n = countWords(text);
    const resultSlot = mount.querySelector("#paste-result-slot");
    if (n < 20) {
      resultSlot.innerHTML = `<div class="result-panel result-error">Văn bản quá ngắn (tối thiểu 20 từ).</div>`;
      return;
    }
    if (n > 3000) {
      resultSlot.innerHTML = `<div class="result-panel result-error">Văn bản quá dài (tối đa 3000 từ), vui lòng chia nhỏ.</div>`;
      return;
    }
    const btn = mount.querySelector("#paste-submit-btn");
    btn.disabled = true;
    resultSlot.innerHTML = `<div class="result-panel result-pending"><div class="spinner spinner-sm"></div> Đang phân tích...</div>`;
    const res = await createLessonFromText(text, mount.querySelector("#paste-level").value);
    btn.disabled = false;
    if (!res.ok) {
      resultSlot.innerHTML = `<div class="result-panel result-error">${escapeHtml(res.error || "Có lỗi xảy ra.")}</div>`;
      return;
    }
    fetchAndSaveLessonCover(res.data.lesson);
    navigate(`/lesson/${res.data.lesson.id}`);
  });
}
