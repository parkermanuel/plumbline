// A shared harness for end-to-end checks of the React (Lovable) site: real browser, real database rules (PGlite),
// a pretend Supabase HTTP layer and captured emails. Used by test/teams.e2e.mjs and the walk-through audits.
// Extra signed-in people: addUser("key", "email") then device("key").
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { makeDb } from "./sql.test.mjs";
import { personEmail, teamInviteEmail, finishedEmail, reportKeyEmail } from "../supabase/functions/plumbline-email/templates.js";

export const SITE = process.env.PL_SITE || "http://127.0.0.1:5175";

const SHOTS = process.env.SHOTS || "";

export const db = await makeDb();
export const USERS = { owner: ["11111111-1111-1111-1111-111111111111", "dana@frontrange.org"], assessor: ["22222222-2222-2222-2222-222222222222", "sam@frontrange.org"], outsider: ["33333333-3333-3333-3333-333333333333", "x@elsewhere.org"] };
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
export const emails = [], calls = [];

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
// What the real email function looks up about each case (see supabase/functions/plumbline-email/index.ts)
const caseInfo = (st) => ({ audience: st?.audience || "planting", job_role: st?.role || "", purpose: st?.purpose || "decide", team_name: st?.team?.name || "", team_id: st?.team?.id || "", leader_sees: st?.leaderSees === true,
  faith: !((st?.audience === "nonprofit" || st?.audience === "business") && (st?.faith === false || st?.faith === "false")) });
const byToken = async (tok) => { const row = (await asService(() => db.query(`select c.settings, p.status from public.participants p join public.cases c on c.id = p.case_id where p.token = $1`, [tok]))).rows[0]; return { ...caseInfo(row?.settings), status: row?.status || "" }; };
const byCase = async (id) => caseInfo((await asService(() => db.query(`select settings from public.cases where id = $1`, [id]))).rows[0]?.settings);
async function fnEmail(route) {
  const req = route.request(); const uid = uidFrom(req.headers()["authorization"] || ""); const body = JSON.parse(req.postData() || "{}");
  const json = (s, b) => route.fulfill({ status: s, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(b) });
  if (req.method() === "OPTIONS") return json(200, {});
  try {
    let rows = [];
    if (body.action === "invite" || body.action === "remind") {
      rows = (await asUser(uid, () => db.query(`select * from public.pl_email_people(${lit(body.ids)}, ${lit(body.action)})`))).rows;
      for (const r of rows) emails.push({ to: r.email, ...personEmail(body.action, { ...r, ...(await byToken(r.token)) }, SITE), kind: body.action });
    } else if (body.action === "team") {
      rows = (await asUser(uid, () => db.query(`select * from public.pl_member_invite_email(${lit(body.inviteId)})`))).rows;
      const kinds = (await asService(() => db.query(`select n.settings->'kinds' k from public.network_invites i join public.networks n on n.id = i.network_id where i.id = $1`, [body.inviteId]))).rows[0]?.k;
      const teams = Array.isArray(kinds) && kinds.length > 0 && kinds.every((k) => k === "teams");
      rows.forEach((r) => emails.push({ to: r.email, ...teamInviteEmail({ ...r, teams }, SITE), kind: "team" }));
    } else if (body.action === "finished") {
      rows = (await asService(() => db.query(`select * from public.pl_finish_notice(${lit(body.token)})`))).rows;
      for (const r of rows) emails.push({ to: r.email, ...finishedEmail({ ...r, ...(await byCase(r.case_id)) }, SITE), kind: "finished" });
    } else if (body.action === "report_key") {
      rows = (await asService(() => db.query(`select * from public.pl_report_key_email(${lit(body.token)})`))).rows;
      rows.forEach((r) => emails.push({ to: r.email, ...reportKeyEmail(r, SITE), kind: "report_key" }));
    }
    return json(200, { sent: rows.length, skipped: (body.ids?.length || 0) - rows.length });
  } catch (err) { return json(403, { error: err.message }); }
}

export const b = await chromium.launch();
export const errs = [];
export async function device(who, width = 1100) {
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
export const text = (p) => p.evaluate(() => document.querySelector("main").innerText);
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const click = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error("missing " + s); el.click(); }, sel);
export const submit = (p, sel) => p.evaluate((s) => document.querySelector(s).requestSubmit(), sel);
export const linkIn = (mail) => (mail.text.match(/https?:\/\/\S+/) || [])[0];
export const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

export async function answer(p, maxSteps, stopAtPct = 101) {
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


/** Adds another signed-in person the harness can open a device for. */
export async function addUser(key, email) {
  const id = crypto.randomUUID();
  USERS[key] = [id, email];
  await db.exec(`insert into auth.users values ('${id}', '${email}')`);
  return id;
}
