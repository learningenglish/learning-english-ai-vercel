// app/js/i18n.js — 2026-08-12 (Minh: "Tiếng Việt và tiếng Anh đang lộn xộn trong giao diện...
// thêm ngôn ngữ giao diện, làm hết một lượt"). Tiếng Việt là NGÔN NGỮ GỐC/khoá tra (mọi lệnh
// gọi t() trong code viết bằng tiếng Việt) — tiếng Anh là bản DỊCH, chỉ tra ngược khi người dùng
// chọn "English". Không đụng gì tới nội dung bài học (title/content/vocabulary... — luôn song
// ngữ theo thiết kế gốc, không phải "giao diện"), CHỈ áp dụng cho chữ khung app (nút/menu/tiêu
// đề/thông báo/placeholder).
const LANG_KEY = "lea_ui_lang"; // "vi" | "en"

export function getUiLang() {
  try {
    return localStorage.getItem(LANG_KEY) === "en" ? "en" : "vi";
  } catch {
    return "vi";
  }
}

// Đổi ngôn ngữ NẠP LẠI TRANG (2026-08-12) — đơn giản/an toàn hơn hẳn việc tự re-render lại toàn
// bộ view đang mở (nhiều view có state cục bộ phức tạp, ví dụ lesson.js) — người dùng đổi ngôn
// ngữ ở Cài đặt, không phải hành động cần tức khắc không tải lại được.
export function setUiLang(lang) {
  try {
    localStorage.setItem(LANG_KEY, lang === "en" ? "en" : "vi");
  } catch {
    // Lỗi lưu không nên chặn đổi ngôn ngữ trong phiên hiện tại.
  }
  location.reload();
}

// Từ điển tiếng Việt (khoá, ĐÚNG NGUYÊN VĂN chữ dùng trong code) -> tiếng Anh (giá trị). CHỈ
// chứa chữ KHUNG APP (nút/menu/tiêu đề/thông báo/placeholder) — không chứa nội dung bài học.
// Nhóm theo file để dễ tìm/bổ sung khi thêm màn mới.
const DICT = {};

// t(str) trả về NGUYÊN VĂN "str" khi ngôn ngữ = Tiếng Việt (mặc định), hoặc bản dịch tiếng Anh
// tương ứng trong DICT khi ngôn ngữ = English — KHÔNG BAO GIỜ trả về rỗng/lỗi nếu thiếu bản dịch
// (rơi về nguyên văn tiếng Việt, an toàn hơn hẳn hiện trống).
export function t(str) {
  if (getUiLang() !== "en") return str;
  return DICT[str] || str;
}

// Gộp thêm bản dịch vào từ điển chung — mỗi file view tự import + gọi 1 lần lúc module load,
// tránh 1 file DICT khổng lồ duy nhất khó merge khi nhiều người/nhiều lượt cùng sửa.
export function registerTranslations(entries) {
  Object.assign(DICT, entries);
}
