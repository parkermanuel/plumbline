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
  ok(!!nid, "owner creates a network");
  await q(`select public.pl_add_couples('seed-credits', $1, 10, 0)`, [nid]); // the main flow below adds several couples
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

  // Billing: first couple free, then purchased credits (owner, 23 Oct 2026)
  {
    const FREE = "55555555-5555-5555-5555-555555555555";
    await db.exec(`insert into auth.users values ('${FREE}','new@net.org')`);
    const bn = (await as(FREE, () => q(`select public.pl_create_network('New Network') as id`)))[0].id;
    const add = (name) => tryAs(FREE, `insert into public.cases(network_id, created_by, planter_name, married) values ($1, $2, '${name}', false)`, [bn, FREE]);
    ok(!(await add("First")), "first couple is free");
    const second = await add("Second");
    ok(second && second.includes("PL_NEEDS_PURCHASE"), "second couple needs a purchase");
    ok((await as(FREE, () => q(`select couples_used, couples_bought from public.network_billing where network_id=$1`, [bn])))[0].couples_used === 1, "team can read its balance");
    ok(!!(await tryAs(FREE, `update public.network_billing set couples_bought = 99 where network_id=$1`, [bn])) || (await q(`select couples_bought from public.network_billing where network_id=$1`, [bn]))[0].couples_bought === 0, "team can't give itself credits");
    ok(!!(await tryAs(FREE, `select public.pl_add_couples('cs_fake', $1, 5, 0)`, [bn])), "team can't call the credit function");
    ok((await as(OUTSIDER, () => q(`select count(*)::int n from public.network_billing where network_id=$1`, [bn])))[0].n === 0, "outsider can't see another network's balance");
    ok((await q(`select public.pl_add_couples('cs_1', $1, 2, 13200) as r`, [bn]))[0].r === true, "webhook adds two couples");
    ok((await q(`select public.pl_add_couples('cs_1', $1, 2, 13200) as r`, [bn]))[0].r === false, "a retried webhook adds nothing");
    ok(!(await add("Second")) && !(await add("Third")), "purchased couples can be used");
    ok(((await add("Fourth")) || "").includes("PL_NEEDS_PURCHASE"), "stops again when credits run out");
    const first = (await q(`select id from public.cases where network_id=$1 and planter_name='First'`, [bn]))[0].id;
    await as(FREE, () => q(`delete from public.cases where id=$1`, [first]));
    ok(((await add("Again")) || "").includes("PL_NEEDS_PURCHASE"), "deleting a case doesn't return the credit");
  }

  process.exit(failed ? 1 : 0);
}
