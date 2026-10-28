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
-- Replies go to the planter, since they asked this person.
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
         c.planter_name, me.email
  from stamped s join public.cases c on c.id = s.case_id
  left join public.participants me on me.case_id = c.id and me.role = 'planter';
end $$;
revoke all on function public.pl_my_ref_email(text, uuid) from public, anon, authenticated;
grant execute on function public.pl_my_ref_email(text, uuid) to service_role;

revoke all on function public.pl_my_refs(text), public.pl_add_my_ref(text, text, text, text, text), public.pl_remove_my_ref(text, uuid) from public;
grant execute on function public.pl_my_refs(text), public.pl_add_my_ref(text, text, text, text, text), public.pl_remove_my_ref(text, uuid) to anon, authenticated;
