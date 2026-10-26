# Agent briefing
Read this first. It applies to every AI agent working in this repo.

## Owner and how to work (all agents: Claude, Codex, Antigravity, OpenCode)
Owner: Parker Manuel, Lead Pastor of Pinewood Church (Boulder, CO). He is not a programmer. The newest instruction from Parker always wins over older notes in this repo.

Talking to Parker
- Plain English, short. No jargon without a one-line explanation.
- Make routine technical decisions yourself and say what you decided. Ask only about content, money, privacy or anything hard to undo.
- When asking a multiple-choice question, give three options with your recommendation first.
- Never call something done that you have not verified.

Default workflow (do this every time without being asked; added 26 Oct 2026)
1. Big or risky task (new feature, several files, database, payments, sign-in): post a short plain-English plan and wait for Parker's "go". Small fixes: just do them.
2. Any screen change: check light and dark mode at phone width before finishing.
3. Run the checks listed below for what you touched.
4. Commit, push and open a pull request with a plain-English description. Merge it yourself only if it is low-risk and this repo's rules allow it; otherwise leave it for Parker.
5. End with three short lines: what changed (plain English), what you tested, what is uncertain or needs Parker.

Product rules for every app
- Light AND dark mode on every screen; check both (Parker uses dark mode on his iPhone).
- Sign-in: email with a 6-digit code that works in any browser; a one-tap link may be a second option.
- Any number shown to users explains how it was reached, the standard behind it and the sources.
- Clean on phones. No placeholder text, fake data presented as real, or broken links.
- Choose the excellent way, not the "it'll be ok" way.

Safety
- Never commit secrets or a Supabase `service_role` key. Publishable/anon keys only in client code.
- Payments, pricing, database migrations, sign-in, privacy and security rules: open a pull request and wait for Parker's OK. Do not merge these yourself.
- Never force-push or rewrite pushed history.

Saving tokens
- One task per session. Read only the files the task needs; use the map below instead of exploring.
- Run the checks listed below for what you touched, not everything, unless the change is risky.
- Keep this file short. When Parker sets a new standing rule, add one dated line here.

## Plumbline (database and back end)
Plumbline is Parker's church planter assessment for network leaders (planter, spouse and 3–5 references each answer; the leader gets a graded report). Plumbline Teams is the same app for growing existing teams.

What lives where
- The live website is the Lovable project in parkermanuel/plumbline-starter (plumblineassessment.com), copied automatically to plumbline-teams (plumblineteams.com). Change screens there, not here.
- This repo is the source of truth for the database and server: `supabase/setup.sql` (every table, security rule and function; safe to re-run), dated `supabase/update-*.sql` files, and Edge Functions in `supabase/functions/` (email, Stripe, nightly sweep).
- `src/` holds the original static app and the shared question bank and scoring (`bank.js`, `engine.js`). Ask Parker before changing `src/` here: the copies in plumbline-starter must stay in step.
- `research/` and `blueprint.md`: why the assessment is designed the way it is. `SETUP.md`: one-time setup and status.

Deploys
- Every merge to `main` runs the tests, then re-runs `setup.sql` on the live database and redeploys the functions (`.github/workflows/deploy.yml`). Treat every merge as going live.

Checks
- `npm test` (scoring, email, Stripe and database checks in an in-memory Postgres). Browser tests: `npm run e2e`, `test/teams.e2e.mjs`.

Rules
- Never reuse a question ID for new wording (answers are stored by ID).
- Team members' private answers never reach leaders; keep `case_snapshot` and report-key rules intact.
- Stripe, pricing and anything in `supabase/` need Parker's OK before merging.
