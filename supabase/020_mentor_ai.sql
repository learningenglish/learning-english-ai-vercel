-- ============================================================
-- Mentor AI (Đợt 3) — thay luồng "Tạo nội dung" cũ bằng luồng có mục tiêu
-- (learning_goals) + thẻ đạo diễn (lớp Quyết định đọc dữ liệu thật, xem
-- api/_generate/mentor.js). KHÔNG đụng gì tới "lessons"/"lesson_progress"
-- ngoài 2 cột cộng thêm bên dưới.
--
-- learning_goals: 1 "mục tiêu" = 1 lần suy luận chân dung nghề (skin.js
-- generateOccupationProfile, Lượt A) đã được người dùng xác nhận. occupation_profile
-- lưu NGUYÊN kết quả AI đó để tái dùng khi sinh các bài tiếp theo trong cùng mục tiêu
-- (next_slot) mà KHÔNG cần gọi AI lại — đúng luật "chỉ 2 điểm ngoại lệ gọi AI" của Đợt 3.
--
-- Không có policy INSERT/UPDATE cho authenticated trên learning_goals — tạo/đổi mục
-- tiêu luôn đi qua service role (api/_generate/mentor.js), giống nguyên tắc đã áp dụng
-- cho "lessons" ở 019_lessons.sql (tránh client tự chèn bản ghi giả). SELECT mở cho
-- chính chủ để màn Thư Viện AI tự đọc tên mục tiêu nhóm thẻ bài học qua Supabase REST,
-- không cần thêm action backend chỉ để liệt kê.
--
-- "Truy cập ≥50% đợt hiện tại" (mục 6.3 Bước 0) và "review queue" (grammar_tag sai
-- nhiều) đều là TRUY VẤN tính từ lessons.goal_id + lesson_progress.exercise_results lúc
-- request, KHÔNG có bảng đếm riêng — đúng chủ trương "tận dụng dữ liệu có sẵn, không dựng
-- hệ thống theo dõi riêng" của Đợt 3 mục 3.
--
-- Chạy sau 019.
-- ============================================================

-- ============================================================
-- 1) Bảng "learning_goals"
-- ============================================================
create table if not exists public.learning_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,               -- "Anh văn chuyên ngành {ngành}" (buildConfirmationDisplay.title_line)
  topic_line text not null,          -- "Chủ đề: {phạm vi giao tiếp chính}" (buildConfirmationDisplay.topic_line)
  raw_keywords text,                 -- nguyên văn Bước 1 người dùng nhập/chip chọn — chỉ để tham khảo, không dùng lại vào prompt
  level text check (level in ('A1', 'A2', 'B1', 'B2', 'C1')),  -- null = "Mình chưa chắc, gợi ý giúp" ở Bước 2
  occupation_profile jsonb not null, -- nguyên văn occupation_profile do skin.js suy luận (Lượt A) — tái dùng cho next_slot, KHÔNG gọi AI lại
  status text not null default 'active' check (status in ('active', 'archived')),
  lesson_count integer not null default 0,  -- tổng số bài đã sinh cho mục tiêu này (mentor_next_lesson tự tăng)
  created_at timestamptz not null default now()
);

create index if not exists learning_goals_user_created_idx
  on public.learning_goals (user_id, created_at desc);

alter table public.learning_goals enable row level security;

drop policy if exists "Users view own learning goals" on public.learning_goals;
create policy "Users view own learning goals"
  on public.learning_goals for select
  using (auth.uid() = user_id);

-- Không có policy INSERT/UPDATE/DELETE cho authenticated -> chỉ service role
-- (api/_generate/mentor.js: mentor_create_goal, mentor_next_lesson) ghi được bảng này.

-- ============================================================
-- 2) "lessons" — cộng cột goal_id, nối 1 bài AI-sinh vào đúng mục tiêu (Thư Viện AI
--    nhóm bài theo tên mục tiêu). NULL với bài KHÔNG thuộc mục tiêu nào (bài "Tôi có
--    văn bản" phân tích rời vẫn hoạt động y hệt cũ, không bắt buộc phải có mục tiêu).
-- ============================================================
alter table public.lessons
  add column if not exists goal_id uuid references public.learning_goals (id) on delete set null;

create index if not exists lessons_user_goal_idx
  on public.lessons (user_id, goal_id);

-- ============================================================
-- 3) "lesson_progress" — cộng cột exercise_results: mảng {index, correct, grammar_tag}
--    ghi lại ĐÚNG/SAI từng câu bài tập (khác completed_exercises cũ chỉ lưu đã-làm hay
--    chưa, không phân biệt đúng/sai) — nguồn dữ liệu DUY NHẤT cho Review Queue (mục 3 Đợt
--    3: "grammar_key có tỷ lệ sai > ngưỡng"). Ghi trực tiếp từ client giống
--    completed_exercises hiện có (policy "for all" ở 019 đã cho phép, không cần policy mới).
-- ============================================================
alter table public.lesson_progress
  add column if not exists exercise_results jsonb not null default '[]'::jsonb;

-- ============================================================
-- NỢ KỸ THUẬT (ghi nhận, chưa xử lý ở migration này):
-- 1. learning_goals.lesson_count là bộ đếm ĐƠN GIẢN do backend tự tăng khi insert lesson
--    thành công — không có ràng buộc atomic (race hiếm giữa 2 request gần như đồng thời
--    có thể lệch 1 đơn vị), chấp nhận được vì chỉ dùng để HIỂN THỊ ("x/y bài"), không phải
--    hạn mức chặn (hạn mức thật vẫn là DAILY_LESSON_LIMIT ở api/_generate/lesson.js).
-- 2. Chưa có cơ chế "cầu chì" riêng cho learning_goals (số mục tiêu/user không giới hạn) —
--    Đợt 3 không yêu cầu, chỉ hạn mức sinh BÀI (DAILY_LESSON_LIMIT có sẵn) là đủ chặn lạm
--    dụng; nếu sau này cần giới hạn số mục tiêu, thêm ở đây.
-- ============================================================
