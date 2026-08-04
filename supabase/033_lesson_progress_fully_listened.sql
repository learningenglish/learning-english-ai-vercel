-- ============================================================
-- "ĐÃ HỌC" = nghe TRỌN VẸN audio thật (2026-08-04, làm mới khung điều hướng, Phần A5) — 3 mức
-- trạng thái mỗi bài trên màn danh sách (views/lessons.js): Chưa học (không có row) / Đang học
-- (có row, fully_listened_at null) / Đã học (fully_listened_at có giá trị).
--
-- Ghi bởi app/js/views/lesson.js::saveProgress({ fullyListened: true }) — CHỈ đặt khi tts.js
-- báo hiệu đã phát HẾT toàn bộ playlist (fullAudioEl.onended HOẶC goToItem() vượt item cuối,
-- xem app/js/tts.js::justEnded) — KHÔNG đặt chỉ vì mở bài/bấm Play.
--
-- Additive, không đụng cột nào khác của lesson_progress (supabase/019_lessons.sql).
-- Chạy sau 032.
-- ============================================================

alter table public.lesson_progress
  add column if not exists fully_listened_at timestamptz;
