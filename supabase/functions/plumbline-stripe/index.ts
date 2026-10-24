// Plumbline payments (Supabase Edge Function), deployed with --no-verify-jwt because it checks every caller itself.
//   action "checkout"  a network owner/admin buys assessments ($99 per couple, $79 for founding networks) or the yearly plan ($2,500). Returns a Stripe Checkout URL.
//                      Stripe emails a paid invoice and receipt with the network's name on it.
//   action "teams"     a network owner/admin buys a Plumbline Teams yearly plan: Starter (8 people) $249, Team (15) $499,
//                      Staff (50) $1,299, plus $25 a person a year past 50. Returns a Stripe Checkout URL.
//   action "portal"    a network owner/admin opens Stripe's billing page to see invoices, change the card or cancel.
//   action "codes"     the platform admin lists, creates or switches off discount codes (Stripe promotion codes).
//   Stripe webhook     checkout.session.completed and invoice.paid add credits or extend the plan, once per payment.
//   action "invite"    a beta invite link (/beta?invite=…) applied to the network its owner just set up: 5 free assessments and the
//                      founding price, once per invite. Only a SHA-256 of each invite is kept here, so this public code can't be used to redeem one.
// Secrets: STRIPE_SECRET_KEY (a restricted key is enough: Checkout Sessions, Coupons, Promotion Codes, Customer portal write; Customers read),
//          STRIPE_WEBHOOK_SECRET (from the webhook endpoint in Stripe).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const COUPLE_CENTS = 9900, FOUNDING_CENTS = 7900, PLAN_CENTS = 250000;  // founding = beta networks, $79 per couple through 2027
const FOUNDING_UNTIL = "2027-12-31";
// Plumbline Teams yearly plans (owner, 24 Oct 2026). Past 50 people: $25 a person a year on top of Staff.
const TEAM_PLANS: Record<string, { name: string; seats: number; cents: number }> = {
  starter: { name: "Starter", seats: 8, cents: 24900 },
  team: { name: "Team", seats: 15, cents: 49900 },
  staff: { name: "Staff", seats: 50, cents: 129900 },
};
const EXTRA_SEAT_CENTS = 2500, MAX_EXTRA_SEATS = 950;
// Where to send people back after checkout: only our own sites
const RETURN_SITES = ["https://plumblineassessment.com", "https://plumblineteams.com"];
// Beta invites: sha256(invite token) -> who it's for and how many free assessments. Each works once (payments row "invite_<hash>").
const INVITES: Record<string, { label: string; credits: number }> = {
  "88e5a5db739f8cf4df8877485a79ce8ae3bed07f765b12fe7a95722f76b8a983": { label: "SLN (Rick Burge)", credits: 5 },
  "11e484af7c43390db5eee8a6b627b4a3c05825d805314781e2a6b7f06ce1afb6": { label: "Friend test 1", credits: 5 },
  "5156d6e8634c003e6a733feb622d7adfcc89b1b0d047e1c87147128349ca3fde": { label: "Friend test 2", credits: 5 },
  "1c3ebb0e1d591bc76adbcccca9cb2529ac2fd35781a69f52652ebc938135ddca": { label: "Friend test 3", credits: 5 },
  "b2098764af982df2c3062efa76c4bb6ef581f1e4c44da8b2a79c276f7a293d16": { label: "Friend test 4", credits: 5 },
  "758f42cc661e0ebe342646c4ae5884fb3ef416aeecf004b14143b3a35ac8aa0e": { label: "Friend test 5", credits: 5 },
  "f2ebb777c34367dfc517462b50dc6ea713e647fc4360b3b5ad84a4e4b8d5e5e1": { label: "Friend test 6", credits: 5 },
  "02d97bfdbe8d29fdf8847ed33ff852a430d6d234310672904a35467d2b785ba2": { label: "Friend test 7", credits: 5 },
  "a104998aae3e969915c1d06832a86805522057c5c2d0091d49aaa32eae6a62fd": { label: "Friend test 8", credits: 5 },
  "48f9d065a33557d7126043a8a2d4922361149ba0ac355e55ab7431cf0934ea17": { label: "Friend test 9", credits: 5 },
  "7f34dd937587b9d1996c062e3ba1de47962a88ccf0bae54d25efb93fca1b867e": { label: "Friend test 10", credits: 5 },
};
const sha256 = async (t: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Stripe's API takes form encoding with bracketed keys.
function form(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}
async function stripe(path: string, body?: Record<string, unknown>, method = body ? "POST" : "GET") {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Payments aren't set up yet");
  const r = await fetch(`${Deno.env.get("STRIPE_API_BASE") ?? "https://api.stripe.com/v1"}/${path}`, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: body ? form(body) : undefined });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Stripe error");
  return data;
}

