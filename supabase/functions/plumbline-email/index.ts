// Plumbline email function (Supabase Edge Function). Sends invites, reminders, team invites and "finished" notices through Resend.
// Every permission check lives in the database functions it calls (see supabase/setup.sql).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { personEmail, teamInviteEmail, finishedEmail, reportKeyEmail, boardEmail } from "./templates.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Who each assessment is for (church planting, church staff, nonprofit or business), looked up by link token.
async function audienceByToken(admin: any, tokens: string[]) {
  if (!tokens.length) return {};
  const { data } = await admin.from("participants").select("token, cases(settings)").in("token", tokens);
  return Object.fromEntries((data ?? []).map((p: any) => [p.token, { audience: p.cases?.settings?.audience || "planting", job_role: p.cases?.settings?.role || "", purpose: p.cases?.settings?.purpose || "decide", team_name: p.cases?.settings?.team?.name || "" }]));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "Email isn't set up yet" }, 503);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const site = (Deno.env.get("SITE_URL") ?? "https://plumblineassessment.com").replace(/\/$/, "");
  const from = Deno.env.get("EMAIL_FROM") ?? "Plumbline <plumbline@parkermanuel.com>";
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const user = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const admin = createClient(url, service);

  const send = async (to: string, replyTo: string | null, m: { subject: string; html: string; text: string }) => {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], reply_to: replyTo || undefined, subject: m.subject, html: m.html, text: m.text }),
    });
    return r.ok;
  };

  try {
    let sent = 0, failed = 0;
    if (body.action === "invite" || body.action === "remind") {
      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 20) : [];
      const { data, error } = await user.rpc("pl_email_people", { p_ids: ids, p_kind: body.action });
      if (error) return json({ error: error.message }, 403);
      const aud = await audienceByToken(admin, (data ?? []).map((r: any) => r.token));
      for (const r of data ?? []) (await send(r.email, r.sender_email, personEmail(body.action, { ...r, ...(aud[r.token] || {}) }, site))) ? sent++ : failed++;
      return json({ sent, failed, skipped: ids.length - (data?.length ?? 0) });
    }
    if (body.action === "team") {
      const { data, error } = await user.rpc("pl_member_invite_email", { p_invite: body.inviteId });
      if (error) return json({ error: error.message }, 403);
      for (const r of data ?? []) (await send(r.email, r.sender_email, teamInviteEmail(r, site))) ? sent++ : failed++;
      return json({ sent, failed });
    }
    if (body.action === "finished") {
      if (typeof body.token !== "string" || body.token.length < 20) return json({ sent: 0 });
      const { data, error } = await admin.rpc("pl_finish_notice", { p_token: body.token });
      if (error) return json({ error: "Couldn't send" }, 500);
      const ids = [...new Set((data ?? []).map((r: any) => r.case_id))];
      const { data: cs } = ids.length ? await admin.from("cases").select("id, settings").in("id", ids) : { data: [] };
      const byCase = Object.fromEntries((cs ?? []).map((c: any) => [c.id, { audience: c.settings?.audience || "planting", job_role: c.settings?.role || "", purpose: c.settings?.purpose || "decide", team_name: c.settings?.team?.name || "" }]));
      for (const r of data ?? []) (await send(r.email, null, finishedEmail({ ...r, ...(byCase[r.case_id] || {}) }, site))) ? sent++ : failed++;
      return json({ sent, failed });
    }
    if (body.action === "board") {
      // A person shares their own report with a board member they just added (checked by their private key)
      if (typeof body.key !== "string" || body.key.length < 20 || typeof body.id !== "string") return json({ sent: 0 });
      const { data, error } = await admin.rpc("pl_viewer_email", { p_key: body.key, p_id: body.id });
      if (error) return json({ error: "Couldn't send" }, 500);
      for (const r of data ?? []) (await send(r.email, null, boardEmail(r, site))) ? sent++ : failed++;
      return json({ sent, failed });
    }
    if (body.action === "report_key") {
      // Plumbline Teams: send a finished person their private report link. It only ever goes to their own address.
      if (typeof body.token !== "string" || body.token.length < 20) return json({ sent: 0 });
      const { data, error } = await admin.rpc("pl_report_key_email", { p_token: body.token });
      if (error) return json({ error: "Couldn't send" }, 500);
      for (const r of data ?? []) (await send(r.email, null, reportKeyEmail(r, site))) ? sent++ : failed++;
      return json({ sent, failed });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: "Couldn't send" }, 500);
  }
});
