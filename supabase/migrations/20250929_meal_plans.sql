-- Meal plan persistence for family-recipe-app
-- Run this in the Supabase SQL editor (one time)

-- One row per generated plan
create table if not exists meal_plans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  name text not null default 'Meal Plan',
  days int not null,
  meals_per_day int not null,
  total_cost numeric,
  created_at timestamptz not null default now()
);

-- One row per meal inside a plan
create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references meal_plans(id) on delete cascade,
  day text not null,
  type text not null,
  title text not null,
  display_title text,
  price numeric,
  prep_time text,
  servings text,
  nutrition jsonb,
  ratings jsonb not null default '{}'::jsonb,
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Backfill for tables created before nutrition/ratings existed
-- (CREATE TABLE IF NOT EXISTS skips existing tables, so these are needed
-- when the meals table already exists from an earlier run)
alter table meals add column if not exists nutrition jsonb;
alter table meals add column if not exists ratings jsonb not null default '{}'::jsonb;

create index if not exists meals_plan_id_idx on meals (plan_id);
create index if not exists meal_plans_family_id_idx on meal_plans (family_id);

-- RLS: permissive policies matching the app's current anon-key access pattern.
-- Tighten these (auth.uid() checks) when user auth is added.
alter table meal_plans enable row level security;
alter table meals enable row level security;

drop policy if exists "anon full access" on meal_plans;
create policy "anon full access" on meal_plans for all using (true) with check (true);

drop policy if exists "anon full access" on meals;
create policy "anon full access" on meals for all using (true) with check (true);
