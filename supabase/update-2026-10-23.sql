-- Plumbline update, 23 Oct 2026: payments ($99 per couple, $79 founding, $2,500 a year), discount codes, delete-my-account,
-- the Platform page's credits and founding switch, and the audience choice (church planting, church staff, nonprofit, business).
-- Safe to run more than once.

-- ============ Payments ============
-- Each assessment (one couple and their references) uses one credit, unless the network has a yearly plan.
-- Credits arrive only from Stripe (the plumbline-stripe function, using the service key) or from the platform admin.
alter table public.networks add column if not exists credits int not null default 0 check (credits >= 0);
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

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
revoke all on function public.pl_case_credit(), public.pl_record_payment(text, uuid, text, int, int, text, text, text, text), public.pl_grant(uuid, int, int),
  public.pl_set_founding(uuid, boolean), public.pl_delete_account() from public, anon, authenticated;
grant execute on function public.pl_delete_account(), public.pl_grant(uuid, int, int), public.pl_set_founding(uuid, boolean) to authenticated;
grant execute on function public.pl_record_payment(text, uuid, text, int, int, text, text, text, text) to service_role;

-- Networks that already exist started while Plumbline was free. This gives each of them 5 assessments so nothing breaks.
update public.networks set credits = 5 where credits = 0;


-- ============ Audiences ============
-- Each assessment remembers who it's for: church planting (the default), church staff hiring, nonprofit or business.
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
                       'bankVersion', case when jsonb_typeof(new.settings->'bankVersion') = 'string' then to_jsonb(left(new.settings->>'bankVersion', 20)) end));
  return new;
end $$;

create or replace function public.pl_case_header(c public.cases) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('id', c.id, 'planterName', c.planter_name, 'spouseName', c.spouse_name, 'married', c.married,
    'city', c.city, 'network', c.settings->>'networkName', 'logoUrl', c.settings->>'logoUrl',
    'signGifts', coalesce((c.settings->>'signGifts')::boolean, true),
    'beliefs', coalesce(c.settings->'beliefs', '[]'::jsonb), 'questions', coalesce(c.settings->'questions', '[]'::jsonb),
    'bankVersion', c.settings->>'bankVersion', 'released', c.reports_released,
    'audience', coalesce(c.settings->>'audience', 'planting'), 'faith', coalesce((c.settings->>'faith')::boolean, true), 'role', c.settings->>'role')
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
                               'audience', coalesce(me.settings->>'audience', 'planting'), 'faith', coalesce((me.settings->>'faith')::boolean, true), 'role', me.settings->>'role'),
    'role', me.role,
    'me', me.answers - 'privateNote' - 'safety',
    'other', (select public.pl_summary(o.answers) from public.participants o
              where o.case_id = me.case_id and o.role <> me.role and o.role in ('planter', 'spouse') and o.status = 'finished')
  ) end
  from me;
$$;
