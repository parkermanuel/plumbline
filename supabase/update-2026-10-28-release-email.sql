-- ============ "Your report is ready" email when a leader releases reports (owner, 28 Oct 2026) ============
-- Called by the email function as the signed-in leader. Only network members, only a released planting/hiring case,
-- only once per case (stamped in cases.settings.releaseEmailedAt), only the planter and spouse who finished and have an email.
create or replace function public.pl_release_email(p_case uuid) returns table(
  email text, name text, role text, token text, planter_name text, spouse_name text, network_name text, sender_name text, sender_email text, audience text, job_role text)
language plpgsql security definer set search_path = public as $$
declare c public.cases;
begin
  select * into c from public.cases where id = p_case;
  if c.id is null or not public.pl_is_member(c.network_id) then raise exception 'Not allowed'; end if;
  if not c.reports_released or c.archived or coalesce(c.settings->>'purpose', 'decide') = 'team' or c.settings ? 'releaseEmailedAt' then return; end if;
  if (select count(*) from public.email_log l where l.network_id = c.network_id and l.at > now() - interval '1 day') >= 300 then
    raise exception 'Your network has sent its 300 emails for today. Try again tomorrow.'; end if;
  update public.cases set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('releaseEmailedAt', now()) where id = c.id;
  insert into public.email_log(network_id, kind)
    select c.network_id, 'released' from public.participants p
    where p.case_id = c.id and p.role in ('planter', 'spouse') and p.status = 'finished' and p.email is not null;
  return query
  select p.email, p.name, p.role, p.token, c.planter_name, c.spouse_name, c.settings->>'networkName',
         coalesce(m.name, split_part(m.email, '@', 1)), m.email,
         coalesce(c.settings->>'audience', 'planting'), coalesce(c.settings->>'role', '')
  from public.participants p
  left join public.network_members m on m.network_id = c.network_id and m.user_id = auth.uid()
  where p.case_id = c.id and p.role in ('planter', 'spouse') and p.status = 'finished' and p.email is not null;
end $$;
revoke all on function public.pl_release_email(uuid) from public, anon;
grant execute on function public.pl_release_email(uuid) to authenticated;
