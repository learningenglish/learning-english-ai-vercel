-- ============================================================
-- Mentor AI (Đợt 3 Bước 4) — cột xưng hô + cache chống lặp câu + bảng nhật ký sự kiện.
-- Xem api/_generate/mentor.js + api/_generate/mentor-lines/*.json (kho 1213 dòng đã đóng băng).
--
-- Chạy sau 020.
-- ============================================================

-- ============================================================
-- 1) "students" — cột xưng hô + cache chống lặp
-- ============================================================
alter table public.students
  -- 4 giá trị cố định (mục 3.2 Đợt 3) — null = "chưa từng chọn", lớp Lời thoại coi null
  -- như 'toi_ban' (mặc định khi người dùng không chọn, đã chốt với Minh 2026-07-21).
  add column if not exists pronoun_style text
    check (pronoun_style in ('toi_anh', 'toi_chi', 'toi_ban', 'toi_ten')),
  -- Chỉ có ý nghĩa khi pronoun_style = 'toi_ten' và người dùng tự nhập tên khác tên tài
  -- khoản; null thì lớp Lời thoại tự lấy full_name.
  add column if not exists nickname text,
  -- Đánh dấu "đã hiện màn nghi thức xưng hô" (không phải "đã chọn") — màn chỉ hiện 1 lần/
  -- user dù người dùng có chọn chip nào hay bỏ qua (điều hướng đi chỗ khác) hay không.
  add column if not exists pronoun_asked_at timestamptz,
  -- Bộ chọn ngẫu nhiên chống lặp: { "<file>.<mảnh>": <index câu vừa dùng lần gần nhất> }.
  -- Cột nhỏ dạng cache theo đúng mục 3.4 điểm 3 Đợt 3, KHÔNG phải bảng riêng.
  add column if not exists mentor_last_lines jsonb not null default '{}'::jsonb;

-- ============================================================
-- 2) "mentor_events" — nhật ký sự kiện (mục 3.4 điểm 4 Đợt 3), dữ liệu bổ sung hồ sơ
--    năng lực, KHÔNG dùng để tự kích hoạt phản hồi (chỉ 3 biến cố ở mục 3.1 mới kích
--    hoạt Mentor nói — event log không phải 1 trong 3 biến cố đó).
-- ============================================================
create table if not exists public.mentor_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mentor_events_user_created_idx
  on public.mentor_events (user_id, created_at desc);

alter table public.mentor_events enable row level security;
-- Không có policy nào cho authenticated -> chỉ service role (api/_generate/mentor.js) ghi/đọc
-- được bảng này, giống nguyên tắc learning_goals ở 020 (client không tự chèn log giả).
