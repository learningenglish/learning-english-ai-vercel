-- ============================================================
-- Folder + Đề/Bài kiểm tra + Tài khoản Student + Chia sẻ + Nộp bài +
-- Theo dõi hoạt động học tập dùng chung (viewed words / listen stats).
-- Chạy trong Supabase Dashboard > SQL Editor, SAU 001 và 002.
-- Thứ tự trong file này QUAN TRỌNG (có phụ thuộc), chạy từ trên xuống.
-- (Thay thế hoàn toàn bản 003 trước đó — CHƯA ai chạy bản cũ nên an toàn.)
-- ============================================================

-- ============================================================
-- 1) Bảng "students" (tài khoản học viên) — trước để trigger dùng được
-- ============================================================
create table if not exists public.students (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.students enable row level security;

drop policy if exists "Students can view own profile" on public.students;
create policy "Students can view own profile"
  on public.students for select
  using (auth.uid() = id);

drop policy if exists "Students can update own profile" on public.students;
create policy "Students can update own profile"
  on public.students for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- 2) Bảng "tutor_folders" — dùng ĐÚNG 3-nhóm level như normalizeLibLevel()
--    của credit engine (A1-A2/B1/B2, gộp A1 vào A1-A2) để nhất quán
--    toàn bộ hệ thống level trong app.
-- ============================================================
create table if not exists public.tutor_folders (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  name text not null,
  level text not null check (level in ('A1-A2', 'B1', 'B2')),
  parent_folder_id uuid references public.tutor_folders (id) on delete cascade,
  folder_type text not null check (folder_type in ('content', 'exam_sub', 'review')),
  is_auto boolean not null default false,
  created_at timestamptz not null default now()
);

-- Mỗi tutor chỉ có đúng 1 folder auto (Chưa phân loại / Ôn Tập) cho mỗi level
create unique index if not exists tutor_folders_auto_unique
  on public.tutor_folders (tutor_id, level, folder_type)
  where is_auto = true;

-- Mỗi folder content chỉ có đúng 1 folder con "Đề kiểm tra" (exam_sub)
create unique index if not exists tutor_folders_exam_sub_unique
  on public.tutor_folders (parent_folder_id)
  where folder_type = 'exam_sub';

alter table public.tutor_folders enable row level security;

drop policy if exists "Tutors manage own folders" on public.tutor_folders;
create policy "Tutors manage own folders"
  on public.tutor_folders for all
  using (auth.uid() = tutor_id)
  with check (auth.uid() = tutor_id);

-- Backfill: seed 6 folder auto (2 loại x 3 level) cho các tutor ĐÃ tồn tại
-- (tutor tạo sau khi chạy file này sẽ được seed tự động qua trigger ở bước 4)
insert into public.tutor_folders (tutor_id, name, level, folder_type, is_auto)
select t.id, v.name, v.level, v.folder_type, true
from public.tutors t
cross join (values
  ('Chưa phân loại', 'A1-A2', 'content'),
  ('Ôn Tập',          'A1-A2', 'review'),
  ('Chưa phân loại', 'B1',    'content'),
  ('Ôn Tập',          'B1',    'review'),
  ('Chưa phân loại', 'B2',    'content'),
  ('Ôn Tập',          'B2',    'review')
) as v(name, level, folder_type)
on conflict do nothing;

-- ============================================================
-- 3) tutor_history: thêm cột folder_id (bắt buộc, có backfill).
--    ON DELETE RESTRICT: không cho xoá 1 folder content nếu còn nội
--    dung bên trong — app phải tự xử lý xong (xoá hoặc chuyển sang
--    "Chưa phân loại") trước, DB chặn hộ nếu app quên.
-- ============================================================
alter table public.tutor_history
  add column if not exists folder_id uuid references public.tutor_folders (id) on delete restrict;

-- Backfill: gán mỗi dòng lịch sử cũ vào đúng folder "Chưa phân loại" của
-- level đã CHUẨN HOÁ (gộp A1/A2 vào A1-A2 — giống hệt normalizeLibLevel()
-- phía client dùng cho credit engine, để 2 hệ thống nhất quán)
update public.tutor_history h
set folder_id = f.id
from public.tutor_folders f
where f.tutor_id = h.tutor_id
  and f.folder_type = 'content'
  and f.is_auto = true
  and f.level = (
    case
      when h.level in ('A1', 'A1-A2', 'A2') then 'A1-A2'
      when h.level = 'B1' then 'B1'
      when h.level = 'B2' then 'B2'
      else 'A1-A2'
    end
  )
  and h.folder_id is null;

alter table public.tutor_history alter column folder_id set not null;

