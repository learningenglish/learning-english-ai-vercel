// app/js/views/mentorOnboarding.js — màn nghi thức xưng hô (Đợt 3 mục 3.2/3.4 điểm 1), hiện
// ĐÚNG 1 LẦN/user trước khi vào Mentor AI lần đầu. Câu chữ ở đây KHÔNG thuộc kho 1213 dòng đã
// đóng băng (kho chỉ dùng SAU khi đã biết giọng xưng hô) — viết mới, trung tính (luôn xưng "tôi"
// gọi người dùng là "bạn") vì tại đây CHƯA biết người dùng chọn giọng gì.
//
// Đã chốt với Minh (2026-07-21): KHÔNG có nút "để Mentor tự chọn giúp" ở màn này — người dùng
// phải TỰ bấm 1 trong 4 chip. Không bấm gì (điều hướng đi chỗ khác) thì mặc định xưng "bạn"
// (DEFAULT_PRONOUN_STYLE ở backend), không có bước "xác nhận lại bằng lời" vì lựa chọn đã tường
// minh do chính người dùng bấm.
import { getPronounState, markPronounAsked, setPronounStyle } from "../mentorApi.js";
import { escapeHtml } from "../utils.js";

const CHIPS = [
  { style: "toi_anh", label: "Anh" },
  { style: "toi_chi", label: "Chị" },
  { style: "toi_ban", label: "Bạn" },
  { style: "toi_ten", label: "Tên riêng" },
];

// Gọi trước khi vào /mentor hoặc /mentor-goal — nếu chưa từng hiện màn này thì hiện, xong mới
// gọi onDone() để render màn thật. Đã hiện rồi (asked=true, bất kể có chọn hay không) thì bỏ
// qua thẳng, không chặn lần sau.
export async function withPronounOnboarding(mount, onDone) {
  const res = await getPronounState();
  if (res.ok && !res.data.asked) {
    renderMentorOnboarding(mount, res.data.ten, () => onDone(mount));
    return undefined; // router chỉ cần teardown của MÀN THẬT (nếu có), không phải màn onboarding tạm
  }
  return onDone(mount);
}

function renderMentorOnboarding(mount, ten, onDone) {
  markPronounAsked(); // "hỏi đúng 1 lần" = HIỆN đúng 1 lần, không đợi người dùng chọn xong mới đánh dấu.

  const greetName = ten ? escapeHtml(ten) : "bạn";
  mount.innerHTML = `
    <div class="screen">
      <div class="card mentor-onboarding-card">
        <p class="mentor-onboarding-greeting">Chào ${greetName},</p>
        <p>Tôi là Mentor AI — người đồng hành cùng bạn trong suốt quá trình học, không chỉ tạo bài mà còn theo sát tiến độ để gợi ý đúng lúc.</p>
        <p>Tôi nên gọi bạn là gì cho thoải mái?</p>
        <div class="filter-row" id="pronoun-chip-row">
          ${CHIPS.map((c) => `<button type="button" class="filter-chip pronoun-chip" data-style="${c.style}">${c.label}</button>`).join("")}
        </div>
        <div id="pronoun-nickname-panel" hidden>
          <label class="field">
            <span>Tên bạn muốn tôi gọi (để trống thì tôi dùng tên tài khoản)</span>
            <input type="text" id="pronoun-nickname-input" maxlength="50" placeholder="${greetName}" />
          </label>
          <button type="button" class="btn btn-primary btn-block" id="pronoun-nickname-confirm">Xong</button>
        </div>
      </div>
    </div>
  `;

  mount.querySelectorAll(".pronoun-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const style = chip.dataset.style;
      if (style === "toi_ten") {
        mount.querySelector("#pronoun-nickname-panel").hidden = false;
        mount.querySelector("#pronoun-nickname-input").focus();
        return;
      }
      finish(style, null);
    });
  });
  mount.querySelector("#pronoun-nickname-confirm").addEventListener("click", () => {
    const nickname = mount.querySelector("#pronoun-nickname-input").value.trim();
    finish("toi_ten", nickname || null);
  });

  async function finish(style, nickname) {
    mount.querySelectorAll(".pronoun-chip").forEach((b) => (b.disabled = true));
    await setPronounStyle(style, nickname);
    onDone();
  }
}
