// Email templates for Plumbline. Plain functions: data in, { subject, html, text } out.
// Names and network names are typed by users; strip anything that looks like a link so emails can't carry one in
const clean = (s) => String(s ?? "").replace(/\b(?:https?:\/\/|www\.)\S+/gi, "").replace(/\b[\w-]+\.(?:com|org|net|io|co|app|xyz|info|church|link|ly)\b\S*/gi, "").trim();
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const esc = (s) => escHtml(clean(s));
const first = (n) => clean(n).split(/\s+/)[0] || "";

function layout({ preheader, heading, paragraphs, button, footer, site }) {
  const logo = `${site}/plumbline-email-logo.png`;
  const p = paragraphs.map((t) => `<p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.55;color:#48535e">${t}</p>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f4">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f4;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d9ddd6;border-radius:14px">
<tr><td style="padding:28px 32px 8px"><img src="${logo}" width="146" height="30" alt="Plumbline" style="display:block;border:0"></td></tr>
<tr><td style="padding:16px 32px 8px"><h1 style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:26px;line-height:1.15;letter-spacing:-0.5px;color:#141c24">${heading}</h1>${p}</td></tr>
${button ? `<tr><td style="padding:4px 32px 28px"><a href="${escHtml(button.href)}" style="display:inline-block;background:#141c24;color:#f6f7f4;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-weight:600;font-size:16px;padding:14px 24px;border-radius:999px">${esc(button.label)}</a>
<p style="margin:16px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#636c76">Or copy this link: <span style="word-break:break-all">${escHtml(button.href)}</span></p></td></tr>` : ""}
</table>
<p style="max-width:560px;margin:16px auto 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#636c76">${footer}</p>
</td></tr></table></body></html>`;
  const strip = (h) => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const text = [strip(heading), "", ...paragraphs.map(strip), "", button ? `${button.label}: ${button.href}` : "", "", strip(footer)].join("\n");
  return { html, text };
}

const FOOT = "Plumbline is a free church planter assessment. This link is personal to you; please don't forward it. Questions? Reply to this email and it goes to the person who invited you.";

export function personEmail(kind, r, site) {
  const link = `${site}/#/t/${r.token}`;
  const net = clean(r.network_name) || "your network";
  const sender = r.sender_name ? esc(r.sender_name) : "Your network leader";
  const nm = esc(first(r.name));
  const pn = esc(first(r.planter_name)), sn = esc(first(r.spouse_name));
  const reminder = kind === "remind";
  let subject, heading, paragraphs, label;
  if (r.role === "reference") {
    subject = reminder ? `Reminder: your reference for ${first(r.planter_name)}` : `Would you speak into ${first(r.planter_name)}'s readiness to plant?`;
    heading = reminder ? `A quick reminder, ${nm}` : `${pn} named you as a reference`;
    paragraphs = [
      reminder ? `${sender} is still hoping to hear from you about ${pn}. It takes about 8 minutes, and it picks up where you left off.`
               : `${esc(r.planter_name)} is being assessed for church planting by ${esc(net)}, and you were named as someone who knows them well.`,
      `Rate only what you've actually seen. Your written comments go only to the network leader.`,
    ];
    label = reminder ? "Finish my reference" : "Start the reference";
  } else {
    const mins = r.role === "planter" ? 35 : 25;
    const other = r.role === "planter" ? sn : pn;
    subject = reminder ? `Pick up where you left off on Plumbline` : `Your Plumbline assessment from ${net}`;
    heading = reminder ? `Pick up where you left off, ${nm}` : `${nm}, your assessment is ready`;
    paragraphs = reminder ? [`Your answers are saved. Open your link to keep going on any device. It takes about ${mins} minutes in all.`] : [
      `${sender} at ${esc(net)} invited you to take Plumbline, a church planter assessment. It takes about ${mins} minutes.`,
      `Every answer saves as you go, so you can stop and finish later on your phone or computer.`,
      other ? `${other} has a separate link. Please take it on your own, and don't compare answers until you've both finished. The differences are some of the most helpful things you'll learn.` : "",
    ].filter(Boolean);
    label = reminder ? "Continue my assessment" : "Start my assessment";
  }
  return { subject, ...layout({ preheader: paragraphs[0].replace(/<[^>]+>/g, ""), heading, paragraphs, button: { href: link, label }, footer: FOOT, site }) };
}

export function teamInviteEmail(r, site) {
  const link = `${site}/#/join/${r.token}`;
  const role = r.role === "admin" ? "an admin" : "an assessor";
  const subject = `Join ${clean(r.network_name)} on Plumbline`;
  return { subject, ...layout({
    preheader: `${clean(r.sender_name) || "Someone"} invited you to join ${clean(r.network_name)}.`,
    heading: `Join ${esc(r.network_name)} on Plumbline`,
    paragraphs: [`${esc(r.sender_name || "A teammate")} invited you to help assess church planters as ${role}. You'll see your network's assessments, reports and interview guides.`,
      `This invite works for 30 days.`],
    button: { href: link, label: "Join the team" },
    footer: "Plumbline is a free church planter assessment for networks. If you weren't expecting this, you can ignore it.", site,
  }) };
}

export function finishedEmail(r, site) {
  const who = esc(r.person_name || (r.person_role === "reference" ? "A reference" : "Someone"));
  const roleWord = r.person_role === "planter" ? "the planter" : r.person_role === "spouse" ? "the spouse" : "a reference";
  const subject = r.all_done && r.person_role !== "reference" ? `${first(r.planter_name)}'s Plumbline report is ready` : `${clean(r.person_name) || "Someone"} finished Plumbline`;
  return { subject, ...layout({
    preheader: `${clean(r.person_name) || "Someone"} finished.`,
    heading: r.all_done && r.person_role !== "reference" ? `The report for ${esc(r.planter_name)} is ready` : `${who} finished`,
    paragraphs: [`${who} (${roleWord}) just finished their Plumbline assessment for ${esc(r.planter_name)}.`,
      r.all_done ? `The planter and spouse are both done. Open the leader report to see the recommendation and the interview guide.` : `You can watch everyone else's progress on your dashboard.`],
    button: { href: `${site}/#/case/${r.case_id}`, label: "Open the assessment" },
    footer: "You're getting this because you're on this network's Plumbline team.", site,
  }) };
}
