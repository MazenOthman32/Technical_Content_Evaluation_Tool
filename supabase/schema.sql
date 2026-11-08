-- Instant Plus Video Reviewer — Supabase schema
-- Run in Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  role text not null default 'reviewer' check (role in ('admin', 'reviewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  anthropic_api_key text default '',
  groq_api_key text default '',
  llm_provider text not null default 'groq',
  llm_model text not null default 'openai/gpt-oss-120b',
  whisper_model text not null default 'auto',
  max_cost numeric null,
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  video_name text,
  drive_url text,
  provider text,
  model text,
  status text not null default 'queued',
  proposed_verdict text,
  findings_count int default 0,
  cost numeric,
  report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.reviews enable row level security;

-- Profiles
create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "admin read all profiles"
  on public.profiles for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Settings: each user only their own keys
create policy "read own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "upsert own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

create policy "update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id);

-- Reviews
create policy "read own reviews"
  on public.reviews for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "insert own reviews"
  on public.reviews for insert
  with check (auth.uid() = user_id);

create policy "update own reviews"
  on public.reviews for update
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Auto profile + settings on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'reviewer')
  );
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