-- ============================================================
-- 4) Trigger tạo hồ sơ khi có auth user mới — mở rộng để xử lý CẢ
--    tutor lẫn student (phân biệt qua raw_user_meta_data->>'role').
--    Không có role (tài khoản tutor cũ) -> mặc định 'tutor' (tương thích ngược).
-- ============================================================
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_tutor();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'tutor');
begin
  if v_role = 'student' then
    insert into public.students (id, email, full_name)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  else
    insert into public.tutors (id, email, full_name)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');

    insert into public.tutor_folders (tutor_id, name, level, folder_type, is_auto)
    values
      (new.id, 'Chưa phân loại', 'A1-A2', 'content', true),
      (new.id, 'Ôn Tập',          'A1-A2', 'review',  true),
      (new.id, 'Chưa phân loại', 'B1',    'content', true),
      (new.id, 'Ôn Tập',          'B1',    'review',  true),
      (new.id, 'Chưa phân loại', 'B2',    'content', true),
      (new.id, 'Ôn Tập',          'B2',    'review',  true);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 5) Bảng "tutor_exams" — migrate hẳn từ localStorage (saved_exams/exam_*).
--    folder_id LUÔN trỏ thẳng vào folder con exam_sub (cho "Đề") hoặc
--    folder "Ôn Tập" (cho "Bài Kiểm Tra") — không bao giờ trỏ folder cha.
-- ============================================================
create table if not exists public.tutor_exams (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  folder_id uuid not null references public.tutor_folders (id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('de', 'bai_kiem_tra')),
  exam_type text not null check (exam_type in ('ielts', 'ptth', 'vocab')),
  level text not null check (level in ('A1-A2', 'B1', 'B2')),
  duration_minutes integer,
  questions_count integer not null default 0,
  payload jsonb not null,
  last_score numeric,
  created_at timestamptz not null default now()
);

alter table public.tutor_exams enable row level security;

drop policy if exists "Tutors manage own exams" on public.tutor_exams;
create policy "Tutors manage own exams"
  on public.tutor_exams for all
  using (auth.uid() = tutor_id)
  with check (auth.uid() = tutor_id);

-- ============================================================
-- 6) Bảng "tutor_students" (roster) + RPC tra cứu student theo email
-- ============================================================
create table if not exists public.tutor_students (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (tutor_id, student_id)
);

alter table public.tutor_students enable row level security;

drop policy if exists "Tutors manage own roster" on public.tutor_students;
create policy "Tutors manage own roster"
  on public.tutor_students for all
  using (auth.uid() = tutor_id)
  with check (auth.uid() = tutor_id);

drop policy if exists "Students view own roster entries" on public.tutor_students;
create policy "Students view own roster entries"
  on public.tutor_students for select
  using (auth.uid() = student_id);

-- SECURITY DEFINER — cho phép tutor tìm đúng 1 student theo email chính
-- xác, KHÔNG mở quyền đọc toàn bộ bảng students (không cho duyệt/liệt kê)
create or replace function public.find_student_by_email(p_email text)
returns table (id uuid, email text, full_name text)
language sql
security definer
set search_path = public
as $$
  select id, email, full_name from public.students where email = p_email;
$$;

grant execute on function public.find_student_by_email(text) to authenticated;

-- ============================================================
-- 7) Bảng "tutor_shares" (chia sẻ nội dung/đề cho học viên)
--    viewed_at: null cho đến khi student thực sự mở xem.
-- ============================================================
create table if not exists public.tutor_shares (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  item_type text not null check (item_type in ('history', 'exam')),
  item_id uuid not null, -- trỏ tutor_history.id hoặc tutor_exams.id tuỳ item_type (không FK trực tiếp vì tham chiếu đa hình)
  shared_at timestamptz not null default now(),
  viewed_at timestamptz,
  unique (tutor_id, student_id, item_type, item_id)
);

alter table public.tutor_shares enable row level security;

drop policy if exists "Tutors manage own shares" on public.tutor_shares;
create policy "Tutors manage own shares"
  on public.tutor_shares for all
  using (auth.uid() = tutor_id)
  with check (auth.uid() = tutor_id);

drop policy if exists "Students view own shares" on public.tutor_shares;
create policy "Students view own shares"
  on public.tutor_shares for select
  using (auth.uid() = student_id);

-- Student được phép tự đánh dấu "đã xem" — RLS chỉ kiểm soát được THEO
-- DÒNG (student_id = auth.uid()), không giới hạn theo CỘT, nên phải
-- chặn thêm bằng quyền cấp cột: chỉ cho UPDATE đúng cột viewed_at, tránh
-- việc student tự sửa item_id/item_type để "share" chui sang nội dung/đề
-- khác mà tutor chưa từng chia sẻ cho họ.
drop policy if exists "Students mark shares viewed" on public.tutor_shares;
create policy "Students mark shares viewed"
  on public.tutor_shares for update
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

revoke update on public.tutor_shares from authenticated;
grant update (viewed_at) on public.tutor_shares to authenticated;

-- ============================================================
-- 8) Mở rộng RLS: học viên được SELECT đúng history/exam đã được chia sẻ
--    (các policy "for all" của tutor ở migration 002 và mục 5 vẫn giữ nguyên;
--    thêm policy SELECT bổ sung riêng cho student, Postgres OR các policy lại)
-- ============================================================
drop policy if exists "Students view shared history" on public.tutor_history;
create policy "Students view shared history"
  on public.tutor_history for select
  using (exists (
    select 1 from public.tutor_shares s
    where s.item_type = 'history' and s.item_id = tutor_history.id and s.student_id = auth.uid()
  ));

