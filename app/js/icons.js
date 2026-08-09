// app/js/icons.js — bộ icon SVG DÙNG CHUNG cho toàn app, thay thế hoàn toàn emoji (🔥📖💬
// v.v: hiển thị không đồng nhất giữa các máy/hệ điều hành, trông thiếu chuyên nghiệp).
// Phong cách outline nét đều (line-style, giống Feather/Lucide), fill="none" +
// stroke="currentColor" -> TỰ ĐỘNG đổi màu theo CSS "color" của phần tử cha, không cần
// biến thể riêng cho từng theme sáng/tối.
const PATHS = {
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  "message-circle":
    '<path d="M21 11.5a8.38 8.38 0 0 1-1.9 5.4 8.5 8.5 0 0 1-9.6 2.9L3 21l1.4-4.2A8.5 8.5 0 1 1 21 11.5z"/>',
  // Path chuẩn (Feather/Lucide "heart") — path tự vẽ trước đó có điểm nối không khớp, tạo
  // vết "mẻ" nhỏ ở đáy tim khi zoom/stroke dày (người dùng phát hiện qua ảnh thật). Path này
  // đã được kiểm chứng rộng rãi, đường cong khép kín liền mạch, không còn vết mẻ.
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
  library: '<path d="M4 4v16"/><path d="M8 8v12"/><path d="M12 6v14"/><path d="M16 6l4 14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  "bar-chart": '<path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.65 1.65 0 0 0-1.8-.3 1.65 1.65 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.65 1.65 0 0 0-1-1.5 1.65 1.65 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.65 1.65 0 0 0 .3-1.8 1.65 1.65 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.65 1.65 0 0 0 1.8.3H9a1.65 1.65 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.65 1.65 0 0 0 1 1.5 1.65 1.65 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.65 1.65 0 0 0-.3 1.8V9c.2.6.7 1 1.5 1H21a2 2 0 0 1 0 4h-.1a1.65 1.65 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  filter: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  flame: '<path d="M12 2c-.3 3-2.5 4.6-4 6.5C6.5 10.6 6 12.4 6 14a6 6 0 0 0 12 0c0-2-.8-3.4-2-4.7.3 1.6-.3 2.7-1 3.2.3-2.6-.6-4-1.5-5.3C13 6 12.5 4 12 2z"/>',
  volume: '<path d="M5 9v6h3.5l4.5 4V5l-4.5 4H5z"/><path d="M17 8.5a5 5 0 0 1 0 7"/><path d="M19.5 6a9 9 0 0 1 0 12"/>',
  list: '<path d="M9 6h12"/><path d="M9 12h12"/><path d="M9 18h12"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/>',
  // "đoạn gốc" (2026-08-08, toggle ẩn/hiện văn bản tiếng Anh gốc) — trang giấy có dòng chữ, khác
  // hẳn "list" (đang dùng cho tách câu) để không trùng hình dạng giữa 2 icon cạnh nhau.
  "file-text":
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/>',
  languages:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14.5 14.5 0 0 1 0 18"/><path d="M12 3a14.5 14.5 0 0 0 0 18"/>',
  "chevron-left": '<path d="M15 18l-6-6 6-6"/>',
  "chevron-right": '<path d="M9 18l6-6-6-6"/>',
  "chevron-down": '<path d="M6 9l6 6 6-6"/>',
  "arrow-left": '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
  "skip-back": '<path d="M19 20L9 12l10-8v16z"/><path d="M5 19V5"/>',
  rewind: '<path d="M11 19l-9-7 9-7v14z"/><path d="M22 19l-9-7 9-7v14z"/>',
  play: '<path d="M6 4l14 8-14 8V4z"/>',
  // SỬA 2026-08-09 (Đợt 4, mục 8 — Minh: "nút dừng || bị dính nhau sát không đẹp") — 2 thanh gốc
  // cách nhau 2 đơn vị/24 viewBox, ở size nhỏ (18px) render ra ~1.5px thật, nhìn dính liền. Giãn
  // khoảng cách gấp đôi (4 đơn vị), vẫn canh giữa đối xứng trong viewBox 24.
  pause: '<path d="M6 4h4v16H6z"/><path d="M14 4h4v16h-4z"/>',
  "fast-forward": '<path d="M13 19l9-7-9-7v14z"/><path d="M2 19l9-7-9-7v14z"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/>',
  "x-circle": '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5l5 5"/><path d="M14.5 9.5l-5 5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 10h18"/>',
  star: '<path d="M12 2.5l2.8 5.9 6.4.7-4.8 4.4 1.3 6.4L12 16.8l-5.7 3.1 1.3-6.4-4.8-4.4 6.4-.7z"/>',
  "book-open":
    '<path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/>',
  moon: '<path d="M21 13.5A9 9 0 1 1 10.5 3a7.2 7.2 0 0 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5"/><path d="M12 19v2.5"/><path d="M4.6 4.6l1.8 1.8"/><path d="M17.6 17.6l1.8 1.8"/><path d="M2.5 12H5"/><path d="M19 12h2.5"/><path d="M4.6 19.4l1.8-1.8"/><path d="M17.6 6.4l1.8-1.8"/>',
  monitor: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  flask: '<path d="M9 2v6.5L3.5 18a2 2 0 0 0 1.7 3h13.6a2 2 0 0 0 1.7-3L15 8.5V2"/><path d="M9 2h6"/><path d="M7.5 15h9"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  hash: '<path d="M5 9h14"/><path d="M5 15h14"/><path d="M10 3l-2 18"/><path d="M16 3l-2 18"/>',
  "dollar-sign": '<path d="M12 2v20"/><path d="M17 6.5c0-1.9-2.2-3.5-5-3.5S7 4.6 7 6.5 9.2 10 12 10s5 1.6 5 3.5-2.2 3.5-5 3.5-5-1.6-5-3.5"/>',
  briefcase: '<rect x="2.5" y="7" width="19" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M2.5 13h19"/>',
  bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z"/>',
  camera:
    '<path d="M4 8h3l1.6-2.4A2 2 0 0 1 10.3 4.5h3.4a2 2 0 0 1 1.7 1.1L17 8h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13.5" r="3.5"/>',
  "edit-3": '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  "file-text":
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M8 9h2"/>',
  // Mentor AI (Đợt 3) — nút (+) đổi từ "plus" thuần sang icon riêng biệt với "compass" (đã
  // dùng cho tier badge ở màn Bài học, tránh trùng icon 2 nơi khác nghĩa nhau).
  sparkles:
    '<path d="M12 3l1.8 4.8L18.5 9.5l-4.7 1.7L12 16l-1.8-4.8-4.7-1.7 4.7-1.7z"/><path d="M5 16l.9 2.3L8 19l-2.1.7L5 22l-.9-2.3L2 19l2.1-.7z"/><path d="M19 14l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8L16.5 16.5l1.8-.7z"/>',
  // "Khoá chip + xác nhận đổi lộ trình" (2026-07-28) — thay 2 chip Cấp độ/Loại nội dung khi
  // đang bám 1 lộ trình có sẵn, xem views/createLesson.js.
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  // "Các khoá học" (2026-07-29) — thay chỗ "Máy ảnh" ở hàng lối tắt màn Phổ biến, xem
  // QUICK_ACTIONS trong views/lessons.js.
  "graduation-cap": '<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
  // Bottom nav 4 tab (2026-08-04, làm mới khung điều hướng) — "home" thay "book" cho tab
  // Trang chủ, "shield" cho tab Admin (placeholder, chưa có tính năng thật).
  home: '<path d="M3 11.5L12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  // "Tài khoản"/"Thông tin ứng dụng" (2026-08-05, màn Cài đặt).
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5h.01"/>',
};

// "name": tên icon trong PATHS ở trên. "size"/"strokeWidth": tuỳ biến kích thước hiển thị.
// "filled": true -> tô đặc bằng currentColor (dùng cho trạng thái active, vd tim Yêu thích),
// false (mặc định) -> chỉ viền, không tô (phong cách outline chuẩn cho hầu hết icon).
export function icon(name, { size = 20, strokeWidth = 2, filled = false, className = "" } = {}) {
  const body = PATHS[name];
  if (!body) return "";
  const fill = filled ? "currentColor" : "none";
  return `<svg class="icon${className ? " " + className : ""}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
