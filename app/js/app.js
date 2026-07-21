// app/js/app.js — bootstrap: đăng ký route, auth guard, bottom nav, service worker.
//
// Nav đổi theo ảnh mẫu giao diện app cũ (quyết định của người dùng): Bài học / Yêu thích /
// Tạo bài học (nút nổi giữa) / Lịch sử / Thống kê — thay cho bộ 5 tab ban đầu của brief
// (Trang chủ/Bài học/AI/Nhiệm vụ/Hồ sơ). "Hồ sơ" không còn là tab riêng — vào qua icon
// bánh răng ở góc phải màn "Bài học" (xem views/lessons.js).
import { getSession } from "./session.js";
import { registerRoute, startRouter, navigate } from "./router.js";
import { applyTheme, watchSystemTheme } from "./theme.js";
import { applyBackground } from "./background.js";
import { icon } from "./icons.js";
import { renderLogin } from "./views/login.js";
import { renderLessons } from "./views/lessons.js";
import { renderMentorHub } from "./views/mentor.js";
import { renderMentorGoalFlow } from "./views/mentorGoal.js";
import { withPronounOnboarding } from "./views/mentorOnboarding.js";
import { renderLessonDetail } from "./views/lesson.js";
import { renderHistory } from "./views/history.js";
import { renderStats } from "./views/stats.js";
import { renderProfile } from "./views/profile.js";

applyTheme();
watchSystemTheme();
applyBackground();

// "Tạo bài học" (form nhập tay) đã bị THAY HẲN bởi "Mentor AI" (Đợt 3) — nút nổi giữa giờ dẫn
// vào màn có thẻ đạo diễn + Thư Viện AI thay vì form trực tiếp, xem views/mentor.js.
const NAV_TABS = [
  { path: "/lessons", label: "Bài học", icon: "book" },
  { path: "/favorites", label: "Yêu thích", icon: "heart" },
  { path: "/mentor", label: "Mentor AI", icon: "sparkles", fab: true },
  { path: "/history", label: "Lịch sử", icon: "clock" },
  { path: "/stats", label: "Thống kê", icon: "bar-chart" },
];

registerRoute("/login", renderLogin);
registerRoute("/lessons", renderLessons);
registerRoute("/favorites", (mount) => renderLessons(mount, ["favorite"]));
// Cả 2 điểm vào Mentor AI đều đi qua màn nghi thức xưng hô 1 lần đầu tiên (mục 3.2/3.4 điểm 1
// Đợt 3) — không đụng route/nav nào khác ngoài 2 route này.
registerRoute("/mentor", (mount) => withPronounOnboarding(mount, renderMentorHub));
registerRoute("/mentor-goal", (mount) => withPronounOnboarding(mount, renderMentorGoalFlow));
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
  // Màn Bài học chi tiết tự vẽ thanh audio CỐ ĐỊNH ở đúng vị trí này (tab "Nội dung") —
  // ẩn thanh điều hướng ngoài đi để không chồng 2 thanh cùng lúc (yêu cầu người dùng).
  if (activePath === "/login" || activePath === "/lesson") {
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
      return `<button type="button" class="nav-tab-fab" data-path="${tab.path}" aria-label="${tab.label}">${icon(tab.icon, { size: 24, strokeWidth: 2.25 })}</button>`;
    }
    const isFavoriteActive = isActive && tab.path === "/favorites";
    return `
      <button type="button" class="nav-tab ${isActive ? "active" : ""}" data-path="${tab.path}">
        <span class="nav-icon">${icon(tab.icon, { size: 22, filled: isFavoriteActive })}</span>
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
  // TỰ ĐỘNG reload đúng 1 lần khi service worker MỚI giành quyền điều khiển trang
  // ("controllerchange" — tín hiệu chuẩn, đáng tin hơn theo dõi state "activated" của riêng
  // worker) — bug thật đã gặp: sw.js cache-first, skipWaiting()+clients.claim() có chạy
  // đúng nhưng KHÔNG tự làm những request ĐANG MỞ của trang hiện tại đổi qua SW mới; người
  // dùng thấy hiện tượng "tải lại 2-3 lần vẫn còn giao diện/CSS cũ" dù server đã có bản mới
  // (đã tự xác nhận qua curl: bytes trên Vercel đúng, chỉ trình duyệt người dùng chưa nhận).
  // "refreshing" chặn vòng lặp reload vô hạn nếu "controllerchange" bắn nhiều lần liên tiếp.
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Cài PWA vẫn hoạt động được không cần service worker (chỉ mất phần cache offline
      // shell) — không chặn app nếu đăng ký thất bại.
    });
  });
}
