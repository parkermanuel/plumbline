-- ============ Plumbline Teams fixes from the staff walk-through (owner, 30 Oct 2026) ============
-- Safe to run more than once.

-- 1. One person, two browsers: saving merges answers instead of replacing them, and progress never goes backwards.
-- Each question's answer is kept unless the incoming save has its own answer for it. Within the per-dimension wiring
-- and gift lists (one entry per question) and the fivefold list, each position merges on its own. Everything else
-- at the question level (a scenario pick, a multi-select fact, a reference's chosen gifts) is replaced as a whole,
-- so un-ticking still works.
create or replace function public.pl_merge_array(o jsonb, i jsonb) returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(case when i->n is null or jsonb_typeof(i->n) = 'null' then coalesce(o->n, 'null'::jsonb) else i->n end order by n), '[]'::jsonb)
  from generate_series(0, greatest(jsonb_array_length(o), jsonb_array_length(i)) - 1) n
$$;
create or replace function public.pl_merge_bucket(k text, o jsonb, i jsonb) returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(sk, case
      when so is null then si
      when si is null then so
      when k in ('wiring', 'gifts') and jsonb_typeof(so) = 'array' and jsonb_typeof(si) = 'array' then public.pl_merge_array(so, si)
      when k in ('context', 'meta') and jsonb_typeof(so) = 'object' and jsonb_typeof(si) = 'object' then so || si
      else si end), '{}'::jsonb)
  from (select coalesce(a.key, b.key) sk, a.value so, b.value si from jsonb_each(o) a full join jsonb_each(i) b on a.key = b.key) j
$$;
create or replace function public.pl_merge_answers(old jsonb, incoming jsonb) returns jsonb language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(old) is distinct from 'object' then incoming
    when jsonb_typeof(incoming) is distinct from 'object' then old
    else (select coalesce(jsonb_object_agg(k, case
        when o is null then i
        when i is null then o
        when jsonb_typeof(o) = 'object' and jsonb_typeof(i) = 'object' then public.pl_merge_bucket(k, o, i)
        when k = 'fivefold' and jsonb_typeof(o) = 'array' and jsonb_typeof(i) = 'array' then public.pl_merge_array(o, i)
        else i end), '{}'::jsonb)
      from (select coalesce(a.key, b.key) k, a.value o, b.value i from jsonb_each(old) a full join jsonb_each(incoming) b on a.key = b.key) j)
  end
