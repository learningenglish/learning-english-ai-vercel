-- ============================================================
-- Đổi tên "Tutor" -> "Mentor" trong toàn bộ schema (bảng, cột, index,
-- policy, trigger, function). KHÔNG đổi bảng/cột liên quan "Student"
-- (giữ nguyên students, student_id, student_exam_submissions...).
-- Chạy sau 001, 002, 003, 004, 005. Các file 001-005 GIỮ NGUYÊN không
-- sửa lại (đó là lịch sử migration đã chạy thật với tên cũ) — file này
-- là migration RENAME chính thức, chạy trên database đã có dữ liệu.
--
-- An toàn dữ liệu: ALTER TABLE ... RENAME TO / RENAME COLUMN chỉ đổi
-- tên trong catalog, KHÔNG copy/mất dữ liệu. RLS policy và foreign key
-- tự động bám theo tên mới (Postgres theo dõi bằng OID, không theo
-- text). CHỈ có phần thân function (plpgsql/sql) là text thuần nên
-- PHẢI create-or-replace lại — đã liệt kê đủ ở cuối file.
-- ============================================================

-- ============================================================
-- 1) Đổi tên bảng
-- ============================================================
alter table if exists public.tutors            rename to mentors;
alter table if exists public.tutor_folders     rename to mentor_folders;
alter table if exists public.tutor_history     rename to mentor_history;
alter table if exists public.tutor_saved_words rename to mentor_saved_words;
alter table if exists public.tutor_exams       rename to mentor_exams;
alter table if exists public.tutor_students    rename to mentor_students;
alter table if exists public.tutor_shares      rename to mentor_shares;

-- ============================================================
-- 2) Đổi tên cột tutor_id -> mentor_id trên các bảng vừa đổi tên
-- ============================================================
alter table public.mentor_folders     rename column tutor_id to mentor_id;
alter table public.mentor_history     rename column tutor_id to mentor_id;
alter table public.mentor_saved_words rename column tutor_id to mentor_id;
alter table public.mentor_exams       rename column tutor_id to mentor_id;
alter table public.mentor_students    rename column tutor_id to mentor_id;
alter table public.mentor_shares      rename column tutor_id to mentor_id;

-- ============================================================
-- 3) Đổi tên index (cosmetic, không bắt buộc nhưng cho nhất quán)
-- ============================================================
alter index if exists public.tutor_folders_auto_unique     rename to mentor_folders_auto_unique;
alter index if exists public.tutor_folders_exam_sub_unique rename to mentor_folders_exam_sub_unique;

-- ============================================================
-- 4) Đổi tên trigger + policy có chữ "Tutor" trong tên (cosmetic,
--    logic bên trong KHÔNG đổi vì Postgres tự bám theo cột/bảng mới)
-- ============================================================
alter trigger tutors_set_updated_at on public.mentors rename to mentors_set_updated_at;

alter policy "Tutors can view own profile" on public.mentors rename to "Mentors can view own profile";
alter policy "Tutors can update own profile" on public.mentors rename to "Mentors can update own profile";
alter policy "Tutors manage own history" on public.mentor_history rename to "Mentors manage own history";
alter policy "Tutors manage own saved words" on public.mentor_saved_words rename to "Mentors manage own saved words";
alter policy "Tutors manage own folders" on public.mentor_folders rename to "Mentors manage own folders";
alter policy "Tutors manage own exams" on public.mentor_exams rename to "Mentors manage own exams";
alter policy "Tutors manage own roster" on public.mentor_students rename to "Mentors manage own roster";
alter policy "Tutors manage own shares" on public.mentor_shares rename to "Mentors manage own shares";
alter policy "Tutors view submissions for own exams" on public.student_exam_submissions rename to "Mentors view submissions for own exams";
alter policy "Tutors view roster viewed words" on public.user_viewed_words rename to "Mentors view roster viewed words";
alter policy "Tutors view roster listen stats" on public.user_listen_stats rename to "Mentors view roster listen stats";

comment on table public.mentors is 'Tài khoản Mentor (giáo viên) độc lập. academy_id sẽ được thêm ở giai đoạn có Academy.';

-- ============================================================
-- 5) CREATE OR REPLACE lại các function có TEXT thân hàm tham chiếu
--    tên bảng/cột cũ — bắt buộc, vì thân function KHÔNG tự đổi theo
--    khi rename bảng/cột (khác với RLS policy/FK).
-- ============================================================

-- 5a) Trigger tạo hồ sơ khi có auth user mới
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'mentor');
begin
  if v_role = 'student' then
    insert into public.students (id, email, full_name)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  else
    insert into public.mentors (id, email, full_name)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');

    insert into public.mentor_folders (mentor_id, name, level, folder_type, is_auto)
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

-- 5b) RPC tra cứu roster (find_student_by_email không đổi vì không tham chiếu mentor)
create or replace function public.get_my_roster()
returns table (student_id uuid, email text, full_name text, added_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select s.id, s.email, s.full_name, ts.added_at
  from public.mentor_students ts
  join public.students s on s.id = ts.student_id
  where ts.mentor_id = auth.uid()
  order by ts.added_at desc;
$$;

create or replace function public.get_roster_activity()
returns table (student_id uuid, last_sign_in_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select u.id, u.last_sign_in_at
  from auth.users u
  join public.mentor_students ts on ts.student_id = u.id
  where ts.mentor_id = auth.uid();
$$;

-- 5c) Trigger dọn share treo khi nội dung/đề gốc bị xoá
create or replace function public.cleanup_shares_on_history_delete()
returns trigger
language plpgsql
as $$
begin
  delete from public.mentor_shares where item_type = 'history' and item_id = old.id;
  return old;
end;
$$;

create or replace function public.cleanup_shares_on_exam_delete()
returns trigger
language plpgsql
as $$
begin
  delete from public.mentor_shares where item_type = 'exam' and item_id = old.id;
  return old;
end;
$$;
