// Network-team screens for the live site: sign-in, onboarding, dashboard, invites & status, settings, team, join, platform overview.
import * as L from "./live.js";
import * as B from "./bank.js";

let H; // helpers from app.js: esc, first, go, render, toast, copy, progressBar, ago, roleName, view(), SAMPLES, scoreCase
export function init(helpers) { H = helpers; }
const esc = (s) => H.esc(s);
const fmt = (iso) => { if (!iso) return ""; try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; } };
const roleLabel = { owner: "Owner", admin: "Admin", assessor: "Assessor" };

// ---------- sign-in and onboarding ----------
export function login(note = "") {
  return `<div class="wrap" style="max-width:34rem"><form class="stack-lg" id="login">
    <div class="stack"><h1 style="font-size:clamp(2rem,4vw,2.6rem)">Sign in</h1><p class="lede" style="margin:0">${note || "For network leaders and their teams. We'll email you a sign-in link, so there's no password to remember."}</p></div>
    <label class="field">Your email<input id="l-email" type="email" required autocomplete="email" placeholder="you@yournetwork.org"></label>
    <div id="l-msg"></div>
    <div><button class="btn" type="submit">Email me a sign-in link</button></div>
    <p class="small">Planters, spouses and references don't need to sign in. They use the personal link their network leader sends.</p>
  </form></div>`;
}
function onboarding() {
  return `<div class="wrap" style="max-width:38rem"><form class="stack-lg" id="onboard">
    <div class="stack"><h1 style="font-size:clamp(2rem,4vw,2.6rem)">Set up your network</h1><p class="lede" style="margin:0">One account for your whole team. You can invite other leaders and assessors next.</p></div>
    <div class="panel stack">
      <label class="field">Network or church name<input id="o-net" required maxlength="120" placeholder="Front Range Planting Network"></label>
      <label class="field">Your name<input id="o-me" required maxlength="120" autocomplete="name" placeholder="Dana Ellis"></label>
    </div>
    <div id="o-msg"></div>
    <div><button class="btn" type="submit">Create my network</button></div>
    <p class="small">Joining an existing network? Ask its owner to invite you, then open the link in that email.</p>
  </form></div>`;
}

