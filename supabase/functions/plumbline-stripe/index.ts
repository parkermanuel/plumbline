// Plumbline Stripe webhook (Supabase Edge Function). When a network buys assessments, adds that many couples to its balance.
// Set STRIPE_WEBHOOK_SECRET (the endpoint's signing secret from Stripe). The credit itself is pl_add_couples in setup.sql.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { verifySignature, creditFromEvent } from "./stripe.js";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return new Response("Not set up", { status: 503 });
  const raw = await req.text();
  if (!(await verifySignature(raw, req.headers.get("Stripe-Signature"), secret))) return new Response("Bad signature", { status: 400 });
  let event: unknown;
  try { event = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  const credit = creditFromEvent(event);
  if (!credit) return new Response("ignored", { status: 200 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await admin.rpc("pl_add_couples", { p_session: credit.session, p_network: credit.network, p_couples: credit.couples, p_amount: credit.amountPaid });
  if (error) { console.error("credit failed", error.message); return new Response("Retry", { status: 500 }); }
  return new Response("ok", { status: 200 });
});
