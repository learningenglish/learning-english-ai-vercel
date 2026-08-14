-- ============================================================
-- Tự lưu trữ ảnh bìa bài học (2026-08-14, Minh: "tôi không muốn khi app chạy
-- sẽ bị lỗi tải hình" — trước đây cover_image_url trỏ THẲNG ra URL Unsplash/
-- Pexels/Wikimedia, không có bản lưu tại app -> phụ thuộc hoàn toàn uptime
-- của 3 nguồn ngoài, hiện lỗi ảnh vỡ nếu link đó chết. Minh sau đó tự đề
-- xuất: "ảnh khi hiển thị đã được thu nhỏ... lưu ảnh đang thu nhỏ" — đo thật
-- xác nhận bản nhỏ (w=200, "thumb") chỉ 5-10KB, bản vừa (w=400, "small")
-- 13-29KB, quá nhỏ để ngại tải về lưu hẳn, giống đúng triết lý "sinh 1 lần,
-- lưu vĩnh viễn" đã dùng cho audio (030_lesson_audio.sql)).
--
-- Kiến trúc: search_lesson_cover_image (api/_generate/coverImage.js) vẫn chỉ
-- TÌM 2 cỡ URL ngoài (không đổi, các API Unsplash/Pexels/Wikimedia đã tự
-- resize sẵn, không cần xử lý ảnh phía app) -> set_lesson_cover_image giờ
-- TẢI BYTES về + ĐẨY LÊN bucket "lesson-covers" của chính app, lưu link NỘI
-- BỘ vào 2 cột dưới đây thay vì lưu thẳng link ngoài.
--
-- "cover_source_url": vẫn giữ base URL của ảnh GỐC bên ngoài (không phải để
-- hiển thị) — publish-lesson.mjs dùng để CHỐNG TRÙNG ẢNH giữa các bài (dò
-- theo photo ID gốc của Unsplash/Pexels) — nếu chỉ so link nội bộ
-- (.../lesson-covers/{lessonId}/...) thì KHÔNG BAO GIỜ trùng vì luôn khác
-- lessonId, mất hẳn khả năng phát hiện 2 bài vô tình dùng chung 1 tấm ảnh
-- gốc (bug thật đã gặp 2026-08-13, xem coverImageBaseUrl() trong
-- publish-lesson.mjs).
--
-- Chạy sau 038.
-- ============================================================

alter table public.lessons
  add column if not exists cover_thumb_url text,
  add column if not exists cover_source_url text;

-- KHÔNG cần GRANT/REVOKE riêng cho 2 cột mới — kế thừa đúng "revoke update
-- ... grant update (is_favorite) ..." đã áp cho cả bảng ở 019_lessons.sql,
-- chỉ service role (backend) ghi được.

alter table public.word_image_cache
  add column if not exists thumb_url text;

-- Bucket Storage lưu ảnh bìa đã tải về + lưu vĩnh viễn — công khai đọc
-- (nhúng thẳng vào thẻ <img>), CHỈ service role ghi, đúng khuôn "lesson-audio"
-- ở 030_lesson_audio.sql.
insert into storage.buckets (id, name, public)
values ('lesson-covers', 'lesson-covers', true)
on conflict (id) do nothing;

drop policy if exists "Public read lesson-covers" on storage.objects;
create policy "Public read lesson-covers"
  on storage.objects for select
  using (bucket_id = 'lesson-covers');
