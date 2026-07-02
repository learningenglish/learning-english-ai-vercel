-- ============================================================
-- Bảng "tutors" — tài khoản giáo viên (Tutor độc lập, chưa gắn Academy)
-- Chạy trong Supabase Dashboard > SQL Editor
-- ============================================================

-- 1) Bảng chính
create table if not exists public.tutors (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  phone text,
  plan text not null default 'free' check (plan in ('free', 'go', 'pro')),
  credits integer not null default 0,
  max_active_classes integer not null default 3,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tutors is 'Tài khoản giáo viên (Tutor độc lập). academy_id sẽ được thêm ở giai đoạn có Academy.';

-- 2) Row Level Security — mỗi tutor chỉ thấy/sửa được đúng hồ sơ của mình
alter table public.tutors enable row level security;

drop policy if exists "Tutors can view own profile" on public.tutors;
create policy "Tutors can view own profile"
  on public.tutors for select
  using (auth.uid() = id);

drop policy if exists "Tutors can update own profile" on public.tutors;
create policy "Tutors can update own profile"
  on public.tutors for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Không có policy INSERT/DELETE cho client:
-- - INSERT được thực hiện tự động qua trigger bên dưới khi có user mới đăng ký.
-- - DELETE/điều chỉnh credit theo logic nghiệp vụ nên đi qua service role (backend), không cho client tự sửa.

-- 3) Tự động tạo hồ sơ tutor khi có tài khoản Auth mới đăng ký
create or replace function public.handle_new_tutor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tutors (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_tutor();

-- 4) Tự động cập nhật updated_at mỗi khi hồ sơ tutor thay đổi
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tutors_set_updated_at on public.tutors;
create trigger tutors_set_updated_at
  before update on public.tutors
  for each row execute function public.set_updated_at();
