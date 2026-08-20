-- ============================================================
-- Admin KHÔNG giới hạn (2026-08-20, Minh: "admin là không giới hạn") — tài khoản admin
-- (kimchinamvn@gmail.com, khớp ADMIN_EMAILS trong api/_generate/billing.js) trước đây vẫn bị tính
-- là gói Free bình thường (3 credit/tháng, giới hạn bài học, giới hạn đổi chuyên ngành) — dùng hết
-- credit ngay trong lúc test như user thường. Thêm cột "is_admin", bỏ qua MỌI giới hạn Credit +
-- xem bài + đổi chuyên ngành khi cột này = true.
--
-- Chạy sau 043.
-- ============================================================

alter table public.students
  add column if not exists is_admin boolean not null default false;

-- Đặt is_admin cho admin hiện tại — KHÔNG tự động đồng bộ theo ADMIN_EMAILS (SQL không đọc được
-- biến môi trường Node) — thêm admin mới sau này cần chạy tay 1 câu UPDATE tương tự.
update public.students set is_admin = true where lower(email) = 'kimchinamvn@gmail.com';

create or replace function public.is_admin_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(is_admin, false) from public.students where id = p_student_id;
$$;

-- ============================================================
-- can_view_lesson() — CREATE OR REPLACE, thêm bước bỏ qua NGAY ĐẦU cho admin (sau khi xác nhận
-- bài tồn tại) — admin xem được MỌI bài bất kể gói/level.
-- ============================================================
create or replace function public.can_view_lesson(p_lesson_id uuid, p_uid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level text;
  v_industry text;
  v_spine_slot integer;
  v_tier text;
  v_limit integer;
  v_rank integer;
begin
  select level, industry, spine_slot
    into v_level, v_industry, v_spine_slot
  from public.lessons
  where id = p_lesson_id;

  if not found then
    return false;
  end if;

  if public.is_admin_student(p_uid) then
    return true;
  end if;

  v_tier := public.effective_package_tier(p_uid);
  if v_tier is null then
    return false;
  end if;

  if not (v_level = any(public.package_allowed_levels(v_tier))) then
    return false;
  end if;

  if v_tier <> 'FREE' then
    return true;
  end if;

  if v_spine_slot is null then
    return true;
  end if;

  v_limit := public.package_free_lesson_limit(v_level);

  select count(*)
    into v_rank
  from public.lessons
  where source = 'ai_generated'
    and level = v_level
    and industry is not distinct from v_industry
    and spine_slot is not null
    and spine_slot <= v_spine_slot;

  return v_rank <= v_limit;
end;
$$;

-- ============================================================
-- consume_ai_credits() — CREATE OR REPLACE, admin luôn được phép, KHÔNG trừ credit thật (giữ
-- nguyên số dư trong DB, chỉ trả về allowed=true + số hiển thị lớn cho UI).
-- ============================================================
create or replace function public.consume_ai_credits(p_student_id uuid, p_amount int default 2)
returns table(allowed boolean, message text, balance int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_balance int;
  v_reset_at timestamptz;
  v_sub_status text;
  v_sub_expires timestamptz;
  v_is_admin boolean;
  v_month_start timestamptz := date_trunc('month', now());
  v_cap int;
  v_downgrade boolean := false;
begin
  select package_tier, ai_credits_balance, ai_credits_reset_at, subscription_status, subscription_expires_at, is_admin
    into v_tier, v_balance, v_reset_at, v_sub_status, v_sub_expires, v_is_admin
  from public.students
  where id = p_student_id
  for update;

  if not found then
    return query select false, 'Không tìm thấy tài khoản học viên.', 0;
    return;
  end if;

  if v_is_admin then
    return query select true, null::text, 999999;
    return;
  end if;

  if v_sub_status = 'active' and v_sub_expires is not null and v_sub_expires < now() then
    v_tier := 'FREE';
    v_downgrade := true;
  end if;

  v_cap := public.package_monthly_credits(v_tier);

  if v_reset_at < v_month_start then
    v_balance := v_cap;
    v_reset_at := v_month_start;
  end if;

  if v_balance < p_amount then
    update public.students
      set ai_credits_reset_at = v_reset_at,
          package_tier = v_tier,
          subscription_status = case when v_downgrade then 'expired' else subscription_status end
      where id = p_student_id;
    return query select false, 'Đã hết Credit tháng này, nâng cấp gói hoặc chờ đầu tháng sau.', v_balance;
    return;
  end if;

  v_balance := v_balance - p_amount;
  update public.students
    set ai_credits_balance = v_balance,
        ai_credits_reset_at = v_reset_at,
        package_tier = v_tier,
        subscription_status = case when v_downgrade then 'expired' else subscription_status end
    where id = p_student_id;

  return query select true, null::text, v_balance;
end;
$$;
