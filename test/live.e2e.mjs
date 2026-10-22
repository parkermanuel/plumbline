// End-to-end test of the live site against a fake Supabase backed by a real in-memory Postgres (PGlite).
import { chromium } from "playwright";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

writeFileSync("/tmp/pl-test-config.json", JSON.stringify({ supabaseUrl: "https://test.supabase.co", supabaseAnonKey: "anon-test", siteUrl: "http://plumbline.test" }));
execSync("PL_CONFIG=/tmp/pl-test-config.json node build.mjs", { stdio: "inherit" });
const HTML = readFileSync("dist/index.html", "utf8");

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
  create publication supabase_realtime;`);
await db.exec(readFileSync("supabase/setup.sql", "utf8"));
await db.exec(`grant usage on schema public to anon, authenticated; grant all on all tables in schema public to authenticated;`);
const LEADER = "11111111-1111-1111-1111-111111111111";
await db.exec(`insert into auth.users values ('${LEADER}')`);

let lock = Promise.resolve();
const serial = (fn) => (lock = lock.then(fn, fn));
async function asUser(uid, fn) {
  return serial(async () => {
    if (uid) await db.exec(`set role authenticated; select set_config('request.uid', '${uid}', false);`);
    try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); }
  });
}
const uidFrom = (auth) => { try { return JSON.parse(Buffer.from(auth.split(" ")[1].split(".")[1], "base64url")).sub; } catch { return null; } };
const lit = (v) => (v === null || v === undefined ? "null" : typeof v === "number" ? String(v) : typeof v === "boolean" ? String(v) : typeof v === "object" ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : `'${String(v).replace(/'/g, "''")}'`);
const calls = [];

async function handle(route) {
  const req = route.request(); const url = new URL(req.url()); const method = req.method();
  const uid = uidFrom(req.headers()["authorization"] || "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  try {
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.split("/").pop(); const args = JSON.parse(req.postData() || "{}");
      calls.push(fn);
      const sql = `select public.${fn}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(", ")}) as r`;
      const rows = await serial(() => db.query(sql));
      return json(200, rows.rows[0].r);
    }
    const table = url.pathname.split("/").pop();
    const filters = [...url.searchParams].filter(([k]) => !["select", "order", "limit"].includes(k)).map(([k, v]) => { const [op, val] = [v.split(".")[0], v.slice(v.indexOf(".") + 1)]; return `${k} = ${lit(val)}`; });
    const where = filters.length ? " where " + filters.join(" and ") : "";
    const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    if (method === "GET") {
      const order = url.searchParams.get("order"); const ord = order ? ` order by ${order.split(".")[0]} ${order.includes("desc") ? "desc" : "asc"}` : "";
      const rows = await asUser(uid, () => db.query(`select * from public.${table}${where}${ord}`));
      return json(200, rows.rows);
    }
    if (method === "POST") {
      const body = JSON.parse(req.postData()); const cols = Object.keys(body);
      const rows = await asUser(uid, () => db.query(`insert into public.${table}(${cols.join(",")}) values (${cols.map((c) => lit(body[c])).join(",")}) returning *`));
      return json(201, single ? rows.rows[0] : rows.rows);
    }
    if (method === "PATCH") {
      const body = JSON.parse(req.postData());
      const rows = await asUser(uid, () => db.query(`update public.${table} set ${Object.entries(body).map(([k, v]) => `${k} = ${lit(v)}`).join(", ")}${where} returning *`));
      return json(200, rows.rows);
    }
    return json(404, { message: "not mocked" });
  } catch (err) { console.error("backend error", err.message); return json(400, { message: err.message }); }
}

