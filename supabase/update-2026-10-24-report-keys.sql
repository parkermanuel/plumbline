-- Plumbline update 5, 24 Oct 2026: a private report key for each Plumbline Teams member. Paste into Supabase > SQL Editor, then Run.
-- ============ Plumbline Teams: a private report key only the person gets (24 Oct 2026) ============
-- A leader sends each team member their assessment link, so a leader could copy it. Once the person finishes, that link
-- stops opening their growth report. Their report opens only with a separate private key, made the moment they finish and
-- given only to them: shown in the browser they finished in, and emailed to their own address. It never appears in
-- anything a leader can read. Leaders see a report only when the person switches sharing on (with their key).
-- Safe to run more than once. People who finished before this get a key the first time they ask for their link by email.
create table if not exists public.report_keys (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  key text not null unique default public.pl_new_token(),
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.report_keys enable row level security;  -- no policies: nobody reads this table except through the functions below
revoke all on public.report_keys from public, anon, authenticated;

-- Who a report key belongs to (a finished team member on an active assessment)
create or replace function public.pl_key_person(p_key text) returns uuid language sql stable security definer set search_path = public as $$
  select p.id from public.report_keys k join public.participants p on p.id = k.participant_id join public.cases c on c.id = p.case_id
  where k.key = p_key and p.role = 'planter' and p.status = 'finished' and c.settings->>'purpose' = 'team' and not c.archived
$$;

-- The moment a team member finishes, make their key
create or replace function public.pl_make_report_key() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'finished' and old.status is distinct from 'finished' and new.role = 'planter' and public.pl_case_is_team(new.case_id) then
    insert into public.report_keys(participant_id) values (new.id) on conflict (participant_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists pl_make_report_key on public.participants;
create trigger pl_make_report_key after update of status on public.participants for each row execute function public.pl_make_report_key();

-- Finishing a team assessment: seals the answers like pl_finish and hands the key back to this browser, once.
-- A second call (or anyone holding the old link afterward) gets nothing.
create or replace function public.pl_finish_team(p_token text, p_answers jsonb) returns text language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select p.id into pid from public.participants p join public.cases c on c.id = p.case_id
  where p.token = p_token and p.role = 'planter' and p.status <> 'finished' and c.settings->>'purpose' = 'team' and not c.archived;
  if pid is null or not public.pl_finish(p_token, p_answers) then return null; end if;
  return (select key from public.report_keys where participant_id = pid);
end $$;

-- A personal report. Planting and hiring assessments: the person's link, once released (as before).
-- Team members: only their private key. Their old assessment link no longer opens the report.
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
                               'purpose', coalesce(me.settings->>'purpose', 'decide'), 'team', me.settings->'team'),
    'role', me.role, 'shared', me.shared,
    'me', me.answers - 'privateNote' - 'safety',
    'other', (select public.pl_summary(o.answers) from public.participants o
              where o.case_id = me.case_id and o.role <> me.role and o.role in ('planter', 'spouse') and o.status = 'finished')
  ) end
  from me;
$$;

-- Sharing and the team-map summary now take the private key, not the old link
create or replace function public.pl_team_share(p_token text, p_on boolean) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.participants set shared = coalesce(p_on, false) where id = public.pl_key_person(p_token);
  return found;
end $$;

