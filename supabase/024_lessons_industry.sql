-- ============================================================
-- Thêm public.lessons.industry — nhãn "lĩnh vực/ngành nghề" (ưu tiên
-- data.industry, rớt về data.field nếu chỉ điền 1 trong 2) người dùng
-- điền ở "Tuỳ chọn nâng cao" của form Tạo bài học (views/createLesson.js).
-- TRƯỚC ĐÂY 2 trường này CHỈ dùng dựng prompt (buildGenerateLessonUserPrompt
-- ở api/_generate/lesson.js), không persist — nay cần lưu lại để màn
-- "Thư viện AI" nhóm bài theo lĩnh vực thành card lướt ngang (yêu cầu
-- người dùng 2026-07-23, xem views/lessons.js::renderIndustrySection).
--
-- Cột NULLABLE — bài tạo TRƯỚC migration này sẽ có industry=null (hiện
-- nhóm "Chưa phân loại" ở UI), chỉ bài mới từ nay có đầy đủ dữ liệu.
-- KHÔNG thêm GRANT/policy gì khác — cột này chỉ được ghi lúc INSERT qua
-- service role (api/_generate/lesson.js), giống mọi cột khác ngoài
-- is_favorite (xem 019_lessons.sql, "revoke update ... grant update
-- (is_favorite)").
--
-- Chạy sau 023.
-- ============================================================

alter table public.lessons
  add column if not exists industry text;

-- Đếm số bài / lĩnh vực nhanh (views/lessons.js gọi group theo industry
-- cho user hiện tại, chỉ áp dụng bài source='ai_generated').
create index if not exists lessons_user_industry_idx
  on public.lessons (user_id, industry)
  where industry is not null;
