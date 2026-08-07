-- ============================================================
-- SCRIPT CHẠY 1 LẦN (không phải migration đánh số — không áp dụng cho ai khác ngoài tài khoản cụ
-- thể bị ảnh hưởng) — sửa tài khoản ĐÃ bị trigger cũ xếp nhầm vào "mentors" trước khi migration
-- 035 kịp sửa mặc định. Đổi '<EMAIL_GOOGLE_CUA_MINH>' thành đúng email Gmail anh dùng đăng nhập
-- Google trên app rồi mới chạy — chạy nhầm email sẽ không tìm thấy hàng nào (an toàn) nhưng vẫn
-- nên điền đúng để chắc chắn.
--
-- Việc này làm: xoá hàng sai trong "mentors" (+ 6 hàng "mentor_folders" rỗng đi kèm, tự tạo lúc
-- đăng nhập lần đầu, chưa ai dùng tới) rồi tạo đúng hàng trong "students" — cùng auth.users.id
-- nên không mất tài khoản đăng nhập, chỉ chuyển đúng vai trò.
-- ============================================================

do $$
declare
  v_email text := '<EMAIL_GOOGLE_CUA_MINH>';
  v_id uuid;
begin
  select id into v_id from auth.users where email = v_email;
  if v_id is null then
    raise notice 'Không tìm thấy user với email %', v_email;
    return;
  end if;
  if exists (select 1 from public.students where id = v_id) then
    raise notice 'User % đã có hàng students sẵn rồi, không cần sửa.', v_email;
    return;
  end if;

  delete from public.mentor_folders where mentor_id = v_id;
  delete from public.mentors where id = v_id;

  insert into public.students (id, email, full_name)
  select id, email, raw_user_meta_data ->> 'full_name'
  from auth.users where id = v_id;

  raise notice 'Đã chuyển user % từ mentors sang students.', v_email;
end $$;
