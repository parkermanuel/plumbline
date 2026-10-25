-- Plumbline update 3, 24 Oct 2026: Plumbline Teams. Team assessments keep their team, each person's growth report is
-- released when they finish and stays private to them unless they share it, and leaders see combined team results.
-- Safe to run more than once.

alter table public.participants add column if not exists shared boolean not null default false;
alter table public.participants add column if not exists team_summary jsonb;

create or replace function public.pl_case_header(c public.cases) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('id', c.id, 'planterName', c.planter_name, 'spouseName', c.spouse_name, 'married', c.married,
    'city', c.city, 'network', c.settings->>'networkName', 'logoUrl', c.settings->>'logoUrl',
    'signGifts', coalesce((c.settings->>'signGifts')::boolean, true),
    'beliefs', coalesce(c.settings->'beliefs', '[]'::jsonb), 'questions', coalesce(c.settings->'questions', '[]'::jsonb),
    'bankVersion', c.settings->>'bankVersion', 'released', c.reports_released,
    'audience', coalesce(c.settings->>'audience', 'planting'), 'faith', coalesce((c.settings->>'faith')::boolean, true), 'role', c.settings->>'role',
    -- Plumbline Teams: purpose 'team' means growing someone already on the team (no hiring decision); team = {id, name}
    'purpose', coalesce(c.settings->>'purpose', 'decide'), 'team', c.settings->'team')
$$;

create or replace function public.pl_report(p_token text) returns jsonb language sql security definer set search_path = public stable as $$
  with me as (
    select p.*, c.reports_released, c.married, c.planter_name, c.spouse_name, c.settings, c.city
    from public.participants p join public.cases c on c.id = p.case_id
    where p.token = p_token and p.role in ('planter', 'spouse') and p.status = 'finished' and not c.archived
  )
  select case when not me.reports_released then jsonb_build_object('released', false) else jsonb_build_object(
    'released', true,
    'case', jsonb_build_object('id', me.case_id, 'planterName', me.planter_name, 'spouseName', me.spouse_name, 'married', me.married,
                               'network', me.settings->>'networkName', 'logoUrl', me.settings->>'logoUrl', 'city', me.city,
                               'signGifts', coalesce((me.settings->>'signGifts')::boolean, true),
                               'audience', coalesce(me.settings->>'audience', 'planting'), 'faith', coalesce((me.settings->>'faith')::boolean, true), 'role', me.settings->>'role',
                               'purpose', coalesce(me.settings->>'purpose', 'decide'), 'team', me.settings->'team'),
    'role', me.role, 'shared', me.shared,
    'me', me.answers - 'privateNote' - 'safety',
    'other', (select public.pl_summary(o.answers) from public.participants o
              where o.case_id = me.case_id and o.role <> me.role and o.role in ('planter', 'spouse') and o.status = 'finished')
  ) end
  from me;
$$;

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
                                    then jsonb_build_object('id', left(new.settings->'team'->>'id', 40), 'name', left(coalesce(new.settings->'team'->>'name', 'Team'), 80)) end));
  -- A team member sees their own growth report as soon as they finish; there's no decision meeting to wait for.
  if new.settings->>'purpose' = 'team' then new.reports_released := true; end if;
  return new;
end $$;

-- ============ Plumbline Teams: private by default (24 Oct 2026) ============
-- A team member's answers never reach their leader. The leader sees progress, and once at least 3 people have finished,
-- the team's combined results (averages and counts, no names). A person can choose to share their growth report;
-- then the leader sees it, and they show by name on the team map. Sharing can be turned off again.
alter table public.participants add column if not exists shared boolean not null default false;
alter table public.participants add column if not exists team_summary jsonb;

create or replace function public.pl_case_is_team(p_case uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select settings->>'purpose' = 'team' from public.cases where id = p_case), false)
$$;
revoke all on function public.pl_case_is_team(uuid) from public, anon;
grant execute on function public.pl_case_is_team(uuid) to authenticated;

-- Leaders read and edit people on every assessment except team members (who are reached through the functions below)
drop policy if exists "members read people" on public.participants;
create policy "members read people" on public.participants for select to authenticated
  using (public.pl_is_member(public.pl_case_network(case_id)) and not public.pl_case_is_team(case_id));
drop policy if exists "members edit people" on public.participants;
create policy "members edit people" on public.participants for update to authenticated
  using (public.pl_is_member(public.pl_case_network(case_id)) and not public.pl_case_is_team(case_id))
  with check (public.pl_is_member(public.pl_case_network(case_id)) and not public.pl_case_is_team(case_id));

