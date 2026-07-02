-- ============================================================
-- Vá race condition: "select count(*)+1 into v_attempt" trong trigger
-- enforce_exam_attempt_cap() là ĐỌC ĐƠN THUẦN, không khoá dòng nào (vì
-- các dòng attempt kế tiếp CHƯA TỒN TẠI — không thể "select ... for
-- update" trên dòng chưa insert như consume_student_credit() làm được
-- với dòng students đã có sẵn). Nếu 2 request nộp bài đến gần như
-- đồng thời, cả 2 có thể cùng đọc thấy "đã có 2 lần", cùng tính
-- v_attempt=3, cùng vượt qua điều kiện "v_attempt > 3" (3 không > 3),
-- và CẢ 2 cùng insert được — kết quả 4 dòng thay vì giới hạn cứng 3,
-- 2 dòng trùng attempt_number=3.
--
-- Cách vá ĐÚNG cho race kiểu "check-then-insert" là để Postgres tự
-- đảm bảo tính duy nhất ở tầng constraint (UNIQUE index), vì đây là
-- cơ chế duy nhất hoạt động đúng dưới các transaction đồng thời —
-- request nào commit trước thắng, request commit sau bị Postgres từ
-- chối ngay với lỗi rõ ràng (unique_violation), không cần khoá dòng
-- chưa tồn tại.
-- Chạy sau 010.
-- ============================================================

alter table public.student_exam_submissions
  add constraint uq_exam_student_attempt unique (exam_id, student_id, attempt_number);
