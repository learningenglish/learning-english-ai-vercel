-- one-off_remove_legacy_freeform_lessons_2026-08-08.sql — dọn bài học cũ sinh qua form "Tạo bài
-- học" tự do TRƯỚC khi có hệ thống Chuyên ngành/spine (2026-08-08, Minh mục 12: "Các bài học cũ
-- không còn liên quan tới luồng này. Loại bỏ khỏi app").
--
-- TIÊU CHỈ ĐÃ TINH CHỈNH sau khi đối chiếu schema (xem docs/NHAT-KY-LAM-VIEC.md mục 2026-08-08):
-- KHÔNG dùng "thiếu spine_slot" một cách máy móc, vì "Phân tích văn bản" (source='user_text',
-- tính năng ĐANG SỐNG, xem app/js/views/analysisArchive.js) cũng không có spine_slot — xoá theo
-- tiêu chí đó sẽ xoá NHẦM dữ liệu người dùng đang dùng thật. Chỉ xoá đúng nhóm
-- source='ai_generated' AND spine_slot IS NULL — bài sinh qua form tự do cũ (createLesson.js,
-- trước khi có industry/next_slot), áp dụng cho MỌI tài khoản. KHÔNG đụng 'user_text',
-- news_lessons, writing_favorites (bảng khác).
--
-- CÁCH CHẠY: dán vào Supabase SQL Editor. XEM SỐ LƯỢNG Ở CÂU SELECT TRƯỚC — nếu con số hợp lý
-- (khớp ước tính "bài rác" cũ) mới chạy tiếp câu DELETE bên dưới. 2 câu TÁCH RIÊNG có chủ đích,
-- không gộp 1 lệnh để Minh có cơ hội dừng lại trước khi xoá thật.

-- 1) Xem trước số lượng sẽ bị xoá
select count(*) as will_delete
from public.lessons
where source = 'ai_generated' and spine_slot is null;

-- 2) Xoá thật — CHỈ chạy sau khi đã xem số lượng ở câu trên và thấy hợp lý
delete from public.lessons
where source = 'ai_generated' and spine_slot is null;
