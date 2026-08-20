-- ============================================================
-- Gói User (Free/A1-A2/B1/B2) + AI Credits dùng chung + đổi chuyên ngành theo bộ đếm
-- + đơn hàng thanh toán nội địa VN qua VietQR (2026-08-20, spec "CƠ CẤU GÓI MOSAIC" Minh gửi).
--
-- NGUỒN CẤU HÌNH THẬT của gói/level/credit/limit nằm ở api/_shared/packages.js (client mirror:
-- app/js/packageConfig.js, CHỈ hiển thị) — các hàm SQL bên dưới (package_monthly_credits,
-- package_allowed_levels, package_free_lesson_limit) LẶP LẠI cùng con số để RLS/RPC tự kiểm tra
-- được ngay trong Postgres mà không cần gọi ngược ra Node. Khi đổi số ở packages.js, PHẢI đổi
-- đồng bộ 3 hàm này (đã ghi chú tại từng hàm).
--
-- KHÔNG đụng "students.plan"/"consume_student_credit" (007_student_tiers.sql) — hệ Mentor-Student
-- roster cũ, không liên quan luồng Student App này. Cột/RPC mới ở đây độc lập hoàn toàn.
--
-- Chạy sau 039.
-- ============================================================

-- ============================================================
-- 1) Cột mới trên "students"
-- ============================================================
alter table public.students
  add column if not exists package_tier text not null default 'FREE'
    check (package_tier in ('FREE', 'A1_A2', 'B1', 'B2')),
  add column if not exists ai_credits_balance int not null default 5,
  add column if not exists ai_credits_reset_at timestamptz not null default date_trunc('month', now()),
  add column if not exists specialization_switch_count int not null default 0,
  -- Cột thanh toán — provider-agnostic (không đặt cột riêng cho VietQR/VNPay/... để đổi cổng sau
  -- không cần migration lại), xem payment_orders + confirm_payment_order() ở mục 5.
  add column if not exists subscription_status text not null default 'none'
    check (subscription_status in ('none', 'active', 'expired')),
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists payment_provider text,
  add column if not exists provider_customer_ref text;

