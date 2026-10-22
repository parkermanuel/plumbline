import * as B from "./bank.js";
import { scoreCase, scoreScale, BANDS, OUTCOMES, bandOf } from "./engine.js";
import { SAMPLE_CASES } from "./samples.js";
import { giftFan, radar, mark, heroPlumb } from "./charts.js";
import * as L from "./live.js";
import * as T from "./team.js";

// ---------------- utilities ----------------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const first = (name) => String(name || "").trim().split(/\s+/)[0] || name;
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => { try { return new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };
const bandChip = (b) => (b ? `<span class="chip tone-${b.letter.toLowerCase()}">${b.name}</span>` : `<span class="chip">Not enough answers</span>`);
const n15 = (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : null); // answers come from other people; trust nothing
const safeUrl = (u) => { try { const x = new URL(String(u)); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; } };
const toneOf = (b) => (b ? b.letter.toLowerCase() : "");
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
}
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); }
  catch { const box = btn?.closest("[data-copywrap]")?.querySelector(".code-box"); if (box) { const r = document.createRange(); r.selectNodeContents(box); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } toast("Selected. Press Ctrl+C or ⌘C to copy"); }
}

// ---------------- storage ----------------
const KEY = "plumbline.v1";
let db = { cases: [], drafts: {}, notes: {} };
try { const raw = localStorage.getItem(KEY); if (raw) db = { ...db, ...JSON.parse(raw) }; } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };
const SAMPLES = SAMPLE_CASES();
const allCases = () => [...(L.LIVE ? L.cases() : db.cases), ...SAMPLES];
const ago = (iso) => { if (!iso) return ""; const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 1) return "just now"; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`; const d = Math.round(h / 24); return `${d} day${d > 1 ? "s" : ""} ago`; };
const roleName = { planter: "Planter", spouse: "Spouse", reference: "Reference" };
const getCase = (id) => allCases().find((c) => c.id === id);

// ---------------- codes ----------------
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function pack(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== "undefined") {
    try {
      const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      return "z" + b64u(new Uint8Array(await new Response(cs).arrayBuffer()));
    } catch {}
  }
  return "j" + b64u(bytes);
}
async function unpack(s) {
  s = s.trim().replace(/\s+/g, "");
  const m = s.match(/^PL[IR]-(.+)$/);
  if (!m) throw new Error("That doesn't look like a Plumbline code. Codes start with PLI- or PLR-.");
  const body = m[1];
  const bytes = unb64u(body.slice(1));
  if (body[0] === "z") {
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return JSON.parse(await new Response(ds).text());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
const caseHeader = (c) => ({ c: c.id, l: c.label, pn: c.planterName, sn: c.spouseName, m: c.married, city: c.city, net: c.network?.name, sg: c.network?.signGifts !== false });
const inviteCode = async (c, role) => "PLI-" + (await pack({ v: 1, k: "inv", r: role, ...caseHeader(c) }));
const resultCode = async (c, role, data, refIdx) => "PLR-" + (await pack({ v: 1, k: "res", r: role, i: refIdx, ...caseHeader(c), d: data }));

function ensureCase(h) {
  let c = db.cases.find((x) => x.id === h.c);
  if (!c) {
    c = { id: h.c, label: h.l, planterName: h.pn, spouseName: h.sn, married: !!h.m, city: h.city, network: { name: h.net, signGifts: h.sg !== false }, created: today(), planter: null, spouse: null, refs: [] };
    db.cases.unshift(c);
  }
  return c;
}

// ---------------- flows ----------------
function roundRobin(scaleKeys, scales) {
  const groups = scaleKeys.map((k) => scales[k].items.map((it) => ({ ...it, scale: k })));
  const out = [];
  for (let i = 0; groups.some((g) => g.length); i++) groups.forEach((g) => { if (g.length) out.push(g.shift()); });
  return out;
}
function insertAt(arr, items, every = 9) { items.forEach((it, i) => arr.splice(Math.min(arr.length, (i + 1) * every + i), 0, it)); return arr; }

function buildFlow(role, ctx) {
  const S = [];
  const married = !!ctx.married;
  const sp = first(ctx.spouseName) || "your spouse";
  const pl = first(ctx.planterName) || "your spouse";
  const chapter = (id, name, kicker, text, minutes) => S.push({ t: "intro", chapter: id, name, kicker, text, minutes });
  const likert = (chapterId, list, opts = {}) => list.forEach((it) => S.push({ t: "likert", chapter: chapterId, id: it.id, text: it.t, bucket: opts.bucket || "likert", na: opts.na, sub: opts.sub }));
  S.push({ t: "welcome", chapter: "start" });

  if (role === "planter") {
    const keys = (pill) => Object.keys(B.SCALES).filter((k) => B.SCALES[k].pillar === pill && !(B.SCALES[k].married && !married) && !(B.SCALES[k].single && married));
    chapter("called", "Called", "Chapter 1 of " + (married ? 6 : 5), "Your call, your walk with God, your character and your health. Answer for how life actually is right now, not how you wish it were.", 9);
    const c1 = roundRobin([...keys("calling"), ...keys("character"), ...keys("health"), ...keys("family")], B.SCALES);
    insertAt(c1, [...B.CANDOR, B.BOGUS[0]].map((x) => ({ ...x })), 8);
    likert("called", c1);
    S.push({ t: "beliefs", chapter: "called" });
    chapter("ready", "Ready", "Chapter 2", "How you lead, how you live on mission, and what you bring to building something from nothing.", 9);
    const c2 = roundRobin([...keys("leadership"), ...keys("mission"), ...keys("capacity")], B.SCALES);
    insertAt(c2, [B.BOGUS[1]], 30);
    likert("ready", c2);
    wired(S, "wired", "Chapter 3", ctx);
    chapter("tested", "Tested", "Chapter 4", "Eight real situations planters face. For each one, pick the response you think is best and the one you think is worst.", 5);
    B.SCENARIOS.filter((sc) => married || !sc.married).forEach((sc) => S.push({ t: "scenario", chapter: "tested", id: sc.id }));
    if (married) {
      chapter("together", "Together", "Chapter 5", `${sp} answers these same statements on their own. Answer for yourself, and please don't compare notes until you've both finished. The differences are some of the most useful things you'll learn.`, 5);
      B.COUPLE_AREAS.forEach((a) => likert("together", a.items, { bucket: "couple", sub: a.name }));
      chapter("together", "Together", "Read their mind", `Now guess how ${sp} answered a few of the same statements.`, 2);
      B.COUPLE_AREAS.forEach((a) => a.items.filter((i) => i.guess).forEach((it) => S.push({ t: "likert", chapter: "together", id: it.id, text: it.t, bucket: "guess", sub: `How do you think ${sp} answered?` })));
    }
    netQuestions(S, ctx, "planter");
    chapter("story", "Your story", married ? "Chapter 6" : "Chapter 5", "A few facts about your experience and preparation, plus links to your work if you have them.", 3);
    B.FACTS.forEach((f) => S.push({ t: "fact", chapter: "story", id: f.id }));
    S.push({ t: "work", chapter: "story" });
  }

  if (role === "spouse") {
    chapter("heart", "Your heart", "Chapter 1 of 5", "This is about you: your own sense of calling, your walk with God, your health and your support. Nothing here assumes a role at church.", 5);
    const c1 = roundRobin(["s_call", "s_devotion", "s_health", "s_support", "s_ready"], B.SPOUSE_SCALES);
    insertAt(c1, [...B.CANDOR.slice(0, 4), B.BOGUS[0]], 6);
    likert("heart", c1);
    chapter("marriage", "Your marriage", "Chapter 2", `${pl} answers these same statements separately. Answer for yourself, and please don't compare notes until you've both finished.`, 6);
    B.SPOUSE_SCALES.s_partner.items.forEach((it) => S.push({ t: "likert", chapter: "marriage", id: it.id, text: it.t, bucket: "likert" }));
    B.COUPLE_AREAS.forEach((a) => likert("marriage", a.items, { bucket: "couple", sub: a.name }));
    B.COUPLE_AREAS.forEach((a) => a.items.filter((i) => i.guess).forEach((it) => S.push({ t: "likert", chapter: "marriage", id: it.id, text: it.t, bucket: "guess", sub: `How do you think ${pl} answered?` })));
    S.push({ t: "safetyIntro", chapter: "marriage" });
    B.SAFETY.forEach((it) => S.push({ t: "likert", chapter: "marriage", id: it.id, text: it.t, bucket: "safety", sub: "Private. Only your network leader sees this." }));
    chapter("sees", `How ${pl} leads`, "Chapter 3", `You see ${pl} up close. Rate what you've actually seen. Choose "Not seen" if it doesn't apply.`, 2);
    B.SPOUSE_SEES.forEach((it) => S.push({ t: "likert", chapter: "sees", id: it.id, text: it.t, bucket: "spouseSees", na: true, sub: `${pl}…`, freq: true }));
    wired(S, "wired", "Chapter 4", ctx);
    netQuestions(S, ctx, "spouse");
    S.push({ t: "private", chapter: "private" });
  }

  if (role === "reference") {
    chapter("seen", "What you've seen", "Part 1 of 2", `Rate what you've seen in ${pl}. Choose "Not seen" for anything you haven't had a chance to observe. That helps more than a guess.`, 5);
    B.REF_ITEMS.filter((it) => married || !it.married).forEach((it) => S.push({ t: "likert", chapter: "seen", id: it.id, text: it.t, bucket: "items", na: true, freq: true, sub: `${pl}…` }));
    chapter("read", "Your read", "Part 2 of 2", "A few last questions. Your written answers go only to the network leader.", 3);
    S.push({ t: "follow", chapter: "read" });
    S.push({ t: "refReady", chapter: "read" });
    S.push({ t: "refGifts", chapter: "read" });
    S.push({ t: "refText", chapter: "read" });
  }
  S.push({ t: "done", chapter: "done" });
  return S;
}

function netQuestions(S, ctx, role) {
  const qs = (ctx.questions || []).filter((q) => q.who === role || q.who === "both");
  if (!qs.length) return;
  S.push({ t: "intro", chapter: "network", name: `From ${ctx.network || "your network"}`, kicker: "A few more", text: `${ctx.network || "Your network"} added ${qs.length === 1 ? "a question" : "a few questions"} of its own.`, minutes: Math.max(1, Math.ceil(qs.length / 2)) });
  qs.forEach((q) => S.push(q.kind === "likert" ? { t: "likert", chapter: "network", id: q.id, text: q.t, bucket: "netq" } : { t: "netqText", chapter: "network", id: q.id, text: q.t }));
}
const allBeliefs = (ctx) => [...B.BELIEFS, ...((ctx && ctx.beliefs) || [])];

function wired(S, ch, kicker, ctx = {}) {
  S.push({ t: "intro", chapter: ch, name: "Wired", kicker, text: "How God made you: your natural style, your spiritual gifts, and how you serve the body. There are no right answers here, and this part isn't graded.", minutes: 10 });
  B.WIRING.forEach((d) => d.items.forEach((pair, i) => S.push({ t: "pair", chapter: ch, dim: d.id, i, left: pair[0], right: pair[1] })));
  const gi = [];
  B.GIFTS.filter((g) => ctx.signGifts !== false || !B.SIGN_GIFTS.includes(g.id)).forEach((g) => g.items.forEach((t, i) => gi.push({ g: g.id, i, t })));
  // interleave gifts so the same gift doesn't repeat back to back
  const ordered = [0, 1, 2].flatMap((i) => gi.filter((x) => x.i === i));
  ordered.forEach((x) => S.push({ t: "gift", chapter: ch, g: x.g, i: x.i, text: x.t }));
  B.FIVEFOLD_BLOCKS.forEach((_, i) => S.push({ t: "fivefold", chapter: ch, i }));
}

// ---------------- app state & routing ----------------
let view = { name: "home" };
let take = null; // { caseId, role, refIdx, ctx, steps, i, resp, shownAt }
const app = () => $("#app");
function go(v) { view = v; render(); window.scrollTo(0, 0); }

function render() {
  const nav = L.LIVE ? [["home", "Home"], ["leader", L.state.session ? "Dashboard" : "Network leaders"], ["about", "How it works"]] : [["home", "Home"], ["leader", "Network leaders"], ["join", "I have a code"], ["about", "How it works"]];
  const cur = ["case", "settings", "newcase", "admin"].includes(view.name) ? "leader" : view.name;
  $("#top").innerHTML = `<div class="top-in"><button class="brand" data-act="nav" data-to="home" aria-label="Plumbline home">${mark(28)}<span class="brand-word">plumbline</span></button>
    <nav>${nav.map(([k, l], i) => `<button class="navbtn ${k === "about" ? "opt-hide" : i === 0 ? "home-hide" : ""}" data-act="nav" data-to="${k}" ${cur === k ? 'aria-current="page"' : ""}>${l}</button>`).join("")}${L.LIVE && L.state.session && ["leader", "case", "newcase", "settings", "admin"].includes(view.name) ? `<button class="navbtn opt-hide" data-act="signout">Sign out</button>` : ""}</nav></div>`;
  const foot = $("#foot");
  if (foot) foot.innerHTML = view.name === "take" ? "" : `<div class="foot-in"><span>Plumbline is free for every network.</span><span class="row" style="gap:16px"><button class="link" data-act="nav" data-to="privacy">Privacy</button><button class="link" data-act="nav" data-to="terms">Terms</button><a href="https://parkermanuel.com" target="_blank" rel="noopener">Built by Parker Manuel</a></span></div>`;
  const r = { home: renderHome, leader: renderLeader, newcase: renderNewCase, case: renderCase, join: renderJoin, take: renderTake, about: renderAbout, addresult: renderAddResult, message: renderMessage, refjoin: renderRefJoin, myreport: renderMyReport,
    settings: () => (L.LIVE ? (L.state.session ? T.settings() : T.login()) : renderHome()), teamjoin: T.join, admin: T.admin, privacy: renderPrivacy, terms: renderTerms }[view.name] || renderHome;
  app().innerHTML = r();
  if (view.name === "take") afterTake();
}

