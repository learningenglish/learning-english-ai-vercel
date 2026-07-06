-- ============================================================
-- Student Pro cần thư viện học tập giống Mentor (mục 2 trong pivot ưu
-- tiên) — bước đầu tiên: cho Student folder THẬT (student_folders),
-- mirror mentor_folders, thay vì chỉ 1 danh sách phẳng như
-- 015_student_pro_exams.sql đã làm tạm thời.
--
-- KHÁC BIỆT so với mentor_folders (có chủ đích, không phải thiếu sót):
-- - level check CÓ 4 giá trị (A1, A1-A2, B1, B2) thay vì 3 (A1-A2, B1,
--   B2) như mentor_folders. Lý do: saveStudentHistory() ở app.js:1188
--   đã lưu "A1" tách riêng, KHÔNG gộp vào "A1-A2" như Mentor
--   (normalizeLibLevel() chỉ áp dụng phía Mentor). Đổi student_folders
--   sang 3 nhóm sẽ lệch với dữ liệu student_history hiện có → giữ 4
--   nhóm để khớp đúng dữ liệu thật, không cần migrate lại level cũ.
--
-- Chạy sau 015. Trước khi chạy: đã soát RLS (students manage own +
-- không có policy PUBLIC/anon nào bị hở).
-- ============================================================

-- ============================================================
-- 1) Bảng "student_folders"
-- ============================================================
create table if not exists public.student_folders (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  name text not null,
  level text not null check (level in ('A1', 'A1-A2', 'B1', 'B2')),
  parent_folder_id uuid references public.student_folders (id) on delete cascade,
  folder_type text not null check (folder_type in ('content', 'exam_sub', 'review')),
  is_auto boolean not null default false,
  created_at timestamptz not null default now()
);

-- Mỗi student chỉ có đúng 1 folder auto (Chưa phân loại / Ôn Tập) cho mỗi level
create unique index if not exists student_folders_auto_unique
  on public.student_folders (student_id, level, folder_type)
  where is_auto = true;

-- Mỗi folder content chỉ có đúng 1 folder con "Đề kiểm tra" (exam_sub)
create unique index if not exists student_folders_exam_sub_unique
  on public.student_folders (parent_folder_id)
  where folder_type = 'exam_sub';

alter table public.student_folders enable row level security;

drop policy if exists "Students manage own folders" on public.student_folders;
create policy "Students manage own folders"
  on public.student_folders for all
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

-- Backfill: seed 8 folder auto (2 loại x 4 level) cho student ĐÃ tồn tại
-- (student tạo sau khi chạy file này được seed tự động qua trigger ở bước 3)
insert into public.student_folders (student_id, name, level, folder_type, is_auto)
select s.id, v.name, v.level, v.folder_type, true
from public.students s
cross join (values
  ('Chưa phân loại', 'A1',    'content'),
  ('Ôn Tập',          'A1',    'review'),
  ('Chưa phân loại', 'A1-A2', 'content'),
  ('Ôn Tập',          'A1-A2', 'review'),
  ('Chưa phân loại', 'B1',    'content'),
  ('Ôn Tập',          'B1',    'review'),
  ('Chưa phân loại', 'B2',    'content'),
  ('Ôn Tập',          'B2',    'review')
) as v(name, level, folder_type)
on conflict do nothing;

-- ============================================================
-- 2) student_history: thêm cột folder_id (bắt buộc, có backfill).
--    Khớp trực tiếp theo level (không cần gộp A1→A1-A2 như Mentor, vì
--    student_folders đã có đủ 4 nhóm khớp đúng level đang lưu).
-- ============================================================
alter table public.student_history
  add column if not exists folder_id uuid references public.student_folders (id) on delete restrict;

update public.student_history h
set folder_id = f.id
from public.student_folders f
where f.student_id = h.student_id
  and f.folder_type = 'content'
  and f.is_auto = true
  and f.level = coalesce(h.level, 'A1-A2')
  and h.folder_id is null;

alter table public.student_history alter column folder_id set not null;

-- ============================================================
-- 3) Trigger handle_new_user(): mở rộng để seed student_folders khi có
--    student mới đăng ký (mentor giữ nguyên hành vi cũ, không đổi).
-- ============================================================
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

    insert into public.student_folders (student_id, name, level, folder_type, is_auto)
    values
      (new.id, 'Chưa phân loại', 'A1',    'content', true),
      (new.id, 'Ôn Tập',          'A1',    'review',  true),
      (new.id, 'Chưa phân loại', 'A1-A2', 'content', true),
      (new.id, 'Ôn Tập',          'A1-A2', 'review',  true),
      (new.id, 'Chưa phân loại', 'B1',    'content', true),
      (new.id, 'Ôn Tập',          'B1',    'review',  true),
      (new.id, 'Chưa phân loại', 'B2',    'content', true),
      (new.id, 'Ôn Tập',          'B2',    'review',  true);
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

-- ============================================================
-- 4) RLS bổ sung trên mentor_folders — CẦN để phía Student đọc được
--    TÊN folder gốc của nội dung/đề đã được chia sẻ cho mình (phục vụ
--    hiển thị nhóm động ở "Được chia sẻ" — mục 2 trong bối cảnh mới).
--    KHÔNG đổi gì ở mentor_shares — chỉ thêm policy SELECT có điều
--    kiện này trên mentor_folders. EXISTS tự động làm folder "biến
--    mất" khỏi kết quả khi share cuối cùng trỏ vào nó bị gỡ, không cần
--    dọn dẹp thủ công gì thêm.
-- ============================================================
drop policy if exists "Students view folders behind shared items" on public.mentor_folders;
create policy "Students view folders behind shared items"
  on public.mentor_folders for select
  using (
    exists (
      select 1 from public.mentor_shares s
      join public.mentor_history h on h.id = s.item_id
      where s.item_type = 'history' and h.folder_id = mentor_folders.id and s.student_id = auth.uid()
    )
    or exists (
      select 1 from public.mentor_shares s
      join public.mentor_exams e on e.id = s.item_id
      where s.item_type = 'exam' and e.folder_id = mentor_folders.id and s.student_id = auth.uid()
    )
  );
