# Plumbline

A free church planter assessment for networks. The planter, the spouse and 3–5 references each answer on their own. The network leader gets a graded report, a recommendation and an interview guide built from their answers.

Built by Parker Manuel ([parkermanuel.com](https://parkermanuel.com)).

## How it's built
- A static single-page app in `src/` that esbuild bundles into `dist/index.html`. Hosted on GitHub Pages.
- Supabase handles leader sign-in (email links) and Postgres storage. `supabase/setup.sql` creates every table, security rule and function.
- Planters, spouses and references don't need accounts. Each person's link carries a random 64-character key, and they reach their own row only through `pl_*` functions.
- Every answer saves right away to the device and to the server within a few seconds. Progress updates the leader's dashboard live through Supabase Realtime.

## Files
| Path | What |
|---|---|
| `src/bank.js` | Every question, scale, scenario, gift and report sentence. All original. |
| `src/engine.js` | Scoring: bands, flags, couple alignment, 360 gaps, the recommendation and the interview guide. Pure functions. |
| `src/app.js` | Screens: home, dashboard, reports and the question flow. |
| `src/live.js` | Supabase: auth, saving and live progress. |
| `src/samples.js` | Three sample couples (Ready, Ready with Conditions, Pause & Talk). |
| `research/` | Research notes behind the design, with sources. |
| `blueprint.md` | The assessment design. |
| `SETUP.md` | One-time steps to put it online. |

## Commands
```
npm ci
npm test          # scoring checks + database checks (in-memory Postgres)
npm run build     # dist/index.html, using config.json
npm run e2e       # full browser test: leader, planter on two devices, spouse, references, release (needs Playwright)
```

## Changing questions or cut scores
Edit `src/bank.js` or the `BANDS` in `src/engine.js`, then run `npm test`. Never reuse a question ID for different wording, because saved answers are stored by ID.