// ---------------- home ----------------
function renderHome() {
  return `<div class="wrap">
  <section class="hero">
    <div>
      <h1>Measure true. Plant strong.</h1>
      <p class="lede">Plumbline is a free church planter assessment for networks. The planter, the spouse and their references each answer on their own. You get a graded report, a clear recommendation and an interview guide built from their answers.</p>
      <div class="row">
        <button class="btn" data-act="nav" data-to="leader">Start as a network leader</button>
        <button class="btn ghost" data-act="open-sample">See a sample report</button>
      </div>
      <dl class="entry" aria-label="Definition of plumb line">
        <dt><span class="hw">plumb·line</span> <span class="pr">&#92; ˈpləm-ˌlīn &#92;</span> <span class="pos">noun</span></dt>
        <dd><ol>
          <li>A cord with a weight at one end, hung to show what is truly upright.</li>
          <li>A measure of depth and alignment: how deep the roots go, and whether the walls stand straight before anything is built on them.</li>
        </ol><p class="see">See Amos 7:8.</p></dd>
      </dl>
    </div>
    <div class="plumb-stage">${heroPlumb()}</div>
  </section>
  <section class="paths" aria-label="Choose your path">
    <button class="path" data-act="nav" data-to="leader"><span class="who pill-leader">NL</span><h3>I'm a network leader</h3><p>Set up an assessment for a planting couple, send ${L.LIVE ? "their links" : "codes"}, and read the graded report.</p><span class="go">Open the dashboard</span></button>
    ${L.LIVE ? `<div class="path" style="cursor:default"><span class="who pill-planter">P</span><h3>I'm a planter or spouse</h3><p>Open the personal link your network leader sent you. It takes about 35 minutes. Every answer saves as you go, so you can stop and pick up on any device.</p></div>
    <div class="path" style="cursor:default"><span class="who pill-ref">R</span><h3>I'm a reference</h3><p>Open the link you were sent. It takes about 8 minutes, and your written answers go only to the network leader.</p></div>` : `<button class="path" data-act="nav" data-to="join"><span class="who pill-planter">P</span><h3>I'm a planter or spouse</h3><p>Your network leader gave you a code. Enter it to start. It takes about 35 minutes, and you can stop and come back.</p><span class="go">Enter my code</span></button>
    <button class="path" data-act="nav" data-to="join"><span class="who pill-ref">R</span><h3>I'm a reference</h3><p>Someone asked you to speak into their readiness to plant. It takes about 8 minutes.</p><span class="go">Enter my code</span></button>`}
  </section>
  ${aboutBody(true)}
  </div>`;
}

function aboutBody(short) {
  return `<section class="what">
    <div class="stack"><h2>Four voices. One true read.</h2><p class="read">Most assessments ask the planter about the planter. Plumbline hears from four people separately, then shows you where they agree and where they don't. The gaps are often where the real conversation is.</p></div>
    <div class="layers">
      <div class="layer"><span class="who pill-planter">P</span><div><b>The planter</b><p>About 35 minutes. Calling, character, health, marriage, leadership, mission, planting capacity, wiring, gifts, real-life scenarios and experience.</p></div></div>
      <div class="layer"><span class="who pill-spouse">S</span><div><b>The spouse</b><p>About 25 minutes, taken separately. Their own calling, health, support and gifts, the same marriage questions, and how they see the planter lead.</p></div></div>
      <div class="layer"><span class="who pill-ref">R</span><div><b>Three to five references</b><p>About 8 minutes each. What they've actually seen, and whether they'd join the launch team.</p></div></div>
      <div class="layer"><span class="who pill-leader">NL</span><div><b>You, the network leader</b><p>A graded report with strengths, growth areas and concerns, plus a 90-minute interview guide built from their answers.</p></div></div>
    </div>
  </section>
  ${short ? "" : ""}
  <section class="stack" style="padding-top:48px">
    <h2>What it measures</h2>
    <div class="measures">
      ${B.PILLARS.map((p) => `<div class="measure"><b>${p.name}</b><span>${esc(p.blurb)}</span></div>`).join("")}
      <div class="measure"><b>Couple unity</b><span>Eight areas both spouses answer separately, plus how well they can predict each other.</span></div>
      <div class="measure"><b>Wiring</b><span>Five behavioral dimensions, shown side by side for husband and wife.</span></div>
      <div class="measure"><b>Spiritual gifts</b><span>22 gifts from Romans 12, 1 Corinthians 12, Ephesians 4 and 1 Peter 4.</span></div>
      <div class="measure"><b>Fivefold</b><span>Apostolic, prophetic, evangelistic, shepherding and teaching bent, for building the right team.</span></div>
      <div class="measure"><b>Judgment</b><span>Eight planting scenarios scored against what experienced planters chose.</span></div>
      <div class="measure"><b>Experience</b><span>Training, track record, coach, peer group, sending church, debt and funding.</span></div>
    </div>
  </section>`;
}

function renderAbout() {
  const sources = Object.values(B.SOURCES);
  return `<div class="wrap stack-lg" style="max-width:56rem">
    <div class="stack"><h1>How Plumbline works</h1><p class="lede">Built by a church planter for network leaders, from the best of what the major planting networks have learned over 30 years. Every question is original.</p></div>
    ${aboutBody(false)}
    <section class="stack"><h2>How the scoring works</h2>${scoringExplainer()}</section>
    <section class="stack"><h2>What it is and isn't</h2><div class="read"><p>Plumbline is a readiness conversation tool. It is not a psychological test, a medical or mental-health diagnosis, or marriage counseling. Results are estimates based on what people reported, and they can be wrong. No one should be approved, declined or funded on this report alone. Use it alongside interviews, background checks, a ministry track record and prayerful discernment.</p></div></section>
    <section class="stack"><h2>Research behind it</h2><ul class="list-clean">${sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.t)}</a></li>`).join("")}</ul></section>
  </div>`;
}

function renderPrivacy() {
  return `<div class="wrap stack-lg legal" style="max-width:46rem"><div class="stack"><h1 style="font-size:clamp(2rem,4vw,2.6rem)">Privacy</h1><p class="muted" style="margin:0">Last updated October 2026</p></div>
  <div class="read stack">
    <p>Plumbline is a free church planter assessment run by Parker Manuel. This page explains, in plain words, what we collect, who sees it, and how long we keep it.</p>
    <h3>What we collect</h3>
    <p>When a network leader sets up an assessment, we store the names, emails and city they enter. When you answer, we store your answers. Some answers are sensitive: your marriage, your health and stress, your beliefs, and a few private safety questions for spouses. Network leaders sign in with their email, and we store their name, email and network. We use no advertising or tracking cookies.</p>
    <h3>Who sees your answers</h3>
    <p><b>Your network's team</b> (the network leaders and assessors who invited you) sees your answers and the reports built from them. <b>Your spouse</b> never sees your individual answers, your private note or your safety answers. After your network leader releases them, each spouse sees their own report, which includes only summaries of the other spouse's answers. <b>References</b> see only their own form. <b>Other networks</b> never see anything of yours. <b>Parker Manuel</b>, who runs Plumbline, can see platform-wide counts (how many networks and assessments there are), never your answers, except to fix a problem you or your network asks him to fix.</p>
    <h3>How we keep it safe</h3>
    <p>Everything is sent over encrypted connections and stored with Supabase, a database provider in the United States. The database enforces who can see what, row by row. Your personal link works like a key, so please don't share it.</p>
    <h3>How long we keep it</h3>
    <p>Each network chooses 12, 24 or 36 months, and assessments are deleted automatically after that. Network owners and admins can delete an assessment at any time, and deleting it removes every answer in it.</p>
    <h3>What we never do</h3>
    <p>We never sell your information, use it for advertising, or share it outside your network. We may use counts with every name removed (for example, how many people finish) to improve Plumbline.</p>
    <h3>Your choices</h3>
    <p>You can stop at any time, and you can skip anything you aren't comfortable answering by telling your network leader. To see, correct or delete your answers, ask your network leader, or write to <span class="sel">hello@plumblineassessment.com</span>.</p>
    <h3>Not a clinical test</h3>
    <p>Plumbline is a readiness conversation tool. It isn't a psychological test, a medical or mental-health diagnosis, or marriage counseling. If anything you answered raises concerns about your health or safety, please talk with a licensed professional. In the US you can call or text 988 any time, or call the National Domestic Violence Hotline at 1-800-799-7233.</p>
  </div></div>`;
}
function renderTerms() {
  return `<div class="wrap stack-lg legal" style="max-width:46rem"><div class="stack"><h1 style="font-size:clamp(2rem,4vw,2.6rem)">Terms</h1><p class="muted" style="margin:0">Last updated October 2026</p></div>
  <div class="read stack">
    <p>Plumbline is free. By using it you agree to these terms.</p>
    <h3>For network leaders and teams</h3>
    <p>Use Plumbline only to assess people who have agreed to take it, for church planting or ministry decisions. Treat their answers as confidential. Don't sell, publish or share them outside your team. A Plumbline report is one input, never the decision. Don't approve, decline or fund anyone on the report alone. Use it alongside interviews, references, background checks and prayerful discernment. You're responsible for who you invite to your team and for removing people who leave.</p>
    <h3>For planters, spouses and references</h3>
    <p>Answer honestly and on your own. Your answers go to the network that invited you, as the Privacy page describes.</p>
    <h3>The questions and reports</h3>
    <p>Every question, report and scoring rule in Plumbline was written by Parker Manuel. You may use the reports for your own assessments, but you may not copy the question set to build or sell another tool.</p>
    <h3>No guarantees</h3>
    <p>Plumbline is provided as it is, without warranties. Scores are estimates from what people reported, and they can be wrong. To the extent the law allows, Plumbline and Parker Manuel aren't liable for decisions made using it.</p>
    <h3>Changes</h3>
    <p>We may update these terms and will change the date above when we do. Questions: <span class="sel">hello@plumblineassessment.com</span>.</p>
  </div></div>`;
}

function scoringExplainer() {
  return `<div class="read stack" style="gap:10px">
    <p>Each statement is answered from 1 (strongly disagree) to 5 (strongly agree). About one in four statements is worded in reverse, so agreeing with it counts against the score. Each scale is the average of its 4 or 5 statements, converted to 0–100.</p>
    <p>Scores are shown as bands, not exact numbers, because no short scale is precise to the point: <b>Strength</b> 80 and up, <b>Solid</b> 65–79, <b>Developing</b> 50–64, <b>Growth Area</b> below 50. A pillar's letter (A–D) is the average of its scales, using the same bands.</p>
    <p>Integrity, walk with God, current load and the marriage partnership are non-negotiables. A growth area there is a concern, not just a growth area. Concerns also come from the spouse's own calling, couple answers, beliefs, safety, references and experience.</p>
    <p>The recommendation follows four rules, in order. <b>Pause & Talk</b> if there's a critical concern or three or more concerns. <b>Development Needed</b> if there's any concern or two pillars are growth areas. <b>Ready with Conditions</b> if there are more than two watch items or any pillar is below Solid. Otherwise <b>Ready</b>.</p>
    <p>These cut points were set by design for this first version. The plan is for a panel of experienced planters and assessors to review them after the first 50 to 100 assessments using the modified Angoff method, a standard way to set cut scores without a large sample.</p>
  </div>`;
}

// ---------------- leader dashboard ----------------
function caseStatus(c) {
  const st = [["Planter", !!c.planter]];
  if (c.married) st.push(["Spouse", !!c.spouse]);
  st.push([`${(c.refs || []).length} reference${(c.refs || []).length === 1 ? "" : "s"}`, (c.refs || []).length >= 3]);
  return st;
}
function progressBar(p, showName = true) {
  const pc = p.status === "finished" ? 100 : p.progress || 0;
  return `<div class="pbar" title="${esc(p.name || roleName[p.role])}: ${pc}%"><span class="pbar-label"><b>${showName ? esc(first(p.name) || roleName[p.role]) : ""}</b> <span class="num">${p.status === "finished" ? "Finished" : p.status === "invited" ? "Not started" : pc + "%"}</span></span><span class="pbar-track"><i style="width:${pc}%" class="${p.status === "finished" ? "done" : ""}"></i></span></div>`;
}
function renderLeader() {
  if (L.LIVE) return T.dashboard();
  const cases = allCases();
  return `<div class="wrap stack-lg">
    <div class="spread"><div class="stack" style="gap:6px"><h1 style="font-size:clamp(2rem,4vw,2.8rem)">Your assessments</h1><p class="muted" style="margin:0">Three sample couples are included so you can see what a finished report looks like.</p></div>
      <div class="row"><button class="btn ghost" data-act="nav" data-to="addresult">Add results</button><button class="btn" data-act="nav" data-to="newcase">New assessment</button></div></div>
    <div class="cases">${cases.map((c) => {
      const r = c.planter ? scoreCase(c) : null;
      return `<button class="case-row" data-act="open-case" data-id="${c.id}"><div><div class="case-name">${esc(c.label)}</div><div class="small">${esc([c.planter?.meta?.city || c.city, c.network?.name || c.planter?.meta?.network].filter(Boolean).join(", "))}${c.sample ? " · Sample" : ""}</div></div>
        <div class="status-dots">${caseStatus(c).map(([l, d]) => `<span class="sdot ${d ? "done" : ""}">${l}${d ? " ✓" : ""}</span>`).join("")}</div>
        <div>${r ? `<span class="outcome tone-${r.outcome.tone}">${r.outcome.name}</span>` : `<span class="sdot">In progress</span>`}</div></button>`;
    }).join("")}</div>
    <div class="notice chalk">This is the free pilot. Everything stays in this browser. Each person finishes on their own device and sends you a results code, and you paste it in with <b>Add results</b>. A shared online version with email invites is next.</div>
  </div>`;
}

