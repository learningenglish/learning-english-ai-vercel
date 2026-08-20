-- ============================================================
-- "Gói tặng" — thêm 2 mốc thời hạn NGÀY (2026-08-20, Minh: "Trong gói tặng, thêm cho tôi gói 3
-- ngày và 5 ngày" — dùng cho tài khoản thử nghiệm/đối tác test ngắn hạn, khác hẳn 3/6/12 THÁNG cũ
-- dành cho khách thật). Tổng quát hoá cột "months" (chỉ hiểu THÁNG) thành cặp
-- "duration_value" + "duration_unit" ('day' | 'month') để 1 cột duy nhất diễn tả được cả 2 đơn vị,
-- không cần thêm cột riêng cho từng đơn vị. Áp dụng cho CẢ "package_grants" (audit, đã tặng ngay)
-- lẫn "pending_package_grants" (lên lịch, tặng cho email chưa đăng ký) — 2 bảng này LUÔN đi cùng
-- cặp (xem 041/043), phải đổi đồng bộ.
--
-- Chạy sau 045.
-- ============================================================

-- 1) package_grants: months -> duration_value + duration_unit ------------------------------
alter table public.package_grants rename column months to duration_value;
alter table public.package_grants add column if not exists duration_unit text not null default 'month';
alter table public.package_grants alter column duration_unit drop default;
alter table public.package_grants drop constraint if exists package_grants_months_check;
alter table public.package_grants drop constraint if exists package_grants_duration_check;
alter table public.package_grants add constraint package_grants_duration_check
  check (
    (duration_unit = 'day' and duration_value in (3, 5))
    or (duration_unit = 'month' and duration_value in (3, 6, 12))
  );

-- 2) pending_package_grants: months -> duration_value + duration_unit ----------------------
alter table public.pending_package_grants rename column months to duration_value;
alter table public.pending_package_grants add column if not exists duration_unit text not null default 'month';
alter table public.pending_package_grants alter column duration_unit drop default;
alter table public.pending_package_grants drop constraint if exists pending_package_grants_months_check;
alter table public.pending_package_grants drop constraint if exists pending_package_grants_duration_check;
alter table public.pending_package_grants add constraint pending_package_grants_duration_check
  check (
    (duration_unit = 'day' and duration_value in (3, 5))
    or (duration_unit = 'month' and duration_value in (3, 6, 12))
  );

-- 3) grant_package() — chữ ký THAM SỐ đổi khác (p_months -> p_duration_value+p_duration_unit),
--    "CREATE OR REPLACE" KHÔNG thay thế được hàm có chữ ký khác — phải DROP bản cũ trước, tránh để
--    2 overload cùng tên tồn tại song song trong DB (bản cũ mồ côi, không ai gọi tới nữa).
--    "(p_duration_value || ' ' || p_duration_unit)::interval" — Postgres hiểu ĐÚNG cả số ít/nhiều
--    ("3 day"/"6 month" đều hợp lệ, không cần hậu tố "s").
drop function if exists public.grant_package(uuid, text, integer, text);
create or replace function public.grant_package(
  p_student_id uuid,
  p_tier text,
  p_duration_value integer,
  p_duration_unit text,
  p_granted_by text
)
returns table(ok boolean, message text, package_tier text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits int;
  v_expires timestamptz;
begin
  if p_tier not in ('A1_A2', 'B1', 'B2') then
    return query select false, 'Gói không hợp lệ.', null::text, null::timestamptz;
    return;
  end if;
  if not (
    (p_duration_unit = 'day' and p_duration_value in (3, 5))
    or (p_duration_unit = 'month' and p_duration_value in (3, 6, 12))
  ) then
    return query select false, 'Thời hạn không hợp lệ.', null::text, null::timestamptz;
    return;
  end if;
  if not exists (select 1 from public.students where id = p_student_id) then
    return query select false, 'Không tìm thấy tài khoản học viên.', null::text, null::timestamptz;
    return;
  end if;

  v_credits := public.package_monthly_credits(p_tier);
  v_expires := now() + (p_duration_value || ' ' || p_duration_unit)::interval;

  update public.students
    set package_tier = p_tier,
        ai_credits_balance = v_credits,
        ai_credits_reset_at = date_trunc('month', now()),
        subscription_status = 'active',
        subscription_expires_at = v_expires
    where id = p_student_id;

  insert into public.package_grants (student_id, tier, duration_value, duration_unit, granted_by_email, expires_at)
    values (p_student_id, p_tier, p_duration_value, p_duration_unit, p_granted_by, v_expires);

  return query select true, 'Đã tặng gói.', p_tier, v_expires;
end;
$$;

-- 4) schedule_package_grant() — chữ ký tham số đổi khác, CÙNG lý do DROP trước như grant_package().
drop function if exists public.schedule_package_grant(text, text, integer, text);
create or replace function public.schedule_package_grant(
  p_email text,
  p_tier text,
  p_duration_value integer,
  p_duration_unit text,
  p_granted_by text
)
returns table(ok boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tier not in ('A1_A2', 'B1', 'B2') then
    return query select false, 'Gói không hợp lệ.';
    return;
  end if;
  if not (
    (p_duration_unit = 'day' and p_duration_value in (3, 5))
    or (p_duration_unit = 'month' and p_duration_value in (3, 6, 12))
  ) then
    return query select false, 'Thời hạn không hợp lệ.';
    return;
  end if;

  insert into public.pending_package_grants (email, tier, duration_value, duration_unit, granted_by_email)
    values (lower(trim(p_email)), p_tier, p_duration_value, p_duration_unit, p_granted_by);

  return query select true, 'Đã lên lịch.';
end;
$$;

-- 5) handle_new_user() — CREATE OR REPLACE, đọc "duration_value"/"duration_unit" thay "months".
--    Toàn bộ phần Mentor (nhánh else) GIỮ NGUYÊN 100%, không đụng.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'student');
  v_grant record;
  v_credits int;
  v_expires timestamptz;
begin
  if v_role = 'student' then
    insert into public.students (id, email, full_name)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');

    select * into v_grant
    from public.pending_package_grants
    where lower(email) = lower(new.email) and applied_at is null
    order by created_at desc
    limit 1;

    if found then
      v_credits := public.package_monthly_credits(v_grant.tier);
      v_expires := now() + (v_grant.duration_value || ' ' || v_grant.duration_unit)::interval;

      update public.students
        set package_tier = v_grant.tier,
            ai_credits_balance = v_credits,
            ai_credits_reset_at = date_trunc('month', now()),
            subscription_status = 'active',
            subscription_expires_at = v_expires
        where id = new.id;

      insert into public.package_grants (student_id, tier, duration_value, duration_unit, granted_by_email, expires_at)
        values (new.id, v_grant.tier, v_grant.duration_value, v_grant.duration_unit, v_grant.granted_by_email, v_expires);

      update public.pending_package_grants
        set applied_at = now()
        where id = v_grant.id;
    end if;
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
