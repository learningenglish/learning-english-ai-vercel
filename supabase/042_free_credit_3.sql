-- ============================================================
-- Đổi Credit hàng tháng gói Free: 5 -> 3 (2026-08-20, Minh: "Tk free nên có 03 credit").
--
-- Migration 040 đã CHẠY RỒI (hàm package_monthly_credits() đã tồn tại trong DB với giá trị FREE=5
-- cứng trong thân hàm) — sửa lại api/_shared/packages.js không tự động cập nhật DB, PHẢI
-- CREATE OR REPLACE lại đúng hàm đó. Đổi default cột "ai_credits_balance" theo (chỉ ảnh hưởng
-- tài khoản MỚI tạo sau migration này — tài khoản Free hiện có giữ nguyên số dư hiện tại, tự đồng
-- bộ về 3 vào lần reset-lười hàng tháng tiếp theo qua consume_ai_credits(), KHÔNG ép hạ ngay lập
-- tức để tránh cắt ngang tài khoản đang test dở giữa tháng).
--
-- Chạy sau 041.
-- ============================================================

create or replace function public.package_monthly_credits(p_tier text)
returns int
language sql
immutable
as $$
  select case p_tier
    when 'FREE' then 3
    when 'A1_A2' then 30
    when 'B1' then 50
    when 'B2' then 70
    else 0
  end;
$$;

alter table public.students
  alter column ai_credits_balance set default 3;
