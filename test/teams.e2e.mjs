// Plumbline Teams end to end on the React (Lovable) site: PL_SITE=http://127.0.0.1:5175 node test/teams.e2e.mjs
// End-to-end test of the live site: real browser, real database rules (PGlite), fake Supabase HTTP layer, captured emails.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { makeDb } from "./sql.test.mjs";
import { personEmail, teamInviteEmail, finishedEmail, reportKeyEmail } from "../supabase/functions/plumbline-email/templates.js";

const SITE = process.env.PL_SITE || "http://127.0.0.1:5175";

const SHOTS = process.env.SHOTS || "";

const db = await makeDb();
const USERS = { owner: ["11111111-1111-1111-1111-111111111111", "dana@frontrange.org"], assessor: ["22222222-2222-2222-2222-222222222222", "sam@frontrange.org"], outsider: ["33333333-3333-3333-3333-333333333333", "x@elsewhere.org"] };
for (const [id, em] of Object.values(USERS)) await db.exec(`insert into auth.users values ('${id}', '${em}')`);

let lock = Promise.resolve();
const serial = (fn) => (lock = lock.then(fn, fn));
async function asUser(uid, fn) {
  return serial(async () => {
    await db.exec(`set role ${uid ? "authenticated" : "anon"}; select set_config('request.uid', '${uid || ""}', false);`);
    try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); }
  });
}
const asService = (fn) => serial(fn);
const uidFrom = (auth) => { try { return JSON.parse(Buffer.from(auth.split(" ")[1].split(".")[1], "base64url")).sub || null; } catch { return null; } };
const lit = (v) => (v === null || v === undefined ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : Array.isArray(v) ? `array[${v.map((x) => `'${x}'`).join(",")}]::uuid[]` : typeof v === "object" ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : `'${String(v).replace(/'/g, "''")}'`);
const emails = [], calls = [];

async function rest(route) {
  const req = route.request(); const url = new URL(req.url()); const method = req.method();
  const uid = uidFrom(req.headers()["authorization"] || "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  try {
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.split("/").pop(); const args = JSON.parse(req.postData() || "{}"); calls.push(fn);
      const call = `public.${fn}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(", ")})`;
      // functions that return rows come back as a list, like Supabase does
      const setof = (await db.query(`select bool_or(proretset) s from pg_proc where proname = $1`, [fn])).rows[0].s;
      const r = await asUser(uid, () => db.query(setof ? `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as r from ${call} t` : `select to_jsonb(${call}) as r`));
      return json(200, r.rows[0].r);
    }
    const table = url.pathname.split("/").pop();
    const filters = [...url.searchParams].filter(([k]) => !["select", "order", "limit", "on_conflict", "columns"].includes(k)).map(([k, v]) => {
      const op = v.slice(0, v.indexOf(".")), val = v.slice(v.indexOf(".") + 1);
      if (op === "in") return `${k} in (${val.slice(1, -1).split(",").map((x) => lit(x)).join(",")})`;
      return `${k} = ${lit(val === "true" ? true : val === "false" ? false : val)}`;
    });
    const where = filters.length ? " where " + filters.join(" and ") : "";
    const objectWanted = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    const out = (status, rows) => (objectWanted ? (rows.length === 1 ? json(status, rows[0]) : json(406, { code: "PGRST116", message: "no rows" })) : json(status, rows));
    if (method === "GET") {
      const order = url.searchParams.get("order"); const ord = order ? ` order by ${order.split(".")[0]} ${order.includes("desc") ? "desc" : "asc"}` : "";
      const lim = url.searchParams.get("limit") ? ` limit ${+url.searchParams.get("limit")}` : "";
      return out(200, (await asUser(uid, () => db.query(`select * from public.${table}${where}${ord}${lim}`))).rows);
    }
    if (method === "POST") {
      const body = JSON.parse(req.postData()); const rows = Array.isArray(body) ? body : [body]; const cols = Object.keys(rows[0]);
      const upsert = (req.headers()["prefer"] || "").includes("merge-duplicates");
      const conflict = url.searchParams.get("on_conflict");
      const sql = `insert into public.${table}(${cols.join(",")}) values ${rows.map((r) => `(${cols.map((c) => lit(r[c])).join(",")})`).join(",")}` +
        (upsert ? ` on conflict (${conflict}) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}` : "") + " returning *";
      return out(201, (await asUser(uid, () => db.query(sql))).rows);
    }
    if (method === "PATCH") {
      const body = JSON.parse(req.postData());
      return out(200, (await asUser(uid, () => db.query(`update public.${table} set ${Object.entries(body).map(([k, v]) => `${k} = ${lit(v)}`).join(", ")}${where} returning *`))).rows);
    }
    if (method === "DELETE") return out(200, (await asUser(uid, () => db.query(`delete from public.${table}${where} returning *`))).rows);
    calls.push({ storageErr: req.method() + " " + url.pathname }); return json(404, { message: "not mocked" });
  } catch (err) { return json(400, { message: err.message }); }
}

