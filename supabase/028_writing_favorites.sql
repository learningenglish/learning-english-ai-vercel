-- ============================================================
-- Luyện viết — "Lưu vào Yêu thích" (Việc 3 gốc + Item 7, chốt Minh 2026-07-27
-- lần 3). 2 LOẠI lưu riêng biệt, phân biệt bằng cột "kind":
--   - 'detailed' = "Lưu bài đã sửa" — bản kèm chú thích lỗi chi tiết theo câu
--     (segments + criteria + strengths + notices), lưu ở Bước 5 (Chi tiết bài viết).
--   - 'complete' = "Lưu bài hoàn chỉnh" HOẶC "Lưu bài tham khảo" — 2 tính năng
--     khác nhau (clean_rewrite dựa bài học viên vs reference_essay viết mới
--     hoàn toàn) nhưng GỘP CHUNG 1 loại lưu trữ theo đề xuất đã duyệt, phân biệt
--     bằng cột "variant" ('clean_rewrite' | 'reference_essay') + nhãn riêng ở UI.
--
-- QUYẾT ĐỊNH: bảng RIÊNG (KHÔNG tái dùng "lessons") — "lessons" gắn chặt kiến
-- trúc Lesson-first (content/vocabulary/grammar/exercises cho màn Bài học chi
-- tiết dialogue/reading), ép dữ liệu Luyện viết vào đó sẽ phải giả lập nhiều
-- cột không liên quan + có rủi ro đụng chạm code Phase B-H (màn Bài học chi
-- tiết/thẻ bài học) đang bị khoá không được sửa. Bảng riêng giữ Luyện viết độc
-- lập hoàn toàn, đúng nguyên tắc đã theo xuyên suốt tính năng này.
--
-- "content" (jsonb) hình dạng khác nhau theo "kind":
--   detailed  -> {criteria, strengths, segments, notices}
--   complete  -> {text, vocab?, patterns?, cover_image_url?} (vocab/patterns/
--                cover_image_url chỉ có ở variant='clean_rewrite')
--
-- Đọc (danh sách tab "Bài viết" trong Yêu thích + mở lại 1 mục đã lưu) qua
-- CLIENT trực tiếp (RLS "select own", giống listLessons() ở db.js) — GHI (lưu
-- mới) bắt buộc qua service role trong api/_generate/writing.js (action
-- save_writing_favorite), không có policy INSERT cho authenticated, giống hệt
-- nguyên tắc lessons/writing_submissions.
--
-- Chạy sau 027.
-- ============================================================

create table if not exists public.writing_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('detailed', 'complete')),
  variant text check (variant in ('clean_rewrite', 'reference_essay')),
  level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1')),
  industry text,
  task jsonb not null,
  overall_score integer,
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists writing_favorites_user_created_idx
  on public.writing_favorites (user_id, created_at desc);

alter table public.writing_favorites enable row level security;

drop policy if exists "Users view own writing favorites" on public.writing_favorites;
create policy "Users view own writing favorites"
  on public.writing_favorites for select
  using (auth.uid() = user_id);

-- Không tạo policy INSERT cho authenticated -> chỉ service role ghi được.
-- Không cần UPDATE/DELETE ở MVP này (bookmark tĩnh, chưa có yêu cầu bỏ lưu).
