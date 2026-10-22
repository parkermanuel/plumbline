// Scoring engine. Pure functions: answers in, results out. No UI.
import {
  PILLARS, SCALES, SPOUSE_SCALES, SPOUSE_SEES, COUPLE_AREAS, WIRING, GIFTS, SIGN_GIFTS, FIVEFOLD,
  FIVEFOLD_BLOCKS, SCENARIOS, CANDOR, BOGUS, CONSISTENCY_PAIRS, SAFETY, BELIEFS, FACTS, REF_ITEMS,
} from "./bank.js";

export const BANDS = [
  { id: "strength", name: "Strength", min: 80, letter: "A", color: "var(--band-a)" },
  { id: "solid", name: "Solid", min: 65, letter: "B", color: "var(--band-b)" },
  { id: "developing", name: "Developing", min: 50, letter: "C", color: "var(--band-c)" },
  { id: "growth", name: "Growth Area", min: 0, letter: "D", color: "var(--band-d)" },
];
const FACT_Q = {
  debt: "Walk me through your household finances and your plan for the debt before launch.",
  led: "Tell me about the people far from God you're praying for and spending time with right now.",
  funding: "What's your funding plan for the first three years, and who has helped you build it?",
};
export const NON_NEGOTIABLE = ["integrity", "devotion", "load", "partnership"];
export const OUTCOMES = {
  ready: { name: "Ready", tone: "a", line: "No concerns surfaced. Strengths across the profile. Confirm in the interview." },
  conditions: { name: "Ready with Conditions", tone: "b", line: "Ready to move forward with a coach working on the named growth areas." },
  development: { name: "Development Needed", tone: "c", line: "Real promise, with specific concerns to address first. Set a growth plan and a date to reassess." },
  pause: { name: "Pause & Talk", tone: "d", line: "Something important needs a careful conversation before any decision. See the concerns." },
};

export const pct = (mean) => Math.round(((mean - 1) / 4) * 100);
export const bandOf = (p) => (p == null ? null : BANDS.find((b) => p >= b.min));
const rev = (v) => 6 - v;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const rank = (b) => BANDS.length - BANDS.indexOf(b); // strength 4 .. growth 1

export function scoreScale(scale, answers) {
  const vals = scale.items.map((it) => {
    const v = answers[it.id];
    if (v == null) return null;
    return it.rev ? rev(v) : v;
  }).filter((v) => v != null);
  if (vals.length < Math.min(3, scale.items.length)) return null;
  const mean = avg(vals);
  const p = pct(mean);
  return { mean, pct: p, band: bandOf(p), n: vals.length };
}

// ---------- validity ----------
export function validity(r, candorItems = CANDOR) {
  const a = r.likert || {};
  const ideal = candorItems.filter((c) => {
    const v = a[c.id];
    if (v == null) return false;
    return c.idealized === "agree" ? v >= 4 : v <= 2;
  }).length;
  const bogus = BOGUS.filter((b) => (a[b.id] ?? 0) >= 4).length;
  const pairs = CONSISTENCY_PAIRS.filter(([x, y]) => a[x] != null && a[y] != null);
  const inconsistent = pairs.filter(([x, y]) => Math.abs(a[x] - rev(a[y])) >= 2).length;
  const pages = Object.values(r.meta?.pageTimes || {});
  const fast = pages.filter((p) => p.n >= 4 && p.ms / p.n < 2000).length;
  let points = 0;
  if (bogus) points += 2;
  if (pairs.length && inconsistent / pairs.length > 1 / 3) points += 2; else if (inconsistent) points += 1;
  if (fast >= 2) points += 2; else if (fast === 1) points += 1;
  const quality = points >= 4 ? "Retake recommended" : points >= 2 ? "Some concerns" : "Good";
  const idealized = ideal >= 3;
  const notes = [];
  if (idealized) notes.push(`${ideal} of ${candorItems.length} candor items were answered in an idealized way. Answers may be rosier than real life, so lean on references and the interview.`);
  if (bogus) notes.push("Agreed with an item that can't be literally true. They may have been rushing.");
  if (inconsistent) notes.push(`${inconsistent} of ${pairs.length} matched item pairs were answered inconsistently.`);
  if (fast) notes.push(`${fast} section${fast > 1 ? "s were" : " was"} answered faster than about 2 seconds per item.`);
  return { quality, idealized, candor: ideal, candorOf: candorItems.length, bogus, inconsistent, pairs: pairs.length, fast, notes };
}

