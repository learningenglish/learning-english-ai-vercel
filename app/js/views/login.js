// app/js/views/login.js
import { signInWithPassword, startOAuthLogin } from "../authApi.js";
import { setSession } from "../session.js";
import { navigate } from "../router.js";

export function renderLogin(mount) {
  mount.innerHTML = `
    <div class="screen screen-center">
      <div class="card login-card">
        <h1 class="app-title">Learning English AI</h1>
        <p class="app-subtitle muted">Đăng nhập để bắt đầu học</p>
        <form id="login-form" novalidate>
          <label class="field">
            <span>Email</span>
            <input type="email" name="email" required autocomplete="username" />
          </label>
          <label class="field">
            <span>Mật khẩu</span>
            <input type="password" name="password" required autocomplete="current-password" />
          </label>
          <p id="login-error" class="error-text" hidden></p>
          <button type="submit" class="btn btn-primary btn-block" id="login-submit">Đăng nhập</button>
        </form>
        <!-- OAuth (2026-08-04) — Supabase Auth Providers (Google/Facebook), CẠNH luồng email/
             password đã có, KHÔNG thay thế. Xem authApi.js::startOAuthLogin() cho chi tiết
             redirect_to/domain. -->
        <div class="login-divider"><span>hoặc</span></div>
        <button type="button" class="btn btn-block btn-oauth" id="oauth-google-btn">Đăng nhập với Google</button>
        <button type="button" class="btn btn-block btn-oauth" id="oauth-facebook-btn">Đăng nhập với Facebook</button>
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
    submitBtn.textContent = "Đang đăng nhập...";
    try {
      const session = await signInWithPassword(form.email.value.trim(), form.password.value);
      setSession(session);
      navigate("/home");
    } catch (err) {
      errorEl.textContent = err.message || "Đăng nhập thất bại.";
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Đăng nhập";
    }
  });

  mount.querySelector("#oauth-google-btn").addEventListener("click", () => startOAuthLogin("google"));
  mount.querySelector("#oauth-facebook-btn").addEventListener("click", () => startOAuthLogin("facebook"));
}
