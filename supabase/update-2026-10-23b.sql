-- Plumbline update 2, 23 Oct 2026: every new network's first couple is free. Safe to run more than once.
alter table public.networks alter column credits set default 1;
drop trigger if exists pl_count_case on public.cases;  -- an earlier billing draft, replaced by credits
