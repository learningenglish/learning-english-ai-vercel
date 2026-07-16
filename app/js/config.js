// app/js/config.js — hằng số cấu hình client. Không có build step nên mọi module khác
// import trực tiếp file này, không có biến môi trường thật ở phía client.

// Khoá công khai Supabase (giống hệt giá trị đã dùng ở api/chat.js — "khoá công khai,
// giống hệt frontend" theo đúng comment gốc ở đó), an toàn để commit.
export const SUPABASE_URL = "https://ijwttrlxsmgaqxszphlp.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_D6NUatDu3ZapsLRwjKiBJw_Uh0ku3An";

// APP_SECRET không phải bí mật thật theo nghĩa bảo mật (app cũ cũng đã nhúng thẳng trong
// app.js phía client, chỉ để chặn spam/scraping thô sơ qua 1 header cố định) — PHẢI khớp
// CHÍNH XÁC biến môi trường APP_SECRET trên Vercel, nếu không MỌI request /api/chat đều bị
// 401 "Unauthorized". Đã xác nhận khớp bằng cách gọi thật /api/chat trên preview (JWT giả
// -> nhận đúng lỗi "Vui lòng đăng nhập" thay vì "Unauthorized", tức bước secret đã qua).
export const APP_SECRET = "Learning-English-AI";
