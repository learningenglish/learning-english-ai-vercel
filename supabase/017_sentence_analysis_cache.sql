-- ============================================================
-- Cache phía SERVER cho kết quả phân tích câu (analyze_sentence) — dùng chung cho MỌI người
-- dùng đọc cùng 1 nội dung, thay vì cache riêng từng máy (localStorage). Mục tiêu: giảm chi
-- phí gọi AI (nhiều học viên cùng đọc 1 bài chỉ tốn 1 lần phân tích thật) + loại bỏ hiện
-- tượng kết quả CEFR/gộp cụm đổi ngẫu nhiên giữa các lần gọi cho cùng 1 câu.
--
-- Bảng này CHỈ được truy cập bởi backend (api/chat.js) qua SUPABASE_SERVICE_ROLE_KEY — không
-- có API/UI nào cho client gọi trực tiếp. Enable RLS + KHÔNG tạo policy nào cho
-- anon/authenticated (an toàn ngay cả khi lỡ dùng nhầm anon key ở đâu đó sau này).
--
-- Chỉ cache kết quả ĐÃ QUA VALIDATE (string-matching token-cho-token) — action tự kiểm tra
-- trước khi ghi, bảng này không tự validate gì cả, chỉ lưu trữ thuần.
-- Chạy sau 016.
-- ============================================================

create table if not exists public.sentence_analysis_cache (
  cache_key text primary key,   -- sha256(sentence + "|" + level)
  sentence text not null,
  level text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

-- Tra cứu nhanh theo sentence+level khi cần xoá cache thủ công (Mentor muốn phân tích lại)
create index if not exists sentence_analysis_cache_lookup
  on public.sentence_analysis_cache (sentence, level);

alter table public.sentence_analysis_cache enable row level security;

-- KHÔNG tạo bất kỳ policy nào cho anon/authenticated — chỉ service_role (bypass RLS) được
-- đọc/ghi/xoá bảng này, đúng nguyên tắc "mọi bảng mới phải soát RLS/GRANT trước khi chạy".
revoke all on public.sentence_analysis_cache from public, anon, authenticated;
