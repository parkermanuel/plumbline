// Plumbline email function (Supabase Edge Function). Sends invites, reminders, team invites and "finished" notices through Resend.
// Every permission check lives in the database functions it calls (see supabase/setup.sql).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { personEmail, teamInviteEmail, finishedEmail, reportKeyEmail, boardEmail, releasedEmail, feedbackEmail } from "./templates.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Who each assessment is for (church planting, church staff, nonprofit or business), looked up by link token.
async function audienceByToken(admin: any, tokens: string[]) {
  if (!tokens.length) return {};
  const { data } = await admin.from("participants").select("token, status, cases(settings)").in("token", tokens);
  // status: a reminder to someone who never started reads like the invite. faith: only nonprofit and business teams can
  // leave the faith questions off (church staff and planting always include them), which shortens the estimate.
  return Object.fromEntries((data ?? []).map((p: any) => {
    const st = p.cases?.settings || {};
    const audience = st.audience || "planting";
    return [p.token, { audience, job_role: st.role || "", purpose: st.purpose || "decide", team_name: st.team?.name || "", leader_sees: st.leaderSees === true,
      status: p.status || "", faith: !((audience === "nonprofit" || audience === "business") && (st.faith === false || st.faith === "false")) }];
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "Email isn't set up yet" }, 503);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const site = (Deno.env.get("SITE_URL") ?? "https://joinplumbline.com").replace(/\/$/, "");
  const from = Deno.env.get("EMAIL_FROM") ?? "Plumbline <plumbline@parkermanuel.com>";
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const user = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const admin = createClient(url, service);

  // plumbline@joinplumbline.com has no inbox, so emails without a leader to reply to send replies to hello@parkermanuel.com
  const send = async (to: string, replyTo: string | null, m: { subject: string; html: string; text: string }) => {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], reply_to: replyTo || "hello@parkermanuel.com", subject: m.subject, html: m.html, text: m.text }),
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
    if (body.action === "my_ref") {
      // The planter invites a reference they just added from their own link (checked by the link and the person's id)
      if (typeof body.token !== "string" || body.token.length < 20 || typeof body.id !== "string") return json({ sent: 0 });
      const { data, error } = await admin.rpc("pl_my_ref_email", { p_token: body.token, p_id: body.id });
      if (error) return json({ error: "Couldn't send" }, 500);
      const aud = await audienceByToken(admin, (data ?? []).map((r: any) => r.token));
      for (const r of data ?? []) (await send(r.email, r.sender_email, personEmail("invite", { ...r, ...(aud[r.token] || {}) }, site))) ? sent++ : failed++;
      return json({ sent, failed });
    }
    if (body.action === "team") {
      const { data, error } = await user.rpc("pl_member_invite_email", { p_invite: body.inviteId });
      if (error) return json({ error: error.message }, 403);
      // A Plumbline Teams organization (set up from the Teams front door) gets the Teams footer
      const { data: inv } = (data ?? []).length ? await admin.from("network_invites").select("networks(settings)").eq("id", body.inviteId).maybeSingle() : { data: null };
      const kinds = (inv as any)?.networks?.settings?.kinds;
      const teams = Array.isArray(kinds) && kinds.length > 0 && kinds.every((k: string) => k === "teams");
      for (const r of data ?? []) (await send(r.email, r.sender_email, teamInviteEmail({ ...r, teams }, site))) ? sent++ : failed++;
      return json({ sent, failed });
    }
    if (body.action === "finished") {
      if (typeof body.token !== "string" || body.token.length < 20) return json({ sent: 0 });
      const { data, error } = await admin.rpc("pl_finish_notice", { p_token: body.token });
      if (error) return json({ error: "Couldn't send" }, 500);
      const ids = [...new Set((data ?? []).map((r: any) => r.case_id))];
      const { data: cs } = ids.length ? await admin.from("cases").select("id, settings").in("id", ids) : { data: [] };
      const byCase = Object.fromEntries((cs ?? []).map((c: any) => [c.id, { audience: c.settings?.audience || "planting", job_role: c.settings?.role || "", purpose: c.settings?.purpose || "decide", team_name: c.settings?.team?.name || "", team_id: c.settings?.team?.id || "", leader_sees: c.settings?.leaderSees === true }]));
      for (const r of data ?? []) (await send(r.email, null, finishedEmail({ ...r, ...(byCase[r.case_id] || {}) }, site))) ? sent++ : failed++;
      return json({ sent, failed });
    }
    if (body.action === "board") {
      // A person shares their own report with a board member they just added (checked by their private key)
      if (typeof body.key !== "string" || body.key.length < 20 || typeof body.id !== "string") return json({ sent: 0 });
      const { data, error } = await admin.rpc("pl_viewer_email", { p_key: body.key, p_id: body.id });
      if (error) return json({ error: "Couldn't send" }, 500);
      // A team that turned faith questions off has no gifts section, so the email doesn't mention gifts
      const { data: faith } = (data ?? []).length ? await admin.rpc("pl_viewer_faith", { p_id: body.id }) : { data: true };
      for (const r of data ?? []) (await send(r.email, null, boardEmail({ ...r, faith: faith !== false }, site))) ? sent++ : failed++;
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
    if (body.action === "released") {
      // The leader released reports: email the planting husband and wife their own link, once (checked in pl_release_email)
      if (typeof body.caseId !== "string") return json({ sent: 0 });
      const { data, error } = await user.rpc("pl_release_email", { p_case: body.caseId });
      if (error) return json({ error: error.message }, 403);
      for (const r of data ?? []) (await send(r.email, r.sender_email, releasedEmail(r, site))) ? sent++ : failed++;
      return json({ sent, failed });
    }
    if (body.action === "feedback") {
      // In-app feedback: a rating and an optional note, emailed to Parker. No answers or personal data are sent.
      const rating = ["bad", "ok", "good"].includes(body.rating) ? body.rating : "";
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
      if (!rating && !note) return json({ sent: 0 });
      const { count } = await admin.from("email_log").select("id", { count: "exact", head: true }).eq("kind", "feedback").gt("at", new Date(Date.now() - 864e5).toISOString());
      if ((count ?? 0) >= 200) return json({ sent: 0, failed: 0, limited: true });
      await admin.from("email_log").insert({ network_id: null, kind: "feedback" });
      const to = Deno.env.get("FEEDBACK_TO") ?? "hello@parkermanuel.com";
      const ok = await send(to, null, feedbackEmail({ rating, note, page: body.page, app: body.app, who: body.who }));
      return json({ sent: ok ? 1 : 0, failed: ok ? 0 : 1 });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: "Couldn't send" }, 500);
  }
});
