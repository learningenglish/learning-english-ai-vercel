-- ============================================================
-- "Gói tặng" — Admin (kimchinamvn@gmail.com, xem ADMIN_EMAILS trong billing.js) cấp thủ công 1 gói
-- trả phí (A1_A2/B1/B2) cho 1 tài khoản cụ thể trong 3/6/12 tháng, KHÔNG qua thanh toán thật
-- (2026-08-20, Minh: "Tặng 3 tháng, Tặng 6 tháng, Tặng 1 năm cho các level" — cho tài khoản được
-- admin duyệt, vd đối tác/người dùng thử nghiệm/khuyến mãi).
--
-- TÁCH RIÊNG khỏi "payment_orders"/"confirm_payment_order" (040) — gói tặng KHÔNG có đơn hàng/số
-- tiền thật, dùng chung logic đó sẽ phải nhồi amount=0 giả tạo, không đúng bản chất. Bảng
-- "package_grants" chỉ để AUDIT (ai tặng, tặng gì, khi nào) — KHÔNG phải nguồn xác định quyền truy
-- cập hiện tại (nguồn đó vẫn là students.package_tier/subscription_expires_at như thường, cùng cơ
-- chế hết-hạn-hạ-về-FREE đã có ở consume_ai_credits()/effective_package_tier() trong 040).
--
-- Chạy sau 040.
-- ============================================================

create table if not exists public.package_grants (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  tier text not null check (tier in ('A1_A2', 'B1', 'B2')),
  months integer not null check (months in (3, 6, 12)),
  granted_by_email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists package_grants_student_idx
  on public.package_grants (student_id, created_at desc);

alter table public.package_grants enable row level security;
-- Không có policy nào cho "authenticated" -> mọi đọc/ghi đều qua service role
-- (api/_generate/billing.js), giống "payment_orders" ở 040.

-- Atomic: kích hoạt "students" + ghi audit "package_grants" cùng 1 transaction. CỐ Ý không grant
-- execute cho "authenticated" — chỉ service_role gọi (admin_grant_package() đã tự kiểm tra quyền
-- admin qua ADMIN_EMAILS trước khi gọi RPC này, giống confirm_payment_order()).
create or replace function public.grant_package(
  p_student_id uuid,
  p_tier text,
  p_months integer,
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
  if p_months not in (3, 6, 12) then
    return query select false, 'Thời hạn không hợp lệ.', null::text, null::timestamptz;
    return;
  end if;
  if not exists (select 1 from public.students where id = p_student_id) then
    return query select false, 'Không tìm thấy tài khoản học viên.', null::text, null::timestamptz;
    return;
  end if;

  v_credits := public.package_monthly_credits(p_tier);
  v_expires := now() + (p_months || ' months')::interval;

  update public.students
    set package_tier = p_tier,
        ai_credits_balance = v_credits,
        ai_credits_reset_at = date_trunc('month', now()),
        subscription_status = 'active',
        subscription_expires_at = v_expires
    where id = p_student_id;

  insert into public.package_grants (student_id, tier, months, granted_by_email, expires_at)
    values (p_student_id, p_tier, p_months, p_granted_by, v_expires);

  return query select true, 'Đã tặng gói.', p_tier, v_expires;
end;
$$;