const b = await chromium.launch();
const errs = [];
async function device(session) {
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.route("http://plumbline.test/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: HTML }));
  await ctx.route("https://test.supabase.co/rest/**", handle);
  await ctx.route("https://test.supabase.co/auth/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  if (session) {
    const payload = Buffer.from(JSON.stringify({ sub: LEADER, role: "authenticated", exp: 4102444800 })).toString("base64url");
    const tok = `x.${payload}.y`;
    const sess = { access_token: tok, refresh_token: "r", token_type: "bearer", expires_in: 3600 * 24 * 365 * 50, expires_at: 4102444800, user: { id: LEADER, email: "leader@test.org", aud: "authenticated", role: "authenticated" } };
    await ctx.addInitScript((s) => localStorage.setItem("sb-test-auth-token", JSON.stringify(s)), sess);
  }
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(String(e)));
  return p;
}
const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) process.exitCode = 1; };
const text = (p) => p.evaluate(() => document.querySelector("#app").innerText);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function answer(p, maxSteps, stopAtPct = 101) {
  for (let g = 0; g < maxSteps; g++) {
    const t = await p.evaluate(() => {
      const q = (s) => document.querySelectorAll(s);
      if (/Finished and sealed|Thank you/.test(document.querySelector("#app").innerText) && !document.querySelector(".qcard")) return "done";
      const intro = document.querySelector('.intro-card [data-act="next"]'); if (intro) { intro.click(); return "intro"; }
      const wf = document.querySelector("#welcome"); if (wf) { const n = document.querySelector("#w-name"); if (!n.value) n.value = "Test Person"; const r = document.querySelector("#w-rel"); if (r) r.selectedIndex = 2; document.querySelector("#w-consent").checked = true; wf.requestSubmit(); return "welcome"; }
      const ans = q('[data-act="ans"]'); if (ans.length) { const o = [...ans].filter((b) => b.dataset.v !== "0"); o[3 % o.length].click(); return "ans"; }
      const ff = q(".ff-row"); if (ff.length) { if (!document.querySelector('.ff-row .m[aria-pressed="true"]')) ff[0].querySelector(".m").click(); else if (!document.querySelector('.ff-row .l[aria-pressed="true"]')) ff[1].querySelector(".l").click(); else document.querySelector('.qcard [data-act="next"]').click(); return "ff"; }
      const sc = q('[data-act="scen"]'); if (sc.length) { const a = document.querySelector(".tag.best"), w = document.querySelector(".tag.worst"); if (!a) sc[0].click(); else if (!w) sc[2].click(); else document.querySelector('.qcard [data-act="next"]').click(); return "scen"; }
      const bel = document.querySelector('[data-act="belief"][data-v="yes"][aria-pressed="false"]'); if (bel) { bel.click(); return "bel"; }
      const bn = document.querySelector('.qcard [data-act="next"]:not([disabled])'); if (bn && q('[data-act="belief"]').length) { bn.click(); return "beln"; }
      const fact = q('[data-act="fact"]'); if (fact.length) { fact[1].click(); return "fact"; }
      const fm = q('[data-act="fact-multi"]'); if (fm.length) { if (!document.querySelector('[data-act="fact-multi"][aria-pressed="true"]')) fm[0].click(); else document.querySelector('.qcard [data-act="next"]').click(); return "fm"; }
      const wn = document.querySelector('[data-act="work-next"]'); if (wn) { wn.click(); return "work"; }
      const pn = document.querySelector('[data-act="private-next"]'); if (pn) { document.querySelector("#priv").value = "PRIVATE-NOTE-XYZ"; pn.click(); return "priv"; }
      const rr = q('[data-act="ref-ready"]'); if (rr.length) { rr[0].click(); return "rr"; }
      const rg = q('[data-act="ref-gift"]'); if (rg.length) { if (!document.querySelector('[data-act="ref-gift"][aria-pressed="true"]')) rg[0].click(); else document.querySelector('.qcard [data-act="next"]').click(); return "rg"; }
      const rf = document.querySelector('[data-act="ref-finish"]'); if (rf) { document.querySelector("#rt-strength").value = "Great leader"; rf.click(); return "rf"; }
      return "stuck";
    });
    if (t === "done") return "done";
    if (t === "stuck") { await wait(300); continue; }
    await wait(["ans", "fact", "rr"].includes(t) ? 260 : 60);
    if (stopAtPct < 101) { const pct = await p.evaluate(() => +(document.querySelector(".chapter-name .num")?.textContent || "0").replace("%", "")); if (pct >= stopAtPct) return "paused"; }
  }
  return "limit";
}

// 1. Leader creates an assessment
const leader = await device(true);
await leader.goto("http://plumbline.test/");
await wait(800);
await leader.evaluate(() => document.querySelector('[data-to="leader"]').click());
await wait(600);
ok((await text(leader)).includes("Your assessments"), "leader signed in and sees dashboard");
await leader.evaluate(() => document.querySelector('[data-to="newcase"]').click());
await leader.fill("#f-pn", "Josh Kim"); await leader.fill("#f-sn", "Hannah Kim"); await leader.fill("#f-city", "Boulder, CO"); await leader.fill("#f-net", "Front Range");
await leader.evaluate(() => document.querySelector("#newcase").requestSubmit());
await wait(1200);
ok((await text(leader)).includes("Copy reference link"), "case created; status page shows links");
const ppl = (await db.query(`select role, token from public.participants order by role`)).rows;
const tokP = ppl.find((x) => x.role === "planter").token, tokS = ppl.find((x) => x.role === "spouse").token;
const refTok = (await db.query(`select ref_token from public.cases`)).rows[0].ref_token;

