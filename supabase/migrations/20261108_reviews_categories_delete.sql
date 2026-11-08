alter table public.reviews add column if not exists category text not null default 'general';
alter table public.reviews add column if not exists tags text[] not null default '{}';

create index if not exists reviews_category_idx on public.reviews (category);
create index if not exists reviews_tags_idx on public.reviews using gin (tags);

drop policy if exists "delete reviews staff" on public.reviews;
create policy "delete reviews staff"
  on public.reviews for delete to authenticated
  using (public.is_staff());
