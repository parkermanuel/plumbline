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
const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_API_BASE: "https://stripe.test/v1" };
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
globalThis.fetch = async (url, init) => {
  const fields = Object.fromEntries(new URLSearchParams(init?.body || ""));
  sent.push({ url: String(url), fields });
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

process.exit(failed ? 1 : 0);
