-- Plumbline database setup. Paste this whole file into Supabase > SQL Editor > New query, then Run.
-- Safe to run again after updates: it only adds what's missing and replaces functions.

-- ============ Helpers ============
-- Random link keys: two random UUIDs joined (about 244 bits), no extension needed.
create or replace function public.pl_new_token() returns text language sql volatile set search_path = public as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

-- ============ Tables ============
-- A network (or church, or denomination region) that runs assessments
create table if not exists public.networks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  logo_url text,
  settings jsonb not null default '{}'::jsonb,   -- signGifts, beliefs[], questions[], retentionMonths
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Who belongs to a network. owner: everything; admin: settings, team, delete; assessor: run assessments.
create table if not exists public.network_members (
  network_id uuid not null references public.networks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'assessor')),
  email text,
  name text,
  created_at timestamptz not null default now(),
  primary key (network_id, user_id)
);
create index if not exists network_members_user_idx on public.network_members(user_id);

create table if not exists public.network_invites (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.networks(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'assessor')),
  token text not null unique default public.pl_new_token(),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  emailed_at timestamptz
);

-- One assessment = one planter (and spouse) plus references
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  network_id uuid references public.networks(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  planter_name text not null,
  spouse_name text,
  planter_email text,
  spouse_email text,
  married boolean not null default true,
  city text,
  settings jsonb not null default '{}'::jsonb,   -- snapshot of the network's settings + question version
  ref_token text not null unique default public.pl_new_token(),
  reports_released boolean not null default false,
  created_at timestamptz not null default now(),
  archived boolean not null default false
);
alter table public.cases add column if not exists network_id uuid references public.networks(id) on delete cascade;
alter table public.cases add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.cases add column if not exists planter_email text;
alter table public.cases add column if not exists spouse_email text;
alter table public.cases add column if not exists settings jsonb not null default '{}'::jsonb;
create index if not exists cases_network_idx on public.cases(network_id, archived, created_at desc);
create index if not exists invites_network_idx on public.network_invites(network_id);

-- Each person who answers: planter, spouse, or a reference
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  role text not null check (role in ('planter', 'spouse', 'reference')),
  token text not null unique default public.pl_new_token(),
  name text,
  email text,
  relationship text,
  status text not null default 'invited' check (status in ('invited', 'started', 'finished')),
  step int not null default 0,
  total int not null default 0,
  progress int not null default 0 check (progress between 0 and 100),
  chapter text,
  answers jsonb not null default '{}'::jsonb,
  consented_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  invited_at timestamptz,
  reminded_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.participants add column if not exists email text;
alter table public.participants add column if not exists invited_at timestamptz;
alter table public.participants add column if not exists reminded_at timestamptz;
alter table public.participants add column if not exists notified_at timestamptz;
alter table public.participants add column if not exists created_at timestamptz not null default now();
create index if not exists participants_case_idx on public.participants(case_id);
alter table public.participants add column if not exists shared boolean not null default false;  -- Plumbline Teams: the person chose to share their report
alter table public.participants add column if not exists team_summary jsonb;  -- Plumbline Teams: scores for the team map, never answers

-- Each assessor's own interview scores and notes (rated independently, then compared)
create table if not exists public.interview_scores (
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  notes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (case_id, user_id)
);

-- Every email sent, for daily limits per network (no content stored)
create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  network_id uuid,
  kind text not null,
  at timestamptz not null default now()
);
create index if not exists email_log_network_idx on public.email_log(network_id, at);

