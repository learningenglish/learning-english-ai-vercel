-- ============================================================
-- 3 tầng Student: Free / Basic (79k) / Pro (299k)
-- Chạy sau 001-006. Đọc kèm ghi chú trong từng phần để hiểu lý do
-- thiết kế (đặc biệt phần 2 và phần 5, có rủi ro bảo mật nếu làm sai).
-- ============================================================

-- ============================================================
-- 1) Cột mới trên "students"
-- ============================================================
alter table public.students
  add column if not exists level text check (level in ('A1-A2','B1','B2')),
  add column if not exists plan text not null default 'free' check (plan in ('free','basic','pro')),
  add column if not exists daily_credit_used integer not null default 0,
  add column if not exists daily_credit_reset_date date not null default current_date,
  add column if not exists monthly_credit_used integer not null default 0,
  add column if not exists monthly_credit_reset_date date not null default date_trunc('month', current_date)::date;

-- ============================================================
-- 2) Khoá cột: Student chỉ được tự sửa full_name của chính mình.
--    Mentor và Student dùng CHUNG 1 role Postgres "authenticated" nên
--    GRANT cấp cột không thể tách "Mentor được sửa level" khỏi
--    "Student được sửa full_name" trên CÙNG một dòng (khác với
--    mentor_shares.viewed_at, nơi chỉ có MỘT actor). Vì vậy level đi
--    qua RPC set_student_level() ở mục 3, không dùng GRANT cột trực
--    tiếp cho Mentor.
-- ============================================================
revoke update on public.students from authenticated;
grant update (full_name) on public.students to authenticated;

-- ============================================================
-- 3) Mentor gán level cho Student — RPC SECURITY DEFINER, tự giới hạn
--    theo roster (giống find_student_by_email()/get_my_roster()).
-- ============================================================
create or replace function public.set_student_level(p_student_id uuid, p_level text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_level is not null and p_level not in ('A1-A2','B1','B2') then
    raise exception 'invalid level';
  end if;
  if not exists (
    select 1 from public.mentor_students
    where mentor_id = auth.uid() and student_id = p_student_id
  ) then
    raise exception 'not authorized';
  end if;
  update public.students set level = p_level where id = p_student_id;
end;
$$;

grant execute on function public.set_student_level(uuid, text) to authenticated;

-- ============================================================
-- 4) Mở rộng get_my_roster() để UI Mentor xem được plan/level hiện tại
--    (PHẢI drop trước — CREATE OR REPLACE không đổi được kiểu trả về
--    của hàm RETURNS TABLE khi số cột/tên cột thay đổi so với bản cũ
--    ở 004_roster_rpc.sql, dù nội dung logic không đổi)
-- ============================================================
drop function if exists public.get_my_roster();
create or replace function public.get_my_roster()
returns table (student_id uuid, email text, full_name text, added_at timestamptz, level text, plan text)
language sql
security definer
set search_path = public
as $$
  select s.id, s.email, s.full_name, ts.added_at, s.level, s.plan
  from public.mentor_students ts
  join public.students s on s.id = ts.student_id
  where ts.mentor_id = auth.uid()
  order by ts.added_at desc;
$$;

-- ============================================================
-- 5) Kiểm tra + trừ credit nguyên tử (1 transaction, "for update" khoá
--    dòng tránh race condition khi bấm nhanh 2 lần). CHỈ được chat.js
--    gọi bằng service_role key — KHÔNG grant execute cho "authenticated".
--    Nếu Student tự gọi được hàm này với p_student_id tuỳ ý, có thể rút
--    credit của Student khác hoặc lách qua khoá level ở client.
-- ============================================================
create or replace function public.consume_student_credit(p_student_id uuid, p_requested_level text)
returns table(allowed boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_level text;
  v_daily_used int;
  v_daily_reset date;
  v_monthly_used int;
  v_monthly_reset date;
  v_today date := current_date;
  v_month_start date := date_trunc('month', current_date)::date;
begin
  select plan, level, daily_credit_used, daily_credit_reset_date,
         monthly_credit_used, monthly_credit_reset_date
  into v_plan, v_level, v_daily_used, v_daily_reset, v_monthly_used, v_monthly_reset
  from public.students
  where id = p_student_id
  for update;

  if not found then
    return query select false, 'Không tìm thấy tài khoản học viên.';
    return;
  end if;

  if v_plan = 'pro' then
    return query select true, null::text;
    return;
  end if;

  if v_plan = 'free' then
    if v_monthly_reset < v_month_start then
      v_monthly_used := 0;
      v_monthly_reset := v_month_start;
    end if;
    if v_monthly_used >= 30 then
      update public.students set monthly_credit_reset_date = v_monthly_reset where id = p_student_id;
      return query select false, 'Đã hết lượt trải nghiệm tháng này, nâng cấp gói để dùng nhiều hơn.';
      return;
    end if;
    update public.students
      set monthly_credit_used = v_monthly_used + 1, monthly_credit_reset_date = v_monthly_reset
      where id = p_student_id;
    return query select true, null::text;
    return;
  end if;

  if v_plan = 'basic' then
    if v_daily_reset < v_today then
      v_daily_used := 0;
      v_daily_reset := v_today;
    end if;
    if v_daily_used >= 5 then
      update public.students set daily_credit_reset_date = v_daily_reset where id = p_student_id;
      return query select false, 'Đã hết lượt hôm nay, quay lại ngày mai hoặc nâng cấp Pro.';
      return;
    end if;
    if v_level is not null and p_requested_level is not null and p_requested_level <> v_level then
      return query select false, 'Trình độ không khớp với trình độ Mentor đã gán cho bạn.';
      return;
    end if;
    update public.students
      set daily_credit_used = v_daily_used + 1, daily_credit_reset_date = v_daily_reset
      where id = p_student_id;
    return query select true, null::text;
    return;
  end if;

  return query select false, 'Gói không hợp lệ.';
end;
$$;
-- CỐ Ý không grant execute cho "authenticated" — chỉ service_role (chat.js) mới gọi được
