// The payment function (supabase/functions/plumbline-stripe) against a pretend Stripe: Teams plan checkout,
// the signed webhook that records the plan, and the yearly renewal. Run: node test/stripe.test.mjs
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createHmac } from "crypto";

let failed = 0;
const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) failed++; };

const dir = mkdtempSync(join(tmpdir(), "plstripe-"));
writeFileSync(join(dir, "shim.mjs"), `export const createClient = (...a) => globalThis.__sbShim(...a);`);
await build({ entryPoints: [new URL("../supabase/functions/plumbline-stripe/index.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "neutral",
  outfile: join(dir, "fn.mjs"), logLevel: "error",
  plugins: [{ name: "shim", setup(b) { b.onResolve({ filter: /^npm:@supabase/ }, () => ({ path: join(dir, "shim.mjs") })); } }] });

const SECRET = "whsec_test";
const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_API_BASE: "https://stripe.test/v1", PL_TODAY: "2027-02-01" };  // a day after the free beta; the beta is checked below
let handler;
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };

// Pretend Supabase: an admin of network "net1", and a record of the rpc calls the function makes
const rpcs = [];
const NET = { id: "net1", name: "Pinewood Church", stripe_customer: null };
globalThis.__sbShim = (_u, key) => ({
  auth: { getUser: async () => ({ data: { user: key === "anon" ? { id: "u1", email: "parker@pinewood.church" } : null } }) },
  rpc: async (fn, args) => { rpcs.push({ fn, args }); return { data: fn === "pl_is_admin" ? args.p_network === "net1" : true, error: null }; },
  from: () => { const q = { select: () => q, eq: () => q, single: async () => ({ data: NET, error: null }), maybeSingle: async () => ({ data: null, error: null }) }; return q; },
});
// Pretend Stripe: remembers each request's form fields
const sent = [];
const coupons = new Set();
globalThis.fetch = async (url, init) => {
  const fields = Object.fromEntries(new URLSearchParams(init?.body || ""));
  sent.push({ url: String(url), fields, method: init?.method });
  const cm = String(url).match(/\/coupons\/(.+)$/);
  if (cm) return coupons.has(cm[1]) ? new Response(JSON.stringify({ id: cm[1] }), { status: 200 }) : new Response(JSON.stringify({ error: { message: "No such coupon" } }), { status: 404 });
  if (String(url).endsWith("/coupons")) { coupons.add(fields.id); return new Response(JSON.stringify({ id: fields.id }), { status: 200 }); }
  if (String(url).includes("billing_portal")) return new Response(JSON.stringify({ url: "https://billing.stripe.test/p" }), { status: 200 });
  return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.test/s" }), { status: 200 });
};
await import(join(dir, "fn.mjs"));

