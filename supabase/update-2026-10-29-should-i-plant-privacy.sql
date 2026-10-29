-- ============ Should I Plant? step 2: his wife and references, privately (owner, 28 Oct 2026) ============
-- He owns his personal network, so ordinary leader rules would let him read his wife's and his references' answers.
-- On a "self" case he reads only his own row. He sees his wife's and references' progress through pl_self_people,
-- and the references only as averages, once at least 3 have finished (pl_self_ref_averages). Written comments never.
create or replace function public.pl_case_is_self(p_case uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select settings->>'purpose' = 'self' from public.cases where id = p_case), false)
$$;
revoke all on function public.pl_case_is_self(uuid) from public, anon;
grant execute on function public.pl_case_is_self(uuid) to authenticated;

drop policy if exists "members read people" on public.participants;
create policy "members read people" on public.participants for select to authenticated
  using (public.pl_is_member(public.pl_case_network(case_id)) and not public.pl_case_is_team(case_id)
         and not (public.pl_case_is_self(case_id) and role <> 'planter'));
drop policy if exists "members edit people" on public.participants;
create policy "members edit people" on public.participants for update to authenticated
  using (public.pl_is_member(public.pl_case_network(case_id)) and not public.pl_case_is_team(case_id)
         and not (public.pl_case_is_self(case_id) and role <> 'planter'))
  with check (public.pl_is_member(public.pl_case_network(case_id)) and not public.pl_case_is_team(case_id)
         and not (public.pl_case_is_self(case_id) and role <> 'planter'));

-- Files uploaded from other assessments: on a self case only his own are his to open
create or replace function public.pl_result_team(p_name text, p_admin boolean) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.participants p join public.cases c on c.id = p.case_id
    where p.token = split_part(p_name, '/', 1) and case when p_admin then public.pl_is_admin(c.network_id) else public.pl_is_member(c.network_id) end
      and case coalesce(c.settings->>'purpose', 'decide')
            when 'team' then p.shared
            when 'self' then p.role = 'planter'
            else true end)
$$;

-- Who's taking part on his self case: names, roles and progress only
create or replace function public.pl_self_people(p_case uuid) returns table(id uuid, role text, name text, has_email boolean, status text, progress int, invited_at timestamptz, ref_relationship text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.pl_case_is_self(p_case) and public.pl_is_member(public.pl_case_network(p_case))) then raise exception 'Not allowed'; end if;
  return query select p.id, p.role, p.name, p.email is not null, p.status, p.progress, p.invited_at, p.ref_relationship
    from public.participants p where p.case_id = p_case order by array_position(array['planter','spouse','reference'], p.role), p.created_at;
end $$;
revoke all on function public.pl_self_people(uuid) from public, anon;
grant execute on function public.pl_self_people(uuid) to authenticated;

-- Invite his wife: set her name and email (her answers stay hers; she gets her own report at her own link)
create or replace function public.pl_self_spouse(p_case uuid, p_name text, p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; em text := lower(btrim(coalesce(p_email, '')));
begin
  if not (public.pl_case_is_self(p_case) and public.pl_is_member(public.pl_case_network(p_case))) then raise exception 'Not allowed'; end if;
  if em !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Check her email address' using errcode = 'P0001'; end if;
  update public.participants set email = em, name = coalesce(nullif(left(btrim(coalesce(p_name, '')), 120), ''), name)
    where case_id = p_case and role = 'spouse' and status <> 'finished' returning id into sid;
  if sid is null then raise exception 'There''s no wife on this assessment, or she has already finished' using errcode = 'P0001'; end if;
  return sid;
end $$;
revoke all on function public.pl_self_spouse(uuid, text, text) from public, anon;
grant execute on function public.pl_self_spouse(uuid, text, text) to authenticated;

-- What his references saw, as averages only: each rated item's mean (1 to 5) and how many rated it, the launch-team
-- question's mean, and how many said each readiness answer. Nothing until at least 3 have finished, no item rated by
-- fewer than 3, and never their words.
create or replace function public.pl_self_ref_averages(p_case uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n int; items jsonb; follow numeric; ready jsonb;
begin
  if not (public.pl_case_is_self(p_case) and public.pl_is_member(public.pl_case_network(p_case))) then raise exception 'Not allowed'; end if;
  select count(*) into n from public.participants where case_id = p_case and role = 'reference' and status = 'finished';
  if n < 3 then return jsonb_build_object('n', n, 'ready', false); end if;
  select coalesce(jsonb_object_agg(k, jsonb_build_object('avg', round(a, 2), 'n', c)), '{}'::jsonb) into items from (
    select e.key as k, avg(e.value::text::numeric) as a, count(*) as c
    from public.participants p, jsonb_each(coalesce(p.answers->'items', '{}'::jsonb)) e
    where p.case_id = p_case and p.role = 'reference' and p.status = 'finished'
      and jsonb_typeof(e.value) = 'number' and e.value::text::numeric between 1 and 5
    group by e.key having count(*) >= 3) t;  -- an item fewer than 3 people rated stays hidden, so no one rating shows
  select round(avg((p.answers->>'follow')::numeric), 2) into follow from public.participants p
    where p.case_id = p_case and p.role = 'reference' and p.status = 'finished' and (p.answers->>'follow') ~ '^[1-5]$';
  select coalesce(jsonb_object_agg(r, c), '{}'::jsonb) into ready from (
    select p.answers->>'ready' as r, count(*) as c from public.participants p
    where p.case_id = p_case and p.role = 'reference' and p.status = 'finished' and (p.answers->>'ready') ~ '^[0-3]$' group by 1) t;
  return jsonb_build_object('n', n, 'ready', true, 'items', items, 'follow', follow, 'readiness', ready);
end $$;
revoke all on function public.pl_self_ref_averages(uuid) from public, anon;
grant execute on function public.pl_self_ref_averages(uuid) to authenticated;
