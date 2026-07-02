-- ============================================================
-- THAY ĐỔI: chặn CỨNG tối đa 3 lần làm bài/đề cho mỗi (exam_id,
-- student_id) — trước đó cho làm lại vô hạn (chỉ giảm dần điểm/thời
-- gian), giờ đổi thành từ chối thẳng lần thứ 4 trở đi.
-- Chỉ CREATE OR REPLACE lại đúng function enforce_exam_attempt_cap()
-- đã tạo ở 009 — KHÔNG đổi signature/return type nên không cần DROP
-- FUNCTION trước (khác tình huống get_my_roster ở 007, vì ở đó SỐ CỘT
-- trả về thay đổi). Trigger đã tạo ở 009 tự động dùng bản function mới
-- (Postgres CREATE OR REPLACE giữ nguyên OID của function, trigger vẫn
-- trỏ đúng). Quyền EXECUTE đã revoke ở 009 (chỉ Postgres bắn trigger
-- nội bộ, không role nào gọi trực tiếp được) không bị ảnh hưởng.
-- Chạy sau 009.
-- ============================================================

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

  if v_attempt > 3 then
    raise exception 'Đã dùng hết 3 lượt làm bài cho đề này.';
  end if;

  new.attempt_number := v_attempt;

  v_cap := case when v_attempt = 1 then 100 when v_attempt = 2 then 85 else 70 end;
  if new.score is not null then
    new.score := least(new.score, v_cap);
  end if;

  return new;
end;
$$;
