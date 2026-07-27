-- ============================================================
-- Luyện viết — thêm cột "genre" vào writing_task_requests để LƯU LẠI thể
-- loại AI đã chọn mỗi lượt giao đề (Minh chốt 2026-07-27 lần 2: bỏ hẳn
-- danh sách thể loại đóng chọn ngẫu nhiên ở server — model được TỰ DO
-- chọn thể loại, chỉ bị cấm lặp lại thể loại đã giao GẦN ĐÂY cho CHÍNH
-- người học đó). Cần cột này để đọc lại lịch sử 3-5 lượt gần nhất
-- (getRecentGenres() trong api/_generate/writing.js) trước khi giao đề
-- mới — không có cột này thì không có gì để so sánh "đã lặp thể loại
-- chưa".
--
-- Cột NULLABLE — dòng tạo TRƯỚC migration này (giai đoạn thử nghiệm
-- pool cố định) không có genre, coi như "không có lịch sử" khi đọc lại.
--
-- Chạy sau 026.
-- ============================================================

alter table public.writing_task_requests
  add column if not exists genre text;
