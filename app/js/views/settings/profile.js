// app/js/views/profile.js
import { getSession, clearSession } from "../../session.js";
import { navigate } from "../../router.js";
import { icon } from "../../icons.js";
import { showToast } from "../../toast.js";
import { getThemePreference, setThemePreference } from "../../theme.js";
import { getPalettePreference, setPalettePreference, PALETTES } from "../../palette.js";
import { getFontSizePreference, setFontSizePreference, FONT_SIZES } from "../../fontSize.js";
import { getAutoScrollPreference, setAutoScrollPreference } from "../../autoScroll.js";
import { getCreditBalance } from "../../packageApi.js";
import { getSharedPackageTier } from "../../header.js";
import { PACKAGE_LABELS } from "../../packageConfig.js";
import { t, getUiLang, setUiLang, registerTranslations } from "../../i18n.js";

registerTranslations({
  "Cài đặt": "Settings",
  "Ngôn ngữ": "Language",
  "Tiếng Việt": "Vietnamese",
  // 2026-08-20 (Minh): "Thêm chuyên ngành (Nâng cấp gói)" -> "Đổi chuyên ngành" (nhãn cũ nhắc lại
  // "nâng cấp gói" gây trùng ý với hàng "Gói của tôi" ngay phía trên).
  "Đổi chuyên ngành": "Change industry",
  "Gói của tôi": "My plan",
  "Tài khoản": "Account",
  "Thông tin ứng dụng": "App info",
  "Giao diện": "Appearance",
  "Sáng": "Light",
  "Tối": "Dark",
  "Hệ thống": "System",
  "Kích thước chữ": "Font size",
  "Tự cuộn theo audio": "Auto-scroll with audio",
  "Tắt": "Off",
  "Bật": "On",
  "Theme (Color Palette)": "Theme (Color palette)",
  "Đăng xuất": "Log out",
  "Chưa đăng nhập": "Not logged in",
  // fontSize.js labels
  "Nhỏ": "Small",
  "Trung bình": "Medium",
  "Lớn": "Large",
  "Lớn nhất": "Largest",
  // palette.js labels
  "Tím": "Purple",
  "Cam ấm": "Warm orange",
  "Xanh dương": "Blue",
  "Xanh lá": "Green",
  "Đỏ ruby đậm": "Deep ruby",
  "Xanh rêu đậm": "Deep teal",
});

const APP_NAME = "Learning English AI";
const APP_VERSION = "1.0.0";

const THEME_OPTIONS = [
  { value: "light", label: "Sáng", icon: "sun" },
  { value: "dark", label: "Tối", icon: "moon" },
  { value: "system", label: "Hệ thống", icon: "monitor" },
];

const LANG_OPTIONS = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
];

