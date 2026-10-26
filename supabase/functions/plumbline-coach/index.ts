// Plumbline report coach (Supabase Edge Function). Answers questions about one report, in context.
// Who can ask: the person with their own released report link, or a signed-in member of the team that owns the case.
// The page sends a summary of the report it is showing (never private notes, safety answers or reference comments);
// this function checks the asker may see that report, sends the question to Claude, and stores nothing but a daily count.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MODEL = Deno.env.get("COACH_MODEL") ?? "claude-sonnet-5-5";
const DAILY = { person: 30, leader: 60 };

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

function system(mode: "person" | "leader", faith: boolean, purpose: string) {
  const who = mode === "leader"
    ? "You are talking with the leader who is reading this person's Plumbline report (a network leader, hiring leader or team leader)."
    : "You are talking with the person this Plumbline report is about. It is their own report.";
  return [
    "You are the Plumbline report coach. Plumbline is an assessment built by Parker Manuel, a church planter and pastor, for church planters, church staff and teams.",
    who,
    "Answer only from the report summary below and what the person tells you. If the report doesn't say, say so plainly. Never invent scores, bands or facts, and never change or second-guess a score; explain how it reads instead.",
    "Be warm, direct and brief: two short paragraphs or a few bullets at most, then one practical next step. Plain words, no jargon, no flattery.",
    mode === "person"
      ? "Encourage growth without shame. Don't guess what their leader will decide. For anything about readiness or a decision, point them to the conversation with their leader."
      : "The report is one input, never the decision. Help the leader prepare good conversations and questions; don't make the decision for them, and never suggest using the report alone to approve or decline anyone.",
    faith
      ? "Where it helps, ground counsel in Scripture within historic Protestant orthodoxy, quoting the CSB briefly and accurately with the reference. Don't preach."
      : "This organization chose a version without faith language. Don't bring in Scripture or faith terms unless the person does.",
    "This isn't a clinical or psychological test, and you aren't a counselor. If someone mentions abuse, danger, self-harm or a crisis, respond with care, encourage them to reach a trusted person or professional now, and give 911 (US) and 988 (US Suicide & Crisis Lifeline) for emergencies.",
    purpose === "team" ? "This is a team growth report, not a hiring or planting decision." : "",
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "The coach isn't set up yet" }, 503);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const mode: "person" | "leader" = body.mode === "leader" ? "leader" : "person";
  const admin = createClient(url, service);

  // 1. May this person see this report?
  let usageKey = "";
  let faith = true, purpose = "decide";
  if (mode === "person") {
    const token = clip(body.token, 200);
    if (!/^[a-f0-9]{20,}$/.test(token)) return json({ error: "That link isn't working" }, 403);
    const pub = createClient(url, anon);
    const { data, error } = await pub.rpc("pl_report", { p_token: token });
    if (error || !data?.released) return json({ error: "Your report isn't open yet" }, 403);
    faith = data.case?.faith !== false;
    purpose = data.case?.purpose || "decide";
    usageKey = "t:" + (await sha(token));
  } else {
    const auth = req.headers.get("Authorization") ?? "";
    const user = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u } = await user.auth.getUser();
    if (!u?.user) return json({ error: "Please sign in again" }, 401);
    const caseId = clip(body.caseId, 64);
    const { data: c } = await user.from("cases").select("id, settings").eq("id", caseId).maybeSingle();
    if (!c) return json({ error: "You don't have access to this report" }, 403);
    faith = c.settings?.faith !== false;
    purpose = c.settings?.purpose || "decide";
    usageKey = "u:" + u.user.id;
  }

  // 2. A fair daily limit
  const { data: ok, error: tickErr } = await admin.rpc("pl_coach_tick", { p_key: usageKey, p_limit: DAILY[mode] });
  if (tickErr) return json({ error: "The coach is busy. Try again in a minute." }, 503);
  if (!ok) return json({ error: "That's the limit for today. The coach will be ready again tomorrow." }, 429);

  // 3. Ask Claude
  const summary = clip(body.summary, 14000);
  const viewing = clip(body.viewing, 120);
  const history = (Array.isArray(body.history) ? body.history : []).slice(-10)
    .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m.text === "string")
    .map((m: any) => ({ role: m.role, content: clip(m.text, 2000) }));
  const question = clip(body.question, 1500).trim();
  if (!question) return json({ error: "Ask a question" }, 400);
  if (history.length && history[0].role !== "user") history.shift();
  const messages = [...history, { role: "user", content: (viewing ? `(I'm looking at the "${viewing}" part of the report.)\n\n` : "") + question }];

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: system(mode, faith, purpose) + "\n\nREPORT SUMMARY\n" + summary,
      messages,
    }),
  });
  if (!r.ok) {
    console.error("coach", r.status, (await r.text()).slice(0, 300));
    return json({ error: "The coach couldn't answer just now. Try again." }, 502);
  }
  const out = await r.json();
  const text = (out.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
  return json({ text });
});
