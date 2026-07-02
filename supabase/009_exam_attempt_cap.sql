-- ============================================================
-- Giới hạn điểm theo số lần làm lại bài kiểm tra/đề:
--   Lần 1: trần 100% · Lần 2: trần 85% · Lần 3 trở đi: trần 70% (sàn, không giảm thêm)
-- Thời gian làm bài CHỈ enforce ở CLIENT (app.js) — cột time_spent_seconds ở đây
-- chỉ để Mentor xem thời gian thực tế, không dùng để chặn gì ở server.
-- Chạy sau 001-007.
-- ============================================================

alter table public.student_exam_submissions
  add column if not exists attempt_number integer,
  add column if not exists time_spent_seconds integer;

-- attempt_number LUÔN do trigger tự tính (đếm số submission đã có + 1 cho đúng cặp
-- exam_id/student_id) — bỏ qua bất kỳ giá trị nào client gửi lên, để không thể giả
-- mạo "đây là lần 1" nhằm lách trần điểm.
create or replace function public.enforce_exam_attempt_cap()
returns trigger
language plpgsql
as $$
declare
  v_attempt int;
  v_cap numeric;
begin
  select count(*) + 1 into v_attempt
  from public.student_exam_submissions
  where exam_id = new.exam_id and student_id = new.student_id;

  new.attempt_number := v_attempt;

  v_cap := case when v_attempt = 1 then 100 when v_attempt = 2 then 85 else 70 end;
  if new.score is not null then
    new.score := least(new.score, v_cap);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_exam_attempt_cap on public.student_exam_submissions;
create trigger trg_enforce_exam_attempt_cap
  before insert on public.student_exam_submissions
  for each row execute function public.enforce_exam_attempt_cap();

-- Đây là trigger function (returns trigger) — Postgres đã tự chặn không cho gọi
-- trực tiếp qua "select enforce_exam_attempt_cap()" (lỗi "trigger functions can
-- only be called as triggers"), và PostgREST cũng không liệt kê hàm returns
-- trigger thành RPC endpoint, nên đây KHÔNG cùng loại lỗ hổng đã vá ở
-- 008_fix_consume_credit_grant.sql. Vẫn revoke tường minh cho nhất quán với
-- nguyên tắc mới — không ảnh hưởng việc trigger tự động chạy khi insert (cơ chế
-- bắn trigger của Postgres không kiểm tra EXECUTE grant của người đang INSERT).
revoke execute on function public.enforce_exam_attempt_cap() from public, anon, authenticated;