export function renderProfile(mount) {
  const session = getSession();
  const currentTheme = getThemePreference();
  const currentPalette = getPalettePreference();
  const currentFontSize = getFontSizePreference();
  const currentAutoScroll = getAutoScrollPreference();
  const currentLang = getUiLang();
  mount.innerHTML = `
    <div class="screen">
      <h1 class="screen-title icon-text app-header-title">${icon("settings", { size: 22 })} ${t("Cài đặt")}</h1>

      <div class="card profile-card">
        <!-- "Ngôn ngữ" (2026-08-12, Minh: "thêm ngôn ngữ giao diện: tiếng Anh") — chuyển từ hàng
             TĨNH (mockup) sang picker thật, cùng cơ chế theme/font-size ngay dưới đây. Đổi ngôn
             ngữ tải lại trang (xem setUiLang() trong i18n.js). -->
        <div class="profile-section-title">${t("Ngôn ngữ")}</div>
        <div class="theme-picker" id="lang-picker">
          ${LANG_OPTIONS.map(
            (l) => `
            <button type="button" class="theme-option ${currentLang === l.value ? "active" : ""}" data-lang="${l.value}">
              <span>${l.label}</span>
            </button>
          `
          ).join("")}
        </div>
      </div>

      <div class="card profile-card">
        <!-- 2026-08-20 (Minh sửa lần 3 — TÁCH RIÊNG 2 hàng, bản trước gộp chung 1 hàng "Gói của
             tôi" kèm luôn nút bấm nâng cấp là SAI): "Gói của tôi" giờ CHỈ hiển thị (tên gói bên
             phải, KHÔNG bấm được) — hành động điều hướng sang màn nâng cấp chuyển hẳn sang hàng
             "Nâng cấp gói" RIÊNG ngay bên dưới. -->
        <div class="settings-row" id="my-package-row">
          <span class="icon-text">${icon("sparkles", { size: 18 })} ${t("Gói của tôi")}</span>
          <span class="package-name-badge" id="package-name-badge">${
            // SỬA 2026-08-20 (Minh: "bộ đếm tối thấy --, muốn hiển thị ngay") — đọc từ cache dùng
            // chung (header.js, Home đã "làm ấm" ngay lúc đăng nhập) thay vì luôn "--" mặc định.
            // Không escapeHtml() — PACKAGE_LABELS là hằng số TĨNH trong code (packageConfig.js),
            // không phải dữ liệu người dùng nhập, an toàn ghép thẳng vào innerHTML.
            getSharedPackageTier() ? PACKAGE_LABELS[getSharedPackageTier()]?.label || getSharedPackageTier() : "--"
          }</span>
        </div>
        <div class="settings-row settings-row-clickable" id="upgrade-package-row">
          <span class="icon-text">${icon("sparkles", { size: 18 })} ${t("Nâng cấp gói")}</span>
          ${icon("chevron-right", { size: 18 })}
        </div>
        <!-- 2026-08-20 (Minh): đổi nhãn "Thêm chuyên ngành (Nâng cấp gói)" -> "Đổi chuyên ngành"
             (nhãn cũ trùng ý "nâng cấp gói" với 2 hàng gói phía trên). -->
        <div class="settings-row settings-row-clickable" id="change-industry-row">
          <span class="icon-text">${icon("briefcase", { size: 18 })} ${t("Đổi chuyên ngành")}</span>
          ${icon("chevron-right", { size: 18 })}
        </div>
        <!-- "Tài khoản"/"Thông tin ứng dụng" (2026-08-05, sửa lỗi tràn khung — Minh: "chữ bị tràn
             khung, dùng > như Đổi chuyên ngành, cần xem mới click") — KHÔNG hiện email/version
             dài ngay trên hàng nữa (email dài vỡ layout), bấm vào mới hiện qua toast. -->
        <div class="settings-row settings-row-clickable" id="account-row">
          <span class="icon-text">${icon("user", { size: 18 })} ${t("Tài khoản")}</span>
          ${icon("chevron-right", { size: 18 })}
        </div>
        <div class="settings-row settings-row-clickable" id="app-info-row">
          <span class="icon-text">${icon("info", { size: 18 })} ${t("Thông tin ứng dụng")}</span>
          ${icon("chevron-right", { size: 18 })}
        </div>
      </div>

      <div class="card profile-card">
        <div class="profile-section-title">${t("Giao diện")}</div>
        <div class="theme-picker" id="theme-picker">
          ${THEME_OPTIONS.map(
            (o) => `
            <button type="button" class="theme-option ${currentTheme === o.value ? "active" : ""}" data-theme="${o.value}">
              ${icon(o.icon, { size: 20 })}
              <span>${t(o.label)}</span>
            </button>
          `
          ).join("")}
        </div>
      </div>

      <!-- "Kích thước chữ" (2026-08-05, mới) — cùng cơ chế theme/palette (app/js/fontSize.js),
           co giãn TOÀN app vì mọi cỡ chữ đều dùng đơn vị rem. -->
      <div class="card profile-card">
        <div class="profile-section-title">${t("Kích thước chữ")}</div>
        <div class="theme-picker" id="font-size-picker">
          ${FONT_SIZES.map(
            (f) => `
            <button type="button" class="theme-option ${currentFontSize === f.value ? "active" : ""}" data-font-size="${f.value}">
              <span>${t(f.label)}</span>
            </button>
          `
          ).join("")}
        </div>
      </div>

      <!-- "Auto Scroll" (2026-08-09, Đợt 4 mục 8) — Minh: tự cuộn trang theo câu/đoạn đang phát
           audio trong màn đọc bài. Đặt ở đây (không phải icon riêng trong màn đọc bài — hàng
           toggle ở đó đã đủ 3 icon) vì đây là tuỳ chọn hành vi lâu dài, cùng nhóm với Kích thước
           chữ/Theme hơn là toggle theo-từng-bài. -->
      <div class="card profile-card">
        <div class="profile-section-title">${t("Tự cuộn theo audio")}</div>
        <div class="theme-picker" id="auto-scroll-picker">
          <button type="button" class="theme-option ${!currentAutoScroll ? "active" : ""}" data-auto-scroll="0">
            <span>${t("Tắt")}</span>
          </button>
          <button type="button" class="theme-option ${currentAutoScroll ? "active" : ""}" data-auto-scroll="1">
            <span>${t("Bật")}</span>
          </button>
        </div>
      </div>

      <!-- Theme (Color Palette) (2026-08-04) — BỎ HẲN ảnh nền/nhóm màu nền dựng sẵn/upload ảnh
           riêng (yêu cầu Minh: "Nền bỏ hình nền, bỏ up hình nền, code dùng nền theo bộ màu") —
           chọn 1 trong các bộ màu ở đây tự đổi LUÔN cả nền full màn hình (xem
           body::before trong style.css, đọc lại var(--purple-soft) do palette.js set), không
           còn mục "Ảnh nền" riêng nữa. -->
      <div class="card profile-card">
        <div class="profile-section-title">${t("Theme (Color Palette)")}</div>
        <div class="palette-picker" id="palette-picker">
          ${PALETTES.map(
            (p) => `
            <button type="button" class="palette-option ${currentPalette === p.value ? "active" : ""}" data-palette="${p.value}">
              <span class="palette-option-swatch" style="background:${p.swatch}"></span>
              <span>${t(p.label)}</span>
            </button>
          `
          ).join("")}
        </div>
      </div>

      <button type="button" class="btn btn-danger btn-block" id="logout-btn">${icon("logout", { size: 18 })} ${t("Đăng xuất")}</button>
    </div>
  `;

  // KHÔNG còn nút back (2026-08-05, Minh: "bỏ icon < ở Cài đặt") — Cài đặt giờ là 1 trong 4 tab
  // CHÍNH ở bottom nav (xem app.js NAV_TABS), giống Home/Tiến trình/Admin đều không có back.

  mount.querySelector("#logout-btn").addEventListener("click", () => {
    clearSession();
    navigate("/login");
  });

  // "/industry-select/change" (2026-08-05, khác "/industry-select" trơn — Minh: "đổi chuyên
  // ngành đang ở BÊN TRONG luồng, không phải lần chọn đầu tiên, cần icon Home/Tiến trình... để
  // quay lại") — cùng renderIndustrySelect(), chỉ khác app.js::renderBottomNav() đọc thêm
  // "/change" ở cuối hash để quyết định hiện/ẩn thanh điều hướng ngoài (xem app.js).
  mount.querySelector("#change-industry-row").addEventListener("click", () => navigate("/industry-select/change"));

  mount.querySelector("#upgrade-package-row").addEventListener("click", () => navigate("/packages"));
  getCreditBalance().then((res) => {
    const badge = mount.querySelector("#package-name-badge");
    if (badge && res.ok) badge.textContent = PACKAGE_LABELS[res.data.packageTier]?.label || res.data.packageTier;
  });

  mount.querySelector("#account-row").addEventListener("click", () => {
    showToast(session?.user?.email || t("Chưa đăng nhập"));
  });
  mount.querySelector("#app-info-row").addEventListener("click", () => {
    showToast(`${APP_NAME} · v${APP_VERSION}`);
  });

  mount.querySelectorAll(".theme-option[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.lang === currentLang) return;
      setUiLang(btn.dataset.lang);
    });
  });

  mount.querySelectorAll(".theme-option[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setThemePreference(btn.dataset.theme);
      mount.querySelectorAll(".theme-option[data-theme]").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  mount.querySelectorAll(".theme-option[data-font-size]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setFontSizePreference(btn.dataset.fontSize);
      mount.querySelectorAll(".theme-option[data-font-size]").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  mount.querySelectorAll(".theme-option[data-auto-scroll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setAutoScrollPreference(btn.dataset.autoScroll === "1");
      mount.querySelectorAll(".theme-option[data-auto-scroll]").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  mount.querySelectorAll(".palette-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      setPalettePreference(btn.dataset.palette);
      mount.querySelectorAll(".palette-option").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });
}