drop policy if exists "Students view shared exams" on public.tutor_exams;
create policy "Students view shared exams"
  on public.tutor_exams for select
  using (exists (
    select 1 from public.tutor_shares s
    where s.item_type = 'exam' and s.item_id = tutor_exams.id and s.student_id = auth.uid()
  ));

-- ============================================================
-- 9) Trigger dọn "tutor_shares" khi nội dung/đề gốc bị xoá — tránh
--    tham chiếu treo (item_id không có FK cứng vì đa hình nên phải
--    dọn thủ công bằng trigger, không thể nhờ ON DELETE CASCADE).
-- ============================================================
create or replace function public.cleanup_shares_on_history_delete()
returns trigger
language plpgsql
as $$
begin
  delete from public.tutor_shares where item_type = 'history' and item_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_cleanup_shares_history on public.tutor_history;
create trigger trg_cleanup_shares_history
  after delete on public.tutor_history
  for each row execute function public.cleanup_shares_on_history_delete();

create or replace function public.cleanup_shares_on_exam_delete()
returns trigger
language plpgsql
as $$
begin
  delete from public.tutor_shares where item_type = 'exam' and item_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_cleanup_shares_exam on public.tutor_exams;
create trigger trg_cleanup_shares_exam
  after delete on public.tutor_exams
  for each row execute function public.cleanup_shares_on_exam_delete();

-- ============================================================
-- 10) Bảng "student_exam_submissions" — cho phép làm lại nhiều lần,
--     mỗi lần nộp là 1 dòng MỚI (không ghi đè). KHÔNG có policy
--     update/delete cho ai cả -> dữ liệu bất biến sau khi insert.
-- ============================================================
create table if not exists public.student_exam_submissions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.tutor_exams (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  answers jsonb not null,
  score numeric,
  breakdown jsonb, -- breakdown theo Vocab/Reading/Listening/Writing từ examSubmit()
  submitted_at timestamptz not null default now()
);

alter table public.student_exam_submissions enable row level security;

drop policy if exists "Students insert own submissions" on public.student_exam_submissions;
create policy "Students insert own submissions"
  on public.student_exam_submissions for insert
  with check (auth.uid() = student_id);

drop policy if exists "Students view own submissions" on public.student_exam_submissions;
create policy "Students view own submissions"
  on public.student_exam_submissions for select
  using (auth.uid() = student_id);

drop policy if exists "Tutors view submissions for own exams" on public.student_exam_submissions;
create policy "Tutors view submissions for own exams"
  on public.student_exam_submissions for select
  using (exists (
    select 1 from public.tutor_exams e
    where e.id = student_exam_submissions.exam_id and e.tutor_id = auth.uid()
  ));

-- ============================================================
-- 11) "user_viewed_words" / "user_listen_stats" — hoạt động học tập
--     DÙNG CHUNG cho auth.users (cả tutor lẫn student), KHÔNG tách
--     riêng theo vai trò. GIỚI HẠN PHẠM VI: 2 bảng này chỉ phục vụ
--     Tutor xem 1 Student cụ thể (qua roster) hoặc chính user xem bản
--     thân — KHÔNG đổ lên báo cáo/thống kê cấp Academy sau này.
-- ============================================================
create table if not exists public.user_viewed_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  word_key text not null,
  lemma text,
  meaning text,
  level text,
  content_source_id uuid references public.tutor_history (id) on delete set null,
  viewed_at timestamptz not null default now(),
  unique (user_id, word_key)
);

alter table public.user_viewed_words enable row level security;

drop policy if exists "Users manage own viewed words" on public.user_viewed_words;
create policy "Users manage own viewed words"
  on public.user_viewed_words for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Tutors view roster viewed words" on public.user_viewed_words;
create policy "Tutors view roster viewed words"
  on public.user_viewed_words for select
  using (exists (
    select 1 from public.tutor_students ts
    where ts.student_id = user_viewed_words.user_id and ts.tutor_id = auth.uid()
  ));

create table if not exists public.user_listen_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content_source_id uuid not null references public.tutor_history (id) on delete cascade,
  listen_count integer not null default 0,
  total_seconds integer not null default 0,
  last_listened_at timestamptz,
  unique (user_id, content_source_id)
);

alter table public.user_listen_stats enable row level security;

drop policy if exists "Users manage own listen stats" on public.user_listen_stats;
create policy "Users manage own listen stats"
  on public.user_listen_stats for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Tutors view roster listen stats" on public.user_listen_stats;
create policy "Tutors view roster listen stats"
  on public.user_listen_stats for select
  using (exists (
    select 1 from public.tutor_students ts
    where ts.student_id = user_listen_stats.user_id and ts.tutor_id = auth.uid()
  ));