// ---------- wiring / gifts / fivefold ----------
export function wiring(r) {
  const w = r.wiring || {};
  return WIRING.map((d) => {
    const vals = (w[d.id] || []).filter((v) => v != null);
    if (!vals.length) return { ...d, pos: null };
    const m = avg(vals);
    const pos = Math.round(((m - 1) / 4) * 100);
    const lean = pos <= 35 ? d.left : pos >= 65 ? d.right : "Balanced";
    const strength = Math.abs(pos - 50) >= 35 ? "Strongly " : "";
    return { ...d, pos, lean, label: lean === "Balanced" ? `Balanced ${d.left.toLowerCase()} and ${d.right.toLowerCase()}` : strength + lean };
  });
}

export function gifts(r, { signGifts = true } = {}) {
  const g = r.gifts || {};
  const list = GIFTS.filter((x) => signGifts || !SIGN_GIFTS.includes(x.id)).map((x) => {
    const vals = (g[x.id] || []).filter((v) => v != null);
    const p = vals.length ? pct(avg(vals)) : null;
    return { id: x.id, name: x.name, ref: x.ref, pct: p, tier: p == null ? null : p >= 80 ? "Primary" : p >= 60 ? "Secondary" : "Less evident" };
  }).filter((x) => x.pct != null).sort((a, b) => b.pct - a.pct);
  return { list, top: list.slice(0, 5) };
}

export function fivefold(r) {
  const picks = r.fivefold || [];
  const sums = Object.fromEntries(FIVEFOLD.map((f) => [f.id, 0]));
  let blocks = 0;
  picks.forEach((p) => {
    if (!p || !p.most || !p.least) return;
    blocks++;
    FIVEFOLD.forEach((f) => { sums[f.id] += f.id === p.most ? 2 : f.id === p.least ? 0 : 1; });
  });
  if (!blocks) return null;
  const max = blocks * 2;
  const list = FIVEFOLD.map((f) => ({ ...f, pct: Math.round((sums[f.id] / max) * 100) })).sort((a, b) => b.pct - a.pct);
  return { list, primary: list[0], secondary: list[1], low: list[list.length - 1] };
}

// ---------- scenarios ----------
export function scenarios(r, married = true) {
  const s = r.scenarios || {};
  let pts = 0, max = 0;
  const detail = SCENARIOS.filter((sc) => married || !sc.married).map((sc) => {
    const a = s[sc.id];
    if (!a || a.best == null || a.worst == null) return { ...sc, answered: false };
    const kb = sc.options[a.best].k, kw = sc.options[a.worst].k;
    const got = (kb - 1) / 3 + (4 - kw) / 3;
    pts += got; max += 2;
    const bestKey = sc.options.findIndex((o) => o.k === 4);
    return { ...sc, answered: true, best: a.best, worst: a.worst, bestKey, score: Math.round((got / 2) * 100) };
  });
  if (!max) return null;
  const p = Math.round((pts / max) * 100);
  return { pct: p, band: bandOf(p), detail, misses: detail.filter((d) => d.answered && d.score < 50) };
}

// ---------- facts ----------
export function facts(r) {
  const f = r.facts || {};
  let pts = 0, max = 0;
  const rows = [], flags = [];
  FACTS.forEach((q) => {
    const a = f[q.id];
    if (a == null) return;
    if (q.multi) {
      const chosen = (Array.isArray(a) ? a : []).map((i) => q.opts[i]);
      const got = Math.min(4, chosen.reduce((x, o) => x + (o?.pts || 0), 0));
      pts += got; max += 4;
      rows.push({ id: q.id, q: q.q, a: chosen.map((o) => o.t).join(", ") || "None" });
    } else {
      const o = q.opts[a];
      if (!o) return;
      if (!o.info) { pts += o.pts; max += 4; }
      rows.push({ id: q.id, q: q.q, a: o.t, flag: o.flag });
      if (o.flag) flags.push({ id: q.id, level: o.flag, q: q.q, a: o.t, ft: o.ft });
    }
  });
  const p = max ? Math.round((pts / max) * 100) : null;
  return { pct: p, band: bandOf(p), rows, flags };
}

