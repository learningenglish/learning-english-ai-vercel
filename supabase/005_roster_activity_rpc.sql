-- ============================================================
-- RPC bổ sung: get_roster_activity() — cho tutor xem last_sign_in_at
-- của CHÍNH những student trong roster của mình. auth.users không cho
-- client SELECT trực tiếp (schema auth được Supabase khoá riêng), nên
-- cần 1 RPC SECURITY DEFINER, tự scope theo auth.uid() giống 2 RPC
-- trước (find_student_by_email, get_my_roster) — không mở quyền xem
-- auth.users của toàn hệ thống.
-- Chạy sau 001, 002, 003, 004.
-- ============================================================
create or replace function public.get_roster_activity()
returns table (student_id uuid, last_sign_in_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select u.id, u.last_sign_in_at
  from auth.users u
  join public.tutor_students ts on ts.student_id = u.id
  where ts.tutor_id = auth.uid();
$$;

grant execute on function public.get_roster_activity() to authenticated;
