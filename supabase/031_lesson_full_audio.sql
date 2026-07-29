-- ============================================================
-- ÂM THANH TRẢ PHÍ — GHÉP THÀNH 1 FILE DUY NHẤT (2026-07-30, thay hẳn kiến
-- trúc "sinh lười từng câu" trong 030_lesson_audio.sql). Minh phản hồi thật:
-- phát từng câu riêng (dù đã có look-ahead prefetch) vẫn khựng khi chuyển
-- câu vì mỗi câu là 1 <audio> element/1 request riêng. Xác nhận kỹ thuật
-- (xem api/_generate/audio.js::generate_lesson_full_audio): OpenAI TTS luôn
-- trả cùng 1 định dạng/encoder (mp3, model gpt-4o-mini-tts) cho mọi đoạn
-- trong 1 bài -> nối buffer thô (Buffer.concat, KHÔNG cần ffmpeg) ra 1 file
-- phát liền mạch, sinh xong lưu vĩnh viễn (cùng triết lý generate-once đã
-- dùng cho word_lookup/audio_urls cũ).
--
-- Cột "audio_urls" (030) GIỮ NGUYÊN không xoá (dữ liệu cũ đã sinh vẫn đọc
-- được nếu cần), nhưng KHÔNG còn được ghi thêm — mọi lượt sinh mới đi qua
-- cột "audio_full_url" dưới đây.
--
-- Chạy sau 030.
-- ============================================================

alter table public.lessons
  add column if not exists audio_full_url text;

-- KHÔNG cần GRANT/REVOKE riêng (giống audio_urls ở 030) — public.lessons đã
-- revoke UPDATE từ authenticated trừ is_favorite (019_lessons.sql), cột mới
-- tự động thừa hưởng: chỉ service role (api/_generate/audio.js) ghi được.