// ---------- references (360) ----------
export function references(refs = [], spouseSees = null) {
  const done = refs.filter((x) => x && x.items && Object.values(x.items).some((v) => v > 0));
  const byScale = {};
  const add = (scale, v, group) => {
    if (!v) return; // 0 or null = not observed
    const b = (byScale[scale] ||= { vals: [], groups: {}, refN: 0 });
    b.vals.push(v);
    if (group !== "Spouse") b.refN++;
    (b.groups[group] ||= []).push(v);
  };
  done.forEach((ref) => REF_ITEMS.forEach((it) => add(it.scale, ref.items[it.id], ref.meta?.relationship || "Reference")));
  if (spouseSees) SPOUSE_SEES.forEach((it) => add(it.scale, spouseSees[it.id], "Spouse"));
  const scales = {};
  Object.entries(byScale).forEach(([k, v]) => {
    const p = pct(avg(v.vals));
    const spread = Math.max(...v.vals) - Math.min(...v.vals);
    scales[k] = { pct: p, band: bandOf(p), n: v.vals.length, refN: v.refN, spread };
  });
  const follow = done.map((x) => x.follow).filter(Boolean);
  const ready = done.map((x) => x.ready).filter((x) => x != null);
  const giftsSeen = {};
  done.forEach((x) => (x.gifts || []).forEach((g) => (giftsSeen[g] = (giftsSeen[g] || 0) + 1)));
  return {
    n: done.length, scales,
    follow: follow.length ? { avg: avg(follow), n: follow.length } : null,
    ready, giftsSeen,
    quotes: done.map((x) => ({ name: x.meta?.name, rel: x.meta?.relationship, years: x.meta?.years, strength: x.strength, growth: x.growth, confidential: x.confidential })),
  };
}

export function gaps(self, others) {
  const out = { blind: [], hidden: [], agreedStrength: [], agreedGrowth: [] };
  Object.entries(self).forEach(([k, s]) => {
    const o = others.scales[k];
    if (!s || !o || o.refN < 2) return;
    const d = s.pct - o.pct;
    const rd = rank(s.band) - rank(o.band);
    const row = { scale: k, name: SCALES[k]?.name, self: s.pct, others: o.pct, n: o.n, diff: d };
    if (rd >= 1 && d >= 12) out.blind.push(row);
    else if (rd <= -1 && d <= -12) out.hidden.push(row);
    else if (s.band.id === "strength" && o.band.id === "strength") out.agreedStrength.push(row);
    else if (rank(s.band) <= 2 && rank(o.band) <= 2) out.agreedGrowth.push(row);
  });
  out.blind.sort((a, b) => b.diff - a.diff);
  out.hidden.sort((a, b) => a.diff - b.diff);
  return out;
}

// ---------- couple ----------
export function couple(p, s) {
  if (!p?.couple || !s?.couple) return null;
  const val = (it, v) => (v == null ? null : it.rev ? rev(v) : v);
  const areas = COUPLE_AREAS.map((area) => {
    const items = area.items.map((it) => {
      const a = val(it, p.couple[it.id]), b = val(it, s.couple[it.id]);
      if (a == null || b == null) return { ...it, status: "missing" };
      let status;
      if (a >= 4 && b >= 4) status = "agreed";
      else if (a <= 2 && b <= 2) status = "shared";
      else if (Math.abs(a - b) >= 2 || (a >= 4 && b <= 2) || (b >= 4 && a <= 2)) status = "gap";
      else status = "mixed";
      return { ...it, planter: p.couple[it.id], spouse: s.couple[it.id], a, b, status };
    });
    const scored = items.filter((i) => i.status !== "missing");
    const agreed = scored.filter((i) => i.status === "agreed").length;
    const status = !scored.length ? "missing"
      : scored.some((i) => i.status === "shared") ? "shared"
      : scored.some((i) => i.status === "gap") ? "gap"
      : agreed === scored.length ? "united" : "mostly";
    const unity = scored.length ? Math.round(avg(scored.map((i) => {
      const closeness = 1 - Math.abs(i.a - i.b) / 4; // 1 = same answer
      const health = (i.a + i.b - 2) / 8; // 1 = both strongly positive
      return 100 * (0.5 * closeness + 0.5 * health);
    }))) : null;
    return { ...area, items, status, unity, agreed, total: scored.length };
  });
  const all = areas.flatMap((a) => a.items).filter((i) => i.status !== "missing");
  const agreement = all.length ? Math.round((all.filter((i) => i.status === "agreed").length / all.length) * 100) : null;
  const guessRow = (guesser, target, items) => items.map((it) => {
    const g = guesser.guess?.[it.id], t = target.couple?.[it.id];
    if (g == null || t == null) return null;
    const side = (v) => (v >= 4 ? 1 : v <= 2 ? -1 : 0);
    return { id: it.id, t: it.t, guess: g, actual: t, hit: side(g) === side(t) };
  }).filter(Boolean);
  const guessItems = COUPLE_AREAS.flatMap((a) => a.items.filter((i) => i.guess));
  const pg = guessRow(p, s, guessItems), sg = guessRow(s, p, guessItems);
  const know = (rows) => (rows.length ? Math.round((rows.filter((r) => r.hit).length / rows.length) * 100) : null);
  const us = areas.map((a) => a.unity).filter((x) => x != null);
  const unity = us.length ? Math.round(avg(us)) : null;
  return {
    areas, agreement, unity,
    know: { planter: know(pg), spouse: know(sg), planterRows: pg, spouseRows: sg },
    gaps: all.filter((i) => i.status === "gap"), shared: all.filter((i) => i.status === "shared"),
  };
}