// 2. Planter starts on one device and stops partway
const phone = await device(false);
await phone.goto(`http://plumbline.test/#/t/${tokP}`);
await wait(1200);
ok((await text(phone)).includes("Welcome, Josh"), "planter link opens welcome");
ok((await answer(phone, 400, 30)) === "paused", "planter answers until 30%");
await wait(1500);
let row = (await db.query(`select status, progress, step, chapter from public.participants where token=$1`, [tokP])).rows[0];
ok(row.status === "started" && row.progress >= 25, `progress saved to server (${row.progress}%, ${row.chapter})`);
ok((await phone.evaluate(() => document.querySelector("#savestate")?.textContent)) === "Saved", "save indicator says Saved");

// 3. Leader sees it (reload simulates live update)
await leader.reload(); await wait(800);
await leader.evaluate(() => document.querySelector('[data-to="leader"]').click()); await wait(800);
const dash = await text(leader);
ok(dash.includes(`${row.progress}%`) && dash.includes("Not started"), "leader dashboard shows planter % and spouse not started");
await leader.screenshot({ path: "/tmp/pl-dash.png" });
await leader.evaluate(() => document.querySelector(".case-row.live").click()); await wait(500); await leader.screenshot({ path: "/tmp/pl-status.png", fullPage: true });
await phone.screenshot({ path: "/tmp/pl-take.png" });

// 4. Planter resumes on a different device
const laptop = await device(false);
await laptop.goto(`http://plumbline.test/#/t/${tokP}`);
await wait(1200);
const pctNow = await laptop.evaluate(() => +(document.querySelector(".chapter-name .num")?.textContent || "0").replace("%", ""));
ok(pctNow >= row.progress - 1, `resumed on another device at ${pctNow}%`);
ok((await answer(laptop, 900)) === "done", "planter finishes");
await wait(600);
row = (await db.query(`select status, progress from public.participants where token=$1`, [tokP])).rows[0];
ok(row.status === "finished" && row.progress === 100, "planter sealed at 100%");

// 5. Spouse and two references
const sp = await device(false);
await sp.goto(`http://plumbline.test/#/t/${tokS}`); await wait(1000);
ok((await answer(sp, 600)) === "done", "spouse finishes");
for (const nm of ["Pastor Mike", "Ava Brooks"]) {
  const r = await device(false);
  await r.goto(`http://plumbline.test/#/r/${refTok}`); await wait(1000);
  await r.fill("#rj-name", nm); await r.evaluate(() => document.querySelector("#refjoin").requestSubmit()); await wait(1200);
  ok((await answer(r, 120)) === "done", `reference ${nm} finishes`);
}
const counts = (await db.query(`select role, status from public.participants`)).rows;
ok(counts.filter((x) => x.status === "finished").length === 4, "4 people finished");

// 6. Leader report and release
await leader.reload(); await wait(800);
await leader.evaluate(() => document.querySelector('[data-to="leader"]').click()); await wait(800);
await leader.evaluate(() => document.querySelector('.case-row.live').click()); await wait(600);
const rep = await text(leader);
ok(/Ready|Pause|Development/.test(rep) && rep.includes("Interview guide"), "leader report renders");
ok(rep.includes("PRIVATE-NOTE-XYZ"), "leader sees spouse's private note");
const pBefore = await (await device(false));
await pBefore.goto(`http://plumbline.test/#/t/${tokP}`); await wait(1000);
ok((await text(pBefore)).includes("report will appear"), "planter waits for release");
await leader.evaluate(() => document.querySelector('[data-tab="status"]').click()); await wait(300);
await leader.evaluate(() => document.querySelector('[data-act="release"]').click()); await wait(800);
const pAfter = await device(false);
await pAfter.goto(`http://plumbline.test/#/t/${tokP}`); await wait(1200);
const mine = await text(pAfter);
await pAfter.screenshot({ path: "/tmp/pl-mine.png" });
ok(mine.includes("here's how God has wired you") && mine.includes("Unity Map"), "planter sees personal report after release");
ok(!mine.includes("PRIVATE-NOTE-XYZ"), "planter never sees spouse's private note");

console.log("rpc calls:", Object.entries(calls.reduce((a, c) => ((a[c] = (a[c] || 0) + 1), a), {})).map(([k, v]) => `${k}×${v}`).join(", "));
console.log("page errors:", errs.filter((e) => !/realtime|WebSocket/i.test(e)).join("\n") || "none");
await b.close();
