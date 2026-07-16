// app/js/app.js — bootstrap: đăng ký route, auth guard, bottom nav, service worker.
//
// Nav đổi theo ảnh mẫu giao diện app cũ (quyết định của người dùng): Bài học / Yêu thích /
// Tạo bài học (nút nổi giữa) / Lịch sử / Thống kê — thay cho bộ 5 tab ban đầu của brief
// (Trang chủ/Bài học/AI/Nhiệm vụ/Hồ sơ). "Hồ sơ" không còn là tab riêng — vào qua icon
// bánh răng ở góc phải màn "Bài học" (xem views/lessons.js).
import { getSession } from "./session.js";
import { registerRoute, startRouter, navigate } from "./router.js";
import { renderLogin } from "./views/login.js";
import { renderLessons } from "./views/lessons.js";
import { renderCreateLesson } from "./views/createLesson.js";
import { renderLessonDetail } from "./views/lesson.js";
import { renderHistory } from "./views/history.js";
import { renderStats } from "./views/stats.js";
import { renderProfile } from "./views/profile.js";

const NAV_TABS = [
  { path: "/lessons", label: "Bài học", icon: "📖" },
  { path: "/favorites", label: "Yêu thích", icon: "🤍" },
  { path: "/create", label: "Tạo bài học", icon: "➕", fab: true },
  { path: "/history", label: "Lịch sử", icon: "🕐" },
  { path: "/stats", label: "Thống kê", icon: "📊" },
];

registerRoute("/login", renderLogin);
registerRoute("/lessons", renderLessons);
registerRoute("/favorites", (mount) => renderLessons(mount, ["favorite"]));
registerRoute("/create", renderCreateLesson);
registerRoute("/lesson", renderLessonDetail);
registerRoute("/history", renderHistory);
registerRoute("/stats", renderStats);
registerRoute("/profile", renderProfile);

// Bắt buộc đăng nhập cho MỌI route trừ /login (RLS bảo vệ dữ liệu thật, đây chỉ là UX
// điều hướng — không phải lớp bảo mật, đúng luật cứng #7). Mặc định sau đăng nhập ->
// /lessons (không còn màn /home riêng, "Bài học" là màn chính).
function beforeRender(path) {
  const session = getSession();
  if (!session && path !== "/login") {
    location.hash = "/login";
    return false;
  }
  if (session && path === "/login") {
    location.hash = "/lessons";
    return false;
  }
  return true;
}

function afterRender(path) {
  renderBottomNav(path);
}

function renderBottomNav(activePath) {
  const nav = document.getElementById("bottom-nav");
  if (activePath === "/login") {
    nav.hidden = true;
    nav.innerHTML = "";
    return;
  }
  nav.hidden = false;
  // /favorites dùng chung UI với /lessons (chỉ khác filter mặc định) nhưng vẫn phải tô
  // sáng đúng tab "Yêu thích" thay vì "Bài học" khi đang đứng ở đó.
  nav.innerHTML = NAV_TABS.map((tab) => {
    const isActive = activePath === tab.path;
    if (tab.fab) {
      return `<button type="button" class="nav-tab-fab" data-path="${tab.path}" aria-label="${tab.label}">${tab.icon}</button>`;
    }
    return `
      <button type="button" class="nav-tab ${isActive ? "active" : ""}" data-path="${tab.path}">
        <span class="nav-icon">${isActive && tab.path === "/favorites" ? "❤️" : tab.icon}</span>
        <span class="nav-label">${tab.label}</span>
      </button>
    `;
  }).join("");
  nav.querySelectorAll("[data-path]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.path));
  });
}

startRouter({ beforeRender, afterRender });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Cài PWA vẫn hoạt động được không cần service worker (chỉ mất phần cache offline
      // shell) — không chặn app nếu đăng ký thất bại.
    });
  });
}