// The email function, run against the same database with the same rules
// Storage: run the same insert/select the real storage server would, under the caller's role, so the bucket policies decide.
async function storage(route) {
  const req = route.request(); const url = new URL(req.url()); const uid = uidFrom(req.headers()["authorization"] || "");
  const json = (s, b) => route.fulfill({ status: s, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(b) });
  const up = url.pathname.match(/^\/storage\/v1\/object\/results\/(.+)$/), sign = url.pathname.match(/^\/storage\/v1\/object\/sign\/results\/(.+)$/);
  if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,DELETE,PUT", "access-control-allow-headers": "*" }, body: "" });
  try {
    if (req.method() === "DELETE" && url.pathname === "/storage/v1/object/results") {
      const names = JSON.parse(req.postData() || "{}").prefixes || [];
      const r = await asUser(uid, () => db.query(`delete from storage.objects where bucket_id='results' and name = any($1::text[]) returning name`, [names]));
      calls.push({ removed: r.rows.length }); return json(200, r.rows.map((x) => ({ name: x.name })));
    }
    if (req.method() === "POST" && up) {
      const name = decodeURIComponent(up[1]);
      await asUser(uid, () => db.query(`insert into storage.objects(bucket_id, name) values ('results', $1)`, [name]));
      calls.push({ upload: name }); return json(200, { Key: "results/" + name });
    }
    if (req.method() === "POST" && sign) {
      const name = decodeURIComponent(sign[1]);
      const n = await asUser(uid, () => db.query(`select 1 from storage.objects where bucket_id='results' and name=$1`, [name]));
      if (!n.rows.length) return json(400, { error: "not_found", message: "Object not found" });
      calls.push({ signed: name }); return json(200, { signedURL: "/object/sign/results/" + name + "?token=t" });
    }
    return json(404, { message: "not mocked" });
  } catch (e) { calls.push({ storageErr: e.message }); return json(403, { error: "Unauthorized", message: e.message }); }
}
async function fnEmail(route) {
  const req = route.request(); const uid = uidFrom(req.headers()["authorization"] || ""); const body = JSON.parse(req.postData() || "{}");
  const json = (s, b) => route.fulfill({ status: s, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(b) });
  if (req.method() === "OPTIONS") return json(200, {});
  try {
    let rows = [];
    if (body.action === "invite" || body.action === "remind") {
      rows = (await asUser(uid, () => db.query(`select * from public.pl_email_people(${lit(body.ids)}, ${lit(body.action)})`))).rows;
      rows.forEach((r) => emails.push({ to: r.email, ...personEmail(body.action, r, SITE), kind: body.action }));
    } else if (body.action === "team") {
      rows = (await asUser(uid, () => db.query(`select * from public.pl_member_invite_email(${lit(body.inviteId)})`))).rows;
      rows.forEach((r) => emails.push({ to: r.email, ...teamInviteEmail(r, SITE), kind: "team" }));
    } else if (body.action === "finished") {
      rows = (await asService(() => db.query(`select * from public.pl_finish_notice(${lit(body.token)})`))).rows;
      rows.forEach((r) => emails.push({ to: r.email, ...finishedEmail(r, SITE), kind: "finished" }));
    } else if (body.action === "report_key") {
      rows = (await asService(() => db.query(`select * from public.pl_report_key_email(${lit(body.token)})`))).rows;
      rows.forEach((r) => emails.push({ to: r.email, ...reportKeyEmail(r, SITE), kind: "report_key" }));
    }
    return json(200, { sent: rows.length, skipped: (body.ids?.length || 0) - rows.length });
  } catch (err) { return json(403, { error: err.message }); }
}

