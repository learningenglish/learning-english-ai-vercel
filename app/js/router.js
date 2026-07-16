// app/js/router.js — router hash-based tối thiểu, không framework. Hash-based (không phải
// History API pushState) để "F5 giữ đúng màn hình" và "Back/Forward hoạt động đúng" (tiêu
// chí nghiệm thu MVP) hoạt động MIỄN PHÍ qua cơ chế trình duyệt gốc, không cần thêm rewrite
// SPA-fallback nào trong vercel.json (hash không bao giờ gửi lên server).
const routes = {};
let teardownCurrent = null;
let hooks = {};

export function registerRoute(path, renderFn) {
  routes[path] = renderFn;
}

function parseHash() {
  const raw = (location.hash || "#/login").slice(1);
  const parts = raw.split("/").filter(Boolean);
  return { path: "/" + (parts[0] || ""), params: parts.slice(1) };
}

async function render() {
  const { path, params } = parseHash();
  if (hooks.beforeRender && hooks.beforeRender(path) === false) return; // hook đã tự đổi hash, dừng lượt render này

  if (typeof teardownCurrent === "function") {
    try {
      teardownCurrent();
    } catch {
      /* teardown lỗi không được chặn chuyển màn hình */
    }
    teardownCurrent = null;
  }

  const mount = document.getElementById("view");
  mount.innerHTML = "";
  // "/lessons" là màn chính mặc định — fallback cho hash lạ/route đã xoá (vd bookmark cũ,
  // link cache từ trước khi đổi nav) thay vì lỗi im lặng làm trắng màn hình.
  const renderFn = routes[path] || routes["/lessons"];
  try {
    teardownCurrent = (await renderFn(mount, params)) || null;
  } catch (e) {
    console.error("Router render error:", e);
    mount.innerHTML = `<div class="screen"><p class="error-text">Có lỗi khi hiển thị màn hình này. Vui lòng thử lại.</p></div>`;
  }

  if (hooks.afterRender) hooks.afterRender(path);
}

// Điều hướng qua code (không phải click <a>) — ép render lại ngay cả khi hash không đổi
// (vd bấm lại "Tạo bài học" khi đang đứng ở đó, cần reset form/timer).
export function navigate(path) {
  if (location.hash === "#" + path) {
    render();
  } else {
    location.hash = path;
  }
}

export function startRouter(routeHooks = {}) {
  hooks = routeHooks;
  window.addEventListener("hashchange", render);
  render();
}
