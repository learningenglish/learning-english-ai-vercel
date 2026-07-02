-- ============================================================
-- RPC bổ sung: get_my_roster() — cho tutor xem tên/email của CHÍNH
-- những student đã có trong roster của mình (KHÔNG mở SELECT rộng lên
-- bảng "students" — tự scope theo auth.uid(), không thể lợi dụng để
-- xem roster của tutor khác).
-- Chạy sau 001, 002, 003.
-- ============================================================
create or replace function public.get_my_roster()
returns table (student_id uuid, email text, full_name text, added_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select s.id, s.email, s.full_name, ts.added_at
  from public.tutor_students ts
  join public.students s on s.id = ts.student_id
  where ts.tutor_id = auth.uid()
  order by ts.added_at desc;
$$;

grant execute on function public.get_my_roster() to authenticated;
