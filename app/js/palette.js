// app/js/palette.js — "Theme (Color Palette)" MỚI (2026-08-04, Phần A8) — đổi MÀU CHỦ ĐẠO/
// accent của toàn UI (nút, tab đang chọn, viền nổi bật...), KHÁC HẲN "Hình nền" (background.js,
// ảnh minh hoạ phía sau) và "Giao diện" (theme.js, sáng/tối/hệ thống) — 3 cơ chế độc lập, cùng
// 1 kiểu (localStorage + set attribute trên <html>), CSS style.css chỉ cần đọc var(--purple)/
// var(--purple-soft) đã dùng sẵn khắp nơi, không cần viết lại rule nào riêng cho từng thành phần.
const PREF_KEY = "lea_student_palette";

// "purple" = màu mặc định HIỆN TẠI của app (giữ nguyên :root/[data-theme="dark"] gốc trong
// style.css, KHÔNG cần override) — 3 bộ còn lại có khối CSS riêng
// (:root[data-palette="..."] / :root[data-theme="dark"][data-palette="..."]) trong style.css.
export const PALETTES = [
  { value: "purple", label: "Tím", swatch: "#7c5cff" },
  { value: "orange", label: "Cam ấm", swatch: "#f97316" },
  { value: "blue", label: "Xanh dương", swatch: "#2563eb" },
  { value: "green", label: "Xanh lá", swatch: "#16a34a" },
  // 2 bộ "màu đậm" thêm 2026-08-05 (Minh: "thêm một vài color palette màu đậm").
  { value: "ruby", label: "Đỏ ruby đậm", swatch: "#9f1239" },
  { value: "teal", label: "Xanh rêu đậm", swatch: "#0f766e" },
];

export function getPalettePreference() {
  try {
    return localStorage.getItem(PREF_KEY) || "purple";
  } catch {
    return "purple";
  }
}

export function applyPalette(pref = getPalettePreference()) {
  document.documentElement.setAttribute("data-palette", pref);
}

export function setPalettePreference(pref) {
  try {
    localStorage.setItem(PREF_KEY, pref);
  } catch {
    // Lỗi lưu không nên chặn đổi màu ngay trong phiên hiện tại.
  }
  applyPalette(pref);
}