-- People who can see platform-wide counts (never anyone's answers)
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ============ Membership checks (used by security rules) ============
create or replace function public.pl_role(p_network uuid) returns text language sql stable security definer set search_path = public as $$
  select role from public.network_members where network_id = p_network and user_id = auth.uid()
$$;
create or replace function public.pl_is_member(p_network uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.network_members where network_id = p_network and user_id = auth.uid())
$$;
create or replace function public.pl_is_admin(p_network uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.pl_role(p_network) in ('owner', 'admin'), false)
$$;
create or replace function public.pl_case_network(p_case uuid) returns uuid language sql stable security definer set search_path = public as $$
  select network_id from public.cases where id = p_case
$$;

-- ============ Security rules ============
alter table public.networks enable row level security;
alter table public.network_members enable row level security;
alter table public.network_invites enable row level security;
alter table public.cases enable row level security;
alter table public.participants enable row level security;
alter table public.interview_scores enable row level security;
alter table public.platform_admins enable row level security;
alter table public.email_log enable row level security;

drop policy if exists "members read network" on public.networks;
create policy "members read network" on public.networks for select to authenticated using (public.pl_is_member(id));
drop policy if exists "admins edit network" on public.networks;
create policy "admins edit network" on public.networks for update to authenticated using (public.pl_is_admin(id)) with check (public.pl_is_admin(id));

drop policy if exists "members read team" on public.network_members;
create policy "members read team" on public.network_members for select to authenticated using (public.pl_is_member(network_id));

drop policy if exists "admins read invites" on public.network_invites;
create policy "admins read invites" on public.network_invites for select to authenticated using (public.pl_is_admin(network_id));
drop policy if exists "admins delete invites" on public.network_invites;
create policy "admins delete invites" on public.network_invites for delete to authenticated using (public.pl_is_admin(network_id));

drop policy if exists "leader cases" on public.cases;
drop policy if exists "members read cases" on public.cases;
create policy "members read cases" on public.cases for select to authenticated using (public.pl_is_member(network_id));
drop policy if exists "members add cases" on public.cases;
create policy "members add cases" on public.cases for insert to authenticated with check (public.pl_is_member(network_id) and created_by = auth.uid());
drop policy if exists "members edit cases" on public.cases;
create policy "members edit cases" on public.cases for update to authenticated using (public.pl_is_member(network_id)) with check (public.pl_is_member(network_id));
drop policy if exists "admins delete cases" on public.cases;
create policy "admins delete cases" on public.cases for delete to authenticated using (public.pl_is_admin(network_id));

drop policy if exists "leader participants" on public.participants;
drop policy if exists "members read people" on public.participants;
create policy "members read people" on public.participants for select to authenticated using (public.pl_is_member(public.pl_case_network(case_id)));
drop policy if exists "members edit people" on public.participants;
create policy "members edit people" on public.participants for update to authenticated using (public.pl_is_member(public.pl_case_network(case_id))) with check (public.pl_is_member(public.pl_case_network(case_id)));
drop policy if exists "members add references" on public.participants;
create policy "members add references" on public.participants for insert to authenticated with check (role = 'reference' and public.pl_is_member(public.pl_case_network(case_id)));
drop policy if exists "admins remove people" on public.participants;
create policy "admins remove people" on public.participants for delete to authenticated using (role = 'reference' and public.pl_is_admin(public.pl_case_network(case_id)));

drop policy if exists "team reads scores" on public.interview_scores;
create policy "team reads scores" on public.interview_scores for select to authenticated using (public.pl_is_member(public.pl_case_network(case_id)));
drop policy if exists "own scores" on public.interview_scores;
create policy "own scores" on public.interview_scores for insert to authenticated with check (user_id = auth.uid() and public.pl_is_member(public.pl_case_network(case_id)));
drop policy if exists "own scores update" on public.interview_scores;
create policy "own scores update" on public.interview_scores for update to authenticated
  using (user_id = auth.uid() and public.pl_is_member(public.pl_case_network(case_id)))
  with check (user_id = auth.uid() and public.pl_is_member(public.pl_case_network(case_id)));
create or replace function public.pl_guard_scores() returns trigger language plpgsql set search_path = public as $$
begin
  if new.case_id is distinct from old.case_id or new.user_id is distinct from old.user_id then raise exception 'That change is not allowed'; end if;
  return new;
end $$;
drop trigger if exists pl_guard_scores on public.interview_scores;
create trigger pl_guard_scores before update on public.interview_scores for each row execute function public.pl_guard_scores();

-- Members can't change a case's network or link key, or a person's link key, answers or status (only the person can, through their link)
create or replace function public.pl_guard_case() returns trigger language plpgsql set search_path = public as $$
begin
  if new.network_id is distinct from old.network_id or new.ref_token is distinct from old.ref_token or new.created_by is distinct from old.created_by then
    raise exception 'That change is not allowed';
  end if;
  return new;
end $$;
drop trigger if exists pl_guard_case on public.cases;
create trigger pl_guard_case before update on public.cases for each row when (current_user = 'authenticated') execute function public.pl_guard_case();

create or replace function public.pl_guard_person() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.token := public.pl_new_token(); new.status := 'invited'; new.answers := '{}'::jsonb; new.progress := 0; new.step := 0;
    return new;
  end if;
  if new.token is distinct from old.token or new.answers is distinct from old.answers or new.case_id is distinct from old.case_id
     or new.role is distinct from old.role or new.finished_at is distinct from old.finished_at then
    raise exception 'That change is not allowed';
  end if;
  -- the one status change a leader may make: reopen a finished form for edits
  if new.status is distinct from old.status and not (old.status = 'finished' and new.status = 'started') then
    raise exception 'That change is not allowed';
  end if;
  return new;
end $$;
drop trigger if exists pl_guard_person on public.participants;
create trigger pl_guard_person before insert or update on public.participants for each row when (current_user = 'authenticated') execute function public.pl_guard_person();

-- ============ Networks and teams ============
-- First sign-in: create a network and become its owner
create or replace function public.pl_create_network(p_name text, p_name_self text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid; em text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if coalesce(length(trim(p_name)), 0) = 0 then raise exception 'Name your network'; end if;
  if (select count(*) from public.network_members where user_id = auth.uid() and role = 'owner') >= 5 then raise exception 'You can own up to 5 networks'; end if;
  select email into em from auth.users where id = auth.uid();
  insert into public.networks(name, created_by, settings) values (left(trim(p_name), 120), auth.uid(),
    jsonb_build_object('signGifts', true, 'beliefs', '[]'::jsonb, 'questions', '[]'::jsonb, 'retentionMonths', 24)) returning id into nid;
  insert into public.network_members(network_id, user_id, role, email, name) values (nid, auth.uid(), 'owner', em, left(p_name_self, 120));
  return nid;
end $$;

-- Invite someone to the team. Returns the invite id (the email function sends it).
create or replace function public.pl_invite_member(p_network uuid, p_email text, p_role text) returns uuid
language plpgsql security definer set search_path = public as $$
declare iid uuid;
begin
  if not public.pl_is_admin(p_network) then raise exception 'Only owners and admins can invite'; end if;
  if p_role not in ('admin', 'assessor') then raise exception 'Role must be admin or assessor'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email doesn''t look right'; end if;
  if (select count(*) from public.network_invites where network_id = p_network and accepted_at is null) >= 50 then raise exception 'Too many open invites'; end if;
  insert into public.network_invites(network_id, email, role, invited_by) values (p_network, lower(trim(p_email)), p_role, auth.uid()) returning id into iid;
  return iid;
end $$;

-- Accept an invite (after signing in with any email; the link is the key)
create or replace function public.pl_accept_invite(p_token text, p_name text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.network_invites; em text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from public.network_invites where token = p_token and accepted_at is null and created_at > now() - interval '30 days';
  if inv.id is null then raise exception 'This invite has expired or was already used'; end if;
  select email into em from auth.users where id = auth.uid();
  if lower(coalesce(em, '')) <> lower(inv.email) then raise exception 'This invite was sent to %. Sign in with that email to accept it.', inv.email; end if;
  insert into public.network_members(network_id, user_id, role, email, name) values (inv.network_id, auth.uid(), inv.role, em, left(p_name, 120))
    on conflict (network_id, user_id) do nothing;
  update public.network_invites set accepted_at = now() where id = inv.id;
  return inv.network_id;
end $$;

create or replace function public.pl_invite_info(p_token text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('network', n.name, 'role', i.role, 'email', i.email)
  from public.network_invites i join public.networks n on n.id = i.network_id
  where i.token = p_token and i.accepted_at is null and i.created_at > now() - interval '30 days'
$$;

create or replace function public.pl_set_member(p_network uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare cur text; owners int;
begin
  if not public.pl_is_admin(p_network) then raise exception 'Only owners and admins can change the team'; end if;
  select role into cur from public.network_members where network_id = p_network and user_id = p_user;
  if cur is null then raise exception 'Not on this team'; end if;
  select count(*) into owners from public.network_members where network_id = p_network and role = 'owner';
  if cur = 'owner' and public.pl_role(p_network) <> 'owner' then raise exception 'Only an owner can change another owner'; end if;
  if p_role = 'owner' and public.pl_role(p_network) <> 'owner' then raise exception 'Only an owner can add an owner'; end if;
  if cur = 'owner' and p_role <> 'owner' and owners = 1 then raise exception 'A network needs at least one owner'; end if;
  if p_role = 'remove' then
    delete from public.network_members where network_id = p_network and user_id = p_user;
  elsif p_role in ('owner', 'admin', 'assessor') then
    update public.network_members set role = p_role where network_id = p_network and user_id = p_user;
  else raise exception 'Unknown role'; end if;
end $$;

-- ============ Assessments ============
-- New case: snapshot the network's settings, then create the planter (and spouse) rows
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
drop trigger if exists case_snapshot on public.cases;
create trigger case_snapshot before insert on public.cases for each row execute function public.case_snapshot();

create or replace function public.case_people() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.participants(case_id, role, name, email) values (new.id, 'planter', new.planter_name, nullif(trim(new.planter_email), ''));
  if new.married then
    insert into public.participants(case_id, role, name, email) values (new.id, 'spouse', new.spouse_name, nullif(trim(new.spouse_email), ''));
  end if;
  return new;
end $$;
drop trigger if exists case_people on public.cases;
create trigger case_people after insert on public.cases for each row execute function public.case_people();

-- ============ What a person's link can do (no login needed; the link is the key) ============
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

create or replace function public.pl_open(p_token text) returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'participant', jsonb_build_object('id', p.id, 'role', p.role, 'name', p.name, 'relationship', p.relationship, 'status', p.status,
                                      'step', p.step, 'progress', p.progress,
                                      -- private answers never leave the server, so whoever holds a link can't read them back
                                      'answers', case when p.status = 'finished' then '{}'::jsonb else p.answers - 'privateNote' - 'safety' - 'spouseSees' end),
    'case', public.pl_case_header(c))
  from public.participants p join public.cases c on c.id = p.case_id
  where p.token = p_token and not c.archived;
$$;

-- Keeps the private parts (note, safety, spouse's ratings) that a resumed session never received back
create or replace function public.pl_merge_private(old jsonb, incoming jsonb) returns jsonb language sql immutable set search_path = public as $$
  select incoming
    || jsonb_build_object('safety', coalesce(old->'safety', '{}'::jsonb) || coalesce(incoming->'safety', '{}'::jsonb))
    || jsonb_build_object('spouseSees', coalesce(old->'spouseSees', '{}'::jsonb) || coalesce(incoming->'spouseSees', '{}'::jsonb))
    || case when coalesce(incoming->>'privateNote', '') = '' and coalesce(old->>'privateNote', '') <> '' then jsonb_build_object('privateNote', old->'privateNote') else '{}'::jsonb end
$$;

create or replace function public.pl_save(p_token text, p_answers jsonb, p_step int, p_total int, p_chapter text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 150000 then raise exception 'Too large'; end if;
  update public.participants set
    answers = public.pl_merge_private(answers, p_answers), step = greatest(0, p_step), total = greatest(0, p_total),
    progress = case when p_total > 0 then least(99, greatest(0, 100 * p_step / p_total)) else 0 end,
    chapter = left(p_chapter, 60),
    status = 'started', started_at = coalesce(started_at, now()), updated_at = now(),
    name = coalesce(nullif(left(p_answers #>> '{meta,name}', 120), ''), name),
    relationship = coalesce(nullif(left(p_answers #>> '{meta,relationship}', 80), ''), relationship),
    consented_at = coalesce(consented_at, case when p_answers #>> '{meta,consentedAt}' is not null then now() end)
  where token = p_token and status <> 'finished'
    and exists (select 1 from public.cases c where c.id = case_id and not c.archived);
  get diagnostics n = row_count;
  return n = 1;
end $$;

create or replace function public.pl_finish(p_token text, p_answers jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 150000 then raise exception 'Too large'; end if;
  update public.participants set answers = public.pl_merge_private(answers, p_answers), status = 'finished', progress = 100, step = total,
    finished_at = now(), updated_at = now(),
    name = coalesce(nullif(left(p_answers #>> '{meta,name}', 120), ''), name)
  where token = p_token and status <> 'finished'
    and exists (select 1 from public.cases c where c.id = case_id and not c.archived);
  get diagnostics n = row_count;
  return n = 1;
end $$;

create or replace function public.pl_join_reference(p_ref_token text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare cid uuid; t text;
begin
  select id into cid from public.cases where ref_token = p_ref_token and not archived;
  if cid is null then return null; end if;
  if (select count(*) from public.participants where case_id = cid and role = 'reference') >= 12 then return null; end if;
  insert into public.participants(case_id, role, name) values (cid, 'reference', left(coalesce(p_name, ''), 120)) returning token into t;
  return t;
end $$;

-- New shared reference link (the old one stops working)
create or replace function public.pl_rotate_ref(p_case uuid) returns text language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.pl_is_member(public.pl_case_network(p_case)) then raise exception 'Not on this team'; end if;
  update public.cases set ref_token = public.pl_new_token() where id = p_case returning ref_token into t;
  return t;
end $$;

create or replace function public.pl_ref_case(p_ref_token text) returns jsonb language sql security definer set search_path = public stable as $$
  select public.pl_case_header(c) - 'questions' - 'beliefs' from public.cases c where ref_token = p_ref_token and not archived;
$$;

-- ============ Personal reports ============
-- A planter or spouse reads their own report once a leader releases it.
-- From their spouse they get only summaries (average per wiring dimension and per couple area):
-- never item-level answers, the private note, safety answers, how the spouse rated them, or anything from references.
create or replace function public.pl_couple_items() returns table(item text, area text, rev boolean) language sql immutable set search_path = public as $$
  values ('cp1','calling',false),('cp2','calling',false),('cp3','calling',false),
         ('cv1','vision',false),('cv2','vision',false),('cv3','vision',false),
         ('cmo1','money',false),('cmo2','money',false),('cmo3','money',true),
         ('cr1','roles',false),('cr2','roles',false),('cr3','roles',true),
         ('ct1','time',false),('ct2','time',false),('ct3','time',false),
         ('ck1','home',false),('ck2','home',false),('ck3','home',false),
         ('cc1','conflict',false),('cc2','conflict',false),('cc3','conflict',true),
         ('cs1','support',false),('cs2','support',false),('cs3','support',false)
$$;

create or replace function public.pl_summary(a jsonb) returns jsonb language sql stable set search_path = public as $$
  with w as (
    select coalesce(jsonb_object_agg(k, jsonb_build_array(m)), '{}'::jsonb) as wiring from (
      select e.key as k, round(avg(x::numeric) * 2) / 2 as m
      from jsonb_each(case when jsonb_typeof(a->'wiring') = 'object' then a->'wiring' else '{}'::jsonb end) e,
           jsonb_array_elements_text(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) x
      where x ~ '^[1-5]$' group by e.key having count(*) >= 2) t
  ), healthy as (
    select i.item, i.area, i.rev,
      case when i.rev then 6 - (a->'couple'->>i.item)::numeric else (a->'couple'->>i.item)::numeric end as v
    from public.pl_couple_items() i where (a->'couple'->>i.item) ~ '^[1-5]$'
  ), area_mean as (select area, round(avg(v) * 2) / 2 m from healthy group by area having count(*) >= 2),
  c as (
    select coalesce(jsonb_object_agg(i.item, round(case when i.rev then 6 - am.m else am.m end, 2)), '{}'::jsonb) as couple
    from public.pl_couple_items() i join area_mean am on am.area = i.area
  )
  select jsonb_build_object('wiring', w.wiring, 'couple', c.couple, 'meta', jsonb_build_object('name', a#>>'{meta,name}')) from w, c;
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

-- ============ Email (used by the plumbline-email function) ============
-- Who to email for invites or reminders. Checks the caller is on the case's team, stamps the time, and skips anyone
-- already finished, or (for reminders) reminded in the last 20 hours.
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
                else p.invited_at is not null and (p.reminded_at is null or p.reminded_at < now() - interval '20 hours') end)
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

-- When someone finishes: the leaders to tell (case creator, owners and admins), once per person.
create or replace function public.pl_finish_notice(p_token text) returns table(email text, person_name text, person_role text, planter_name text, case_id uuid, all_done boolean)
language plpgsql security definer set search_path = public as $$
declare p public.participants; c public.cases;
begin
  update public.participants set notified_at = now() where token = p_token and status = 'finished' and notified_at is null returning * into p;
  if p.id is null or p.role = 'reference' then return; end if;  -- references show on the dashboard; no email for each one
  select * into c from public.cases where id = p.case_id;
  return query
  select distinct m.email, p.name, p.role, c.planter_name, c.id,
    not exists (select 1 from public.participants x where x.case_id = c.id and x.role in ('planter', 'spouse') and x.status <> 'finished')
  from public.network_members m
  where m.network_id = c.network_id and m.email is not null and (m.role in ('owner', 'admin') or m.user_id = c.created_by);
end $$;

create or replace function public.pl_member_invite_email(p_invite uuid) returns table(email text, token text, role text, network_name text, sender_name text, sender_email text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.network_invites i set emailed_at = now()
  from public.networks n, public.network_members m
  where i.id = p_invite and n.id = i.network_id and public.pl_is_admin(i.network_id) and i.accepted_at is null
    and i.created_at > now() - interval '30 days' and (i.emailed_at is null or i.emailed_at < now() - interval '1 day')
    and m.network_id = i.network_id and m.user_id = auth.uid()
  returning i.email, i.token, i.role, n.name, coalesce(m.name, split_part(m.email, '@', 1)), m.email;
end $$;

-- ============ Platform overview (counts, plus each network's owner so Parker can check in; never answers) ============
create or replace function public.pl_platform_stats() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.platform_admins where user_id = auth.uid()) then return null; end if;
  return jsonb_build_object(
    'networks', (select count(*) from public.networks),
    'leaders', (select count(distinct user_id) from public.network_members),
    'assessments', (select count(*) from public.cases where not archived),
    'assessments30', (select count(*) from public.cases where created_at > now() - interval '30 days'),
    'started', (select count(*) from public.participants where status <> 'invited'),
    'finished', (select count(*) from public.participants where status = 'finished'),
    'finished30', (select count(*) from public.participants where finished_at > now() - interval '30 days'),
    'byNetwork', (select coalesce(jsonb_agg(x order by (x->>'assessments')::int desc), '[]'::jsonb) from (
       select jsonb_build_object('id', n.id, 'credits', n.credits, 'founding', n.founding, 'planUntil', n.plan_until::date, 'name', n.name, 'assessments', count(c.id), 'members', (select count(*) from public.network_members m where m.network_id = n.id), 'created', n.created_at::date,
         'lastAssessment', max(c.created_at)::date,
         'owner', (select coalesce(nullif(m.name, ''), u.email) from public.network_members m join auth.users u on u.id = m.user_id where m.network_id = n.id and m.role = 'owner' order by m.created_at limit 1),
         'ownerEmail', (select coalesce(nullif(m.email, ''), u.email) from public.network_members m join auth.users u on u.id = m.user_id where m.network_id = n.id and m.role = 'owner' order by m.created_at limit 1)) x
       from public.networks n left join public.cases c on c.network_id = n.id and not c.archived group by n.id) t));
end $$;

-- ============ Payments ============
-- Each assessment (one couple and their references) uses one credit, unless the network has a yearly plan.
-- Credits arrive only from Stripe (the plumbline-stripe function, using the service key) or from the platform admin.
alter table public.networks add column if not exists credits int not null default 0 check (credits >= 0);
alter table public.networks alter column credits set default 1;  -- every new network's first couple is free
drop trigger if exists pl_count_case on public.cases;  -- an earlier billing draft, replaced by credits
alter table public.networks add column if not exists plan_until timestamptz;
alter table public.networks add column if not exists stripe_customer text;
alter table public.networks add column if not exists founding boolean not null default false;  -- beta networks: $79 per couple through 2027
create table if not exists public.payments (
  id text primary key,                       -- Stripe checkout session or invoice id; makes every payment count once
  network_id uuid references public.networks(id) on delete set null,
  kind text not null check (kind in ('couples', 'plan', 'renewal', 'grant')),
  quantity int not null default 0,
  amount_total int not null default 0,       -- cents, after discounts
  currency text not null default 'usd',
  email text,
  promo text,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
drop policy if exists "team reads payments" on public.payments;
create policy "team reads payments" on public.payments for select to authenticated using (public.pl_is_admin(network_id));

create or replace function public.pl_case_credit() returns trigger language plpgsql security definer set search_path = public as $$
declare n public.networks;
begin
  select * into n from public.networks where id = new.network_id for update;
  if n.plan_until is not null and n.plan_until > now() then return new; end if;
  if coalesce(n.credits, 0) < 1 then raise exception 'No assessments left. Buy more at plumblineassessment.com.' using errcode = 'P0001'; end if;
  update public.networks set credits = credits - 1 where id = new.network_id;
  return new;
end $$;
drop trigger if exists pl_case_credit on public.cases;
create trigger pl_case_credit before insert on public.cases for each row execute function public.pl_case_credit();

-- Called only by the Stripe function (service key). Returns false when this payment was already counted.
create or replace function public.pl_record_payment(p_id text, p_network uuid, p_kind text, p_qty int, p_amount int, p_currency text, p_email text, p_promo text, p_customer text)
returns boolean language plpgsql security definer set search_path = public as $$
declare net uuid := p_network;
begin
  if net is null and p_customer is not null then select id into net from public.networks where stripe_customer = p_customer limit 1; end if;
  if net is null or not exists (select 1 from public.networks where id = net) then raise exception 'Unknown network'; end if;
  insert into public.payments (id, network_id, kind, quantity, amount_total, currency, email, promo) values (p_id, net, p_kind, greatest(p_qty, 0), p_amount, coalesce(p_currency, 'usd'), p_email, p_promo)
    on conflict (id) do nothing;
  if not found then return false; end if;
  if p_kind = 'couples' then update public.networks set credits = credits + greatest(p_qty, 0) where id = net;
  elsif p_kind in ('plan', 'renewal') then update public.networks set plan_until = greatest(coalesce(plan_until, now()), now()) + interval '1 year' where id = net;
  end if;
  if p_customer is not null then update public.networks set stripe_customer = p_customer where id = net and stripe_customer is null; end if;
  return true;
end $$;

-- The platform admin can give assessments (or a plan) to a network, for pilots and partners.
create or replace function public.pl_grant(p_network uuid, p_credits int, p_months int default 0) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.platform_admins where user_id = auth.uid()) then raise exception 'Only the platform admin can do that'; end if;
  update public.networks set credits = greatest(0, credits + coalesce(p_credits, 0)),
    plan_until = case when coalesce(p_months, 0) > 0 then greatest(coalesce(plan_until, now()), now()) + make_interval(months => p_months) else plan_until end
  where id = p_network;
  insert into public.payments (id, network_id, kind, quantity) values ('grant_' || gen_random_uuid(), p_network, 'grant', coalesce(p_credits, 0));
end $$;

-- The platform admin marks a beta network as founding ($79 per couple through 2027) or takes it off.
create or replace function public.pl_set_founding(p_network uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.platform_admins where user_id = auth.uid()) then raise exception 'Only the platform admin can do that'; end if;
  update public.networks set founding = coalesce(p_on, false) where id = p_network;
end $$;

-- ============ Delete my account (required by the App Store; also on the web) ============
-- Networks you lead alone are deleted with everything in them. Where others remain and you were the only owner,
-- the longest-serving admin (else assessor) becomes owner, so no network is left without one. Then the login itself goes.
create or replace function public.pl_delete_account() returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n record; heir uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  for n in select network_id, role from public.network_members where user_id = me loop
    if not exists (select 1 from public.network_members where network_id = n.network_id and user_id <> me) then
      delete from public.networks where id = n.network_id;
    elsif n.role = 'owner' and not exists (select 1 from public.network_members where network_id = n.network_id and user_id <> me and role = 'owner') then
      select user_id into heir from public.network_members where network_id = n.network_id and user_id <> me
        order by (role = 'admin') desc, created_at asc limit 1;
      update public.network_members set role = 'owner' where network_id = n.network_id and user_id = heir;
    end if;
  end loop;
  delete from auth.users where id = me;
end $$;

-- ============ Data retention ============
-- Deletes assessments older than each network's retention setting (default 24 months), and stale invites.
create or replace function public.pl_purge() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.cases c using public.networks nw
  where nw.id = c.network_id and c.created_at < now() - make_interval(months => least(60, greatest(6, coalesce((nw.settings->>'retentionMonths')::int, 24))));
  get diagnostics n = row_count;
  delete from public.network_invites where accepted_at is null and created_at < now() - interval '60 days';
  delete from public.email_log where at < now() - interval '7 days';
  return n;
end $$;

-- ============ Permissions ============
-- Supabase gives anon and authenticated full rights on new tables and functions. Take them all back, then grant only
-- what the app uses, column by column. Row-level security above then decides which rows.
revoke all on public.networks, public.network_members, public.network_invites, public.cases, public.participants,
  public.interview_scores, public.platform_admins, public.email_log, public.payments from anon, authenticated;
grant select on public.networks, public.network_members, public.network_invites, public.cases, public.participants, public.interview_scores, public.payments to authenticated;
grant update (name, logo_url, settings) on public.networks to authenticated;
grant delete on public.network_invites to authenticated;
grant insert (network_id, created_by, planter_name, spouse_name, planter_email, spouse_email, married, city, settings) on public.cases to authenticated;
grant update (reports_released) on public.cases to authenticated;
grant delete on public.cases to authenticated;
grant insert (case_id, role, name, email) on public.participants to authenticated;
grant update (email, name, status) on public.participants to authenticated;
grant delete on public.participants to authenticated;
grant insert (case_id, user_id, name, notes, updated_at) on public.interview_scores to authenticated;
grant update (case_id, user_id, name, notes, updated_at) on public.interview_scores to authenticated;  -- upsert names every column; a trigger blocks moving a row

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'pl\_%' or p.proname in ('case_people', 'case_snapshot')) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
-- What a person's link can do (no sign-in)
grant execute on function public.pl_open(text), public.pl_save(text, jsonb, int, int, text), public.pl_finish(text, jsonb),
  public.pl_join_reference(text, text), public.pl_ref_case(text), public.pl_report(text), public.pl_invite_info(text) to anon, authenticated;
-- What a signed-in team member can do (each checks membership itself)
grant execute on function public.pl_create_network(text, text), public.pl_invite_member(uuid, text, text), public.pl_accept_invite(text, text),
  public.pl_set_member(uuid, uuid, text), public.pl_email_people(uuid[], text), public.pl_member_invite_email(uuid), public.pl_platform_stats(),
  public.pl_rotate_ref(uuid), public.pl_delete_account(), public.pl_grant(uuid, int, int), public.pl_set_founding(uuid, boolean) to authenticated;
-- Only the Stripe function (service key) records payments
grant execute on function public.pl_record_payment(text, uuid, text, int, int, text, text, text, text) to service_role;
-- Used by column defaults and triggers when a team member adds a case or a reference
grant execute on function public.pl_new_token() to authenticated;
-- Helpers the security rules call
grant execute on function public.pl_role(uuid), public.pl_is_member(uuid), public.pl_is_admin(uuid), public.pl_case_network(uuid) to authenticated;
-- pl_finish_notice and pl_purge run only with the service key (the email function and the nightly job)

-- ============ Live progress bars ============
-- A small table that mirrors only progress (never answers). The dashboard reads it and listens to it live,
-- and it only changes when someone's whole-number percent, chapter or status changes.
create table if not exists public.participant_status (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  network_id uuid,
  role text not null,
  name text,
  status text not null,
  progress int not null default 0,
  chapter text,
  invited_at timestamptz,
  reminded_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists participant_status_network_idx on public.participant_status(network_id);
alter table public.participant_status enable row level security;
drop policy if exists "members read progress" on public.participant_status;
create policy "members read progress" on public.participant_status for select to authenticated using (public.pl_is_member(network_id));

create or replace function public.pl_sync_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.participant_status(participant_id, case_id, network_id, role, name, status, progress, chapter, invited_at, reminded_at, updated_at)
  values (new.id, new.case_id, public.pl_case_network(new.case_id), new.role, new.name, new.status, new.progress, new.chapter, new.invited_at, new.reminded_at, now())
  on conflict (participant_id) do update set name = excluded.name, status = excluded.status, progress = excluded.progress,
    chapter = excluded.chapter, invited_at = excluded.invited_at, reminded_at = excluded.reminded_at, updated_at = now();
  return new;
end $$;
drop trigger if exists pl_sync_status_ins on public.participants;
create trigger pl_sync_status_ins after insert on public.participants for each row execute function public.pl_sync_status();
drop trigger if exists pl_sync_status_upd on public.participants;
create trigger pl_sync_status_upd after update on public.participants for each row
  when (old.progress is distinct from new.progress or old.status is distinct from new.status or old.chapter is distinct from new.chapter
        or old.name is distinct from new.name or old.invited_at is distinct from new.invited_at or old.reminded_at is distinct from new.reminded_at)
  execute function public.pl_sync_status();
insert into public.participant_status(participant_id, case_id, network_id, role, name, status, progress, chapter, invited_at, reminded_at)
  select p.id, p.case_id, c.network_id, p.role, p.name, p.status, p.progress, p.chapter, p.invited_at, p.reminded_at
  from public.participants p join public.cases c on c.id = p.case_id
  on conflict (participant_id) do nothing;

do $$ begin
  alter publication supabase_realtime drop table public.participants;
exception when others then null; end $$;
revoke all on public.participant_status from anon, authenticated;
grant select on public.participant_status to authenticated;
do $$ begin
  alter publication supabase_realtime add table public.participant_status;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ============ Logos (Supabase Storage) ============
-- A logo lives at <network id>/<file>; only that network's owners and admins can write there.
create or replace function public.pl_logo_ok(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.pl_is_admin(split_part(p_name, '/', 1)::uuid) else false end
$$;
revoke all on function public.pl_logo_ok(text) from public, anon;
grant execute on function public.pl_logo_ok(text) to authenticated;
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists "admins upload logos" on storage.objects;
  create policy "admins upload logos" on storage.objects for insert to authenticated
    with check (bucket_id = 'logos' and public.pl_logo_ok(name));
  drop policy if exists "admins replace logos" on storage.objects;
  create policy "admins replace logos" on storage.objects for update to authenticated
    using (bucket_id = 'logos' and public.pl_logo_ok(name));
exception when undefined_table or invalid_schema_name or undefined_function then null; end $$;

-- ============ Uploaded results from other assessments (Supabase Storage, private) ============
-- A file lives at <participant link token>/<random name>. Whoever holds a planter or spouse link can add up to 5 files
-- until they finish, but can't list, read or delete files (the path holds their token, so visitors get no read access at all).
-- Their network's team can read them; owners and admins can delete them. Removing a file in the app only detaches it;
-- the nightly sweep (plumbline-sweep) deletes files that are detached or whose person no longer exists.
create or replace function public.pl_result_owner(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select split_part(p_name, '/', 1) ~ '^[0-9a-f]{64}$' and exists (
    select 1 from public.participants p where p.token = split_part(p_name, '/', 1) and p.role in ('planter', 'spouse') and p.status <> 'finished')
$$;
create or replace function public.pl_result_team(p_name text, p_admin boolean) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.participants p join public.cases c on c.id = p.case_id
    where p.token = split_part(p_name, '/', 1) and case when p_admin then public.pl_is_admin(c.network_id) else public.pl_is_member(c.network_id) end)
$$;
revoke all on function public.pl_result_owner(text) from public;
revoke all on function public.pl_result_team(text, boolean) from public, anon;
grant execute on function public.pl_result_owner(text) to anon, authenticated;
grant execute on function public.pl_result_team(text, boolean) to authenticated;
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('results', 'results', false, 5242880, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  execute $f$
    create or replace function public.pl_result_room(p_name text) returns boolean language sql stable security definer set search_path = public as $b$
      select public.pl_result_owner(p_name) and (select count(*) from storage.objects o
        where o.bucket_id = 'results' and split_part(o.name, '/', 1) = split_part(p_name, '/', 1)) < 5
    $b$ $f$;
  revoke all on function public.pl_result_room(text) from public;
  grant execute on function public.pl_result_room(text) to anon, authenticated;
  drop policy if exists "people add results" on storage.objects;
  create policy "people add results" on storage.objects for insert to anon, authenticated
    with check (bucket_id = 'results' and public.pl_result_room(name));
  drop policy if exists "people and teams see results" on storage.objects;
  drop policy if exists "teams see results" on storage.objects;
  create policy "teams see results" on storage.objects for select to authenticated
    using (bucket_id = 'results' and public.pl_result_team(name, false));
  drop policy if exists "people and admins remove results" on storage.objects;
  drop policy if exists "admins remove results" on storage.objects;
  create policy "admins remove results" on storage.objects for delete to authenticated
    using (bucket_id = 'results' and public.pl_result_team(name, true));
exception when undefined_table or invalid_schema_name or undefined_function then null; end $$;

-- ============ Nightly clean-up (needs the pg_cron extension, available in Supabase) ============
do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule('plumbline-purge') where exists (select 1 from cron.job where jobname = 'plumbline-purge');
  perform cron.schedule('plumbline-purge', '17 4 * * *', 'select public.pl_purge()');
exception when others then
  raise warning 'Plumbline: the nightly clean-up could not be scheduled (%). Turn on pg_cron under Database > Extensions, then run this file again.', sqlerrm;
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

-- ============ Plumbline Teams yearly plans (24 Oct 2026) ============
-- Starter (up to 8 people) $249, Team (up to 15) $449, Staff (up to 50) $1,299 a year; past 50, $25 a person a year.
-- A plan covers that many people on teams at once. Removing someone from a team frees their place.
-- Without a plan (or past its size), each person on a team uses one assessment credit, as before.
alter table public.networks add column if not exists team_seats int not null default 0 check (team_seats >= 0);
alter table public.networks add column if not exists team_until timestamptz;
alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('couples', 'plan', 'renewal', 'grant', 'teams', 'teams_renewal'));

-- People on teams right now (each team member is one assessment with purpose 'team')
create or replace function public.pl_team_seats_used(p_network uuid) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.cases where network_id = p_network and not archived and settings->>'purpose' = 'team'
$$;
revoke all on function public.pl_team_seats_used(uuid) from public, anon;
grant execute on function public.pl_team_seats_used(uuid) to authenticated;

create or replace function public.pl_case_credit() returns trigger language plpgsql security definer set search_path = public as $$
declare n public.networks;
begin
  select * into n from public.networks where id = new.network_id for update;
  if n.plan_until is not null and n.plan_until > now() then return new; end if;
  -- A Teams plan covers team members up to its size
  if new.settings->>'purpose' = 'team' and n.team_until is not null and n.team_until > now()
     and public.pl_team_seats_used(n.id) < n.team_seats then return new; end if;
  if coalesce(n.credits, 0) < 1 then raise exception 'No assessments left. Buy more at plumblineassessment.com.' using errcode = 'P0001'; end if;
  update public.networks set credits = credits - 1 where id = new.network_id;
  return new;
end $$;

-- Called only by the Stripe function (service key). Returns false when this payment was already counted.
-- teams: a new Teams plan starts now for a year with p_qty people. teams_renewal: another year, size from the subscription.
create or replace function public.pl_record_payment(p_id text, p_network uuid, p_kind text, p_qty int, p_amount int, p_currency text, p_email text, p_promo text, p_customer text)
returns boolean language plpgsql security definer set search_path = public as $$
declare net uuid := p_network;
begin
  if net is null and p_customer is not null then select id into net from public.networks where stripe_customer = p_customer limit 1; end if;
  if net is null or not exists (select 1 from public.networks where id = net) then raise exception 'Unknown network'; end if;
  insert into public.payments (id, network_id, kind, quantity, amount_total, currency, email, promo) values (p_id, net, p_kind, greatest(p_qty, 0), p_amount, coalesce(p_currency, 'usd'), p_email, p_promo)
    on conflict (id) do nothing;
  if not found then return false; end if;
  if p_kind = 'couples' then update public.networks set credits = credits + greatest(p_qty, 0) where id = net;
  elsif p_kind in ('plan', 'renewal') then update public.networks set plan_until = greatest(coalesce(plan_until, now()), now()) + interval '1 year' where id = net;
  elsif p_kind = 'teams' then update public.networks set team_seats = greatest(p_qty, 0), team_until = now() + interval '1 year' where id = net;
  elsif p_kind = 'teams_renewal' then update public.networks set team_seats = greatest(p_qty, 0), team_until = greatest(coalesce(team_until, now()), now()) + interval '1 year' where id = net;
  end if;
  if p_customer is not null then update public.networks set stripe_customer = p_customer where id = net and stripe_customer is null; end if;
  return true;
end $$;

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

-- ============ Free beta and founder pricing (owner, 26 Oct 2026) ============
-- Every Parker Manuel app: free beta through 31 Dec 2026, launch 5 Jan 2027. Founders (networks set up before launch)
-- get a third off from 5 Jan through 31 Dec 2027, then regular prices. Nothing is "for life".
-- Here: during the beta, starting an assessment or adding someone to a team uses no credit and needs no plan.
-- The day is Mountain time (Plumbline is run from Boulder). Tests can set pl.today to check other days.
create or replace function public.pl_today() returns date language sql stable set search_path = public as $$
  select coalesce(nullif(current_setting('pl.today', true), '')::date, (now() at time zone 'America/Denver')::date)
$$;
create or replace function public.pl_in_beta() returns boolean language sql stable set search_path = public as $$
  select public.pl_today() <= date '2026-12-31'
$$;
-- A founder: joined during the beta, through 31 Dec 2026 (or marked founding by the platform admin). Founder prices run 1 Jan – 31 Dec 2027; public launch at regular prices is 5 Jan 2027.
create or replace function public.pl_is_founder(p_network uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.networks n where n.id = p_network
    and (n.founding or (n.created_at at time zone 'America/Denver')::date < date '2027-01-01'))  -- joined during the beta (through 31 Dec 2026)
    and public.pl_today() <= date '2027-12-31'
$$;
revoke all on function public.pl_is_founder(uuid) from public, anon;
grant execute on function public.pl_is_founder(uuid) to authenticated;

create or replace function public.pl_case_credit() returns trigger language plpgsql security definer set search_path = public as $$
declare n public.networks;
begin
  -- Free beta through 31 Dec 2026: no credit used, no plan needed
  if public.pl_in_beta() then return new; end if;
  select * into n from public.networks where id = new.network_id for update;
  if n.plan_until is not null and n.plan_until > now() then return new; end if;
  -- A Teams plan covers team members up to its size
  if new.settings->>'purpose' = 'team' and n.team_until is not null and n.team_until > now()
     and public.pl_team_seats_used(n.id) < n.team_seats then return new; end if;
  if coalesce(n.credits, 0) < 1 then raise exception 'No assessments left. Buy more at plumblineassessment.com.' using errcode = 'P0001'; end if;
  update public.networks set credits = credits - 1 where id = new.network_id;
  return new;
end $$;

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
-- least three have finished (the common 360 standard, so no one's ratings can be picked out). No one else sees peer ratings: not the leader, not the team map.
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
    'items', case when (select count(*) from done) >= 3
      then coalesce((select jsonb_object_agg(k, jsonb_build_object('avg', round(v, 2), 'n', n)) from (select k, avg(v) v, count(*) n from vals group by k having count(*) >= 3) a), '{}'::jsonb)
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

-- ============ Plumbline Teams: the leader can release the team map to the team (26 Oct 2026) ============
-- After meeting with the staff, the leader can let everyone on the team see the team map from their own report.
-- Teammates see combined results, team health averages, and how each person is wired (no one's personal scores).
create table if not exists public.team_releases (network_id uuid not null references public.networks(id) on delete cascade, team_id text not null, released_at timestamptz not null default now(), primary key (network_id, team_id));
alter table public.team_releases enable row level security;
create or replace function public.pl_team_release(p_network uuid, p_team text, p_on boolean) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.pl_is_member(p_network) then raise exception 'Not on this team'; end if;
  if coalesce(p_on, false) then insert into public.team_releases(network_id, team_id) values (p_network, left(p_team, 40)) on conflict do nothing;
  else delete from public.team_releases where network_id = p_network and team_id = p_team; end if;
  return coalesce(p_on, false);
end $$;
revoke all on function public.pl_team_release(uuid, text, boolean) from public, anon;
grant execute on function public.pl_team_release(uuid, text, boolean) to authenticated;

create or replace function public.pl_team_map(p_network uuid, p_team text) returns jsonb language sql stable security definer set search_path = public as $$
  with team as (
    select c.id as case_id, c.planter_name, c.settings->>'audience' as audience, p.status, p.shared, p.team_summary s
    from public.cases c join public.participants p on p.case_id = c.id and p.role = 'planter'
    where c.network_id = p_network and public.pl_is_member(p_network) and not c.archived
      and c.settings->>'purpose' = 'team' and c.settings->'team'->>'id' = p_team
  ), done as (select * from team where status = 'finished' and s is not null),
  ok as (select count(*) >= 3 as yes from done)
  select case when not public.pl_is_member(p_network) then null else jsonb_build_object(
    'released', exists (select 1 from public.team_releases r where r.network_id = p_network and r.team_id = p_team),
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

create or replace function public.pl_team_map_for(p_network uuid, p_team text) returns jsonb language sql stable security definer set search_path = public as $$
  with team as (
    select c.id as case_id, c.planter_name, c.settings->>'audience' as audience, p.status, p.shared, p.team_summary s
    from public.cases c join public.participants p on p.case_id = c.id and p.role = 'planter'
    where c.network_id = p_network and not c.archived
      and c.settings->>'purpose' = 'team' and c.settings->'team'->>'id' = p_team
  ), done as (select * from team where status = 'finished' and s is not null),
  ok as (select count(*) >= 3 as yes from done)
  select jsonb_build_object(
    'total', (select count(*) from team),
    'finished', (select count(*) from team where status = 'finished'),
    'counted', (select count(*) from done),
    -- Teammates see how each person is wired and their top gifts, never personal scores
    'shared', coalesce((select jsonb_agg(jsonb_build_object('caseId', case_id, 'name', planter_name, 'summary', jsonb_build_object('wiring', s->'wiring', 'giftsTop', s->'giftsTop')) order by planter_name) from done where shared), '[]'::jsonb),
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
      -- "Our team" (25 Oct 2026): how the team works together. Averages and counts only, never one person's view.
      'teamN', (select count(*) from done where jsonb_typeof(s->'team') = 'object' and s->'team' <> '{}'::jsonb),
      'team', (select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from (select k, round(avg(v::numeric)) a from done, jsonb_each_text(s->'team') e(k, v) group by k) t),
      'teamLow', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select k, count(*) filter (where v::numeric < 50) n from done, jsonb_each_text(s->'team') e(k, v) group by k) t)
    ) end
  )
$$;
revoke all on function public.pl_team_map_for(uuid, text) from public, anon, authenticated;

-- A team member, with their private report key: the team map, only once the leader released it
create or replace function public.pl_team_map_member(p_key text) returns jsonb language sql stable security definer set search_path = public as $$
  select case when r.team_id is null then null else public.pl_team_map_for(c.network_id, c.settings->'team'->>'id') || jsonb_build_object('teamName', c.settings->'team'->>'name', 'audience', c.settings->>'audience', 'faith', coalesce((c.settings->>'faith')::boolean, true)) end
  from public.participants p join public.cases c on c.id = p.case_id
  left join public.team_releases r on r.network_id = c.network_id and r.team_id = c.settings->'team'->>'id'
  where p.id = public.pl_key_person(p_key)
$$;
revoke all on function public.pl_team_map_member(text) from public, anon, authenticated;
grant execute on function public.pl_team_map_member(text) to anon, authenticated;

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

-- ============ Plumbline Teams -> Stoa staff profiles (27 Oct 2026) ============
-- A church that uses Stoa can show each staff member's "how they're wired" card on their Stoa profile.
-- Only a short summary leaves Plumbline: wiring leans, top gifts and strengths from the calling, character,
-- leadership, mission and capacity areas. Health, marriage and family scores, answers, references,
-- teammate ratings and the full report never leave. A card is marked released only when the leader has
-- released the team map AND the person chose to share; otherwise Stoa hides it.
create table if not exists public.pl_stoa_links (
  network_id uuid primary key references public.networks(id) on delete cascade,
  church_slug text not null check (church_slug ~ '^[a-z0-9-]{2,60}$'),
  stoa_url text not null check (stoa_url ~ '^https://[a-z0-9.-]+/functions/v1/plumbline-sync$'),
  created_at timestamptz not null default now()
);
alter table public.pl_stoa_links enable row level security;  -- no policies: service role only
revoke all on public.pl_stoa_links from anon, authenticated;

create or replace function public.pl_stoa_cards(p_network uuid) returns jsonb language sql stable security definer set search_path = public as $$
  with wl(id, l, r, label) as (values ('pace','Steady','Driving','Pace'), ('people','Reflective','Social','People'),
         ('drive','Collaborative','Independent','Drive'), ('structure','Flexible','Precise','Structure'), ('decide','Intuitive','Analytical','Decisions')),
  gifts(id, name) as (values ('administration','Administration'),('apostleship','Apostleship'),('craftsmanship','Craftsmanship'),('discernment','Discernment'),
         ('evangelism','Evangelism'),('exhortation','Exhortation'),('faith','Faith'),('giving','Giving'),('healing','Healing'),('helps','Helps'),
         ('hospitality','Hospitality'),('intercession','Intercession'),('interpretation','Interpretation'),('knowledge','Knowledge'),('leadership','Leadership'),
         ('mercy','Mercy'),('miracles','Miracles'),('prophecy','Prophecy'),('shepherding','Shepherding'),('teaching','Teaching'),('tongues','Tongues'),('wisdom','Wisdom')),
  -- strengths only from these areas; health and family areas are never sent
  ok_strengths(id, name) as (values ('call','Clarity of Call'),('devotion','Walk with God'),('faith','Faith that Steps Out'),('integrity','Integrity'),
         ('humility','Teachability'),('control','Self-Control'),('vision','Vision Casting'),('team','Building Teams'),('develop','Developing Leaders'),
         ('conflict','Healthy Conflict'),('unchurched','Among the Unchurched'),('evangelism','Personal Evangelism'),('disciple','Making Disciples'),
         ('context','Reading the Community'),('drive','Self-Starter'),('adapt','Adaptability'),('money','Money & Fundraising'),
         ('comms','Communicating God''s Word'),('expect','Realistic Expectations'),('systems','Systems & Follow-Through')),
  people as (
    select p.email, p.shared, p.team_summary s, c.settings->'team'->>'id' as team_id
    from public.cases c join public.participants p on p.case_id = c.id and p.role = 'planter'
    where c.network_id = p_network and not c.archived and c.settings->>'purpose' = 'team'
      and p.status = 'finished' and p.team_summary is not null and p.email is not null
  ), cards as (
    select pp.email,
      exists (select 1 from public.team_releases r where r.network_id = p_network and r.team_id = pp.team_id) and pp.shared as released,
      (select coalesce(jsonb_agg(jsonb_build_object('label', wl.label,
          'value', case when v::numeric <= 35 then wl.l when v::numeric >= 65 then wl.r else 'Balanced' end) order by wl.id), '[]'::jsonb)
         from jsonb_each_text(pp.s->'wiring') e(k, v) join wl on wl.id = e.k) as wiring,
      (select coalesce(array_agg(g.name), '{}') from jsonb_array_elements_text(pp.s->'giftsTop') with ordinality x(id, n) join gifts g on g.id = x.id) as gifts,
      (select coalesce(array_agg(o.name), '{}') from (select o.name from jsonb_array_elements_text(pp.s->'strengths') with ordinality x(id, n)
         join ok_strengths o on o.id = x.id order by x.n limit 3) o) as strengths
    from people pp
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'church_slug', l.church_slug, 'email', lower(cards.email), 'released', cards.released,
      'headline', left(case when cardinality(cards.gifts) > 0 then 'Gifted in ' || array_to_string(cards.gifts[1:2], ' and ') else 'How I''m wired' end, 80),
      'strengths', to_jsonb((cards.gifts[1:2] || cards.strengths)[1:5]),
      'wiring', cards.wiring)), '[]'::jsonb)
  from cards join public.pl_stoa_links l on l.network_id = p_network
$$;
revoke all on function public.pl_stoa_cards(uuid) from public, anon, authenticated;
grant execute on function public.pl_stoa_cards(uuid) to service_role;

-- ============ The planter names their own references (owner, 28 Oct 2026) ============
-- From their own link, the planter (or hiring candidate) adds 3 to 5 references: name, email, how they know them
-- (boss, mentor, friend…) and one line of context for the leader. Plumbline emails each one. Leaders can still add references too.
-- The planter sees only names, how they know them and whether each has finished; never a reference's answers.
alter table public.participants add column if not exists added_by text check (added_by in ('planter', 'leader'));
alter table public.participants add column if not exists ref_relationship text;  -- how the planter says they know this person
alter table public.participants add column if not exists ref_context text;       -- the planter's one line for the leader

-- The assessment behind a planter's own link (planting or hiring, never Teams), or null.
create or replace function public.pl_planter_case(p_token text) returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.participants p join public.cases c on c.id = p.case_id
  where p.token = p_token and p.role = 'planter' and not c.archived and coalesce(c.settings->>'purpose', 'decide') <> 'team'
$$;
revoke all on function public.pl_planter_case(text) from public, anon, authenticated;

create or replace function public.pl_my_refs(p_token text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'name', r.name, 'relationship', coalesce(r.ref_relationship, r.relationship), 'context', r.ref_context,
    'status', r.status, 'mine', coalesce(r.added_by = 'planter', false),
    'email', case when r.added_by = 'planter' then r.email end,   -- only addresses the planter typed in
    'invited', r.invited_at is not null) order by r.created_at), '[]'::jsonb)
  from public.participants r where r.case_id = public.pl_planter_case(p_token) and r.role = 'reference'
$$;

create or replace function public.pl_add_my_ref(p_token text, p_name text, p_email text, p_relationship text, p_context text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid := public.pl_planter_case(p_token); nm text := btrim(coalesce(p_name, '')); em text := lower(btrim(coalesce(p_email, ''))); rid uuid;
begin
  if cid is null then raise exception 'This link can''t add references' using errcode = 'P0001'; end if;
  if nm = '' then raise exception 'Add their name' using errcode = 'P0001'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'Check their email address' using errcode = 'P0001'; end if;
  if (select count(*) from public.participants where case_id = cid and role = 'reference') >= 8 then
    raise exception 'You''ve added 8 references, which is the most we ask for' using errcode = 'P0001'; end if;
  if exists (select 1 from public.participants where case_id = cid and lower(email) = em) then
    raise exception 'That email is already on this assessment' using errcode = 'P0001'; end if;
  insert into public.participants(case_id, role, name, email, added_by, ref_relationship, ref_context)
  values (cid, 'reference', left(nm, 120), left(em, 254), 'planter', nullif(left(btrim(coalesce(p_relationship, '')), 60), ''), nullif(left(btrim(coalesce(p_context, '')), 280), ''))
  returning id into rid;
  return rid;
end $$;

-- The planter can take back someone they added, until that person starts.
create or replace function public.pl_remove_my_ref(p_token text, p_id uuid) returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from public.participants where id = p_id and case_id = public.pl_planter_case(p_token) and role = 'reference' and added_by = 'planter' and status = 'invited';
  return found;
end $$;

-- For the email function only (service role): the invite for a reference the planter just added, stamped once a day at most.
-- Comes from the network leader who set up the assessment, and replies go to them, never to the planter (owner, 28 Oct 2026: references answer more honestly).
create or replace function public.pl_my_ref_email(p_token text, p_id uuid) returns table(
  id uuid, email text, name text, role text, token text, planter_name text, spouse_name text, network_name text, sender_name text, sender_email text)
language plpgsql security definer set search_path = public as $$
declare cid uuid := public.pl_planter_case(p_token); nid uuid;
begin
  if cid is null then return; end if;
  select c.network_id into nid from public.cases c where c.id = cid;
  if (select count(*) from public.email_log l where l.network_id = nid and l.at > now() - interval '1 day') >= 300 then return; end if;
  return query
  with stamped as (
    update public.participants p set invited_at = now()
    where p.id = p_id and p.case_id = cid and p.role = 'reference' and p.added_by = 'planter' and p.email is not null and p.status <> 'finished'
      and (p.invited_at is null or p.invited_at < now() - interval '1 day')
    returning p.*
  ), logged as (insert into public.email_log(network_id, kind) select nid, 'invite' from stamped returning 1)
  select s.id, s.email, s.name, s.role, s.token, c.planter_name, c.spouse_name, c.settings->>'networkName',
         coalesce(m.name, split_part(m.email, '@', 1)), m.email
  from stamped s join public.cases c on c.id = s.case_id
  left join public.network_members m on m.network_id = c.network_id and m.user_id = c.created_by;
end $$;
revoke all on function public.pl_my_ref_email(text, uuid) from public, anon, authenticated;
grant execute on function public.pl_my_ref_email(text, uuid) to service_role;

revoke all on function public.pl_my_refs(text), public.pl_add_my_ref(text, text, text, text, text), public.pl_remove_my_ref(text, uuid) from public;
grant execute on function public.pl_my_refs(text), public.pl_add_my_ref(text, text, text, text, text), public.pl_remove_my_ref(text, uuid) to anon, authenticated;

-- ============ Who's planting: husband or wife (owner, 28 Oct 2026) ============
-- So the planter and spouse screens say "his" and "her" correctly. Saved as cases.settings.planterIs; older couples
-- default to "husband". Only the header the person's link already receives gains this one field.
create or replace function public.pl_case_header(c public.cases) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('id', c.id, 'planterName', c.planter_name, 'spouseName', c.spouse_name, 'married', c.married,
    'city', c.city, 'network', c.settings->>'networkName', 'logoUrl', c.settings->>'logoUrl',
    'signGifts', coalesce((c.settings->>'signGifts')::boolean, true),
    'beliefs', coalesce(c.settings->'beliefs', '[]'::jsonb), 'questions', coalesce(c.settings->'questions', '[]'::jsonb),
    'bankVersion', c.settings->>'bankVersion', 'released', c.reports_released,
    'audience', coalesce(c.settings->>'audience', 'planting'), 'faith', coalesce((c.settings->>'faith')::boolean, true), 'role', c.settings->>'role',
    'purpose', coalesce(c.settings->>'purpose', 'decide'), 'team', c.settings->'team',
    'leaderSees', coalesce((c.settings->>'leaderSees')::boolean, false),
    'planterIs', case when c.settings->>'planterIs' = 'wife' then 'wife' else 'husband' end)
$$;

-- ============ "Your report is ready" email when a leader releases reports (owner, 28 Oct 2026) ============
-- Called by the email function as the signed-in leader. Only network members, only a released planting/hiring case,
-- only once per case (stamped in cases.settings.releaseEmailedAt), only the planter and spouse who finished and have an email.
create or replace function public.pl_release_email(p_case uuid) returns table(
  email text, name text, role text, token text, planter_name text, spouse_name text, network_name text, sender_name text, sender_email text, audience text, job_role text)
language plpgsql security definer set search_path = public as $$
declare c public.cases;
begin
  select * into c from public.cases where id = p_case;
  if c.id is null or not public.pl_is_member(c.network_id) then raise exception 'Not allowed'; end if;
  if not c.reports_released or c.archived or coalesce(c.settings->>'purpose', 'decide') = 'team' or c.settings ? 'releaseEmailedAt' then return; end if;
  if (select count(*) from public.email_log l where l.network_id = c.network_id and l.at > now() - interval '1 day') >= 300 then
    raise exception 'Your network has sent its 300 emails for today. Try again tomorrow.'; end if;
  update public.cases set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('releaseEmailedAt', now()) where id = c.id;
  insert into public.email_log(network_id, kind)
    select c.network_id, 'released' from public.participants p
    where p.case_id = c.id and p.role in ('planter', 'spouse') and p.status = 'finished' and p.email is not null;
  return query
  select p.email, p.name, p.role, p.token, c.planter_name, c.spouse_name, c.settings->>'networkName',
         coalesce(m.name, split_part(m.email, '@', 1)), m.email,
         coalesce(c.settings->>'audience', 'planting'), coalesce(c.settings->>'role', '')
  from public.participants p
  left join public.network_members m on m.network_id = c.network_id and m.user_id = auth.uid()
  where p.case_id = c.id and p.role in ('planter', 'spouse') and p.status = 'finished' and p.email is not null;
end $$;
revoke all on function public.pl_release_email(uuid) from public, anon;
grant execute on function public.pl_release_email(uuid) to authenticated;