-- Files a team member uploaded from other assessments stay private too, unless they share
create or replace function public.pl_result_team(p_name text, p_admin boolean) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.participants p join public.cases c on c.id = p.case_id
    where p.token = split_part(p_name, '/', 1) and case when p_admin then public.pl_is_admin(c.network_id) else public.pl_is_member(c.network_id) end
      and (coalesce(c.settings->>'purpose', 'decide') <> 'team' or p.shared))
$$;

-- The person (through their own link): share or stop sharing their growth report with their team's leaders.
-- Only once they've finished, from their own report, so a leader holding the invite link can't switch sharing on ahead of time.
create or replace function public.pl_team_share(p_token text, p_on boolean) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.participants p set shared = coalesce(p_on, false)
  from public.cases c where c.id = p.case_id and p.token = p_token and p.role = 'planter' and p.status = 'finished' and c.settings->>'purpose' = 'team' and not c.archived;
  return found;
end $$;

-- The person's browser saves the short summary the team map is built from (scores only, never answers)
create or replace function public.pl_team_save_summary(p_token text, p_summary jsonb) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_summary is null or jsonb_typeof(p_summary) <> 'object' or length(p_summary::text) > 8000 then raise exception 'Bad summary'; end if;
  update public.participants p set team_summary = jsonb_build_object(
      'pillars', coalesce((select jsonb_object_agg(k, least(100, greatest(0, round(v::numeric)))) from jsonb_each_text(case when jsonb_typeof(p_summary->'pillars') = 'object' then p_summary->'pillars' else '{}'::jsonb end) e(k, v) where v ~ '^[0-9]+(\.[0-9]+)?$' and k ~ '^[a-z_]{1,30}$'), '{}'::jsonb),
      'wiring', coalesce((select jsonb_object_agg(k, least(100, greatest(0, round(v::numeric)))) from jsonb_each_text(case when jsonb_typeof(p_summary->'wiring') = 'object' then p_summary->'wiring' else '{}'::jsonb end) e(k, v) where v ~ '^[0-9]+(\.[0-9]+)?$' and k ~ '^[a-z_]{1,30}$'), '{}'::jsonb),
      'giftsTop', coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p_summary->'giftsTop') = 'array' then p_summary->'giftsTop' else '[]'::jsonb end) x where x ~ '^[a-z_]{1,30}$' limit 3) t), '[]'::jsonb),
      'giftsStrong', coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p_summary->'giftsStrong') = 'array' then p_summary->'giftsStrong' else '[]'::jsonb end) x where x ~ '^[a-z_]{1,30}$' limit 30) t), '[]'::jsonb),
      'strengths', coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p_summary->'strengths') = 'array' then p_summary->'strengths' else '[]'::jsonb end) x where x ~ '^[a-z_0-9]{1,30}$' limit 12) t), '[]'::jsonb),
      'growth', coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p_summary->'growth') = 'array' then p_summary->'growth' else '[]'::jsonb end) x where x ~ '^[a-z_0-9]{1,30}$' limit 12) t), '[]'::jsonb))
  from public.cases c where c.id = p.case_id and p.token = p_token and p.role = 'planter' and p.status = 'finished' and c.settings->>'purpose' = 'team' and not c.archived;
  return found;
end $$;

