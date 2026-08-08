-- 037_lesson_characters.sql — thêm cột "characters" (jsonb) vào bảng lessons.
--
-- Bối cảnh: giọng đọc TTS (Web Speech + audio trả phí OpenAI) trước đây phải TỰ ĐOÁN giới tính
-- từng nhân vật hội thoại qua 1 bảng tên tiếng Anh cứng (app/js/tts.js) — vai trò như "CEO"/
-- "CFO" hay tên lạ không có trong bảng bị đoán ngẫu nhiên, gây giọng đọc sai/loạn giữa các nhân
-- vật. Giờ chính AI khai báo giới tính từng nhân vật NGAY LÚC SINH BÀI (trường "characters" mới
-- trong schema JSON, xem api/_generate/lesson.js), lưu thẳng vào cột này. Additive, không đụng
-- cột nào khác — bài CŨ có characters=[] (mặc định) vẫn hoạt động bình thường qua cơ chế đoán
-- tên cũ (fallback).

alter table public.lessons
  add column if not exists characters jsonb default '[]'::jsonb;
