// End-to-end test of the React (Lovable) site, run against its dev server: PL_SITE=http://127.0.0.1:5175
// End-to-end test of the live site: real browser, real database rules (PGlite), fake Supabase HTTP layer, captured emails.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { makeDb } from "./sql.test.mjs";
import { personEmail, teamInviteEmail, finishedEmail } from "../supabase/functions/plumbline-email/templates.js";

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
      const r = await asUser(uid, () => db.query(`select to_jsonb(public.${fn}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(", ")})) as r`));
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
// Waits until the page's main text matches (a slow dev server can take a few seconds), then carries on either way
const until = (p, fn, arg = null, ms = 15000) => p.waitForFunction(fn, arg, { timeout: ms }).catch(() => {});
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

// 1. Owner sets up a network
const owner = await device("owner");
await owner.goto(SITE + "/"); await wait(700);
await click(owner, 'a[href="/leader"]'); await owner.waitForSelector("#o-net", { timeout: 20000 }).catch(() => {});
ok((await text(owner)).includes("Set up your network"), "new leader sees onboarding");
await owner.fill("#o-net", "Front Range Planting"); await owner.fill("#o-me", "Dana Ellis");
await submit(owner, "#onboard"); await wait(900);
await owner.waitForSelector("text=assessments left", { timeout: 15000 }).catch(() => {});
ok((await text(owner)).includes("1 assessment left"), "a new network starts with its first couple free");
await db.query(`update public.networks set credits = 3`); await owner.reload(); await owner.waitForSelector("text=3 assessments left", { timeout: 15000 }).catch(() => {});
ok((await text(owner)).includes("3 assessments left"), "bought assessments show on the dashboard");
ok((await text(owner)).includes("Front Range Planting"), "network created; dashboard shows it");

