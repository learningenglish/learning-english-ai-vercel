// app/js/autoScroll.js — "Auto Scroll" (2026-08-09, Đợt 4 mục 8) — Minh: tự cuộn trang tới đúng
// câu/đoạn đang phát audio. Đặt ở Setting (không phải icon riêng trong hàng toggle của màn đọc
// bài — hàng đó đã đủ 3 icon, đây là tuỳ chọn hành vi LÂU DÀI giống Kích thước chữ/Theme hơn là
// toggle theo-bài) — cùng cơ chế localStorage đơn giản như fontSize.js/theme.js.
const PREF_KEY = "lea_auto_scroll";

export function getAutoScrollPreference() {
  try {
    return localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoScrollPreference(enabled) {
  try {
    localStorage.setItem(PREF_KEY, enabled ? "1" : "0");
  } catch {
    // Lỗi lưu không nên chặn đổi trong phiên hiện tại.
  }
}
