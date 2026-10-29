// Paying for Should I plant? and personal development (29 Oct 2026). After the free beta: $49 him alone, $99 with his
// wife and references, $50 to add them later; personal development $29. One purchase starts one assessment.
import { makeDb } from "./sql.test.mjs";
const db = await makeDb();
let failed = 0;
const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) failed++; };
const q = async (s, p) => (await db.query(s, p)).rows;
const day = (d) => db.exec(`select set_config('pl.today', '${d}', false)`);
const as = async (uid, fn) => { await db.exec(`set role ${uid ? "authenticated" : "anon"}; select set_config('request.uid', '${uid || ""}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); } };
const err = async (uid, sql, p) => { try { await as(uid, () => db.query(sql, p)); return ""; } catch (e) { return e.message; } };
const pay = async (id, net, kind) => { await q(`set role service_role`); try { return (await q(`select public.pl_record_payment($1,$2,$3,1,0,'usd',null,null,null) as r`, [id, net, kind]))[0].r; } finally { await q(`reset role`); } };

const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", C = "33333333-3333-3333-3333-333333333333", D = "44444444-4444-4444-4444-444444444444";
await db.exec(`insert into auth.users values ('${A}','a@x.com'), ('${B}','b@x.com'), ('${C}','c@x.com'), ('${D}','d@x.com')`);
const net = async (u, nm, settings) => { const id = (await as(u, () => q(`select public.pl_create_network($1, 'X') as id`, [nm])))[0].id; await as(u, () => q(`update public.networks set settings=$2 where id=$1`, [id, settings])); return id; };
const selfCase = (u, nid) => `insert into public.cases(network_id, created_by, planter_name, spouse_name, married, settings) values ('${nid}','${u}','Ryan','Brooke',true,'{"purpose":"self","audience":"planting"}') returning id`;

await day("2027-02-01");
// $49: him alone
const na = await net(A, "Ryan · Should I Plant?", { solo: true });
ok(/\$49/.test(await err(A, selfCase(A, na))), "after the beta, Should I plant? asks for payment before it starts (the free first credit doesn't count)");
ok(/permission|denied/i.test(await err(A, `update public.networks set self_plan='full' where id=$1`, [na])), "he can't mark it paid himself");
ok(await pay("cs_a1", na, "self_solo") === true && await pay("cs_a1", na, "self_solo") === false, "Stripe's payment counts once");
const ca = (await as(A, () => q(selfCase(A, na))))[0].id;
ok(!!ca, "$49 starts his assessment");
ok(/already have/.test(await err(A, selfCase(A, na))), "one purchase starts one assessment");
const tok = (await q(`select token from public.participants where case_id=$1 and role='planter'`, [ca]))[0].token;
ok(/\$50/.test(await err(A, `select public.pl_self_spouse($1,'Brooke','b@y.com')`, [ca])), "on $49 his wife isn't included");
ok(/\$50/.test(await err(null, `select public.pl_add_my_ref($1,'Ref','r@y.com','Mentor','')`, [tok])), "on $49 references aren't included");
ok(await pay("cs_a2", na, "self_upgrade") === true, "the $50 upgrade is recorded");
ok(!(await err(A, `select public.pl_self_spouse($1,'Brooke','b@y.com')`, [ca])) && !(await err(null, `select public.pl_add_my_ref($1,'Ref','r@y.com','Mentor','')`, [tok])), "after the upgrade he can invite his wife and references");

// $99: everything from the start
const nb = await net(B, "Josh · Should I Plant?", { solo: true });
await pay("cs_b1", nb, "self_full");
const cb = (await as(B, () => q(selfCase(B, nb))))[0].id;
ok(!(await err(B, `select public.pl_self_spouse($1,'Hannah','h@y.com')`, [cb])), "$99 includes his wife and references");

// Personal development, $29
const nc = await net(C, "Sam · Personal", { personal: true, kinds: ["teams"] });
const teamCase = (u, nid) => `insert into public.cases(network_id, created_by, planter_name, married, settings) values ('${nid}','${u}','Sam',false,'{"purpose":"team","audience":"staff","team":{"id":"me_abc","name":"Personal"}}') returning id`;
ok(/\$29/.test(await err(C, teamCase(C, nc))), "after the beta, personal development asks for $29 first");
await pay("cs_c1", nc, "personal");
ok(!!(await as(C, () => q(teamCase(C, nc))))[0].id, "$29 starts it");
ok(/already have/.test(await err(C, teamCase(C, nc))), "and only once");

// Started during the beta: keeps everything
await day("2026-11-15");
const nd = await net(D, "Ben · Should I Plant?", { solo: true });
const cd = (await as(D, () => q(selfCase(D, nd))))[0].id;
await day("2027-03-01");
ok(!(await err(D, `select public.pl_self_spouse($1,'Amy','amy@y.com')`, [cd])), "anything started during the beta keeps his wife and references, free");

// Ordinary network assessments are unchanged: the first is free, then credits
const ne = await net(D, "Front Range Network", {});
ok(!(await err(D, `insert into public.cases(network_id, created_by, planter_name, married) values ('${ne}','${D}','Joe',false)`)), "network assessments still use credits as before");

if (failed) { console.error(`${failed} payment check(s) failed`); process.exit(1); }
console.log("\nAll Should I plant? and personal development payment checks passed");
