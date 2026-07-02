-- ============================================================
-- Bảng "tutor_history" (lịch sử/thư viện đã phân tích) và
-- "tutor_saved_words" (từ đã lưu) — gắn với tutor_id
-- Chạy trong Supabase Dashboard > SQL Editor, SAU khi đã chạy 001_tutors.sql
-- ============================================================

-- 1) Lịch sử (mirror của localStorage "history_en8")
create table if not exists public.tutor_history (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  client_id text not null, -- = "time" (mốc thời gian ms) dùng làm id phía client, để đối chiếu 1-1
  text text,
  result text, -- HTML kết quả phân tích đã render, để mở lại y hệt
  level text,
  custom_name text,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tutor_id, client_id)
);

alter table public.tutor_history enable row level security;

drop policy if exists "Tutors manage own history" on public.tutor_history;
create policy "Tutors manage own history"
  on public.tutor_history for all
  using (auth.uid() = tutor_id)
  with check (auth.uid() = tutor_id);

-- 2) Từ đã lưu (mirror của "savedWordsList" trong localStorage "stats_en8")
create table if not exists public.tutor_saved_words (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  word_key text not null,
  lemma text,
  meaning text,
  level text,
  created_at timestamptz not null default now(),
  unique (tutor_id, word_key)
);

alter table public.tutor_saved_words enable row level security;

drop policy if exists "Tutors manage own saved words" on public.tutor_saved_words;
create policy "Tutors manage own saved words"
  on public.tutor_saved_words for all
  using (auth.uid() = tutor_id)
  with check (auth.uid() = tutor_id);
