-- Paste into the Supabase SQL Editor and press Run (safe to run more than once). Same as the end of setup.sql.

-- ============ Share your report with your board (26 Oct 2026) ============
-- A person (usually the lead pastor) can share their own growth report with a few named people, like board members
-- or elders. Each gets a private, read-only link by email. The person sees who has it and can take it back any time.
-- Board members see only that one report: never anyone else's, never the team map, private notes or "Our team" answers.
create table if not exists public.report_viewers (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text,
  token text not null unique default public.pl_new_token(),
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  unique (participant_id, email)
);
alter table public.report_viewers enable row level security;

create or replace function public.pl_viewers_list(p_key text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'email', v.email, 'name', v.name, 'created', v.created_at) order by v.created_at), '[]'::jsonb)
  from public.report_viewers v where v.participant_id = public.pl_key_person(p_key)
$$;
create or replace function public.pl_viewers_add(p_key text, p_email text, p_name text) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.pl_key_person(p_key); vid uuid;
begin
  if me is null then raise exception 'That link isn''t working'; end if;
  if (select count(*) from public.report_viewers where participant_id = me) >= 12 then raise exception 'You can share with up to 12 people'; end if;
  insert into public.report_viewers(participant_id, email, name) values (me, lower(trim(p_email)), left(nullif(trim(p_name), ''), 80))
    on conflict (participant_id, email) do update set name = coalesce(excluded.name, public.report_viewers.name)
    returning id into vid;
  return vid;
end $$;
create or replace function public.pl_viewers_remove(p_key text, p_id uuid) returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from public.report_viewers where id = p_id and participant_id = public.pl_key_person(p_key);
  return found;
end $$;
-- What a board member opens: the same growth report the person sees, read-only, with who shared it
create or replace function public.pl_viewer_report(p_token text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'released', true, 'viewer', true, 'sharedBy', p.name,
    'case', jsonb_build_object('id', c.id, 'planterName', c.planter_name, 'spouseName', c.spouse_name, 'married', c.married,
                               'network', c.settings->>'networkName', 'logoUrl', c.settings->>'logoUrl', 'city', c.city,
                               'signGifts', coalesce((c.settings->>'signGifts')::boolean, true),
                               'audience', coalesce(c.settings->>'audience', 'planting'), 'faith', coalesce((c.settings->>'faith')::boolean, true), 'role', c.settings->>'role',
                               'purpose', coalesce(c.settings->>'purpose', 'decide'), 'team', c.settings->'team'),
    'role', p.role,
    'me', p.answers - 'privateNote' - 'safety' - 'teamh',
    'other', null)
  from public.report_viewers v join public.participants p on p.id = v.participant_id join public.cases c on c.id = p.case_id
  where v.token = p_token and p.status = 'finished' and not c.archived and c.settings->>'purpose' = 'team'
$$;
-- For the email function: who to send a board link to (only viewers the person just added, by id)
create or replace function public.pl_viewer_email(p_key text, p_id uuid) returns table(email text, name text, token text, owner_name text, team_name text)
language plpgsql security definer set search_path = public as $$
begin
  return query update public.report_viewers v set emailed_at = now()
    from public.participants p join public.cases c on c.id = p.case_id
    where v.id = p_id and v.participant_id = p.id and p.id = public.pl_key_person(p_key)
    returning v.email, v.name, v.token, p.name, c.settings->'team'->>'name';
end $$;
revoke all on function public.pl_viewers_list(text), public.pl_viewers_add(text, text, text), public.pl_viewers_remove(text, uuid), public.pl_viewer_report(text), public.pl_viewer_email(text, uuid) from public, anon, authenticated;
grant execute on function public.pl_viewers_list(text), public.pl_viewers_add(text, text, text), public.pl_viewers_remove(text, uuid), public.pl_viewer_report(text) to anon, authenticated;
grant execute on function public.pl_viewer_email(text, uuid) to service_role;
