-- ============================================================
-- "news_lessons" — Tin tức tự sinh hàng ngày (mục con MỚI dưới tab "Phổ biến", 2026-07-28) —
-- 3 bài đọc + 3 hội thoại/ngày, chủ đề lấy từ tin thời sự THẬT (AI tự tìm kiếm web — xem
-- api/_generate/news.js), KHÔNG gắn với 1 user_id nào (nội dung DÙNG CHUNG cho mọi tài khoản,
-- khác hẳn "lessons" cá nhân). Đọc-công-khai cho MỌI tài khoản đã đăng nhập, CHỈ service role
-- (cron endpoint) mới ghi được — đúng nguyên tắc đã dùng cho "industry_skins" (023).
--
-- QUYẾT ĐỊNH CHỐT VỚI MINH (2026-07-28):
-- 1. Mục con "Tin tức" RIÊNG dưới tab Phổ biến (không thay thế danh sách bài cá nhân hiện có).
-- 2. Giữ lại VÔ THỜI HẠN — không tự xoá/xoay vòng theo ngày, chỉ admin xoá tay khi cần (chưa có
--    UI admin, xoá trực tiếp qua Supabase Table Editor nếu cần tới lúc đó).
-- 3. Nguồn tin: AI tự tìm kiếm web (KHÔNG dùng RSS/News API riêng) — xem lý do kỹ thuật + xác
--    nhận web_search hoạt động thật trong api/_shared/aiProvider.js.
-- 4. Phân loại "category" — danh sách CỐ ĐỊNH (check constraint), để nhóm hiển thị nhất quán,
--    không bị phân mảnh do AI tự đặt tên khác nhau mỗi lần.
--
-- Chạy sau 028.
-- ============================================================

create table if not exists public.news_lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_vi text not null,
  level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1')),
  content_type text not null check (content_type in ('reading', 'dialogue')),
  situation text,
  content jsonb not null,
  vocabulary jsonb not null default '[]'::jsonb,
  grammar jsonb not null default '[]'::jsonb,
  sentence_patterns jsonb not null default '[]'::jsonb,
  exercises jsonb not null default '[]'::jsonb,
  -- Danh sách lĩnh vực CỐ ĐỊNH (mục 4 quyết định ở trên) — thêm lĩnh vực mới thì sửa CHECK này,
  -- không để AI tự bịa tên lĩnh vực mới mỗi lần sinh (sẽ phân mảnh nhóm hiển thị).
  category text not null check (
    category in ('Kinh tế', 'Công nghệ', 'Thể thao', 'Sức khỏe', 'Khoa học', 'Giải trí', 'Xã hội', 'Môi trường')
  ),
  source_headline text, -- tiêu đề tin gốc AI tìm được lúc sinh bài — CHỈ để tham khảo/audit, không hiển thị cho học viên
  cover_image_url text,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists news_lessons_published_idx on public.news_lessons (published_at desc);
create index if not exists news_lessons_category_idx on public.news_lessons (category);

alter table public.news_lessons enable row level security;

-- Đọc CÔNG KHAI cho mọi tài khoản đã đăng nhập (Student/Mentor đều xem được — nội dung không
-- thuộc về ai, không cần phân biệt vai trò) — KHÔNG có policy insert/update/delete cho
-- authenticated, mọi lượt ghi đi qua cron endpoint (service role), xem api/cron/generate-news.js.
drop policy if exists "Authenticated users read news_lessons" on public.news_lessons;
create policy "Authenticated users read news_lessons"
  on public.news_lessons for select
  using (auth.role() = 'authenticated');