create or replace function public.pl_team_save_summary(p_token text, p_summary jsonb) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_summary is null or jsonb_typeof(p_summary) <> 'object' or length(p_summary::text) > 8000 then raise exception 'Bad summary'; end if;
  update public.participants p set team_summary = jsonb_build_object(
      'pillars', coalesce((select jsonb_object_agg(k, least(100, greatest(0, round(v::numeric)))) from jsonb_each_text(case when jsonb_typeof(p_summary->'pillars') = 'object' then p_summary->'pillars' else '{}'::jsonb end) e(k, v) where v ~ '^[0-9]+(\.[0-9]+)?$' and k ~ '^[a-z_]{1,30}$'), '{}'::jsonb),
      'wiring', coalesce((select jsonb_object_agg(k, least(100, greatest(0, round(v::numeric)))) from jsonb_each_text(case when jsonb_typeof(p_summary->'wiring') = 'object' then p_summary->'wiring' else '{}'::jsonb end) e(k, v) where v ~ '^[0-9]+(\.[0-9]+)?$' and k ~ '^[a-z_]{1,30}$'), '{}'::jsonb),
      'giftsTop', coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p_summary->'giftsTop') = 'array' then p_summary->'giftsTop' else '[]'::jsonb end) x where x ~ '^[a-z_]{1,30}$' limit 3) t), '[]'::jsonb),
      'giftsStrong', coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p_summary->'giftsStrong') = 'array' then p_summary->'giftsStrong' else '[]'::jsonb end) x where x ~ '^[a-z_]{1,30}$' limit 30) t), '[]'::jsonb),
      'strengths', coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p_summary->'strengths') = 'array' then p_summary->'strengths' else '[]'::jsonb end) x where x ~ '^[a-z_0-9]{1,30}$' limit 12) t), '[]'::jsonb),
      'growth', coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p_summary->'growth') = 'array' then p_summary->'growth' else '[]'::jsonb end) x where x ~ '^[a-z_0-9]{1,30}$' limit 12) t), '[]'::jsonb),
      'team', coalesce((select jsonb_object_agg(k, least(100, greatest(0, round(v::numeric)))) from jsonb_each_text(case when jsonb_typeof(p_summary->'team') = 'object' then p_summary->'team' else '{}'::jsonb end) e(k, v) where v ~ '^[0-9]+(\.[0-9]+)?$' and k ~ '^[a-z_]{1,30}$'), '{}'::jsonb))
  where p.id = public.pl_key_person(p_token);
  return found;
end $$;

-- The email function (service key only): the person's own address and key, so their private report link goes to them.
-- Anyone holding the old link can ask for it to be sent, but it only ever goes to the person's own inbox, at most once an hour.
-- Makes a key for anyone who finished before keys existed.
create or replace function public.pl_report_key_email(p_token text) returns table(email text, name text, report_key text, team_name text, network_name text)
language plpgsql security definer set search_path = public as $$
declare pid uuid; em text;
begin
  select p.id, p.email into pid, em from public.participants p join public.cases c on c.id = p.case_id
  where p.token = p_token and p.role = 'planter' and p.status = 'finished' and c.settings->>'purpose' = 'team' and not c.archived;
  if pid is null or em is null then return; end if;
  insert into public.report_keys(participant_id) values (pid) on conflict (participant_id) do nothing;
  return query
  update public.report_keys k set emailed_at = now()
  from public.participants p join public.cases c on c.id = p.case_id
  where k.participant_id = pid and p.id = pid and (k.emailed_at is null or k.emailed_at < now() - interval '1 hour')
  returning p.email, p.name, k.key, c.settings->'team'->>'name', c.settings->>'networkName';
end $$;

revoke all on function public.pl_key_person(text), public.pl_make_report_key(), public.pl_finish_team(text, jsonb), public.pl_report(text),
  public.pl_team_share(text, boolean), public.pl_team_save_summary(text, jsonb), public.pl_report_key_email(text) from public, anon, authenticated;
grant execute on function public.pl_finish_team(text, jsonb), public.pl_report(text), public.pl_team_share(text, boolean), public.pl_team_save_summary(text, jsonb) to anon, authenticated;
grant execute on function public.pl_report_key_email(text) to service_role;

-- The leader: update a team member's email (to resend their link), only until they start.
-- Once they've started, the address is theirs: it's where their private report link can be sent, so a leader can't redirect it.
create or replace function public.pl_team_set_email(p_person uuid, p_email text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email address doesn''t look right'; end if;
  update public.participants p set email = nullif(trim(p_email), '')
  from public.cases c where c.id = p.case_id and p.id = p_person and c.settings->>'purpose' = 'team' and public.pl_is_member(c.network_id) and p.status = 'invited';
  return found;
end $$;
revoke all on function public.pl_team_set_email(uuid, text) from public, anon;
grant execute on function public.pl_team_set_email(uuid, text) to authenticated;

-- Beta invite grants: keep only the organization's name in the label (same payment ids)
update public.payments set promo = 'beta invite: SLN' where promo like 'beta invite: SLN (%)';