function renderMessage() {
  return `<div class="wrap" style="max-width:40rem"><div class="intro-card"><span class="kicker">${esc(view.kicker || "Plumbline")}</span><h2>${esc(view.title)}</h2><p>${esc(view.text)}</p>${view.cta ? `<button class="btn" data-act="nav" data-to="${view.cta[0]}">${esc(view.cta[1])}</button>` : ""}</div></div>`;
}
function renderRefJoin() {
  const c = view.refCase;
  const pn = first(c.planterName);
  return `<div class="wrap" style="max-width:40rem"><form class="stack-lg" id="refjoin">
    <div class="stack"><span class="small">${esc(c.network || "Plumbline")}</span><h1 style="font-size:clamp(2rem,4.5vw,3rem)">Speak into ${esc(pn)}'s readiness to plant.</h1>
    <p class="lede" style="margin:0">${esc(c.planterName)}${c.married && c.spouseName ? ` and ${esc(c.spouseName)} are` : " is"} being assessed for church planting, and you were named as a reference. It takes about 8 minutes, and it saves as you go.</p></div>
    <label class="field">Your full name<input id="rj-name" required autocomplete="name"></label>
    <div><button class="btn" type="submit">Start</button></div>
  </form></div>`;
}
function renderMyReport() {
  const d = view.report, me = d.me, other = d.other;
  const cs = d.case;
  const c = { id: cs.id, label: cs.planterName, planterName: cs.planterName, spouseName: cs.spouseName, married: cs.married, city: cs.city, network: { name: cs.network, signGifts: cs.signGifts },
    planter: d.role === "planter" ? me : other, spouse: d.role === "spouse" ? me : other, refs: [] };
  if (!c.planter) c.planter = { meta: { name: cs.planterName } };
  return `<div class="wrap">${personReport(c, scoreCase(c), d.role)}</div>`;
}

function renderNewCase() {
  if (L.LIVE) return L.state.session ? T.newCase() : T.login();
  return `<div class="wrap" style="max-width:40rem"><form class="stack-lg" id="newcase">
    <div class="stack"><h1 style="font-size:clamp(2rem,4vw,2.6rem)">New assessment</h1><p class="lede" style="margin:0">Set up a case for one planter (and spouse). You'll get a personal link to send to each person.</p></div>
    <div class="panel stack">
      <label class="field">Planter's full name<input id="f-pn" required autocomplete="off" placeholder="Marcus Rivera"></label>
      <div class="field"><span>Married?</span><div class="seg" role="group"><button type="button" data-act="seg" data-for="f-m" data-v="1" aria-pressed="true">Married</button><button type="button" data-act="seg" data-for="f-m" data-v="0" aria-pressed="false">Single</button></div><input type="hidden" id="f-m" value="1"></div>
      <label class="field" id="f-sn-wrap">Spouse's full name<input id="f-sn" autocomplete="off" placeholder="Elena Rivera"></label>
      <label class="field">City they're planting in<input id="f-city" autocomplete="off" placeholder="Denver, CO"></label>
      <label class="field">Your network<input id="f-net" autocomplete="off" placeholder="Front Range Planting Network"></label>
      <label class="check"><input type="checkbox" id="f-sg" checked> <span>Include the sign gifts (healing, miracles, tongues, interpretation) in the spiritual gifts section</span></label>
    </div>
    <div class="row"><button class="btn" type="submit">${L.LIVE ? "Create and get links" : "Create and get codes"}</button><button class="btn ghost" type="button" data-act="nav" data-to="leader">Cancel</button></div>
  </form></div>`;
}

function renderAddResult() {
  return `<div class="wrap" style="max-width:44rem"><div class="stack-lg">
    <div class="stack"><h1 style="font-size:clamp(2rem,4vw,2.6rem)">Add results</h1><p class="lede" style="margin:0">Paste the results code a planter, spouse or reference sent you. It starts with PLR-.</p></div>
    <label class="field">Results code<textarea id="res-code" class="input" spellcheck="false" placeholder="PLR-..."></textarea></label>
    <div id="res-msg"></div>
    <div class="row"><button class="btn" data-act="add-result">Add to my assessments</button><button class="btn ghost" data-act="nav" data-to="leader">Cancel</button></div>
  </div></div>`;
}

function renderJoin() {
  return `<div class="wrap" style="max-width:44rem"><div class="stack-lg">
    <div class="stack"><h1 style="font-size:clamp(2rem,4vw,2.6rem)">Enter your code</h1><p class="lede" style="margin:0">Your network leader sent you a code that starts with PLI-. Paste it here to begin.</p></div>
    <label class="field">Your code<textarea id="join-code" class="input" spellcheck="false" placeholder="PLI-..."></textarea></label>
    <div id="join-msg"></div>
    <div class="row"><button class="btn" data-act="join">Start</button></div>
    <p class="small">Don't have a code? Ask your network leader, or <button class="link" data-act="nav" data-to="leader">set one up yourself</button> to try it.</p>
  </div></div>`;
}

// ---------------- case page ----------------
let loadingCase = null;
function renderCase() {
  if (L.LIVE && !L.state.session && !SAMPLES.find((x) => x.id === view.id)) return T.login();
  const c = getCase(view.id);
  if (L.LIVE && (!c || (c.live && !c.loadedFull)) && !SAMPLES.find((x) => x.id === view.id)) {
    if (loadingCase !== view.id) { loadingCase = view.id; L.openCase(view.id).then((x) => { loadingCase = null; if (!x) view.missing = true; render(); }).catch(() => { loadingCase = null; view.missing = true; render(); }); }
    if (!view.missing) return `<div class="wrap"><p class="muted">Loading…</p></div>`;
  }
  if (!c) return `<div class="wrap"><p>That assessment isn't here anymore.</p><button class="btn" data-act="nav" data-to="leader">Back</button></div>`;
  const tab = view.tab || (c.planter ? "leader" : "status");
  let tabs = [["leader", "Leader report"], ["planter", `${first(c.planterName)}'s report`]];
  if (c.married) tabs.push(["spouse", `${first(c.spouseName)}'s report`]);
  tabs.push(["status", "Invites & status"]);
  if (view.personal) tabs = tabs.filter(([k]) => k === view.personal);
  let body = "";
  if (tab === "status") body = statusTab(c);
  else if (!c.planter) body = `<div class="notice">Reports appear once ${esc(first(c.planterName))} finishes. Send the codes from <button class="link" data-act="tab" data-tab="status">Invites & status</button>.</div>`;
  else {
    const r = scoreCase(c);
    body = tab === "leader" ? leaderReport(c, r) : tab === "planter" ? personReport(c, r, "planter") : personReport(c, r, "spouse");
  }
  return `<div class="wrap"><button class="link" data-act="nav" data-to="leader">← All assessments</button>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" data-act="tab" data-tab="${k}">${esc(l)}</button>`).join("")}</div>
    ${body}</div>`;
}

function statusTab(c) {
  if (c.live) return T.statusTab(c);
  const rows = [["planter", c.planterName, "Planter", "pill-planter", "P", !!c.planter]];
  if (c.married) rows.push(["spouse", c.spouseName, "Spouse", "pill-spouse", "S", !!c.spouse]);
  rows.push(["reference", "References", `${(c.refs || []).length} of 3–5 finished. One code works for every reference.`, "pill-ref", "R", (c.refs || []).length >= 3]);
  return `<div class="stack-lg" style="max-width:48rem">
    <div class="stack"><h2>${esc(c.label)}</h2><p class="read" style="margin:0">Send each person their own code. Ask the couple not to talk about their answers until both have finished.</p></div>
    <div class="panel">${rows.map(([role, name, sub, pill, ini, done]) => `<div class="invite"><span class="who ${pill}">${ini}</span>
      <div><b>${esc(name)}</b><div class="small">${esc(sub)}${done ? " · Finished" : ""}</div></div>
      <div class="row">${c.sample ? "" : `<button class="btn sm ghost" data-act="copy-invite" data-role="${role}">Copy code</button>`}<button class="btn sm" data-act="take-here" data-role="${role}">Take it here</button></div></div>`).join("")}</div>
    <div class="notice"><b>Taking it here</b> is for trying Plumbline yourself or for a person sitting at this computer. Everyone else should use their own code on their own device.</div>
    ${(c.refs || []).length ? `<div class="stack"><h3>References received</h3><ul class="list-clean">${c.refs.map((x) => `<li><b>${esc(x.meta?.name)}</b><span>${esc(x.meta?.relationship)}</span></li>`).join("")}</ul></div>` : ""}
    ${c.sample ? "" : `<div><button class="btn sm ghost" data-act="delete-case">Delete this assessment</button><div id="del-confirm"></div></div>`}
  </div>`;
}

// ---------------- leader report ----------------
const liveNotes = {};
function notesFor(c) {
  if (c.live) return (liveNotes[c.id] ||= JSON.parse(JSON.stringify(L.myScores(c.id) || { rubric: {}, text: {}, work: {} })));
  return (db.notes[c.id] ||= { rubric: {}, text: {}, work: {} });
}
function saveNotesFor(c, notes) { if (c.live) L.saveMyScores(c.id, notes); else save(); }
const qid = (prefix, text) => { let h = 0; for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) | 0; return prefix + (h >>> 0).toString(36); };
function teamLine(c, id, mine) {
  if (!c.live) return "";
  const others = L.teamScores(c.id).map((s) => ({ name: s.name, n: s.notes?.rubric?.[id] })).filter((x) => x.n);
  if (!others.length) return "";
  if (!mine) return `<span class="small">${others.length} teammate${others.length > 1 ? "s have" : " has"} scored this. Score it yourself to see theirs.</span>`;
  return `<span class="small">Team: ${others.map((o) => `${esc(first(o.name))} ${n15(o.n) ?? "?"}`).join(", ")}</span>`;
}
function leaderReport(c, r) {
  const P = c.planter, pn = first(c.planterName), sn = first(c.spouseName);
  const flags = [...r.flags].sort((a, b) => (a.level === b.level ? 0 : a.level === "concern" ? -1 : 1));
  const notes = notesFor(c);
  const refFollow = r.refs.follow ? r.refs.follow.avg.toFixed(1) : "—";
  return `<article class="report">
    <header class="stack">
      <div class="rhead"><div class="stack" style="gap:8px"><span class="small">Leader report · ${esc(c.network?.name || P.meta?.network || "")}${c.created ? " · " + fmtDate(c.created) : ""}</span><h1>${esc(c.label)}</h1><span class="muted">${esc(P.meta?.city || c.city || "")}</span></div>
      <div class="legend"><span><i style="width:10px;height:10px;border-radius:50%;background:var(--brass)"></i>${esc(pn)}</span>${c.married ? `<span><i style="width:10px;height:10px;border-radius:50%;background:var(--chalk)"></i>${esc(sn)}</span>` : ""}</div></div>
      <div class="verdict tone-${r.outcome.tone}"><span class="line"></span><div><div class="big">${r.outcome.name}</div><div class="why">${esc(r.outcome.line)} ${esc(r.outcome.why)}</div></div></div>
      ${missing(c).length ? `<div class="notice">Still waiting on ${esc(missing(c).join(" and "))}. The recommendation may change when they finish.</div>` : ""}
      ${L.LIVE ? `<div class="no-print"><button class="btn sm ghost" data-act="print">Print or save as PDF</button></div>` : ""}
      <div class="disclaim">This report is one input, not a decision. No one should be approved, declined or funded on this report alone. Use it with interviews, references, background checks, a ministry track record and prayerful discernment.</div>
    </header>

    <section class="stack"><div class="section-head"><h2>At a glance</h2></div>
      <div class="grades">${r.pillars.map((p) => `<a class="grade" href="#p-${p.id}" data-act="jump" data-to="p-${p.id}"><span class="letter" style="color:${p.band ? p.band.color : "var(--ink-3)"}">${p.band ? p.band.letter : "–"}</span><span class="nm">${p.name}</span><span class="pc num">${p.band ? p.band.name : ""}</span></a>`).join("")}</div>
      <div class="kpis" style="margin-top:16px">
        ${c.married ? `<div class="kpi"><div class="v num">${r.couple?.unity ?? "—"}</div><div class="l">Couple unity (of 100)</div></div>` : ""}
        <div class="kpi"><div class="v num">${refFollow}</div><div class="l">Follow Test (of 5), ${r.refs.n} reference${r.refs.n === 1 ? "" : "s"}</div></div>
        <div class="kpi"><div class="v num">${r.facts?.pct ?? "—"}</div><div class="l">Experience (of 100)</div></div>
        <div class="kpi"><div class="v num">${r.scenarios?.pct ?? "—"}</div><div class="l">Scenario judgment (of 100)</div></div>
        ${c.married ? "" : `<div class="kpi"><div class="v">${r.validity.quality}</div><div class="l">Response quality</div></div>`}
      </div>
    </section>

    <section class="stack"><div class="section-head"><h2>Concerns and watch items</h2><p class="muted">${r.outcome.concerns} concern${r.outcome.concerns === 1 ? "" : "s"}, ${r.outcome.watches} to watch. Red is a concern to resolve before planting. Amber is worth watching or coaching.</p></div>
      ${flags.length ? `<div class="flags">${flags.map((f) => `<div class="flag ${f.level}"><span class="stripe"></span><div><div><span class="a">${esc(f.area)}</span><span class="t">${esc(f.title)}</span></div><div class="d">${esc(f.detail)}</div></div></div>`).join("")}</div>` : `<div class="notice">Nothing flagged. Confirm the strengths in the interview.</div>`}
    </section>

    <section class="stack"><div class="section-head"><h2>Strengths and growth areas</h2>
      <div class="legend"><span><i style="width:18px;height:8px;border-radius:4px;background:var(--ink)"></i>${esc(pn)}'s own rating</span><span><i style="width:3px;height:14px;background:var(--chalk)"></i>Others' average (spouse and references)</span><span><i style="width:18px;height:8px;background:linear-gradient(90deg,var(--band-d-bg) 0 50%,var(--band-c-bg) 50% 65%,var(--band-b-bg) 65% 80%,var(--band-a-bg) 80%)"></i>Bands</span></div></div>
      ${r.pillars.map((p) => pillarBlock(p, r)).join("")}
    </section>

    ${(r.gaps.blind.length || r.gaps.hidden.length) ? `<section class="stack"><div class="section-head"><h2>Blind spots and hidden strengths</h2><p class="muted">Where ${esc(pn)} sees things differently from the people around them. A gap of a full band or more.</p></div>
      <div class="two"><div class="stack"><h3>Blind spots</h3><p class="small" style="margin:0">Rates self higher than others do.</p>${r.gaps.blind.length ? `<ul class="list-clean">${r.gaps.blind.map((g) => `<li><b>${esc(g.name)}</b><span class="num">Self ${g.self}, others ${g.others} (${g.n} ratings)</span></li>`).join("")}</ul>` : `<p class="muted">None.</p>`}</div>
      <div class="stack"><h3>Hidden strengths</h3><p class="small" style="margin:0">Others rate higher than self.</p>${r.gaps.hidden.length ? `<ul class="list-clean">${r.gaps.hidden.map((g) => `<li><b>${esc(g.name)}</b><span class="num">Self ${g.self}, others ${g.others} (${g.n} ratings)</span></li>`).join("")}</ul>` : `<p class="muted">None.</p>`}</div></div></section>` : ""}

    ${c.married && r.couple ? coupleSection(c, r) : ""}
    ${wiredSection(c, r, true)}
    ${refsSection(c, r)}
    ${experienceSection(c, r, notes)}
    ${networkSection(c, r)}
    ${responseQuality(c, r)}
    ${interviewSection(c, r, notes)}
    <section class="stack"><div class="section-head"><h2>How this was scored</h2><p class="muted">Question set ${esc(c.settings?.bankVersion || P.meta?.bankVersion || B.BANK_VERSION)}</p></div>${scoringExplainer()}
      <ul class="list-clean small">${Object.values(B.SOURCES).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.t)}</a></li>`).join("")}</ul></section>
  </article>`;
}

