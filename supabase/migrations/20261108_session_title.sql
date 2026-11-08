alter table public.reviews add column if not exists session_title text;

create index if not exists reviews_session_title_idx on public.reviews (session_title);
