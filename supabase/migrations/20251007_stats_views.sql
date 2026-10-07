-- SupperLine admin stats: aggregate-only views for the #stats dashboard.
-- Run once in the Supabase SQL editor.
--
-- These views expose COUNTS ONLY (no user_ids, no emails, no plan contents),
-- so they are safe to grant to the anon key used by the app.

-- 1) Weekly activity: active families, plans generated, saves, loads (last 8 weeks)
create or replace view stats_weekly as
select date_trunc('week', created_at)::date as week,
       count(distinct user_id) filter (where event_type = 'plan_generated') as active_users,
       count(*) filter (where event_type = 'plan_generated') as plans,
       count(*) filter (where event_type = 'plan_saved') as saves,
       count(*) filter (where event_type = 'plan_loaded') as loads
from plan_events
where created_at > now() - interval '8 weeks'
group by 1
order by 1;

-- 2) Week-2 retention by cohort: % of families who generated again in a later week
-- THE tripwire: Stripe goes in at 20%+
create or replace view stats_retention as
with first_gen as (
  select user_id, min(date_trunc('week', created_at)) as cohort_week
  from plan_events where event_type = 'plan_generated' group by user_id
),
returned as (
  select distinct f.user_id
  from first_gen f
  join plan_events e on e.user_id = f.user_id
    and e.event_type = 'plan_generated'
    and e.created_at >= f.cohort_week + interval '1 week'
)
select f.cohort_week::date as cohort_week,
       count(*) as users,
       count(r.user_id) as returned_users,
       round(100.0 * count(r.user_id) / nullif(count(*), 0), 1) as retention_pct
from first_gen f
left join returned r on r.user_id = f.user_id
group by 1
order by 1;

-- 3) Headline totals for the stat cards
create or replace view stats_totals as
select
  (select count(distinct user_id)
     from plan_events where event_type = 'plan_generated') as total_users,
  (select count(*)
     from plan_events where event_type = 'plan_generated'
       and created_at > now() - interval '7 days') as plans_7d,
  (select count(*)
     from plan_events where event_type = 'plan_generated'
       and created_at > now() - interval '30 days') as plans_30d,
  (select count(*)
     from plan_events where event_type = 'plan_saved'
       and created_at > now() - interval '30 days') as saves_30d,
  (select count(*)
     from plan_events where event_type = 'plan_loaded'
       and created_at > now() - interval '30 days') as loads_30d,
  (select round(avg((meta->>'total_cost')::numeric), 2)
     from plan_events where event_type = 'plan_generated'
       and created_at > now() - interval '30 days'
       and (meta->>'total_cost') ~ '^[0-9]+(\.[0-9]+)?$') as avg_cost_30d;

-- Views run with the owner's privileges, bypassing the plan_events RLS
-- (which restricts reads to each user's own rows). Grant read to the app keys.
grant select on stats_weekly, stats_retention, stats_totals to anon, authenticated;
