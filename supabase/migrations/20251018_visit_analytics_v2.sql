-- SupperLine visitor analytics v2: sessions + engagement + referrer breakdown.
-- Run once in the Supabase SQL editor (paste-friendly: one statement per line).

alter table site_visits add column if not exists session_id text;

create table if not exists visit_events (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  event_type text not null,
  path text,
  created_at timestamptz not null default now()
);

alter table visit_events enable row level security;

drop policy if exists "anon insert visit_events" on visit_events;

create policy "anon insert visit_events" on visit_events for insert to anon with check (true);

create or replace view stats_sessions_daily as
select visited_at::date as day, count(distinct session_id) as sessions, count(*) as visits
from site_visits where visited_at > now() - interval '30 days' group by 1 order by 1;

create or replace view stats_visits_by_referrer as
select visited_at::date as day,
case when referrer is null or referrer = '' then '(direct)' else referrer end as referrer,
count(*) as visits, count(distinct session_id) as sessions
from site_visits where visited_at > now() - interval '30 days' group by 1, 2 order by 1, 3 desc;

create or replace view stats_engagement_daily as
select created_at::date as day, event_type, count(*) as events, count(distinct session_id) as sessions
from visit_events where created_at > now() - interval '30 days' group by 1, 2 order by 1, 2;

create or replace view stats_engaged_sessions_daily as
select created_at::date as day, count(distinct session_id) as engaged_sessions
from visit_events where created_at > now() - interval '30 days' group by 1 order by 1;

grant select on stats_sessions_daily, stats_visits_by_referrer, stats_engagement_daily, stats_engaged_sessions_daily to anon, authenticated;