// ---------- full case ----------
export function scoreCase(c) {
  const P = c.planter, S = c.spouse;
  const married = c.married != null ? !!c.married : !!P?.meta?.married;
  const signGifts = c.network?.signGifts !== false;
  const out = { married, names: { planter: P?.meta?.name || "Planter", spouse: S?.meta?.name || "Spouse" } };

  // planter scales
  const self = {};
  Object.entries(SCALES).forEach(([k, sc]) => {
    if (sc.married && !married) return;
    if (sc.single && married) return;
    self[k] = scoreScale(sc, P?.likert || {});
  });
  out.scales = self;
  out.pillars = PILLARS.map((pl) => {
    const keys = Object.keys(self).filter((k) => SCALES[k].pillar === pl.id && self[k]);
    const p = keys.length ? Math.round(avg(keys.map((k) => self[k].pct))) : null;
    return { ...pl, pct: p, band: bandOf(p), scales: keys };
  });
  out.validity = P ? validity(P) : null;
  out.wiring = P ? wiring(P) : null;
  out.gifts = P ? gifts(P, { signGifts }) : null;
  out.fivefold = P ? fivefold(P) : null;
  out.scenarios = P ? scenarios(P, married) : null;
  out.facts = P ? facts(P) : null;
  const belief = (v) => (v === true || v === "yes" ? "yes" : v === "no" ? "no" : v === false || v === "unsure" ? "unsure" : null);
  const allBeliefs = [...BELIEFS, ...((c.settings?.beliefs || []).map((x) => ({ ...x, network: true })))];
  out.beliefs = allBeliefs.map((b) => { const a = belief(P?.beliefs?.[b.id]); return { ...b, answer: a, ok: a === "yes", answered: a != null }; });
  out.netq = (c.settings?.questions || []).map((q) => ({ ...q, planter: P?.netq?.[q.id], spouse: S?.netq?.[q.id] }));
  out.work = P?.work || {};

  // spouse
  if (married && S) {
    out.spouse = {};
    Object.entries(SPOUSE_SCALES).forEach(([k, sc]) => (out.spouse[k] = scoreScale(sc, S.likert || {})));
    out.spouseValidity = validity(S, CANDOR.filter((x) => x.id !== "cd1"));
    out.spouseWiring = wiring(S);
    out.spouseGifts = gifts(S, { signGifts });
    out.spouseFivefold = fivefold(S);
    out.couple = couple(P, S);
    const sf = S.safety || {};
    out.safety = SAFETY.some((q) => sf[q.id] != null && (q.concernIf === "low" ? sf[q.id] <= 2 : sf[q.id] >= 3));
    out.privateNote = (S.privateNote || "").trim();
  }

  out.refs = references(c.refs || [], married ? S?.spouseSees : null);
  out.incomplete = [];
  if (married && !S) out.incomplete.push("spouse");
  if (out.refs.n < 2) out.incomplete.push("references");
  out.gaps = gaps(self, out.refs);
  out.flags = buildFlags(out);
  out.outcome = decide(out);
  out.strengths = Object.entries(self).filter(([, v]) => v && v.band.id === "strength").sort((a, b) => b[1].pct - a[1].pct).map(([k]) => k);
  out.growth = Object.entries(self).filter(([, v]) => v && rank(v.band) <= 2).sort((a, b) => a[1].pct - b[1].pct).map(([k]) => k);
  out.interview = interviewGuide(out);
  out.plan = growthPlan(out);
  return out;
}