-- Cột mới KHÔNG cần revoke/grant riêng — 007_student_tiers.sql đã "revoke update on students from
-- authenticated" rồi chỉ "grant update (full_name)", nên mọi cột thêm sau (kể cả các cột trên) mặc
-- định KHÔNG client-tự-sửa-được, chỉ service role (api/_generate/*.js) ghi được — đúng ý muốn.

-- ============================================================
-- 2) Hàm tra cứu cấu hình gói — LẶP LẠI api/_shared/packages.js PACKAGE_CONFIG, sửa 1 nơi phải sửa
--    cả 2 nơi (ghi chú ở đầu file).
-- ============================================================
create or replace function public.package_monthly_credits(p_tier text)
returns int
language sql
immutable
as $$
  select case p_tier
    when 'FREE' then 5
    when 'A1_A2' then 30
    when 'B1' then 50
    when 'B2' then 70
    else 0
  end;
$$;

create or replace function public.package_allowed_levels(p_tier text)
returns text[]
language sql
immutable
as $$
  select case p_tier
    when 'FREE' then array['A1', 'A2', 'B1', 'B2']
    when 'A1_A2' then array['A1', 'A2']
    when 'B1' then array['B1']
    when 'B2' then array['B2']
    else array[]::text[]
  end;
$$;

-- Giới hạn bài Free THEO THỨ TỰ spine_slot trong đúng 1 cặp (level, industry) — không phải tổng số
-- bài đã học. industry NULL (Giao Tiếp Tổng Quát dùng chung/ai_generated không gắn ngành) cũng là
-- 1 "bucket" hợp lệ, xếp hạng riêng với từng ngành cụ thể.
create or replace function public.package_free_lesson_limit(p_level text)
returns int
language sql
immutable
as $$
  select case p_level
    when 'A1' then 5
    when 'A2' then 5
    when 'B1' then 3
    when 'B2' then 3
    else 0
  end;
$$;

-- ============================================================
-- 3) Gói hiệu lực THỰC TẾ của 1 student — tính luôn phần "hết hạn thuê bao thì coi như FREE" mà
--    KHÔNG ghi đè DB (hàm STABLE, không side-effect) — dùng an toàn bên trong RLS policy (mỗi dòng
--    được đánh giá lại, không nên có UPDATE trong đường đó). Việc GHI THẬT xuống package_tier=FREE
--    khi hết hạn được làm lười trong consume_ai_credits() ở mục 4 (đường đó đã "for update" sẵn).
-- ============================================================
create or replace function public.effective_package_tier(p_student_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when subscription_status = 'active'
      and subscription_expires_at is not null
      and subscription_expires_at < now()
    then 'FREE'
    else package_tier
  end
  from public.students
  where id = p_student_id;
$$;

-- ============================================================
-- 4) can_view_lesson() — thay policy đọc "lessons" ở 038_lessons_shared_curriculum.sql, đúng ghi chú
--    migration đó đã để lại: "Khi Minh triển khai phân gói tài khoản, cần viết lại policy này".
--    ĐÂY LÀ PHẦN RỦI RO CAO NHẤT của việc này — sai 1 điều kiện có thể khiến MỌI người dùng không
--    thấy bài học nào, hoặc ngược lại vẫn thấy hết. Test kỹ bằng tài khoản test thật trước khi coi
--    là xong (script test riêng, không chỉ đọc migration bằng mắt).
--
--    Quy tắc: gói trả phí (A1_A2/B1/B2) -> mở toàn bộ bài trong các level được phép (bất kể ngành,
--    kể cả Giao Tiếp Tổng Quát industry=NULL, vì PACKAGE_CONFIG hiện không tách limit riêng theo
--    ngành/chung). Gói FREE -> thêm điều kiện xếp hạng theo spine_slot, chỉ 5 bài A1 đầu + 5 A2 đầu +
--    3 B1 đầu + 3 B2 đầu của ĐÚNG 1 cặp (level, industry) tính theo thứ tự curriculum.
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

  v_tier := public.effective_package_tier(p_uid);
  if v_tier is null then
    -- Không có dòng "students" tương ứng (app này chỉ phục vụ Student, xem
    -- 035_new_signups_default_to_student.sql) -> từ chối, không mặc định cho xem.
    return false;
  end if;

  if not (v_level = any(public.package_allowed_levels(v_tier))) then
    return false;
  end if;

  if v_tier <> 'FREE' then
    return true;
  end if;

  if v_spine_slot is null then
    -- Bài không có thứ tự curriculum (thủ công/legacy) -> không chặn theo rank, tránh chặn nhầm
    -- bài hợp lệ chỉ vì thiếu metadata (xem ghi chú tương tự ở one-off_remove_legacy_freeform...).
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

grant execute on function public.can_view_lesson(uuid, uuid) to authenticated;

create index if not exists lessons_free_rank_idx
  on public.lessons (level, industry, spine_slot)
  where source = 'ai_generated' and spine_slot is not null;

drop policy if exists "Authenticated view shared curriculum or own lessons" on public.lessons;
create policy "View shared curriculum via package or own lessons"
  on public.lessons for select
  using (
    (source = 'ai_generated' and auth.uid() is not null and public.can_view_lesson(id, auth.uid()))
    or auth.uid() = user_id
  );

-- ============================================================
-- 5) AI Credits — MỘT ví dùng chung cho Phân tích AI + Luyện viết (spec: "không tạo hai ví
--    riêng"). TÁI DÙNG đúng khuôn "for update" khoá dòng + lazy-reset-theo-tháng đã có ở
--    consume_student_credit() (007_student_tiers.sql) — không phát minh khuôn mới cho cùng 1 vấn đề.
--    CỐ Ý không grant execute cho "authenticated" — chỉ service_role
--    (api/_generate/credits.js) gọi được, giống nguyên tắc consume_student_credit().
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
  v_month_start timestamptz := date_trunc('month', now());
  v_cap int;
  v_downgrade boolean := false;
begin
  select package_tier, ai_credits_balance, ai_credits_reset_at, subscription_status, subscription_expires_at
    into v_tier, v_balance, v_reset_at, v_sub_status, v_sub_expires
  from public.students
  where id = p_student_id
  for update;

  if not found then
    return query select false, 'Không tìm thấy tài khoản học viên.', 0;
    return;
  end if;

  -- Hết hạn thuê bao -> hạ về FREE THẬT (ghi đè DB) ngay tại đây, đường "for update" sẵn có, không
  -- cần cron riêng cho MVP (xem effective_package_tier() ở mục 3 cho phần đọc-không-ghi dùng trong RLS).
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

-- Hoàn credit khi lượt AI SAU KHI trừ bị lỗi (OpenAI lỗi/timeout/parse lỗi...) — không vượt trần
-- tháng của gói hiện tại (tránh refund dồn vượt hạn mức nếu có race hiếm gặp).
create or replace function public.refund_ai_credits(p_student_id uuid, p_amount int default 2)
returns table(balance int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_balance int;
  v_cap int;
begin
  select package_tier, ai_credits_balance into v_tier, v_balance
  from public.students
  where id = p_student_id
  for update;

  if not found then
    return query select 0;
    return;
  end if;

  v_cap := public.package_monthly_credits(v_tier);
  v_balance := least(v_balance + p_amount, v_cap);

  update public.students set ai_credits_balance = v_balance where id = p_student_id;
  return query select v_balance;
end;
$$;

-- ============================================================
-- 6) Bộ đếm đổi chuyên ngành — tăng đơn giản (1 UPDATE là atomic sẵn, không cần "for update" khoá
--    riêng). KHÔNG BAO GIỜ reset (đúng spec) — không có hàm reset nào ở đây, cố ý.
--    CỐ Ý không grant execute cho "authenticated" — chỉ service_role (api/_generate/goal.js) gọi.
-- ============================================================
create or replace function public.increment_specialization_switch_count(p_student_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.students
    set specialization_switch_count = specialization_switch_count + 1
    where id = p_student_id;
$$;

-- ============================================================
-- 7) Đơn hàng thanh toán nội địa VN (VietQR bootstrap — Minh hiện chỉ có tài khoản ngân hàng cá
--    nhân, chưa có merchant account VNPay/PayOS/Momo). KHÔNG tự động trừ tiền hàng tháng — user
--    chuyển khoản 1 lần/chu kỳ tháng, XÁC NHẬN THỦ CÔNG qua admin_confirm_payment()
--    (api/_generate/billing.js, chỉ ADMIN_EMAILS gọi được). Không có policy nào cho "authenticated"
--    -> mọi đọc/ghi đều qua service role, tránh user tự tạo/sửa đơn hàng giả hoặc dò đơn người khác.
-- ============================================================
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  order_ref text not null unique,
  target_tier text not null check (target_tier in ('A1_A2', 'B1', 'B2')),
  amount integer not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists payment_orders_user_created_idx
  on public.payment_orders (user_id, created_at desc);

create index if not exists payment_orders_status_idx
  on public.payment_orders (status, created_at desc);

alter table public.payment_orders enable row level security;

-- Xác nhận đơn hàng — MỘT bước atomic kích hoạt cả payment_orders.status LẪN
-- students.package_tier/credits/subscription_*, tránh nửa vời nếu request chết giữa chừng.
-- CỐ Ý không grant execute cho "authenticated" — chỉ service_role gọi (admin_confirm_payment() đã tự
-- kiểm tra quyền admin qua ADMIN_EMAILS trước khi gọi RPC này).
create or replace function public.confirm_payment_order(p_order_ref text)
returns table(ok boolean, message text, package_tier text, credits_granted int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_user_id uuid;
  v_target_tier text;
  v_status text;
  v_credits int;
begin
  select id, user_id, target_tier, status
    into v_order_id, v_user_id, v_target_tier, v_status
  from public.payment_orders
  where order_ref = p_order_ref
  for update;

  if not found then
    return query select false, 'Không tìm thấy đơn hàng.', null::text, null::int;
    return;
  end if;

  if v_status <> 'pending' then
    return query select false, 'Đơn hàng đã được xử lý trước đó.', null::text, null::int;
    return;
  end if;

  v_credits := public.package_monthly_credits(v_target_tier);

  update public.payment_orders
    set status = 'confirmed', confirmed_at = now()
    where id = v_order_id;

  update public.students
    set package_tier = v_target_tier,
        ai_credits_balance = v_credits,
        ai_credits_reset_at = date_trunc('month', now()),
        subscription_status = 'active',
        subscription_expires_at = now() + interval '1 month'
    where id = v_user_id;

  return query select true, 'Đã kích hoạt gói.', v_target_tier, v_credits;
end;
$$;
