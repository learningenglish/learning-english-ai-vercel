-- ============================================================
-- "industry_skins" — da lĩnh vực (Lượt B của api/_generate/curriculum/skin.js,
-- generateLevelTopics) nối vào luồng next_slot của Mentor AI. Nối sau bài kiểm nghiệm thu
-- 3 ngành thành công (2026-07-22, xem project_skin_acceptance_test_round1 trong memory) —
-- Lượt B trước đó CHƯA từng được gọi từ luồng sản phẩm thật, chỉ tồn tại như hàm export.
--
-- QUYẾT ĐỊNH KIẾN TRÚC (chốt với Minh 2026-07-22):
-- 1. DÙNG CHUNG theo ngành, không sinh riêng cho từng learning_goals — nhiều học viên cùng
--    ngành (vd cùng "Logistics") chia sẻ 1 hàng ở đây, chỉ sinh 1 lần/ngành/level. Khoá dùng
--    chung là occupation_key (chuẩn hoá lowercase+trim merged_occupation) — CHẤP NHẬN nợ kỹ
--    thuật: 2 occupation_profile cùng 1 ngành thật nhưng merged_occupation lệch chữ (vd
--    "Logistics" vs "Quản lý Logistics") sẽ tạo 2 hàng riêng thay vì dùng chung — không có
--    bước gộp ngữ nghĩa bằng AI (tốn thêm 1 lượt gọi chỉ để so khớp, không đáng).
-- 2. SINH DẦN từng level khi cần tới (KHÔNG sinh đủ 5 level ngay lúc tạo mục tiêu) — mỗi lượt
--    generateLevelTopics ~15-25s, 5 lượt tuần tự chắc chắn vượt trần maxDuration=60s của
--    api/chat.js (vercel.json) nếu gộp vào 1 request. "levels" điền dần, "level_status" theo
--    dõi level nào đã có/đang chờ/lỗi.
--
-- Chạy sau 022.
-- ============================================================

create table if not exists public.industry_skins (
  id uuid primary key default gen_random_uuid(),
  occupation_key text not null unique,  -- lower(trim(merged_occupation)) — xem note nợ kỹ thuật ở trên
  occupation_profile jsonb not null,    -- occupation_profile CỦA LẦN sinh industry_skins này (tham khảo/audit, không phải nguồn chân lý cho từng learning_goals — mỗi goal tự giữ occupation_profile riêng)
  levels jsonb not null default '{}'::jsonb,        -- { "A1": { "<frame_key>": [{"topic":"...","fallback":false}, ...] }, ... } — điền dần
  level_status jsonb not null default '{}'::jsonb,  -- { "A1": "ok" | "failed", ... } — "failed" để mentor.js biết rơi về fallback skin_general.json, KHÔNG chặn tạo bài
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Không có policy nào cho anon/authenticated — bảng này KHÔNG có user_id (dữ liệu dùng
-- chung, không thuộc về 1 người), client không cần đọc trực tiếp (mọi truy cập đi qua
-- mentor_next_lesson, service role). Enable RLS để không vô tình mở PostgREST mặc định.
alter table public.industry_skins enable row level security;

-- ============================================================
-- "lessons" — cộng 2 cột audit cho bài sinh qua next_slot: skin_id (industry_skins nào cấp
-- chủ đề, null cho bài KHÔNG qua next_slot — "Tạo bài học"/"Tôi có văn bản"/mục tiêu chung)
-- và spine_slot (số slot trong curriculum_spine.json đã dùng, để xác nhận "đúng thứ tự
-- spine, không lặp chủ đề" khi kiểm — đọc thẳng từ lessons thay vì phải suy luận lại).
-- ============================================================
alter table public.lessons
  add column if not exists skin_id uuid references public.industry_skins (id) on delete set null;

alter table public.lessons
  add column if not exists spine_slot integer;

-- ============================================================
-- NỢ KỸ THUẬT (ghi nhận, chưa xử lý ở migration này):
-- 1. occupation_key khớp CHÍNH XÁC theo chữ (xem note đầu file) — không gộp ngữ nghĩa các
--    cách gọi khác nhau của CÙNG 1 ngành thật.
-- 2. Không có cơ chế dọn/nén industry_skins theo thời gian — bảng chỉ lớn dần theo số ngành
--    khác nhau đã từng có người học (không phải theo số user), tăng trưởng chậm, chưa cần lo.
-- ============================================================
