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

-- The leader's choice is kept when a team member is added
create or replace function public.case_snapshot() returns trigger language plpgsql security definer set search_path = public as $$
declare ns jsonb; nn text; nl text;
begin
  select settings, name, logo_url into ns, nn, nl from public.networks where id = new.network_id;
  new.settings := coalesce(ns, '{}'::jsonb) || jsonb_build_object('networkName', nn, 'logoUrl', nl)
                  || jsonb_strip_nulls(jsonb_build_object(  -- the only choices made when creating an assessment
                       'audience', case when new.settings->>'audience' in ('planting', 'staff', 'nonprofit', 'business') then to_jsonb(new.settings->>'audience') end,
                       'faith', case when jsonb_typeof(new.settings->'faith') = 'boolean' then new.settings->'faith' end,
                       'role', case when jsonb_typeof(new.settings->'role') = 'string' then to_jsonb(left(new.settings->>'role', 80)) end,
                       'signGifts', case when jsonb_typeof(new.settings->'signGifts') = 'boolean' then new.settings->'signGifts' end,
                       'bankVersion', case when jsonb_typeof(new.settings->'bankVersion') = 'string' then to_jsonb(left(new.settings->>'bankVersion', 20)) end,
                       -- Plumbline Teams: growing someone already on a team, grouped into a named team
                       'purpose', case when new.settings->>'purpose' in ('decide', 'team') then to_jsonb(new.settings->>'purpose') end,
                       'team', case when jsonb_typeof(new.settings->'team') = 'object' and jsonb_typeof(new.settings->'team'->'id') = 'string'
                                    then jsonb_build_object('id', left(new.settings->'team'->>'id', 40), 'name', left(coalesce(new.settings->'team'->>'name', 'Team'), 80)) end,
                       -- Plumbline Teams (26 Oct 2026): the leader chose to see each person's full report; the person is told before they start
                       'leaderSees', case when new.settings->>'purpose' = 'team' and jsonb_typeof(new.settings->'leaderSees') = 'boolean' then new.settings->'leaderSees' end));
  -- A team member sees their own growth report as soon as they finish; there's no decision meeting to wait for.
  if new.settings->>'purpose' = 'team' then new.reports_released := true; end if;
  return new;
end $$;


-- ============ Plumbline Teams: the leader can see each person's report (26 Oct 2026) ============
-- When a team is started with "leader sees each report", every new member's report is shared from the start
-- and can't be unshared; the person is told on the first screen. Teams started before this stay as they were.
-- "Our team" answers are still only ever shown as the team's average.
create or replace function public.pl_leader_sees(p_case uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (settings->>'leaderSees')::boolean from public.cases where id = p_case and settings->>'purpose' = 'team'), false)
$$;
revoke all on function public.pl_leader_sees(uuid) from public, anon, authenticated;
create or replace function public.pl_team_auto_share() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'planter' and public.pl_leader_sees(new.case_id) then new.shared := true; end if;
  return new;
end $$;
drop trigger if exists pl_team_auto_share on public.participants;
create trigger pl_team_auto_share before insert or update of shared on public.participants for each row execute function public.pl_team_auto_share();

create or replace function public.pl_case_header(c public.cases) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('id', c.id, 'planterName', c.planter_name, 'spouseName', c.spouse_name, 'married', c.married,
    'city', c.city, 'network', c.settings->>'networkName', 'logoUrl', c.settings->>'logoUrl',
    'signGifts', coalesce((c.settings->>'signGifts')::boolean, true),
    'beliefs', coalesce(c.settings->'beliefs', '[]'::jsonb), 'questions', coalesce(c.settings->'questions', '[]'::jsonb),
    'bankVersion', c.settings->>'bankVersion', 'released', c.reports_released,
    'audience', coalesce(c.settings->>'audience', 'planting'), 'faith', coalesce((c.settings->>'faith')::boolean, true), 'role', c.settings->>'role',
    'purpose', coalesce(c.settings->>'purpose', 'decide'), 'team', c.settings->'team',
    'leaderSees', coalesce((c.settings->>'leaderSees')::boolean, false))
$$;

create or replace function public.pl_report(p_token text) returns jsonb language sql security definer set search_path = public stable as $$
  with me as (
    select p.*, c.reports_released, c.married, c.planter_name, c.spouse_name, c.settings, c.city
    from public.participants p join public.cases c on c.id = p.case_id
    where p.role in ('planter', 'spouse') and p.status = 'finished' and not c.archived
      and ((coalesce(c.settings->>'purpose', 'decide') <> 'team' and p.token = p_token)
        or (c.settings->>'purpose' = 'team' and p.id = public.pl_key_person(p_token)))
  )
  select case when not me.reports_released then jsonb_build_object('released', false) else jsonb_build_object(
    'released', true,
    'case', jsonb_build_object('id', me.case_id, 'planterName', me.planter_name, 'spouseName', me.spouse_name, 'married', me.married,
                               'network', me.settings->>'networkName', 'logoUrl', me.settings->>'logoUrl', 'city', me.city,
                               'signGifts', coalesce((me.settings->>'signGifts')::boolean, true),
                               'audience', coalesce(me.settings->>'audience', 'planting'), 'faith', coalesce((me.settings->>'faith')::boolean, true), 'role', me.settings->>'role',
                               'purpose', coalesce(me.settings->>'purpose', 'decide'), 'team', me.settings->'team',
                               'leaderSees', coalesce((me.settings->>'leaderSees')::boolean, false)),
    'role', me.role, 'shared', me.shared,
    'me', me.answers - 'privateNote' - 'safety',
    'other', (select public.pl_summary(o.answers) from public.participants o
              where o.case_id = me.case_id and o.role <> me.role and o.role in ('planter', 'spouse') and o.status = 'finished')
  ) end
  from me;
$$;
