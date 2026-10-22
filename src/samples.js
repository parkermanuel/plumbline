// Sample cases for demo and testing. Answers are generated from target levels with seeded noise.
import { SCALES, SPOUSE_SCALES, SPOUSE_SEES, COUPLE_AREAS, WIRING, GIFTS, FIVEFOLD_BLOCKS, SCENARIOS, CANDOR, BOGUS, SAFETY, BELIEFS, FACTS, REF_ITEMS } from "./bank.js";

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const clamp = (v) => Math.max(1, Math.min(5, Math.round(v)));

function likertFor(scales, levels, R, base = 3.8) {
  const out = {};
  Object.entries(scales).forEach(([k, sc]) => {
    const lvl = levels[k] ?? base;
    sc.items.forEach((it) => {
      const v = clamp(lvl + (R() - 0.5) * 1.4);
      out[it.id] = it.rev ? 6 - v : v;
    });
  });
  return out;
}

function makePerson({ seed, scales, levels, base, wiring, giftsTop = [], fivefold = "AETSP", scen = 0.8, candor = 0, facts = {}, couple = {}, coupleBase = 4, beliefs = true, pageFast = 0 }) {
  const R = rng(seed);
  const likert = likertFor(scales, levels, R, base);
  CANDOR.forEach((c, i) => { const ideal = i < candor; likert[c.id] = c.idealized === "agree" ? (ideal ? 5 : 2) : (ideal ? 1 : 4); });
  BOGUS.forEach((b) => (likert[b.id] = 1));
  const w = {};
  WIRING.forEach((d) => { const t = wiring?.[d.id] ?? 3; w[d.id] = d.items.map(() => clamp(t + (R() - 0.5) * 1.2)); });
  const g = {};
  GIFTS.forEach((x) => { const t = giftsTop.includes(x.id) ? 4.6 - giftsTop.indexOf(x.id) * 0.15 : 2.2 + R() * 1.4; g[x.id] = x.items.map(() => clamp(t + (R() - 0.5) * 0.8)); });
  const order = fivefold.split("");
  const ff = FIVEFOLD_BLOCKS.map((_, i) => ({ most: R() < 0.75 ? order[0] : order[1], least: R() < 0.7 ? order[4] : order[3] }));
  const sc = {};
  SCENARIOS.forEach((s) => {
    const ranked = s.options.map((o, i) => ({ i, k: o.k })).sort((a, b) => b.k - a.k);
    sc[s.id] = R() < scen ? { best: ranked[0].i, worst: ranked[ranked.length - 1].i } : { best: ranked[1].i, worst: ranked[2].i };
  });
  const c = {};
  COUPLE_AREAS.forEach((a) => a.items.forEach((it) => { const t = couple[it.id] ?? couple[a.id] ?? coupleBase; const v = clamp(t + (R() - 0.5) * 0.9); c[it.id] = it.rev ? 6 - v : v; }));
  const bel = Object.fromEntries(BELIEFS.map((b) => [b.id, beliefs === true ? true : !beliefs.includes(b.id)]));
  const pageTimes = pageFast ? { p1: { ms: 4000, n: 5 }, p2: { ms: 5000, n: 5 } } : { p1: { ms: 25000, n: 5 } };
  return { likert, wiring: w, gifts: g, fivefold: ff, scenarios: sc, couple: c, beliefs: bel, facts, meta: { pageTimes } };
}

function factIdx(map) {
  const out = {};
  Object.entries(map).forEach(([id, t]) => {
    const q = FACTS.find((f) => f.id === id);
    out[id] = q.multi ? t.map((x) => q.opts.findIndex((o) => o.t === x)) : q.opts.findIndex((o) => o.t === t);
  });
  return out;
}

function makeRef(seed, { name, relationship, years, level, follow, ready, gifts, strength, growth, confidential = "", skip = [] }) {
  const R = rng(seed);
  const items = {};
  REF_ITEMS.forEach((it) => { items[it.id] = skip.includes(it.scale) ? 0 : clamp((level[it.scale] ?? level._ ?? 4) + (R() - 0.5) * 1.1); });
  return { meta: { name, relationship, years }, items, follow, ready, gifts, strength, growth, confidential };
}

