-- Paste into the Supabase SQL Editor and press Run (safe to run more than once). Same as the end of setup.sql.

-- ============ Report coach (26 Oct 2026) ============
-- How many questions each report link (stored only as a hash) or signed-in leader asked the coach today.
-- No questions or answers are stored. Only the plumbline-coach function (service role) can touch it.
create table if not exists public.coach_usage (k text not null, day date not null, n int not null default 0, primary key (k, day));
alter table public.coach_usage enable row level security;
create or replace function public.pl_coach_tick(p_key text, p_limit int) returns boolean language plpgsql security definer set search_path = public as $$
declare used int;
begin
  insert into public.coach_usage as u (k, day, n) values (p_key, public.pl_today(), 1)
    on conflict (k, day) do update set n = u.n + 1 returning u.n into used;
  delete from public.coach_usage where day < public.pl_today() - 7;
  return used <= p_limit;
end $$;
revoke all on function public.pl_coach_tick(text, int) from public, anon, authenticated;
grant execute on function public.pl_coach_tick(text, int) to service_role;

-- ============ Plumbline Teams: teammates rate what they've seen (26 Oct 2026) ============
-- The person (with their private report key) gets a link to send a few teammates. Teammates join as references on
-- the person's own assessment and rate the same traits. The person sees only per-item averages, and only once at
-- least two have finished. No one else sees peer ratings: not the leader, not the team map.
create or replace function public.pl_team_peer_link(p_key text) returns text language sql stable security definer set search_path = public as $$
  select c.ref_token from public.participants p join public.cases c on c.id = p.case_id where p.id = public.pl_key_person(p_key)
$$;
create or replace function public.pl_team_peers(p_key text) returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select p.case_id from public.participants p where p.id = public.pl_key_person(p_key)),
  refs as (select r.* from public.participants r join me on me.case_id = r.case_id where r.role = 'reference'),
  done as (select * from refs where status = 'finished'),
  vals as (select e.key k, (e.value)::text::numeric v from done, jsonb_each(coalesce(done.answers->'items', '{}'::jsonb)) e
           where jsonb_typeof(e.value) = 'number' and (e.value)::text::numeric between 1 and 5)
  select case when not exists (select 1 from me) then null else jsonb_build_object(
    'asked', (select count(*) from refs), 'finished', (select count(*) from done),
    'items', case when (select count(*) from done) >= 2
      then coalesce((select jsonb_object_agg(k, jsonb_build_object('avg', round(v, 2), 'n', n)) from (select k, avg(v) v, count(*) n from vals group by k having count(*) >= 2) a), '{}'::jsonb)
      else '{}'::jsonb end) end
$$;
revoke all on function public.pl_team_peer_link(text), public.pl_team_peers(text) from public, anon, authenticated;
grant execute on function public.pl_team_peer_link(text), public.pl_team_peers(text) to anon, authenticated;

-- Leaders see team members only, never the teammates who rated them
create or replace function public.pl_team_people(p_case uuid) returns table(
  id uuid, case_id uuid, role text, token text, name text, email text, relationship text, status text, step int, total int, progress int, chapter text,
  started_at timestamptz, finished_at timestamptz, invited_at timestamptz, reminded_at timestamptz, created_at timestamptz, updated_at timestamptz, shared boolean, answers jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.case_id, p.role, case when p.status = 'finished' then null else p.token end, p.name, p.email, p.relationship, p.status, p.step, p.total, p.progress, p.chapter,
         p.started_at, p.finished_at, p.invited_at, p.reminded_at, p.created_at, p.updated_at, p.shared,
         case when p.shared and p.status = 'finished' then p.answers - 'privateNote' - 'safety' - 'teamh' else '{}'::jsonb end
  from public.participants p join public.cases c on c.id = p.case_id
  where p.case_id = p_case and p.role <> 'reference' and c.settings->>'purpose' = 'team' and public.pl_is_member(c.network_id);
$$;
