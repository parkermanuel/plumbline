// Should I Plant? step 2 (28 Oct 2026): on his own "self" case he never reads his wife's or a reference's answers.
import { makeDb } from "./sql.test.mjs";
const db = await makeDb();
await db.exec(`select set_config('pl.today', '2026-11-01', false)`);
let failed = 0;
const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) failed++; };
const q = async (s, p) => (await db.query(s, p)).rows;
const as = async (uid, fn) => { await db.exec(`set role ${uid ? "authenticated" : "anon"}; select set_config('request.uid', '${uid || ""}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); } };
const err = async (uid, sql, p) => { try { await as(uid, () => db.query(sql, p)); return ""; } catch (e) { return e.message; } };

const ME = "11111111-1111-1111-1111-111111111111", OTHER = "33333333-3333-3333-3333-333333333333";
await db.exec(`insert into auth.users values ('${ME}','ryan@x.com'), ('${OTHER}','o@x.com')`);
const nid = (await as(ME, () => q(`select public.pl_create_network('Ryan · Should I Plant?', 'Ryan') as id`)))[0].id;
const cid = (await as(ME, () => q(`insert into public.cases(network_id, created_by, planter_name, spouse_name, married, settings) values ($1,$2,'Ryan Holland','Brooke',true,'{"purpose":"self","audience":"planting"}') returning id`, [nid, ME])))[0].id;
const tok = Object.fromEntries((await q(`select role, token from public.participants where case_id=$1`, [cid])).map((r) => [r.role, r.token]));

// He sees only his own row
const rows = await as(ME, () => q(`select role from public.participants where case_id=$1`, [cid]));
ok(rows.length === 1 && rows[0].role === "planter", "on his own case he reads only his own answers row");

// Invite his wife
const sid = (await as(ME, () => q(`select public.pl_self_spouse($1,'Brooke Holland','Brooke@X.com') as id`, [cid])))[0].id;
ok(!!sid && (await q(`select email from public.participants where id=$1`, [sid]))[0].email === "brooke@x.com", "he can invite his wife by email");
ok(/Not allowed/.test(await err(OTHER, `select public.pl_self_spouse($1,'X','x@y.com')`, [cid])), "nobody else can");
const people = await as(ME, () => q(`select role, name, status from public.pl_self_people($1)`, [cid]));
ok(people.length === 2 && people.some((p) => p.role === "spouse" && p.name === "Brooke Holland"), "he sees who is taking part and their progress");

// She finishes; he still can't read her answers
await as(null, () => q(`select public.pl_finish($1, $2)`, [tok.spouse, { safety: { s1: 1 }, privateNote: "for the leader", likert: { a: 3 } }]));
ok((await as(ME, () => q(`select answers from public.participants where case_id=$1 and role='spouse'`, [cid]))).length === 0, "he can't read his wife's answers, private note or safety answers");
ok(/not allowed|denied|0 rows|^$/i.test(await err(ME, `update public.participants set email='z@z.com' where case_id=$1 and role='spouse'`, [cid])) && (await q(`select email from public.participants where id=$1`, [sid]))[0].email === "brooke@x.com", "he can't edit her row directly");

// References: averages only, and only from 3
const add = (n, e) => as(null, () => q(`select public.pl_add_my_ref($1,$2,$3,'Mentor','') as id`, [tok.planter, n, e]));
const r = [];
for (const [n, e] of [["A", "a@x.com"], ["B", "b@x.com"], ["C", "c@x.com"]]) r.push((await add(n, e))[0].id);
const rt = (await q(`select id, token from public.participants where id = any($1)`, [r])).map((x) => x.token);
await as(null, () => q(`select public.pl_finish($1,$2)`, [rt[0], { items: { rf_call: 5, rf_vision: 4 }, follow: 5, ready: 0, strength: "secret words" }]));
await as(null, () => q(`select public.pl_finish($1,$2)`, [rt[1], { items: { rf_call: 3, rf_vision: 0 }, follow: 3, ready: 1 }]));
const two = (await as(ME, () => q(`select public.pl_self_ref_averages($1) as j`, [cid])))[0].j;
ok(two.ready === false && two.n === 2 && !two.items, "nothing shows until 3 references finish");
await as(null, () => q(`select public.pl_finish($1,$2)`, [rt[2], { items: { rf_call: 4 }, follow: 4, ready: 0 }]));
const three = (await as(ME, () => q(`select public.pl_self_ref_averages($1) as j`, [cid])))[0].j;
ok(three.ready === true && three.n === 3 && Number(three.items.rf_call.avg) === 4 && three.items.rf_call.n === 3 && !three.items.rf_vision && Number(three.follow) === 4, "then averages per item; an item fewer than 3 rated stays hidden");
ok(!JSON.stringify(three).includes("secret"), "written comments never come back");
ok((await as(ME, () => q(`select id from public.participants where case_id=$1 and role='reference'`, [cid]))).length === 0, "he can't read any one reference's row");
ok(/Not allowed/.test(await err(OTHER, `select public.pl_self_ref_averages($1)`, [cid])), "nobody else gets the averages");

// A normal network case is unchanged
const ncid = (await as(ME, () => q(`insert into public.cases(network_id, created_by, planter_name, spouse_name, married) values ($1,$2,'Josh','Hannah',true) returning id`, [nid, ME])))[0].id;
ok((await as(ME, () => q(`select role from public.participants where case_id=$1`, [ncid]))).length === 2, "network assessments still show the leader everyone");
ok(/Not allowed/.test(await err(ME, `select * from public.pl_self_people($1)`, [ncid])), "the self-only functions refuse network assessments");

if (failed) { console.error(`${failed} solo check(s) failed`); process.exit(1); }
console.log("\nAll Should I Plant? privacy checks passed");
