-- ============================================================
-- BUG THẬT (2026-08-07, Minh bắt được: đăng nhập Google xong bấm chọn Chuyên ngành báo "Chỉ áp
-- dụng cho Student.") — handle_new_user() (trigger chạy khi có auth.users mới, xem migration
-- 006_rename_tutor_to_mentor.sql mục 5a) mặc định v_role = 'mentor' khi raw_user_meta_data
-- KHÔNG có key "role". App KHÔNG có bước signup nào tự gắn role='student' cho user mới (xem
-- app/js/authApi.js — chỉ có signInWithPassword/OAuth, không có signUp) — nghĩa là MỌI tài
-- khoản Google/Facebook đăng nhập lần đầu qua app Student này đều bị trigger tự xếp nhầm vào
-- bảng "mentors" thay vì "students", khiến MỌI action yêu cầu ctx.studentId (tạo Chuyên ngành,
-- sinh bài, phân tích, luyện viết...) đều báo lỗi "Chỉ áp dụng cho Student." vĩnh viễn.
--
-- App này (learning-english-ai-vercel, "/app/") giờ CHỈ phục vụ Student — toàn bộ UI Mentor AI
-- đã tắt/archive (xem docs/NHAT-KY-LAM-VIEC.md 2026-07-23 và 2026-08-06). Đổi mặc định của
-- trigger về 'student' — KHÔNG còn lý do nào 1 user đăng nhập qua app này lại là mentor mới.
-- Additive/an toàn: chỉ đổi hành vi CHO USER MỚI từ nay về sau, KHÔNG đụng dữ liệu user đã có.
--
-- Chạy sau 034. Cần chạy TRƯỚC khi mời thêm người dùng thật đăng nhập Google/Facebook lần đầu.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'student');
begin
  if v_role = 'student' then
    insert into public.students (id, email, full_name)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  else
    insert into public.mentors (id, email, full_name)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');

    insert into public.mentor_folders (mentor_id, name, level, folder_type, is_auto)
    values
      (new.id, 'Chưa phân loại', 'A1-A2', 'content', true),
      (new.id, 'Ôn Tập',          'A1-A2', 'review',  true),
      (new.id, 'Chưa phân loại', 'B1',    'content', true),
      (new.id, 'Ôn Tập',          'B1',    'review',  true),
      (new.id, 'Chưa phân loại', 'B2',    'content', true),
      (new.id, 'Ôn Tập',          'B2',    'review',  true);
  end if;
  return new;
end;
$$;
