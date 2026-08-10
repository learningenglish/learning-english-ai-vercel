-- ============================================================
-- Mở khoá đọc "lessons" nguồn 'ai_generated' cho MỌI tài khoản đã đăng nhập
-- (2026-08-10, Minh: "Vì đây là bộ giáo trình theo chuyên ngành. Ở đây tất cả
-- bài học đều hiển thị ở tất cả tài khoản. Sau khi test xong, tôi sẽ bắt đầu
-- phân gói tài khoản phục vụ hiển thị theo gói sau.")
--
-- TRƯỚC migration này: policy "Users view own lessons" chỉ cho SELECT khi
-- auth.uid() = user_id — nghĩa là bài AI sinh dưới tài khoản A không bao giờ
-- hiện cho tài khoản B, dù cùng 1 chuyên ngành/bộ giáo trình thật (goal_id
-- trỏ vào learning_goals, mà learning_goals lại CŨNG khoá theo user_id riêng
-- từng tài khoản — xem 020_mentor_ai.sql). Đây chính là lý do Minh không
-- thấy 4 bài mẫu sinh bằng tài khoản test dù đã đăng nhập lại/xoá cache
-- nhiều lần (không phải bug cache).
--
-- Bài nguồn 'user_text' (tab "Tôi có văn bản" — người dùng tự dán văn bản
-- riêng của họ vào để phân tích) VẪN RIÊNG TƯ, chỉ chủ sở hữu đọc được —
-- khác bản chất với 'ai_generated' (nội dung giáo trình chung, không phải
-- dữ liệu cá nhân người dùng nhập vào).
--
-- Đây là bước TẠM cho giai đoạn test (1 bộ giáo trình duy nhất, chưa phân
-- biệt gói). Khi Minh triển khai phân gói tài khoản (Free/Pro/...), cần
-- viết lại policy này để so thêm điều kiện gói/quyền truy cập thay vì mở
-- cho MỌI tài khoản đã đăng nhập như hiện tại.
--
-- Chạy sau 037.
-- ============================================================

drop policy if exists "Users view own lessons" on public.lessons;

create policy "Authenticated view shared curriculum or own lessons"
  on public.lessons for select
  using (
    (source = 'ai_generated' and auth.uid() is not null)
    or auth.uid() = user_id
  );

-- UPDATE/DELETE giữ nguyên khoá theo chủ sở hữu (is_favorite là trạng thái cá
-- nhân từng tài khoản đặt trên chính DÒNG lesson dùng chung — MỘT tài khoản
-- bấm Yêu thích sẽ đổi is_favorite cho TẤT CẢ tài khoản khác cùng thấy dòng
-- đó, vì đây là 1 cột chung trên bảng dùng chung, không phải bảng phụ theo
-- (lesson_id, user_id). Ghi nhận NỢ KỸ THUẬT này, chưa xử lý ở migration
-- này — chỉ đáng sửa nếu Minh xác nhận "Yêu thích" cần tách theo từng tài
-- khoản khi bài học đã dùng chung (ngoài phạm vi yêu cầu hôm nay, chỉ về
-- HIỂN THỊ bài học).