const call = (body, headers = {}) => handler(new Request("https://x.supabase.co/functions/v1/plumbline-stripe", { method: "POST", headers: { Authorization: "Bearer t", "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const signed = (obj) => { const raw = JSON.stringify(obj), t = Math.floor(Date.now() / 1000); return [raw, { "stripe-signature": `t=${t},v1=${createHmac("sha256", SECRET).update(`${t}.${raw}`).digest("hex")}` }]; };

// 1. Checkout: Staff plan for 60 people
let r = await call({ action: "teams", tier: "staff", extra: 10, networkId: "net1", returnTo: "https://plumblineteams.com" });
let j = await r.json();
const f = sent.at(-1).fields;
ok(r.status === 200 && j.url === "https://checkout.stripe.test/s", "Teams checkout returns a Stripe checkout link");
ok(f.mode === "subscription" && f["line_items[0][price_data][unit_amount]"] === "129900" && f["line_items[0][price_data][recurring][interval]"] === "year", "Staff plan: $1,299 a year");
ok(f["line_items[1][quantity]"] === "10" && f["line_items[1][price_data][unit_amount]"] === "2500", "10 people past 50 at $25 each a year");
ok(f["metadata[kind]"] === "teams" && f["metadata[seats]"] === "60" && f["subscription_data[metadata][seats]"] === "60" && f["subscription_data[metadata][network]"] === "net1", "the plan size travels with the checkout and the subscription");
ok(f.success_url === "https://plumblineteams.com/teams/new?paid=1" && f.client_reference_id === "net1", "after paying, people come back to plumblineteams.com");

// Starter can't sneak in extra people; unknown plans and non-admins are refused; a strange return site is ignored
await call({ action: "teams", tier: "starter", extra: 40, networkId: "net1", returnTo: "https://evil.example" });
const s2 = sent.at(-1).fields;
ok(s2["line_items[0][price_data][unit_amount]"] === "24900" && !("line_items[1][quantity]" in s2) && s2["metadata[seats]"] === "8" && s2.success_url.startsWith("https://plumblineteams.com/"), "Starter: $249 for 8 people, no extras, and only our own sites to return to");
r = await call({ action: "teams", tier: "huge", networkId: "net1" }); ok(r.status === 400, "an unknown plan is refused");
r = await call({ action: "teams", tier: "team", networkId: "net2" }); ok(r.status === 403, "only the organization's owners and admins can buy");

// 2. Billing page needs a Stripe customer first
r = await call({ action: "portal", networkId: "net1" }); ok(r.status === 400, "Manage billing explains there's nothing yet before a first purchase");
NET.stripe_customer = "cus_1";
// Buying couples: the first purchase makes a Stripe customer; later ones reuse it (Stripe refuses both at once)
NET.stripe_customer = null;
await call({ action: "checkout", kind: "couples", quantity: 2, networkId: "net1" });
let cf = sent.at(-1).fields;
ok(cf.customer_creation === "always" && !cf.customer && cf["line_items[0][price_data][unit_amount]"] === "9900", "first couples purchase: $99 each and a new Stripe customer");
NET.stripe_customer = "cus_1";
await call({ action: "checkout", kind: "couples", quantity: 1, networkId: "net1" });
cf = sent.at(-1).fields;
ok(cf.customer === "cus_1" && !("customer_creation" in cf), "a repeat couples purchase reuses the network's Stripe customer");
r = await call({ action: "portal", networkId: "net1", returnTo: "https://plumblineteams.com" }); j = await r.json();
ok(j.url === "https://billing.stripe.test/p" && sent.at(-1).fields.return_url === "https://plumblineteams.com/leader", "Manage billing opens Stripe's billing page and comes back to the dashboard");

// 3. Webhook: the paid checkout records the plan
rpcs.length = 0;
let [raw, h] = signed({ type: "checkout.session.completed", data: { object: { id: "cs_9", mode: "subscription", payment_status: "paid", client_reference_id: "net1", customer: "cus_1", amount_total: 154900, currency: "usd", metadata: { kind: "teams", tier: "staff", seats: "60" }, customer_details: { email: "p@x.org" } } } });
r = await call(raw, h);
const rec = rpcs.find((x) => x.fn === "pl_record_payment");
ok(r.status === 200 && rec?.args.p_kind === "teams" && rec.args.p_qty === 60 && rec.args.p_network === "net1", "a paid Teams checkout records a 60-person plan for the organization");
[raw, h] = signed({ type: "checkout.session.completed", data: { object: { id: "cs_9" } } });
r = await call(raw, { "stripe-signature": h["stripe-signature"].replace(/v1=[0-9a-f]+/, "v1=" + "0".repeat(64)) }); ok(r.status === 400, "a webhook with a bad signature is refused");

// 4. Renewal a year later
rpcs.length = 0;
[raw, h] = signed({ type: "invoice.paid", data: { object: { id: "in_2", billing_reason: "subscription_cycle", customer: "cus_1", amount_paid: 154900, currency: "usd", parent: { subscription_details: { metadata: { kind: "teams", seats: "60", network: "net1" } } } } } });
r = await call(raw, h);
const ren = rpcs.find((x) => x.fn === "pl_record_payment");
ok(r.status === 200 && ren?.args.p_kind === "teams_renewal" && ren.args.p_qty === 60 && ren.args.p_network === "net1", "a yearly renewal extends the Teams plan");
rpcs.length = 0;
[raw, h] = signed({ type: "invoice.paid", data: { object: { id: "in_3", billing_reason: "subscription_cycle", customer: "cus_1", amount_paid: 250000, currency: "usd" } } });
await call(raw, h);
ok(rpcs.find((x) => x.fn === "pl_record_payment")?.args.p_kind === "renewal", "the Plumbline network plan still renews as before");

// 5. Free beta and founders (owner, 26 Oct 2026)
env.PL_TODAY = "2026-11-20";
let n0 = sent.length;
r = await call({ action: "teams", tier: "team", networkId: "net1" }); j = await r.json();
ok(r.status === 400 && /free during the beta/.test(j.error) && sent.length === n0, "beta: Teams can't be bought before Jan 1, 2027 (nothing sent to Stripe)");
r = await call({ action: "checkout", kind: "couples", quantity: 1, networkId: "net1" }); j = await r.json();
ok(r.status === 400 && /free during the beta/.test(j.error), "beta: assessments can't be bought either");
env.PL_TODAY = "2027-03-01"; NET.created_at = "2026-10-25T18:00:00Z"; NET.founding = false;
await call({ action: "teams", tier: "team", networkId: "net1" });
let tf = sent.at(-1).fields, made = sent.find((x) => x.url.endsWith("/coupons"));
ok(tf["discounts[0][coupon]"] === "founder-2027-15000" && made?.fields.amount_off === "15000" && made.fields.duration === "once" && !("allow_promotion_codes" in tf),
  "founders: Team plan is $449 - $150 = $299 the first year only, so 2028 renews at $449");
ok(tf["line_items[0][price_data][unit_amount]"] === "44900", "founders: the plan itself stays at the regular price (the discount is first-year only)");
const nc = sent.filter((x) => x.url.endsWith("/coupons")).length;
await call({ action: "teams", tier: "team", networkId: "net1" });
ok(sent.filter((x) => x.url.endsWith("/coupons")).length === nc, "founders: the discount is made once in Stripe and reused");
await call({ action: "checkout", kind: "couples", quantity: 2, networkId: "net1" });
ok(sent.at(-1).fields["line_items[0][price_data][unit_amount]"] === "6600", "founders: $66 per couple in 2027");
await call({ action: "checkout", kind: "plan", networkId: "net1" });
ok(sent.at(-1).fields["discounts[0][coupon]"] === "founder-2027-83300", "founders: network plan $2,500 - $833 = $1,667 the first year");
env.PL_TODAY = "2028-01-01";
await call({ action: "checkout", kind: "couples", quantity: 1, networkId: "net1" });
tf = sent.at(-1).fields;
ok(tf["line_items[0][price_data][unit_amount]"] === "9900" && tf.allow_promotion_codes === "true", "founders: regular $99 from Jan 1, 2028");
env.PL_TODAY = "2027-01-01"; NET.created_at = "2026-12-31T20:00:00Z";
await call({ action: "checkout", kind: "couples", quantity: 1, networkId: "net1" });
ok(sent.at(-1).fields["line_items[0][price_data][unit_amount]"] === "6600", "founders: the founder price starts Jan 1, the day after the beta ends");
env.PL_TODAY = "2027-03-01"; NET.created_at = "2027-01-02T18:00:00Z";
await call({ action: "teams", tier: "starter", networkId: "net1" });
ok(!("discounts[0][coupon]" in sent.at(-1).fields), "founders: a network that joined after the beta (Jan 2) pays regular prices");

// 6. Should I plant? and personal development (29 Oct 2026)
env.PL_TODAY = "2027-03-01"; NET.created_at = "2027-02-01T18:00:00Z"; NET.founding = false; NET.stripe_customer = null; NET.settings = { solo: true }; NET.self_plan = null;
r = await call({ action: "self", tier: "solo", networkId: "net1", returnTo: "https://joinplumbline.com" }); j = await r.json();
let sf = sent.at(-1).fields;
ok(r.status === 200 && sf.mode === "payment" && sf["line_items[0][price_data][unit_amount]"] === "4900" && sf["metadata[kind]"] === "self" && sf["metadata[tier]"] === "solo", "Should I plant?, just me: $49");
ok(sf.success_url === "https://joinplumbline.com/should-i-plant?paid=1" && sf.customer_creation === "always", "after paying he comes back to his Should I plant? page");
await call({ action: "self", tier: "full", networkId: "net1" });
ok(sent.at(-1).fields["line_items[0][price_data][unit_amount]"] === "9900", "with his wife and references: $99");
r = await call({ action: "self", tier: "upgrade", networkId: "net1" }); ok(r.status === 400, "the $50 upgrade needs the $49 first");
r = await call({ action: "self", tier: "personal", networkId: "net1" }); ok(r.status === 400, "a Should I plant? account can't buy personal development by mistake");
NET.self_plan = "solo";
r = await call({ action: "self", tier: "solo", networkId: "net1" }); ok(r.status === 400, "he can't pay twice");
await call({ action: "self", tier: "upgrade", networkId: "net1" });
ok(sent.at(-1).fields["line_items[0][price_data][unit_amount]"] === "5000", "adding his wife and references later: $50");
NET.settings = { personal: true }; NET.self_plan = null;
await call({ action: "self", tier: "personal", networkId: "net1" });
sf = sent.at(-1).fields;
ok(sf["line_items[0][price_data][unit_amount]"] === "2900" && sf.success_url.endsWith("/personal?paid=1"), "personal development: $29, back to the Personal page");
NET.created_at = "2026-12-01T18:00:00Z";
await call({ action: "self", tier: "personal", networkId: "net1" });
ok(sent.at(-1).fields["line_items[0][price_data][unit_amount]"] === "1900", "founders in 2027: $19 instead of $29 (a third off)");
r = await call({ action: "self", tier: "personal", networkId: "net2" }); ok(r.status === 403, "only the account's owner can buy");
env.PL_TODAY = "2026-11-20"; n0 = sent.length;
r = await call({ action: "self", tier: "solo", networkId: "net1" }); ok(r.status === 400 && sent.length === n0, "beta: nothing to buy before Jan 1, 2027");
rpcs.length = 0;
[raw, h] = signed({ type: "checkout.session.completed", data: { object: { id: "cs_s1", mode: "payment", payment_status: "paid", client_reference_id: "net1", amount_total: 4900, currency: "usd", metadata: { kind: "self", tier: "solo" }, customer_details: { email: "r@x.com" } } } });
r = await call(raw, h);
const sr1 = rpcs.find((x) => x.fn === "pl_record_payment");
ok(r.status === 200 && sr1?.args.p_kind === "self_solo" && sr1.args.p_network === "net1" && sr1.args.p_qty === 1, "a paid $49 checkout is recorded as Should I plant? (just me)");
rpcs.length = 0;
[raw, h] = signed({ type: "checkout.session.completed", data: { object: { id: "cs_s2", mode: "payment", payment_status: "paid", client_reference_id: "net1", amount_total: 2900, currency: "usd", metadata: { kind: "self", tier: "personal" } } } });
await call(raw, h);
ok(rpcs.find((x) => x.fn === "pl_record_payment")?.args.p_kind === "personal", "a paid $29 checkout is recorded as personal development");

process.exit(failed ? 1 : 0);
