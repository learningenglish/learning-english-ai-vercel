-- ============================================================
-- Cache phía SERVER cho ảnh minh hoạ theo từ/cụm — dùng chung cho MỌI người dùng đọc cùng 1
-- từ/cụm, tránh gọi lại pipeline (Wikimedia/Unsplash/Pexels/AI sinh ảnh) mỗi lần hiển thị.
-- Xem api/chat.js: getOrFetchWordImage().
--
-- Bảng này CHỈ được truy cập bởi backend (api/chat.js) qua SUPABASE_SERVICE_ROLE_KEY — client
-- không bao giờ query bảng này trực tiếp, chỉ nhận URL ảnh qua action get_sentence_image.
-- Enable RLS + KHÔNG tạo policy nào cho anon/authenticated, giống 017.
--
-- Cột "status": 'approved' | 'pending' | 'rejected'. Đợt này mặc định 'approved' ngay khi lưu
-- (chưa dựng UI duyệt cho Mentor) — cột đã có sẵn để bật bước duyệt thủ công sau này mà không
-- cần sửa schema lại. Ảnh 'rejected' (nếu về sau có UI đánh dấu) sẽ bị getOrFetchWordImage()
-- bỏ qua và pipeline chạy lại từ đầu cho lượt gọi kế tiếp.
-- Chạy sau 017.
-- ============================================================

create table if not exists public.word_image_cache (
  lookup_key text primary key,   -- normalize(term), vd "the taxi arrived" -> "the taxi arrived"
  term text not null,            -- cụm gốc dùng để tìm ảnh (giữ nguyên chữ hoa/thường)
  url text not null,
  source text not null,          -- 'wikimedia' | 'unsplash' | 'pexels' | 'ai_generated'
  license text,                  -- vd 'CC-BY-SA-4.0', null nếu nguồn không cần ghi giấy phép (unsplash/pexels/ai_generated)
  attribution text,               -- tên tác giả/nguồn cần ghi khi hiển thị (chủ yếu cho CC-BY)
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

alter table public.word_image_cache enable row level security;

-- KHÔNG tạo bất kỳ policy nào cho anon/authenticated — chỉ service_role (bypass RLS) được
-- đọc/ghi/xoá bảng này, đúng nguyên tắc "mọi bảng mới phải soát RLS/GRANT trước khi chạy".
revoke all on public.word_image_cache from public, anon, authenticated;
