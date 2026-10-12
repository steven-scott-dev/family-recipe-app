-- Saved recipes (user's personal recipe box, incl. Mealime imports)
-- Run this in the Supabase SQL editor (one time)

create table if not exists saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_url text,
  servings int,
  cooking_minutes int,
  image_url text,
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists saved_recipes_user_id_idx on saved_recipes(user_id);

alter table saved_recipes enable row level security;

drop policy if exists "Users manage own saved recipes" on saved_recipes;
create policy "Users manage own saved recipes" on saved_recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
