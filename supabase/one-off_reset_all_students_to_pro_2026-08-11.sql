-- one-off_reset_all_students_to_pro_2026-08-11.sql
-- Minh (2026-08-11): "các gói sinh bài hãy loại bỏ hết. Bây giờ không còn ý nghĩa ở app này.
-- Hãy reset tất cả tài khoản thành bình thường. Tôi sẽ trao đổi về gói tài khoản sau."
--
-- Bối cảnh (đã xác nhận qua đọc code trước khi viết file này):
-- - PRO_GATE_ENFORCED (api/_generate/_shared.js) đã = false từ 2026-08-07 -> cổng "chỉ gói Pro"
--   cho sinh bài/phân tích văn bản/Luyện viết đã TẮT, không phụ thuộc cột "plan" nữa.
-- - CÒN 1 cơ chế plan-based THẬT vẫn đang chạy: consume_student_credit() (007_student_tiers.sql)
--   giới hạn theo "students.plan": 'free' = 30 lượt/tháng, 'basic' = 5 lượt/ngày (kèm khoá đúng
--   trình độ Mentor), 'pro' = KHÔNG giới hạn. Đây là nơi DUY NHẤT còn phân biệt gói thật.
-- - Cách "reset về bình thường, không còn phân biệt gói" ĐÚNG NGHĨA "không ai bị chặn" (không
--   phải đưa mọi người về mức giới hạn NHIỀU NHẤT) là đưa TẤT CẢ về 'pro' — giữ nguyên cột/cơ chế
--   "plan" trong DB (Minh nói sẽ bàn lại gói tài khoản sau, không xoá hạ tầng), chỉ khiến nó
--   KHÔNG còn giới hạn ai lúc này.
--
-- An toàn: KHÔNG xoá cột/bảng nào, chỉ UPDATE giá trị "plan". Có thể chạy lại nhiều lần (idempotent).
update public.students
set plan = 'pro'
where plan is distinct from 'pro';
