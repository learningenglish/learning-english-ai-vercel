-- ============================================================
-- Nới rộng giới hạn bài xem được của gói Free (2026-08-20, Minh: "Số bài giới hạn hiện tại nới
-- rộng thêm: A1: 15, A2: 15, B1: 6" + xác nhận B2 tăng CÙNG mức B1 qua AskUserQuestion) — CREATE
-- OR REPLACE lại đúng hàm đã tạo ở 040 (A1/A2 5->15, B1/B2 3->6). KHÔNG đổi PACKAGE_CONFIG.FREE
-- ở api/_shared/packages.js THÔI CHƯA ĐỦ — hàm SQL này mới là nguồn RLS "lessons" (can_view_lesson()
-- trong 040) thật sự dùng, phải CREATE OR REPLACE lại y hệt logic đó ở đây.
--
-- Chạy sau 044.
-- ============================================================

create or replace function public.package_free_lesson_limit(p_level text)
returns int
language sql
immutable
as $$
  select case p_level
    when 'A1' then 15
    when 'A2' then 15
    when 'B1' then 6
    when 'B2' then 6
    else 0
  end;
$$;
