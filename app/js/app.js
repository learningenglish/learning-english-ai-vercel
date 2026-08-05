// app/js/app.js — bootstrap: đăng ký route, auth guard, bottom nav, service worker.
//
// LÀM MỚI KHUNG ĐIỀU HƯỚNG (2026-08-04) — bottom nav đổi lại ĐÚNG 4 icon theo mockup mới: Home/
// Tiến trình/Admin/Setting (thay bộ 5 tab Phổ biến/Yêu thích/Thư viện AI/Lịch sử/Tiến trình +
// nút nổi "Tạo bài học" trước đây). "/lessons" (Bài đọc/Hội thoại), "/favorites" (Yêu thích),
// "/ai-library" (Thư viện AI), "/create" (Tạo bài học) VẪN LÀ ROUTE THẬT, chỉ không còn là icon
// riêng ở bottom nav — vào từ Home (4 card) hoặc 2 tab phụ ngay trong màn "/lessons" (xem
// views/lessons.js). "/history"+"/stats" gộp thành "/progress" (views/progress.js) — 2 file cũ
// (history.js/stats.js) GIỮ NGUYÊN, không xoá, chỉ không còn route/nav nào trỏ tới nữa.
import { getSession, setSession } from "./session.js";
import { completeOAuthSession } from "./authApi.js";
import { registerRoute, startRouter, navigate } from "./router.js";
import { applyTheme, watchSystemTheme } from "./theme.js";
import { applyPalette } from "./palette.js";
import { applyFontSize } from "./fontSize.js";
import { icon } from "./icons.js";
import { renderLogin } from "./views/login.js";
import { renderHome } from "./views/home.js";
import { renderIndustrySelect } from "./views/industrySelect.js";
import { renderLessons } from "./views/lessons.js";
import { renderCreateLesson } from "./views/createLesson.js";
import { renderCreateFromText } from "./views/createFromText.js";
import { renderWritingPractice } from "./views/writingPractice.js";
import { renderWritingFavoriteDetail } from "./views/writingFavoriteDetail.js";
import { renderWritingArchive } from "./views/writingArchive.js";
import { renderAnalysisArchive } from "./views/analysisArchive.js";
import { renderLessonDetail } from "./views/lesson.js";
import { renderProgress } from "./views/progress.js";
import { renderAdmin } from "./views/admin.js";
import { renderProfile } from "./views/profile.js";

applyTheme();
watchSystemTheme();
applyPalette();
applyFontSize();

// Mentor AI (Đợt 3) đã TẮT UI 2026-07-23 (chất lượng thật không đạt, "như spam" — quyết định
// của Minh) — form "Tạo bài học" tự nhập (views/createLesson.js) vẫn dùng được, vào qua card
// "Bài đọc"/"Hội thoại" -> quick action "AI" (xem views/lessons.js::QUICK_ACTIONS), không còn
// nút nổi riêng ở bottom nav nữa (đã đổi hẳn bố cục 4 icon, xem ghi chú đầu file). Backend
// mentor.js/mentor-lines/industry_skins/learning_goals VẪN giữ nguyên (không xoá).
const NAV_TABS = [
  { path: "/home", label: "Home", icon: "home" },
  { path: "/progress", label: "Tiến trình", icon: "bar-chart" },
  { path: "/admin", label: "Admin", icon: "shield" },
  { path: "/profile", label: "Setting", icon: "settings" },
];

registerRoute("/login", renderLogin);
registerRoute("/home", renderHome);
registerRoute("/industry-select", renderIndustrySelect);
registerRoute("/lessons", renderLessons);
// "/favorites" + "/ai-library" (2026-08-04, Minh: "Yêu thích và Thư viện AI không dùng") — GỠ
// route, KHÔNG xoá renderLessons() mode "favorite"/"library" (giữ nguyên, chỉ không còn ai gọi
// tới). Lưu bài giờ đi qua icon Lưu trữ CỤC BỘ trong từng tính năng (Phân tích/Luyện viết).
registerRoute("/create", renderCreateLesson);
registerRoute("/create-text", renderCreateFromText);
registerRoute("/analysis-archive", renderAnalysisArchive);
registerRoute("/writing", renderWritingPractice);
registerRoute("/writing-favorite", renderWritingFavoriteDetail);
registerRoute("/writing-archive", renderWritingArchive);
registerRoute("/lesson", renderLessonDetail);
// "Tin tức" (2026-07-28) — route RIÊNG (không phải /lesson/:id) để renderLessonDetail biết đọc
// từ news_lessons (public) thay vì lessons cá nhân, xem opts.news trong views/lesson.js.
registerRoute("/news-lesson", (mount, params) => renderLessonDetail(mount, params, { news: true }));
// "/history"+"/stats" gộp vào "/progress" (2026-08-04) — GIỮ 2 route cũ, trỏ tới cùng màn mới,
// để link/bookmark cũ (nếu có) không vỡ, thay vì xoá hẳn.
registerRoute("/progress", renderProgress);
registerRoute("/history", renderProgress);
registerRoute("/stats", renderProgress);
registerRoute("/admin", renderAdmin);
registerRoute("/profile", renderProfile);

