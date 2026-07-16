// app/js/app.js — bootstrap: đăng ký route, auth guard, bottom nav, service worker.
import { getSession } from "./session.js";
import { registerRoute, startRouter, navigate } from "./router.js";
import { renderLogin } from "./views/login.js";
import { renderHome } from "./views/home.js";
import { renderCreateLesson } from "./views/createLesson.js";
import { renderLessons } from "./views/lessons.js";
import { renderLessonDetail } from "./views/lesson.js";
import { renderProfile } from "./views/profile.js";
import { renderComingSoon } from "./views/comingSoon.js";

const NAV_TABS = [
  { path: "/home", label: "Trang chủ", icon: "🏠" },
  { path: "/lessons", label: "Bài học", icon: "📚" },
  { path: "/ai", label: "AI", icon: "✨" },
  { path: "/missions", label: "Nhiệm vụ", icon: "🎯" },
  { path: "/profile", label: "Hồ sơ", icon: "👤" },
];

registerRoute("/login", renderLogin);
registerRoute("/home", renderHome);
registerRoute("/create", renderCreateLesson);
registerRoute("/lessons", renderLessons);
registerRoute("/lesson", renderLessonDetail);
registerRoute("/ai", (mount) => renderComingSoon(mount, "AI"));
registerRoute("/missions", (mount) => renderComingSoon(mount, "Nhiệm vụ"));
registerRoute("/profile", renderProfile);

// Bắt buộc đăng nhập cho MỌI route trừ /login (RLS bảo vệ dữ liệu thật, đây chỉ là UX
// điều hướng — không phải lớp bảo mật, đúng luật cứng #7).
function beforeRender(path) {
  const session = getSession();
  if (!session && path !== "/login") {
    location.hash = "/login";
    return false;
  }
  if (session && path === "/login") {
    location.hash = "/home";
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
  nav.innerHTML = NAV_TABS.map(
    (tab) => `
      <button type="button" class="nav-tab ${activePath === tab.path ? "active" : ""}" data-path="${tab.path}">
        <span class="nav-icon">${tab.icon}</span>
        <span class="nav-label">${tab.label}</span>
      </button>
    `
  ).join("");
  nav.querySelectorAll(".nav-tab").forEach((btn) => {
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
