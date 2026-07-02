-- ============================================================
-- Mục E — cơ chế mở khoá "Bài Kiểm Tra": cần N mục mới kể từ lần tạo
-- Bài Kiểm Tra GẦN NHẤT từ ĐÚNG NGUỒN đó. Thêm cột "source" để biết
-- mỗi lần tạo dùng nguồn nào (mốc so sánh = created_at của lần tạo
-- gần nhất CÙNG nguồn, tự suy ra từ dữ liệu có sẵn — không cần bảng
-- baseline riêng).
--
-- Chỉ áp dụng cho kind='bai_kiem_tra' — "Đề" (kind='de') không có
-- khái niệm nguồn (luôn theo 1 folder cụ thể), nên cột này NULL.
-- Chạy sau 013.
-- ============================================================

alter table public.mentor_exams
  add column if not exists source text check (source in ('saved','viewed','sent','current'));
