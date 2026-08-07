-- ============================================================
-- SCRIPT CHẠY 1 LẦN (không phải migration đánh số) — Minh: "Mặc định tài khoản
-- kimchinamvn@gmail.com là gói Pro". Đặt plan='pro' cho đúng tài khoản này trong bảng students
-- (nguồn duy nhất kiểm tra "Pro" trong hệ thống, xem 007_student_tiers.sql).
--
-- LƯU Ý: tài khoản này TỪNG bị trigger cũ xếp nhầm vào "mentors" thay vì "students" (xem
-- one-off_fix_mentor_to_student_2026-08-07.sql cùng ngày) — nếu script đó CHƯA chạy/chưa chạy
-- đúng, câu UPDATE dưới đây sẽ ảnh hưởng 0 dòng (không báo lỗi, chỉ không sửa được gì). Chạy
-- xong, kiểm tra "Đã cập nhật X dòng" — nếu X=0, chạy one-off_fix_mentor_to_student trước rồi
-- chạy lại file này.
-- ============================================================

update public.students
set plan = 'pro'
where email = 'kimchinamvn@gmail.com';
