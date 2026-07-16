-- ============================================================
-- Student App (PWA) — bảng "lessons" (kiến trúc Lesson-first): AI sinh
-- 1 lần -> lưu trọn Lesson JSON -> mọi màn hình sau chỉ ĐỌC từ đây,
-- không gọi AI lại. Dùng chung cho cả 2 luồng tạo bài:
-- source='ai_generated' (tab "AI tạo bài học") và source='user_text'
-- (tab "Tôi có văn bản").
--
-- user_id trỏ THẲNG auth.users (không trỏ students/mentors riêng) —
-- theo đúng mẫu user_viewed_words/user_listen_stats ở 003 (dữ liệu
-- CHUNG cho auth.users bất kể vai trò), vì chủ MVP là Student nhưng
-- không có lý do kỹ thuật nào chặn Mentor tự tạo bài cho bản thân.
--
-- INSERT vào "lessons" KHÔNG có policy cho authenticated — bắt buộc đi
-- qua service role trong api/generate/lesson.js (generate_lesson /
-- analyze_user_text), giống nguyên tắc ở 001_tutors.sql ("INSERT tự
-- động qua trigger/service role, không cho client tự chèn") — tránh
-- học viên tạo bản ghi "lessons" giả để né credit engine. Cột được
-- phép CLIENT tự sửa trực tiếp qua Supabase client (không qua backend)
-- CHỈ có is_favorite (toggle tim) — chặn bằng GRANT theo cột ở cuối
-- file, cùng kiểu đã dùng cho mentor_shares.viewed_at ở 003.
--
-- Chạy sau 018.
-- ============================================================

-- ============================================================
-- 1) Bảng "lessons"
-- ============================================================
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('ai_generated', 'user_text')),
  title text not null,
  title_vi text not null,
  level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1')),
  detected_level text check (detected_level in ('A1', 'A2', 'B1', 'B2', 'C1')),
  situation text,
  content_type text not null check (content_type in ('dialogue', 'reading')),
  content jsonb not null,
  vocabulary jsonb not null,
  grammar jsonb not null,
  exercises jsonb not null,
  notes jsonb,
  xp_reward integer not null default 20,
  cover_image_url text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

-- Danh sách bài học (mới nhất trước) + bộ lọc Yêu thích
create index if not exists lessons_user_created_idx
  on public.lessons (user_id, created_at desc);

create index if not exists lessons_user_favorite_idx
  on public.lessons (user_id, is_favorite);

alter table public.lessons enable row level security;

-- Chỉ đọc/sửa/xoá bài học của chính mình — không có policy public nào khác
drop policy if exists "Users view own lessons" on public.lessons;
create policy "Users view own lessons"
  on public.lessons for select
  using (auth.uid() = user_id);

drop policy if exists "Users update own lessons" on public.lessons;
create policy "Users update own lessons"
  on public.lessons for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own lessons" on public.lessons;
create policy "Users delete own lessons"
  on public.lessons for delete
  using (auth.uid() = user_id);

-- Không tạo policy INSERT cho authenticated -> RLS chặn hết insert trực
-- tiếp từ client, chỉ service role (bypass RLS, dùng trong
-- api/generate/lesson.js) mới ghi được bảng này.

-- Giới hạn UPDATE trực tiếp từ client CHỈ ở cột is_favorite (toggle
-- tim) — client không được tự sửa content/vocabulary/grammar/exercises/
-- xp_reward dù RLS row-level đã cho phép UPDATE hàng của chính mình.
revoke update on public.lessons from authenticated;
grant update (is_favorite) on public.lessons to authenticated;

-- ============================================================
-- 2) Bảng "lesson_progress" — nuôi màn Tiếp tục học / Lịch sử / Thống kê.
--    1 dòng / (lesson, user) — dùng upsert (on conflict) từ client khi
--    qua trang hoặc làm xong bài tập, không gọi AI nên không cần qua
--    backend, cho phép client tự UPDATE trực tiếp qua Supabase client.
-- ============================================================
create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  completed_paragraphs integer not null default 0,
  completed_exercises jsonb not null default '[]'::jsonb,
  xp_earned integer not null default 0,
  last_opened_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (lesson_id, user_id)
);

-- Card "Tiếp tục học": bản ghi completed_at is null, mới mở gần nhất
create index if not exists lesson_progress_continue_idx
  on public.lesson_progress (user_id, last_opened_at desc)
  where completed_at is null;

alter table public.lesson_progress enable row level security;

drop policy if exists "Users manage own lesson progress" on public.lesson_progress;
create policy "Users manage own lesson progress"
  on public.lesson_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
