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
process.exit(fail ? 1 : 0);
