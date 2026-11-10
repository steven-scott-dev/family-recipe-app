-- Dish photo cache: one shared photo per dish, filled on first use by the
-- dish-photo edge function (stock photo first, AI-generated fallback).
-- The app reads this table directly; only the edge function (service_role)
-- writes to it. New table created after Oct 30, 2026 -> explicit GRANTs
-- included below per GRANTS_TEMPLATE.md.

create table if not exists public.dish_images (
  dish_key text primary key,
  title text not null,
  image_url text not null,
  source text not null default 'stock',
  attribution text,
  created_at timestamptz not null default now()
);

alter table public.dish_images enable row level security;

drop policy if exists "Anyone can read dish images" on public.dish_images;
create policy "Anyone can read dish images"
  on public.dish_images for select
  to anon, authenticated
  using (true);

grant select on public.dish_images to anon;
grant select on public.dish_images to authenticated;
grant select, insert, update, delete on public.dish_images to service_role;

-- Public storage bucket for the cached dish photos themselves.
insert into storage.buckets (id, name, public)
values ('dish-photos', 'dish-photos', true)
on conflict (id) do nothing;
