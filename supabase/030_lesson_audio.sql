-- ============================================================
-- Âm thanh chất lượng cao TRẢ PHÍ cho bài đọc/hội thoại CÓ LĨNH VỰC trong
-- Thư viện AI (2026-07-29, Minh: "người dùng trả phí, âm thanh cần nghe tự
-- nhiên" — bản đầu định đổi TOÀN BỘ âm thanh, sau THU HẸP lại: chỉ áp dụng
-- lessons.source='ai_generated' AND industry IS NOT NULL, KHÔNG đụng bài
-- Tin tức/Phân tích văn bản/Giao tiếp tổng quát — những bài đó vẫn dùng
-- Web Speech miễn phí như cũ, xem api/_generate/audio.js).
--
-- SINH LƯỜI lúc bấm Phát lần đầu (KHÔNG sinh ngay lúc tạo bài — tạo bài vốn
-- đã gần trần 60s ở B2/C1, không nên kéo dài thêm), lưu vĩnh viễn vào cột
-- "audio_urls" (mảng URL song song với "content", null = chưa sinh) — lần
-- sau (kể cả người khác nếu bài dùng chung) không tốn phí lại, cùng triết
-- lý "tốn 1 lần, mọi lượt sau miễn phí" đã dùng cho cache tra từ cùng ngày.
--
-- Chạy sau 029.
-- ============================================================

alter table public.lessons
  add column if not exists audio_urls jsonb not null default '[]'::jsonb;

-- KHÔNG cần GRANT/REVOKE riêng cho cột này — public.lessons đã "revoke
-- update ... from authenticated; grant update (is_favorite) ..." từ
-- 019_lessons.sql, cột mới tự động thừa hưởng: chỉ service role (backend,
-- api/_generate/audio.js) ghi được, client không đụng trực tiếp được.

-- Bucket Storage lưu file audio đã sinh — công khai đọc (URL nhúng thẳng
-- vào thẻ <audio>, không qua header xác thực nào), CHỈ service role ghi
-- (bỏ qua RLS Storage hoàn toàn khi dùng SUPABASE_SERVICE_ROLE_KEY, không
-- cần policy insert/update riêng cho "authenticated").
insert into storage.buckets (id, name, public)
values ('lesson-audio', 'lesson-audio', true)
on conflict (id) do nothing;

drop policy if exists "Public read lesson-audio" on storage.objects;
create policy "Public read lesson-audio"
  on storage.objects for select
  using (bucket_id = 'lesson-audio');