const b = await chromium.launch();
const errs = [];
async function device(who, width = 1100) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript((d) => { globalThis.PL_TODAY = d; }, process.env.PL_TODAY || "2027-02-01");  // after the free beta unless a check says otherwise
  await ctx.addInitScript((site) => { window.PLUMBLINE_CONFIG = { supabaseUrl: "https://test.supabase.co", supabaseAnonKey: "anon-test", siteUrl: site }; }, SITE);
  await ctx.route("https://test.supabase.co/rest/**", rest);
  await ctx.route("https://test.supabase.co/functions/**", fnEmail);
  await ctx.route("https://test.supabase.co/storage/**", storage);
  await ctx.route("https://test.supabase.co/auth/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("https://test.supabase.co/realtime/**", (r) => r.abort());
  await ctx.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  if (who) {
    const [id, email] = USERS[who];
    const tok = `x.${Buffer.from(JSON.stringify({ sub: id, role: "authenticated", exp: 4102444800 })).toString("base64url")}.y`;
    const sess = { access_token: tok, refresh_token: "r", token_type: "bearer", expires_in: 1e9, expires_at: 4102444800, user: { id, email, aud: "authenticated", role: "authenticated" } };
    await ctx.addInitScript((s) => localStorage.setItem("sb-test-auth-token", JSON.stringify(s)), sess);
  }
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(String(e)));
  return p;
}
let failed = 0;
const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) failed++; };
const text = (p) => p.evaluate(() => document.querySelector("main").innerText);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error("missing " + s); el.click(); }, sel);
const submit = (p, sel) => p.evaluate((s) => document.querySelector(s).requestSubmit(), sel);
const linkIn = (mail) => (mail.text.match(/https?:\/\/\S+/) || [])[0];
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