-- The leader: a team member's progress, link and email, never their answers.
-- The link is only handed out until they finish: after that it opens their private growth report, which is theirs alone.
create or replace function public.pl_team_people(p_case uuid) returns table(
  id uuid, case_id uuid, role text, token text, name text, email text, relationship text, status text, step int, total int, progress int, chapter text,
  started_at timestamptz, finished_at timestamptz, invited_at timestamptz, reminded_at timestamptz, created_at timestamptz, updated_at timestamptz, shared boolean, answers jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.case_id, p.role, case when p.status = 'finished' then null else p.token end, p.name, p.email, p.relationship, p.status, p.step, p.total, p.progress, p.chapter,
         p.started_at, p.finished_at, p.invited_at, p.reminded_at, p.created_at, p.updated_at, p.shared,
         case when p.shared and p.status = 'finished' then p.answers - 'privateNote' - 'safety' - 'teamh' else '{}'::jsonb end
  from public.participants p join public.cases c on c.id = p.case_id
  where p.case_id = p_case and c.settings->>'purpose' = 'team' and public.pl_is_member(c.network_id);
$$;

-- The leader: update a team member's email (to resend their link)
create or replace function public.pl_team_set_email(p_person uuid, p_email text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email address doesn''t look right'; end if;
  update public.participants p set email = nullif(trim(p_email), '')
  from public.cases c where c.id = p.case_id and p.id = p_person and c.settings->>'purpose' = 'team' and public.pl_is_member(c.network_id) and p.status <> 'finished';
  return found;
end $$;

-- The leader: the team map. Combined results only once at least 3 people have finished; shared people by name.
create or replace function public.pl_team_map(p_network uuid, p_team text) returns jsonb language sql stable security definer set search_path = public as $$
  with team as (
    select c.id as case_id, c.planter_name, c.settings->>'audience' as audience, p.status, p.shared, p.team_summary s
    from public.cases c join public.participants p on p.case_id = c.id and p.role = 'planter'
    where c.network_id = p_network and public.pl_is_member(p_network) and not c.archived
      and c.settings->>'purpose' = 'team' and c.settings->'team'->>'id' = p_team
  ), done as (select * from team where status = 'finished' and s is not null),
  ok as (select count(*) >= 3 as yes from done)
  select case when not public.pl_is_member(p_network) then null else jsonb_build_object(
    'total', (select count(*) from team),
    'finished', (select count(*) from team where status = 'finished'),
    'counted', (select count(*) from done),
    'shared', coalesce((select jsonb_agg(jsonb_build_object('caseId', case_id, 'name', planter_name, 'summary', s - 'team') order by planter_name) from done where shared), '[]'::jsonb),
    'sharedIds', coalesce((select jsonb_agg(case_id) from team where shared), '[]'::jsonb),
    'combined', case when (select yes from ok) then jsonb_build_object(
      'n', (select count(*) from done),
      'pillars', (select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from (select k, round(avg(v::numeric)) a from done, jsonb_each_text(s->'pillars') e(k, v) group by k) t),
      'wiring', (select coalesce(jsonb_object_agg(k, jsonb_build_object('left', l, 'mid', m, 'right', r)), '{}'::jsonb) from (
                   select k, count(*) filter (where v::numeric <= 35) l, count(*) filter (where v::numeric > 35 and v::numeric < 65) m, count(*) filter (where v::numeric >= 65) r
                   from done, jsonb_each_text(s->'wiring') e(k, v) group by k) t),
      'giftsTop', (select coalesce(jsonb_object_agg(g, n), '{}'::jsonb) from (select g, count(*) n from done, jsonb_array_elements_text(s->'giftsTop') g group by g) t),
      'giftsStrong', (select coalesce(jsonb_agg(distinct g), '[]'::jsonb) from done, jsonb_array_elements_text(s->'giftsStrong') g),
      'strengths', (select coalesce(jsonb_object_agg(x, n), '{}'::jsonb) from (select x, count(*) n from done, jsonb_array_elements_text(s->'strengths') x group by x) t),
      'growth', (select coalesce(jsonb_object_agg(x, n), '{}'::jsonb) from (select x, count(*) n from done, jsonb_array_elements_text(s->'growth') x group by x) t),
      'healthLow', (select count(*) from done where (s->'pillars'->>'health') is not null and (s->'pillars'->>'health')::numeric < 65),
      -- "Our team" (25 Oct 2026): how the team works together. Averages and counts only, never one person's view.
      'teamN', (select count(*) from done where jsonb_typeof(s->'team') = 'object' and s->'team' <> '{}'::jsonb),
      'team', (select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from (select k, round(avg(v::numeric)) a from done, jsonb_each_text(s->'team') e(k, v) group by k) t),
      'teamLow', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select k, count(*) filter (where v::numeric < 50) n from done, jsonb_each_text(s->'team') e(k, v) group by k) t)
    ) end
  ) end
$$;

revoke all on function public.pl_team_share(text, boolean), public.pl_team_save_summary(text, jsonb) from public;
grant execute on function public.pl_team_share(text, boolean), public.pl_team_save_summary(text, jsonb) to anon, authenticated;
revoke all on function public.pl_team_people(uuid), public.pl_team_set_email(uuid, text), public.pl_team_map(uuid, text) from public, anon;
grant execute on function public.pl_team_people(uuid), public.pl_team_set_email(uuid, text), public.pl_team_map(uuid, text) to authenticated;
