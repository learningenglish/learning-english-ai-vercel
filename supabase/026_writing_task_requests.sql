-- ============================================================
-- Luyện viết — bảng ĐẾM RIÊNG cho hạn mức "AI giao đề" (generate_writing_task).
-- writing_submissions (025) chỉ ghi khi CHẤM xong 1 bài — không dùng để đếm số lần GIAO ĐỀ
-- (người học có thể bấm "Đổi đề khác" nhiều lần trước khi viết, mỗi lần đó cũng tốn 1 lượt
-- gọi AI thật). Minh chốt 2026-07-27: cả 2 hành động "giao nhiệm vụ" VÀ "chấm bài viết" đều
-- giới hạn 3 lượt/ngày (ĐỘC LẬP với nhau, mỗi hành động 1 hạn mức riêng — xem
-- DAILY_WRITING_LIMIT trong api/_generate/writing.js), KHÔNG đụng DAILY_LESSON_LIMIT.
--
-- Bảng CHỈ để đếm — không cần lưu nội dung đề bài đã giao (đã trả về client rồi), chỉ 1 dòng
-- rỗng/lượt gọi thành công. INSERT KHÔNG có policy cho authenticated, giống HỆT nguyên tắc
-- writing_submissions/lessons (chỉ service role trong api/_generate/writing.js mới ghi được).
--
-- Chạy sau 025.
-- ============================================================

create table if not exists public.writing_task_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists writing_task_requests_user_created_idx
  on public.writing_task_requests (user_id, created_at desc);

alter table public.writing_task_requests enable row level security;

drop policy if exists "Users view own writing task requests" on public.writing_task_requests;
create policy "Users view own writing task requests"
  on public.writing_task_requests for select
  using (auth.uid() = user_id);

-- Không tạo policy INSERT cho authenticated -> chỉ service role ghi được.
