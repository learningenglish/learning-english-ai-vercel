-- ============================================================
-- Tính năng MỚI "Luyện viết" (Writing Practice, 2026-07-27) — bảng
-- "writing_submissions" lưu 1 lượt AI CHẤM bài viết của học viên. Mục
-- đích KÉP: (1) hạn mức lượt chấm/ngày (đếm số dòng user tạo hôm nay,
-- giống ĐÚNG cách checkDailyLessonLimit() đang đếm bảng "lessons" ở
-- api/_generate/lesson.js — xem "startOfTodayVN"), (2) lưu lại dữ liệu
-- bài viết + điểm để dùng sau này (chưa có UI Lịch sử luyện viết ở đợt
-- này, chỉ lưu sẵn cho tương lai).
--
-- QUYẾT ĐỊNH HẠN MỨC (đề xuất, xem báo cáo cho Minh — KHÔNG đụng tới
-- DAILY_LESSON_LIMIT/bảng "lessons" hiện có, đây là hạn mức RIÊNG,
-- ĐỘC LẬP hoàn toàn, cùng số 10/ngày cho dễ nhớ, cùng cổng "chỉ Student
-- Pro" để nhất quán với generate_lesson/analyze_user_text — vì đây
-- cũng là hành động gọi AI thật, tốn phí thật mỗi lần bấm "Gửi bài
-- viết". Sinh đề bài (generate_writing_task) KHÔNG đếm vào hạn mức này
-- (rẻ hơn, được phép đổi đề tự do) — chỉ CHẤM bài (grade_writing) mới
-- insert 1 dòng vào bảng này.
--
-- user_id trỏ THẲNG auth.users (không trỏ students riêng) — giống mẫu
-- lessons.user_id ở 019_lessons.sql, cùng lý do (Mentor cũng có
-- auth.users, không có lý do kỹ thuật nào chặn Mentor tự luyện viết).
--
-- INSERT KHÔNG có policy cho authenticated — bắt buộc qua service role
-- trong api/_generate/writing.js (grade_writing), giống HỆT nguyên tắc
-- "lessons" (tránh học viên tự chèn bản ghi giả để né hạn mức).
--
-- Chạy sau 024.
-- ============================================================

create table if not exists public.writing_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1')),
  industry text,
  task jsonb not null,              -- {topic_en, topic_vi, goals[], structure[]} từ Bước 2 (generate_writing_task)
  submitted_text text not null,     -- nguyên văn bài viết của học viên (Bước 3)
  overall_score integer not null,   -- tổng điểm /100 (Bước 4)
  criteria jsonb not null,          -- [{key,label,score,comment}] 5 tiêu chí (Bước 4)
  segments jsonb not null,          -- [{text,issue_type,replacement?,suggestion?}] (Bước 5)
  notices jsonb,                    -- 2 thông báo tổng quan (thiếu từ chuyên ngành / cấu trúc đơn giản), có thể rỗng
  created_at timestamptz not null default now()
);

-- Đếm hạn mức/ngày (giống startOfTodayVN() + đếm "lessons" ở lesson.js) + liệt kê lịch sử sau này
create index if not exists writing_submissions_user_created_idx
  on public.writing_submissions (user_id, created_at desc);

alter table public.writing_submissions enable row level security;

-- Chỉ đọc bài viết của chính mình — không có policy public nào khác,
-- không cần UPDATE/DELETE (bài chấm xong là bản ghi cố định, không sửa).
drop policy if exists "Users view own writing submissions" on public.writing_submissions;
create policy "Users view own writing submissions"
  on public.writing_submissions for select
  using (auth.uid() = user_id);

-- Không tạo policy INSERT cho authenticated -> RLS chặn hết insert trực
-- tiếp từ client, chỉ service role (bypass RLS, dùng trong
-- api/_generate/writing.js) mới ghi được bảng này.
