// app/js/views/home.js
import { navigate } from "../router.js";
import { getContinueLearning } from "../db.js";
import { escapeHtml } from "../utils.js";

export function renderHome(mount) {
  mount.innerHTML = `
    <div class="screen">
      <section class="hero-greeting">
        <h1>Xin chào 👋</h1>
        <div class="stat-row">
          <div class="stat-pill">🔥 Streak: <strong>--</strong></div>
          <div class="stat-pill">⭐ XP: <strong>--</strong></div>
        </div>
      </section>

      <section id="continue-card-slot"></section>

      <section class="entry-grid">
        <button type="button" class="entry-card" id="entry-ai">
          <span class="entry-icon">✨</span>
          <span class="entry-title">AI tạo bài học</span>
          <span class="entry-sub muted">Mô tả ý tưởng, AI viết bài cho bạn</span>
        </button>
        <button type="button" class="entry-card" id="entry-text">
          <span class="entry-icon">📋</span>
          <span class="entry-title">Tôi có văn bản</span>
          <span class="entry-sub muted">Dán văn bản có sẵn để phân tích</span>
        </button>
      </section>

      <section class="missions-teaser">
        <h2>Nhiệm vụ hôm nay</h2>
        <p class="muted">Sắp ra mắt</p>
      </section>
    </div>
  `;

  mount.querySelector("#entry-ai").addEventListener("click", () => navigate("/create/ai"));
  mount.querySelector("#entry-text").addEventListener("click", () => navigate("/create/text"));

  loadContinueCard(mount);
}

async function loadContinueCard(mount) {
  const slot = mount.querySelector("#continue-card-slot");
  try {
    const progress = await getContinueLearning();
    if (!progress) return;
    const lesson = progress.lessons;
    slot.innerHTML = `
      <button type="button" class="continue-card" id="continue-btn">
        <div class="continue-label">Tiếp tục học</div>
        <div class="continue-title">${escapeHtml(lesson?.title_vi || lesson?.title || "")}</div>
        <div class="badge">${escapeHtml(lesson?.level || "")}</div>
      </button>
    `;
    slot.querySelector("#continue-btn").addEventListener("click", () => navigate(`/lesson/${progress.lesson_id}`));
  } catch {
    // Chưa có bài nào đang học hoặc lỗi mạng — im lặng bỏ qua, không chặn Trang chủ.
  }
}
