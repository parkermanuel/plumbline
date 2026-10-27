-- Paste into the Supabase SQL editor (safe to run twice). Same as the end of setup.sql.

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
