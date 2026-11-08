create extension if not exists pgcrypto;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists courses_slug_idx on public.courses (slug);
create index if not exists courses_name_idx on public.courses (name);

alter table public.reviews add column if not exists session_title text;
alter table public.reviews add column if not exists course_id uuid references public.courses(id) on delete set null;
alter table public.reviews add column if not exists category text not null default 'general';
alter table public.reviews add column if not exists tags text[] not null default '{}';

create index if not exists reviews_session_title_idx on public.reviews (session_title);
create index if not exists reviews_course_id_idx on public.reviews (course_id);
create index if not exists reviews_category_idx on public.reviews (category);

-- Seed default catalog courses (slug = catalog id)
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

-- Promote distinct legacy category values into courses
insert into public.courses (name, slug)
select distinct
  coalesce(nullif(trim(r.category), ''), 'general') as name,
  lower(regexp_replace(coalesce(nullif(trim(r.category), ''), 'general'), '[^a-zA-Z0-9\u0600-\u06FF]+', '-', 'g')) as slug
from public.reviews r
where coalesce(nullif(trim(r.category), ''), 'general') is not null
on conflict (slug) do nothing;

-- Also map known English catalog labels / ids already stored as category
update public.reviews r
set course_id = c.id
from public.courses c
where r.course_id is null
  and (
    r.category = c.slug
    or r.category = c.name
  );

-- Fallback: any remaining rows without course_id -> general
update public.reviews r
set course_id = c.id,
    category = coalesce(nullif(trim(r.category), ''), 'general')
from public.courses c
where r.course_id is null
  and c.slug = 'general';

-- Keep category synced to course slug for backward compatibility
update public.reviews r
set category = c.slug
from public.courses c
where r.course_id = c.id
  and (r.category is distinct from c.slug);

alter table public.courses enable row level security;

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

grant select, insert, update, delete on public.courses to authenticated, service_role;
