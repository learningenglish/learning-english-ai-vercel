-- ============================================================
-- "Gói tặng" cho email CHƯA TỪNG đăng ký (2026-08-20, Minh: "Báo không thấy tài khoản tặng. Cái
-- này phải set luôn, không đợi người ta đăng ký mới tặng được") — trước đây admin_grant_package()
-- chỉ tra được "students" (chỉ có sau khi email đó đăng nhập lần đầu, xem handle_new_user() ở
-- 035_new_signups_default_to_student.sql), báo lỗi "Không tìm thấy tài khoản" nếu Minh tặng
-- TRƯỚC khi người nhận đăng ký. Giờ: tặng cho email chưa có tài khoản -> LÊN LỊCH vào bảng này,
-- CREATE OR REPLACE handle_new_user() tự kiểm tra + áp dụng NGAY lúc tài khoản đó được tạo.
--
-- Chạy sau 042.
-- ============================================================

create table if not exists public.pending_package_grants (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  tier text not null check (tier in ('A1_A2', 'B1', 'B2')),
  months integer not null check (months in (3, 6, 12)),
  granted_by_email text not null,
  created_at timestamptz not null default now(),
  applied_at timestamptz -- null = đang chờ người nhận đăng ký, có giá trị = đã tự áp dụng
);

-- Tra theo email (không phân biệt hoa/thường — Supabase Auth tự chuẩn hoá email về chữ thường lúc
-- đăng ký, nhưng admin có thể gõ hoa/thường tuỳ ý lúc tặng) CHỈ trong các dòng CHƯA áp dụng.
create index if not exists pending_package_grants_email_idx
  on public.pending_package_grants (lower(email))
  where applied_at is null;

alter table public.pending_package_grants enable row level security;
-- Không có policy nào cho "authenticated" -> mọi đọc/ghi đều qua service role
-- (api/_generate/billing.js), giống "payment_orders"/"package_grants".

-- Lên lịch tặng gói cho 1 email chưa có tài khoản. CỐ Ý không grant execute cho "authenticated" —
-- chỉ service_role gọi (admin_grant_package() đã tự kiểm tra quyền admin trước khi gọi RPC này).
create or replace function public.schedule_package_grant(
  p_email text,
  p_tier text,
  p_months integer,
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
  if p_months not in (3, 6, 12) then
    return query select false, 'Thời hạn không hợp lệ.';
    return;
  end if;

  insert into public.pending_package_grants (email, tier, months, granted_by_email)
    values (lower(trim(p_email)), p_tier, p_months, p_granted_by);

  return query select true, 'Đã lên lịch.';
end;
$$;

-- ============================================================
-- CREATE OR REPLACE handle_new_user() — THÊM bước kiểm tra "pending_package_grants" ngay sau khi
-- tạo dòng "students" mới, tự áp dụng gói tặng nếu có (KHÔNG đổi gì phần tạo mentors, giữ nguyên
-- 100% logic gốc của 035_new_signups_default_to_student.sql).
-- ============================================================
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

    -- Gói tặng đang chờ (2026-08-20) — lấy dòng CHƯA áp dụng gần nhất khớp email này (hiếm khi có
    -- nhiều hơn 1, nhưng nếu có thì ưu tiên lượt tặng MỚI NHẤT).
    select * into v_grant
    from public.pending_package_grants
    where lower(email) = lower(new.email) and applied_at is null
    order by created_at desc
    limit 1;

    if found then
      v_credits := public.package_monthly_credits(v_grant.tier);
      v_expires := now() + (v_grant.months || ' months')::interval;

      update public.students
        set package_tier = v_grant.tier,
            ai_credits_balance = v_credits,
            ai_credits_reset_at = date_trunc('month', now()),
            subscription_status = 'active',
            subscription_expires_at = v_expires
        where id = new.id;

      insert into public.package_grants (student_id, tier, months, granted_by_email, expires_at)
        values (new.id, v_grant.tier, v_grant.months, v_grant.granted_by_email, v_expires);

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
