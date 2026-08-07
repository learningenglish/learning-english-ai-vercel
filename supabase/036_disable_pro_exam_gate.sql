-- ============================================================
-- Tắt cổng "chỉ gói Pro" cho tự tạo đề (2026-08-07, Minh: "Tắt tính năng gói Pro") — bỏ nhánh
-- chặn "v_plan <> 'pro'" trong consume_student_exam_credit(), GIỮ NGUYÊN toàn bộ phần đếm credit
-- (10 credit/lần, trần 300/tháng tự reset) — chỉ tắt riêng yêu cầu "phải là Pro", không đụng cơ
-- chế chi phí/hạn mức. Đối xứng với PRO_GATE_ENFORCED trong api/_generate/_shared.js (cổng phía
-- JS cho generate_lesson/analyze_user_text/Luyện viết) — cùng 1 đợt tắt, khác cơ chế bật lại vì
-- đây là function Postgres (không đọc được biến JS): muốn bật lại thì chạy lại đúng function này
-- với dòng "if v_plan <> 'pro' then ... end if;" như bản gốc (xem supabase/015_student_pro_exams.sql
-- dòng 122-125 để copy lại nguyên văn).
--
-- create-or-replace GIỮ NGUYÊN GRANT/REVOKE đã áp dụng cho function này (015 đã revoke PUBLIC),
-- không cần lặp lại ở đây.
--
-- Chạy sau 035.
-- ============================================================

create or replace function public.consume_student_exam_credit(p_student_id uuid)
returns table(allowed boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
  v_reset date;
  v_month_start date := date_trunc('month', current_date)::date;
  v_cost constant int := 10;
  v_limit constant int := 300;
begin
  select monthly_exam_credit_used, monthly_exam_credit_reset_date
  into v_used, v_reset
  from public.students
  where id = p_student_id
  for update;

  if not found then
    return query select false, 'Không tìm thấy tài khoản học viên.';
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
