-- Plumbline update 4, 24 Oct 2026: Plumbline Teams yearly plans. Safe to run more than once.

-- ============ Plumbline Teams yearly plans (24 Oct 2026) ============
-- Starter (up to 8 people) $249, Team (up to 15) $499, Staff (up to 50) $1,299 a year; past 50, $25 a person a year.
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
