-- ============================================================
-- Mục D — cơ chế mở khoá "Đề" bằng CHỌN TAY (thay cơ chế đếm tự động
-- cho lần tạo THỨ 2 trở đi từ cùng 1 folder). Cần bảng liên kết
-- many-to-many để biết 1 nội dung (mentor_history) đã từng được dùng
-- trong (những) đề nào — hiển thị nhãn "Đã dùng cho Đề #1, #3" khi
-- Mentor chọn tay nội dung cho đề mới.
--
-- mentor_id thêm TRỰC TIẾP vào bảng này (dù suy ra được qua JOIN với
-- mentor_history/mentor_exams) — theo đúng quy ước RLS đã dùng xuyên
-- suốt dự án (mọi bảng đều có mentor_id riêng để policy
-- "using(auth.uid()=mentor_id)" đơn giản, không cần EXISTS subquery).
-- Chạy sau 012.
-- ============================================================

create table if not exists public.mentor_history_exam_usage (
  history_id uuid not null references public.mentor_history (id) on delete cascade,
  exam_id uuid not null references public.mentor_exams (id) on delete cascade,
  mentor_id uuid not null references public.mentors (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (history_id, exam_id)
);

alter table public.mentor_history_exam_usage enable row level security;

drop policy if exists "Mentors manage own history exam usage" on public.mentor_history_exam_usage;
create policy "Mentors manage own history exam usage"
  on public.mentor_history_exam_usage for all
  using (auth.uid() = mentor_id)
  with check (auth.uid() = mentor_id);
