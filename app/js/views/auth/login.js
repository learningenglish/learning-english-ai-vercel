// app/js/views/login.js
import { signInWithPassword, startOAuthLogin } from "../../authApi.js";
import { setSession } from "../../session.js";
import { navigate } from "../../router.js";
import { t, registerTranslations } from "../../i18n.js";

registerTranslations({
  "Đăng nhập để bắt đầu học": "Log in to start learning",
  "Email": "Email",
  "Mật khẩu": "Password",
  "hoặc": "or",
  "Đăng nhập với Google": "Log in with Google",
  "Đăng nhập với Facebook": "Log in with Facebook",
  "Đang đăng nhập...": "Logging in...",
  "Đăng nhập": "Log in",
  "Đăng nhập thất bại.": "Login failed.",
});

// Logo (2026-08-10, Đợt 6 mục 12 đợt 4) — 2 bản sáng/tối (app/icons/logo-light.png,
// logo-dark.png), chọn theo "data-theme" đã resolve sẵn trên <html> lúc app khởi động (xem
// theme.js::applyTheme() — luôn là "light"/"dark" cụ thể, không còn "system" ở bước này).
// URL TUYỆT ĐỐI theo document.baseURI (giống background.js::absIconUrl()) — tránh đúng lỗi
// đường dẫn tương đối đã gặp trước đây (cục bộ vs Vercel deploy ở thư mục con khác nhau).
function logoUrl() {
  const isDark = document.documentElement.dataset.theme === "dark";
  return new URL(`icons/${isDark ? "logo-dark.png" : "logo-light.png"}`, document.baseURI).href;
}

export function renderLogin(mount) {
  mount.innerHTML = `
    <div class="screen screen-center">
      <div class="card login-card">
        <img class="app-logo" src="${logoUrl()}" alt="Mosaic" />
        <p class="app-subtitle muted">${t("Đăng nhập để bắt đầu học")}</p>
        <form id="login-form" novalidate>
          <label class="field">
            <span>${t("Email")}</span>
            <input type="email" name="email" required autocomplete="username" />
          </label>
          <label class="field">
            <span>${t("Mật khẩu")}</span>
            <input type="password" name="password" required autocomplete="current-password" />
          </label>
          <p id="login-error" class="error-text" hidden></p>
          <button type="submit" class="btn btn-primary btn-block" id="login-submit">${t("Đăng nhập")}</button>
        </form>
        <!-- OAuth (2026-08-04) — Supabase Auth Providers (Google/Facebook), CẠNH luồng email/
             password đã có, KHÔNG thay thế. Xem authApi.js::startOAuthLogin() cho chi tiết
             redirect_to/domain. -->
        <div class="login-divider"><span>${t("hoặc")}</span></div>
        <button type="button" class="btn btn-block btn-oauth" id="oauth-google-btn">${t("Đăng nhập với Google")}</button>
        <button type="button" class="btn btn-block btn-oauth" id="oauth-facebook-btn">${t("Đăng nhập với Facebook")}</button>
      </div>
    </div>
  `;

  const form = mount.querySelector("#login-form");
  const errorEl = mount.querySelector("#login-error");
  const submitBtn = mount.querySelector("#login-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = t("Đang đăng nhập...");
    try {
      const session = await signInWithPassword(form.email.value.trim(), form.password.value);
      setSession(session);
      navigate("/home");
    } catch (err) {
      errorEl.textContent = err.message || t("Đăng nhập thất bại.");
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = t("Đăng nhập");
    }
  });

  mount.querySelector("#oauth-google-btn").addEventListener("click", () => startOAuthLogin("google"));
  mount.querySelector("#oauth-facebook-btn").addEventListener("click", () => startOAuthLogin("facebook"));
}
