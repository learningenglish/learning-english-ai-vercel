-- ============================================================
-- FIX BẢO MẬT KHẨN CẤP: Postgres tự động GRANT EXECUTE cho PUBLIC khi
-- tạo function mới (trừ khi revoke tường minh) — TẤT CẢ migration
-- trước đó (003, 004, 005, 006, 007) đều thiếu bước "revoke ... from
-- public" khi tạo function SECURITY DEFINER, chỉ thêm "grant ... to
-- authenticated" mà quên PUBLIC vẫn còn quyền mặc định từ lúc tạo.
--
-- Mức độ nguy hiểm khác nhau:
--   - consume_student_credit, find_student_by_email: KHÔNG tự kiểm tra
--     auth.uid() bên trong -> PUBLIC/anon gọi thẳng qua PostgREST mà
--     không cần đăng nhập là khai thác được thật (rút/reset credit của
--     Student bất kỳ; dò email->id/full_name toàn bộ students).
--   - get_my_roster, get_roster_activity, set_student_level: tự lọc
--     theo auth.uid()/quyền sở hữu bên trong nên an toàn thực tế dù bị
--     grant rộng, nhưng vẫn phải siết lại cho đúng chuẩn least-privilege.
--
-- GHI NHỚ CHO MỌI MIGRATION SAU NÀY: mỗi khi tạo function SECURITY
-- DEFINER mới, PHẢI luôn kèm dòng "revoke ... from public, anon" ngay
-- sau khi tạo — đây là bước bắt buộc, không phải tuỳ chọn.
-- ============================================================

revoke execute on function public.consume_student_credit(uuid, text)
  from public, anon, authenticated;
grant execute on function public.consume_student_credit(uuid, text)
  to service_role;

revoke execute on function public.find_student_by_email(text)
  from public, anon;
grant execute on function public.find_student_by_email(text)
  to authenticated;

revoke execute on function public.get_my_roster() from public, anon;
grant execute on function public.get_my_roster() to authenticated;

revoke execute on function public.get_roster_activity() from public, anon;
grant execute on function public.get_roster_activity() to authenticated;

revoke execute on function public.set_student_level(uuid, text)
  from public, anon;
grant execute on function public.set_student_level(uuid, text)
  to authenticated;