function missing(c) {
  const m = [];
  if (c.married && !c.spouse) m.push(first(c.spouseName));
  const n = (c.refs || []).length;
  if (n < 3) m.push(`${3 - n} more reference${3 - n === 1 ? "" : "s"}`);
  return m;
}
function pillarBlock(p, r) {
  const scales = p.scales.map((k) => ({ k, sc: B.SCALES[k], v: r.scales[k], o: r.refs.scales[k] }));
  const zones = `<span class="zones"><i style="width:50%;background:var(--band-d-bg)"></i><i style="width:15%;background:var(--band-c-bg)"></i><i style="width:15%;background:var(--band-b-bg)"></i><i style="width:20%;background:var(--band-a-bg)"></i></span>`;
  const notes = scales.filter((s) => s.v && (s.v.band.id === "strength" || s.v.band.id === "growth" || s.v.band.id === "developing"));
  return `<div class="pillar" id="p-${p.id}">
    <div class="pillar-head"><h3>${p.name}</h3>${bandChip(p.band)}</div>
    <p class="small" style="margin:0;max-width:44rem">${esc(p.why)}</p>
    ${scales.map((s) => `<div class="scale-row"><div><div class="nm">${esc(s.sc.name)}</div><div class="ds">${esc(s.sc.desc)}</div></div>
      <div class="track" aria-label="${esc(s.sc.name)}: self ${s.v?.pct ?? "n/a"}${s.o ? ", others " + s.o.pct : ""}">${zones}${s.v ? `<span class="bar" style="width:${Math.max(2, s.v.pct)}%"></span>` : ""}${s.o ? `<span class="ref" style="left:${s.o.pct}%" title="Others: ${s.o.pct} (${s.o.n})"></span>` : ""}</div>
      <div>${bandChip(s.v?.band)}</div></div>`).join("")}
    ${notes.length ? `<ul class="list-clean" style="margin-top:6px">${notes.map((s) => `<li><b>${esc(s.sc.name)}</b><span>${esc(s.v.band.id === "strength" ? s.sc.strength : s.sc.growth)}</span></li>`).join("")}</ul>` : ""}
  </div>`;
}

function coupleSection(c, r) {
  const pn = first(c.planterName), sn = first(c.spouseName);
  const C = r.couple;
  const statusChip = { united: ["United", "a"], mostly: ["Mostly aligned", "b"], gap: ["Gap to talk through", "c"], shared: ["Shared concern", "d"], missing: ["Not answered", "x"] };
  const areaAvg = (a, who) => { const v = a.items.filter((i) => i[who] != null); return v.length ? v.reduce((x, i) => x + i[who], 0) / v.length : 3; };
  const pos = (v) => ((v - 1) / 4) * 100;
  const sp = r.spouse || {};
  return `<section class="stack"><div class="section-head"><h2>Marriage and couple unity</h2><p class="muted">${esc(pn)} and ${esc(sn)} answered the same 24 statements separately. Dots show each person's average in that area, from concern (left) to strong (right).</p></div>
    <div class="area-grid">${C.areas.map((a) => { const [l, t] = statusChip[a.status]; const pa = areaAvg(a, "a"), sa = areaAvg(a, "b"); return `<div class="area"><div class="spread"><b>${a.name}</b><span class="num small">${a.unity}</span></div>
      <div class="dumbbell" aria-label="${esc(pn)} ${pa.toFixed(1)}, ${esc(sn)} ${sa.toFixed(1)}"><span class="ln" style="left:${Math.min(pos(pa), pos(sa))}%;width:${Math.abs(pos(pa) - pos(sa))}%"></span><span class="p" style="left:${pos(pa)}%"></span><span class="s" style="left:${pos(sa)}%"></span></div>
      <span class="chip tone-${t}" style="justify-self:start">${l}</span></div>`; }).join("")}</div>
    <div class="kpis"><div class="kpi"><div class="v num">${C.unity ?? "—"}</div><div class="l">Unity score</div></div><div class="kpi"><div class="v num">${C.agreement}%</div><div class="l">Statements both answered positively</div></div>
      <div class="kpi"><div class="v num">${C.know.planter ?? "—"}%</div><div class="l">${esc(pn)} predicted ${esc(sn)}</div></div><div class="kpi"><div class="v num">${C.know.spouse ?? "—"}%</div><div class="l">${esc(sn)} predicted ${esc(pn)}</div></div></div>
    ${[...C.shared, ...C.gaps].length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>Statement</th><th>${esc(pn)}</th><th>${esc(sn)}</th><th></th></tr></thead><tbody>${[...C.shared, ...C.gaps].map((i) => `<tr><td>${esc(i.t)}</td><td class="num">${B.LIKERT[i.planter - 1]}</td><td class="num">${B.LIKERT[i.spouse - 1]}</td><td><span class="chip tone-${i.status === "shared" ? "d" : "c"}">${i.status === "shared" ? "Shared concern" : "Gap"}</span></td></tr>`).join("")}</tbody></table></div>` : ""}
    <div class="two"><div class="stack"><h3>${esc(sn)}'s own readiness</h3>
      ${Object.entries(B.SPOUSE_SCALES).map(([k, s]) => `<div class="spread" style="border-bottom:1px solid var(--rule);padding-bottom:8px"><span>${esc(s.label)}</span>${bandChip(sp[k]?.band)}</div>`).join("")}</div>
      <div class="stack"><h3>In ${esc(sn)}'s words</h3>${r.privateNote ? `<blockquote class="quote">${esc(r.privateNote)}<cite>Private note to the network leader. ${esc(pn)} does not see this.</cite></blockquote>` : `<p class="muted">No private note.</p>`}
      ${r.safety ? `<div class="confidential"><h4>Confidential: safety follow-up</h4><p class="small" style="margin:6px 0 0;color:var(--ink-2)">One or more safety statements were answered in a concerning way. Do not raise this with the couple together. Talk with ${esc(sn)} privately, or involve a trained counselor, and follow your network's safety protocol.</p></div>` : ""}</div></div>
  </section>`;
}

function wiringRows(pw, sw, pn, sn) {
  return pw.map((d, i) => { const s = sw?.[i]; const close = d.pos != null && s?.pos != null && Math.abs(d.pos - s.pos) < 5; const dp = close ? d.pos - 2.5 : d.pos, sp = close ? s.pos + 2.5 : s?.pos; return `<div class="wiring-row"><span class="l">${d.left}</span><div class="wtrack">${d.pos != null ? `<span class="wmark p" style="left:${dp}%" title="${esc(pn)}: ${esc(d.label)}">${esc(pn[0] || "P")}</span>` : ""}${s?.pos != null ? `<span class="wmark s" style="left:${sp}%" title="${esc(sn)}: ${esc(s.label)}">${esc(sn[0] || "S")}</span>` : ""}</div><span class="r">${d.right}</span></div>`; }).join("");
}
function wiringInsights(pw, sw, pn, sn) {
  if (!sw) return [];
  const opp = pw.map((d, i) => ({ d, s: sw[i] })).filter(({ d, s }) => d.pos != null && s?.pos != null && Math.abs(d.pos - s.pos) >= 40);
  if (!opp.length) return [`${pn} and ${sn} are wired much alike. That makes daily life smooth. Watch for shared blind spots, and add teammates who see differently.`];
  const parts = opp.map(({ d, s }) => `${pn} is more ${(d.pos > s.pos ? d.right : d.left).toLowerCase()} and ${sn} more ${(d.pos > s.pos ? d.left : d.right).toLowerCase()}`);
  return [`They differ on ${opp.length} of 5: ${parts.join("; ")}. Differences like these protect a plant when each values the other's way. Talk about them before the pressure of launch does.`];
}
const FIVEFOLD_TEAM = {
  A: "Pioneers start well but can leave people behind. Recruit shepherds and teachers early.",
  P: "Guardians keep a church faithful but can feel hard to follow. Pair with an evangelist and a shepherd.",
  E: "Recruiters bring people in fast. Build a teaching and shepherding pathway so they stay and grow.",
  S: "Caretakers build deep community but can struggle to push outward. Add a pioneer or evangelist voice.",
  T: "Explainers build depth but can drift inward. Partner with a pioneer or evangelist.",
};
function wiredSection(c, r, leader) {
  const pn = first(c.planterName), sn = first(c.spouseName);
  const ins = wiringInsights(r.wiring, r.spouseWiring, pn, sn);
  const ffAxes = B.FIVEFOLD.map((f) => ({ label: f.name }));
  const ffVal = (ff) => B.FIVEFOLD.map((f) => (ff?.list.find((x) => x.id === f.id)?.pct ?? 0) / 100);
  const series = [{ values: ffVal(r.fivefold), color: "var(--brass)", label: pn }];
  if (r.spouseFivefold) series.push({ values: ffVal(r.spouseFivefold), color: "var(--chalk)", label: sn });
  return `<section class="stack"><div class="section-head"><h2>How they're wired</h2><p class="muted">Described, not graded. Every combination can plant a healthy church.</p></div>
    <div class="panel flat"><h3 style="margin-bottom:8px">Wiring</h3>${wiringRows(r.wiring, r.spouseWiring, pn, sn)}
      ${ins.length ? `<ul class="list-clean" style="margin-top:14px">${ins.map((t) => `<li><span>${esc(t)}</span></li>`).join("")}</ul>` : ""}</div>
    <div class="two">
      <div class="panel flat stack"><h3>Fivefold</h3><p class="small" style="margin:0">From Ephesians 4:11, drawing on Alan Hirsch's APEST work. Our own questions.</p>${radar(ffAxes, series, { size: 380 })}
        <p class="small" style="margin:0">${esc(pn)}: ${r.fivefold?.primary.name}, then ${r.fivefold?.secondary.name}.${r.spouseFivefold ? ` ${esc(sn)}: ${r.spouseFivefold.primary.name}, then ${r.spouseFivefold.secondary.name}.` : ""}</p>
        <p class="read" style="margin:0;font-size:1rem">${esc(FIVEFOLD_TEAM[r.fivefold?.primary.id] || "")}</p></div>
      <div class="panel flat stack"><h3>${esc(pn)}'s spiritual gifts</h3>${giftFan(r.gifts.list)}</div>
    </div>
    ${r.spouseGifts ? `<div class="two"><div class="panel flat stack"><h3>${esc(sn)}'s spiritual gifts</h3>${giftFan(r.spouseGifts.list)}</div>
      <div class="panel flat stack"><h3>Top gifts together</h3><div class="two" style="gap:16px"><div><b class="small" style="color:var(--brass-text)">${esc(pn)}</b><ul class="list-clean" style="margin-top:6px">${r.gifts.top.map((g) => `<li><span>${esc(g.name)} <span class="muted small">${esc(g.ref)}</span></span></li>`).join("")}</ul></div>
      <div><b class="small" style="color:var(--chalk-text)">${esc(sn)}</b><ul class="list-clean" style="margin-top:6px">${r.spouseGifts.top.map((g) => `<li><span>${esc(g.name)} <span class="muted small">${esc(g.ref)}</span></span></li>`).join("")}</ul></div></div>
      ${leader && Object.keys(r.refs.giftsSeen).length ? `<hr class="rule"><b class="small">Gifts references named</b><p class="small" style="margin:0">${Object.entries(r.refs.giftsSeen).sort((a, b) => b[1] - a[1]).map(([g, n]) => `${esc(B.GIFTS.find((x) => x.id === g)?.name || g)} (${n})`).join(", ")}</p>` : ""}</div></div>` : ""}
  </section>`;
}

