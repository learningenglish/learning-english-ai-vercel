// app/js/fontSize.js — "Kích thước chữ" MỚI (2026-08-05, Setting) — cùng cơ chế localStorage +
// set thuộc tính trên <html> như theme.js/palette.js. Áp dụng qua font-size % trên <html>, vì
// toàn app dùng đơn vị rem cho cỡ chữ (xem style.css) nên mọi nơi tự co giãn theo, không cần
// viết lại rule riêng cho từng thành phần.
const PREF_KEY = "lea_student_font_size";

export const FONT_SIZES = [
  { value: "small", label: "Nhỏ", scale: "87.5%" },
  { value: "medium", label: "Trung bình", scale: "100%" },
  { value: "large", label: "Lớn", scale: "112.5%" },
];

export function getFontSizePreference() {
  try {
    return localStorage.getItem(PREF_KEY) || "medium";
  } catch {
    return "medium";
  }
}

export function applyFontSize(pref = getFontSizePreference()) {
  const found = FONT_SIZES.find((f) => f.value === pref) || FONT_SIZES[1];
  document.documentElement.style.fontSize = found.scale;
}

export function setFontSizePreference(pref) {
  try {
    localStorage.setItem(PREF_KEY, pref);
  } catch {
    // Lỗi lưu không nên chặn đổi cỡ chữ ngay trong phiên hiện tại.
  }
  applyFontSize(pref);
}
