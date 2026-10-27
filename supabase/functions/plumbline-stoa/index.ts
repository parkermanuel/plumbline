// Plumbline -> Stoa (Supabase Edge Function), run hourly by .github/workflows/stoa.yml.
// For each network linked to a church's Stoa (pl_stoa_links), sends the shareable "how they're wired"
// cards from pl_stoa_cards() (summary only; see setup.sql) to that church's Stoa, signed with
// STOA_SHARED_SECRET (HMAC-SHA256 of the body, hex, in x-plumbline-signature). Stoa shows a card only
// when it's released here AND the person turns it on in Stoa. Safe for anyone to call: it only re-sends.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

async function sign(body: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const secret = Deno.env.get("STOA_SHARED_SECRET");
  if (!secret) return Response.json({ skipped: "STOA_SHARED_SECRET not set" });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: links, error } = await admin.from("pl_stoa_links").select("network_id, stoa_url");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const out = [];
  for (const l of links ?? []) {
    const { data: cards, error: e2 } = await admin.rpc("pl_stoa_cards", { p_network: l.network_id });
    if (e2) { out.push({ network: l.network_id, error: e2.message }); continue; }
    if (!cards?.length) { out.push({ network: l.network_id, sent: 0 }); continue; }
    const body = JSON.stringify(cards);
    const r = await fetch(l.stoa_url, { method: "POST", headers: { "content-type": "application/json", "x-plumbline-signature": await sign(body, secret) }, body });
    out.push({ network: l.network_id, sent: cards.length, status: r.status, results: await r.json().catch(() => null) });
  }
  return Response.json({ networks: out });
});