function buildFlags(o) {
  const F = [];
  const push = (level, area, title, detail, q, probes, critical = false) => F.push({ level, area, title, detail, q, probes, critical });
  Object.entries(o.scales).forEach(([k, v]) => {
    if (!v) return;
    const sc = SCALES[k];
    if (NON_NEGOTIABLE.includes(k)) {
      const pil = PILLARS.find((x) => x.id === sc.pillar).name;
      if (v.band.id === "growth") push("concern", pil, `${sc.name} is a growth area`, sc.growth, sc.q, sc.probes, k === "integrity" || k === "load");
      else if (v.band.id === "developing") push("watch", pil, `${sc.name} is developing`, sc.growth, sc.q, sc.probes);
    }
  });
  o.beliefs.forEach((b) => {
    if (b.answer === "no") push("concern", "Beliefs", "Did not affirm a core belief", `Answered No to: "${b.t}"`, "Help me understand where you land on this, and how you'd teach it.", [], true);
    else if (b.answer === "unsure") push("watch", "Beliefs", "Unsure about a core belief", `Answered Not sure to: "${b.t}"`, "Help me understand where you land on this, and how you'd teach it.", []);
  });
  if (o.facts) o.facts.flags.forEach((f) => push(f.level, "Experience", f.ft || f.q, `${f.q} Answered: ${f.a}.`, FACT_Q[f.id] || null, []));
  if (o.scenarios && o.scenarios.pct < 50) push("watch", "Judgment", "Scenario judgment is developing", "Several scenario choices differed from what experienced planters chose.", "Walk me through how you'd handle one of the scenarios you found hardest.", []);
  if (o.validity?.idealized) push("watch", "Response quality", "Answers may be idealized", o.validity.notes[0], null, []);
  if (o.validity?.quality === "Retake recommended") push("concern", "Response quality", "Answers may not be reliable", `${o.validity.notes.join(" ")} Consider asking for a retake before relying on this report.`, null, [], true);
  else if (o.validity?.quality === "Some concerns") push("watch", "Response quality", "Some answers look rushed or inconsistent", o.validity.notes.filter((n) => !n.includes("candor")).join(" "), null, []);
  if (o.spouse) {
    const sc = o.spouse.s_call;
    if (sc && sc.band.id === "growth") push("concern", "Spouse", "Spouse's personal calling is unclear", SPOUSE_SCALES.s_call.growth, SPOUSE_SCALES.s_call.q, SPOUSE_SCALES.s_call.probes, true);
    else if (sc && sc.band.id === "developing") push("watch", "Spouse", "Spouse's calling is still forming", SPOUSE_SCALES.s_call.growth, SPOUSE_SCALES.s_call.q, SPOUSE_SCALES.s_call.probes);
    const sp = o.spouse.s_partner;
    if (sp && sp.band.id === "growth") push("concern", "Spouse", "Spouse doesn't feel like a partner", SPOUSE_SCALES.s_partner.growth, SPOUSE_SCALES.s_partner.q, SPOUSE_SCALES.s_partner.probes);
    const sh = o.spouse.s_health;
    if (sh && sh.band.id === "growth") push("watch", "Spouse", "Spouse is running low", SPOUSE_SCALES.s_health.growth, SPOUSE_SCALES.s_health.q, SPOUSE_SCALES.s_health.probes);
    [["s_devotion", "Spouse's walk with God is thin right now"], ["s_support", "Spouse's support is thin"], ["s_ready", "Spouse isn't settled on the practical costs"]].forEach(([k, title]) => {
      const v = o.spouse[k];
      if (v && v.band.id === "growth") push("watch", "Spouse", title, SPOUSE_SCALES[k].growth, SPOUSE_SCALES[k].q, SPOUSE_SCALES[k].probes);
    });
  }
  if (o.couple) {
    const sharedAreas = o.couple.areas.filter((a) => a.status === "shared");
    if (sharedAreas.length >= 2) push("concern", "Couple", `Shared concern in ${sharedAreas.length} areas`, `Both answered with concern in: ${sharedAreas.map((a) => a.name).join(", ")}.`, "You both named some concern here. Tell me what's going on and what you've tried.", []);
    else if (sharedAreas.length === 1) push("watch", "Couple", `Shared concern: ${sharedAreas[0].name}`, "Both answered with concern in this area.", "You both named some concern here. Tell me what's going on.", []);
    const callGap = o.couple.areas[0].items.find((i) => i.id === "cp1");
    if (callGap && (callGap.status === "gap" || callGap.status === "shared")) push("concern", "Couple", "Not united on the call to plant", callGap.status === "gap" ? "They answered differently about whether both are called to plant." : "Both answered that they are not both called to plant.", "Tell me how each of you has heard from God about planting.", [], true);
    const KEY = ["ct1", "cmo1", "cmo2", "cr1"];
    const keyGaps = o.couple.gaps.filter((i) => KEY.includes(i.id));
    if (o.couple.gaps.length >= 4 || keyGaps.length) push("watch", "Couple", `${o.couple.gaps.length} gap${o.couple.gaps.length === 1 ? "" : "s"} between their answers`, keyGaps.length ? `Including: ${keyGaps.map((i) => `"${i.t}"`).join(" ")}` : "Several statements were answered differently. See the couple section.", null, []);
  }
  if (o.safety) push("concern", "Confidential", "Spouse safety answer needs follow-up", "A safety item was answered in a concerning way. Leader-only. Do not raise it with the couple together. Talk with the spouse privately or involve a trained counselor.", null, [], true);
  if (o.refs.follow) {
    const f = o.refs.follow.avg;
    if (f <= 2.5) push("concern", "References", "References are hesitant to follow", `Average Follow Test answer is ${f.toFixed(1)} of 5.`, "Your references were hesitant to join your launch team. Why might that be?", []);
    else if (f <= 3.2) push("watch", "References", "References are mixed on following", `Average Follow Test answer is ${f.toFixed(1)} of 5.`, null, []);
  }
  const notYet = o.refs.ready.filter((x) => x === 2).length;
  if (notYet >= 2) push("concern", "References", `${notYet} references said "Not yet"`, "More than one reference doesn't think they're ready now.", null, []);
  o.gaps.blind.filter((b) => ["integrity", "control", "humility", "partnership", "family"].includes(b.scale)).forEach((b) =>
    push("watch", "Blind spot", `Blind spot: ${b.name}`, `Rated themselves ${b.self}, others ${b.others} (${b.n} ratings).`, SCALES[b.scale].q, SCALES[b.scale].probes));
  return F;
}

