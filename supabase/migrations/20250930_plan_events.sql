-- SupperLine analytics: lightweight event log for retention measurement.
-- Run this once in the Supabase SQL editor.

create table if not exists plan_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_type text not null,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'
);

alter table plan_events enable row level security;

drop policy if exists "Users can log their own events" on plan_events;
create policy "Users can log their own events"
  on plan_events for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their own events" on plan_events;
create policy "Users can read their own events"
  on plan_events for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists plan_events_user_time on plan_events (user_id, created_at);
create index if not exists plan_events_type_time on plan_events (event_type, created_at);
