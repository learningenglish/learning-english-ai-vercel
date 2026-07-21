-- ============================================================
-- "Cấu trúc câu hay dùng" — mục MỚI trong tab Ngữ pháp (không thêm tab), độc lập với
-- "grammar" (điểm ngữ pháp trọng tâm, GIỮ NGUYÊN không đổi). Xem api/_generate/lesson.js
-- (generate_lesson + analyze_user_text, cả 2 luồng đều ghi cột này) + docs/prompt-ai-tao-
-- bai-hoc.md + docs/prompt-phan-tich-van-ban.md.
--
-- Chạy sau 021.
-- ============================================================
alter table public.lessons
  add column if not exists sentence_patterns jsonb not null default '[]'::jsonb;
