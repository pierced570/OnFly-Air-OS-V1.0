-- Partial modules: thread numbers, WX schedule, scorecards, quotes/invoices grants, cron.

-- ── Dedicated trip thread numbers (pool; SMS vendors later) ──
create table if not exists thread_numbers (
  id uuid primary key default gen_random_uuid(),
  e164 text not null unique,
  label text not null default '',
  trip_id uuid references trips(id) on delete set null,
  assigned_at timestamptz,
  released_at timestamptz,
  active bool not null default true,
  created_at timestamptz not null default now()
);

create index if not exists thread_numbers_trip_idx on thread_numbers (trip_id)
  where trip_id is not null;

alter table thread_numbers enable row level security;
drop policy if exists anon_all_thread_numbers on thread_numbers;
create policy anon_all_thread_numbers on thread_numbers
  for all to anon using (true) with check (true);
drop policy if exists auth_all_thread_numbers on thread_numbers;
create policy auth_all_thread_numbers on thread_numbers
  for all to authenticated using (true) with check (true);
grant select, insert, update on thread_numbers to anon, authenticated;

-- Seed a small DID pool (placeholders until RingCentral numbers land)
insert into thread_numbers (e164, label) values
  ('+15557001001', 'OnFly trip line 1'),
  ('+15557001002', 'OnFly trip line 2'),
  ('+15557001003', 'OnFly trip line 3'),
  ('+15557001004', 'OnFly trip line 4'),
  ('+15557001005', 'OnFly trip line 5'),
  ('+15557001006', 'OnFly trip line 6'),
  ('+15557001007', 'OnFly trip line 7'),
  ('+15557001008', 'OnFly trip line 8')
on conflict (e164) do nothing;

create or replace function assign_thread_number(p_trip_id uuid)
returns thread_numbers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row thread_numbers;
begin
  -- Already assigned?
  select * into v_row from thread_numbers
    where trip_id = p_trip_id and released_at is null
    limit 1;
  if found then return v_row; end if;

  select * into v_row from thread_numbers
    where active and trip_id is null
    order by created_at
    for update skip locked
    limit 1;
  if not found then
    raise exception 'no free thread numbers';
  end if;

  update thread_numbers
    set trip_id = p_trip_id, assigned_at = now(), released_at = null
    where id = v_row.id
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function release_thread_number(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update thread_numbers
    set trip_id = null, released_at = now()
    where trip_id = p_trip_id and released_at is null;
end;
$$;

grant execute on function assign_thread_number(uuid) to anon, authenticated;
grant execute on function release_thread_number(uuid) to anon, authenticated;

-- ── Scheduled WX briefs (T-3h / T-1h) ────────────────────────
create table if not exists wx_brief_schedule (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  kind text not null check (kind in ('t3h','t1h')),
  fire_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','fired','cancelled','skipped')),
  icao text,
  summary text,
  hard_flags jsonb default '[]'::jsonb,
  fired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trip_id, kind)
);

create index if not exists wx_brief_schedule_fire_idx
  on wx_brief_schedule (fire_at) where status = 'scheduled';

alter table wx_brief_schedule enable row level security;
drop policy if exists anon_all_wx_brief_schedule on wx_brief_schedule;
create policy anon_all_wx_brief_schedule on wx_brief_schedule
  for all to anon using (true) with check (true);
grant select, insert, update, delete on wx_brief_schedule to anon, authenticated;

-- ── Operator scorecard materialized view ─────────────────────
create materialized view if not exists operator_scorecards as
select
  o.id as operator_id,
  o.name,
  count(th.id)::int as trips_completed,
  coalesce(
    avg(case when th.circuit_nm is not null then 1.0 else null end) * 100,
    0
  )::numeric(5,1) as on_time_pct_placeholder,
  count(th.id)::int as n_history
from operators o
left join trip_history th on th.operator_id = o.id
group by o.id, o.name;

create unique index if not exists operator_scorecards_uidx
  on operator_scorecards (operator_id);

grant select on operator_scorecards to anon, authenticated;

create or replace function refresh_operator_scorecards()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently operator_scorecards;
exception when others then
  refresh materialized view operator_scorecards;
end;
$$;

grant execute on function refresh_operator_scorecards() to anon, authenticated;

-- ── Quotes / invoices / documents grants for dispatcher anon ─
grant select, insert, update on quotes to anon, authenticated;
grant select, insert, update on invoices to anon, authenticated;
grant select, insert, update, delete on documents to anon, authenticated;

drop policy if exists anon_all_quotes on quotes;
create policy anon_all_quotes on quotes
  for all to anon using (true) with check (true);

drop policy if exists anon_all_invoices on invoices;
create policy anon_all_invoices on invoices
  for all to anon using (true) with check (true);

-- ── Operators write path for admin drafts ────────────────────
grant select, insert, update on operators to anon, authenticated;
grant select, insert, update on operator_contacts to anon, authenticated;
grant select, insert, update on aircraft to anon, authenticated;

drop policy if exists anon_all_operators on operators;
create policy anon_all_operators on operators
  for all to anon using (true) with check (true);
drop policy if exists anon_all_operator_contacts on operator_contacts;
create policy anon_all_operator_contacts on operator_contacts
  for all to anon using (true) with check (true);
drop policy if exists anon_all_aircraft on aircraft;
create policy anon_all_aircraft on aircraft
  for all to anon using (true) with check (true);

-- named_insurer already on operators from 0006

-- ── pg_cron: checkpoint-tick + wx-brief-tick (if extension available) ─
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Store project URL for cron HTTP calls (override via secrets / dashboard)
create table if not exists app_runtime_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into app_runtime_config (key, value) values
  ('supabase_url', 'https://udowzmoswudrqtjebehr.supabase.co'),
  ('checkpoint_tick_path', '/functions/v1/checkpoint-tick'),
  ('wx_brief_tick_path', '/functions/v1/wx-brief-tick')
on conflict (key) do nothing;

grant select on app_runtime_config to anon, authenticated;

-- Note: cron jobs that call edge functions need the service role in vault.
-- We schedule SQL-only workers that mark due rows; edge can also be cron'd in Dashboard.

create or replace function fire_due_wx_briefs()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  r record;
begin
  for r in
    select * from wx_brief_schedule
    where status = 'scheduled' and fire_at <= now()
    limit 40
  loop
    update wx_brief_schedule
      set status = 'fired', fired_at = now(),
          summary = coalesce(summary, 'WX brief due — open trip for live METAR/TAF')
      where id = r.id;
    insert into trip_events (trip_id, actor, kind, payload)
    values (
      r.trip_id,
      'system',
      'wx_brief_due',
      jsonb_build_object('kind', r.kind, 'icao', r.icao, 'schedule_id', r.id)
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

grant execute on function fire_due_wx_briefs() to anon, authenticated;

-- Schedule every minute when pg_cron is available
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule(j.jobid)
      from cron.job j
      where j.jobname = 'onfly-wx-brief-tick';
    exception when others then
      null;
    end;
    perform cron.schedule(
      'onfly-wx-brief-tick',
      '* * * * *',
      'select fire_due_wx_briefs()'
    );
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;