// Checks the Stripe-Signature header: HMAC-SHA256 of "<t>.<raw body>" with the endpoint secret, within 5 minutes.
async function verified(raw: string, header: string | null) {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t, sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${raw}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === hex.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const site = (Deno.env.get("SITE_URL") ?? "https://plumblineassessment.com").replace(/\/$/, "");
  const admin = createClient(url, service);
  const raw = await req.text();

  // ---- Stripe webhook ----
  const sig = req.headers.get("stripe-signature");
  if (sig) {
    if (!(await verified(raw, sig))) return json({ error: "Bad signature" }, 400);
    const ev = JSON.parse(raw), o = ev.data?.object ?? {};
    try {
      if (ev.type === "checkout.session.completed" && (o.payment_status === "paid" || o.payment_status === "no_payment_required")) {
        const plan = o.mode === "subscription";
        if (plan && o.metadata?.kind === "teams") {
          const seats = Math.max(0, Number(o.metadata.seats) || 0);
          const { error } = await admin.rpc("pl_record_payment", { p_id: o.id, p_network: o.client_reference_id || null, p_kind: "teams", p_qty: seats,
            p_amount: o.amount_total ?? 0, p_currency: o.currency ?? "usd", p_email: o.customer_details?.email ?? null, p_promo: null, p_customer: o.customer ?? null });
          if (error) throw error;
          return json({ received: true });
        }
        // How many couples were bought, read from Stripe itself (the quantity can be changed at checkout).
        let qty = 1;
        if (!plan) {
          const items = await stripe(`checkout/sessions/${encodeURIComponent(o.id)}/line_items?limit=10`);
          qty = Math.max(1, (items.data ?? []).reduce((t: number, li: any) => t + (li.quantity ?? 0), 0));
        }
        const { error } = await admin.rpc("pl_record_payment", { p_id: o.id, p_network: o.client_reference_id || null, p_kind: plan ? "plan" : "couples", p_qty: qty,
          p_amount: o.amount_total ?? 0, p_currency: o.currency ?? "usd", p_email: o.customer_details?.email ?? null, p_promo: o.metadata?.promo ?? null, p_customer: o.customer ?? null });
        if (error) throw error;
      } else if (ev.type === "invoice.paid" && o.billing_reason === "subscription_cycle") {
        // Teams plans carry their kind and size on the subscription; the network plan doesn't
        const meta = o.parent?.subscription_details?.metadata ?? o.subscription_details?.metadata ?? {};
        const teams = meta.kind === "teams";
        const { error } = await admin.rpc("pl_record_payment", { p_id: o.id, p_network: meta.network || null, p_kind: teams ? "teams_renewal" : "renewal", p_qty: teams ? Math.max(0, Number(meta.seats) || 0) : 1, p_amount: o.amount_paid ?? 0,
          p_currency: o.currency ?? "usd", p_email: o.customer_email ?? null, p_promo: null, p_customer: o.customer ?? null });
        if (error) throw error;
      }
      return json({ received: true });
    } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }  // Stripe retries on 500
  }

  // ---- Signed-in callers ----
  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: "Bad request" }, 400); }
  const user = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: me } = await user.auth.getUser();
  if (!me?.user) return json({ error: "Sign in first" }, 401);

  try {
    if (body.action === "checkout") {
      const { data: isAdmin } = await user.rpc("pl_is_admin", { p_network: body.networkId });
      if (!isAdmin) return json({ error: "Only the network's owners and admins can buy assessments" }, 403);
      const { data: net } = await admin.from("networks").select("id,name,stripe_customer,founding").eq("id", body.networkId).single();
      const founding = !!net?.founding && new Date().toISOString().slice(0, 10) <= FOUNDING_UNTIL;
      if (!net) return json({ error: "Network not found" }, 404);
      const plan = body.kind === "plan";
      const qty = Math.min(50, Math.max(1, Number(body.quantity) || 1));
      const session = await stripe("checkout/sessions", {
        mode: plan ? "subscription" : "payment",
        client_reference_id: net.id,
        ...(net.stripe_customer ? { customer: net.stripe_customer } : { customer_email: me.user.email }),
        // Stripe refuses customer_creation alongside an existing customer, so it's only asked for on a network's first purchase
        ...(plan || net.stripe_customer ? {} : { customer_creation: "always" }),
        line_items: { 0: {
          quantity: plan ? 1 : qty,
          ...(plan ? {} : { adjustable_quantity: { enabled: true, minimum: 1, maximum: 50 } }),
          price_data: { currency: "usd", unit_amount: plan ? PLAN_CENTS : founding ? FOUNDING_CENTS : COUPLE_CENTS,
            product_data: { name: plan ? "Plumbline network plan (one year, unlimited assessments)"
              : `Plumbline assessment (one couple and their references)${founding ? ", founding network price" : ""}` },
            ...(plan ? { recurring: { interval: "year" } } : {}) },
        } },
        allow_promotion_codes: true,
        ...(plan ? { subscription_data: { description: `Plumbline network plan for ${net.name}` } }
                 : { invoice_creation: { enabled: true, invoice_data: { description: `Plumbline assessments for ${net.name}`,
                     custom_fields: { 0: { name: "Network", value: String(net.name).slice(0, 30) } }, footer: "Plumbline · plumblineassessment.com · Thank you for investing in your planters." } } }),
        success_url: `${site}/#/leader?paid=1`,
        cancel_url: `${site}/#/leader`,
      });
      return json({ url: session.url });
    }

    if (body.action === "teams") {
      const { data: isAdmin } = await user.rpc("pl_is_admin", { p_network: body.networkId });
      if (!isAdmin) return json({ error: "Only the owners and admins can buy a plan" }, 403);
      const tier = TEAM_PLANS[String(body.tier)];
      if (!tier) return json({ error: "Choose Starter, Team or Staff" }, 400);
      const extra = body.tier === "staff" ? Math.min(MAX_EXTRA_SEATS, Math.max(0, Math.floor(Number(body.extra) || 0))) : 0;
      const seats = tier.seats + extra;
      const { data: net } = await admin.from("networks").select("id,name,stripe_customer").eq("id", body.networkId).single();
      if (!net) return json({ error: "Organization not found" }, 404);
      const back = RETURN_SITES.includes(String(body.returnTo)) ? String(body.returnTo) : "https://plumblineteams.com";
      const meta = { kind: "teams", tier: String(body.tier), seats: String(seats), network: net.id };
      const items: Record<string, unknown> = { 0: { quantity: 1, price_data: { currency: "usd", unit_amount: tier.cents, recurring: { interval: "year" },
        product_data: { name: `Plumbline Teams ${tier.name} plan (up to ${tier.seats} people, one year)` } } } };
      if (extra) items[1] = { quantity: extra, price_data: { currency: "usd", unit_amount: EXTRA_SEAT_CENTS, recurring: { interval: "year" },
        product_data: { name: "Plumbline Teams: each person past 50 (one year)" } } };
      const session = await stripe("checkout/sessions", {
        mode: "subscription",
        client_reference_id: net.id,
        ...(net.stripe_customer ? { customer: net.stripe_customer } : { customer_email: me.user.email }),
        line_items: items,
        allow_promotion_codes: true,
        metadata: meta,
        subscription_data: { description: `Plumbline Teams ${tier.name} plan for ${net.name} (up to ${seats} people)`, metadata: meta },
        success_url: `${back}/teams/new?paid=1`,
        cancel_url: `${back}/teams/new`,
      });
      return json({ url: session.url });
    }

    if (body.action === "portal") {
      const { data: isAdmin } = await user.rpc("pl_is_admin", { p_network: body.networkId });
      if (!isAdmin) return json({ error: "Only the owners and admins can manage billing" }, 403);
      const { data: net } = await admin.from("networks").select("stripe_customer").eq("id", body.networkId).single();
      if (!net?.stripe_customer) return json({ error: "There's nothing to manage yet. Billing appears after your first purchase." }, 400);
      const back = RETURN_SITES.includes(String(body.returnTo)) ? String(body.returnTo) : site;
      const ps = await stripe("billing_portal/sessions", { customer: net.stripe_customer, return_url: `${back}/leader` });
      return json({ url: ps.url });
    }

    if (body.action === "invite") {
      const hash = await sha256(String(body.token || "").trim());
      const inv = INVITES[hash];
      if (!inv) return json({ error: "That invite link isn't valid" }, 404);
      const { data: isPlatform } = await admin.from("platform_admins").select("user_id").eq("user_id", me.user.id).maybeSingle();
      if (isPlatform) return json({ error: "Invite links are for the networks you invite, so your own account doesn't use them" }, 400);
      const { data: isAdmin } = await user.rpc("pl_is_admin", { p_network: body.networkId });
      if (!isAdmin) return json({ error: "Only the network's owners and admins can use an invite" }, 403);
      const id = `invite_${hash.slice(0, 40)}`;
      const { error: dup } = await admin.from("payments").insert({ id, network_id: body.networkId, kind: "grant", quantity: inv.credits, promo: `beta invite: ${inv.label}`, email: me.user.email });
      if (dup) {
        const { data: prev } = await admin.from("payments").select("network_id").eq("id", id).maybeSingle();
        if (!prev) return json({ error: dup.message }, 400);
        return json(prev.network_id === body.networkId ? { ok: true, already: true } : { used: true, error: "This invite has already been used" });
      }
      const { data: net } = await admin.from("networks").select("credits").eq("id", body.networkId).single();
      // Exactly the invite's number left (it replaces the usual first free couple rather than adding to it).
      await admin.from("networks").update({ credits: Math.max(net?.credits ?? 0, inv.credits), founding: true }).eq("id", body.networkId);
      return json({ ok: true, credits: inv.credits });
    }

    if (body.action === "codes") {
      const { data: isPlatform } = await admin.from("platform_admins").select("user_id").eq("user_id", me.user.id).maybeSingle();
      if (!isPlatform) return json({ error: "Only the platform admin can manage discount codes" }, 403);
      if (body.op === "create") {
        const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
        if (!code) return json({ error: "Give the code a name, like SLN2026" }, 400);
        const pct = Number(body.percentOff), off = Number(body.amountOff);
        const coupon = await stripe("coupons", {
          ...(pct > 0 ? { percent_off: Math.min(100, pct) } : { amount_off: Math.round(off * 100), currency: "usd" }),
          duration: "once", name: String(body.note || code).slice(0, 40),
        });
        const promo = await stripe("promotion_codes", {
          coupon: coupon.id, code,
          ...(Number(body.maxUses) > 0 ? { max_redemptions: Math.floor(Number(body.maxUses)) } : {}),
          ...(body.expires ? { expires_at: Math.floor(new Date(body.expires + "T23:59:59Z").getTime() / 1000) } : {}),
          metadata: { note: String(body.note || "").slice(0, 200), for: String(body.forWhom || "").slice(0, 200) },
        });
        return json({ ok: true, id: promo.id });
      }
      if (body.op === "off") { await stripe(`promotion_codes/${encodeURIComponent(body.id)}`, { active: "false" }); return json({ ok: true }); }
      const list = await stripe("promotion_codes?limit=100&expand[]=data.coupon");
      return json({ codes: (list.data ?? []).map((p: any) => ({ id: p.id, code: p.code, active: p.active, used: p.times_redeemed, max: p.max_redemptions,
        expires: p.expires_at, note: p.metadata?.note || p.coupon?.name || "", forWhom: p.metadata?.for || "",
        off: p.coupon?.percent_off ? `${p.coupon.percent_off}% off` : `$${((p.coupon?.amount_off ?? 0) / 100).toFixed(0)} off` })) });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 400); }
});