function decide(o) {
  const concerns = o.flags.filter((f) => f.level === "concern");
  const watches = o.flags.filter((f) => f.level === "watch");
  const dPillars = o.pillars.filter((p) => p.band?.id === "growth").length;
  const cPillars = o.pillars.filter((p) => p.band?.id === "developing").length;
  let key, why;
  const inc = o.incomplete || [];
  if (concerns.some((c) => c.critical) || concerns.length >= 3) {
    key = "pause"; why = concerns.some((c) => c.critical) ? "At least one critical concern (character, current load, beliefs, calling unity, safety or unreliable answers)." : "Three or more concerns.";
  } else if (concerns.length || dPillars >= 2) {
    key = "development"; why = concerns.length ? `${concerns.length} concern${concerns.length > 1 ? "s" : ""} to address first.` : "Two or more pillars are growth areas.";
  } else if (watches.length > 2 || dPillars || cPillars >= 2) {
    key = "conditions"; why = `No concerns. ${watches.length} item${watches.length === 1 ? "" : "s"} to watch${dPillars + cPillars ? ` and ${dPillars + cPillars} pillar${dPillars + cPillars > 1 ? "s" : ""} below Solid` : ""}.`;
  } else {
    key = "ready"; why = "No concerns, few watch items, and every pillar Solid or better.";
  }
  if (inc.length && key === "ready") { key = "conditions"; why = "Can't say Ready yet."; }
  if (inc.length) why += ` Still waiting on ${inc.map((x) => (x === "spouse" ? "the spouse" : "at least 2 references who rated what they've seen")).join(" and ")}.`;
  return { key, ...OUTCOMES[key], why, concerns: concerns.length, watches: watches.length, incomplete: inc };
}