// ---------- dashboard ----------
export function dashboard() {
  const S = L.state;
  if (!S.session) return login();
  if (!S.loaded) return `<div class="wrap"><p class="muted">Loading your assessments…</p></div>`;
  if (S.error && !S.networks.length) return `<div class="wrap"><div class="notice red">Couldn't load your assessments: ${esc(S.error)}. Reload the page to try again.</div></div>`;
  if (!S.networks.length) return onboarding();
  const n = L.active(), v = H.view();
  const q = (v.q || "").toLowerCase(), filter = v.filter || "all";
  const all = L.cases();
  const stage = (c) => {
    const need = c.married ? ["planter", "spouse"] : ["planter"];
    return need.every((r) => c.finishedRoles.includes(r)) ? "review" : c.people.some((p) => p.status !== "invited") ? "progress" : "new";
  };
  const shown = all.filter((c) => (!q || c.label.toLowerCase().includes(q) || (c.city || "").toLowerCase().includes(q)) && (filter === "all" || stage(c) === filter));
  const counts = { all: all.length, new: 0, progress: 0, review: 0 }; all.forEach((c) => counts[stage(c)]++);
  const chip = (k, l) => `<button data-act="dash-filter" data-f="${k}" aria-pressed="${filter === k}">${l} <span class="num">${counts[k]}</span></button>`;
  return `<div class="wrap stack-lg">
    <div class="spread"><div class="row" style="gap:14px">${H.safeUrl(n.logo_url) ? `<img src="${esc(H.safeUrl(n.logo_url))}" alt="" class="net-logo">` : ""}<div class="stack" style="gap:4px">
      ${S.networks.length > 1 ? `<label class="small" for="net-switch">Network</label><select id="net-switch" class="input" style="padding:6px 10px;width:auto">${S.networks.map((x) => `<option value="${x.id}" ${x.id === n.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : `<span class="small">${esc(roleLabel[L.myRole()])}</span>`}
      <h1 style="font-size:clamp(1.8rem,4vw,2.6rem)">${esc(n.name)}</h1></div></div>
      <div class="row"><button class="btn ghost" data-act="nav" data-to="settings">${L.canAdmin() ? "Settings & team" : "Team"}</button>${S.isPlatformAdmin ? `<button class="btn ghost" data-act="nav" data-to="admin">Platform</button>` : ""}<button class="btn" data-act="nav" data-to="newcase">New assessment</button></div></div>
    ${all.length ? `<div class="spread"><div class="seg" role="group" aria-label="Filter">${chip("all", "All")}${chip("new", "Not started")}${chip("progress", "In progress")}${chip("review", "Ready to review")}</div>
      <input id="dash-q" class="input" style="max-width:260px" placeholder="Search by name or city" value="${esc(v.q || "")}" aria-label="Search assessments"></div>` : `<div class="notice chalk">No assessments yet. Choose <b>New assessment</b> to set one up and email each person their link. The samples below show what finished reports look like.</div>`}
    <div class="cases">${shown.map((c) => {
      const refs = c.people.filter((p) => p.role === "reference");
      const st = stage(c);
      return `<button class="case-row live" data-act="open-case" data-id="${c.id}"><div><div class="case-name">${esc(c.label)}</div><div class="small">${esc([c.city, "Started " + fmt(c.created)].filter(Boolean).join(" · "))}</div></div>
        <div class="pbars">${c.people.filter((p) => p.role !== "reference").map((p) => H.progressBar(p)).join("")}<div class="small">${refs.length ? `${refs.filter((x) => x.status === "finished").length} of ${refs.length} references finished` : "No references yet"}</div></div>
        <div>${st === "review" ? `<span class="outcome tone-a">Ready to review</span>` : st === "progress" ? `<span class="sdot">In progress</span>` : `<span class="sdot">Not started</span>`}</div></button>`;
    }).join("")}${all.length && !shown.length ? `<p class="muted">Nothing matches that search.</p>` : ""}</div>
    <details class="stack"><summary class="small" style="cursor:pointer">Sample reports</summary><div class="cases" style="margin-top:12px">${H.SAMPLES.map((c) => { const r = H.scoreCase(c); return `<button class="case-row" data-act="open-case" data-id="${c.id}"><div><div class="case-name">${esc(c.label)}</div><div class="small">Sample</div></div><div></div><div><span class="outcome tone-${r.outcome.tone}">${r.outcome.name}</span></div></button>`; }).join("")}</div></details>
  </div>`;
}

// ---------- new assessment ----------
export function newCase() {
  const n = L.active();
  if (!n) return dashboard();
  const sg = n.settings?.signGifts !== false;
  return `<div class="wrap" style="max-width:40rem"><form class="stack-lg" id="newcase-live">
    <div class="stack"><h1 style="font-size:clamp(2rem,4vw,2.6rem)">New assessment</h1><p class="lede" style="margin:0">Set up one planter (and spouse). Each person gets a personal link by email, and you'll see their progress live.</p></div>
    <div class="panel stack">
      <div class="two" style="gap:12px"><label class="field">Planter's full name<input id="f-pn" required maxlength="120" autocomplete="off"></label><label class="field">Planter's email<input id="f-pe" type="email" autocomplete="off"></label></div>
      <div class="field"><span>Married?</span><div class="seg" role="group"><button type="button" data-act="seg" data-for="f-m" data-v="1" aria-pressed="true">Married</button><button type="button" data-act="seg" data-for="f-m" data-v="0" aria-pressed="false">Single</button></div><input type="hidden" id="f-m" value="1"></div>
      <div class="two" style="gap:12px" id="f-sn-wrap"><label class="field">Spouse's full name<input id="f-sn" maxlength="120" autocomplete="off"></label><label class="field">Spouse's email<input id="f-se" type="email" autocomplete="off"></label></div>
      <label class="field">City they're planting in<input id="f-city" maxlength="120" autocomplete="off"></label>
      <label class="check"><input type="checkbox" id="f-sg" ${sg ? "checked" : ""}> <span>Include the sign gifts (healing, miracles, tongues, interpretation)</span></label>
      <label class="check"><input type="checkbox" id="f-send" checked> <span>Email their links now</span></label>
    </div>
    <div class="row"><button class="btn" type="submit">Create assessment</button><button class="btn ghost" type="button" data-act="nav" data-to="leader">Cancel</button></div>
  </form></div>`;
}

// ---------- invites & status ----------
export function statusTab(c) {
  if (!c.loadedFull) return `<p class="muted">Loading…</p>`;
  const admin = L.canAdmin();
  const row = (p) => {
    const done = p.status === "finished";
    const stamps = [p.invited_at && `invited ${fmt(p.invited_at)}`, p.reminded_at && `reminded ${fmt(p.reminded_at)}`, p.updated_at && p.status === "started" && `active ${H.ago(p.updated_at)}`, done && p.finished_at && `finished ${fmt(p.finished_at)}`].filter(Boolean).join(" · ");
    return `<div class="invite person" data-pid="${p.id}"><span class="who pill-${p.role === "reference" ? "ref" : p.role}">${p.role === "planter" ? "P" : p.role === "spouse" ? "S" : "R"}</span>
      <div class="stack" style="gap:6px;min-width:0"><div><b>${esc(p.name || H.roleName[p.role])}</b> <span class="small">${esc(H.roleName[p.role])}${p.relationship ? " · " + esc(p.relationship) : ""}${stamps ? " · " + esc(stamps) : ""}</span></div>
        ${H.progressBar(p, false)}${p.chapter && p.status === "started" ? `<span class="small">Working on: ${esc(p.chapter)}</span>` : ""}
        ${done ? "" : `<div class="row" style="gap:8px"><input class="input email-in" type="email" value="${esc(p.email || "")}" placeholder="Email address" aria-label="Email for ${esc(p.name || H.roleName[p.role])}" style="max-width:280px;padding:8px 10px"><button class="btn sm ghost" data-act="save-email" data-pid="${p.id}">Save</button></div>`}</div>
      <div class="row">${done ? (admin ? `<button class="btn sm ghost" data-act="reopen" data-pid="${p.id}">Reopen</button>` : "")
        : `${p.email ? `<button class="btn sm" data-act="send-email" data-kind="${p.invited_at ? "remind" : "invite"}" data-pid="${p.id}">${p.invited_at ? "Send reminder" : "Email invite"}</button>` : ""}<button class="btn sm ghost" data-act="copy-link" data-token="${p.token}">Copy link</button>`}</div></div>`;
  };
  const core = c.people.filter((p) => p.role !== "reference"), refs = c.people.filter((p) => p.role === "reference");
  return `<div class="stack-lg" style="max-width:56rem">
    <div class="stack"><h2>${esc(c.label)}</h2><p class="read" style="margin:0">Each person has a personal link. Everything saves after every answer, so they can stop and finish later on any device. Ask the couple not to talk about their answers until both have finished.</p></div>
    <div class="panel">${core.map(row).join("")}</div>
    <div class="panel stack" data-copywrap><h3>References</h3><p class="small" style="margin:0">Aim for 3 to 5: a sending or supervising pastor, a ministry peer, someone ${esc(H.first(c.planterName))} has led, and someone outside the church.</p>
      <form id="addref" class="row" style="gap:8px"><input id="ar-name" class="input" required maxlength="120" placeholder="Reference's name" style="max-width:220px"><input id="ar-email" class="input" type="email" placeholder="Email (we'll send the invite)" style="max-width:260px"><button class="btn sm" type="submit">Add reference</button></form>
      <p class="small" style="margin:0">Or share one link the planter can forward. Each person who opens it gets their own saved copy.</p>
      <div class="row" style="gap:8px"><div class="code-box" style="flex:1;min-width:0">${esc(L.refLink(c.refToken))}</div><button class="btn sm ghost" data-act="copy-text" data-text="${esc(L.refLink(c.refToken))}">Copy</button><button class="btn sm ghost" data-act="rotate-ref" title="The old link stops working. People who already started keep their own link.">New link</button></div>
      ${refs.length ? refs.map(row).join("") : ""}</div>
    <div class="panel stack"><h3>Reports for the couple</h3><p class="small" style="margin:0">Each spouse sees their own report at their same link once you release it. They never see each other's answers, the private note or the safety answers. Release after you walk through the results together.</p>
      <div><button class="btn sm ${c.released ? "ghost" : ""}" data-act="release" data-on="${c.released ? "0" : "1"}">${c.released ? "Hide their reports" : "Release their reports"}</button> ${c.released ? `<span class="chip tone-a">Released</span>` : ""}</div></div>
    ${admin ? `<div><button class="btn sm ghost" data-act="delete-case">Delete this assessment</button><div id="del-confirm"></div></div>` : ""}
  </div>`;
}

// ---------- settings & team ----------
export function settings() {
  const n = L.active(); if (!n) return dashboard();
  const admin = L.canAdmin(), st = n.settings || {};
  const beliefs = st.beliefs || [], questions = st.questions || [];
  const dis = admin ? "" : "disabled";
  const me = L.state.session.user.id;
  return `<div class="wrap stack-lg" style="max-width:52rem">
    <button class="link" data-act="nav" data-to="leader">← Assessments</button>
    <div class="stack"><h1 style="font-size:clamp(2rem,4vw,2.6rem)">${admin ? "Settings & team" : "Team"}</h1>${admin ? `<p class="lede" style="margin:0">Changes apply to new assessments. Ones already started keep the settings they began with.</p>` : ""}</div>
    ${admin ? `<form class="panel stack" id="net-form"><h3>Your network</h3>
      <label class="field">Name<input id="n-name" maxlength="120" value="${esc(n.name)}" ${dis}></label>
      <div class="field"><span>Logo</span><div class="row">${H.safeUrl(n.logo_url) ? `<img src="${esc(H.safeUrl(n.logo_url))}" alt="Current logo" class="net-logo">` : `<span class="small">No logo yet</span>`}<input id="n-logo" type="file" accept="image/png,image/jpeg,image/webp" ${dis}></div><span class="hint">Shown to planters, spouses and references. PNG, JPG or WebP, under 1 MB.</span></div>
      <label class="check"><input type="checkbox" id="n-sg" ${st.signGifts !== false ? "checked" : ""} ${dis}> <span>Include the sign gifts by default</span></label>
      <label class="field">Keep assessments for<select id="n-ret" class="input" ${dis}>${[12, 24, 36].map((m) => `<option value="${m}" ${(st.retentionMonths || 24) === m ? "selected" : ""}>${m} months, then delete automatically</option>`).join("")}</select></label>
      <div><button class="btn sm" type="submit">Save</button></div></form>

    <div class="panel stack"><h3>Your beliefs</h3><p class="small" style="margin:0">Plumbline asks every planter to affirm four core beliefs: Scripture's authority, the Trinity and the person of Christ, salvation by grace through faith, and the Great Commission. Add up to 6 of your network's own. A "No" becomes a concern in the report, and "Not sure" becomes a watch item.</p>
      ${beliefs.map((b) => `<div class="spread" style="border-bottom:1px solid var(--rule);padding-bottom:8px"><span>${esc(b.t)}</span><button class="btn sm ghost" data-act="del-belief" data-id="${esc(b.id)}">Remove</button></div>`).join("")}
      ${beliefs.length < 6 ? `<form id="add-belief" class="row" style="gap:8px"><input id="ab-t" class="input" maxlength="240" required placeholder="We baptize believers by immersion." style="flex:1;min-width:220px"><button class="btn sm" type="submit">Add</button></form>` : ""}</div>

    <div class="panel stack"><h3>Your questions</h3><p class="small" style="margin:0">Up to 10 questions of your own, asked near the end. Answers show in the leader report and aren't scored.</p>
      ${questions.map((q) => `<div class="spread" style="border-bottom:1px solid var(--rule);padding-bottom:8px"><span>${esc(q.t)} <span class="small">· ${q.kind === "text" ? "Short answer" : "Agree scale"} · ${q.who === "both" ? "Planter and spouse" : q.who === "spouse" ? "Spouse" : "Planter"}</span></span><button class="btn sm ghost" data-act="del-question" data-id="${esc(q.id)}">Remove</button></div>`).join("")}
      ${questions.length < 10 ? `<form id="add-question" class="stack" style="gap:8px"><input id="aq-t" class="input" maxlength="240" required placeholder="Why do you feel called to this city?">
        <div class="row" style="gap:8px"><select id="aq-kind" class="input" style="width:auto"><option value="text">Short answer</option><option value="likert">Agree scale (1 to 5)</option></select>
        <select id="aq-who" class="input" style="width:auto"><option value="planter">Planter</option><option value="spouse">Spouse</option><option value="both">Planter and spouse</option></select><button class="btn sm" type="submit">Add question</button></div></form>` : ""}</div>` : ""}

    <div class="panel stack"><h3>Team</h3><p class="small" style="margin:0">Everyone on the team sees every assessment in ${esc(n.name)}. Owners and admins also manage settings, the team and deletions.</p>
      ${L.state.team.map((m) => `<div class="spread" style="border-bottom:1px solid var(--rule);padding-bottom:8px"><span><b>${esc(m.name || m.email)}</b> <span class="small">${esc(m.email || "")}${m.user_id === me ? " · you" : ""}</span></span>
        ${admin && m.user_id !== me ? `<span class="row" style="gap:6px"><select class="input role-sel" data-uid="${m.user_id}" style="width:auto;padding:6px 10px" aria-label="Role for ${esc(m.name || m.email)}">${["owner", "admin", "assessor"].filter((r) => r !== "owner" || L.myRole() === "owner").map((r) => `<option value="${r}" ${m.role === r ? "selected" : ""}>${roleLabel[r]}</option>`).join("")}</select><button class="btn sm ghost" data-act="remove-member" data-uid="${m.user_id}">Remove</button></span>` : `<span class="chip">${roleLabel[m.role]}</span>`}</div>`).join("")}
      ${admin ? `<form id="invite-form" class="row" style="gap:8px"><input id="im-email" class="input" type="email" required placeholder="Email" style="max-width:280px"><select id="im-role" class="input" style="width:auto"><option value="assessor">Assessor</option><option value="admin">Admin</option></select><button class="btn sm" type="submit">Invite</button></form>
      ${L.state.invites.length ? `<div class="stack" style="gap:8px"><b class="small">Waiting to join</b>${L.state.invites.map((i) => `<div class="spread" data-copywrap><span>${esc(i.email)} <span class="small">· ${roleLabel[i.role]} · invited ${fmt(i.created_at)}${i.emailed_at ? "" : " · not emailed"}</span></span><span class="row" style="gap:6px"><button class="btn sm ghost" data-act="copy-text" data-text="${esc(L.joinLink(i.token))}">Copy join link</button><button class="btn sm ghost" data-act="revoke-invite" data-id="${i.id}">Cancel</button></span></div>`).join("")}</div>` : ""}` : ""}</div>
  </div>`;
}

// ---------- join a team ----------
export function join() {
  const v = H.view();
  if (!v.info) return `<div class="wrap" style="max-width:38rem"><div class="intro-card"><span class="kicker">Plumbline</span><h2>That invite isn't working</h2><p>It may have expired or already been used. Ask your network's owner to send a new one.</p></div></div>`;
  if (!L.state.session) return login(`You've been invited to join <b>${esc(v.info.network)}</b> as ${v.info.role === "admin" ? "an admin" : "an assessor"}. Sign in with any email to accept.`).replace('id="login"', 'id="login" data-join="' + esc(v.token) + '"');
  return `<div class="wrap" style="max-width:38rem"><form class="stack-lg" id="join-team">
    <div class="stack"><h1 style="font-size:clamp(2rem,4vw,2.6rem)">Join ${esc(v.info.network)}</h1><p class="lede" style="margin:0">You'll join as ${v.info.role === "admin" ? "an admin" : "an assessor"} and see the network's assessments, reports and interview guides.</p></div>
    <label class="field">Your name<input id="j-name" required maxlength="120" autocomplete="name"></label>
    <div><button class="btn" type="submit">Join the team</button></div></form></div>`;
}

// ---------- platform overview ----------
export function admin() {
  const s = H.view().stats;
  if (!s) return `<div class="wrap"><p class="muted">Loading…</p></div>`;
  const k = (v, l) => `<div class="kpi"><div class="v num">${v}</div><div class="l">${l}</div></div>`;
  return `<div class="wrap stack-lg" style="max-width:56rem"><button class="link" data-act="nav" data-to="leader">← Assessments</button>
    <div class="stack"><h1 style="font-size:clamp(2rem,4vw,2.6rem)">Platform</h1><p class="muted" style="margin:0">Counts only. No one's answers appear here.</p></div>
    <div class="kpis">${k(s.networks, "Networks")}${k(s.leaders, "Team members")}${k(s.assessments, "Assessments")}${k(s.finished, "People finished")}</div>
    <div class="kpis">${k(s.assessments30, "Assessments, last 30 days")}${k(s.finished30, "Finished, last 30 days")}${k(s.started, "People started")}${k(s.started ? Math.round((100 * s.finished) / s.started) + "%" : "—", "Finish rate (finished ÷ started)")}</div>
    <div class="scroll-x"><table class="tbl"><thead><tr><th>Network</th><th>Team</th><th>Assessments</th><th>Joined</th></tr></thead><tbody>${(s.byNetwork || []).map((n) => `<tr><td>${esc(n.name)}</td><td class="num">${n.members}</td><td class="num">${n.assessments}</td><td>${esc(n.created)}</td></tr>`).join("")}</tbody></table></div></div>`;
}

// ---------- events ----------
export async function onClick(act, el) {
  const v = H.view();
  try {
    if (act === "dash-filter") { v.filter = el.dataset.f; H.render(); return true; }
    if (act === "send-email") {
      el.disabled = true;
      const r = await L.emailPeople(el.dataset.kind, [el.dataset.pid]);
      H.toast(r?.sent ? (el.dataset.kind === "remind" ? "Reminder sent" : "Invite sent") : r?.skipped ? "Already reminded in the last day" : "Nothing sent");
      await L.openCase(v.id); H.render(); return true;
    }
    if (act === "save-email") {
      const input = el.closest(".person").querySelector(".email-in");
      await L.updatePerson(el.dataset.pid, { email: input.value.trim() || null }); H.toast("Saved"); H.render(); return true;
    }
    if (act === "rotate-ref") { await L.rotateRef(v.id); H.toast("New reference link made. The old one no longer works."); H.render(); return true; }
    if (act === "reopen") { await L.updatePerson(el.dataset.pid, { status: "started" }); H.toast("Reopened. They can change answers at the same link."); H.render(); return true; }
    if (act === "del-belief") { await L.updateNetwork({ settings: { beliefs: (L.active().settings?.beliefs || []).filter((b) => b.id !== el.dataset.id) } }); H.render(); return true; }
    if (act === "del-question") { await L.updateNetwork({ settings: { questions: (L.active().settings?.questions || []).filter((b) => b.id !== el.dataset.id) } }); H.render(); return true; }
    if (act === "remove-member") {
      el.closest(".spread").insertAdjacentHTML("afterend", `<div class="notice red">Remove this person from the team? <button class="btn sm" data-act="remove-member-yes" data-uid="${el.dataset.uid}">Remove</button> <button class="btn sm ghost" data-act="cancel-x">Keep</button></div>`); return true;
    }
    if (act === "remove-member-yes") { await L.setMember(el.dataset.uid, "remove"); H.toast("Removed"); H.render(); return true; }
    if (act === "cancel-x") { el.closest(".notice").remove(); return true; }
    if (act === "revoke-invite") { await L.revokeInvite(el.dataset.id); H.render(); return true; }
  } catch (err) { H.toast(err.message || "That didn't work. Try again."); if (el) el.disabled = false; return true; }
  return false;
}

export async function onChange(el) {
  try {
    if (el.id === "net-switch") { await L.switchNetwork(el.value); H.render(); return true; }
    if (el.classList?.contains("role-sel")) { await L.setMember(el.dataset.uid, el.value); H.toast("Role updated"); H.render(); return true; }
  } catch (err) { H.toast(err.message || "That didn't work."); H.render(); return true; }
  return false;
}

export function onInput(el) {
  if (el.id === "dash-q") { H.view().q = el.value; const pos = el.selectionStart; H.render(); const n = document.getElementById("dash-q"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return true; }
  return false;
}

const newId = () => Math.random().toString(36).slice(2, 9);
export async function onSubmit(form) {
  const $ = (s) => form.querySelector(s);
  const btn = form.querySelector("button[type=submit]");
  const busy = (b) => { if (btn) btn.disabled = b; };
  try {
    if (form.id === "login") {
      const email = $("#l-email").value.trim(), msg = $("#l-msg");
      busy(true);
      const back = form.dataset.join ? `?join=${form.dataset.join}` : H.view().after ? `?case=${H.view().after}` : "";
      await L.sendMagicLink(email, back);
      msg.innerHTML = `<div class="notice">Check ${esc(email)} for a sign-in link. Open it in this browser.</div>`;
      return true;
    }
    if (form.id === "onboard") { busy(true); await L.createNetwork($("#o-net").value.trim(), $("#o-me").value.trim()); H.go({ name: "leader" }); return true; }
    if (form.id === "newcase-live") {
      const m = $("#f-m").value === "1";
      busy(true);
      const id = await L.createCase({ planterName: $("#f-pn").value.trim(), planterEmail: $("#f-pe").value.trim(), married: m, spouseName: $("#f-sn").value.trim() || "Spouse", spouseEmail: $("#f-se").value.trim(),
        city: $("#f-city").value.trim(), signGifts: $("#f-sg").checked, sendNow: $("#f-send").checked, bankVersion: B.BANK_VERSION });
      await L.openCase(id);
      H.go({ name: "case", id, tab: "status" });
      return true;
    }
    if (form.id === "addref") {
      busy(true);
      const r = await L.addReference(H.view().id, $("#ar-name").value.trim(), $("#ar-email").value.trim());
      H.toast(r.emailed ? "Reference added and invited" : "Reference added. Copy their link to send it."); H.render(); return true;
    }
    if (form.id === "net-form") {
      busy(true);
      const f = $("#n-logo").files?.[0];
      if (f) { if (f.size > 1024 * 1024) throw new Error("That logo is over 1 MB. Try a smaller file."); await L.uploadLogo(f); }
      await L.updateNetwork({ name: $("#n-name").value.trim() || L.active().name, settings: { signGifts: $("#n-sg").checked, retentionMonths: +$("#n-ret").value } });
      H.toast("Saved"); H.render(); return true;
    }
    if (form.id === "add-belief") {
      const t = $("#ab-t").value.trim(); if (!t) return true; busy(true);
      await L.updateNetwork({ settings: { beliefs: [...(L.active().settings?.beliefs || []), { id: "nb_" + newId(), t }] } }); H.render(); return true;
    }
    if (form.id === "add-question") {
      const t = $("#aq-t").value.trim(); if (!t) return true; busy(true);
      await L.updateNetwork({ settings: { questions: [...(L.active().settings?.questions || []), { id: "nq_" + newId(), t, kind: $("#aq-kind").value, who: $("#aq-who").value }] } }); H.render(); return true;
    }
    if (form.id === "invite-form") {
      busy(true);
      const r = await L.inviteMember($("#im-email").value.trim(), $("#im-role").value);
      H.toast(r.emailed ? "Invite sent" : "Invite created. Copy the join link to send it."); H.render(); return true;
    }
    if (form.id === "join-team") { busy(true); await L.acceptInvite(H.view().token, $("#j-name").value.trim()); H.toast("Welcome to the team"); H.go({ name: "leader" }); return true; }
  } catch (err) {
    busy(false);
    const box = form.querySelector("#l-msg, #o-msg");
    if (box) box.innerHTML = `<div class="notice red">${esc(err.message || "That didn't work. Try again.")}</div>`; else H.toast(err.message || "That didn't work. Try again.");
    return true;
  }
  return false;
}
