-- ============================================================
-- Student Pro tự tạo đề (self-study) — mục 3 trong pivot ưu tiên:
-- 1) student_history: lưu kết quả phân tích của CHÍNH Student (khác
--    mentor_history — Student không có khái niệm folder, chỉ 1 danh
--    sách phẳng theo level, đơn giản hơn nhiều so với Mentor).
-- 2) monthly_exam_credit_used/monthly_exam_credit_reset_date: hạn mức
--    300 credit tạo đề/tháng cho Pro, tự động làm mới theo chu kỳ —
--    TÁI DÙNG ĐÚNG PATTERN đã chứng minh hoạt động tốt ở
--    consume_student_credit() (monthly_credit_used/reset_date cho
--    Free) thay vì làm 1 "ví" cần nạp tay kiểu Mentor.credits. Không
--    cần cổng thanh toán, không cần cron job, không cần admin nạp tay
--    — mỗi lần gọi RPC tự kiểm tra đã sang tháng mới chưa, nếu có thì
--    reset về 0 rồi tính tiếp, giống hệt cơ chế Free/Basic đã có.
--    Tách biệt hoàn toàn khỏi daily_credit_used/monthly_credit_used
--    (2 cột đó dành cho hạn mức PHÂN TÍCH, không liên quan tạo đề).
-- 3) student_exams: đề do Student tự tạo, tách biệt hoàn toàn với
--    mentor_exams (không lẫn dữ liệu 2 vai trò).
-- 4) consume_student_exam_credit(): RPC atomic, kiểm tra plan='pro' +
--    hạn mức 300/tháng, CHỈ service_role gọi được (giống
--    consume_student_credit()) — Student không tự gọi trực tiếp để
--    tránh tự trừ/không trừ credit của người khác qua p_student_id
--    tuỳ ý, hoặc bỏ qua kiểm tra plan/hạn mức ở client.
-- Chạy sau 014.
-- ============================================================

-- ============================================================
-- 1) Hạn mức tạo đề riêng cho Student Pro — tự động reset theo tháng,
--    tách biệt hoàn toàn khỏi daily_credit_used/monthly_credit_used
--    (hạn mức phân tích, không liên quan tạo đề).
-- ============================================================
alter table public.students
  add column if not exists monthly_exam_credit_used integer not null default 0,
  add column if not exists monthly_exam_credit_reset_date date not null default date_trunc('month', current_date)::date;

-- ============================================================
-- 2) student_history — mirror của mentor_history nhưng KHÔNG có
--    folder_id (Student không có khái niệm folder, chỉ 1 danh sách
--    phẳng lọc theo level ở tầng UI).
-- ============================================================
create table if not exists public.student_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  client_id text not null,
  text text,
  result text,
  level text,
  custom_name text,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  unique (student_id, client_id)
);

alter table public.student_history enable row level security;

drop policy if exists "Students manage own history" on public.student_history;
create policy "Students manage own history"
  on public.student_history for all
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

-- ============================================================
-- 3) student_exams — mirror của mentor_exams nhưng KHÔNG có folder_id
--    và KHÔNG có "kind" (Student Pro chỉ tự tạo "Đề" — ielts/ptth —
--    không có luồng "Bài Kiểm Tra" riêng cho self-study ở giai đoạn
--    này). exam_type/level giữ nguyên constraint như mentor_exams để
--    tái dùng đúng cấu trúc payload đã có trong buildPrompt()/AI.
-- ============================================================
create table if not exists public.student_exams (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  title text not null,
  exam_type text not null check (exam_type in ('ielts', 'ptth')),
  level text not null check (level in ('A1-A2', 'B1', 'B2')),
  duration_minutes integer,
  questions_count integer not null default 0,
  payload jsonb not null,
  last_score numeric,
  created_at timestamptz not null default now()
);

alter table public.student_exams enable row level security;

drop policy if exists "Students manage own exams" on public.student_exams;
create policy "Students manage own exams"
  on public.student_exams for all
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

-- ============================================================
-- 4) Trừ credit atomic cho Student Pro tự tạo đề — 10 credit/lần, hạn
--    mức 300/tháng tự reset (y hệt logic Free trong
--    consume_student_credit()). "for update" khoá dòng tránh race
--    condition khi bấm nhanh 2 lần. Chỉ Pro mới dùng được tính năng
--    này — kiểm tra plan NGAY TRONG RPC (không chỉ dựa vào gating ở
--    client) để tránh Basic/Free lách qua bằng cách gọi thẳng action.
-- ============================================================
create or replace function public.consume_student_exam_credit(p_student_id uuid)
returns table(allowed boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_used int;
  v_reset date;
  v_month_start date := date_trunc('month', current_date)::date;
  v_cost constant int := 10;
  v_limit constant int := 300;
begin
  select plan, monthly_exam_credit_used, monthly_exam_credit_reset_date
  into v_plan, v_used, v_reset
  from public.students
  where id = p_student_id
  for update;

  if not found then
    return query select false, 'Không tìm thấy tài khoản học viên.';
    return;
  end if;

  if v_plan <> 'pro' then
    return query select false, 'Tính năng tự tạo đề chỉ dành cho gói Pro.';
    return;
  end if;

  if v_reset < v_month_start then
    v_used := 0;
    v_reset := v_month_start;
  end if;

  if v_used + v_cost > v_limit then
    update public.students set monthly_exam_credit_reset_date = v_reset where id = p_student_id;
    return query select false, 'Đã dùng hết 300 credit tạo đề tháng này, quay lại tháng sau.';
    return;
  end if;

  update public.students
    set monthly_exam_credit_used = v_used + v_cost, monthly_exam_credit_reset_date = v_reset
    where id = p_student_id;
  return query select true, null::text;
end;
$$;

-- BẮT BUỘC (đã có bài học từ 008_fix_consume_credit_grant.sql): Postgres tự
-- động grant EXECUTE cho PUBLIC khi tạo function mới — nếu không revoke
-- tường minh ở đây, PUBLIC/anon gọi thẳng qua PostgREST không cần đăng nhập
-- là rút được credit tạo đề của Student bất kỳ (hàm không tự kiểm tra
-- auth.uid()).
revoke execute on function public.consume_student_exam_credit(uuid)
  from public, anon, authenticated;
grant execute on function public.consume_student_exam_credit(uuid)
  to service_role;