function interviewGuide(o) {
  const pl = [];
  const call = SCALES.call;
  pl.push({ kind: "open", title: "Calling story", q: call.q, probes: call.probes, look: call.look });
  o.strengths.slice(0, 2).forEach((k) => pl.push({ kind: "strength", title: `Confirm a strength: ${SCALES[k].name}`, q: `Your results point to ${SCALES[k].name.toLowerCase()} as a strength. Give me a specific example from the last year.`, probes: ["What did you do personally?", "What happened as a result?"], look: SCALES[k].look }));
  const seen = new Set();
  o.flags.filter((f) => f.q && f.area !== "Spouse" && f.area !== "Couple" && f.area !== "Confidential" && !seen.has(f.q) && seen.add(f.q)).forEach((f) =>
    pl.push({ kind: f.level, title: f.title, q: f.q, probes: f.probes, look: Object.values(SCALES).find((s) => s.q === f.q)?.look }));
  const used = new Set(pl.map((x) => x.q));
  const add = (x) => { if (!used.has(x.q) && pl.length < 9) { pl.push(x); used.add(x.q); } };
  o.gaps.blind.slice(0, 2).forEach((b) => add({ kind: "blind", title: `Blind spot: ${b.name}`, q: SCALES[b.scale].q, probes: SCALES[b.scale].probes, look: SCALES[b.scale].look }));
  o.growth.forEach((k) => add({ kind: "growth", title: `Growth area: ${SCALES[k].name}`, q: SCALES[k].q, probes: SCALES[k].probes, look: SCALES[k].look }));

  const sp = [];
  if (o.spouse) {
    ["s_call", "s_partner", "s_health", "s_support", "s_ready"].forEach((k) => {
      const v = o.spouse[k], sc = SPOUSE_SCALES[k];
      if (k === "s_call" || (v && rank(v.band) <= 2)) sp.push({ kind: v && rank(v.band) <= 2 ? "watch" : "open", title: sc.label, q: sc.q, probes: sc.probes, look: sc.look });
    });
    sp.push({ kind: "open", title: "Anything else", q: "Is there anything you'd want us to know that's hard to say with your spouse in the room?", probes: [], look: "Freedom to speak. Listen more than you talk." });
  }
  const cp = [];
  if (o.couple) {
    [...o.couple.shared, ...o.couple.gaps].slice(0, 5).forEach((i) => cp.push({ kind: i.status === "shared" ? "concern" : "gap", title: i.status === "shared" ? "Shared concern" : "Gap to talk through", q: i.status === "shared" ? `You both answered with some concern on: "${i.t}" Tell me what's going on and what you've tried.` : `You each answered differently on: "${i.t}" Walk me through how each of you sees it, and how you'd decide it together.`, probes: ["What would need to happen for you to see this the same way?"], look: "Listening to each other, no surprises, a plan to close the gap." }));
    if (!cp.length) cp.push({ kind: "open", title: "Unity", q: "Your answers lined up well. Tell me about a decision you made together that you're proud of.", probes: [], look: "Both voices, shared language." });
  }
  return { planter: pl, spouse: sp, couple: cp, timing: { planter: 45, spouse: o.spouse ? 25 : 0, couple: o.couple ? 20 : 0 } };
}

function growthPlan(o) {
  const steps = o.growth.slice(0, 3).map((k) => ({ scale: SCALES[k].name, step: SCALES[k].plan }));
  const extras = [];
  const fact = (id) => o.facts?.rows.find((r) => r.id === id)?.a;
  if (fact("coach") && fact("coach") !== "Yes, meeting regularly") extras.push({ scale: "Coach", step: "Get a coach who has planted, and meet at least monthly (weekly is even better). In Stetzer's research, planters with a coach led churches 12 to 25% larger." });
  if (fact("peers") && fact("peers") !== "Yes, at least monthly") extras.push({ scale: "Peer group", step: "Join a monthly peer group of planters. In the 2007 survivability study, planters in one saw 83% survival compared with 67%." });
  return [...steps, ...extras].slice(0, 5);
}
