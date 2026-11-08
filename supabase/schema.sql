-- Instant Plus Technical Content Evaluation Tool
-- Run in Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text unique,
  full_name text,
  role text not null default 'reviewer'
    check (role in ('super_admin', 'admin', 'reviewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  anthropic_api_key text default '',
  groq_api_key text default '',
  openai_api_key text default '',
  llm_provider text not null default 'groq',
  llm_model text not null default 'openai/gpt-oss-120b',
  whisper_model text not null default 'auto',
  max_cost numeric null,
  anthropic_verified_at timestamptz null,
  groq_verified_at timestamptz null,
  openai_verified_at timestamptz null,
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
  quality_score numeric null,
  duration_ms int null,
  cost numeric null,
  report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reviews_user_id_idx on public.reviews (user_id);
create index if not exists reviews_created_at_idx on public.reviews (created_at desc);

-- Safe upgrades for existing projects
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.user_settings add column if not exists openai_api_key text default '';
alter table public.user_settings add column if not exists anthropic_verified_at timestamptz null;
alter table public.user_settings add column if not exists groq_verified_at timestamptz null;
alter table public.user_settings add column if not exists openai_verified_at timestamptz null;
alter table public.reviews add column if not exists quality_score numeric null;
alter table public.reviews add column if not exists duration_ms int null;
alter table public.reviews add column if not exists category text not null default 'general';
alter table public.reviews add column if not exists tags text[] not null default '{}';
alter table public.reviews add column if not exists session_title text;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reviews add column if not exists course_id uuid references public.courses(id) on delete set null;

create index if not exists reviews_category_idx on public.reviews (category);
create index if not exists reviews_tags_idx on public.reviews using gin (tags);
create index if not exists reviews_session_title_idx on public.reviews (session_title);
create index if not exists reviews_course_id_idx on public.reviews (course_id);
create index if not exists courses_slug_idx on public.courses (slug);
create index if not exists courses_name_idx on public.courses (name);

do $$
begin
  alter table public.profiles drop constraint if exists profiles_role_check;
  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('super_admin', 'admin', 'reviewer'));
exception when others then
  null;
end $$;

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.reviews enable row level security;
alter table public.courses enable row level security;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'reviewer'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('super_admin', 'admin');
$$;

drop policy if exists "read own profile" on public.profiles;
drop policy if exists "admin read all profiles" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
drop policy if exists "staff update profiles" on public.profiles;

create policy "read own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "staff read all profiles"
  on public.profiles for select to authenticated
  using (public.is_staff());

create policy "update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id and role = (select role from public.profiles where id = auth.uid()));

create policy "staff update profiles"
  on public.profiles for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "read own settings" on public.user_settings;
drop policy if exists "upsert own settings" on public.user_settings;
drop policy if exists "update own settings" on public.user_settings;
drop policy if exists "staff read settings" on public.user_settings;
drop policy if exists "staff update settings" on public.user_settings;

create policy "read own settings"
  on public.user_settings for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "staff read settings meta"
  on public.user_settings for select to authenticated
  using (public.is_staff());

create policy "upsert own settings"
  on public.user_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "update own settings"
  on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "staff upsert settings"
  on public.user_settings for insert to authenticated
  with check (public.is_staff());

create policy "staff update settings"
  on public.user_settings for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "read own reviews" on public.reviews;
drop policy if exists "insert own reviews" on public.reviews;
drop policy if exists "update own reviews" on public.reviews;

create policy "read own reviews"
  on public.reviews for select to authenticated
  using (
    (select auth.uid()) = user_id
    or public.is_staff()
  );

create policy "insert own reviews"
  on public.reviews for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "update own reviews"
  on public.reviews for update to authenticated
  using (
    (select auth.uid()) = user_id
    or public.is_staff()
  )
  with check (
    (select auth.uid()) = user_id
    or public.is_staff()
  );

drop policy if exists "delete reviews staff" on public.reviews;
create policy "delete reviews staff"
  on public.reviews for delete to authenticated
  using (public.is_staff());

drop policy if exists "read courses authenticated" on public.courses;
create policy "read courses authenticated"
  on public.courses for select to authenticated
  using (true);

drop policy if exists "insert courses authenticated" on public.courses;
create policy "insert courses authenticated"
  on public.courses for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "update courses staff" on public.courses;
create policy "update courses staff"
  on public.courses for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "delete courses staff" on public.courses;
create policy "delete courses staff"
  on public.courses for delete to authenticated
  using (public.is_staff());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role text;
begin
  assigned_role := coalesce(
    nullif(new.raw_app_meta_data->>'role', ''),
    nullif(new.raw_user_meta_data->>'role', ''),
    'reviewer'
  );
  if assigned_role not in ('super_admin', 'admin', 'reviewer') then
    assigned_role := 'reviewer';
  end if;

  insert into public.profiles (id, email, username, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    assigned_role
  )
  on conflict (id) do update set
    email = excluded.email,
    username = coalesce(excluded.username, public.profiles.username),
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    role = excluded.role,
    updated_at = now();

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.profiles to authenticated, service_role;
grant select, insert, update, delete on public.user_settings to authenticated, service_role;
grant select, insert, update, delete on public.reviews to authenticated, service_role;
grant select, insert, update, delete on public.courses to authenticated, service_role;
grant select on public.profiles to anon;

insert into public.courses (name, slug)
values
  ('تطوير الواجهات', 'frontend'),
  ('الباك اند وواجهات API', 'backend'),
  ('تطوير الموبايل', 'mobile'),
  ('البيانات والذكاء الاصطناعي', 'data'),
  ('DevOps والسحابة', 'devops'),
  ('الأمن السيبراني', 'security'),
  ('تصميم تجربة المستخدم', 'uiux'),
  ('المهارات الشخصية', 'soft_skills'),
  ('كورس عام', 'general')
on conflict (slug) do update set name = excluded.name, updated_at = now();

-- Ensure Mazen Super Admin profile role (run after user exists in Auth)
update public.profiles
set role = 'super_admin',
    full_name = coalesce(nullif(full_name, ''), 'Mazen Othman'),
    username = coalesce(nullif(username, ''), 'mazen'),
    is_active = true,
    updated_at = now()
where lower(email) = lower('MazenOthman320@gmail.com');