function refsSection(c, r) {
  const R = r.refs;
  if (!R.n) return `<section class="stack"><div class="section-head"><h2>References</h2></div><div class="notice">No references yet. Aim for three to five: a sending or supervising pastor, a ministry peer, someone they've led, and someone outside the church.</div></section>`;
  const readyNames = B.REF_READY;
  return `<section class="stack"><div class="section-head"><h2>References</h2><p class="muted">${R.n} reference${R.n === 1 ? "" : "s"}. The Follow Test asks: "${esc(B.FOLLOW_TEST)}"</p></div>
    <div class="scroll-x"><table class="tbl"><thead><tr><th>Name</th><th>Relationship</th><th>Known</th><th>Follow Test</th><th>Readiness</th></tr></thead><tbody>
    ${(c.refs || []).map((x) => `<tr><td><b>${esc(x.meta?.name)}</b></td><td>${esc(x.meta?.relationship)}</td><td class="num">${esc(x.meta?.years ? x.meta.years + " yrs" : "")}</td><td class="num">${n15(x.follow) ?? "—"} <span class="muted small">${esc(B.FOLLOW_SCALE[(n15(x.follow) || 1) - 1] || "")}</span></td><td>${esc(readyNames[x.ready] ?? "—")}</td></tr>`).join("")}</tbody></table></div>
    <div class="two">${R.quotes.map((q) => `<div class="stack" style="gap:10px"><b>${esc(q.name)}</b>${q.strength ? `<blockquote class="quote">${esc(q.strength)}<cite>Greatest strength</cite></blockquote>` : ""}${q.growth ? `<blockquote class="quote">${esc(q.growth)}<cite>Area to grow</cite></blockquote>` : ""}${q.confidential ? `<blockquote class="quote" style="border-color:var(--band-c)">${esc(q.confidential)}<cite>Confidential to you</cite></blockquote>` : ""}</div>`).join("")}</div>
  </section>`;
}

function experienceSection(c, r, notes) {
  const P = c.planter;
  const work = B.WORK_SAMPLES.filter((w) => safeUrl(P.work?.[w.id]));
  return `<section class="stack"><div class="section-head"><h2>Experience and work samples</h2><p class="muted">Experience score ${r.facts?.pct ?? "—"} of 100 (${r.facts?.band?.name || ""}). Each answer earns 0 to 4 points. Launch timing isn't scored.</p></div>
    <div class="scroll-x"><table class="tbl"><tbody>${(r.facts?.rows || []).map((x) => `<tr><th style="width:55%">${esc(x.q)}</th><td>${esc(x.a)} ${x.flag ? `<span class="chip tone-${x.flag === "concern" ? "d" : "c"}">${x.flag === "concern" ? "Concern" : "Watch"}</span>` : ""}</td></tr>`).join("")}</tbody></table></div>
    ${work.length ? `<div class="stack"><h3>Work samples</h3><p class="small" style="margin:0">Watch or read each one, then score it here. Your scores stay in this browser.</p>${B.WORK_RUBRIC.filter((w) => safeUrl(P.work?.[w.id])).map((w) => `<div class="icard"><div class="spread"><b>${w.name}</b><a href="${esc(safeUrl(P.work[w.id]))}" target="_blank" rel="noopener noreferrer">Open link</a></div>
      <div class="rubric" role="group" aria-label="Score ${w.name}">${[1, 2, 3, 4].map((n) => `<button aria-pressed="${notes.work[w.id] === n}" data-act="work-score" data-w="${w.id}" data-n="${n}" title="${esc(w.anchors[n - 1])}">${n}</button>`).join("")}<span class="small">${esc(notes.work[w.id] ? w.anchors[notes.work[w.id] - 1] : "Not scored yet")}</span></div></div>`).join("")}</div>` : ""}
  </section>`;
}

function networkSection(c, r) {
  const nb = r.beliefs.filter((b) => b.network);
  if (!nb.length && !r.netq.length) return "";
  const ansWord = { yes: "Yes", unsure: "Not sure", no: "No" };
  const val = (q, v) => (v == null || v === "" ? "—" : q.kind === "likert" ? (n15(v) ? B.LIKERT[v - 1] : "—") : esc(String(v)));
  return `<section class="stack"><div class="section-head"><h2>From ${esc(c.network?.name || "your network")}</h2><p class="muted">Your network's own beliefs and questions. Answers are shown as given and aren't scored.</p></div>
    ${nb.length ? `<div class="scroll-x"><table class="tbl"><tbody>${nb.map((b) => `<tr><td>${esc(b.t)}</td><td>${b.answer ? `<span class="chip tone-${b.answer === "yes" ? "a" : b.answer === "no" ? "d" : "c"}">${ansWord[b.answer]}</span>` : "—"}</td></tr>`).join("")}</tbody></table></div>` : ""}
    ${r.netq.map((q) => `<div class="icard"><span class="kind">${q.who === "both" ? "Planter and spouse" : q.who === "spouse" ? "Spouse" : "Planter"}</span><div class="q">${esc(q.t)}</div>
      ${q.who !== "spouse" ? `<p class="read" style="margin:0"><b>${esc(first(c.planterName))}:</b> ${val(q, q.kind === "likert" ? c.planter?.netq?.[q.id] : c.planter?.netqText?.[q.id])}</p>` : ""}
      ${q.who !== "planter" && c.married ? `<p class="read" style="margin:0"><b>${esc(first(c.spouseName))}:</b> ${val(q, q.kind === "likert" ? c.spouse?.netq?.[q.id] : c.spouse?.netqText?.[q.id])}</p>` : ""}</div>`).join("")}
  </section>`;
}
function responseQuality(c, r) {
  const v = r.validity, sv = r.spouseValidity;
  const line = (name, x) => x ? `<div class="spread" style="border-bottom:1px solid var(--rule);padding-bottom:8px"><span><b>${esc(name)}</b> ${x.notes.length ? `<span class="small">${esc(x.notes.join(" "))}</span>` : `<span class="small">No issues found.</span>`}</span><span class="chip tone-${x.quality === "Good" ? (x.idealized ? "c" : "a") : x.quality === "Some concerns" ? "c" : "d"}">${x.quality === "Good" && x.idealized ? "Possibly idealized" : x.quality}</span></div>` : "";
  return `<section class="stack"><div class="section-head"><h2>Response quality</h2><p class="muted">Checks for rushing, inconsistent answers and answers that sound too good to be true. These start a conversation. They don't accuse anyone.</p></div>
    ${line(first(c.planterName), v)}${c.married ? line(first(c.spouseName), sv) : ""}</section>`;
}