// Bắt buộc đăng nhập cho MỌI route trừ /login (RLS bảo vệ dữ liệu thật, đây chỉ là UX
// điều hướng — không phải lớp bảo mật, đúng luật cứng #7). Mặc định sau đăng nhập -> /home
// (2026-08-04, khôi phục lại màn Home riêng — trước đó "/lessons" từng là màn chính).
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
  // Màn Bài học chi tiết tự vẽ thanh audio CỐ ĐỊNH ở đúng vị trí này (tab "Nội dung") —
  // ẩn thanh điều hướng ngoài đi để không chồng 2 thanh cùng lúc (yêu cầu người dùng). "/news-
  // lesson" (2026-07-29, bug thật Minh bắt được: bài Tin tức KHÔNG thấy thanh audio) — dùng
  // CHUNG renderLessonDetail()/thanh audio với "/lesson" (xem opts.news trong views/lesson.js)
  // nhưng route KHÁC tên nên bị BỎ SÓT ở đây trước đó — nav ngoài không ẩn, che mất thanh audio
  // cố định (cả 2 cùng position:fixed đáy màn hình).
  // "/industry-select" (2026-08-04, Minh bắt lỗi thật: "giao diện lần đầu chọn chuyên ngành
  // không có 4 icon bên dưới" — đúng ý: LẦN ĐẦU (onboarding, chưa có goal active, Home tự
  // chuyển tới đây) PHẢI GIỐNG /login, không có bottom nav). SỬA 2026-08-05 (Minh: "đổi chuyên
  // ngành thì thêm icon Home/Tiến trình... để quay lại, vì bây giờ ĐANG Ở BÊN TRONG luồng,
  // không phải lần chọn đầu tiên") — profile.js "Đổi chuyên ngành" giờ điều hướng tới
  // "/industry-select/change" (route CÙNG renderIndustrySelect, chỉ khác 1 segment param) — CHỈ
  // ẩn nav cho ĐÚNG "/industry-select" trơn (lần đầu), giữ nav khi có "/change" theo sau.
  const isIndustrySelectOnboarding = activePath === "/industry-select" && !location.hash.startsWith("#/industry-select/change");
  if (activePath === "/login" || activePath === "/lesson" || activePath === "/news-lesson" || isIndustrySelectOnboarding) {
    nav.hidden = true;
    nav.innerHTML = "";
    return;
  }
  nav.hidden = false;
  // "/history"/"/stats" (route cũ, giữ lại để không vỡ link/bookmark — xem registerRoute ở
  // trên) hiện cùng nội dung "/progress" nhưng KHÔNG tô sáng tab nào (không phải đường vào
  // chính thức nữa) — chấp nhận được, chỉ là lưới đỡ, không phải luồng thật người dùng đi qua.
  nav.innerHTML = NAV_TABS.map((tab) => {
    const isActive = activePath === tab.path;
    return `
      <button type="button" class="nav-tab ${isActive ? "active" : ""}" data-path="${tab.path}">
        <span class="nav-icon">${icon(tab.icon, { size: 22 })}</span>
        <span class="nav-label">${tab.label}</span>
      </button>
    `;
  }).join("");
  nav.querySelectorAll("[data-path]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.path));
  });
}

// Sau khi Supabase xử lý xong OAuth (Google/Facebook, 2026-08-04), nó redirect NGƯỢC LẠI đúng
// domain đang chạy (xem authApi.js::startOAuthLogin/getOAuthRedirectUrl) kèm access_token/
// refresh_token trên URL FRAGMENT (#access_token=...) — TRÙNG cơ chế router.js dùng cho routing
// (cũng đọc location.hash). PHẢI tiêu thụ + DỌN hash này TRƯỚC khi startRouter() gọi render()
// lần đầu, nếu không router sẽ hiểu nhầm "access_token=..." thành 1 đường dẫn route lạ.
async function consumeOAuthCallback() {
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (!raw.includes("access_token=")) return;
  const params = new URLSearchParams(raw);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const expiresIn = params.get("expires_in");
  const errorDescription = params.get("error_description");
  // Dọn hash NGAY LẬP TỨC dù thành công hay lỗi (KHÔNG dùng location.hash="" — cách đó tự thêm
  // lại "#" rỗng và VẪN bắn "hashchange") — access_token không được phép nằm lại trên URL (rò
  // rỉ qua lịch sử trình duyệt/referrer), và router không được đọc phải chuỗi này.
  history.replaceState(null, "", location.pathname + location.search);
  if (errorDescription) {
    console.error("Đăng nhập OAuth lỗi:", errorDescription);
    return;
  }
  if (!accessToken || !refreshToken) return;
  try {
    const session = await completeOAuthSession(accessToken, refreshToken, expiresIn);
    setSession(session);
  } catch (e) {
    console.error("OAuth: không hoàn tất được phiên đăng nhập:", e);
  }
}

await consumeOAuthCallback();
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
