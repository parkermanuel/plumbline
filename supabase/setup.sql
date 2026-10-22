-- Plumbline database setup. Paste this whole file into Supabase > SQL Editor > New query, then Run.
-- Safe to run more than once.

-- Random link keys: two random UUIDs joined (about 244 bits), no extension needed.
create or replace function public.pl_new_token() returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

-- Network leaders (one row per signed-in leader)
create table if not exists public.leaders (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  network text,
  created_at timestamptz not null default now()
);

-- One assessment = one planter (and spouse) plus references
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid not null references auth.users(id) on delete cascade,
  planter_name text not null,
  spouse_name text,
  married boolean not null default true,
  city text,
  network_name text,
  sign_gifts boolean not null default true,
  ref_token text not null unique default public.pl_new_token(),
  reports_released boolean not null default false,
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  archived boolean not null default false
);

-- Each person who answers: planter, spouse, or a reference
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  role text not null check (role in ('planter', 'spouse', 'reference')),
  token text not null unique default public.pl_new_token(),
  name text,
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
  updated_at timestamptz not null default now()
);
create index if not exists participants_case_idx on public.participants(case_id);

-- Row-level security: leaders see only their own cases and people. Participants never read tables directly.
alter table public.leaders enable row level security;
alter table public.cases enable row level security;
alter table public.participants enable row level security;

drop policy if exists "leader self" on public.leaders;
create policy "leader self" on public.leaders for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "leader cases" on public.cases;
create policy "leader cases" on public.cases for all to authenticated using (leader_id = auth.uid()) with check (leader_id = auth.uid());

drop policy if exists "leader participants" on public.participants;
create policy "leader participants" on public.participants for all to authenticated
  using (exists (select 1 from public.cases c where c.id = case_id and c.leader_id = auth.uid()))
  with check (exists (select 1 from public.cases c where c.id = case_id and c.leader_id = auth.uid()));

-- Create the planter (and spouse) rows automatically with each new case
create or replace function public.case_people() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.participants(case_id, role, name) values (new.id, 'planter', new.planter_name);
  if new.married then
    insert into public.participants(case_id, role, name) values (new.id, 'spouse', new.spouse_name);
  end if;
  return new;
end $$;
drop trigger if exists case_people on public.cases;
create trigger case_people after insert on public.cases for each row execute function public.case_people();

-- ---------- What a person's link can do (no login needed; the link is the key) ----------

-- Open a link: returns this person's saved answers and the case details they need
create or replace function public.pl_open(p_token text) returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'participant', jsonb_build_object('id', p.id, 'role', p.role, 'name', p.name, 'relationship', p.relationship, 'status', p.status,
                                      'step', p.step, 'progress', p.progress, 'answers', p.answers),
    'case', jsonb_build_object('id', c.id, 'planterName', c.planter_name, 'spouseName', c.spouse_name, 'married', c.married,
                               'city', c.city, 'network', c.network_name, 'signGifts', c.sign_gifts, 'released', c.reports_released))
  from public.participants p join public.cases c on c.id = p.case_id
  where p.token = p_token and not c.archived;
$$;

-- Save after every answer
create or replace function public.pl_save(p_token text, p_answers jsonb, p_step int, p_total int, p_chapter text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.participants set
    answers = p_answers, step = greatest(0, p_step), total = greatest(0, p_total),
    progress = case when p_total > 0 then least(99, (100 * p_step / p_total)) else 0 end,
    chapter = left(p_chapter, 60),
    status = 'started', started_at = coalesce(started_at, now()), updated_at = now(),
    name = coalesce(nullif(p_answers #>> '{meta,name}', ''), name),
    relationship = coalesce(nullif(p_answers #>> '{meta,relationship}', ''), relationship),
    consented_at = coalesce(consented_at, case when p_answers #>> '{meta,consentedAt}' is not null then now() end)
  where token = p_token and status <> 'finished';
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- Finish and seal
create or replace function public.pl_finish(p_token text, p_answers jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.participants set answers = p_answers, status = 'finished', progress = 100, step = total,
    finished_at = now(), updated_at = now(),
    name = coalesce(nullif(p_answers #>> '{meta,name}', ''), name)
  where token = p_token and status <> 'finished';
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- A reference opens the shared reference link: creates their own row and returns their personal link
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

create or replace function public.pl_ref_case(p_ref_token text) returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('planterName', planter_name, 'spouseName', spouse_name, 'married', married, 'network', network_name, 'signGifts', sign_gifts)
  from public.cases where ref_token = p_ref_token and not archived;
$$;

-- A planter or spouse reads their own report once the leader releases it.
-- They get their own answers back. From their spouse they get only summaries: the average of each
-- wiring dimension and of each couple area. Never item-level answers, the private note, safety answers,
-- how the spouse rated them, or anything from references.
create or replace function public.pl_couple_items() returns table(item text, area text, rev boolean) language sql immutable as $$
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
      select e.key as k, round(avg(x::numeric), 2) as m
      from jsonb_each(coalesce(a->'wiring', '{}'::jsonb)) e, jsonb_array_elements_text(e.value) x
      where x ~ '^[1-5]$' group by e.key) t
  ), healthy as (
    select i.item, i.area, i.rev,
      case when i.rev then 6 - (a->'couple'->>i.item)::numeric else (a->'couple'->>i.item)::numeric end as v
    from public.pl_couple_items() i where (a->'couple'->>i.item) ~ '^[1-5]$'
  ), area_mean as (select area, avg(v) m from healthy group by area),
  c as (
    select coalesce(jsonb_object_agg(i.item, round(case when i.rev then 6 - am.m else am.m end, 2)), '{}'::jsonb) as couple
    from public.pl_couple_items() i join area_mean am on am.area = i.area
  )
  select jsonb_build_object('wiring', w.wiring, 'couple', c.couple, 'meta', jsonb_build_object('name', a#>>'{meta,name}')) from w, c;
$$;

create or replace function public.pl_report(p_token text) returns jsonb language sql security definer set search_path = public stable as $$
  with me as (
    select p.*, c.reports_released, c.married, c.planter_name, c.spouse_name, c.sign_gifts, c.network_name, c.city
    from public.participants p join public.cases c on c.id = p.case_id
    where p.token = p_token and p.role in ('planter', 'spouse') and p.status = 'finished'
  )
  select case when not me.reports_released then jsonb_build_object('released', false) else jsonb_build_object(
    'released', true,
    'case', jsonb_build_object('id', me.case_id, 'planterName', me.planter_name, 'spouseName', me.spouse_name, 'married', me.married,
                               'network', me.network_name, 'city', me.city, 'signGifts', me.sign_gifts),
    'role', me.role,
    'me', me.answers - 'privateNote' - 'safety',
    'other', (select public.pl_summary(o.answers) from public.participants o
              where o.case_id = me.case_id and o.role <> me.role and o.role in ('planter', 'spouse') and o.status = 'finished')
  ) end
  from me;
$$;

revoke all on function public.pl_open(text), public.pl_save(text, jsonb, int, int, text), public.pl_finish(text, jsonb),
  public.pl_join_reference(text, text), public.pl_ref_case(text), public.pl_report(text) from public;
grant execute on function public.pl_open(text), public.pl_save(text, jsonb, int, int, text), public.pl_finish(text, jsonb),
  public.pl_join_reference(text, text), public.pl_ref_case(text), public.pl_report(text) to anon, authenticated;

-- Live progress bars on the leader dashboard
do $$ begin
  alter publication supabase_realtime add table public.participants;
exception when duplicate_object then null; when undefined_object then null; end $$;