const ANCHORS = ["No relevant example, or it shows the opposite", "Vague or hypothetical", "A clear example with personal ownership", "Several examples, clear ownership and results", "A pattern of examples, ownership, reflection and growth"];
function interviewSection(c, r, notes) {
  const I = r.interview;
  const block = (key, title, mins, list) => list.length ? `<div class="stack"><div class="spread"><h3>${title}</h3><span class="small num">About ${mins} minutes</span></div>
    ${list.map((q) => { const id = qid(key, q.q); return `<div class="icard"><span class="kind">${esc(q.title)}</span><div class="q">${esc(q.q)}</div>
      ${q.probes?.length ? `<ul>${q.probes.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}${q.look ? `<div class="look"><b>Listen for:</b> ${esc(q.look)}</div>` : ""}
      <div class="rubric" role="group" aria-label="Rate the answer">${[1, 2, 3, 4, 5].map((n) => `<button aria-pressed="${notes.rubric[id] === n}" data-act="rubric" data-q="${id}" data-n="${n}" title="${esc(ANCHORS[n - 1])}">${n}</button>`).join("")}<span class="small">${esc(notes.rubric[id] ? ANCHORS[notes.rubric[id] - 1] : "Rate after they answer")}</span></div>${teamLine(c, id, notes.rubric[id])}
      <textarea class="input" data-act="note" data-q="${id}" aria-label="Notes" placeholder="Notes" style="min-height:64px">${esc(notes.text[id] || "")}</textarea></div>`; }).join("")}</div>` : "";
  return `<section class="stack" id="interview"><div class="section-head"><h2>Interview guide</h2><p class="muted">Built from their answers. Ask about real past situations and follow up for what they personally did. Rate each answer from 1 to 5 on your own before comparing with other interviewers.</p></div>
    <div class="anchors">${ANCHORS.map((a, i) => `<div><b>${i + 1}</b> ${esc(a)}</div>`).join("")}</div>
    ${block("p", `With ${esc(first(c.planterName))}`, I.timing.planter, I.planter)}
    ${block("s", `With ${esc(first(c.spouseName))}, alone`, I.timing.spouse, I.spouse)}
    ${block("c", "With both of them", I.timing.couple, I.couple)}
  </section>`;
}

// ---------------- personal reports ----------------
function personReport(c, r, who) {
  const isP = who === "planter";
  const name = isP ? c.planterName : c.spouseName, nm = first(name);
  const other = first(isP ? c.spouseName : c.planterName);
  const resp = isP ? c.planter : c.spouse;
  if (!resp) return `<div class="notice">${esc(nm)} hasn't finished yet.</div>`;
  const W = isP ? r.wiring : r.spouseWiring;
  const G = isP ? r.gifts : r.spouseGifts;
  const F = isP ? r.fivefold : r.spouseFivefold;
  const leans = W.filter((d) => d.lean !== "Balanced").map((d) => d.lean.toLowerCase());
  const scales = isP ? Object.entries(r.scales).filter(([, v]) => v).map(([k, v]) => ({ k, s: B.SCALES[k], v, name: B.SCALES[k].name }))
    : Object.entries(r.spouse || {}).filter(([, v]) => v).map(([k, v]) => ({ k, s: B.SPOUSE_SCALES[k], v, name: B.SPOUSE_SCALES[k].label }));
  const strengths = scales.filter((x) => x.v.band.id === "strength").sort((a, b) => b.v.pct - a.v.pct).slice(0, 4);
  const growth = scales.filter((x) => x.v.band.id === "growth" || x.v.band.id === "developing").sort((a, b) => a.v.pct - b.v.pct).slice(0, 3);
  const plan = growth.map((g) => ({ scale: g.name, step: g.s.plan }));
  if (isP) r.plan.slice(growth.length).forEach((x) => { if (!plan.find((p) => p.scale === x.scale) && plan.length < 5) plan.push(x); });
  const C = r.couple;
  const unityAxes = C ? C.areas.map((a) => ({ label: a.name })) : [];
  const areaMean = (a, k) => { const v = a.items.filter((i) => i[k] != null); return v.length ? (v.reduce((x, i) => x + i[k], 0) / v.length - 1) / 4 : 0; };
  return `<article class="report">
    <section class="hero-report"><div><span class="kicker">${esc(nm)}'s Plumbline</span><h1 style="margin-top:8px">${esc(nm)}, here's how God has wired you.</h1>
      <p>You lean ${esc(leans.slice(0, 3).join(", ") || "balanced across the board")}. Your strongest gifts look like ${esc(G.top.slice(0, 3).map((g) => g.name.toLowerCase()).join(", "))}, and you serve most naturally as ${F ? (/^[AEIOU]/.test(F.primary.short) ? "an " : "a ") + esc(F.primary.short.toLowerCase()) : "part of the body"}.</p></div>
      <div class="mini-plumb">${heroPlumb(true)}</div></section>

    <section class="stack"><div class="section-head"><h2>Your wiring</h2><p class="muted">Five dimensions of your natural style.${C ? ` ${esc(other)} is shown too, so you can see how you fit together.` : ""}</p></div>
      <div class="panel flat">${wiringRows(W, C ? (isP ? r.spouseWiring : r.wiring) : null, nm, other)}
      <ul class="list-clean" style="margin-top:14px">${W.map((d) => `<li><b>${esc(d.label)}</b><span>${esc(d.pos == null ? "" : d.pos >= 65 ? d.rightDesc : d.pos <= 35 ? d.leftDesc : `You can move between ${d.left.toLowerCase()} and ${d.right.toLowerCase()} as the moment needs.`)}</span></li>`).join("")}</ul></div></section>

    <section class="two">
      <div class="panel flat stack"><h3>Your spiritual gifts</h3>${giftFan(G.list)}<p class="small" style="margin:0">Top five: ${G.top.map((g) => `${esc(g.name)} (${esc(g.ref)})`).join(", ")}. Gifts are confirmed by fruit and by the church over time. Treat this as a starting point.</p></div>
      <div class="panel flat stack"><h3>How you serve the body</h3>${F ? radar(B.FIVEFOLD.map((f) => ({ label: f.name })), [{ values: B.FIVEFOLD.map((f) => (F.list.find((x) => x.id === f.id).pct) / 100), color: isP ? "var(--brass)" : "var(--chalk)", label: nm }], { size: 380 }) : ""}
        ${F ? `<p class="read" style="margin:0;font-size:1rem"><b>${esc(F.primary.name)}.</b> ${esc(F.primary.desc)} Your second bent is ${esc(F.secondary.name.toLowerCase())}. ${esc(FIVEFOLD_TEAM[F.primary.id])}</p>` : ""}</div>
    </section>

    ${C ? `<section class="stack"><div class="section-head"><h2>Your Unity Map</h2><p class="muted">You and ${esc(other)} answered the same statements separately. The closer the two shapes, the more you see your life the same way. The bigger, the healthier.</p></div>
      <div class="two"><div class="panel flat">${radar(unityAxes, [{ values: C.areas.map((a) => areaMean(a, "a")), color: "var(--brass)", label: first(c.planterName) }, { values: C.areas.map((a) => areaMean(a, "b")), color: "var(--chalk)", label: first(c.spouseName) }], { size: 420 })}
        <div class="legend" style="justify-content:center"><span><i style="width:10px;height:10px;border-radius:50%;background:var(--brass)"></i>${esc(first(c.planterName))}</span><span><i style="width:10px;height:10px;border-radius:50%;background:var(--chalk)"></i>${esc(first(c.spouseName))}</span></div></div>
      <div class="stack"><ul class="list-clean">${C.areas.filter((a) => a.status !== "missing").map((a) => `<li><b>${a.name} ${a.status === "united" ? '<span class="chip tone-a">United</span>' : a.status === "mostly" ? '<span class="chip tone-b">Mostly aligned</span>' : '<span class="chip tone-c">Talk this through</span>'}</b></li>`).join("")}</ul>
        <p class="read" style="margin:0;font-size:1rem">Every couple has areas to talk through. Pick one this week and ask each other: "What did you mean when you answered that?"</p></div></div></section>` : ""}

    <section class="stack"><div class="section-head"><h2>Where you're strong</h2></div>
      ${strengths.length ? `<div class="two">${strengths.map((x) => `<div class="strength-card"><div class="spread"><b>${esc(x.name)}</b>${bandChip(x.v.band)}</div><p>${esc(x.s.strength)}</p></div>`).join("")}</div>` : `<p class="muted">Your strengths are spread evenly. Your network leader will help you name them.</p>`}</section>

    <section class="stack"><div class="section-head"><h2>Your next 90 days</h2><p class="muted">Growth areas aren't failures. They're the next faithful steps.</p></div>
      ${plan.length ? plan.map((p, i) => `<div class="plan-step"><span class="n">${i + 1}</span><div><b>${esc(p.scale)}</b><p>${esc(p.step)}</p></div></div>`).join("") : `<p class="muted">No growth areas stood out. Keep doing what you're doing, and ask your coach where to stretch.</p>`}</section>

    ${L.LIVE ? `<div class="no-print"><button class="btn sm ghost" data-act="print">Print or save as PDF</button></div>` : ""}
    <div class="disclaim">This report reflects how you described yourself on the day you took it. Your network leader will walk through it with you. It isn't a diagnosis or a final word, and you can grow in every area here.</div>
  </article>`;
}

// ---------------- taking ----------------
function startTake(c, role, refIdx = null) {
  const key = `${c.id}:${role}`;
  const ctx = { planterName: c.planterName, spouseName: c.spouseName, married: c.married, city: c.city, network: c.network?.name, signGifts: c.network?.signGifts !== false };
  const steps = buildFlow(role, ctx);
  const draft = db.drafts[key];
  take = { caseId: c.id, role, refIdx, ctx, steps, i: draft?.i || 0, resp: draft?.resp || blankResp(role, c), key };
  go({ name: "take" });
}
function blankResp(role, c) {
  if (role === "reference") return { items: {}, gifts: [], meta: { name: "", relationship: "", years: "" } };
  return { likert: {}, wiring: {}, gifts: {}, fivefold: [], scenarios: {}, couple: {}, guess: {}, facts: {}, beliefs: {}, safety: {}, spouseSees: {}, work: {}, privateNote: "",
    meta: role === "planter" ? { name: c.planterName, married: c.married, spouseName: c.spouseName, city: c.city, network: c.network?.name, pageTimes: {}, bankVersion: B.BANK_VERSION } : { name: c.spouseName, pageTimes: {}, bankVersion: B.BANK_VERSION } };
}
function saveDraft() {
  if (take.token) { L.queueSave(take.token, take.resp, take.i, take.steps.length - 1, chapterLabel(take.steps[take.i]) || ""); return; }
  db.drafts[take.key] = { i: take.i, resp: take.resp }; save();
}
function startTakeLive(token, data) {
  const cs = data.case, p = data.participant;
  const c = { id: cs.id, planterName: cs.planterName, spouseName: cs.spouseName, married: cs.married, city: cs.city, network: { name: cs.network, signGifts: cs.signGifts } };
  const ctx = { planterName: cs.planterName, spouseName: cs.spouseName, married: cs.married, city: cs.city, network: cs.network, signGifts: cs.signGifts !== false, beliefs: cs.beliefs || [], questions: cs.questions || [], logoUrl: cs.logoUrl };
  const steps = buildFlow(p.role, ctx);
  let resp = p.answers && Object.keys(p.answers).length ? p.answers : blankResp(p.role, c);
  let i = p.step || 0;
  const b = L.backup(token);
  if (b && b.step > i) { resp = b.answers; i = b.step; }
  if (p.role === "reference" && !resp.meta?.name && p.name) resp.meta = { ...(resp.meta || {}), name: p.name };
  if (p.role !== "reference") { resp.meta = resp.meta || {}; resp.meta.pageTimes = resp.meta.pageTimes || {}; }
  take = { caseId: cs.id, role: p.role, ctx, steps, i: Math.min(i, steps.length - 2), resp, key: token, token };
  go({ name: "take" });
  if (i > 0) toast("Welcome back. Picking up where you left off.");
}
function saveLabel() {
  const st = L.saveStatus();
  return st === "saving" ? "Saving…" : st === "offline" ? "Offline. Will save when you reconnect" : "Saved";
}

function chapterBar() {
  const chs = [];
  take.steps.forEach((s) => { if (s.chapter !== "start" && s.chapter !== "done" && !chs.includes(s.chapter)) chs.push(s.chapter); });
  const cur = take.steps[take.i].chapter;
  const ci = chs.indexOf(cur);
  return chs.map((ch, idx) => {
    const idxs = take.steps.map((s, i) => (s.chapter === ch ? i : -1)).filter((i) => i >= 0);
    const done = idx < ci || cur === "done" ? 1 : idx > ci ? 0 : (take.i - idxs[0]) / idxs.length;
    return `<span><i style="width:${Math.round(done * 100)}%"></i></span>`;
  }).join("");
}
function chapterLabel(s) {
  const named = take.steps.filter((x) => x.t === "intro" && x.chapter === s.chapter);
  return named.length ? named[0].name : s.chapter === "private" ? "Anything else" : "";
}

function renderTake() {
  const s = take.steps[take.i];
  const total = take.steps.length;
  const showTop = s.t !== "welcome" && s.t !== "done";
  return `<div class="wrap"><div class="take">
    ${showTop ? `<div class="take-top"><div class="chapters">${chapterBar()}</div><div class="chapter-name"><span>${esc(chapterLabel(s))}</span><span class="num">${Math.round((take.i / (total - 1)) * 100)}%</span></div></div>` : ""}
    ${screen(s)}
    ${showTop && s.t !== "intro" ? `<div class="take-nav"><button class="link" data-act="back">← Back</button><span class="keys">Use keys <span class="kbd">1</span>–<span class="kbd">5</span></span>${take.token ? `<span class="keys" id="savestate" aria-live="polite">${saveLabel()}</span>` : `<button class="link" data-act="save-exit">Save and finish later</button>`}</div>` : ""}
  </div></div>`;
}

function screen(s) {
  const R = take.resp, ctx = take.ctx, role = take.role;
  const pn = first(ctx.planterName), sn = first(ctx.spouseName);
  if (s.t === "welcome") {
    const who = role === "planter" ? ctx.planterName : role === "spouse" ? ctx.spouseName : "";
    return `<div class="stack-lg"><div class="stack"><span class="small">${esc(ctx.network || "Plumbline")}</span><h1 style="font-size:clamp(2rem,4.5vw,3rem)">${role === "reference" ? `Speak into ${esc(pn)}'s readiness to plant.` : `Welcome${who ? ", " + esc(first(who)) : ""}.`}</h1>
      <p class="lede" style="margin:0">${role === "planter" ? `This takes about 35 minutes. Answer honestly. The most helpful answers describe your life as it is right now. You can stop and pick up where you left off on this device.` : role === "spouse" ? `This takes about 25 minutes. It's about you, not just about ${esc(pn)}. Please take it on your own and don't compare answers until you've both finished.` : `This takes about 8 minutes. Your honest answers help ${esc(pn)} and the network make a wise decision. Rate only what you've actually seen.`}</p></div>
      <form class="panel stack" id="welcome">
      ${role === "reference" ? `<label class="field">Your name<input id="w-name" required value="${esc(R.meta.name)}"></label>
        <label class="field">How do you know ${esc(pn)}?<select id="w-rel" required><option value="">Choose one</option>${B.REF_RELATIONSHIPS.map((x) => `<option ${R.meta.relationship === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
        <label class="field">Years you've known them<input id="w-years" inputmode="numeric" value="${esc(R.meta.years)}"></label>`
      : `<label class="field">Your name<input id="w-name" required value="${esc(R.meta.name || "")}"></label>`}
      <label class="check"><input type="checkbox" id="w-consent" required> <span>${role === "reference" ? `I understand my answers go to the network leader. My written comments won't be shown to ${esc(pn)} by Plumbline.` : `I understand my answers go to ${esc(ctx.network || "my network leader")}, who will see a full report. ${role === "spouse" ? `${esc(pn)} won't see my individual answers, my private note or my safety answers.` : `My spouse won't see my individual answers.`} This isn't a clinical or psychological test.`}</span></label>
      <div><button class="btn" type="submit">Begin</button></div></form></div>`;
  }
  if (s.t === "intro") return `<div class="intro-card"><span class="kicker">${esc(s.kicker)}</span><h2>${esc(s.name)}</h2><p>${esc(s.text)}</p><span class="small" style="color:inherit;opacity:.7">About ${s.minutes} minutes</span><button class="btn" data-act="next">Continue</button></div>`;
  if (s.t === "likert") {
    const val = getLikert(s);
    const labels = s.freq ? B.OBS : B.LIKERT;
    const opts = labels.map((l, i) => `<button class="opt" aria-pressed="${val === i + 1}" data-act="ans" data-v="${i + 1}"><b>${i + 1}</b>${esc(l)}</button>`).join("");
    const na = s.na ? `<button class="opt na" aria-pressed="${val === 0}" data-act="ans" data-v="0"><b>–</b>Not seen</button>` : "";
    return `<div class="qcard"><div class="stack" style="gap:10px">${s.sub ? `<span class="qsub">${esc(s.sub)}</span>` : ""}<div class="qtext">${esc(s.text)}</div></div><div class="${s.na ? "scale6" : "scale5"}" role="group">${opts}${na}</div></div>`;
  }
  if (s.t === "pair") {
    const v = R.wiring[s.dim]?.[s.i];
    return `<div class="qcard"><div class="stack" style="gap:10px"><span class="qsub">Which is more like you?</span></div>
      <div class="pair"><div class="side">${esc(s.left)}</div><div class="dots5" role="group" aria-label="Choose a point between the two statements">${[1, 2, 3, 4, 5].map((n) => `<button class="dot s${n}" aria-pressed="${v === n}" data-act="ans" data-v="${n}" aria-label="${n === 1 ? "Much more the left statement" : n === 5 ? "Much more the right statement" : n === 3 ? "Both equally" : n < 3 ? "Somewhat the left statement" : "Somewhat the right statement"}"></button>`).join("")}</div><div class="side r">${esc(s.right)}</div></div><span></span></div>`;
  }
  if (s.t === "gift") {
    const v = R.gifts[s.g]?.[s.i];
    return `<div class="qcard"><div class="stack" style="gap:10px"><span class="qsub">How true is this of you?</span><div class="qtext">${esc(s.text)}</div></div><div class="scale5" role="group">${B.GIFT_SCALE.map((l, i) => `<button class="opt" aria-pressed="${v === i + 1}" data-act="ans" data-v="${i + 1}"><b>${i + 1}</b>${esc(l)}</button>`).join("")}</div></div>`;
  }
  if (s.t === "fivefold") {
    const blk = B.FIVEFOLD_BLOCKS[s.i], pick = R.fivefold[s.i] || {};
    const order = ["A", "P", "E", "S", "T"].sort((a, b) => ((a.charCodeAt(0) * (s.i + 3)) % 7) - ((b.charCodeAt(0) * (s.i + 3)) % 7));
    return `<div class="qcard"><div class="stack" style="gap:10px"><span class="qsub">Set ${s.i + 1} of ${B.FIVEFOLD_BLOCKS.length}</span><div class="qtext">Which of these energizes you most, and which least?</div></div>
      <div class="ff-grid">${order.map((k) => `<div class="ff-row"><span>${esc(blk[k])}</span><button class="m" aria-pressed="${pick.most === k}" data-act="ff" data-k="${k}" data-w="most">Most</button><button class="l" aria-pressed="${pick.least === k}" data-act="ff" data-k="${k}" data-w="least">Least</button></div>`).join("")}</div>
      <div><button class="btn" data-act="next" ${pick.most && pick.least ? "" : "disabled"}>Next</button></div></div>`;
  }
  if (s.t === "scenario") {
    const sc = B.SCENARIOS.find((x) => x.id === s.id), a = R.scenarios[s.id] || {};
    return `<div class="qcard"><div class="stack" style="gap:10px"><span class="qsub">${esc(sc.title)}</span><div class="qtext">${esc(sc.text)}</div><span class="small">${a.best == null ? "First, tap the best response." : a.worst == null ? "Now tap the worst response." : "Tap Next, or tap a choice to change it."}</span></div>
      <div class="choice-list">${sc.options.map((o, i) => `<button class="choice" data-act="scen" data-i="${i}" aria-pressed="${a.best === i || a.worst === i}"><span class="tag ${a.best === i ? "best" : a.worst === i ? "worst" : ""}">${a.best === i ? "Best" : a.worst === i ? "Worst" : String.fromCharCode(65 + i)}</span><span>${esc(o.t)}</span></button>`).join("")}</div>
      <div class="row"><button class="btn" data-act="next" ${a.best != null && a.worst != null ? "" : "disabled"}>Next</button>${a.best != null ? `<button class="link" data-act="scen-reset">Start over</button>` : ""}</div></div>`;
  }
  if (s.t === "beliefs") {
    return `<div class="qcard"><div class="stack" style="gap:10px"><span class="qsub">Core beliefs</span><div class="qtext">Do you affirm each of these?</div></div>
      <div class="stack" style="gap:10px">${allBeliefs(take.ctx).map((b) => `<div class="spread" style="border-bottom:1px solid var(--rule);padding-bottom:10px"><span style="flex:1;min-width:220px">${esc(b.t)}</span><div class="seg" role="group">${[["yes", "Yes"], ["unsure", "Not sure"], ["no", "No"]].map(([v, l]) => `<button data-act="belief" data-id="${b.id}" data-v="${v}" aria-pressed="${R.beliefs[b.id] === v}">${l}</button>`).join("")}</div></div>`).join("")}</div>
      <div><button class="btn" data-act="next" ${allBeliefs(take.ctx).every((b) => R.beliefs[b.id] != null) ? "" : "disabled"}>Next</button></div></div>`;
  }
  if (s.t === "fact") {
    const f = B.FACTS.find((x) => x.id === s.id), v = R.facts[s.id];
    if (f.multi) {
      const arr = Array.isArray(v) ? v : [];
      return `<div class="qcard"><div class="stack" style="gap:10px"><span class="qsub">Choose all that apply</span><div class="qtext">${esc(f.q)}</div></div><div class="choice-list">${f.opts.map((o, i) => `<button class="choice" data-act="fact-multi" data-i="${i}" aria-pressed="${arr.includes(i)}"><span class="tag">${arr.includes(i) ? "✓" : ""}</span><span>${esc(o.t)}</span></button>`).join("")}</div><div><button class="btn" data-act="next" ${arr.length ? "" : "disabled"}>Next</button></div></div>`;
    }
    return `<div class="qcard"><div class="stack" style="gap:10px"><span class="qsub">Your story</span><div class="qtext">${esc(f.q)}</div></div><div class="choice-list">${f.opts.map((o, i) => `<button class="choice" data-act="fact" data-i="${i}" aria-pressed="${v === i}"><span class="tag">${i + 1}</span><span>${esc(o.t)}</span></button>`).join("")}</div></div>`;
  }
  if (s.t === "work") {
    return `<div class="qcard"><div class="stack" style="gap:10px"><span class="qsub">Optional, but it helps</span><div class="qtext">Share links to your work so your network leader can see you in action.</div></div>
      <div class="stack">${B.WORK_SAMPLES.map((w) => `<label class="field">${esc(w.q)}<input id="work-${w.id}" type="url" placeholder="${esc(w.hint)}" value="${esc(R.work[w.id] || "")}"></label>`).join("")}</div>
      <div><button class="btn" data-act="work-next">Finish</button></div></div>`;
  }
  if (s.t === "netqText") return `<div class="qcard"><div class="stack" style="gap:10px"><span class="qsub">From ${esc(ctx.network || "your network")}</span><div class="qtext">${esc(s.text)}</div></div>
      <textarea class="input" id="netq-text" maxlength="2000" placeholder="Your answer">${esc((R.netqText || {})[s.id] || "")}</textarea><div><button class="btn" data-act="netq-next">Next</button></div></div>`;
  if (s.t === "safetyIntro") return `<div class="intro-card"><span class="kicker">Private</span><h2>Three private questions</h2><p>These go only to your network leader. They are never shown to ${esc(pn)} or in any shared report. If you are ever in danger, call 911. In the US, you can reach the National Domestic Violence Hotline at 1-800-799-7233 or by texting START to 88788.</p><button class="btn" data-act="next">Continue</button></div>`;
  if (s.t === "private") return `<div class="qcard"><div class="stack" style="gap:10px"><span class="qsub">Private to your network leader</span><div class="qtext">Is there anything you'd want your network leader to know that's hard to say with ${esc(pn)} in the room?</div><p class="small" style="margin:0">Optional. ${esc(pn)} won't see this.</p></div>
      <textarea class="input" id="priv" placeholder="Write as much or as little as you'd like">${esc(R.privateNote || "")}</textarea><div><button class="btn" data-act="private-next">Finish</button></div></div>`;
  if (s.t === "follow") return `<div class="qcard"><div class="stack" style="gap:10px"><span class="qsub">The Follow Test</span><div class="qtext">${esc(B.FOLLOW_TEST.replace("they", pn))}</div></div><div class="scale5" role="group">${B.FOLLOW_SCALE.map((l, i) => `<button class="opt" aria-pressed="${R.follow === i + 1}" data-act="ans" data-v="${i + 1}"><b>${i + 1}</b>${esc(l)}</button>`).join("")}</div></div>`;
  if (s.t === "refReady") return `<div class="qcard"><div class="stack" style="gap:10px"><span class="qsub">Readiness</span><div class="qtext">How ready is ${esc(pn)} to plant a church?</div></div><div class="choice-list">${B.REF_READY.map((l, i) => `<button class="choice" data-act="ref-ready" data-i="${i}" aria-pressed="${R.ready === i}"><span class="tag">${i + 1}</span><span>${esc(l)}</span></button>`).join("")}</div></div>`;
  if (s.t === "refGifts") {
    const list = B.GIFTS.filter((g) => ctx.signGifts !== false || !B.SIGN_GIFTS.includes(g.id));
    return `<div class="qcard"><div class="stack" style="gap:10px"><span class="qsub">Choose up to five</span><div class="qtext">Which spiritual gifts have you seen in ${esc(pn)}?</div></div><div class="row" style="gap:8px">${list.map((g) => `<button class="sdot" style="font-size:14px;padding:8px 12px;cursor:pointer;border:1px solid var(--rule);${R.gifts.includes(g.id) ? "background:var(--ink);color:var(--paper)" : ""}" data-act="ref-gift" data-g="${g.id}" aria-pressed="${R.gifts.includes(g.id)}">${esc(g.name)}</button>`).join("")}</div><div><button class="btn" data-act="next">Next</button></div></div>`;
  }
  if (s.t === "refText") return `<div class="qcard"><div class="stack"><label class="field">${esc(pn)}'s greatest strength<textarea class="input" id="rt-strength">${esc(R.strength || "")}</textarea></label>
      <label class="field">One area to grow before planting<textarea class="input" id="rt-growth">${esc(R.growth || "")}</textarea></label>
      <label class="field">Anything the network leader should know? <span class="hint">Confidential to the network leader. Optional.</span><textarea class="input" id="rt-conf">${esc(R.confidential || "")}</textarea></label></div><div><button class="btn" data-act="ref-finish">Finish</button></div></div>`;
  if (s.t === "done") return doneScreen();
  return "";
}

function getLikert(s) {
  const R = take.resp;
  if (s.bucket === "likert") return R.likert[s.id];
  if (s.bucket === "items") return R.items[s.id];
  return R[s.bucket]?.[s.id];
}
function setLikert(s, v) {
  const R = take.resp;
  if (s.t === "pair") { (R.wiring[s.dim] ||= [])[s.i] = v; return; }
  if (s.t === "gift") { (R.gifts[s.g] ||= [])[s.i] = v; return; }
  if (s.t === "follow") { R.follow = v; return; }
  if (s.bucket === "likert") R.likert[s.id] = v;
  else if (s.bucket === "items") R.items[s.id] = v;
  else (R[s.bucket] ||= {})[s.id] = v;
}

let doneCode = null;
function doneScreen() {
  if (take.token) {
    const nm = take.role === "reference" ? first(take.resp.meta?.name) : first(take.role === "planter" ? take.ctx.planterName : take.ctx.spouseName);
    return `<div class="stack-lg"><div class="intro-card"><span class="kicker">${take.finishError ? "Almost there" : "Finished and sealed"}</span><h2>Thank you, ${esc(nm)}.</h2><p>${take.finishError ? `We couldn't reach the server to seal your answers. Your answers are saved on this device. Check your connection and try again.` : take.role === "reference" ? `Your answers went straight to the network leader. You can close this page.` : `Your answers are sealed, and your network leader can see that you finished. After you meet, your personal report will appear at this same link. Bookmark it.`}</p>${take.finishError ? `<button class="btn" data-act="retry-finish">Try again</button>` : ""}</div></div>`;
  }
  const c = getCase(take.caseId);
  const nm = take.role === "reference" ? first(take.resp.meta.name) : first(take.role === "planter" ? take.ctx.planterName : take.ctx.spouseName);
  return `<div class="stack-lg"><div class="intro-card"><span class="kicker">Finished and sealed</span><h2>Thank you, ${esc(nm)}.</h2><p>${take.role === "reference" ? `Your answers will help ${esc(first(take.ctx.planterName))} and the network make a wise decision.` : "Your answers are sealed. Your network leader will set a time to walk through your report with you."}</p></div>
    <div class="panel stack" data-copywrap><h3>Send this code to your network leader</h3><p class="small" style="margin:0">Copy it and paste it into an email or text to your network leader. It holds your answers.</p><div class="code-box" id="code-box">${doneCode ? esc(doneCode) : "Preparing your code…"}</div><div class="row"><button class="btn" data-act="copy-code">Copy code</button>${take.role !== "reference" && c?.planter ? `<button class="btn ghost" data-act="see-report">See my report</button>` : ""}</div></div></div>`;
}

async function finishTake() {
  if (take.token) {
    take.resp.meta = { ...(take.resp.meta || {}), finishedAt: today() };
    take.i = take.steps.length - 1; take.finishError = false;
    try { await L.finish(take.token, take.resp); } catch { take.finishError = true; }
    render(); return;
  }
  const c = ensureLocalCase();
  const R = take.resp;
  R.meta = { ...(R.meta || {}), finishedAt: today() };
  if (take.role === "planter") c.planter = R;
  else if (take.role === "spouse") c.spouse = R;
  else { c.refs = c.refs || []; c.refs.push(R); }
  delete db.drafts[take.key];
  save();
  doneCode = null;
  take.i = take.steps.length - 1;
  render();
  doneCode = await resultCode(c, take.role, R);
  const box = $("#code-box"); if (box) box.textContent = doneCode;
}
function ensureLocalCase() {
  let c = db.cases.find((x) => x.id === take.caseId);
  if (c) return c;
  const s = SAMPLES.find((x) => x.id === take.caseId);
  if (s) { // taking a sample: make a personal copy so the sample stays clean
    c = { id: "try-" + uid(), label: s.label + " (your test)", planterName: s.planterName, spouseName: s.spouseName, married: s.married, city: s.city, network: s.network, created: today(), planter: null, spouse: null, refs: [] };
    db.cases.unshift(c); take.caseId = c.id; return c;
  }
  return ensureCase({ c: take.caseId, l: take.ctx.planterName, pn: take.ctx.planterName, sn: take.ctx.spouseName, m: take.ctx.married, city: take.ctx.city, net: take.ctx.network, sg: take.ctx.signGifts });
}

function advance() {
  const s = take.steps[take.i];
  if (s && ["likert", "pair", "gift", "follow"].includes(s.t) && take.shownAt) {
    const pt = (take.resp.meta ||= {}).pageTimes ||= {};
    const ms = Math.min(60000, Date.now() - take.shownAt);
    (pt[s.chapter] ||= { ms: 0, n: 0 }).ms += ms; pt[s.chapter].n += 1;
  }
  take.i = Math.min(take.steps.length - 1, take.i + 1);
  saveDraft();
  if (take.steps[take.i].t === "done") { finishTake(); return; }
  render();
}
function afterTake() {
  take.shownAt = Date.now();
  const f = $("#app .qcard button[aria-pressed='true'], #app .intro-card .btn, #app .qcard .opt, #app .qcard .choice, #app .qcard .dot, #app input, #app textarea");
  let coarse = false; try { coarse = matchMedia("(pointer: coarse)").matches; } catch {}
  if (f && !coarse && document.activeElement === document.body) f.focus({ preventScroll: true });
}

// ---------------- events ----------------
let advanceTimer = null;
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act === "nav") { e.preventDefault(); if (el.dataset.to === "admin") { go({ name: "admin" }); L.platformStats().then((st) => { if (view.name === "admin") { view.stats = st; render(); } }); return; } go({ name: el.dataset.to }); return; }
  if (act === "print") { window.print(); return; }
  if (L.LIVE && (await T.onClick(act, el))) return;
  if (act === "jump") { e.preventDefault(); document.getElementById(el.dataset.to)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (act === "open-sample") { go({ name: "case", id: "kim", tab: "leader" }); return; }
  if (act === "open-case") { go({ name: "case", id: el.dataset.id }); return; }
  if (act === "tab") { if (view.personal) return; view.tab = el.dataset.tab; render(); return; }
  if (act === "seg") {
    const inp = document.getElementById(el.dataset.for); inp.value = el.dataset.v;
    el.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === el));
    if (el.dataset.for === "f-m") $("#f-sn-wrap").hidden = el.dataset.v === "0";
    return;
  }
  if (act === "signout") { await L.signOut(); go({ name: "home" }); return; }
  if (act === "copy-link") { copy(L.personLink(el.dataset.token), el); return; }
  if (act === "copy-text") { copy(el.dataset.text, el); return; }
  if (act === "open-link") { location.hash = "#/t/" + el.dataset.token; return; }
  if (act === "release") { try { await L.setReleased(view.id, el.dataset.on === "1"); toast(el.dataset.on === "1" ? "Reports released" : "Reports hidden"); } catch (err) { toast("Couldn't update. Try again."); } return; }
  if (act === "retry-finish") { finishTake(); return; }
  if (act === "copy-invite") { const c = getCase(view.id); copy(await inviteCode(c, el.dataset.role), el); return; }
  if (act === "take-here") { const c = getCase(view.id); if (c.live) { const p = c.people.find((x) => x.role === el.dataset.role); if (p) location.hash = "#/t/" + p.token; return; } startTake(c, el.dataset.role); return; }
  if (act === "delete-case") {
    $("#del-confirm").innerHTML = `<div class="notice red" style="margin-top:12px">Delete this assessment and every answer in it${getCase(view.id)?.live ? " for your whole team" : " from this browser"}? This can't be undone. <div class="row" style="margin-top:10px"><button class="btn sm" data-act="delete-yes">Delete</button><button class="btn sm ghost" data-act="delete-no">Keep it</button></div></div>`; return;
  }
  if (act === "delete-no") { $("#del-confirm").innerHTML = ""; return; }
  if (act === "delete-yes" && getCase(view.id)?.live) { try { await L.deleteCase(view.id); toast("Deleted"); go({ name: "leader" }); } catch { toast("Couldn't delete it. Only owners and admins can."); } return; }
  if (act === "delete-yes") { db.cases = db.cases.filter((c) => c.id !== view.id); delete db.notes[view.id]; save(); toast("Deleted"); go({ name: "leader" }); return; }
  if (act === "join") {
    const msg = $("#join-msg");
    try {
      const h = await unpack($("#join-code").value);
      if (h.k !== "inv") throw new Error("That's a results code. Paste it under Network leaders, then Add results.");
      const c = ensureCase(h); save();
      startTake(c, h.r);
    } catch (err) { msg.innerHTML = `<div class="notice red">${esc(err.message || "That code didn't work. Check that you copied the whole thing.")}</div>`; }
    return;
  }
  if (act === "add-result") {
    const msg = $("#res-msg");
    try {
      const h = await unpack($("#res-code").value);
      if (h.k !== "res") throw new Error("That's an invite code. Results codes start with PLR-.");
      const c = ensureCase(h);
      if (h.r === "planter") c.planter = h.d; else if (h.r === "spouse") c.spouse = h.d;
      else { c.refs = (c.refs || []).filter((x) => x.meta?.name !== h.d.meta?.name); c.refs.push(h.d); }
      save(); toast("Results added"); go({ name: "case", id: c.id });
    } catch (err) { msg.innerHTML = `<div class="notice red">${esc(err.message || "That code didn't work. Check that you copied the whole thing.")}</div>`; }
    return;
  }
  if (act === "rubric" || act === "work-score") {
    const c = getCase(view.id); const notes = notesFor(c);
    if (act === "rubric") notes.rubric[el.dataset.q] = +el.dataset.n; else notes.work[el.dataset.w] = +el.dataset.n;
    saveNotesFor(c, notes);
    if (c.live && act === "rubric") { const line = el.closest(".icard")?.querySelector(".rubric + .small"); const html = teamLine(c, el.dataset.q, true); if (line) line.outerHTML = html || ""; else if (html) el.closest(".rubric").insertAdjacentHTML("afterend", html); }
    const grp = el.parentElement; grp.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === el));
    const lbl = grp.querySelector("span"); if (lbl) lbl.textContent = act === "rubric" ? ANCHORS[+el.dataset.n - 1] : B.WORK_RUBRIC.find((w) => w.id === el.dataset.w).anchors[+el.dataset.n - 1];
    return;
  }

  // taking
  if (!take) return;
  const s = take.steps[take.i];
  if (act === "next") { advance(); return; }
  if (act === "back") { take.i = Math.max(0, take.i - 1); saveDraft(); render(); return; }
  if (act === "save-exit") { saveDraft(); toast("Saved. Come back to this page on this device to continue."); go({ name: "home" }); return; }
  if (act === "ans") {
    setLikert(s, +el.dataset.v);
    el.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === el));
    clearTimeout(advanceTimer); advanceTimer = setTimeout(advance, 220); return;
  }
  if (act === "ff") {
    const p = (take.resp.fivefold[s.i] ||= {});
    const w = el.dataset.w, k = el.dataset.k, other = w === "most" ? "least" : "most";
    p[w] = k; if (p[other] === k) delete p[other];
    saveDraft(); render(); return;
  }
  if (act === "scen") {
    const a = (take.resp.scenarios[s.id] ||= {}); const i = +el.dataset.i;
    if (a.best == null) a.best = i;
    else if (a.worst == null && i !== a.best) a.worst = i;
    else if (i === a.best) { a.best = null; }
    else if (i === a.worst) { a.worst = null; }
    else a.worst = i;
    saveDraft(); render(); return;
  }
  if (act === "scen-reset") { take.resp.scenarios[s.id] = {}; saveDraft(); render(); return; }
  if (act === "belief") { take.resp.beliefs[el.dataset.id] = el.dataset.v; saveDraft(); render(); return; }
  if (act === "fact") { take.resp.facts[s.id] = +el.dataset.i; el.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === el)); clearTimeout(advanceTimer); advanceTimer = setTimeout(advance, 220); return; }
  if (act === "fact-multi") {
    const f = B.FACTS.find((x) => x.id === s.id), i = +el.dataset.i;
    let arr = Array.isArray(take.resp.facts[s.id]) ? take.resp.facts[s.id] : [];
    if (f.opts[i].none) arr = arr.includes(i) ? [] : [i];
    else { arr = arr.filter((x) => !f.opts[x].none); arr = arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i]; }
    take.resp.facts[s.id] = arr; saveDraft(); render(); return;
  }
  if (act === "netq-next") { (take.resp.netqText ||= {})[s.id] = $("#netq-text").value.trim().slice(0, 2000); advance(); return; }
  if (act === "work-next") { B.WORK_SAMPLES.forEach((w) => { const v = $("#work-" + w.id).value.trim(); if (v) take.resp.work[w.id] = v; }); advance(); return; }
  if (act === "private-next") { take.resp.privateNote = $("#priv").value; advance(); return; }
  if (act === "ref-ready") { take.resp.ready = +el.dataset.i; el.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === el)); clearTimeout(advanceTimer); advanceTimer = setTimeout(advance, 220); return; }
  if (act === "ref-gift") {
    const g = el.dataset.g, arr = take.resp.gifts;
    if (arr.includes(g)) take.resp.gifts = arr.filter((x) => x !== g); else if (arr.length < 5) arr.push(g); else toast("Choose up to five");
    saveDraft(); render(); return;
  }
  if (act === "ref-finish") { take.resp.strength = $("#rt-strength").value.trim(); take.resp.growth = $("#rt-growth").value.trim(); take.resp.confidential = $("#rt-conf").value.trim(); advance(); return; }
  if (act === "copy-code") { if (doneCode) copy(doneCode, el); return; }
  if (act === "see-report") { const id = take.caseId, tab = take.role; take = null; go({ name: "case", id, tab, personal: tab }); return; }
});

