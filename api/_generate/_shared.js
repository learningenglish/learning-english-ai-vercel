// api/_generate/_shared.js — helper dùng chung cho các module trong api/_generate/ (đặt
// tiền tố "_" cho file này cũng vì lý do tương tự thư mục cha: không phải action, không
// export gì đăng ký vào ACTIONS map của chat.js, chỉ để các action khác trong CÙNG thư mục
// import). Bản COPY nguyên văn từ hằng số tương ứng trong chat.js (chat.js "đóng băng",
// không thể import ngược) — mọi action mới trong api/_generate/ nên import từ ĐÂY thay vì tự
// copy lại lần nữa.
//
// Gọi AI (OpenAI/Gemini) KHÔNG còn ở file này nữa — đã chuyển sang api/_shared/aiProvider.js
// (lớp trừu tượng nhà cung cấp AI dùng chung cho TOÀN BỘ codebase, không riêng api/_generate/)
// từ 2026-07-22. Import { generateText, generateStructuredJSON, generateSpeech } từ đó.
export const SUPABASE_URL = "https://ijwttrlxsmgaqxszphlp.supabase.co";
