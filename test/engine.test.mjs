// Scoring checks on the three sample couples. Run before every deploy.
import { SAMPLE_CASES } from "../src/samples.js";
import { scoreCase } from "../src/engine.js";
const expect = { rivera: "ready", kim: "conditions", holland: "pause" };
let fail = 0;
for (const c of SAMPLE_CASES()) {
  const r = scoreCase(c);
  const good = r.outcome.key === expect[c.id];
  console.log(good ? "ok -" : "FAIL -", c.label, "->", r.outcome.name);
  if (!good) fail++;
  if (!r.interview.planter.length || r.interview.planter.length > 9) { console.log("FAIL - interview size", r.interview.planter.length); fail++; }
}
// incomplete data can never read Ready
const [riv] = SAMPLE_CASES();
const r2 = scoreCase({ ...riv, spouse: null, refs: [] });
console.log(r2.outcome.key !== "ready" ? "ok -" : "FAIL -", "missing spouse and references caps the outcome");
if (r2.outcome.key === "ready") fail++;
// Every audience scores the same answers without errors, and its leader report never talks about planting.
for (const audience of ["staff", "nonprofit", "business"]) for (const faith of [false, true]) {
  const r = scoreCase({ ...riv, spouse: null, married: false, settings: { audience, faith } });
  const text = JSON.stringify({ i: r.interview, f: r.flags, p: r.plan, pil: r.pillars.map((x) => [x.name, x.blurb]) }).replace(/"planter":/g, "");
  const ok = r.outcome?.key && !r.spouse && !r.couple && !/\bplant(ing|er|ers|s)?\b/i.test(text) && (faith || audience === "staff" || !r.gifts);
  console.log(ok ? "ok -" : "FAIL -", `${audience}${faith ? " (faith)" : ""} scores without planting language ->`, r.outcome?.name);
  if (!ok) { fail++; const m = text.match(/.{60}\bplant(ing|er|ers|s)?\b.{40}/i); if (m) console.log("   ", m[0]); }
}
scoreCase(riv); // back to church planting
process.exit(fail ? 1 : 0);
