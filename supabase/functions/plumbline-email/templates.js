// Email templates for Plumbline. Plain functions: data in, { subject, html, text } out.
// Names and network names are typed by users; strip anything that looks like a link so emails can't carry one in
const clean = (s) => String(s ?? "").replace(/\b(?:https?:\/\/|www\.)\S+/gi, "").replace(/\b[\w-]+\.(?:com|org|net|io|co|app|xyz|info|church|link|ly)\b\S*/gi, "").trim();
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const esc = (s) => escHtml(clean(s));
const first = (n) => clean(n).split(/\s+/)[0] || "";

function layout({ preheader, heading, paragraphs, button, footer, site }) {
  const logo = `${site}/plumbline-email-logo.png`;
  const p = paragraphs.map((t) => `<p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.55;color:#4a4a48">${t}</p>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f7f5">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
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
const footFor = (r) => (isTeam(r) ? "Plumbline Teams helps teams grow together. This link is personal to you; please don't forward it. Questions? Reply to this email and it goes to the person who invited you." : planting(r) ? FOOT : "Plumbline is a leadership assessment. This link is personal to you; please don't forward it. Questions? Reply to this email and it goes to the person who invited you.");
const FOOT = "Plumbline is a church planter assessment for networks. This link is personal to you; please don't forward it. Questions? Reply to this email and it goes to the person who invited you.";

export function personEmail(kind, r, site) {
  const link = `${site}/t/${r.token}`;
  const net = clean(r.network_name) || "your network";
  const sender = r.sender_name ? esc(r.sender_name) : "Your network leader";
  const nm = esc(first(r.name));
  const pn = esc(first(r.planter_name)), sn = esc(first(r.spouse_name));
  const reminder = kind === "remind";
  let subject, heading, paragraphs, label;
  if (r.role === "reference") {
    subject = reminder ? `Reminder: your reference for ${first(r.planter_name)}` : (planting(r) ? `Would you speak into ${first(r.planter_name)}'s readiness to plant?` : `Would you speak into ${first(r.planter_name)}'s readiness for ${r.job_role ? `the ${clean(r.job_role)} role` : "a new role"}?`);
    heading = reminder ? `A quick reminder, ${nm}` : `${pn} named you as a reference`;
    paragraphs = [
      reminder ? `${sender} is still hoping to hear from you about ${pn}. It takes about 8 minutes, and it picks up where you left off.`
               : planting(r) ? `${esc(r.planter_name)} is being assessed for church planting by ${esc(net)}, and you were named as someone who knows them well.`
               : `${esc(r.planter_name)} is being considered for ${what(r)} at ${esc(net)}, and you were named as someone who knows them well.`,
      `Your answers go straight to ${planting(r) ? "the network leader" : "the people hiring"}. ${pn} never sees them. Rate only what you've actually seen.`,
    ];
    label = reminder ? "Finish my reference" : "Start the reference";
  } else {
    const mins = r.role === "planter" ? (planting(r) ? 35 : 30) : 25;
    const other = r.role === "planter" ? sn : pn;
    const tm = esc(r.team_name) || esc(net);
    subject = reminder ? `Pick up where you left off on Plumbline` : isTeam(r) ? `${clean(r.sender_name) || net} invited you to Plumbline Teams` : `Your Plumbline assessment from ${net}`;
    heading = reminder ? `Pick up where you left off, ${nm}` : isTeam(r) ? `${nm}, see how you're wired` : `${nm}, your assessment is ready`;
    paragraphs = reminder ? [`Your answers are saved. Open your link to keep going on any device. It takes about ${mins} minutes in all.`] : isTeam(r) ? [
      `${sender} invited ${tm} to take Plumbline together, so you can each see your strengths and grow as a team. It takes about ${mins} minutes.`,
      `This isn't a test you pass or fail, and it isn't part of a hiring decision. When you finish, you'll get your own growth report right away. It's private to you unless you choose to share it.`,
      `Every answer saves as you go, so you can stop and finish later on your phone or computer.`,
    ] : [
      planting(r) ? `${sender} at ${esc(net)} invited you to take Plumbline, a church planter assessment. It takes about ${mins} minutes.` : `${sender} at ${esc(net)} invited you to take Plumbline, a leadership assessment, as part of considering you for ${what(r)}. It takes about ${mins} minutes.`,
      `Every answer saves as you go, so you can stop and finish later on your phone or computer.`,
      other ? `${other} has a separate link. Please take it on your own, and don't compare answers until you've both finished. The differences are some of the most helpful things you'll learn.` : "",
    ].filter(Boolean);
    label = isTeam(r) ? (reminder ? "Pick up where I left off" : "See how I'm wired") : reminder ? "Continue my assessment" : "Start my assessment";
  }
  return { subject, ...layout({ preheader: paragraphs[0].replace(/<[^>]+>/g, ""), heading, paragraphs, button: { href: link, label }, footer: footFor(r), site }) };
}

export function teamInviteEmail(r, site) {
  const link = `${site}/join/${r.token}`;
  const role = r.role === "admin" ? "an admin" : "an assessor";
  const subject = `Join ${clean(r.network_name)} on Plumbline`;
  return { subject, ...layout({
    preheader: `${clean(r.sender_name) || "Someone"} invited you to join ${clean(r.network_name)}.`,
    heading: `Join ${esc(r.network_name)} on Plumbline`,
    paragraphs: [`${esc(r.sender_name || "A teammate")} invited you to join ${esc(r.network_name)} on Plumbline as ${role}. You'll see the same dashboard they do: everyone in progress, the reports and the next steps.`,
      `This invite works for 30 days.`],
    button: { href: link, label: "Join the team" },
    footer: "Plumbline helps churches, networks and organizations assess and grow leaders. If you weren't expecting this, you can ignore it.", site,
  }) };
}

export function finishedEmail(r, site) {
  const who = esc(r.person_name || (r.person_role === "reference" ? "A reference" : "Someone"));
  const roleWord = r.person_role === "planter" ? "the planter" : r.person_role === "spouse" ? "the spouse" : "a reference";
  const subject = r.all_done && r.person_role !== "reference" ? `${first(r.planter_name)}'s Plumbline report is ready` : `${clean(r.person_name) || "Someone"} finished Plumbline`;
  return { subject, ...layout({
    preheader: `${clean(r.person_name) || "Someone"} finished.`,
    heading: r.all_done && r.person_role !== "reference" ? `The report for ${esc(r.planter_name)} is ready` : `${who} finished`,
    paragraphs: [`${who} (${planting(r) || r.person_role === "reference" ? roleWord : "the candidate"}) just finished their Plumbline assessment for ${esc(r.planter_name)}.`,
      r.all_done ? `${planting(r) ? "The planter and spouse are both done." : "The candidate is done."} Open the leader report to see the recommendation and the interview guide.` : `You can watch everyone else's progress on your dashboard.`],
    button: { href: `${site}/case/${r.case_id}`, label: "Open the assessment" },
    footer: "You're getting this because you're on this network's Plumbline team.", site,
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
      "Who else can see it (your team leader, or anyone you share it with) was explained when you started, and you can see it on your report."],
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
    paragraphs: [`${owner} took Plumbline Teams, which shows how they're wired, their strengths, gifts and health, and chose to share their growth report with you.`,
      "It's read-only and made for you alone, so please don't forward this email. They can take it back any time."],
    button: { href: link, label: `Open ${owner}'s report` },
    footer: `You're getting this because ${owner} added your email to share their Plumbline report. If you weren't expecting it, you can ignore this email.`, site,
  }) };
}
