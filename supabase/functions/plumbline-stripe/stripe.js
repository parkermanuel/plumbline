// Pure helpers for the Stripe webhook (shared with test/stripe.test.mjs). Web Crypto only, so it runs in Deno and Node.
export const PLUMBLINE_LINK = "plink_1UTmJqE0jBv3Tf48fnqFpQTK"; // the $99-per-couple payment link (owner, 23 Oct 2026)
export const PRICE_PER_COUPLE = 9900; // cents, before any discount code

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

/** Checks the Stripe-Signature header against the raw body. True only for a fresh, correctly signed event. */
export async function verifySignature(raw, header, secret, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = {};
  const v1 = [];
  for (const kv of String(header).split(",")) { const [k, v] = kv.split("="); if (k === "t") parts.t = v; if (k === "v1" && v) v1.push(v); }
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > toleranceSec || !v1.length) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.t}.${raw}`)));
  return v1.some((s) => same(s, sig));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Turns a Stripe event into a credit to add, or null when it isn't a completed, paid Plumbline checkout for a network. */
export function creditFromEvent(event) {
  if (!event || event.type !== "checkout.session.completed") return null;
  const s = event.data?.object;
  if (!s || s.payment_link !== PLUMBLINE_LINK || s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return null;
  const network = String(s.client_reference_id || "");
  if (!UUID.test(network)) return null;
  const couples = Math.round(Number(s.amount_subtotal) / PRICE_PER_COUPLE);
  if (!Number.isInteger(couples) || couples < 1 || couples > 50) return null;
  return { session: String(s.id), network, couples, amountPaid: Number(s.amount_total) || 0 };
}
