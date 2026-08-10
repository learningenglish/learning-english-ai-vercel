-- ============================================================
-- One-off (2026-08-10, CẬP NHẬT — gộp cả đợt 10 và đợt 11, chạy file NÀY THAY CHO bản cũ hơn
-- nếu đã lỡ tải xuống, KHÔNG chạy 2 lần với 2 danh sách id khác nhau).
--
-- Đợt 10, Minh: "Những bài cũ xóa hết. Sinh cho tôi 1 bài A2, 1 bài B1 trong kế toán để tôi
-- test. chú thích #1a2, #1b1..." — đã sinh:
--   A2 reading  id=0461c884-a8df-44b4-b585-779d4c458674 "Daily Accounting Tasks"
--   B1 dialogue id=91cd53f8-cef3-4a46-9c74-b38da70f468a "Daily Accounting Work"
--
-- Đợt 11, Minh: "Sau khi sửa lỗi, Sinh thêm 2 bài: 1 bài A2 #2a2, 1 bài B1 #2b1..." — đã sinh
-- THÊM (không xoá 2 bài đợt 10, Minh không yêu cầu xoá lại lần này):
--   A2 reading  id=2eeb7dd2-c71d-46d2-912e-8bec4759109c "Checking Bills and Receipts"
--   B1 dialogue id=10b2657f-c1ee-4d61-bcf6-9f985d59d5cc "Preparing the Year-End Financial Report"
--
-- Bước 1: xoá TOÀN BỘ bài học CŨ, CHỈ GIỮ 4 bài mẫu trên (loại trừ theo id, an toàn dù chạy
-- sớm/muộn). "lesson_progress" tự xoá theo (FK "on delete cascade", xem 019_lessons.sql).
delete from public.lessons
where id not in (
  '0461c884-a8df-44b4-b585-779d4c458674',
  '91cd53f8-cef3-4a46-9c74-b38da70f468a',
  '2eeb7dd2-c71d-46d2-912e-8bec4759109c',
  '10b2657f-c1ee-4d61-bcf6-9f985d59d5cc'
);

-- Bước 2: gắn chú thích "#1a2"/"#1b1"/"#2a2"/"#2b1" vào ĐẦU title + title_vi của đúng 4 bài mẫu,
-- để Minh nhận ra ngay đây là bài sinh-mới-để-test (không lẫn với bài thật sau này).
update public.lessons
set title = '#1a2 ' || title, title_vi = '#1a2 ' || title_vi
where id = '0461c884-a8df-44b4-b585-779d4c458674';

update public.lessons
set title = '#1b1 ' || title, title_vi = '#1b1 ' || title_vi
where id = '91cd53f8-cef3-4a46-9c74-b38da70f468a';

update public.lessons
set title = '#2a2 ' || title, title_vi = '#2a2 ' || title_vi
where id = '2eeb7dd2-c71d-46d2-912e-8bec4759109c';

update public.lessons
set title = '#2b1 ' || title, title_vi = '#2b1 ' || title_vi
where id = '10b2657f-c1ee-4d61-bcf6-9f985d59d5cc';
