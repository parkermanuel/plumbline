// Beta invite links, end to end on the React (Lovable) site: PL_SITE=http://127.0.0.1:5175 PL_INVITE=<token> node test/invite.e2e.mjs
// Runs the real payment function (supabase/functions/plumbline-stripe) against the same database and rules.
// End-to-end test of the live site: real browser, real database rules (PGlite), fake Supabase HTTP layer, captured emails.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { makeDb } from "./sql.test.mjs";
import { personEmail, teamInviteEmail, finishedEmail } from "../supabase/functions/plumbline-email/templates.js";

const SITE = process.env.PL_SITE || "http://127.0.0.1:5175";

const SHOTS = process.env.SHOTS || "";

const db = await makeDb();
const USERS = { rick: ["44444444-4444-4444-4444-444444444444", "rick@sln.test"], thief: ["55555555-5555-5555-5555-555555555555", "x@thief.test"], owner: ["11111111-1111-1111-1111-111111111111", "dana@frontrange.org"], assessor: ["22222222-2222-2222-2222-222222222222", "sam@frontrange.org"], outsider: ["33333333-3333-3333-3333-333333333333", "x@elsewhere.org"] };
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
  await ctx.addInitScript((site) => { window.PLUMBLINE_CONFIG = { supabaseUrl: "https://test.supabase.co", supabaseAnonKey: "anon-test", siteUrl: site }; }, SITE);
  await ctx.route("https://test.supabase.co/rest/**", rest);
  await ctx.route("https://test.supabase.co/functions/**", (r) => r.request().url().includes("plumbline-stripe") ? fnStripe(r) : fnEmail(r));
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

// ---- The real payment function, loaded into Node with a small stand-in for supabase-js that runs on the test database ----
import { build } from "esbuild";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
const dir = mkdtempSync(join(tmpdir(), "plfn-"));
writeFileSync(join(dir, "shim.mjs"), `export const createClient = (...a) => globalThis.__sbShim(...a);`);
await build({ entryPoints: ["supabase/functions/plumbline-stripe/index.ts"], bundle: true, format: "esm", platform: "neutral", outfile: join(dir, "fn.mjs"),
  plugins: [{ name: "shim", setup(b) { b.onResolve({ filter: /^npm:@supabase/ }, () => ({ path: join(dir, "shim.mjs") })); } }], logLevel: "error" });
let handler = null;
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", SITE_URL: SITE })[k] }, serve: (h) => { handler = h; } };
function query(run) {  // a thenable PostgREST-style builder: from(t).select/insert/update + eq + single/maybeSingle
  return (table) => {
    let op = "select", payload = null; const wh = [];
    const exec = async (one) => {
      const where = wh.length ? " where " + wh.map(([k, v]) => `${k} = ${lit(v)}`).join(" and ") : "";
      try {
        let rows;
        if (op === "insert") { const c = Object.keys(payload); rows = (await run(`insert into public.${table}(${c.join(",")}) values (${c.map((k) => lit(payload[k])).join(",")}) returning *`)).rows; }
        else if (op === "update") rows = (await run(`update public.${table} set ${Object.entries(payload).map(([k, v]) => `${k} = ${lit(v)}`).join(", ")}${where} returning *`)).rows;
        else rows = (await run(`select * from public.${table}${where}`)).rows;
        if (one === "single" && rows.length !== 1) return { data: null, error: { message: "not one row" } };
        return { data: one ? rows[0] ?? null : rows, error: null };
      } catch (e) { return { data: null, error: { message: e.message, code: e.code } }; }
    };
    const q = { select() { return q; }, insert(p) { op = "insert"; payload = p; return q; }, update(p) { op = "update"; payload = p; return q; },
      eq(k, v) { wh.push([k, v]); return q; }, single: () => exec("single"), maybeSingle: () => exec("maybe"), then: (a, b) => exec(null).then(a, b) };
    return q;
  };
}
globalThis.__sbShim = (url, key, opts) => {
  if (key === "service") return { from: query((sql) => asService(() => db.query(sql))) };
  const uid = uidFrom(opts?.global?.headers?.Authorization || "");
  const users = Object.values(USERS);
  return {
    auth: { getUser: async () => ({ data: { user: uid ? { id: uid, email: users.find(([id]) => id === uid)?.[1] } : null } }) },
    rpc: async (fn, args) => { try { const r = await asUser(uid, () => db.query(`select to_jsonb(public.${fn}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(", ")})) as r`)); return { data: r.rows[0].r, error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } },
  };
};
await import(join(dir, "fn.mjs"));
async function fnStripe(route) {
  const req = route.request();
  if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: "ok" });
  const res = await handler(new Request("https://test.supabase.co/functions/v1/plumbline-stripe", { method: "POST", headers: { Authorization: req.headers()["authorization"] || "", "content-type": "application/json" }, body: req.postData() || "{}" }));
  const body = await res.text(); calls.push({ stripe: JSON.parse(req.postData() || "{}").action, status: res.status, body });
  return route.fulfill({ status: res.status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body });
}

const TOKEN = process.env.PL_INVITE;
if (!TOKEN) { console.log("Set PL_INVITE to a real invite token"); process.exit(2); }
const lastStripe = () => calls.filter((c) => c.stripe).slice(-1)[0];

// 1. Rick opens the link from the text, on his phone
const rick = await device("rick", 390);
await rick.goto(`${SITE}/beta?invite=${encodeURIComponent(TOKEN)}`); await wait(1200);
let t = await text(rick);
ok(t.includes("added automatically"), "invite link: page says the 5 free assessments are added automatically");
ok(t.includes("through 2026") && !t.includes("November"), "page says free through 2026, no November");
ok(t.includes("Everything stays"), "page says data stays after the 5 are used");
await shot(rick, "beta");

