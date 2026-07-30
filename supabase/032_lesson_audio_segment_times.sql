-- ============================================================
-- MỐC THỜI GIAN THẬT CHO TỪNG CÂU trong file audio_full_url (2026-07-30,
-- khủng hoảng chất lượng mục 1+2+3+9). Nguyên nhân gốc đã xác nhận: file
-- audio ghép sẵn (031_lesson_full_audio.sql) chỉ lưu 1 URL DUY NHẤT cho CẢ
-- BÀI, không có mốc thời gian của TỪNG câu bên trong -> 2 hậu quả:
--   1) Icon loa đọc-1-câu (views/lesson.js) không có toạ độ để "cắt" đúng
--      đoạn của câu đó ra khỏi file đã ghép -> phải rơi về Web Speech.
--   2) Lúc phát cả bài, việc "câu nào đang đọc" chỉ ƯỚC LƯỢNG theo số
--      từ/giây trung bình (tts.js estimatePositionForSeconds), lệch dần so
--      với giọng đọc thật -> card hiển thị không khớp thời điểm audio thật
--      chuyển câu.
--
-- Cột mới lưu ĐÚNG mốc giây thật của từng câu (đã biết chính xác lúc ghép,
-- xem api/_generate/audio.js: mỗi đoạn WAV có "data.length" byte PCM ÷
-- "fmt.byteRate" = số giây thật, cộng dồn theo thứ tự + khoảng lặng
-- SILENCE_GAP_MS đã chèn giữa 2 đoạn) — không tốn thêm lượt gọi AI nào,
-- chỉ là phép tính cộng dồn trên dữ liệu đã có sẵn trong request đó.
--
-- Định dạng: mảng JSON, 1 phần tử/1 câu trong "lessons.content", ĐÚNG THỨ
-- TỰ (bỏ qua câu rỗng giống cách "paired" trong audio.js lọc trước khi
-- sinh) — vd [{"start":0,"end":2.4},{"start":2.7,"end":5.1},...].
--
-- Chạy sau 031.
-- ============================================================

alter table public.lessons
  add column if not exists audio_segment_times jsonb;

-- KHÔNG cần GRANT/REVOKE riêng (giống audio_full_url ở 031) — public.lessons
-- đã revoke UPDATE từ authenticated trừ is_favorite (019_lessons.sql), cột
-- mới tự động thừa hưởng: chỉ service role (api/_generate/audio.js) ghi được.
