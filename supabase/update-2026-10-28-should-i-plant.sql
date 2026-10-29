-- ============ Should I Plant? (owner, 28 Oct 2026) ============
-- A man wondering whether to plant takes the planting husband assessment on his own (purpose "self", in a personal network
-- he owns). His report opens as soon as he finishes. No verdict is shown to him; the screens give a discernment report instead.
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
                       'purpose', case when new.settings->>'purpose' in ('decide', 'team', 'self') then to_jsonb(new.settings->>'purpose') end,
                       'team', case when jsonb_typeof(new.settings->'team') = 'object' and jsonb_typeof(new.settings->'team'->'id') = 'string'
                                    then jsonb_build_object('id', left(new.settings->'team'->>'id', 40), 'name', left(coalesce(new.settings->'team'->>'name', 'Team'), 80)) end,
                       -- Plumbline Teams (26 Oct 2026): the leader chose to see each person's full report; the person is told before they start
                       'leaderSees', case when new.settings->>'purpose' = 'team' and jsonb_typeof(new.settings->'leaderSees') = 'boolean' then new.settings->'leaderSees' end));
  -- A team member sees their own growth report as soon as they finish; there's no decision meeting to wait for.
  if new.settings->>'purpose' = 'team' then new.reports_released := true; end if;
  -- Should I Plant? (owner, 28 Oct 2026): someone discerning on their own sees their own report as soon as they finish
  if new.settings->>'purpose' = 'self' then new.reports_released := true; end if;
  return new;
end $$;
drop trigger if exists case_snapshot on public.cases;
create trigger case_snapshot before insert on public.cases for each row execute function public.case_snapshot();