document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset?.act === "note") { const c = getCase(view.id); const notes = notesFor(c); notes.text[el.dataset.q] = el.value; saveNotesFor(c, notes); return; }
  if (L.LIVE && T.onInput(el)) return;
});

document.addEventListener("submit", (e) => {
  e.preventDefault();
  if (L.LIVE) { T.onSubmit(e.target).then((handled) => { if (!handled) submitLocal(e); }); return; }
  submitLocal(e);
});
function submitLocal(e) {
  if (e.target.id === "refjoin") {
    const name = $("#rj-name").value.trim(); if (!name) return;
    const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
    L.joinReference(view.refToken, name).then((tok) => {
      if (!tok) { toast("This reference link is no longer open."); btn.disabled = false; return; }
      try { localStorage.setItem("pl.ref." + view.refToken, tok); } catch {}
      location.hash = "#/t/" + tok;
    }).catch(() => { toast("Couldn't start. Check your connection and try again."); btn.disabled = false; });
    return;
  }
  if (e.target.id === "newcase") {
    const pn = $("#f-pn").value.trim(), m = $("#f-m").value === "1", sn = $("#f-sn").value.trim();
    if (!pn) return;
    const c = { id: uid(), label: m && sn ? `${first(pn)} & ${sn}` : pn, planterName: pn, spouseName: m ? sn || "Spouse" : "", married: m, city: $("#f-city").value.trim(), network: { name: $("#f-net").value.trim(), signGifts: $("#f-sg").checked }, created: today(), planter: null, spouse: null, refs: [] };
    if (m && sn && pn.split(" ").slice(-1)[0] === sn.split(" ").slice(-1)[0]) c.label = `${first(pn)} & ${sn}`;
    db.cases.unshift(c); save();
    go({ name: "case", id: c.id, tab: "status" });
  }
  if (e.target.id === "welcome") {
    const R = take.resp;
    if (!$("#w-consent").checked) return;
    R.meta.name = $("#w-name").value.trim() || R.meta.name;
    if (take.role === "reference") { R.meta.relationship = $("#w-rel").value; R.meta.years = $("#w-years").value.trim(); }
    if (take.role === "reference") take.key = `${take.caseId}:reference:${R.meta.name}`;
    R.meta.consentedAt = today();
    advance();
  }
}
document.addEventListener("change", (e) => { if (L.LIVE) T.onChange(e.target); });