// 2. Settings: a belief, a question, and a team invite
await click(owner, 'a[href="/settings"]'); await wait(400);
await owner.fill("#ab-t", "We baptize believers by immersion."); await submit(owner, "#add-belief"); await wait(600);
await owner.fill("#aq-t", "Why do you feel called to this city?"); await submit(owner, "#add-question"); await wait(600);
await owner.fill("#im-email", "sam@frontrange.org"); await submit(owner, "#invite-form"); await wait(900);
const st = await text(owner);
ok(st.includes("We baptize believers") && st.includes("Why do you feel called") && st.includes("sam@frontrange.org"), "belief, question and pending invite saved");
const teamMail = emails.find((e) => e.kind === "team");
ok(teamMail?.to === "sam@frontrange.org" && /\/#\/join\//.test(linkIn(teamMail)), "team invite emailed with a join link");
await shot(owner, "settings");

// 3. Assessor joins from the email
const sam = await device("assessor");
await sam.goto(linkIn(teamMail)); await sam.waitForSelector("text=Join Front Range Planting", { timeout: 15000 }).catch(() => {});
ok((await text(sam)).includes("Join Front Range Planting"), "join page names the network");
await sam.fill("#j-name", "Sam Ortiz"); await submit(sam, "#join-team"); await wait(1000);
ok((await text(sam)).includes("Front Range Planting") && (await text(sam)).includes("New assessment"), "assessor joined and sees the dashboard");

// 4. Assessor creates an assessment and emails the couple
await click(sam, 'a[href="/new"]'); await wait(300);
await sam.fill("#f-pn", "Josh Kim"); await sam.fill("#f-pe", "josh@kim.org"); await sam.fill("#f-sn", "Hannah Kim"); await sam.fill("#f-se", "hannah@kim.org"); await sam.fill("#f-city", "Boulder, CO");
await submit(sam, "#newcase-live"); await wait(1500);
const inv = emails.filter((e) => e.kind === "invite");
ok(inv.length === 2 && inv.some((e) => e.to === "josh@kim.org") && inv.some((e) => e.to === "hannah@kim.org"), "planter and spouse invites emailed");
ok((await text(sam)).includes("invited"), "status page shows invited stamps");
await shot(sam, "status");
const joshLink = linkIn(inv.find((e) => e.to === "josh@kim.org")), hannahLink = linkIn(inv.find((e) => e.to === "hannah@kim.org"));

// 5. Planter starts on a phone, finishes on a laptop
const phone = await device(null, 390);
await phone.goto(joshLink); await phone.waitForSelector("text=Welcome, Josh", { timeout: 15000 }).catch(() => {});
ok((await text(phone)).includes("Welcome, Josh"), "planter opens his emailed link");
ok((await answer(phone, 400, 30)) === "paused", "planter answers until 30%");
await wait(1500);
const prog = (await db.query(`select progress, chapter from public.participant_status where role='planter'`)).rows[0];
ok(prog.progress >= 25, `progress mirror shows ${prog.progress}% (${prog.chapter})`);
await shot(phone, "take-phone");
await owner.evaluate(() => document.querySelector('a[href="/leader"]').click()); await owner.reload(); await until(owner, (n) => (document.querySelector("main")?.innerText || "").includes(n + "%"), prog.progress);
ok((await text(owner)).includes(`${prog.progress}%`), "owner's dashboard shows the planter's progress");
await shot(owner, "dashboard");
const laptop = await device(null);
await laptop.goto(joshLink); await until(laptop, () => !!document.querySelector(".chapter-name .num"));
ok(+(await laptop.evaluate(() => document.querySelector(".chapter-name .num")?.textContent || "0").then((x) => x.replace("%", ""))) >= prog.progress - 1, "resumes on another device");
await laptop.evaluate(() => { window.__wantUpload = true; });
ok((await answer(laptop, 900)) === "done", "planter finishes (network belief and question included)");
await wait(800);
ok(emails.filter((e) => e.kind === "finished").length === 2, "owner and assessor told the planter finished");

// 6. Spouse, then references (one added by email, one through the shared link)
const sp = await device(null);
await sp.goto(hannahLink); await wait(1000);
await sp.evaluate(() => { window.__city = false; });
ok((await answer(sp, 700)) === "done", "spouse finishes (no city yet)");
await sam.evaluate(() => document.querySelector('a[href="/leader"]').click()); await wait(500);
await click(sam, ".case-row.live"); await wait(800);
await click(sam, '[data-tab="status"]').catch(() => {}); await wait(500);
await sam.fill("#ar-name", "Pastor Mike"); await sam.fill("#ar-email", "mike@church.org"); await submit(sam, "#addref"); await wait(1200);
const refMail = emails.find((e) => e.to === "mike@church.org");
ok(!!refMail && refMail.subject.includes("readiness"), "reference added and emailed");
const r1 = await device(null); await r1.goto(linkIn(refMail)); await wait(1000);
ok((await answer(r1, 120)) === "done", "emailed reference finishes");
const refTok = (await db.query(`select ref_token from public.cases`)).rows[0].ref_token;
const r2 = await device(null); await r2.goto(`${SITE}/r/${refTok}`); await wait(1000);
await r2.fill("#rj-name", "Ava Brooks"); await submit(r2, "#refjoin"); await wait(1200);
ok((await answer(r2, 120)) === "done", "shared-link reference finishes");

// 7. Leader report, team scoring, release
await sam.reload(); await wait(800); await sam.evaluate(() => document.querySelector('a[href="/leader"]').click()); await wait(600);
await click(sam, ".case-row.live"); await wait(1000);
const rep = await text(sam);
ok(/Ready|Pause|Development/.test(rep) && rep.includes("Interview guide") && rep.includes("From Front Range Planting") && rep.includes("BOULDER-CALLING-ANSWER"), "leader report includes the network's question and answer");
ok(rep.includes("Context") && rep.includes("Boulder") && rep.includes("CITY-WHY-ANSWER") && /City fit \d+/.test(rep), "leader report shows the planter's city fit");
ok(calls.some((c) => c.upload?.endsWith(".pdf")) && rep.includes("my-disc-report.pdf") && rep.includes("ENFP") && /Wiring/.test(rep), "planter's uploaded result and typed-in results reach the leader report");
ok(rep.includes("Working Genius gaps to talk through") && rep.includes("Working Genius is a trademark of The Table Group"), "Working Genius gaps and trademark lines show in the leader report");
await sam.evaluate(() => { window.open = () => ({ close() {}, set location(u) { window.__opened = u; } }); });
await click(sam, '[data-act="open-file"]'); await wait(700);
ok(calls.some((c) => c.signed) && /sign\/results/.test(await sam.evaluate(() => window.__opened || "")), "the team opens the uploaded file through a short-lived link");
ok(rep.includes("We baptize believers"), "leader report includes the network's belief");
await click(sam, '.rubric button[data-n="4"]'); await wait(900);
await owner.reload(); await wait(800); await owner.evaluate(() => document.querySelector('a[href="/leader"]').click()); await wait(500);
await click(owner, ".case-row.live"); await wait(1200);
ok((await text(owner)).includes("1 teammate has scored this"), "owner sees a teammate scored, but not the score yet");
await click(owner, '.rubric button[data-n="3"]'); await wait(400);
ok((await text(owner)).includes("Team: Sam 4"), "after scoring, owner sees Sam's score");
await shot(owner, "report");
await click(owner, '[data-tab="status"]'); await wait(400);
await click(owner, '[data-act="release"]'); await wait(800);
const me = await device(null); await me.goto(joshLink); await until(me, () => /wired you/.test(document.querySelector("main")?.innerText || ""));
const mine = await text(me);
ok(mine.includes("here's how God has wired you") && !mine.includes("PRIVATE-NOTE-XYZ"), "planter sees his own report, never the spouse's private note");

// 8. Permissions in the interface
await sam.evaluate(() => document.querySelector('[data-tab="status"]').click()); await wait(400);
ok(!(await sam.evaluate(() => !!document.querySelector('[data-act="delete-case"]'))), "assessor has no delete button");
const caseId = (await db.query(`select id from public.cases`)).rows[0].id;
const out = await device("outsider");
await out.goto(`${SITE}/#/case/${caseId}`); await wait(1500);
const outText = await text(out);
ok(!outText.includes("Josh Kim") && !outText.includes("Interview guide"), "outsider can't open the assessment by link");
await owner.evaluate(() => document.querySelector('[data-act="delete-case"]').click()); await wait(200);
await owner.evaluate(() => document.querySelector('[data-act="delete-yes"]').click()); await wait(2000);
ok((await db.query(`select count(*)::int n from public.participants`)).rows[0].n === 0, "owner deletes the assessment and every answer");
console.log("STORAGE CALLS:", JSON.stringify(calls.filter((c) => c.removed != null || c.storageErr || c.upload)));
ok(calls.some((c) => c.removed === 1) && (await db.query(`select count(*)::int n from storage.objects where bucket_id='results'`)).rows[0].n === 0, "deleting an assessment deletes its uploaded files");
await owner.goto(SITE + "/#/privacy"); await until(owner, () => /Who sees your answers/.test(document.querySelector("main")?.innerText || ""));
ok((await text(owner)).includes("Who sees your answers"), "privacy page");

console.log("emails:", emails.map((e) => e.kind).reduce((a, k) => ((a[k] = (a[k] || 0) + 1), a), {}));
console.log("page errors:", errs.join("\n") || "none");
await b.close();
process.exit(failed || errs.length ? 1 : 0);