async function answer(p, maxSteps, stopAtPct = 101) {
  let stuck = 0;
  for (let g = 0; g < maxSteps; g++) {
    const t = await p.evaluate(() => {
      const q = (s) => document.querySelectorAll(s);
      const app = document.querySelector("main").innerText;
      if (/Finished and sealed|Thank you/.test(app) && !document.querySelector(".qcard")) return "done";
      const intro = document.querySelector('.intro-card [data-act="next"]'); if (intro) { intro.click(); return "intro"; }
      const wf = document.querySelector("#welcome"); if (wf) { const n = document.querySelector("#w-name"); if (!n.value) n.value = "Test Person"; const r = document.querySelector("#w-rel"); if (r) r.selectedIndex = 2; document.querySelector("#w-consent").checked = true; wf.requestSubmit(); return "welcome"; }
      const ca = q('[data-act="city-has"]'); if (ca.length) { const pick = window.__city === false ? ca[1] : ca[0]; if (pick.getAttribute("aria-pressed") === "true") return "wait"; pick.click(); return "city"; }
      const cn = document.querySelector('[data-act="city-name"]'); if (cn) { const f = document.querySelector("#cx-city"); if (!f.value) f.value = "Boulder, Colorado"; cn.click(); return "cityname"; }
      const cx = q('[data-act="cx"]'); if (cx.length) { cx[Math.min(2, cx.length - 1)].click(); return "cx"; }
      const ct = document.querySelector('[data-act="cx-text"]'); if (ct) { document.querySelector("#cx-text").value = "CITY-WHY-ANSWER"; ct.click(); return "cxtext"; }
      const of = document.querySelector("#other-form"); if (of) { if (window.__wantUpload && !document.querySelector('[data-act="other-rm"]')) return "upload"; const m = document.querySelector("#o-mbti"); if (m) m.value = "ENFP"; const d = document.querySelector("#o-disc"); if (d) d.value = "I"; for (const [k, lv] of [["W","genius"],["D","genius"],["G","frus"],["T","frus"]]) { const w = document.querySelector("#o-wg-" + k); if (w) w.value = lv; } document.querySelector('[data-act="other-next"]').click(); return "other"; }
      const nt = document.querySelector("#netq-text"); if (nt) { nt.value = "BOULDER-CALLING-ANSWER"; document.querySelector('[data-act="netq-next"]').click(); return "netq"; }
      const ans = q('[data-act="ans"]'); if (ans.length) { const o = [...ans].filter((b) => b.dataset.v !== "0"); o[3 % o.length].click(); return "ans"; }
      const ff = q(".ff-row"); if (ff.length) { if (!document.querySelector('.ff-row .m[aria-pressed="true"]')) ff[0].querySelector(".m").click(); else if (!document.querySelector('.ff-row .l[aria-pressed="true"]')) ff[1].querySelector(".l").click(); else document.querySelector('.qcard [data-act="next"]').click(); return "ff"; }
      const sc = q('[data-act="scen"]'); if (sc.length) { const a = document.querySelector(".choice .tag.best"), w = document.querySelector(".choice .tag.worst"); if (!a) sc[0].click(); else if (!w) sc[2].click(); else document.querySelector('.qcard [data-act="next"]').click(); return "scen"; }
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
    if (t === "stuck" || t === "wait") { if (++stuck > 25) { console.log("STUCK ON:", (await text(p)).slice(0, 300).replace(/\n/g, " | ")); return "stuck"; } await wait(300); continue; }
    stuck = 0;
    if (t === "upload") { await p.evaluate(() => { window.__wantUpload = false; }); await p.setInputFiles("#o-files", { name: "my-disc-report.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") }); await wait(1500); console.log("UPLOAD:", calls.filter((c) => c.upload || c.storageErr).map((c) => JSON.stringify(c)).join(" "), await p.evaluate(() => document.body.innerText.match(/Couldn't upload[^\n]*/)?.[0] || "")); continue; }
    await wait(["ans", "fact", "rr", "city", "cx"].includes(t) ? 300 : 60);
    if (stopAtPct < 101) { const pct = await p.evaluate(() => +(document.querySelector(".chapter-name .num")?.textContent || "0").replace("%", "")); if (pct >= stopAtPct) return "paused"; }
  }
  return "limit";
}

import { personEmail as pe } from "../supabase/functions/plumbline-email/templates.js";

// 0. The team invite email reads as a team invite, never as hiring
{
  const e = pe("invite", { role: "planter", name: "Ava Stone", token: "t", planter_name: "Ava Stone", network_name: "Pinewood Church", sender_name: "Parker Manuel", audience: "staff", purpose: "team", team_name: "Pinewood staff" }, SITE);
  ok(/Plumbline Teams/.test(e.subject) && /growth report/.test(e.text) && !/consider|hiring decision\b(?!,)/i.test(e.text.replace("isn't part of a hiring decision", "")), "team invite email: Plumbline Teams, growth report, no hiring language");
}

// 1. A leader starts a team from the Teams home
const owner = await device("owner");
await owner.goto(SITE + "/teams"); await wait(1500);
ok((await text(owner)).includes("An assessment your whole team takes"), "Teams home page loads");
await click(owner, 'main a[href="/teams/new"]'); await owner.waitForSelector("#o-net", { timeout: 20000 }).catch(() => {});
ok((await text(owner)).includes("Set up your church or organization"), "new leader sets up their organization first");
await owner.fill("#o-net", "Front Range Church"); await owner.fill("#o-me", "Dana Ellis");
await submit(owner, "#onboard"); await owner.waitForSelector("#t-people", { timeout: 20000 }).catch(() => {});
ok(!!(await owner.$("#t-people")), "then the start-a-team form");
await owner.fill("#t-name", "Front Range staff");
await owner.fill("#t-people", "Ava Stone, ava@fr.church\nBen Cole <ben@fr.church>\nCara Diaz\tcara@fr.church\nDev Patel, dev@fr.church\nno email here");
await wait(300);
let t = await text(owner);
ok(/4 people/.test(t) && /1 line need/.test(t), "it reads 4 people and flags the line without an email");
const BETA = (process.env.PL_TODAY || "2027-02-01") <= "2026-12-31";
if (BETA) {
  // Free beta through Dec 31, 2026: no plan picker, nothing to buy, the team starts right away
  ok(!(await owner.$$('[data-act="choose-plan"]')).length && !(await owner.$eval("#t-go", (b) => b.disabled)), "beta: no plan needed to start a team of 4");
} else {
ok(/You have 1 free assessment, and this adds 4/.test(t) && await owner.$eval("#t-go", (b) => b.disabled), "with 1 free assessment it asks for a plan before starting");
ok((await owner.$$('[data-act="choose-plan"]')).length === 3 && /Choose Starter/.test(await owner.$eval(".teams-plan.pick", (e) => e.innerText)), "it shows the three plans and points to Starter for 4 people");
await shot(owner, "teams-plans-desktop");
// Stripe confirms a Starter plan (what the payment function records after checkout)
await db.query(`select public.pl_record_payment('cs_e2e_team', (select id from public.networks limit 1), 'teams', 8, 24900, 'usd', null, null, 'cus_e2e')`);
await owner.reload(); await owner.waitForSelector("#t-people", { timeout: 20000 });
ok(/Your Teams plan covers 8 people/.test(await text(owner)) && /0 on teams now, 8 open/.test(await text(owner)), "the start-a-team page shows the plan: 8 people, all open");
}
await owner.fill("#t-name", "Front Range staff");
await owner.fill("#t-people", "Ava Stone, ava@fr.church\nBen Cole, ben@fr.church\nCara Diaz, cara@fr.church\nDev Patel, dev@fr.church");
await submit(owner, "#newteam");
await owner.waitForURL(/\/teams\/t_[a-f0-9]+/, { timeout: 20000 }).catch(() => {});
const teamUrl = owner.url();
ok(/\/teams\/t_[a-f0-9]+$/.test(teamUrl), "lands on the team page (" + teamUrl.replace(SITE, "") + ")");
await owner.waitForSelector("text=0 of 4 finished", { timeout: 15000 }).catch(() => {});
ok((await text(owner)).includes("0 of 4 finished"), "team page: 0 of 4 finished");
const inv = emails.filter((e) => e.kind === "invite");
ok(inv.length === 4, "each person is emailed their link (" + inv.length + ")");
const rows = (await db.query(`select settings, reports_released from public.cases where settings->>'purpose' = 'team'`)).rows;
ok(rows.length === 4 && rows.every((r) => r.settings.team.name === "Front Range staff" && r.settings.audience === "staff" && r.reports_released), "4 team assessments, released, with the team name");
ok((await db.query(`select credits from public.networks`)).rows[0].credits === 1, "the Teams plan covered all 4 people (the free assessment is still there)");

// 2. Three people take it
const people = ["ava@fr.church", "ben@fr.church", "cara@fr.church"];
for (const [i, who] of people.entries()) {
  const link = linkIn(inv.find((e) => e.to === who)).replace(/#\//, "");
  const p = await device(null, i === 0 ? 390 : 1100);
  await p.goto(link); await p.waitForSelector("#welcome", { timeout: 20000 }).catch(() => {});
  const w = await text(p);
  if (i === 0) {
    ok(/growth report is private to me/.test(w) && !/full report/.test(w), "welcome: says the growth report is private");
    ok(/isn't part of any hiring decision/.test(w), "welcome: says it isn't part of a hiring decision");
    await shot(p, "teams-welcome-phone");
  }
  const res = await answer(p, 900);
  ok(res === "done", `${who} finishes (${res})`);
  const d = await text(p);
  if (i === 0) {
    ok(/growth report is ready/.test(d) && /private to you/.test(d), "finish screen: the growth report is ready and private");
    await click(p, '[data-act="see-report"]'); await p.waitForSelector(".report", { timeout: 20000 }).catch(() => {});
    const rep = await text(p);
    ok(/how God has wired you/.test(rep) && /Your next 90 days/.test(rep), "they see their own growth report right away");
    ok(!/Ready with Conditions|Pause & Talk|Development Needed|Recommendation/.test(rep), "no grade or recommendation in their report");
    ok(/How to work with/.test(rep) && /I work best with/.test(rep) && /To work well with me/.test(rep), "their report has a How to work with me card");
    ok(/Your report is private/.test(rep) && !!(await p.$('[data-act="share-toggle"]')), "their report says it's private, with a Share button");
    ok(/\/my\/[a-f0-9]{64}$/.test(p.url()) && !p.url().includes(link.split("/t/")[1]), "their report opens at its own private address, not the assessment link");
    ok(/Bookmark this page/.test(rep), "the report page tells them to bookmark their private link");
    ok(!/Your story|debt|When could you start/i.test(JSON.stringify(await db.query(`select answers->'facts' f from public.participants where email = 'ava@fr.church'`).then((r) => r.rows[0].f || {}))), "team members skip the hiring-only questions");
    await click(p, '[data-act="share-toggle"]'); await wait(1200);
    ok((await db.query(`select shared from public.participants where email = 'ava@fr.church'`)).rows[0].shared === true && /Shared with/.test(await text(p)), "Ava shares her report with one tap");
    await shot(p, "teams-report-phone");
    await p.emulateMedia({ colorScheme: "dark" }); await shot(p, "teams-report-phone-dark");
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "the private report fits a phone screen");
    // Coming back to the old link on the same phone goes straight to the report
    await p.goto(link); await p.waitForURL(/\/my\//, { timeout: 15000 }).catch(() => {});
    ok(/\/my\//.test(p.url()), "the old link on their own phone goes on to their private report");
  }
  await p.context().close();
}

// 2b. A leader who copied Ava's link before she finished can't open her report with it
{
  const avaLink = linkIn(inv.find((e) => e.to === "ava@fr.church")).replace(/#\//, "");
  const spy = await device("owner", 390);
  await spy.goto(avaLink); await spy.waitForSelector(".intro-card", { timeout: 20000 }).catch(() => {}); await wait(800);
  const st = await text(spy);
  ok(!/how God has wired you/.test(st) && !(await spy.$(".report")) && /private/.test(st) && !!(await spy.$('[data-act="email-report-key"]')), "a leader with the old link sees only a private notice, never the report");
  await shot(spy, "teams-old-link-phone");
  await spy.emulateMedia({ colorScheme: "dark" }); await shot(spy, "teams-old-link-phone-dark");
  ok(await spy.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "the private notice fits a phone screen");
  const before = emails.length;
  await click(spy, '[data-act="email-report-key"]'); await wait(1200);
  const sent = emails.slice(before);
  ok(sent.length === 1 && sent[0].to === "ava@fr.church" && sent[0].kind === "report_key" && /\/my\/[a-f0-9]{64}/.test(sent[0].text) && /sent it to your email/i.test(await text(spy)), "asking for the link emails it to Ava's own address only");
  await spy.context().close();
}

// 3. The leader's team map: private until 3 finish, then combined; Ava shows by name because she shared
await owner.goto(teamUrl); await owner.waitForSelector("text=3 of 4 finished", { timeout: 20000 }).catch(() => {});
t = await text(owner);
ok(t.includes("3 of 4 finished") && t.includes("1 shared their report"), "team page: 3 of 4 finished, 1 shared");
ok(t.includes("Your team at a glance") && /strongest area/.test(t) && /Combined results from the 3 people/.test(t), "team map: combined results from 3 people");
ok((await owner.$$(".team-pillar")).length >= 5, "team map: each area with the team average");
ok((await owner.$$(".team-wiring")).length === 5 && (await owner.$$(".team-split")).length === 5, "team map: five wiring rows as counts");
ok(t.includes("Gifts on the team"), "team map: gifts for a church staff team");
ok((await owner.$$('a:has-text("Shared report")')).length === 1 && (await owner.$$(".team-private")).length === 2, "people: Ava's shared report opens; the other two show Private");
ok(!/Ben|Cara/.test(await owner.evaluate(() => [...document.querySelectorAll(".team-pillar, .team-wiring, .legend")].map((e) => e.innerText).join(" "))) && /Ava/.test(await owner.evaluate(() => document.querySelector(".legend")?.innerText || "")), "team map: only the person who shared shows by name");
ok(/Talk about it together/.test(t) && (await owner.$$(".guide-steps li")).length >= 5 && /60-minute/.test(t), "team map: a 60-minute team meeting guide");
await shot(owner, "teams-map-desktop");
const ph = await device("owner", 390); await ph.goto(teamUrl); await ph.waitForSelector(".team-pillar", { timeout: 20000 }).catch(() => {});
ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "team map fits a phone screen");
await shot(ph, "teams-map-phone");

// 4. Ava's shared report opens for the leader; a private person's page says so
await owner.click('a:has-text("Shared report")'); await owner.waitForURL(/\/case\//, { timeout: 20000 }).catch(() => {}); await owner.waitForSelector(".tabs", { timeout: 20000 }).catch(() => {}); await wait(800);

t = await text(owner);
ok(!t.includes("Leader report") && /shared report/i.test(await owner.evaluate(() => document.querySelector(".tabs")?.innerText || "")) && /how God has wired you/.test(t), "Ava's shared report opens, no leader report");
ok(/For your next 1:1/.test(t) && /next 1:1 with Ava/.test(t) && (await owner.$$(".qa-list li")).length >= 5, "Ava's shared report comes with 1:1 questions");
await shot(owner, "teams-shared-report-desktop");
const benCase = (await db.query(`select c.id from public.cases c where c.planter_name = 'Ben Cole'`)).rows[0].id;
await owner.goto(SITE + "/case/" + benCase); await owner.waitForSelector(".notice", { timeout: 20000 }).catch(() => {}); await wait(800);
t = await owner.evaluate(() => document.body.innerText);
ok(/private to them unless they choose to share/.test(t) && !/how God has wired you/.test(t), "Ben's page: finished, report private");

// 5. The dashboard groups them under the team
await owner.goto(SITE + "/leader"); await owner.waitForSelector("text=Front Range staff", { timeout: 20000 }).catch(() => {});
t = await text(owner);
ok(t.includes("Front Range staff") && t.includes("Team map ready") && !t.includes("Ava Stone"), "dashboard: one team row, not four people");

// 6. Adding people to the same team
await owner.goto(teamUrl); await owner.waitForSelector('a[href*="/teams/new?team="]', { timeout: 20000 });
await click(owner, 'a[href*="/teams/new?team="]'); await owner.waitForSelector("#t-people", { timeout: 20000 });
ok(!(await owner.$("#t-name")) && (await text(owner)).includes("Add people to Front Range staff"), "add people: keeps the team, no new name");
await owner.fill("#t-people", "Eli Moss, eli@fr.church"); await submit(owner, "#newteam");
await owner.waitForSelector("text=3 of 5 finished", { timeout: 20000 }).catch(() => {});
ok((await text(owner)).includes("3 of 5 finished"), "added to the same team: 3 of 5 finished");

console.log("emails:", emails.length, "page errors:", errs.length ? errs : "none");
await b.close();
process.exit(failed ? 1 : 0);
