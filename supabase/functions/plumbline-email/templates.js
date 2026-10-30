// Email templates for Plumbline. Plain functions: data in, { subject, html, text } out.
// Names and network names are typed by users; strip anything that looks like a link so emails can't carry one in
const clean = (s) => String(s ?? "").replace(/\b(?:https?:\/\/|www\.)\S+/gi, "").replace(/\b[\w-]+\.(?:com|org|net|io|co|app|xyz|info|church|link|ly)\b\S*/gi, "").trim();
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const esc = (s) => escHtml(clean(s));
// Preheaders are sometimes built from already-escaped paragraphs: turn them back into plain text before escaping once
const unesc = (s) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const first = (n) => clean(n).split(/\s+/)[0] || "";

function layout({ preheader, heading, paragraphs, button, footer, site }) {
  const logo = `${site}/plumbline-email-logo.png`;
  const p = paragraphs.map((t) => `<p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.55;color:#4a4a48">${t}</p>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f7f5">
<span style="display:none;max-height:0;overflow:hidden">${esc(unesc(preheader))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dcdcd7;border-radius:14px">
<tr><td style="padding:28px 32px 8px"><img src="${logo}" width="146" height="30" alt="Plumbline" style="display:block;border:0"></td></tr>
<tr><td style="padding:16px 32px 8px"><h1 style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:26px;line-height:1.15;letter-spacing:-0.5px;color:#121212">${heading}</h1>${p}</td></tr>
${button ? `<tr><td style="padding:4px 32px 28px"><a href="${escHtml(button.href)}" style="display:inline-block;background:#121212;color:#f7f7f5;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-weight:600;font-size:16px;padding:14px 24px;border-radius:999px">${esc(button.label)}</a>
<p style="margin:16px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#6b6b67">Or copy this link: <span style="word-break:break-all">${escHtml(button.href)}</span></p></td></tr>` : ""}
</table>
<p style="max-width:560px;margin:16px auto 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#6b6b67">${footer}</p>
</td></tr></table></body></html>`;
  const strip = (h) => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const text = [strip(heading), "", ...paragraphs.map(strip), "", button ? `${button.label}: ${button.href}` : "", "", strip(footer)].join("\n");
  return { html, text };
}

// r.audience: "planting" (default), "staff", "nonprofit" or "business". r.job_role: the role a candidate is being considered for.
const AUD_WHAT = { staff: "a church staff role", nonprofit: "a nonprofit leadership role", business: "a business leadership role" };
const what = (r) => (r.job_role ? `the ${esc(r.job_role)} role` : AUD_WHAT[r.audience] || "this role");
const planting = (r) => (!r.audience || r.audience === "planting") && r.purpose !== "team";
// Plumbline Teams: someone already on a team taking it to grow, not to be hired or approved
const isTeam = (r) => r.purpose === "team";
const footFor = (r) => (r.purpose === "self" ? "Plumbline helps people see clearly before they plant a church. This link is personal to you; please don't forward it. Questions? Reply to this email and it goes to the person who invited you." : isTeam(r) ? "Plumbline Teams helps teams grow together. This link is personal to you; please don't forward it. Questions? Reply to this email and it goes to the person who invited you." : planting(r) ? FOOT : "Plumbline is a leadership assessment. This link is personal to you; please don't forward it. Questions? Reply to this email and it goes to the person who invited you.");
// Plumbline Teams minutes come from the app's chapter estimates (plumbline-starter src/lib/plumbline/minutes.ts, whose test
// checks 35 and 30): faith-off nonprofit and business teams skip the gifts, so they take about 30 minutes.
const teamMins = (r) => (r.faith === false ? 30 : 35);
// The same privacy line the team invite uses, so a reminder says it too
const teamPrivacy = (r) => (r.leader_sees ? "Your team leader will see your full report and answers, including health and family, so you can talk it through together." : "It's private to you unless you choose to share it.");
const FOOT = "Plumbline is a church planter assessment for networks. This link is personal to you; please don't forward it. Questions? Reply to this email and it goes to the person who invited you.";

export function personEmail(kind, r, site) {
  const link = `${site}/t/${r.token}`;
  const net = clean(r.network_name) || (isTeam(r) ? "your team" : "your network");
  const sender = r.sender_name ? esc(r.sender_name) : isTeam(r) ? "Your team leader" : "Your network leader";
  const nm = esc(first(r.name));
  const pn = esc(first(r.planter_name)), sn = esc(first(r.spouse_name));
  const reminder = kind === "remind";
  let subject, heading, paragraphs, label;
  if (r.role === "reference" && isTeam(r)) {
    // Plumbline Teams: a teammate rating what they've seen (not sent by email today; the person shares a link instead)
    subject = reminder ? `Reminder: ${first(r.planter_name)} would value your view` : `Would you help ${first(r.planter_name)} grow?`;
    heading = reminder ? `A quick reminder, ${nm}` : `${pn} asked for your view`;
    paragraphs = [
      reminder ? `${pn} is still hoping to hear what you've seen. It takes about 4 minutes, and it picks up where you left off.`
               : `${pn} asked a few people they work with to rate what they've seen, so they can grow. It takes about 4 minutes.`,
      `${pn} sees only the average of everyone's ratings, once at least three people answer, never your own answers. Neither ${pn} nor their leader sees who answered. Rate only what you've actually seen.`,
    ];
    label = reminder ? "Finish my ratings" : "Rate what I've seen";
  } else if (r.role === "reference") {
    subject = reminder ? `Reminder: your reference for ${first(r.planter_name)}` : (planting(r) ? `Would you speak into ${first(r.planter_name)}'s readiness to plant?` : `Would you speak into ${first(r.planter_name)}'s readiness for ${r.job_role ? `the ${clean(r.job_role)} role` : "a new role"}?`);
    heading = reminder ? `A quick reminder, ${nm}` : `${pn} named you as a reference`;
    paragraphs = [
      reminder ? `${sender} is still hoping to hear from you about ${pn}. It takes about 8 minutes, and it picks up where you left off.`
               : r.purpose === "self" ? `${esc(r.planter_name)} named you as someone who knows him well.`
               : planting(r) ? `${esc(r.planter_name)} is being assessed for church planting by ${esc(net)}, and you were named as someone who knows them well.`
               : `${esc(r.planter_name)} is being considered for ${what(r)} at ${esc(net)}, and you were named as someone who knows them well.`,
      r.purpose === "self"
        ? `${pn} is asking whether to plant a church and wants an honest read. Your ratings are combined with at least two others, and ${pn} sees only the averages, never your answers or what you write. Rate only what you've actually seen.`
        : `Your answers go straight to ${planting(r) ? "the network leader" : "the people hiring"}. ${pn} never sees them. Rate only what you've actually seen.`,
    ];
    label = reminder ? "Finish my reference" : "Start the reference";
  } else {
    const mins = r.role === "planter" ? (isTeam(r) ? teamMins(r) : planting(r) ? 35 : 30) : 25;
    const other = r.role === "planter" ? sn : pn;
    const tm = esc(r.team_name) || esc(net);
    const selfCase = r.purpose === "self";
    // A reminder to someone who never opened their link isn't "pick up where you left off": it's the invite again
    const notStarted = reminder && r.status === "invited";
    const invite = !reminder || notStarted;
    // Name the organization with the team: "invited you to join Pinewood Staff at Pinewood Church"
    const org = clean(r.network_name), team = clean(r.team_name);
    const teamLine = team && org && team.toLowerCase() !== org.toLowerCase()
      ? `${sender} invited you to join ${esc(team)} at ${esc(org)} and take Plumbline together, so you can each see your strengths and grow as a team.`
      : `${sender} invited ${tm} to take Plumbline together, so you can each see your strengths and grow as a team.`;
    subject = notStarted ? (isTeam(r) ? `Reminder: ${clean(r.sender_name) || net} invited you to Plumbline Teams` : selfCase ? `Reminder: ${first(r.planter_name)} asked you to take Plumbline with him` : `Reminder: your Plumbline assessment from ${net}`)
      : reminder ? `Pick up where you left off on Plumbline` : isTeam(r) ? `${clean(r.sender_name) || net} invited you to Plumbline Teams` : selfCase ? `${first(r.planter_name)} asked you to take Plumbline with him` : `Your Plumbline assessment from ${net}`;
    heading = notStarted ? (isTeam(r) ? `${nm}, see how you're wired` : `${nm}, your assessment is still waiting`) : reminder ? `Pick up where you left off, ${nm}` : isTeam(r) ? `${nm}, see how you're wired` : `${nm}, your assessment is ready`;
    paragraphs = !invite ? [`Your answers are saved. Open your link to keep going on any device. It takes about ${mins} minutes in all.`, isTeam(r) ? teamPrivacy(r) : ""].filter(Boolean) : isTeam(r) ? [
      `${notStarted ? "A quick reminder: " : ""}${teamLine} It takes about ${mins} minutes.`,
      `This isn't a test you pass or fail, and it isn't part of a hiring decision. When you finish, you'll get your own growth report right away. ${teamPrivacy(r)}`,
      `Every answer saves as you go, so you can stop and finish later on your phone or computer.`,
    ] : selfCase ? [
      `${notStarted ? "A quick reminder: " : ""}${pn} is asking whether to plant a church, and he wants your view as much as his own. Plumbline takes about ${mins} minutes.`,
      `Your answers and your report are yours. ${pn} won't see them. You can share your report with him, or talk it through together.`,
      `Every answer saves as you go, so you can stop and finish later on your phone or computer.`,
    ] : [
      (notStarted ? "A quick reminder: " : "") + (planting(r) ? `${sender} at ${esc(net)} invited you to take Plumbline, a church planter assessment. It takes about ${mins} minutes.` : `${sender} at ${esc(net)} invited you to take Plumbline, a leadership assessment, as part of considering you for ${what(r)}. It takes about ${mins} minutes.`),
      `Every answer saves as you go, so you can stop and finish later on your phone or computer.`,
      other ? `${other} has a separate link. Please take it on your own, and don't compare answers until you've both finished. The differences are some of the most helpful things you'll learn.` : "",
    ].filter(Boolean);
    label = isTeam(r) ? (invite ? "See how I'm wired" : "Pick up where I left off") : invite ? "Start my assessment" : "Continue my assessment";
  }
  return { subject, ...layout({ preheader: paragraphs[0].replace(/<[^>]+>/g, ""), heading, paragraphs, button: { href: link, label }, footer: footFor(r), site }) };
}

export function teamInviteEmail(r, site) {
  const link = `${site}/join/${r.token}`;
  const role = r.role === "admin" ? "an admin" : "a team member";
  const app = r.teams ? "Plumbline Teams" : "Plumbline";
  const subject = `Join ${clean(r.network_name)} on ${app}`;
  return { subject, ...layout({
    preheader: `${clean(r.sender_name) || "Someone"} invited you to join ${clean(r.network_name)}.`,
    heading: `Join ${esc(r.network_name)} on ${app}`,
    // Teams can keep reports private: a co-leader sees only the reports shared with leaders, never a private one
    paragraphs: [`${esc(r.sender_name || "A teammate")} invited you to join ${esc(r.network_name)} on ${app} as ${role}. ${r.teams
        ? "You'll see the same dashboard they do: who's finished, each team map and the reports shared with leaders."
        : "You'll see the same dashboard they do: everyone in progress, the reports and the next steps."}`,
      `This invite works for 30 days.`],
    button: { href: link, label: "Join the team" },
    footer: r.teams ? "Plumbline Teams helps teams grow together. If you weren't expecting this, you can ignore it." : "Plumbline helps churches, networks and organizations assess and grow leaders. If you weren't expecting this, you can ignore it.", site,
  }) };
}

export function finishedEmail(r, site) {
  // Plumbline Teams (28 Oct 2026): a team member finished growing, not being assessed
  if (isTeam(r)) {
    const nm = clean(r.person_name) || "Someone";
    return { subject: `${nm} finished Plumbline Teams`, ...layout({
      preheader: `${nm} finished.`,
      heading: `${esc(nm)} finished`,
      // No hint that a private report is available to the leader; only a "leader sees" team says it's shared
      paragraphs: [`${esc(nm)} finished Plumbline${r.team_name ? ` for ${esc(r.team_name)}` : ""}.${r.leader_sees ? " Their growth report is shared with you, as this team was set up." : ""}`,
        "Your team map fills in as more people finish. It shows once at least 3 have."],
      button: { href: r.team_id ? `${site}/teams/${encodeURIComponent(r.team_id)}` : `${site}/leader`, label: "Open the team" },
      footer: "You're getting this because you lead this team on Plumbline Teams.", site,
    }) };
  }
  const who = esc(r.person_name || (r.person_role === "reference" ? "A reference" : "Someone"));
  const roleWord = r.person_role === "planter" ? "the planter" : r.person_role === "spouse" ? "the planting wife" : "a reference";
  const subject = r.all_done && r.person_role !== "reference" ? `${first(r.planter_name)}'s Plumbline report is ready` : `${clean(r.person_name) || "Someone"} finished Plumbline`;
  return { subject, ...layout({
    preheader: `${clean(r.person_name) || "Someone"} finished.`,
    heading: r.all_done && r.person_role !== "reference" ? `The report for ${esc(r.planter_name)} is ready` : `${who} finished`,
    paragraphs: [`${who} (${planting(r) || r.person_role === "reference" ? roleWord : "the candidate"}) just finished ${planting(r) && r.person_role === "spouse" ? "her" : planting(r) && r.person_role === "planter" ? "his" : "their"} Plumbline assessment for ${esc(r.planter_name)}.`,
      r.all_done ? `${!planting(r) ? "The candidate is done." : r.person_role === "spouse" ? `${esc(first(r.planter_name))} and ${esc(first(r.person_name))} are both done.` : "Everyone being assessed is done."} Open the leader report to see the recommendation and the interview guide.` : `You can watch everyone else's progress on your dashboard.`],
    button: { href: `${site}/case/${r.case_id}`, label: "Open the assessment" },
    footer: `You're getting this because you're on this ${planting(r) ? "network" : "organization"}'s Plumbline team.`, site,
  }) };
}

// Plumbline Teams: a person's private growth report link, sent only to their own address
export function reportKeyEmail(r, site) {
  const link = `${site}/my/${r.report_key}`;
  const nm = esc(first(r.name));
  return { subject: "Your private Plumbline growth report", ...layout({
    preheader: "Your growth report link. It's yours alone.",
    heading: nm ? `${nm}, here's your growth report` : "Here's your growth report",
    paragraphs: [`This is your own private link to your Plumbline growth report${r.team_name ? ` for ${esc(r.team_name)}` : ""}. Only this link opens it, so keep this email and don't forward it.`,
      "Your report shows who can see it."],
    button: { href: link, label: "Open my growth report" },
    footer: "You're getting this because someone asked for your report link from your Plumbline Teams page. Only you receive it. If that wasn't you, you can ignore this email; your report is still private.", site,
  }) };
}

export function boardEmail(r, site) {
  const link = `${site}/b/${r.token}`;
  const owner = esc(first(r.owner_name)) || "Someone";
  const nm = esc(first(r.name));
  return { subject: `${owner} shared their Plumbline report with you`, ...layout({
    preheader: `${owner} wants you to see how they're wired.`,
    heading: nm ? `${nm}, ${owner} shared their report with you` : `${owner} shared their report with you`,
    paragraphs: [`${owner} took Plumbline Teams, which shows how they're wired, ${r.faith === false ? "their strengths and health" : "their strengths, gifts and health"}, and chose to share their growth report with you.`,
      "It's read-only and made for you alone, so please don't forward this email. They can take it back any time."],
    button: { href: link, label: `Open ${owner}'s report` },
    footer: `You're getting this because ${owner} added your email to share their Plumbline report. If you weren't expecting it, you can ignore this email.`, site,
  }) };
}

// When the leader releases reports (owner, 28 Oct 2026): each person gets their own link. Replies go to the leader.
export function releasedEmail(r, site) {
  const link = `${site}/t/${r.token}`;
  const nm = esc(first(r.name));
  const net = clean(r.network_name) || "your network";
  const sender = r.sender_name ? esc(r.sender_name) : planting(r) ? "Your network leader" : "The person who invited you";
  return { subject: "Your Plumbline report is ready", ...layout({
    preheader: `${clean(r.sender_name) || net} released your report.`,
    heading: nm ? `${nm}, your report is ready` : "Your report is ready",
    paragraphs: [`${sender} at ${esc(net)} released your personal Plumbline report. It's written to encourage you and to name a few next steps.`,
      planting(r) && r.role === "spouse" ? `It's about you, and it includes a short summary of how you and ${esc(first(r.planter_name))} see things together.`
        : planting(r) && r.spouse_name ? `It's about you, and it includes a short summary of how you and ${esc(first(r.spouse_name))} see things together.`
        : "It's about you: your strengths, how you're wired and where to grow.",
      "It opens at the same personal link you used to take the assessment."],
    button: { href: link, label: "Open my report" },
    footer: `This link is personal to you; please don't forward it. Questions? Reply to this email and it goes to ${planting(r) ? "your network leader" : "the person who invited you"}.`, site,
  }) };
}

// In-app feedback (owner, 28 Oct 2026): a rating and an optional note, sent to Parker.
export function feedbackEmail(r) {
  const rating = { bad: "Bad", ok: "OK", good: "Good" }[r.rating] || "No rating";
  const page = String(r.page ?? "").replace(/[^\w\/\-#?=&.]/g, "").slice(0, 120);
  const note = escHtml(String(r.note ?? "").slice(0, 2000)).replace(/\n/g, "<br>");
  const app = r.app === "teams" ? "Plumbline Teams" : "Plumbline";
  const who = escHtml(String(r.who ?? "").slice(0, 40));
  const subject = `${app} feedback: ${rating}`;
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#121212"><p style="margin:0 0 8px"><b>${rating}</b> · ${app}${who ? ` · ${who}` : ""}</p>${page ? `<p style="margin:0 0 12px;color:#6b6b67">Page: ${escHtml(page)}</p>` : ""}<p style="margin:0">${note || "<i>No note</i>"}</p></div>`;
  const text = `${rating} · ${app}${who ? ` · ${String(r.who).slice(0, 40)}` : ""}\nPage: ${page}\n\n${String(r.note ?? "").slice(0, 2000) || "(No note)"}`;
  return { subject, html, text };
}