function spouseSees(seed, level) {
  const R = rng(seed);
  return Object.fromEntries(SPOUSE_SEES.map((it) => [it.id, clamp((level[it.scale] ?? level._ ?? 4) + (R() - 0.5))]));
}

// ---------- 1. Marcus & Elena Rivera: strong, ready ----------
const rivera = () => {
  const P = makePerson({ seed: 11, scales: SCALES, base: 4.3, levels: { systems: 3.4, money: 3.8, rhythms: 3.9 },
    wiring: { pace: 4.2, people: 4.4, drive: 3.8, structure: 2.4, decide: 2.6 }, giftsTop: ["leadership", "evangelism", "faith", "exhortation", "teaching"], fivefold: "AETSP", scen: 0.9,
    facts: factIdx({ edu: "Master's (MDiv, MA or similar)", years: "6–10", role: "Associate or executive pastor", teamsize: "76–200", led: "3–5", raised: "$50,000–$150,000", training: ["A planting residency or internship", "Evangelism training"], coach: "Yes, meeting regularly", peers: "Yes, at least monthly", sending: "Yes, committed", core: "11–25", debt: "Some, and it's manageable", funding: "Fully funded salary", launch: "6–12 months" }), coupleBase: 4.4 });
  P.meta = { ...P.meta, name: "Marcus Rivera", married: true, spouseName: "Elena", city: "Denver, CO", network: "Front Range Planting Network" };
  P.work = { ws_vision: "https://example.com/vision", ws_sermon: "https://example.com/sermon" };
  const S = makePerson({ seed: 12, scales: SPOUSE_SCALES, base: 4.3, levels: { s_support: 3.7 }, wiring: { pace: 2.8, people: 3.4, drive: 2.6, structure: 4.1, decide: 3.6 }, giftsTop: ["hospitality", "administration", "mercy", "shepherding", "intercession"], fivefold: "STPEA", coupleBase: 4.3, couple: { ct3: 3.6 } });
  S.meta = { ...S.meta, name: "Elena Rivera" };
  S.spouseSees = spouseSees(13, { _: 4.3, rhythms: 3.7 });
  S.safety = { sf1: 5, sf2: 5, sf3: 1 };
  S.guess = {}; P.guess = {};
  COUPLE_AREAS.forEach((a) => a.items.filter((i) => i.guess).forEach((i) => { P.guess[i.id] = S.couple[i.id]; S.guess[i.id] = P.couple[i.id]; }));
  P.guess.ct1 = 5;
  const refs = [
    makeRef(21, { name: "Pastor Dan Whitfield", relationship: "Sending or supervising pastor", years: "6", level: { _: 4.4, systems: 3.5 }, follow: 5, ready: 0, gifts: ["leadership", "evangelism", "teaching"], strength: "Marcus has a rare ability to rally people around a vision and then actually develop them. Half our current leaders came through his groups.", growth: "He moves fast; he needs a strong ops partner so details don't fall through." }),
    makeRef(22, { name: "Jordan Ellis", relationship: "Ministry peer", years: "4", level: { _: 4.3 }, follow: 4, ready: 0, gifts: ["leadership", "faith"], strength: "Genuinely loves people far from God. Our softball league knows him by name.", growth: "Sometimes says yes to too much." }),
    makeRef(23, { name: "Tasha Greene", relationship: "Someone they've led", years: "3", level: { _: 4.5 }, follow: 5, ready: 0, gifts: ["exhortation", "evangelism"], strength: "He believed in me before I did. I lead a group of 20 now because of him.", growth: "Follow-up on emails." }),
    makeRef(24, { name: "Chris Patel", relationship: "Friend outside the church", years: "5", level: { _: 4.2 }, follow: 4, ready: 0, gifts: ["exhortation"], strength: "Honest, generous, the guy everyone calls when something goes wrong.", growth: "Rest. He doesn't." , skip: ["comms", "money", "develop"] }),
  ];
  return { id: "rivera", label: "Marcus & Elena Rivera", planterName: "Marcus Rivera", spouseName: "Elena Rivera", married: true, city: "Denver, CO", sample: true, created: "2026-10-01", network: { name: "Front Range Planting Network", signGifts: true }, planter: P, spouse: S, refs };
};