$$;
-- Keeps the private parts (note, safety, spouse's ratings) that a resumed session never received back, as before
create or replace function public.pl_merge_private(old jsonb, incoming jsonb) returns jsonb language sql immutable set search_path = public as $$
  select m
    || jsonb_build_object('safety', coalesce(m->'safety', '{}'::jsonb), 'spouseSees', coalesce(m->'spouseSees', '{}'::jsonb))
    || case when coalesce(incoming->>'privateNote', '') = '' and coalesce(old->>'privateNote', '') <> '' then jsonb_build_object('privateNote', old->'privateNote') else '{}'::jsonb end
  from (select public.pl_merge_answers(coalesce(old, '{}'::jsonb), incoming) m) t
$$;
revoke all on function public.pl_merge_array(jsonb, jsonb), public.pl_merge_bucket(text, jsonb, jsonb), public.pl_merge_answers(jsonb, jsonb) from public, anon, authenticated;

-- Saving: merge, never move back, and nothing changes once finished (returns false, e.g. finished on another device)
create or replace function public.pl_save(p_token text, p_answers jsonb, p_step int, p_total int, p_chapter text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 150000 then raise exception 'Too large'; end if;
  update public.participants set
    answers = public.pl_merge_private(answers, p_answers),
    step = greatest(step, 0, p_step), total = greatest(0, p_total),
    progress = least(99, greatest(progress, case when p_total > 0 then least(99, greatest(0, 100 * p_step / p_total)) else 0 end)),
    chapter = case when p_step >= step then left(p_chapter, 60) else chapter end,
    status = 'started', started_at = coalesce(started_at, now()), updated_at = now(),
    name = coalesce(nullif(left(p_answers #>> '{meta,name}', 120), ''), name),
    relationship = coalesce(nullif(left(p_answers #>> '{meta,relationship}', 80), ''), relationship),
    consented_at = coalesce(consented_at, case when p_answers #>> '{meta,consentedAt}' is not null then now() end)
  where token = p_token and status <> 'finished'
    and exists (select 1 from public.cases c where c.id = case_id and not c.archived);
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- 2. Leaders never see who rated a team member: teammates' rows stay out of the live progress table
create or replace function public.pl_sync_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'reference' and public.pl_case_is_team(new.case_id) then return new; end if;
  insert into public.participant_status(participant_id, case_id, network_id, role, name, status, progress, chapter, invited_at, reminded_at, updated_at)
  values (new.id, new.case_id, public.pl_case_network(new.case_id), new.role, new.name, new.status, new.progress, new.chapter, new.invited_at, new.reminded_at, now())
  on conflict (participant_id) do update set name = excluded.name, status = excluded.status, progress = excluded.progress,
    chapter = excluded.chapter, invited_at = excluded.invited_at, reminded_at = excluded.reminded_at, updated_at = now();
  return new;
end $$;
delete from public.participant_status s using public.cases c where c.id = s.case_id and s.role = 'reference' and c.settings->>'purpose' = 'team';
drop policy if exists "members read progress" on public.participant_status;
create policy "members read progress" on public.participant_status for select to authenticated
  using (public.pl_is_member(network_id) and not (role = 'reference' and public.pl_case_is_team(case_id)));

-- 3. The team map: averages from 3 people, but how many people fall where (wiring splits, gift and strength counts,
-- how many are low on health or a team area) only once at least 5 have finished, so no one can be picked out.
-- Below 5: those fields are null and countsShown is false. wiringAvg (each wiring dimension's average) is always there.
create or replace function public.pl_team_combined(p_rows jsonb, p_leader boolean) returns jsonb language sql immutable set search_path = public as $$
  with done as (select x as s from jsonb_array_elements(p_rows) x),
  n as (select count(*) as n from done),
  big as (select (select n from n) >= 5 as yes)
  select jsonb_build_object(
    'n', (select n from n),
    'countsShown', (select yes from big), 'countsMin', 5,
    'pillars', (select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from (select k, round(avg(v::numeric)) a from done, jsonb_each_text(s->'pillars') e(k, v) group by k) t),
    'wiringAvg', (select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from (select k, round(avg(v::numeric)) a from done, jsonb_each_text(s->'wiring') e(k, v) group by k) t),
    'wiring', case when (select yes from big) then (select coalesce(jsonb_object_agg(k, jsonb_build_object('left', l, 'mid', m, 'right', r)), '{}'::jsonb) from (
                 select k, count(*) filter (where v::numeric <= 35) l, count(*) filter (where v::numeric > 35 and v::numeric < 65) m, count(*) filter (where v::numeric >= 65) r
                 from done, jsonb_each_text(s->'wiring') e(k, v) group by k) t) end,
    'giftsTop', case when (select yes from big) then (select coalesce(jsonb_object_agg(g, c), '{}'::jsonb) from (select g, count(*) c from done, jsonb_array_elements_text(s->'giftsTop') g group by g) t) end,
    'giftsStrong', case when (select yes from big) then (select coalesce(jsonb_agg(distinct g), '[]'::jsonb) from done, jsonb_array_elements_text(s->'giftsStrong') g) end,
    'strengths', case when (select yes from big) then (select coalesce(jsonb_object_agg(x, c), '{}'::jsonb) from (select x, count(*) c from done, jsonb_array_elements_text(s->'strengths') x group by x) t) end,
    'growth', case when (select yes from big) then (select coalesce(jsonb_object_agg(x, c), '{}'::jsonb) from (select x, count(*) c from done, jsonb_array_elements_text(s->'growth') x group by x) t) end,
    -- "Our team" (25 Oct 2026): how the team works together. Averages always; how many rate an area low only from 5.
    'teamN', (select count(*) from done where jsonb_typeof(s->'team') = 'object' and s->'team' <> '{}'::jsonb),
    'team', (select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from (select k, round(avg(v::numeric)) a from done, jsonb_each_text(s->'team') e(k, v) group by k) t),
    'teamLow', case when (select yes from big) then (select coalesce(jsonb_object_agg(k, c), '{}'::jsonb) from (select k, count(*) filter (where v::numeric < 50) c from done, jsonb_each_text(s->'team') e(k, v) group by k) t) end)
  || case when p_leader then jsonb_build_object('healthLow', case when (select yes from big) then (select count(*) from done where (s->'pillars'->>'health') is not null and (s->'pillars'->>'health')::numeric < 65) end) else '{}'::jsonb end
$$;
revoke all on function public.pl_team_combined(jsonb, boolean) from public, anon, authenticated;

create or replace function public.pl_team_map(p_network uuid, p_team text) returns jsonb language sql stable security definer set search_path = public as $$
  with team as (
    select c.id as case_id, c.planter_name, c.settings->>'audience' as audience, p.status, p.shared, p.team_summary s
    from public.cases c join public.participants p on p.case_id = c.id and p.role = 'planter'
    where c.network_id = p_network and public.pl_is_member(p_network) and not c.archived
      and c.settings->>'purpose' = 'team' and c.settings->'team'->>'id' = p_team
  ), done as (select * from team where status = 'finished' and s is not null)
  select case when not public.pl_is_member(p_network) then null else jsonb_build_object(
    'released', exists (select 1 from public.team_releases r where r.network_id = p_network and r.team_id = p_team),
    'total', (select count(*) from team),
    'finished', (select count(*) from team where status = 'finished'),
    'counted', (select count(*) from done),
    'shared', coalesce((select jsonb_agg(jsonb_build_object('caseId', case_id, 'name', planter_name, 'summary', s - 'team') order by planter_name) from done where shared), '[]'::jsonb),
    'sharedIds', coalesce((select jsonb_agg(case_id) from team where shared), '[]'::jsonb),
    'combined', case when (select count(*) from done) >= 3 then public.pl_team_combined((select jsonb_agg(s) from done), true) end
  ) end
$$;

create or replace function public.pl_team_map_for(p_network uuid, p_team text) returns jsonb language sql stable security definer set search_path = public as $$
  with team as (
    select c.id as case_id, c.planter_name, c.settings->>'audience' as audience, p.status, p.shared, p.team_summary s
    from public.cases c join public.participants p on p.case_id = c.id and p.role = 'planter'
    where c.network_id = p_network and not c.archived
      and c.settings->>'purpose' = 'team' and c.settings->'team'->>'id' = p_team
  ), done as (select * from team where status = 'finished' and s is not null)
  select jsonb_build_object(
    'total', (select count(*) from team),
    'finished', (select count(*) from team where status = 'finished'),
    'counted', (select count(*) from done),
    -- Teammates see how each person is wired and their top gifts, never personal scores
    'shared', coalesce((select jsonb_agg(jsonb_build_object('caseId', case_id, 'name', planter_name, 'summary', jsonb_build_object('wiring', s->'wiring', 'giftsTop', s->'giftsTop')) order by planter_name) from done where shared), '[]'::jsonb),
    'sharedIds', coalesce((select jsonb_agg(case_id) from team where shared), '[]'::jsonb),
    'combined', case when (select count(*) from done) >= 3 then public.pl_team_combined((select jsonb_agg(s) from done), false) end
  )
$$;
revoke all on function public.pl_team_map_for(uuid, text) from public, anon, authenticated;
revoke all on function public.pl_team_map(uuid, text) from public, anon;
grant execute on function public.pl_team_map(uuid, text) to authenticated;

-- 4. Teammates who rate: the same name joining again (before finishing) picks up their own link instead of making a
-- second one, and an unfinished rater idle for 7 days no longer takes one of the 12 places.
create or replace function public.pl_name_key(p_name text) returns text language sql immutable set search_path = public as $$
  select regexp_replace(lower(btrim(coalesce(p_name, ''))), '\s+', ' ', 'g')
$$;
create or replace function public.pl_join_reference(p_ref_token text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare cid uuid; team boolean; t text; nk text := public.pl_name_key(p_name);
begin
  select id, coalesce(settings->>'purpose', 'decide') = 'team' into cid, team from public.cases where ref_token = p_ref_token and not archived;
  if cid is null then return null; end if;
  if team then
    if nk <> '' then
      select token into t from public.participants
      where case_id = cid and role = 'reference' and status <> 'finished' and public.pl_name_key(name) = nk
      order by updated_at desc limit 1;
      if t is not null then return t; end if;
    end if;
    if (select count(*) from public.participants where case_id = cid and role = 'reference'
        and (status = 'finished' or updated_at > now() - interval '7 days')) >= 12 then return null; end if;
  elsif (select count(*) from public.participants where case_id = cid and role = 'reference') >= 12 then return null;
  end if;
  insert into public.participants(case_id, role, name) values (cid, 'reference', left(coalesce(p_name, ''), 120)) returning token into t;
  return t;
end $$;

-- The person's teammate averages count each name once (their latest finished rating)
create or replace function public.pl_team_peers(p_key text) returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select p.case_id from public.participants p where p.id = public.pl_key_person(p_key)),
  refs as (select r.*, coalesce(nullif(public.pl_name_key(r.name), ''), r.id::text) nk from public.participants r join me on me.case_id = r.case_id where r.role = 'reference'),
  done as (select distinct on (nk) * from refs where status = 'finished' order by nk, finished_at desc nulls last),
  vals as (select e.key k, (e.value)::text::numeric v from done, jsonb_each(coalesce(done.answers->'items', '{}'::jsonb)) e
           where jsonb_typeof(e.value) = 'number' and (e.value)::text::numeric between 1 and 5)
  select case when not exists (select 1 from me) then null else jsonb_build_object(
    'asked', (select count(distinct nk) from refs), 'finished', (select count(*) from done),
    'items', case when (select count(*) from done) >= 3
      then coalesce((select jsonb_object_agg(k, jsonb_build_object('avg', round(v, 2), 'n', n)) from (select k, avg(v) v, count(*) n from vals group by k having count(*) >= 3) a), '{}'::jsonb)
      else '{}'::jsonb end) end
$$;
revoke all on function public.pl_team_peer_link(text), public.pl_team_peers(text) from public, anon, authenticated;
grant execute on function public.pl_team_peer_link(text), public.pl_team_peers(text) to anon, authenticated;

-- 5. Reminders: never within 20 hours of the invite (or the last reminder)
create or replace function public.pl_email_people(p_ids uuid[], p_kind text) returns table(
  id uuid, email text, name text, role text, token text, planter_name text, spouse_name text, network_name text, sender_name text, sender_email text)
language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('invite', 'remind') then raise exception 'Unknown kind'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 20 then raise exception 'Too many at once'; end if;
  if exists (
    select 1 from public.participants p join public.cases c on c.id = p.case_id
    where p.id = any(p_ids) and public.pl_is_member(c.network_id)
      and (select count(*) from public.email_log l where l.network_id = c.network_id and l.at > now() - interval '1 day') >= 300
  ) then raise exception 'Your network has sent its 300 emails for today. Copy the links instead, or try again tomorrow.'; end if;
  return query
  with targets as (
    select p.id as pid from public.participants p join public.cases c on c.id = p.case_id
    where p.id = any(p_ids) and public.pl_is_member(c.network_id) and not c.archived and p.email is not null and p.status <> 'finished'
      and (case when p_kind = 'invite' then p.invited_at is null or p.invited_at < now() - interval '1 day'
                else p.invited_at is not null and p.invited_at < now() - interval '20 hours'
                     and (p.reminded_at is null or p.reminded_at < now() - interval '20 hours') end)
  ), stamped as (
    update public.participants p set invited_at = case when p_kind = 'invite' then now() else p.invited_at end,
      reminded_at = case when p_kind = 'remind' then now() else p.reminded_at end
    from targets t where p.id = t.pid returning p.*
  )
  , logged as (insert into public.email_log(network_id, kind) select public.pl_case_network(s.case_id), p_kind from stamped s returning 1)
  select s.id, s.email, s.name, s.role, s.token, c.planter_name, c.spouse_name, c.settings->>'networkName',
         coalesce(m.name, split_part(m.email, '@', 1)), m.email
  from stamped s join public.cases c on c.id = s.case_id
  left join public.network_members m on m.network_id = c.network_id and m.user_id = auth.uid();
end $$;

-- 6. Fixing a mistyped email (only before they start): a new address gets a new link (the old one stops working)
-- and can be invited again right away.
create or replace function public.pl_team_set_email(p_person uuid, p_email text) returns boolean language plpgsql security definer set search_path = public as $$
declare em text := nullif(btrim(p_email), '');
begin
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email address doesn''t look right'; end if;
  update public.participants p set email = em,
    token = case when lower(coalesce(p.email, '')) is distinct from lower(coalesce(em, '')) then public.pl_new_token() else p.token end,
    invited_at = case when lower(coalesce(p.email, '')) is distinct from lower(coalesce(em, '')) then null else p.invited_at end,
    reminded_at = case when lower(coalesce(p.email, '')) is distinct from lower(coalesce(em, '')) then null else p.reminded_at end
  from public.cases c where c.id = p.case_id and p.id = p_person and c.settings->>'purpose' = 'team' and public.pl_is_member(c.network_id) and p.status = 'invited';
  return found;
end $$;
revoke all on function public.pl_team_set_email(uuid, text) from public, anon;
grant execute on function public.pl_team_set_email(uuid, text) to authenticated;

-- 7. Emails: whether a shared report's team asked about faith (the board email leaves out gifts when it didn't)
create or replace function public.pl_viewer_faith(p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((c.settings->>'faith')::boolean, true) from public.report_viewers v join public.participants p on p.id = v.participant_id join public.cases c on c.id = p.case_id where v.id = p_id
$$;
revoke all on function public.pl_viewer_faith(uuid) from public, anon, authenticated;
grant execute on function public.pl_viewer_faith(uuid) to service_role;
