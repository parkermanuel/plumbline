-- ============ Who's planting: husband or wife (owner, 28 Oct 2026) ============
-- So the planter and spouse screens say "his" and "her" correctly. Saved as cases.settings.planterIs; older couples
-- default to "husband". Only the header the person's link already receives gains this one field.
create or replace function public.pl_case_header(c public.cases) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('id', c.id, 'planterName', c.planter_name, 'spouseName', c.spouse_name, 'married', c.married,
    'city', c.city, 'network', c.settings->>'networkName', 'logoUrl', c.settings->>'logoUrl',
    'signGifts', coalesce((c.settings->>'signGifts')::boolean, true),
    'beliefs', coalesce(c.settings->'beliefs', '[]'::jsonb), 'questions', coalesce(c.settings->'questions', '[]'::jsonb),
    'bankVersion', c.settings->>'bankVersion', 'released', c.reports_released,
    'audience', coalesce(c.settings->>'audience', 'planting'), 'faith', coalesce((c.settings->>'faith')::boolean, true), 'role', c.settings->>'role',
    'purpose', coalesce(c.settings->>'purpose', 'decide'), 'team', c.settings->'team',
    'leaderSees', coalesce((c.settings->>'leaderSees')::boolean, false),
    'planterIs', case when c.settings->>'planterIs' = 'wife' then 'wife' else 'husband' end)
$$;