// 2. He taps Set up your network and fills it in
await click(rick, 'main a[href^="/leader"]'); await rick.waitForSelector("#o-net", { timeout: 20000 }).catch(() => {});
await rick.fill("#o-net", "SLN Test Network"); await rick.fill("#o-me", "Rick Burge");
await submit(rick, "#onboard");
await rick.waitForSelector("text=5 assessments left", { timeout: 20000 }).catch(() => {});
t = await text(rick);
ok(t.includes("5 assessments left"), "right after setup: 5 assessments left (not 1, not 6)");
ok(t.includes("Founding network") && t.includes("$79"), "founding price shows on his dashboard");
ok(!t.includes("Buy assessments"), "no Buy button while he still has free ones");
const net = (await db.query(`select * from public.networks where name = 'SLN Test Network'`)).rows[0];
ok(net?.credits === 5 && net?.founding === true, "database: 5 credits and founding on");
ok((await db.query(`select count(*)::int n from public.payments where network_id = '${net.id}' and kind = 'grant'`)).rows[0].n === 1, "the invite is recorded once");
ok(!(await rick.evaluate(() => localStorage.getItem("plumbline_invite"))), "the saved invite is cleared after use");
await shot(rick, "dashboard");

// 3. Reloading or coming back doesn't add more
await rick.goto(`${SITE}/beta?invite=${encodeURIComponent(TOKEN)}`); await wait(600);
await rick.goto(`${SITE}/leader`); await wait(2500);
ok((await db.query(`select credits from public.networks where id = '${net.id}'`)).rows[0].credits === 5, "opening the link again doesn't add more");

// 3b. A fast tapper: the button itself carries the invite
await rick.goto(`${SITE}/beta?invite=${encodeURIComponent(TOKEN)}`); await wait(800);
const btn = await rick.evaluate(() => document.querySelector('main a[href^="/leader"]')?.getAttribute("href"));
ok(btn && btn.includes("invite="), "the Set up your network button carries the invite (" + btn + ")");

// 4. Someone else can't reuse the link
const thief = await device("thief");
await thief.goto(`${SITE}/beta?invite=${encodeURIComponent(TOKEN)}`); await wait(1500);
await click(thief, 'main a[href^="/leader"]'); await thief.waitForSelector("#o-net", { timeout: 20000 }).catch(() => {});
await thief.fill("#o-net", "Not SLN"); await thief.fill("#o-me", "X"); await submit(thief, "#onboard"); await wait(3000);
const other = (await db.query(`select * from public.networks where name = 'Not SLN'`)).rows[0];
ok(other && other.credits === 1 && other.founding === false, "a second network using the same link gets nothing extra");
ok(calls.some((c) => c.stripe === "invite" && /already been used/.test(c.body)), "the function says the invite was already used");

// 5. A made-up invite does nothing
await thief.evaluate(() => localStorage.setItem("plumbline_invite", "made-up"));
await thief.goto(`${SITE}/leader`); await wait(2500);
ok((await db.query(`select credits from public.networks where id = '${other.id}'`)).rows[0].credits === 1, "a made-up invite adds nothing");

// 6. He uses all 5; his data stays and he's asked to pay $79 for the next
for (let i = 1; i <= 5; i++) {
  await rick.goto(`${SITE}/new`); await rick.waitForSelector("#f-pn", { timeout: 15000 });
  await rick.fill("#f-pn", `Planter ${i}`); await rick.fill("#f-pe", `p${i}@x.test`); await rick.fill("#f-sn", `Spouse ${i}`); await rick.fill("#f-se", `s${i}@x.test`); await rick.fill("#f-city", "Denver, CO");
  await submit(rick, "#newcase-live"); await wait(1600);
}
ok((await db.query(`select count(*)::int n from public.cases where network_id = '${net.id}'`)).rows[0].n === 5, "he starts 5 assessments");
await rick.goto(`${SITE}/leader`); await rick.waitForSelector("text=assessments left", { timeout: 15000 }).catch(() => {});
t = await text(rick);
ok(t.includes("0 assessments left"), "dashboard: 0 left");
ok(["Spouse 1", "Spouse 5"].every((n) => t.includes(n)) && (t.match(/Planter & Spouse \d/g) || []).length === 5, "all 5 assessments still on his dashboard");
ok(t.includes("$79 each"), "buy button offers his $79 founding price");
await shot(rick, "zero-left");
await rick.goto(`${SITE}/new`); await wait(1200);
await rick.fill("#f-pn", "Planter 6").catch(() => {}); await rick.fill("#f-pe", "p6@x.test").catch(() => {}); await rick.fill("#f-sn", "Spouse 6").catch(() => {}); await rick.fill("#f-se", "s6@x.test").catch(() => {});
await rick.evaluate(() => document.querySelector("#newcase-live")?.requestSubmit()).catch(() => {}); await wait(1500);
t = await rick.evaluate(() => document.body.innerText);
ok((await db.query(`select count(*)::int n from public.cases where network_id = '${net.id}'`)).rows[0].n === 5, "a 6th can't start without paying");
console.log("SIXTH ATTEMPT SAYS:", (t.match(/[^\n]*(No assessments left|Buy|buy)[^\n]*/) || [""])[0].slice(0, 200));
await shot(rick, "sixth");

console.log("page errors:", errs.length ? errs : "none");
await b.close();
process.exit(failed ? 1 : 0);
