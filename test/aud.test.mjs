// Checks each audience file in src/aud/ against the church planting bank: same item ids, every included item has text,
// pillars complete, scenarios well formed, no other tools' names, no "plant" wording left over.
import * as B from "../src/bank.js";
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["staff", "nonprofit", "business"];
let bad = 0;
const fail = (m) => { bad++; console.log("not ok - " + m); };
const words = (o) => JSON.stringify(o);
for (const id of ids) {
  const A = (await import(`../src/aud/${id}.js`)).default;
  const tag = `[${id}]`;
  if (A.id !== id) fail(`${tag} id`);
  for (const k of ["label", "short", "intro"]) if (!A[k]) fail(`${tag} missing ${k}`);
  for (const k of ["person", "Person", "people", "org", "Org", "role", "leader"]) if (!A.words?.[k]) fail(`${tag} words.${k}`);
  for (const p of B.PILLARS) {
    const o = A.pillars?.[p.id];
    if (!o) { fail(`${tag} pillar ${p.id}`); continue; }
    for (const k of ["name", "blurb", "why"]) if (!o[k]) fail(`${tag} pillar ${p.id}.${k}`);
  }
  const allScales = { ...(A.scales || {}), ...(A.faithScales || {}) };
  if (Object.keys(A.scales || {}).length < 18) fail(`${tag} fewer than 18 scales`);
  for (const [k, sc] of Object.entries(allScales)) {
    const base = B.SCALES[k];
    if (!base) { fail(`${tag} unknown scale ${k}`); continue; }
    if (base.married) fail(`${tag} ${k} is a married-only scale`);
    for (const f of ["name", "desc", "strength", "growth", "q", "look", "plan"]) if (!sc[f]) fail(`${tag} ${k}.${f}`);
    if (!Array.isArray(sc.probes) || sc.probes.length < 2) fail(`${tag} ${k}.probes`);
    const want = base.items.map((i) => i.id).sort().join(), got = Object.keys(sc.items || {}).sort().join();
    if (want !== got) fail(`${tag} ${k}.items ids ${got} should be ${want}`);
  }
  for (const k of A.nonNegotiable || []) if (!A.scales[k]) fail(`${tag} non-negotiable ${k} not in scales`);
  if (!(A.scenarios || []).length || A.scenarios.length < 6) fail(`${tag} needs 6+ scenarios`);
  for (const s of A.scenarios || []) {
    if (!s.id || !s.title || !s.text || (s.options || []).length !== 4) fail(`${tag} scenario ${s.id}`);
    const ks = (s.options || []).map((o) => o.k);
    if (!ks.includes(4) || !ks.some((k) => k <= 2)) fail(`${tag} scenario ${s.id} needs a 4 and a 1 or 2`);
  }
  for (const f of A.facts || []) { if (!f.id || !f.q || !(f.opts || []).length) fail(`${tag} fact ${f.id}`); }
  if ((A.facts || []).length < 6) fail(`${tag} needs 6+ facts`);
  for (const [k, t] of Object.entries(A.refItems || {})) if (!allScales[k.replace(/^rf_/, "")] || !t) fail(`${tag} ref item ${k}`);
  for (const k of Object.keys(A.scales || {})) if (!A.refItems?.["rf_" + k] && B.REF_ITEMS.some((r) => r.scale === k)) fail(`${tag} missing ref item rf_${k}`);
  if ((A.refRelationships || []).length < 4) fail(`${tag} refRelationships`);
  if (!A.followTest || (A.followScale || []).length !== 5) fail(`${tag} follow test`);
  if (!(A.work?.samples || []).length || (A.work.samples.length !== (A.work.rubric || []).length)) fail(`${tag} work samples/rubric`);
  for (const c of ["called", "ready", "tested", "story"]) if (!A.chapters?.[c]?.name || !A.chapters?.[c]?.text) fail(`${tag} chapter ${c}`);
  for (const k of B.CANDOR.map((c) => c.id)) if (!A.candor?.[k]) fail(`${tag} candor ${k}`);
  const text = words({ ...A, faithScales: undefined, faith: undefined });
  for (const w of [/\bplant(s|ing|er|ers|ed)?\b/i, /launch team/i, /DiSC|Myers|Gallup|Enneagram|Working Genius|Predictive Index/]) {
    const m = text.match(w); if (m) fail(`${tag} contains "${m[0]}"`);
  }
}
console.log(bad ? `${bad} problem(s)` : "audience files OK");
process.exit(bad ? 1 : 0);
