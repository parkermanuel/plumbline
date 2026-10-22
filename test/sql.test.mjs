import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
const db = new PGlite();
// Stub the parts of Supabase the script relies on
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
  create publication supabase_realtime;
`);
const sql = readFileSync("supabase/setup.sql", "utf8");
await db.exec(sql);
await db.exec(sql); // must be safe to run twice
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok -", m); };
const q = async (s, p) => (await db.query(s, p)).rows;

const L1 = "11111111-1111-1111-1111-111111111111", L2 = "22222222-2222-2222-2222-222222222222";
await db.exec(`insert into auth.users values ('${L1}'), ('${L2}')`);
const [c] = await q(`insert into public.cases(leader_id, planter_name, spouse_name, married, network_name) values ($1,'Josh Kim','Hannah Kim',true,'Front Range') returning *`, [L1]);
const people = await q(`select role, token from public.participants where case_id=$1 order by role`, [c.id]);
ok(people.length === 2 && people[0].role === "planter" && people[1].role === "spouse", "case creates planter and spouse rows");
const tokP = people[0].token, tokS = people[1].token;

const open = (await q(`select public.pl_open($1) as j`, [tokP]))[0].j;
ok(open.participant.role === "planter" && open.case.spouseName === "Hannah Kim", "pl_open returns person and case");
ok((await q(`select public.pl_open('nope') as j`))[0].j === null, "bad token returns nothing");

const ansP = { meta: { name: "Josh Kim", consentedAt: "2026-10-22" }, likert: { c1: 5 }, couple: { cp1: 5, ct1: 5, cmo3: 1 }, wiring: { pace: [5, 4, 5, 5] }, privateNote: "" };
ok((await q(`select public.pl_save($1,$2,40,200,'Called') as r`, [tokP, ansP]))[0].r === true, "save works");
let [row] = await q(`select status, progress, chapter, consented_at from public.participants where token=$1`, [tokP]);
ok(row.status === "started" && row.progress === 20 && row.chapter === "Called" && row.consented_at, "progress 20% saved, status started, consent stamped");

const ansS = { meta: { name: "Hannah Kim" }, likert: { sc3: 5 }, couple: { cp1: 2, ct1: 2, cmo3: 4 }, guess: { cp1: 5 }, wiring: { pace: [2, 2, 3, 2] }, privateNote: "secret", safety: { sf3: 4 }, spouseSees: { ob_call: 3 } };
await q(`select public.pl_finish($1,$2)`, [tokP, ansP]);
await q(`select public.pl_finish($1,$2)`, [tokS, ansS]);
ok((await q(`select public.pl_save($1,$2,1,2,'x') as r`, [tokP, {}]))[0].r === false, "finished answers are sealed");

let rep = (await q(`select public.pl_report($1) as j`, [tokP]))[0].j;
ok(rep.released === false, "report hidden until leader releases it");
await q(`update public.cases set reports_released = true where id=$1`, [c.id]);
rep = (await q(`select public.pl_report($1) as j`, [tokP]))[0].j;
const otherStr = JSON.stringify(rep.other);
ok(rep.released && rep.role === "planter" && rep.me.likert.c1 === 5, "planter gets own answers");
ok(!otherStr.includes("secret") && !rep.other.likert && !rep.other.safety && !rep.other.guess && !rep.other.spouseSees && !rep.other.privateNote, "spouse private note, safety, likert, guesses never reach planter");
ok(Math.abs(rep.other.wiring.pace[0] - 2.25) < 0.01, "spouse wiring shared only as an average");
ok(Math.abs(rep.other.couple.cp1 - 2) < 0.01 && Math.abs(rep.other.couple.cmo3 - 4) < 0.01, "couple shared as area averages (reverse items handled)");
const repS = (await q(`select public.pl_report($1) as j`, [tokS]))[0].j;
ok(repS.role === "spouse" && !repS.me.privateNote && !repS.me.safety, "spouse report omits safety/private even of self");

const refTok = await q(`select public.pl_join_reference($1,'Ref One') as t`, [c.ref_token]);
ok(refTok[0].t && (await q(`select role from public.participants where token=$1`, [refTok[0].t]))[0].role === "reference", "reference link creates a reference row");
ok((await q(`select public.pl_report($1) as j`, [refTok[0].t]))[0].j === null, "references cannot read reports");

// RLS: leader 2 sees nothing of leader 1
await db.exec(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;`);
await db.exec(`set role authenticated; select set_config('request.uid', '${L2}', false);`);
ok((await q(`select count(*)::int n from public.cases`))[0].n === 0, "RLS: other leader sees no cases");
ok((await q(`select count(*)::int n from public.participants`))[0].n === 0, "RLS: other leader sees no people");
await db.exec(`select set_config('request.uid', '${L1}', false);`);
ok((await q(`select count(*)::int n from public.participants`))[0].n === 3, "RLS: owner sees planter, spouse and reference");
await db.exec(`reset role;`);
