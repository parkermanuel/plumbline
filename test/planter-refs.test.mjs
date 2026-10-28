// The planter names their own references from their link (owner, 28 Oct 2026).
import { makeDb } from "./sql.test.mjs";
const db = await makeDb();
await db.exec(`select set_config('pl.today', '2026-11-01', false)`);  // free beta
let failed = 0;
const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) failed++; };
const q = async (s, p) => (await db.query(s, p)).rows;
const as = async (uid, fn) => { await db.exec(`set role ${uid ? "authenticated" : "anon"}; select set_config('request.uid', '${uid || ""}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); } };
const err = async (uid, sql, p) => { try { await as(uid, () => db.query(sql, p)); return ""; } catch (e) { return e.message; } };

const OWNER = "11111111-1111-1111-1111-111111111111", OUTSIDER = "33333333-3333-3333-3333-333333333333";
await db.exec(`insert into auth.users values ('${OWNER}','owner@net.org'), ('${OUTSIDER}','x@o.org')`);
const nid = (await as(OWNER, () => q(`select public.pl_create_network('Front Range', 'Dana') as id`)))[0].id;
const cid = (await as(OWNER, () => q(`insert into public.cases(network_id, created_by, planter_name, spouse_name, planter_email, spouse_email, married) values ($1,$2,'Josh Kim','Hannah Kim','josh@k.com','hannah@k.com',true) returning id`, [nid, OWNER])))[0].id;
const tok = Object.fromEntries((await q(`select role, token from public.participants where case_id=$1`, [cid])).map((r) => [r.role, r.token]));

const add = (t, n, e, r = "Mentor", c = "Discipled me in college") => as(null, () => q(`select public.pl_add_my_ref($1,$2,$3,$4,$5) as id`, [t, n, e, r, c]));
const r1 = (await add(tok.planter, "Mike Lee", "Mike@Lee.com"))[0].id;
ok(!!r1, "the planter adds a reference from their own link, no sign-in");
const row = (await q(`select role, email, added_by, ref_relationship, ref_context, status, token from public.participants where id=$1`, [r1]))[0];
ok(row.role === "reference" && row.email === "mike@lee.com" && row.added_by === "planter" && row.ref_relationship === "Mentor" && row.ref_context === "Discipled me in college" && row.status === "invited" && row.token.length > 40, "saved as an invited reference with how they know them and the context");
ok(/can't add references/.test(await err(null, `select public.pl_add_my_ref($1,'X','x@y.com','Friend','')`, [tok.spouse])), "the spouse's link can't add references");
ok(/can't add references/.test(await err(null, `select public.pl_add_my_ref($1,'X','x@y.com','Friend','')`, [row.token])), "a reference's link can't add references");
ok(/already on this assessment/.test(await err(null, `select public.pl_add_my_ref($1,'Again','mike@lee.com','Friend','')`, [tok.planter])), "no duplicate emails");
ok(/already on this assessment/.test(await err(null, `select public.pl_add_my_ref($1,'Me','hannah@k.com','Friend','')`, [tok.planter])), "can't name the spouse as a reference");
ok(/Check their email/.test(await err(null, `select public.pl_add_my_ref($1,'Bad','not-an-email','Friend','')`, [tok.planter])), "checks the email address");
// Leaders see who the planter added and why; leaders still add their own
const seen = (await as(OWNER, () => q(`select ref_relationship, ref_context, added_by from public.participants where id=$1`, [r1])))[0];
ok(seen.ref_context === "Discipled me in college" && seen.added_by === "planter", "the leader sees the planter's context");
await as(OWNER, () => q(`insert into public.participants(case_id, role, name, email) values ($1,'reference','Leader Pick','lp@net.org')`, [cid]));
const mine = (await as(null, () => q(`select public.pl_my_refs($1) as j`, [tok.planter])))[0].j;
ok(mine.length === 2 && mine[0].mine === true && mine[0].email === "mike@lee.com" && mine[1].mine === false && mine[1].email === null && !("answers" in mine[0]), "planter's list: their own with email, the leader's without, never answers");
ok((await as(null, () => q(`select public.pl_my_refs($1) as j`, [tok.spouse])))[0].j.length === 0, "the spouse's link lists nothing");
// Emails: service role only; once a day; replies go to the planter
ok(!!(await err(null, `select * from public.pl_my_ref_email($1,$2)`, [tok.planter, r1])), "the public can't trigger the email query directly");
await q(`set role service_role`);
const e1 = await q(`select * from public.pl_my_ref_email($1,$2)`, [tok.planter, r1]);
const e2 = await q(`select * from public.pl_my_ref_email($1,$2)`, [tok.planter, r1]);
await q(`reset role`);
ok(e1.length === 1 && e1[0].sender_email === "owner@net.org" && e1[0].sender_name === "Dana" && e1[0].email === "mike@lee.com" && e2.length === 0, "invite goes out once, from the network leader; replies go to the leader, never the planter");
// Remove: only their own, only before the person starts
const r2 = (await add(tok.planter, "Sara Fox", "sara@fox.com", "Boss or supervisor", ""))[0].id;
ok((await q(`select ref_context from public.participants where id=$1`, [r2]))[0].ref_context === null, "context is optional");
const lp = (await q(`select id from public.participants where email='lp@net.org'`))[0].id;
ok((await as(null, () => q(`select public.pl_remove_my_ref($1,$2) as r`, [tok.planter, lp])))[0].r === false, "can't remove a reference the leader added");
const sTok = (await q(`select token from public.participants where id=$1`, [r2]))[0].token;
await as(null, () => q(`select public.pl_save($1,'{"meta":{"name":"Sara"}}',1,10,'x')`, [sTok]));
ok((await as(null, () => q(`select public.pl_remove_my_ref($1,$2) as r`, [tok.planter, r2])))[0].r === false, "can't remove someone who already started");
const r3 = (await add(tok.planter, "Tom Ray", "tom@ray.com", "Friend", ""))[0].id;
ok((await as(null, () => q(`select public.pl_remove_my_ref($1,$2) as r`, [tok.planter, r3])))[0].r === true, "can remove someone not started yet");
// Cap of 8
for (let i = 0; i < 5; i++) await add(tok.planter, "P" + i, `p${i}@x.com`, "Friend", "");
ok(/8 references/.test(await err(null, `select public.pl_add_my_ref($1,'Nine','nine@x.com','Friend','')`, [tok.planter])), "at most 8 references");
// Teams links can't add references
const tcase = (await as(OWNER, () => q(`insert into public.cases(network_id, created_by, planter_name, planter_email, married, settings) values ($1,$2,'Team Member','tm@t.com',false,'{"purpose":"team","team":{"id":"t1","name":"Staff"},"audience":"staff"}') returning id`, [nid, OWNER])))[0].id;
const ttok = (await q(`select token from public.participants where case_id=$1`, [tcase]))[0].token;
ok(/can't add references/.test(await err(null, `select public.pl_add_my_ref($1,'X','x@y.com','Friend','')`, [ttok])), "Plumbline Teams links can't add references");
if (failed) { console.error(`${failed} planter-reference check(s) failed`); process.exit(1); }
console.log("\nAll planter-reference checks passed");
