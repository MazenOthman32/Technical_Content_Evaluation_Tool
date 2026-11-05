-- الصق الملف ده في Supabase: SQL Editor ثم Run.
-- القراءة والكتابة من السيرفس رول بس. مفيش صلاحية عامة للزوار.

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  topic text,
  source text,
  created_at timestamptz not null default now(),
  report_html text not null,
  transcript text,
  findings jsonb not null default '[]'::jsonb,
  total integer not null default 0,
  major integer not null default 0,
  moderate integer not null default 0,
  minor integer not null default 0
);

alter table public.sessions enable row level security;

drop policy if exists "read sessions" on public.sessions;
create policy "read sessions"
  on public.sessions
  for select
  to anon, authenticated
  using (true);
