-- Chỉ ĐỌC, không sửa gì — chạy để xem 5 tài khoản mới nhất đang ở bảng nào (mentors/students),
-- giúp xác định chính xác tài khoản Google của Minh đang ở trạng thái nào trước khi sửa tiếp.
select
  u.id,
  u.email,
  u.created_at,
  u.raw_user_meta_data ->> 'role' as meta_role,
  exists(select 1 from public.mentors m where m.id = u.id) as is_mentor,
  exists(select 1 from public.students s where s.id = u.id) as is_student
from auth.users u
order by u.created_at desc
limit 5;
