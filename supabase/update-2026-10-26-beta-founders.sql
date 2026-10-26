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
-- A founder: set up before launch (or marked founding by the platform admin), during 2027.
create or replace function public.pl_is_founder(p_network uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.networks n where n.id = p_network
    and (n.founding or (n.created_at at time zone 'America/Denver')::date < date '2027-01-05'))
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
