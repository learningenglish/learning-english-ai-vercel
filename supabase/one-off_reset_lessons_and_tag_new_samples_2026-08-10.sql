-- ============================================================
-- One-off (2026-08-10, Minh: "Những bài cũ xóa hết. Sinh cho tôi 1 bài A2, 1 bài B1 trong kế
-- toán để tôi test. chú thích #1a2, #1b1 để tôi biết là sinh mới test cho dễ.")
--
-- Đã sinh 2 bài mẫu MỚI (Kế toán, tài khoản test kimchinamvn+studentpro1@gmail.com — bộ giáo
-- trình dùng chung, xem 038_lessons_shared_curriculum.sql):
--   A2 reading  id=0461c884-a8df-44b4-b585-779d4c458674 "Daily Accounting Tasks"
--   B1 dialogue id=91cd53f8-cef3-4a46-9c74-b38da70f468a "Daily Accounting Work"
--
-- Bước 1: xoá TOÀN BỘ bài học CŨ, CHỈ GIỮ 2 bài mẫu mới vừa sinh ở trên (loại trừ theo id, an
-- toàn dù chạy sớm/muộn hơn lúc 2 bài mới được tạo). "lesson_progress" tự xoá theo (FK "on
-- delete cascade", xem 019_lessons.sql), không cần xoá tay riêng.
delete from public.lessons
where id not in (
  '0461c884-a8df-44b4-b585-779d4c458674',
  '91cd53f8-cef3-4a46-9c74-b38da70f468a'
);

-- Bước 2: gắn chú thích "#1a2"/"#1b1" vào ĐẦU title + title_vi của đúng 2 bài mẫu mới, để Minh
-- nhận ra ngay đây là bài sinh-mới-để-test (không lẫn với bài thật sau này).
update public.lessons
set title = '#1a2 ' || title, title_vi = '#1a2 ' || title_vi
where id = '0461c884-a8df-44b4-b585-779d4c458674';

update public.lessons
set title = '#1b1 ' || title, title_vi = '#1b1 ' || title_vi
where id = '91cd53f8-cef3-4a46-9c74-b38da70f468a';
