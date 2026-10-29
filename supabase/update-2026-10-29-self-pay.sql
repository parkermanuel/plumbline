-- Plumbline update, 29 Oct 2026: paying for Should I plant? and personal development. Safe to run more than once.

-- ============ Paying for Should I plant? and personal development (owner, 29 Oct 2026) ============
-- After the free beta (through 31 Dec 2026): Should I plant? is $49 for him alone, or $99 with his wife and references;
-- someone on $49 can add his wife and references later for $50. Personal development is $29. Founders (joined during the
-- beta) get a third off through 2027, set in the payment function. One purchase starts one assessment.
-- Anything started during the beta keeps everything it had (wife and references included).
alter table public.networks add column if not exists self_plan text;
alter table public.networks drop constraint if exists networks_self_plan_check;
alter table public.networks add constraint networks_self_plan_check check (self_plan is null or self_plan in ('solo', 'full', 'personal'));
alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('couples', 'plan', 'renewal', 'grant', 'teams', 'teams_renewal', 'self_solo', 'self_full', 'self_upgrade', 'personal'));

-- Only the payment function sets self_plan (owners can update only name, logo and settings).

-- Does this Should I plant? case include his wife and references?
create or replace function public.pl_self_full(p_case uuid) returns boolean language sql stable security definer set search_path = public as $$
  -- A case started after the beta carries what was bought (settings.paid); one started during the beta has none and keeps everything
  select public.pl_in_beta() or exists (select 1 from public.cases c join public.networks n on n.id = c.network_id
    where c.id = p_case and (c.settings->>'paid' is null or n.self_plan = 'full'))
$$;
revoke all on function public.pl_self_full(uuid) from public, anon;
grant execute on function public.pl_self_full(uuid) to authenticated;

create or replace function public.pl_case_credit() returns trigger language plpgsql security definer set search_path = public as $$
declare n public.networks;
begin
  -- Free beta through 31 Dec 2026: no credit used, no plan needed
  if public.pl_in_beta() then return new; end if;
  select * into n from public.networks where id = new.network_id for update;
  -- Should I plant?: paid for once ($49 or $99), one assessment per purchase
  if new.settings->>'purpose' = 'self' then
    if n.self_plan is null or n.self_plan not in ('solo', 'full') then
      raise exception 'Choose Just me ($49) or With my wife and references ($99) to begin.' using errcode = 'P0001'; end if;
    if exists (select 1 from public.cases where network_id = n.id and settings->>'purpose' = 'self') then
      raise exception 'You already have a Should I plant? assessment. Open it from your Should I plant? page.' using errcode = 'P0001'; end if;
    new.settings := coalesce(new.settings, '{}'::jsonb) || jsonb_build_object('paid', n.self_plan);
    return new;
  end if;
  -- Personal development: paid for once ($29), one assessment per purchase
  if new.settings->>'purpose' = 'team' and (coalesce(n.settings->>'personal', '') = 'true' or coalesce(new.settings->'team'->>'id', '') like 'me\_%') then
    if n.self_plan is distinct from 'personal' then
      raise exception 'Personal development is $29. Pay to begin.' using errcode = 'P0001'; end if;
    if exists (select 1 from public.cases where network_id = n.id and settings->>'purpose' = 'team') then
      raise exception 'You already have a personal development assessment. Open it from your Personal page.' using errcode = 'P0001'; end if;
    new.settings := coalesce(new.settings, '{}'::jsonb) || jsonb_build_object('paid', 'personal');
    return new;
  end if;
  if n.plan_until is not null and n.plan_until > now() then return new; end if;
  -- A Teams plan covers team members up to its size
  if new.settings->>'purpose' = 'team' and n.team_until is not null and n.team_until > now()
     and public.pl_team_seats_used(n.id) < n.team_seats then return new; end if;
  if coalesce(n.credits, 0) < 1 then raise exception 'No assessments left. Buy more at joinplumbline.com.' using errcode = 'P0001'; end if;
  update public.networks set credits = credits - 1 where id = new.network_id;
  return new;
end $$;

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
  elsif p_kind = 'self_solo' then update public.networks set self_plan = coalesce(self_plan, 'solo') where id = net;
  elsif p_kind in ('self_full', 'self_upgrade') then update public.networks set self_plan = 'full' where id = net;
  elsif p_kind = 'personal' then update public.networks set self_plan = 'personal' where id = net;
  end if;
  if p_customer is not null then update public.networks set stripe_customer = p_customer where id = net and stripe_customer is null; end if;
  return true;
end $$;
revoke all on function public.pl_record_payment(text, uuid, text, int, int, text, text, text, text) from public, anon, authenticated;
grant execute on function public.pl_record_payment(text, uuid, text, int, int, text, text, text, text) to service_role;

-- His wife and references come with $99 (or the $50 upgrade)
create or replace function public.pl_self_spouse(p_case uuid, p_name text, p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; em text := lower(btrim(coalesce(p_email, '')));
begin
  if not (public.pl_case_is_self(p_case) and public.pl_is_member(public.pl_case_network(p_case))) then raise exception 'Not allowed'; end if;
  if not public.pl_self_full(p_case) then raise exception 'Adding your wife and references is $50 more.' using errcode = 'P0001'; end if;
  if em !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Check her email address' using errcode = 'P0001'; end if;
  update public.participants set email = em, name = coalesce(nullif(left(btrim(coalesce(p_name, '')), 120), ''), name)
    where case_id = p_case and role = 'spouse' and status <> 'finished' returning id into sid;
  if sid is null then raise exception 'There''s no wife on this assessment, or she has already finished' using errcode = 'P0001'; end if;
  return sid;
end $$;
revoke all on function public.pl_self_spouse(uuid, text, text) from public, anon;
grant execute on function public.pl_self_spouse(uuid, text, text) to authenticated;

create or replace function public.pl_add_my_ref(p_token text, p_name text, p_email text, p_relationship text, p_context text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid := public.pl_planter_case(p_token); nm text := btrim(coalesce(p_name, '')); em text := lower(btrim(coalesce(p_email, ''))); rid uuid;
begin
  if cid is null then raise exception 'This link can''t add references' using errcode = 'P0001'; end if;
  if public.pl_case_is_self(cid) and not public.pl_self_full(cid) then raise exception 'Adding your wife and references is $50 more.' using errcode = 'P0001'; end if;
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
revoke all on function public.pl_add_my_ref(text, text, text, text, text) from public;
grant execute on function public.pl_add_my_ref(text, text, text, text, text) to anon, authenticated;