document.addEventListener("keydown", (e) => {
  if (view.name !== "take" || !take) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
  const s = take.steps[take.i];
  if (/^[0-5]$/.test(e.key)) {
    const btn = $(`#app [data-act="ans"][data-v="${e.key}"]`) || (s.t === "fact" ? $(`#app [data-act="fact"][data-i="${+e.key - 1}"]`) : null) || (s.t === "refReady" ? $(`#app [data-act="ref-ready"][data-i="${+e.key - 1}"]`) : null);
    if (btn) { e.preventDefault(); btn.click(); }
  } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
    const b = $('#app [data-act="back"]'); if (b) { e.preventDefault(); b.click(); }
  } else if (e.key === "Enter" && s.t === "intro") { e.preventDefault(); advance(); }
});

T.init({ esc, first, go, render: () => render(), toast, copy, progressBar, ago, roleName, view: () => view, SAMPLES, scoreCase, safeUrl });

// ---------------- live routing ----------------
async function route() {
  const h = location.hash || "";
  let m;
  if ((m = h.match(/^#\/t\/([a-f0-9]{20,})$/))) {
    const token = m[1];
    go({ name: "message", kicker: "Plumbline", title: "Opening your assessment…", text: "One moment." });
    try {
      const data = await L.openToken(token);
      if (!data) { go({ name: "message", title: "That link isn't working", text: "Check that you copied the whole link, or ask your network leader to send it again." }); return; }
      const p = data.participant;
      if (p.status === "finished") {
        if (p.role === "reference") { go({ name: "message", kicker: "Finished", title: "Thank you", text: "Your answers are in. You can close this page." }); return; }
        const rep = await L.report(token);
        if (rep?.released) { go({ name: "myreport", report: rep }); return; }
        go({ name: "message", kicker: "Finished and sealed", title: `Thank you, ${first(p.name)}.`, text: "Your network leader can see that you finished. After you meet, your personal report will appear at this same link." });
        return;
      }
      startTakeLive(token, data);
    } catch { go({ name: "message", title: "We couldn't reach Plumbline", text: "Check your connection and reload this page. Your answers so far are saved." }); }
    return;
  }
  if ((m = h.match(/^#\/join\/([a-f0-9]{20,})$/))) {
    const token = m[1];
    try { const info = await L.inviteInfo(token); go({ name: "teamjoin", token, info }); }
    catch { go({ name: "message", title: "We couldn't reach Plumbline", text: "Check your connection and reload this page." }); }
    return;
  }
  if ((m = h.match(/^#\/case\/([0-9a-f-]{36})$/))) { go({ name: "case", id: m[1], after: m[1] }); return; }
  if ((m = h.match(/^#\/(privacy|terms|about)$/))) { go({ name: m[1] }); return; }
  if ((m = h.match(/^#\/r\/([a-f0-9]{20,})$/))) {
    const refToken = m[1];
    let mine = null; try { mine = localStorage.getItem("pl.ref." + refToken); } catch {}
    if (mine) { location.hash = "#/t/" + mine; return; }
    try {
      const rc = await L.refCase(refToken);
      if (!rc) { go({ name: "message", title: "That link isn't working", text: "Ask the person who sent it for a new one." }); return; }
      go({ name: "refjoin", refToken, refCase: rc });
    } catch { go({ name: "message", title: "We couldn't reach Plumbline", text: "Check your connection and reload this page." }); }
    return;
  }
}
if (L.LIVE) {
  L.onChange((why) => {
    if (why === "save") { const el = $("#savestate"); if (el) el.textContent = saveLabel(); return; }
    if (why === "auth" && L.state.session && view.name === "home" && !location.hash) { go({ name: "leader" }); return; }
    if (why === "auth" && view.name === "teamjoin") { render(); return; }
    if (view.name === "leader" || view.name === "settings" || (view.name === "case" && (view.tab === "status" || !getCase(view.id)?.planter || why === "case"))) {
      if (view.name === "case" && why === "progress" && view.tab !== "status") return;
      const active = document.activeElement; if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) && why === "progress") return;
      render();
    }
  });
  window.addEventListener("hashchange", route);
  window.addEventListener("beforeunload", (e) => { if (take?.token && L.saveStatus() !== "saved") { L.flush(); e.preventDefault(); e.returnValue = ""; } });
  render();
  L.initAuth().then(() => {
    const qs = new URLSearchParams(location.search);
    const join = qs.get("join"), caseId = qs.get("case");
    if (qs.has("code") || join || caseId) history.replaceState(null, "", location.pathname + (join ? "#/join/" + join : caseId ? "#/case/" + caseId : location.hash));
    if (/^#\/(t|r|join|case|privacy|terms|about)/.test(location.hash)) route();
    else if (L.state.session && qs.has("code")) go({ name: "leader" });
    else render();
  });
} else {
  render();
}
