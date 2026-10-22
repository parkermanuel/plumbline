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
                  || jsonb_strip_nulls(jsonb_build_object(  -- the only two choices made when creating an assessment
                       'signGifts', case when jsonb_typeof(new.settings->'signGifts') = 'boolean' then new.settings->'signGifts' end,
                       'bankVersion', case when jsonb_typeof(new.settings->'bankVersion') = 'string' then to_jsonb(left(new.settings->>'bankVersion', 20)) end));
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
    'bankVersion', c.settings->>'bankVersion', 'released', c.reports_released)
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
                               'signGifts', coalesce((me.settings->>'signGifts')::boolean, true)),
    'role', me.role,
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

-- ============ Platform overview (counts only) ============
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
       select jsonb_build_object('name', n.name, 'assessments', count(c.id), 'members', (select count(*) from public.network_members m where m.network_id = n.id), 'created', n.created_at::date) x
       from public.networks n left join public.cases c on c.network_id = n.id and not c.archived group by n.id) t));
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
  public.interview_scores, public.platform_admins, public.email_log from anon, authenticated;
grant select on public.networks, public.network_members, public.network_invites, public.cases, public.participants, public.interview_scores to authenticated;
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
  public.pl_rotate_ref(uuid) to authenticated;
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
