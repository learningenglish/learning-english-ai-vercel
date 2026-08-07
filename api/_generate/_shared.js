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

// "Cổng gói Pro" (2026-08-07, Minh: "Tắt tính năng gói Pro") — TẮT theo yêu cầu, dùng CHUNG 1 cờ
// ở đây cho cả generate_lesson/analyze_user_text (lesson.js) lẫn Luyện viết (writing.js) và tự
// tạo đề (RPC consume_student_exam_credit, xem migration 036_disable_pro_exam_gate.sql) — bật
// lại = đổi false thành true, KHÔNG cần sửa gì khác ở các nơi gọi (cùng khuôn
// WRITING_LIMIT_ENFORCED đã có sẵn trong writing.js). Các hạn mức SỐ LƯỢNG (10 bài/ngày, 40 lượt
// phân tích/ngày, credit RPC free/basic/pro...) GIỮ NGUYÊN không đụng — cờ này CHỈ tắt riêng yêu
// cầu "phải là Pro mới dùng được TÍNH NĂNG", không phải toàn bộ hệ thống hạn mức/chi phí.
export const PRO_GATE_ENFORCED = false;
