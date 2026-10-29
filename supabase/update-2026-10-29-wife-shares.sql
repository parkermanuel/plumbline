-- Plumbline update, 29 Oct 2026: Should I plant? wife can share her report with him. Safe to run more than once.
-- ============ Should I plant?: his wife can share her report with him (owner, 29 Oct 2026) ============
-- Her answers and report are hers. If she chooses, she shares her report with him from her report page, and can stop any time.
-- Until she does, his report doesn't include anything from her answers.
create or replace function public.pl_report(p_token text) returns jsonb language sql security definer set search_path = public stable as $$
  with me as (
    select p.*, c.reports_released, c.married, c.planter_name, c.spouse_name, c.settings, c.city
    from public.participants p join public.cases c on c.id = p.case_id
    where p.role in ('planter', 'spouse') and p.status = 'finished' and not c.archived
      and ((coalesce(c.settings->>'purpose', 'decide') <> 'team' and p.token = p_token)
        or (c.settings->>'purpose' = 'team' and p.id = public.pl_key_person(p_token)))
  )
  select case when not me.reports_released then jsonb_build_object('released', false) else jsonb_build_object(
    'released', true,
    'case', jsonb_build_object('id', me.case_id, 'planterName', me.planter_name, 'spouseName', me.spouse_name, 'married', me.married,
                               'network', me.settings->>'networkName', 'logoUrl', me.settings->>'logoUrl', 'city', me.city,
                               'signGifts', coalesce((me.settings->>'signGifts')::boolean, true),
                               'audience', coalesce(me.settings->>'audience', 'planting'), 'faith', coalesce((me.settings->>'faith')::boolean, true), 'role', me.settings->>'role',
                               'purpose', coalesce(me.settings->>'purpose', 'decide'), 'team', me.settings->'team',
                               'leaderSees', coalesce((me.settings->>'leaderSees')::boolean, false)),
    'role', me.role, 'shared', me.shared,
    'me', me.answers - 'privateNote' - 'safety',
    'other', (select public.pl_summary(o.answers) from public.participants o
              where o.case_id = me.case_id and o.role <> me.role and o.role in ('planter', 'spouse') and o.status = 'finished'
                -- Should I plant?: his report shows how they fit together only once she has shared hers with him
                and not (coalesce(me.settings->>'purpose', 'decide') = 'self' and me.role = 'planter' and not coalesce(o.shared, false)))
  ) end
  from me;
$$;

-- She turns sharing on or off with her own link (only her, only on a Should I plant? case, only once she's finished)
create or replace function public.pl_self_share(p_token text, p_on boolean) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.participants p set shared = coalesce(p_on, false)
  from public.cases c where c.id = p.case_id and p.token = p_token and p.role = 'spouse' and p.status = 'finished' and c.settings->>'purpose' = 'self';
  if not found then raise exception 'This link can''t share a report' using errcode = 'P0001'; end if;
  return coalesce(p_on, false);
end $$;
revoke all on function public.pl_self_share(text, boolean) from public;
grant execute on function public.pl_self_share(text, boolean) to anon, authenticated;

-- What he can read once she shares: her report (never a private note or safety answers). Nothing when she hasn't shared.
create or replace function public.pl_self_spouse_report(p_case uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a jsonb;
begin
  if not (public.pl_case_is_self(p_case) and public.pl_is_member(public.pl_case_network(p_case))) then raise exception 'Not allowed'; end if;
  select p.answers - 'privateNote' - 'safety' into a from public.participants p
    where p.case_id = p_case and p.role = 'spouse' and p.status = 'finished' and coalesce(p.shared, false);
  return a;
end $$;
revoke all on function public.pl_self_spouse_report(uuid) from public, anon;
grant execute on function public.pl_self_spouse_report(uuid) to authenticated;
