// Database checks: runs supabase/setup.sql in an in-memory Postgres (PGlite) with Supabase's auth pieces stubbed.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";

export async function makeDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
    create publication supabase_realtime;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, delete on storage.objects to anon, authenticated;
  `);
  // Supabase's defaults: anon and authenticated get everything on new tables and functions in public
  await db.exec(`grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;`);
  const sql = readFileSync(new URL("../supabase/setup.sql", import.meta.url), "utf8");
  await db.exec(sql);
  await db.exec(sql); // must be safe to run twice
  const upd = readFileSync(new URL("../supabase/update-2026-10-23.sql", import.meta.url), "utf8");
  await db.exec(upd); await db.exec(upd); // the pasted update must also be safe to run on top, twice
  const upd3 = readFileSync(new URL("../supabase/update-2026-10-24-teams.sql", import.meta.url), "utf8");
  await db.exec(upd3); await db.exec(upd3);
  const upd4 = readFileSync(new URL("../supabase/update-2026-10-24-team-plans.sql", import.meta.url), "utf8");
  await db.exec(upd4); await db.exec(upd4);
  const upd5 = readFileSync(new URL("../supabase/update-2026-10-24-report-keys.sql", import.meta.url), "utf8");
  await db.exec(upd5); await db.exec(upd5);
  const upd6 = readFileSync(new URL("../supabase/update-2026-10-26-beta-founders.sql", import.meta.url), "utf8");
  await db.exec(upd6); await db.exec(upd6);
  const upd7 = readFileSync(new URL("../supabase/update-2026-10-26-peers-coach.sql", import.meta.url), "utf8");
  await db.exec(upd7); await db.exec(upd7);
  const upd8 = readFileSync(new URL("../supabase/update-2026-10-26-board.sql", import.meta.url), "utf8");
  await db.exec(upd8); await db.exec(upd8);
  const upd9 = readFileSync(new URL("../supabase/update-2026-10-27-stoa.sql", import.meta.url), "utf8");
  await db.exec(upd9); await db.exec(upd9);
  const upd10 = readFileSync(new URL("../supabase/update-2026-10-28-planter-refs.sql", import.meta.url), "utf8");
  await db.exec(upd10); await db.exec(upd10);
  const upd11 = readFileSync(new URL("../supabase/update-2026-10-28-pronouns.sql", import.meta.url), "utf8");
  await db.exec(upd11); await db.exec(upd11);
  // The existing payment checks run as a day after the free beta; the beta itself is checked on its own below.
  await db.exec(`select set_config('pl.today', '${process.env.PL_TODAY || "2027-02-01"}', false)`);
  return db;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
async function main() {
  const db = await makeDb();
  let failed = 0;
  const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) failed++; };
  const q = async (s, p) => (await db.query(s, p)).rows;
  const as = async (uid, fn) => {
    await db.exec(`set role ${uid ? "authenticated" : "anon"}; select set_config('request.uid', '${uid || ""}', false);`);
    try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); }
  };
  const tryAs = async (uid, sql, p) => { try { await as(uid, () => db.query(sql, p)); return null; } catch (e) { return e.message; } };

  const OWNER = "11111111-1111-1111-1111-111111111111", ASSESSOR = "22222222-2222-2222-2222-222222222222", OUTSIDER = "33333333-3333-3333-3333-333333333333", PARKER = "44444444-4444-4444-4444-444444444444";
  await db.exec(`insert into auth.users values ('${OWNER}','owner@net.org'), ('${ASSESSOR}','assessor@net.org'), ('${OUTSIDER}','x@other.org'), ('${PARKER}','parker@p.com')`);

  // Networks and teams
  const nid = (await as(OWNER, () => q(`select public.pl_create_network('Front Range Planting', 'Dana Owner') as id`)))[0].id;
  ok((await q(`select credits from public.networks where id = $1`, [nid]))[0].credits === 1, "a new network starts with its first couple free");
  await q(`update public.networks set credits = 0 where id = $1`, [nid]);  // free couple used
  // Payments: no credits, no assessments; Stripe adds credits once per payment; admins can't give themselves credits
  ok(/No assessments left/.test((await tryAs(OWNER, `insert into public.cases(network_id, created_by, planter_name, married) values ($1, $2, 'Nope', false)`, [nid, OWNER])) || ""), "a network with no assessments left can't start one");
  ok(!!(await tryAs(OWNER, `update public.networks set credits = 50 where id = $1`, [nid])), "a network can't give itself assessments");
  ok(!!(await tryAs(OWNER, `select public.pl_record_payment('cs_x', $1, 'couples', 50, 0, 'usd', null, null, null)`, [nid])), "only Stripe can record a payment");
  await q(`set role service_role`);
  const p1 = (await q(`select public.pl_record_payment('cs_1', $1, 'couples', 10, 199000, 'usd', 'dana@net.org', null, 'cus_1') as ok`, [nid]))[0].ok;
  const p2 = (await q(`select public.pl_record_payment('cs_1', $1, 'couples', 10, 199000, 'usd', 'dana@net.org', null, 'cus_1') as ok`, [nid]))[0].ok;
  await q(`reset role`);
  ok(p1 === true && p2 === false && (await q(`select credits from public.networks where id=$1`, [nid]))[0].credits === 10, "a Stripe payment adds credits exactly once");
  ok(!!nid, "owner creates a network");
  const inv = (await as(OWNER, () => q(`select public.pl_invite_member($1, 'Assessor@Net.org', 'assessor') as id`, [nid])))[0].id;
  ok(!!inv, "owner invites an assessor");
  ok(!!(await tryAs(ASSESSOR, `select public.pl_invite_member($1, 'a@b.co', 'admin')`, [nid])), "non-member can't invite");
  const invTok = (await q(`select token from public.network_invites where id=$1`, [inv]))[0].token;
  ok((await q(`select public.pl_invite_info($1) as j`, [invTok]))[0].j.network === "Front Range Planting", "invite link shows network name");
  await as(ASSESSOR, () => q(`select public.pl_accept_invite($1, 'Sam Assessor')`, [invTok]));
  ok((await q(`select role from public.network_members where user_id=$1`, [ASSESSOR]))[0].role === "assessor", "assessor joins the team");
  ok(!!(await tryAs(ASSESSOR, `select public.pl_accept_invite($1)`, [invTok])), "invite can't be reused");
  ok(!!(await tryAs(ASSESSOR, `select public.pl_set_member($1, $2, 'remove')`, [nid, OWNER])), "assessor can't remove the owner");
  ok(!!(await tryAs(OWNER, `select public.pl_set_member($1, $2, 'assessor')`, [nid, OWNER])), "the last owner can't step down");

  // Network settings flow into a new case
  await as(OWNER, () => q(`update public.networks set settings = settings || '{"signGifts": false, "beliefs": [{"id":"nb1","t":"We baptize believers by immersion."}], "questions": [{"id":"nq1","t":"Why this city?","kind":"text","who":"planter"}]}'::jsonb where id=$1`, [nid]));
  ok(!!(await tryAs(ASSESSOR, `update public.networks set name='Hacked' where id=$1`, [nid])) || (await q(`select name from public.networks where id=$1`, [nid]))[0].name !== "Hacked", "assessor can't change network settings");
  const caseId = (await as(ASSESSOR, () => q(`insert into public.cases(network_id, created_by, planter_name, spouse_name, planter_email, spouse_email, married, settings) values ($1, $2, 'Josh Kim', 'Hannah Kim', 'josh@k.com', 'hannah@k.com', true, '{"bankVersion":"2026.10"}') returning id`, [nid, ASSESSOR])))[0].id;
  const cs = (await q(`select settings from public.cases where id=$1`, [caseId]))[0].settings;
  ok(cs.signGifts === false && cs.beliefs[0].id === "nb1" && cs.networkName === "Front Range Planting" && cs.bankVersion === "2026.10", "case snapshots network settings and question version");
  const ppl = await q(`select role, token, email from public.participants where case_id=$1 order by role`, [caseId]);
  ok(ppl.length === 2 && ppl[0].email === "josh@k.com", "planter and spouse rows created with emails");
  const tokP = ppl[0].token, tokS = ppl[1].token;

  // Team visibility
  ok((await as(OWNER, () => q(`select count(*)::int n from public.cases`)))[0].n === 1, "owner sees the assessor's case");
  ok((await as(OUTSIDER, () => q(`select count(*)::int n from public.cases`)))[0].n === 0, "outsider sees no cases");
  ok((await as(OUTSIDER, () => q(`select count(*)::int n from public.participants`)))[0].n === 0, "outsider sees no people");
  { let n = 0, err = null; try { n = (await as(null, () => q(`select count(*)::int n from public.participants`)))[0].n; } catch (e) { err = e; } ok(err || n === 0, "anonymous sees no people"); }
  ok(!!(await tryAs(OUTSIDER, `insert into public.cases(network_id, created_by, planter_name) values ($1, $2, 'X')`, [nid, OUTSIDER])), "outsider can't add a case to the network");
  ok(!!(await tryAs(OWNER, `update public.participants set answers='{"x":1}' where case_id=$1`, [caseId])), "leaders can't alter anyone's answers");
  ok(!!(await tryAs(OWNER, `update public.participants set token='abc' where case_id=$1`, [caseId])), "leaders can't change link keys");
  ok(!(await tryAs(OWNER, `update public.participants set email='new@k.com' where case_id=$1 and role='spouse'`, [caseId])), "leaders can fix an email");
  ok((await as(OWNER, () => q(`select count(*)::int n from public.participant_status where case_id=$1`, [caseId])))[0].n === 2, "progress mirror has both people");
  ok((await as(OUTSIDER, () => q(`select count(*)::int n from public.participant_status`)))[0].n === 0, "outsider sees no progress");

  // Link flow
  const open = (await as(null, () => q(`select public.pl_open($1) as j`, [tokP])))[0].j;
  ok(open.participant.role === "planter" && open.case.beliefs[0].id === "nb1" && open.case.questions[0].id === "nq1" && open.case.signGifts === false, "link opens with network beliefs, questions and gift setting");
  const ansP = { meta: { name: "Josh Kim", consentedAt: "2026-10-22" }, likert: { c1: 5 }, couple: { cp1: 5, cmo3: 1 }, wiring: { pace: [5, 4, 5, 5] } };
  ok((await as(null, () => q(`select public.pl_save($1,$2,40,200,'Called') as r`, [tokP, ansP])))[0].r === true, "anonymous link can save");
  ok((await q(`select progress from public.participants where token=$1`, [tokP]))[0].progress === 20, "progress 20%");
  const ps = (await q(`select s.progress, s.chapter, s.status from public.participant_status s join public.participants p on p.id = s.participant_id where p.token=$1`, [tokP]))[0];
  ok(ps.progress === 20 && ps.chapter === "Called" && ps.status === "started", "progress mirror updates (no answers in it)");
  const ansS = { meta: { name: "Hannah Kim" }, likert: { sc3: 5 }, couple: { cp1: 2, cp2: 2, cmo1: 4, cmo3: 2 }, wiring: { pace: [2, 2, 3, 2] }, privateNote: "secret", safety: { sf3: 4 } };
  await as(null, () => q(`select public.pl_finish($1,$2)`, [tokP, ansP]));
  await as(null, () => q(`select public.pl_finish($1,$2)`, [tokS, ansS]));
  ok((await as(null, () => q(`select public.pl_save($1,'{}',1,2,'x') as r`, [tokP])))[0].r === false, "finished answers are sealed");

  // Emails
  const ids = (await q(`select id from public.participants where case_id=$1`, [caseId])).map((r) => r.id);
  await q(`update public.participants set status='invited' where 1=0`);
  const caseId2 = (await as(OWNER, () => q(`insert into public.cases(network_id, created_by, planter_name, planter_email, married) values ($1, $2, 'Solo Planter', 'solo@p.com', false) returning id`, [nid, OWNER])))[0].id;
  const soloId = (await q(`select id from public.participants where case_id=$1`, [caseId2]))[0].id;
  let rows = await as(OWNER, () => q(`select * from public.pl_email_people($1, 'invite')`, [[soloId]]));
  ok(rows.length === 1 && rows[0].email === "solo@p.com" && rows[0].network_name === "Front Range Planting" && rows[0].sender_email === "owner@net.org", "invite targets come back with sender");
  rows = await as(OWNER, () => q(`select * from public.pl_email_people($1, 'remind')`, [[soloId]]));
  ok(rows.length === 1, "first reminder goes out");
  rows = await as(OWNER, () => q(`select * from public.pl_email_people($1, 'remind')`, [[soloId]]));
  ok(rows.length === 0, "second reminder within 20 hours is skipped");
  rows = await as(OUTSIDER, () => q(`select * from public.pl_email_people($1, 'invite')`, [[soloId]]));
  ok(rows.length === 0, "outsider can't trigger emails");
  rows = await as(OWNER, () => q(`select * from public.pl_email_people($1, 'invite')`, [ids]));
  ok(rows.length === 0, "finished people aren't emailed");
  ok(!!(await tryAs(null, `select * from public.pl_finish_notice($1)`, [tokP])), "anonymous can't call the finish notice directly");
  rows = await q(`select * from public.pl_finish_notice($1)`, [tokP]); // service role
  ok(rows.length === 2 && rows.some((r) => r.email === "assessor@net.org") && rows.some((r) => r.email === "owner@net.org") && rows[0].all_done === true, "finish notice goes to creator + owner, once both spouses are done");
  ok((await q(`select * from public.pl_finish_notice($1)`, [tokP])).length === 0, "finish notice sends only once");
  const inv2 = (await as(OWNER, () => q(`select public.pl_invite_member($1, 'new@net.org', 'admin') as id`, [nid])))[0].id;
  rows = await as(OWNER, () => q(`select * from public.pl_member_invite_email($1)`, [inv2]));
  ok(rows.length === 1 && rows[0].network_name === "Front Range Planting", "team invite email target");
  ok((await as(ASSESSOR, () => q(`select * from public.pl_member_invite_email($1)`, [inv2]))).length === 0, "assessor can't send team invites");

  // Reports
  await as(OWNER, () => q(`update public.cases set reports_released=true where id=$1`, [caseId]));
  const rep = (await as(null, () => q(`select public.pl_report($1) as j`, [tokP])))[0].j;
  ok(rep.released && !JSON.stringify(rep.other).includes("secret") && !rep.other.likert && !rep.other.safety, "planter report holds only spouse summaries");
  ok(Math.abs(rep.other.couple.cmo3 - 2) < 0.01 && Math.abs(rep.other.couple.cmo1 - 4) < 0.01 && Math.abs(rep.other.wiring.pace[0] - 2.5) < 0.01, "summaries are correct, rounded to the nearest half");

  // Interview scores
  await as(ASSESSOR, () => q(`insert into public.interview_scores(case_id, user_id, name, notes) values ($1, $2, 'Sam', '{"rubric":{"p0":4}}')`, [caseId, ASSESSOR]));
  ok(!!(await tryAs(OWNER, `update public.interview_scores set notes='{}' where user_id=$1`, [ASSESSOR])) || (await q(`select notes from public.interview_scores where user_id=$1`, [ASSESSOR]))[0].notes.rubric?.p0 === 4, "owner can't overwrite an assessor's scores");
  ok((await as(OWNER, () => q(`select count(*)::int n from public.interview_scores`)))[0].n === 1, "team can read each other's scores");

  // References
  const refTok = (await q(`select ref_token from public.cases where id=$1`, [caseId]))[0].ref_token;
  const rt = (await as(null, () => q(`select public.pl_join_reference($1,'Ref One') as t`, [refTok])))[0].t;
  ok(!!rt && (await as(null, () => q(`select public.pl_report($1) as j`, [rt])))[0].j === null, "reference joins, can't read reports");
  ok(!(await tryAs(ASSESSOR, `insert into public.participants(case_id, role, name, email) values ($1, 'reference', 'Pastor Mike', 'mike@c.org')`, [caseId])), "team can add a reference by email");
  ok(!!(await tryAs(ASSESSOR, `insert into public.participants(case_id, role, name, token, status) values ($1, 'reference', 'Faker', 'mine', 'finished')`, [caseId])), "team can't set a reference's key or status");
  const added = (await q(`select token, status from public.participants where name='Pastor Mike'`))[0];
  ok(added.token.length === 64 && added.status === "invited", "added reference gets a fresh key and starts as invited");

  // Platform stats
  ok((await as(OWNER, () => q(`select public.pl_platform_stats() as j`)))[0].j === null, "non-admins get no platform stats");
  await q(`insert into public.platform_admins values ($1)`, [PARKER]);
  const st = (await as(PARKER, () => q(`select public.pl_platform_stats() as j`)))[0].j;
  ok(st.networks === 1 && st.assessments === 2 && st.finished === 2 && st.byNetwork[0].name === "Front Range Planting", "platform stats: counts");
  ok(st.byNetwork[0].ownerEmail && st.byNetwork[0].owner && st.byNetwork[0].lastAssessment && !JSON.stringify(st).includes("answers"), "platform stats: each network's owner and last assessment, never answers");

  // Review fixes
  const open2 = (await as(null, () => q(`select public.pl_open($1) as j`, [tokS])))[0].j;
  ok(JSON.stringify(open2.participant.answers) === "{}", "a finished person's link returns no answers");
  const c3 = (await as(OWNER, () => q(`insert into public.cases(network_id, created_by, planter_name, spouse_name, married) values ($1, $2, 'Lee Park', 'Mia Park', true) returning id`, [nid, OWNER])))[0].id;
  const tokM = (await q(`select token from public.participants where case_id=$1 and role='spouse'`, [c3]))[0].token;
  await as(null, () => q(`select public.pl_save($1,$2,10,100,'Your marriage')`, [tokM, { likert: { sc1: 4 }, safety: { sf3: 4 }, privateNote: "HIDDEN", spouseSees: { ob_call: 2 } }]));
  const o3 = (await as(null, () => q(`select public.pl_open($1) as j`, [tokM])))[0].j.participant.answers;
  ok(o3.likert.sc1 === 4 && !o3.safety && !o3.privateNote && !o3.spouseSees, "a spouse's link never returns her safety answers, private note or ratings");
  await as(null, () => q(`select public.pl_save($1,$2,12,100,'Your marriage')`, [tokM, { likert: { sc1: 4, sc2: 3 } }]));
  const kept = (await q(`select answers from public.participants where token=$1`, [tokM]))[0].answers;
  ok(kept.safety.sf3 === 4 && kept.privateNote === "HIDDEN" && kept.spouseSees.ob_call === 2 && kept.likert.sc2 === 3, "resuming keeps the private answers on the server");
  const c4 = (await as(ASSESSOR, () => q(`insert into public.cases(network_id, created_by, planter_name, married, settings) values ($1, $2, 'Fake', false, '{"networkName":"Totally Legit Bank","beliefs":[],"signGifts":false}') returning settings`, [nid, ASSESSOR])))[0].settings;
  ok(c4.networkName === "Front Range Planting" && c4.beliefs.length === 1 && c4.signGifts === false, "a new case can't override the network's name or beliefs");
  ok(!!(await tryAs(ASSESSOR, `update public.cases set settings='{}' where id=$1`, [c3])), "team members can't rewrite a case's settings");
  ok(!!(await tryAs(OWNER, `insert into public.cases(network_id, created_by, planter_name, ref_token) values ($1, $2, 'X', 'mine')`, [nid, OWNER])), "can't choose a reference link key");
  ok(!!(await tryAs(OWNER, `update public.participants set reminded_at=null where case_id=$1`, [c3])), "can't clear reminder stamps");
  const otherNet = (await as(OUTSIDER, () => q(`select public.pl_create_network('Elsewhere') as id`)))[0].id;
  await q(`update public.networks set credits = 5 where id = $1`, [otherNet]);
  const otherCase = (await as(OUTSIDER, () => q(`insert into public.cases(network_id, created_by, planter_name, married) values ($1, $2, 'Other', false) returning id`, [otherNet, OUTSIDER])))[0].id;
  ok(!!(await tryAs(ASSESSOR, `update public.interview_scores set case_id=$1`, [otherCase])), "scores can't be moved into another network's case");
  const inv3 = (await as(OWNER, () => q(`select public.pl_invite_member($1, 'someone@else.org', 'admin') as id`, [nid])))[0].id;
  const tok3 = (await q(`select token from public.network_invites where id=$1`, [inv3]))[0].token;
  ok(!!(await tryAs(OUTSIDER, `select public.pl_accept_invite($1)`, [tok3])), "an invite only works for the email it was sent to");
  ok(!!(await tryAs(null, `select public.pl_case_network($1)`, [caseId])), "anonymous can't call internal helpers");
  ok((await as(OWNER, () => q(`select * from public.pl_member_invite_email($1)`, [inv2]))).length === 0, "a team invite can't be re-emailed the same day");
  const one = (await q(`select public.pl_summary('{"couple":{"cmo3":2},"wiring":{"pace":[5]}}'::jsonb) as j`))[0].j;
  ok(!one.couple.cmo1 && !one.wiring.pace, "summaries need at least two answers, so one answer can't be read back");
  const newRef = (await as(OWNER, () => q(`select public.pl_rotate_ref($1) as t`, [caseId])))[0].t;
  ok(newRef !== refTok && (await as(null, () => q(`select public.pl_ref_case($1) as j`, [refTok])))[0].j === null, "a new reference link replaces the old one");

  // Uploaded results from other assessments
  const open1 = (await q(`select p.token from public.participants p join public.cases c on c.id = p.case_id where c.network_id=$1 and p.role in ('planter','spouse') and p.status <> 'finished' limit 1`, [nid]))[0]?.token;
  const done1 = (await q(`select p.token from public.participants p where p.role in ('planter','spouse') and p.status = 'finished' limit 1`))[0]?.token;
  const ref1 = (await q(`select p.token from public.participants p where p.role = 'reference' limit 1`))[0]?.token;
  const put = (uid, tok, n) => tryAs(uid, `insert into storage.objects(bucket_id, name) values ('results', $1)`, [`${tok}/${n}.pdf`]);
  ok(open1 && (await put(null, open1, "a")) === null, "a planter or spouse link can upload a result file");
  for (const n of ["b", "c", "d", "e"]) await put(null, open1, n);
  ok(!!(await put(null, open1, "f")), "no more than five files per person");
  ok(!!(await put(null, "f".repeat(64), "a")), "a made-up link can't upload");
  ok(!ref1 || !!(await put(null, ref1, "a")), "a reference link can't upload");
  ok(!done1 || !!(await put(null, done1, "a")), "no uploads after finishing");
  const seen = async (uid) => (await as(uid, () => q(`select count(*)::int n from storage.objects where bucket_id='results' and name like $1`, [open1 + "/%"])))[0].n;
  ok((await seen(ASSESSOR)) === 5 && (await seen(OUTSIDER)) === 0, "the network's team can read the files; other networks can't");
  ok((await seen(null)) === 0, "visitors can't list or read files, even with a link");
  await as(ASSESSOR, () => q(`delete from storage.objects where bucket_id='results' and name like $1`, [open1 + "/%"]));
  ok((await q(`select count(*)::int n from storage.objects where name like $1`, [open1 + "/%"]))[0].n === 5, "assessors can't delete files");
  await as(OWNER, () => q(`delete from storage.objects where bucket_id='results' and name = $1`, [open1 + "/a.pdf"]));
  await tryAs(null, `delete from storage.objects where bucket_id='results' and name like $1`, [open1 + "/%"]);
  ok((await q(`select count(*)::int n from storage.objects where name like $1`, [open1 + "/%"]))[0].n === 4, "owners can delete files; visitors can't");
  ok((await q(`select public from storage.buckets where id='results'`))[0].public === false, "the results bucket is private");

  // Delete and retention
  ok(!!(await tryAs(ASSESSOR, `delete from public.cases where id=$1`, [caseId2])) || (await q(`select count(*)::int n from public.cases where id=$1`, [caseId2]))[0].n === 1, "assessor can't delete");
  await as(OWNER, () => q(`delete from public.cases where id=$1`, [caseId2]));
  ok((await q(`select count(*)::int n from public.participants where case_id=$1`, [caseId2]))[0].n === 0, "owner deletes permanently, people go too");
  await q(`update public.cases set created_at = now() - interval '25 months' where id=$1`, [caseId]);
  ok((await q(`select public.pl_purge() as n`))[0].n === 1 && (await q(`select count(*)::int n from public.participants where case_id=$1`, [caseId]))[0].n === 0 && (await q(`select count(*)::int n from public.cases`))[0].n === 3, "retention removes only assessments older than 24 months");

  // Credits are used, and a yearly plan means unlimited
  const left = (await q(`select credits from public.networks where id=$1`, [nid]))[0].credits;
  const used = (await q(`select count(*)::int n from public.payments where network_id=$1`, [nid]))[0].n;
  ok(left < 10 && used === 1, `each new assessment used a credit (${left} left)`);
  await q(`update public.networks set credits = 0 where id=$1`, [nid]);
  await q(`set role service_role`); await q(`select public.pl_record_payment('cs_plan', null, 'plan', 1, 499900, 'usd', null, null, 'cus_1')`); await q(`reset role`);
  const planErr = await tryAs(OWNER, `insert into public.cases(network_id, created_by, planter_name, married) values ($1, $2, 'Plan', false)`, [nid, OWNER]); ok(!planErr, "a yearly plan allows assessments without credits (found by Stripe customer)");
  ok(!!(await tryAs(OWNER, `select public.pl_grant($1, 5, 0)`, [nid])), "only the platform admin can give assessments");
  await as(PARKER, () => q(`select public.pl_grant($1, 5, 0)`, [nid]));
  ok((await q(`select credits from public.networks where id=$1`, [nid]))[0].credits === 5, "the platform admin can give assessments");
  ok(!!(await tryAs(OWNER, `select public.pl_set_founding($1, true)`, [nid])) && !!(await tryAs(OWNER, `update public.networks set founding = true where id=$1`, [nid])), "a network can't make itself founding");
  await as(PARKER, () => q(`select public.pl_set_founding($1, true)`, [nid]));
  ok((await q(`select founding from public.networks where id=$1`, [nid]))[0].founding === true, "the platform admin can mark a founding network");

  // Plumbline Teams: a team member's case keeps its purpose and team, and their link knows it
  const tc = (await as(OWNER, () => q(`insert into public.cases(network_id, created_by, planter_name, planter_email, married, settings) values ($1, $2, 'Ava Team', 'ava@t.org', false, '{"audience":"staff","purpose":"team","team":{"id":"t_abc","name":"Pinewood staff","extra":"x"},"evil":"y"}') returning id`, [nid, OWNER])))[0].id;
  const ts = (await q(`select settings, reports_released from public.cases where id=$1`, [tc]))[0];
  ok(ts.reports_released === true, "a team member's growth report is released from the start");
  Object.assign(ts, ts.settings);
  ok(ts.settings.purpose === "team" && ts.settings.team.id === "t_abc" && ts.settings.team.name === "Pinewood staff" && ts.settings.team.extra === undefined && ts.settings.evil === undefined, "a team case keeps purpose and team, nothing else");
  const ttok = (await q(`select token from public.participants where case_id=$1`, [tc]))[0].token;
  const topen = (await q(`select public.pl_open($1) as j`, [ttok]))[0].j;
  ok(topen.case.purpose === "team" && topen.case.team.name === "Pinewood staff", "a team member's link knows it's for their team");
  const bad = (await as(OWNER, () => q(`insert into public.cases(network_id, created_by, planter_name, married, settings) values ($1, $2, 'Odd', false, '{"purpose":"spy","team":"x"}') returning id`, [nid, OWNER])))[0].id;
  const bs = (await q(`select settings from public.cases where id=$1`, [bad]))[0].settings;
  ok(bs.purpose === undefined && bs.team === undefined, "unknown purpose or a malformed team is dropped");
  ok((await q(`select public.pl_open($1) as j`, [(await q(`select token from public.participants where case_id=$1`, [bad]))[0].token]))[0].j.case.purpose === "decide", "assessments default to a decision");

  // Plumbline Teams peers: a teammate's ratings show only as averages, and only once 2 have finished
  {
    const pc = (await as(OWNER, () => q(`insert into public.cases(network_id, created_by, planter_name, planter_email, married, settings) values ($1, $2, 'Pat Peer', 'p@t.org', false, '{"audience":"staff","purpose":"team","team":{"id":"t_peer","name":"Peers"}}') returning id`, [nid, OWNER])))[0].id;
    const pid = (await q(`update public.participants set status='finished' where case_id=$1 and role='planter' returning id`, [pc]))[0].id;
    await q(`insert into public.report_keys(participant_id) values ($1) on conflict do nothing`, [pid]);
    const PK = (await q(`select key from public.report_keys where participant_id=$1`, [pid]))[0].key;
    const link = (await as(null, () => q(`select public.pl_team_peer_link($1) t`, [PK])))[0].t;
    ok(link && link === (await q(`select ref_token from public.cases where id=$1`, [pc]))[0].ref_token, "team peers: the person gets their own teammate link");
    await q(`insert into public.participants(case_id, role, name, status, answers) values ($1, 'reference', 'A', 'finished', '{"items":{"rf_x":4,"rf_y":0}}')`, [pc]);
    let peers = (await as(null, () => q(`select public.pl_team_peers($1) p`, [PK])))[0].p;
    ok(peers.finished === 1 && Object.keys(peers.items).length === 0, "team peers: nothing shows with only one rating");
    await q(`insert into public.participants(case_id, role, name, status, answers) values ($1, 'reference', 'B', 'finished', '{"items":{"rf_x":5,"rf_y":3}}')`, [pc]);
    peers = (await as(null, () => q(`select public.pl_team_peers($1) p`, [PK])))[0].p;
    ok(peers.finished === 2 && Object.keys(peers.items).length === 0, "team peers: still nothing with two ratings");
    await q(`insert into public.participants(case_id, role, name, status, answers) values ($1, 'reference', 'C', 'finished', '{"items":{"rf_x":3,"rf_y":4}}')`, [pc]);
    peers = (await as(null, () => q(`select public.pl_team_peers($1) p`, [PK])))[0].p;
    ok(peers.finished === 3 && Number(peers.items.rf_x.avg) === 4 && !peers.items.rf_y, "team peers: averages show at 3 ratings; an item fewer than 3 people saw stays hidden");
    ok((await as(null, () => q(`select public.pl_team_peers('nokey00000000000000000000') p`)))[0].p === null, "team peers: a wrong key gets nothing");
    const seen = await as(OWNER, () => q(`select role from public.pl_team_people($1)`, [pc]));
    ok(seen.length === 1 && seen[0].role === "planter", "team peers: the leader never sees who rated a team member");
  }

  // Plumbline Teams: a leader who chose "I see each person's report"
  {
    const lc = (await as(OWNER, () => q(`insert into public.cases(network_id, created_by, planter_name, planter_email, married, settings) values ($1, $2, 'Lee Sees', 'l@t.org', false, '{"audience":"staff","purpose":"team","team":{"id":"t_sees","name":"Sees"},"leaderSees":true}') returning id`, [nid, OWNER])))[0].id;
    const lp = (await q(`select id, shared, token from public.participants where case_id=$1`, [lc]))[0];
    ok(lp.shared === true, "leader sees: a new member's report is shared from the start");
    ok((await q(`select public.pl_open($1) j`, [lp.token]))[0].j.case.leaderSees === true, "leader sees: the person's link says so (they're told before they start)");
    await q(`update public.participants set status='finished', answers='{"likert":{"x":4},"teamh":{"t":2},"privateNote":"p"}' where id=$1`, [lp.id]);
    const lk = (await q(`select key from public.report_keys where participant_id=$1`, [lp.id]))[0]?.key || (await q(`insert into public.report_keys(participant_id) values ($1) returning key`, [lp.id]))[0].key;
    await as(null, () => q(`select public.pl_team_share($1, false)`, [lk]));
    ok((await q(`select shared from public.participants where id=$1`, [lp.id]))[0].shared === true, "leader sees: the person can't turn sharing off");
    const seen = (await as(OWNER, () => q(`select answers from public.pl_team_people($1)`, [lc])))[0].answers;
    ok(seen.likert && !seen.teamh && !seen.privateNote, "leader sees: the leader gets the answers, never the Our team answers");
    const old = (await as(OWNER, () => q(`insert into public.cases(network_id, created_by, planter_name, married, settings) values ($1, $2, 'Old Way', false, '{"audience":"staff","purpose":"team","team":{"id":"t_old","name":"Old"}}') returning id`, [nid, OWNER])))[0].id;
    ok((await q(`select shared from public.participants where case_id=$1`, [old]))[0].shared === false, "leader sees: teams without the choice stay private");
    const plant = (await as(OWNER, () => q(`insert into public.cases(network_id, created_by, planter_name, married, settings) values ($1, $2, 'Plant', false, '{"leaderSees":true}') returning id, settings`, [nid, OWNER])))[0];
    ok(plant.settings.leaderSees === undefined, "leader sees: only team assessments keep the choice");
  }

  // Plumbline Teams: the leader releases the team map to the team
  {
    const mk = async (nm) => {
      const id = (await as(OWNER, () => q(`insert into public.cases(network_id, created_by, planter_name, married, settings) values ($1, $2, $3, false, '{"audience":"staff","purpose":"team","team":{"id":"t_rel","name":"Rel"},"leaderSees":true}') returning id`, [nid, OWNER, nm])))[0].id;
      const pid = (await q(`update public.participants set status='finished', team_summary='{"pillars":{"health":40,"character":80},"wiring":{"pace":70},"giftsTop":["lead"],"team":{"th_trust":60}}' where case_id=$1 and role='planter' returning id`, [id]))[0].id;
      return (await q(`select key from public.report_keys where participant_id=$1`, [pid]))[0]?.key || (await q(`insert into public.report_keys(participant_id) values ($1) returning key`, [pid]))[0].key;
    };
    const k1 = await mk("Ann"); await mk("Bo"); await mk("Cy");
    ok((await as(null, () => q(`select public.pl_team_map_member($1) m`, [k1])))[0].m === null, "team release: members see nothing until the leader releases it");
    ok(!!(await tryAs(null, `select public.pl_team_release($1, 't_rel', true)`, [nid])), "team release: only the leader's team can release it");
    await as(OWNER, () => q(`select public.pl_team_release($1, 't_rel', true)`, [nid]));
    const m = (await as(null, () => q(`select public.pl_team_map_member($1) m`, [k1])))[0].m;
    ok(m && m.combined && m.shared.length === 3 && m.shared[0].summary.wiring && !m.shared[0].summary.pillars && m.combined.healthLow === undefined, "team release: members see the map and everyone's wiring, never personal scores");
    ok((await as(OWNER, () => q(`select public.pl_team_map($1, 't_rel') m`, [nid])))[0].m.released === true, "team release: the leader sees it's released");
    await as(OWNER, () => q(`select public.pl_team_release($1, 't_rel', false)`, [nid]));
    ok((await as(null, () => q(`select public.pl_team_map_member($1) m`, [k1])))[0].m === null, "team release: the leader can take it back");
  }

  // Share your report with your board
  {
    const bc = (await as(OWNER, () => q(`insert into public.cases(network_id, created_by, planter_name, married, settings) values ($1, $2, 'Pastor Pat', false, '{"audience":"staff","purpose":"team","team":{"id":"t_lead","name":"Lead"}}') returning id`, [nid, OWNER])))[0].id;
    const bp = (await q(`update public.participants set status='finished', answers='{"likert":{"x":4},"privateNote":"secret","teamh":{"t":1}}' where case_id=$1 and role='planter' returning id`, [bc]))[0].id;
    const bk = (await q(`select key from public.report_keys where participant_id=$1`, [bp]))[0]?.key || (await q(`insert into public.report_keys(participant_id) values ($1) returning key`, [bp]))[0].key;
    const vid = (await as(null, () => q(`select public.pl_viewers_add($1, 'Board@Church.org', 'Bob') v`, [bk])))[0].v;
    ok(!!vid && (await as(null, () => q(`select public.pl_viewers_list($1) l`, [bk])))[0].l[0].email === "board@church.org", "board: the person adds a board member and sees who has it");
    ok(!!(await tryAs(null, `select public.pl_viewers_add('nope0000000000000000000000', 'x@y.org', 'X')`)), "board: only the person's own key can share");
    const vt = (await q(`select token from public.report_viewers where id=$1`, [vid]))[0].token;
    const rep = (await as(null, () => q(`select public.pl_viewer_report($1) r`, [vt])))[0].r;
    ok(rep && rep.me.likert && !rep.me.privateNote && !rep.me.teamh, "board: the board member sees the report, never the private note or Our team answers");
    ok(!!(await tryAs(null, `select * from public.pl_viewer_email($1, $2)`, [bk, vid])), "board: only the email function can send board links");
    await as(null, () => q(`select public.pl_viewers_remove($1, $2)`, [bk, vid]));
    ok((await as(null, () => q(`select public.pl_viewer_report($1) r`, [vt])))[0].r === null, "board: taking it back closes the link");
    await as(null, () => q(`select public.pl_viewers_add($1, 'b2@church.org', 'B2')`, [bk]));
    const direct = await tryAs(OWNER, `select * from public.report_viewers`);
    ok(direct !== null || (await as(OWNER, () => q(`select count(*)::int n from public.report_viewers`)))[0].n === 0, "board: nobody reads the viewers table directly");
  }

  // Plumbline Teams privacy: answers stay with the person; leaders see combined results (3+ people) and what's shared
  const teamCase = async (name) => (await as(OWNER, () => q(`insert into public.cases(network_id, created_by, planter_name, planter_email, married, settings) values ($1, $2, $3, 'x@t.org', false, '{"audience":"staff","purpose":"team","team":{"id":"t_priv","name":"Staff"}}') returning id`, [nid, OWNER, name])))[0].id;
  const tok = async (cid) => (await q(`select token from public.participants where case_id=$1`, [cid]))[0].token;
  const key = async (cid) => (await q(`select k.key from public.report_keys k join public.participants p on p.id = k.participant_id where p.case_id=$1`, [cid]))[0]?.key;
  const sum = (h) => JSON.stringify({ pillars: { character: h, health: h - 10, bogus: "x" }, wiring: { pace: h, people: 100 - h }, giftsTop: ["lead", "teach", "help", "extra"], giftsStrong: ["lead"], strengths: ["integrity"], growth: ["load"], team: { th_trust: h, th_care: h - 40, bogus: "x" } });
  const t1 = await teamCase("Tia One"), t2 = await teamCase("Tom Two"), t3 = await teamCase("Tess Three");
  const oldLink = await tok(t1);  // a leader could have copied this before Tia finished
  const k1 = (await as(null, () => q(`select public.pl_finish_team($1, '{"meta":{"name":"Tia One"},"likert":{"x":5},"privateNote":"secret"}') as k`, [oldLink])))[0].k;
  ok(k1 && k1.length === 64 && k1 !== oldLink && k1 === (await key(t1)), "team: finishing hands the person a private report key, different from their link");
  ok((await as(null, () => q(`select public.pl_finish_team($1, '{}') as k`, [oldLink])))[0].k === null, "team: the key is handed out only once, to the browser that finished");
  ok((await as(OWNER, () => q(`select public.pl_report($1) as j`, [oldLink])))[0].j === null && (await as(null, () => q(`select public.pl_report($1) as j`, [oldLink])))[0].j === null, "team: a leader holding the old link can't open the report after they finish");
  const r1 = (await as(null, () => q(`select public.pl_report($1) as j`, [k1])))[0].j;
  ok(r1?.released && r1.me.likert.x === 5 && !r1.me.privateNote, "team: the person opens their own report with their key");
  ok(JSON.stringify(await as(OWNER, () => q(`select * from public.pl_team_people($1)`, [t1]))).indexOf(k1) < 0 && JSON.stringify(await as(OWNER, () => q(`select public.pl_team_map($1, 't_priv') as j`, [nid]))).indexOf(k1) < 0, "team: the key never shows in anything the leader reads");
  ok(!!(await tryAs(OWNER, `select * from public.report_keys`)) && !!(await tryAs(null, `select * from public.report_keys`)), "team: nobody can read the keys table directly");
  ok(!(await as(null, () => q(`select public.pl_team_share($1, true) as ok`, [oldLink])))[0].ok, "team: the old link can't switch sharing on");
  ok((await as(OWNER, () => q(`select * from public.participants where case_id=$1`, [t1]))).length === 0, "team: the leader can't read a team member's row (answers) directly");
  const tp = (await as(OWNER, () => q(`select * from public.pl_team_people($1)`, [t1])))[0];
  ok(tp && !tp.token && tp.status === "finished" && JSON.stringify(tp.answers) === "{}", "team: once someone finishes, the leader sees progress, not their answers or their link");
  await tryAs(OWNER, `update public.participants set shared = true where case_id = $1`, [t1]);
  ok((await q(`select shared from public.participants where case_id=$1`, [t1]))[0].shared === false, "team: the leader can't turn sharing on for someone");
  ok(!(await q(`select public.pl_team_save_summary($1, $2::jsonb) as ok`, [await tok(t2), sum(70)]))[0].ok && !(await key(t2)), "team: no key and no summary until the person has finished");
  ok(!!(await as(OWNER, () => q(`select token from public.pl_team_people($1)`, [t2])))[0].token, "team: before someone finishes, the leader can copy their link to resend it");
  ok(!(await q(`select public.pl_team_share($1, true) as ok`, [await tok(t2)]))[0].ok, "team: sharing can't be switched on before the person finishes");
  ok(!(await q(`select public.pl_team_save_summary($1, $2::jsonb) as ok`, [oldLink, sum(10)]))[0].ok, "team: the old link can't change the team map summary");
  await q(`select public.pl_team_save_summary($1, $2::jsonb)`, [k1, sum(80)]);
  const s1 = (await q(`select team_summary from public.participants where case_id=$1`, [t1]))[0].team_summary;
  ok(s1.pillars.character === 80 && s1.pillars.bogus === undefined && s1.giftsTop.length === 3 && !JSON.stringify(s1).includes("secret"), "team: the saved summary keeps only clean scores");
  ok(s1.team.th_trust === 80 && s1.team.th_care === 40 && s1.team.bogus === undefined, "our team: the summary keeps clean team-health scores");
  let m = (await as(OWNER, () => q(`select public.pl_team_map($1, 't_priv') as j`, [nid])))[0].j;
  ok(m.total === 3 && m.finished === 1 && m.combined === null && m.shared.length === 0, "team map: nothing combined until 3 people finish");
  for (const [c, h] of [[t2, 60], [t3, 70]]) { await q(`select public.pl_finish($1, '{"meta":{}}')`, [await tok(c)]); await q(`select public.pl_team_save_summary($1, $2::jsonb)`, [await key(c), sum(h)]); }
  ok(!!(await key(t2)), "team: a key is made even if they finished through the older finish call");
  m = (await as(OWNER, () => q(`select public.pl_team_map($1, 't_priv') as j`, [nid])))[0].j;
  ok(m.combined && m.combined.n === 3 && Number(m.combined.pillars.character) === 70 && m.combined.wiring.pace.right === 2 && m.combined.wiring.pace.mid === 1 && Number(m.combined.healthLow) === 2, "team map: combined averages and counts once 3 finish");
  ok(!JSON.stringify(m).includes("Tia") && m.shared.length === 0, "team map: no names unless someone shares");
  ok(Number(m.combined.teamN) === 3 && Number(m.combined.team.th_trust) === 70 && Number(m.combined.team.th_care) === 30 && Number(m.combined.teamLow.th_care) === 3 && Number(m.combined.teamLow.th_trust) === 0, "our team: the team map shows the team's average and how many rate an area low");
  ok((await as(OWNER, () => q(`select * from public.pl_team_people($1)`, [t1])))[0].answers.likert === undefined, "team: unshared, the leader can't see their report");
  ok(await as(null, () => q(`select public.pl_team_share($1, true) as ok`, [k1])).then((r) => r[0].ok), "team: the person can share with their key");
  m = (await as(OWNER, () => q(`select public.pl_team_map($1, 't_priv') as j`, [nid])))[0].j;
  const tp2 = (await as(OWNER, () => q(`select * from public.pl_team_people($1)`, [t1])))[0];
  ok(m.shared.length === 1 && m.shared[0].name === "Tia One" && tp2.answers.likert && tp2.answers.privateNote === undefined, "team: once shared, the leader sees their report, never their private note");
  ok(tp2.answers.teamh === undefined && m.shared[0].summary.team === undefined && m.shared[0].summary.pillars, "our team: even when shared, one person's view of the team never reaches the leader");
  ok((await as(OWNER, () => q(`select public.pl_report($1) as j`, [oldLink])))[0].j === null, "team: even when shared, the old link still doesn't open the person's own report page");
  await q(`select public.pl_team_share($1, false)`, [k1]);
  ok(JSON.stringify((await as(OWNER, () => q(`select * from public.pl_team_people($1)`, [t1])))[0].answers) === "{}", "team: they can stop sharing");
  ok((await as(OUTSIDER, () => q(`select public.pl_team_map($1, 't_priv') as j`, [nid])))[0].j === null && (await as(OUTSIDER, () => q(`select * from public.pl_team_people($1)`, [t1]))).length === 0, "team: other networks see nothing");
  const other = (await q(`select p.token, p.case_id from public.participants p join public.cases c on c.id = p.case_id where c.network_id = $1 and coalesce(c.settings->>'purpose', 'decide') <> 'team' limit 1`, [nid]))[0];
  ok(!(await q(`select public.pl_team_share($1, true) as ok`, [other.token]))[0].ok, "sharing only applies to team members");
  // Lost key: it's emailed only to the person's own address, at most once an hour, and the leader can't change that address now
  const t1id = (await q(`select id from public.participants where case_id=$1`, [t1]))[0].id;
  ok(!(await as(OWNER, () => q(`select public.pl_team_set_email($1, 'leader@net.org') as ok`, [t1id])))[0].ok, "team: a leader can't change a finished person's email (where their key is sent)");
  ok(!!(await tryAs(null, `select * from public.pl_report_key_email($1)`, [oldLink])), "team: only the email function can look up a key to send");
  const ke = await q(`select * from public.pl_report_key_email($1)`, [oldLink]);
  ok(ke.length === 1 && ke[0].email === "x@t.org" && ke[0].report_key === k1, "team: the email function gets the person's own address and key");
  ok((await q(`select * from public.pl_report_key_email($1)`, [oldLink])).length === 0, "team: the key email goes at most once an hour");
  const t4 = await teamCase("Old Finisher"); await q(`update public.participants set status='finished' where case_id=$1`, [t4]); await q(`delete from public.report_keys k using public.participants p where p.id = k.participant_id and p.case_id=$1`, [t4]);
  ok((await q(`select * from public.pl_report_key_email($1)`, [await tok(t4)]))[0]?.report_key?.length === 64, "team: someone who finished before keys existed gets one by email");
  const tk1 = await tok(t1);
  ok((await as(OWNER, () => q(`select public.pl_result_team($1 || '/f.pdf', false) as ok`, [tk1])))[0].ok === false, "team: files they uploaded stay private unless shared");
  ok((await as(OWNER, () => q(`select count(*)::int n from public.participants where case_id=$1`, [other.case_id])))[0].n >= 1, "hiring and planting assessments still show their people to the leader");

  // Plumbline Teams yearly plans
  const pnet = (await as(ASSESSOR, () => q(`select public.pl_create_network('Plan Test Church', 'Pat') as id`)))[0].id;
  await q(`update public.networks set credits = 0 where id=$1`, [pnet]);
  const teamIns = (name) => tryAs(ASSESSOR, `insert into public.cases(network_id, created_by, planter_name, married, settings) values ($1, $2, '${name}', false, '{"audience":"staff","purpose":"team","team":{"id":"t_plan","name":"Staff"}}')`, [pnet, ASSESSOR]);
  ok(/No assessments left/.test((await teamIns("A")) || ""), "teams plan: without a plan or credits, no one can be added");
  ok(!!(await tryAs(ASSESSOR, `update public.networks set team_seats = 99, team_until = now() + interval '1 year' where id = $1`, [pnet])) || (await q(`select team_seats from public.networks where id=$1`, [pnet]))[0].team_seats === 0, "teams plan: a leader can't give themselves a plan");
  await q(`set role service_role`);
  const planPay1 = (await q(`select public.pl_record_payment('cs_team1', $1, 'teams', 2, 24900, 'usd', null, null, 'cus_team') as ok`, [pnet]))[0].ok;
  const planPay2 = (await q(`select public.pl_record_payment('cs_team1', $1, 'teams', 2, 24900, 'usd', null, null, 'cus_team') as ok`, [pnet]))[0].ok;
  await q(`reset role`);
  const pn = (await q(`select team_seats, team_until > now() + interval '360 days' as year from public.networks where id=$1`, [pnet]))[0];
  ok(planPay1 === true && planPay2 === false && pn.team_seats === 2 && pn.year, "teams plan: Stripe's payment sets the plan size for a year, once");
  ok(!(await teamIns("A")) && !(await teamIns("B")), "teams plan: covers people up to its size without credits");
  ok(/No assessments left/.test((await teamIns("C")) || ""), "teams plan: past its size, it asks for more");
  ok(/No assessments left/.test((await tryAs(ASSESSOR, `insert into public.cases(network_id, created_by, planter_name, married) values ($1, $2, 'Hire', false)`, [pnet, ASSESSOR])) || ""), "teams plan: doesn't cover hiring or planting assessments");
  await q(`update public.cases set archived = true where network_id=$1 and planter_name='A'`, [pnet]);
  ok(!(await teamIns("C")), "teams plan: removing someone frees their place");
  await q(`set role service_role`);
  await q(`select public.pl_record_payment('in_team2', null, 'teams_renewal', 15, 44900, 'usd', null, null, 'cus_team')`);
  await q(`reset role`);
  const pr = (await q(`select team_seats, team_until > now() + interval '700 days' as two from public.networks where id=$1`, [pnet]))[0];
  ok(pr.team_seats === 15 && pr.two, "teams plan: a renewal (found by Stripe customer) adds a year and can change the size");

  // Free beta and founders (owner, 26 Oct 2026)
  await q(`update public.networks set credits = 0, plan_until = null, team_seats = 0, team_until = null where id=$1`, [pnet]);
  await q(`select set_config('pl.today', '2026-11-15', false)`);
  const betaErrs = [await tryAs(ASSESSOR, `insert into public.cases(network_id, created_by, planter_name, married) values ($1, $2, 'Beta hire', false)`, [pnet, ASSESSOR]), await teamIns("Beta1"), await teamIns("Beta2")];
  if (betaErrs.some(Boolean)) console.log("beta errors:", betaErrs, (await q(`select public.pl_today()::text t, current_setting('pl.today', true) s`))[0]);
  ok(!betaErrs.some(Boolean),
    "beta: assessments and team members are free through Dec 31, 2026, with no credits or plan");
  ok((await q(`select credits from public.networks where id=$1`, [pnet]))[0].credits === 0, "beta: no credit is used");
  await q(`select set_config('pl.today', '2026-12-31', false)`);
  ok(!(await teamIns("Beta3")), "beta: still free on Dec 31 (Mountain time)");
  await q(`select set_config('pl.today', '2027-01-01', false)`);
  ok(/No assessments left/.test((await teamIns("After")) || ""), "after the beta: a plan or credits are needed again");
  await q(`select set_config('pl.today', '2027-06-01', false)`);
  ok((await as(ASSESSOR, () => q(`select public.pl_is_founder($1) f`, [pnet])))[0].f === true, "founders: a network set up before launch gets founder pricing in 2027");
  await q(`select set_config('pl.today', '2028-01-01', false)`);
  ok((await as(ASSESSOR, () => q(`select public.pl_is_founder($1) f`, [pnet])))[0].f === false, "founders: back to regular prices on Jan 1, 2028");
  await q(`select set_config('pl.today', '2027-06-01', false)`);
  await q(`update public.networks set created_at = '2027-01-02 12:00' where id=$1`, [pnet]);
  ok((await as(ASSESSOR, () => q(`select public.pl_is_founder($1) f`, [pnet])))[0].f === false, "founders: joining Jan 2, after the beta ended, isn't a founder");
  await q(`update public.networks set created_at = '2026-12-31 20:00-07' where id=$1`, [pnet]);
  ok((await as(ASSESSOR, () => q(`select public.pl_is_founder($1) f`, [pnet])))[0].f === true, "founders: joining on Dec 31 (Mountain time) is a founder");
  await q(`update public.networks set created_at = '2027-02-01' where id=$1`, [pnet]);
  await q(`select set_config('pl.today', '2027-06-01', false)`);
  ok((await as(ASSESSOR, () => q(`select public.pl_is_founder($1) f`, [pnet])))[0].f === false, "founders: a network set up after launch pays regular prices");
  ok(!!(await tryAs(null, `select public.pl_is_founder($1)`, [pnet])), "founders: only signed-in people can ask");
  await q(`select set_config('pl.today', '2027-02-01', false)`);

  // Delete my account
  ok(!!(await tryAs(null, `select public.pl_delete_account()`)), "you must be signed in to delete an account");
  await as(OUTSIDER, () => q(`select public.pl_delete_account()`));
  ok((await q(`select count(*)::int n from public.networks where id=$1`, [otherNet]))[0].n === 0 && (await q(`select count(*)::int n from auth.users where id=$1`, [OUTSIDER]))[0].n === 0, "deleting your account removes a network you lead alone, and your login");
  const netId = (await q(`select network_id from public.network_members where user_id=$1 and role='owner'`, [OWNER]))[0].network_id;
  await as(OWNER, () => q(`select public.pl_delete_account()`));
  const owners = await q(`select user_id from public.network_members where network_id=$1 and role='owner'`, [netId]);
  ok(owners.length === 1 && owners[0].user_id !== OWNER && (await q(`select count(*)::int n from public.networks where id=$1`, [netId]))[0].n === 1, "when an owner leaves, the network stays and someone else becomes owner");

  // Report coach: a daily count per key, only the coach function (service role) can touch it
  await q(`set role service_role`);
  const ticks = [];
  for (let i = 0; i < 4; i++) ticks.push((await q(`select public.pl_coach_tick('t:abc', 3) ok`))[0].ok);
  await q(`reset role`);
  ok(ticks.join() === "true,true,true,false", "coach: the daily limit stops the 4th question when the limit is 3");
  ok(!!(await tryAs(null, `select public.pl_coach_tick('t:abc', 99)`)) && !!(await tryAs(ASSESSOR, `select public.pl_coach_tick('t:abc', 99)`)), "coach: visitors and signed-in people can't touch the count");

  process.exit(failed ? 1 : 0);
}
