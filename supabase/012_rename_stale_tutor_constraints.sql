-- ============================================================
-- Rà soát: 006_rename_tutor_to_mentor.sql đã đổi tên bảng/cột/index/
-- trigger/policy Tutor->Mentor, nhưng CHECK/PRIMARY KEY/FOREIGN KEY/
-- UNIQUE constraint (đặt tên tự động lúc CREATE TABLE) KHÔNG tự đổi
-- tên theo khi ALTER TABLE ... RENAME — Postgres chỉ đổi tên bảng/cột
-- trong catalog, giữ nguyên tên constraint gốc (vd
-- "tutor_exams_level_check"). Đây thuần tuý cosmetic (logic constraint
-- vẫn đúng), nhưng gây thông báo lỗi hiểu lầm — đúng như BUG 2 vừa gặp.
--
-- Quét TOÀN BỘ constraint còn chứa chữ "tutor" trên 7 bảng đã đổi tên,
-- đổi lại cho khớp — dùng vòng lặp động (không hardcode từng tên) để
-- không bỏ sót constraint nào, kể cả các FK có tên kiểu
-- "tutor_exams_tutor_id_fkey" (chứa "tutor" ở CẢ tên bảng lẫn tên cột
-- cũ, cần thay TOÀN BỘ chữ "tutor", không chỉ phần đầu).
-- Chạy sau 006 (thời điểm nào cũng được, độc lập với 007-011).
-- ============================================================
do $$
declare
  r record;
  new_name text;
begin
  for r in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conrelid::regclass::text in (
        'mentors','mentor_folders','mentor_history','mentor_saved_words',
        'mentor_exams','mentor_students','mentor_shares'
      )
      and conname like '%tutor%'
  loop
    new_name := replace(r.conname, 'tutor', 'mentor');
    execute format('alter table public.%s rename constraint %I to %I', r.tbl, r.conname, new_name);
    raise notice 'renamed % -> % on %', r.conname, new_name, r.tbl;
  end loop;
end $$;
