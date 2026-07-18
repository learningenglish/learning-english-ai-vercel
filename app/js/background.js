// app/js/background.js — quản lý hình nền minh hoạ có thể đổi được (yêu cầu: "thân thiện
// người dùng" + tự chọn ở phần cài đặt). Cùng cơ chế với theme.js: lưu localStorage, áp
// dụng qua 1 CSS custom property để style.css chỉ cần đọc var(), không hardcode.
const STORAGE_KEY = "lea_student_bg";

export const BACKGROUNDS = [
  { value: "scene", label: "Đồng quê", file: "bg-scene.svg" },
  { value: "sunset", label: "Hoàng hôn", file: "bg-scene-sunset.svg" },
  { value: "ocean", label: "Đại dương", file: "bg-scene-ocean.svg" },
  { value: "night", label: "Ban đêm", file: "bg-scene-night.svg" },
  { value: "none", label: "Trơn", file: null },
];

export function getBackgroundPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "scene";
  } catch {
    return "scene";
  }
}

export function applyBackground(pref = getBackgroundPreference()) {
  const bg = BACKGROUNDS.find((b) => b.value === pref) || BACKGROUNDS[0];
  // "../icons/..." — url() bên trong 1 CSS custom property được trình duyệt phân giải THEO
  // VỊ TRÍ FILE STYLESHEET nơi "var(--bg-scene-image)" thật sự được VIẾT (app/css/style.css),
  // KHÔNG phải theo document base (index.html) dù giá trị được SET từ JS ở đây — ngược với
  // trực giác ban đầu (đã gặp lỗi thật: set "./icons/..." ra sai đường dẫn "css/icons/...").
  document.documentElement.style.setProperty("--bg-scene-image", bg.file ? `url("../icons/${bg.file}")` : "none");
}

export function setBackgroundPreference(pref) {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Lỗi lưu không nên chặn đổi nền ngay trong phiên hiện tại.
  }
  applyBackground(pref);
}
