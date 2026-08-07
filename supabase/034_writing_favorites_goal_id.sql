-- ============================================================
-- Tái cấu trúc luồng theo cây MỚI (2026-08-06, Minh: "Chuyên ngành -> Bài học/Hội thoại/Phân
-- tích/Luyện viết") — nhánh "Luyện viết" cần lọc writing_favorites theo Chuyên ngành (goal)
-- đang active, giống lessons.goal_id đã có sẵn (migration 020) — writing_favorites (028) trước
-- đó KHÔNG có cột này (tính năng ra đời trước hệ thống Chuyên ngành).
--
-- Additive, không đụng cột nào khác. Không backfill dữ liệu cũ (giữ NULL) — app/js/db.js đọc
-- CẢ bản ghi goal_id=null lẫn goal_id khớp Chuyên ngành đang active (xem listWritingFavorites()),
-- không có bản ghi nào biến mất khỏi màn hình.
--
-- Chạy sau 033.
-- ============================================================

alter table public.writing_favorites
  add column if not exists goal_id uuid references public.learning_goals (id) on delete set null;
