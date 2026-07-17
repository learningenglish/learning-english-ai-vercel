// app/js/theme.js — quản lý theme Sáng/Tối/Theo hệ thống. Áp dụng bằng cách set thuộc tính
// data-theme trên <html>, CSS đọc qua ":root[data-theme='dark']" (xem style.css).
//
// LƯU Ý QUAN TRỌNG: logic đọc localStorage + set data-theme ban đầu còn được COPY NGUYÊN
// VĂN (rút gọn) thành 1 <script> nội tuyến chặn render trong index.html <head> — vì
// <script type="module"> luôn bị hoãn (defer ngầm định), nếu chỉ gọi applyTheme() từ đây
// thì có 1 khoảng nháy theme sáng (mặc định trình duyệt) trước khi module kịp chạy, đặc
// biệt rõ khi người dùng đã chọn theme Tối. 2 nơi PHẢI cùng đọc đúng 1 STORAGE_KEY.
const STORAGE_KEY = "lea_student_theme"; // "light" | "dark" | "system"

export function getThemePreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "system";
  } catch {
    return "system";
  }
}

function resolveTheme(pref) {
  if (pref === "dark" || pref === "light") return pref;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(pref = getThemePreference()) {
  document.documentElement.setAttribute("data-theme", resolveTheme(pref));
}

export function setThemePreference(pref) {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Lỗi lưu (vd Safari riêng tư hết quota) không nên chặn việc đổi theme ngay trong phiên.
  }
  applyTheme(pref);
}

// Khi đang ở chế độ "system", đổi theme hệ điều hành ngay lúc app đang mở phải phản ánh
// NGAY, không cần tải lại trang.
let watching = false;
export function watchSystemTheme() {
  if (watching || !window.matchMedia) return;
  watching = true;
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getThemePreference() === "system") applyTheme("system");
  });
}