// ---------- 2. Josh & Hannah Kim: ready with conditions ----------
const kim = () => {
  const P = makePerson({ seed: 31, scales: SCALES, base: 4.0, levels: { rhythms: 2.7, load: 3.2, vision: 4.6, drive: 4.6, team: 3.4, develop: 3.0, conflict: 2.8, humility: 3.4, evangelism: 3.4, expect: 2.9, family: 3.3 },
    wiring: { pace: 4.7, people: 3.9, drive: 4.6, structure: 2.2, decide: 2.2 }, giftsTop: ["apostleship", "leadership", "faith", "teaching", "wisdom"], fivefold: "APTES", scen: 0.65, candor: 2,
    facts: factIdx({ edu: "Some seminary", years: "3–5", role: "Ministry director", teamsize: "26–75", led: "1–2", raised: "$10,000–$50,000", training: ["A planting boot camp or course"], coach: "Identified, not started", peers: "Occasionally", sending: "In conversation", core: "1–10", debt: "Some, and it's manageable", funding: "Bivocational by choice", launch: "Within 6 months" }), coupleBase: 4.0, couple: { ct1: 4.6, ct2: 4.0, cr3: 3.8 } });
  P.meta = { ...P.meta, name: "Josh Kim", married: true, spouseName: "Hannah", city: "Boulder, CO", network: "Front Range Planting Network" };
  P.work = { ws_vision: "https://example.com/vision2" };
  const S = makePerson({ seed: 32, scales: SPOUSE_SCALES, base: 3.8, levels: { s_support: 2.6, s_health: 3.2, s_partner: 3.6 }, wiring: { pace: 2.4, people: 2.3, drive: 2.6, structure: 4.2, decide: 4.0 }, giftsTop: ["mercy", "helps", "intercession", "knowledge", "giving"], fivefold: "STPEA", coupleBase: 3.9, couple: { ct1: 2.2, ct2: 2.6, cr3: 2.0, cs1: 2.4 } });
  S.meta = { ...S.meta, name: "Hannah Kim" };
  S.spouseSees = spouseSees(33, { _: 4.0, rhythms: 2.3, family: 2.8, control: 3.2, humility: 3.0 });
  S.safety = { sf1: 5, sf2: 4, sf3: 1 };
  S.privateNote = "I'm in. I really am. I just need him to hear that I can't do six nights a week again like we did at our last church.";
  S.guess = {}; P.guess = {};
  COUPLE_AREAS.forEach((a) => a.items.filter((i) => i.guess).forEach((i) => { P.guess[i.id] = clamp((S.couple[i.id] ?? 4) + 1.5); S.guess[i.id] = P.couple[i.id]; }));
  const refs = [
    makeRef(41, { name: "Pastor Mike Alvarez", relationship: "Sending or supervising pastor", years: "4", level: { _: 4.0, rhythms: 2.5, conflict: 2.8, develop: 3.1, humility: 3.0 }, follow: 4, ready: 1, gifts: ["leadership", "apostleship"], strength: "A pioneer. Built our college ministry from 8 to 140 in two years.", growth: "He leads by doing everything himself. He needs to learn to develop leaders and slow down for his family." }),
    makeRef(42, { name: "Sam Ortiz", relationship: "Ministry peer", years: "3", level: { _: 3.9, rhythms: 2.6, control: 3.2 }, follow: 3, ready: 1, gifts: ["leadership", "teaching"], strength: "Visionary, great communicator.", growth: "Can steamroll people in meetings when he's excited about an idea." }),
    makeRef(43, { name: "Ava Brooks", relationship: "Someone they've led", years: "2", level: { _: 4.1, develop: 3.0 }, follow: 4, ready: 0, gifts: ["apostleship", "faith"], strength: "Huge faith. He makes you believe it can happen.", growth: "Sometimes I didn't know what he wanted from me." }),
  ];
  return { id: "kim", label: "Josh & Hannah Kim", planterName: "Josh Kim", spouseName: "Hannah Kim", married: true, city: "Boulder, CO", sample: true, created: "2026-10-09", network: { name: "Front Range Planting Network", signGifts: true }, planter: P, spouse: S, refs };
};

// ---------- 3. Ryan & Brooke Holland: pause & talk ----------
const holland = () => {
  const P = makePerson({ seed: 51, scales: SCALES, base: 3.7, levels: { load: 2.2, rhythms: 2.4, partnership: 3.0, family: 2.6, comms: 4.6, vision: 4.2, unchurched: 2.6, evangelism: 2.4, money: 2.4, expect: 2.3 },
    wiring: { pace: 4.4, people: 4.6, drive: 4.2, structure: 2.0, decide: 1.8 }, giftsTop: ["teaching", "exhortation", "leadership", "prophecy", "knowledge"], fivefold: "TPASE", scen: 0.5, candor: 4,
    facts: factIdx({ edu: "Bachelor's in Bible or ministry", years: "6–10", role: "Associate or executive pastor", teamsize: "26–75", led: "None", raised: "I haven't raised money", training: ["None yet"], coach: "Not yet", peers: "Not yet", sending: "Not yet", core: "None yet", debt: "Heavy, and it's a real pressure", funding: "Not sure yet", launch: "Within 6 months" }), coupleBase: 3.6, couple: { cp1: 4.8, cmo1: 4.0, cmo2: 4.2, ct1: 4.4 } });
  P.meta = { ...P.meta, name: "Ryan Holland", married: true, spouseName: "Brooke", city: "Phoenix, AZ", network: "Desert Church Multiplication" };
  P.work = { ws_sermon: "https://example.com/sermon3" };
  const S = makePerson({ seed: 52, scales: SPOUSE_SCALES, base: 3.2, levels: { s_call: 2.0, s_partner: 2.6, s_health: 2.5, s_ready: 2.2 }, wiring: { pace: 2.2, people: 2.8, drive: 2.2, structure: 4.4, decide: 3.8 }, giftsTop: ["helps", "mercy", "craftsmanship", "giving", "hospitality"], fivefold: "SPTEA", coupleBase: 3.2, couple: { cp1: 2.0, cp3: 2.0, cmo1: 2.0, cmo2: 1.8, cmo3: 2.0, ct1: 2.0, cs3: 2.4 } });
  S.meta = { ...S.meta, name: "Brooke Holland" };
  S.spouseSees = spouseSees(53, { _: 3.4, rhythms: 2.0, family: 2.2, control: 2.8, humility: 2.6, call: 4.0 });
  S.safety = { sf1: 4, sf2: 3, sf3: 1 };
  S.privateNote = "Ryan is gifted and I believe in him. But we haven't paid off the debt from our last move, and I don't think he's heard me on that. I'm scared to say no to God, and I'm scared to say yes.";
  S.guess = {}; P.guess = {};
  COUPLE_AREAS.forEach((a) => a.items.filter((i) => i.guess).forEach((i) => { P.guess[i.id] = 5; S.guess[i.id] = clamp((P.couple[i.id] ?? 4)); }));
  const refs = [
    makeRef(61, { name: "Pastor Grant Lee", relationship: "Sending or supervising pastor", years: "5", level: { _: 3.6, comms: 4.7, rhythms: 2.2, family: 2.6, evangelism: 2.4, unchurched: 2.4, money: 2.4, disciple: 2.8, develop: 3.0, partnership: 2.8 }, follow: 3, ready: 2, gifts: ["teaching", "exhortation"], strength: "One of the best communicators I've worked with.", growth: "Ryan is running on fumes. I'd want to see him healthy and debt-free before he plants.", confidential: "His wife has quietly told my wife she isn't sure about this." }),
    makeRef(62, { name: "Leah Morgan", relationship: "Someone they've led", years: "3", level: { _: 3.5, comms: 4.6, unchurched: 2.6, money: 2.6 }, follow: 3, ready: 1, gifts: ["teaching", "leadership"], strength: "His teaching changed how I read the Bible.", growth: "He's hard to reach. Always busy." }),
    makeRef(63, { name: "Ben Carter", relationship: "Ministry peer", years: "2", level: { _: 3.5, control: 2.8, humility: 2.9 }, follow: 2, ready: 2, gifts: ["teaching"], strength: "Talented preacher.", growth: "Gets defensive when challenged." }),
  ];
  return { id: "holland", label: "Ryan & Brooke Holland", planterName: "Ryan Holland", spouseName: "Brooke Holland", married: true, city: "Phoenix, AZ", sample: true, created: "2026-10-14", network: { name: "Desert Church Multiplication", signGifts: true }, planter: P, spouse: S, refs };
};

export const SAMPLE_CASES = () => [rivera(), kim(), holland()];
