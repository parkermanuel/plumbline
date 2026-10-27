// Plumbline Teams -> Stoa: only the shareable summary leaves, and only staff-chosen, leader-released cards are marked released.
import { makeDb } from "./sql.test.mjs";
const db = await makeDb(); let failed = 0;
const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) failed++; };
const q = async (s, p) => (await db.query(s, p)).rows;
const nid = (await q(`insert into public.networks(name, credits) values ('Pinewood Staff', 10) returning id`))[0].id;
await q(`insert into public.pl_stoa_links values ($1, 'pinewood', 'https://abc.supabase.co/functions/v1/plumbline-sync')`, [nid]);
const owner = "11111111-1111-1111-1111-111111111111"; await q(`insert into auth.users values ($1, 'p@x.org') on conflict do nothing`, [owner]);
const mk = async (name, email, shared) => {
  const cid = (await q(`insert into public.cases(network_id, created_by, planter_name, married, settings) values ($1, $2, $3, false, '{"purpose":"team","team":{"id":"staff","name":"Staff"}}') returning id`, [nid, owner, name]))[0].id;
  const s = { pillars: { health: 40, family: 55, leadership: 90 }, wiring: { pace: 80, people: 20, decide: 50 }, giftsTop: ["teaching", "leadership"], strengths: ["partnership", "vision", "rhythms", "team"], team: { trust: 70 } };
  const has = (await q(`select id from public.participants where case_id = $1 and role = 'planter'`, [cid]))[0];
  if (has) await q(`update public.participants set email = $2, status = 'finished', shared = $3, team_summary = $4 where id = $1`, [has.id, email, shared, s]);
  else await q(`insert into public.participants(case_id, role, name, email, status, shared, team_summary) values ($1, 'planter', $2, $3, 'finished', $4, $5)`, [cid, name, email, shared, s]);
};
await mk("Kayla", "Kayla@Pinewood.org", true); await mk("Dana", "dana@pinewood.org", false);
let cards = (await q(`select public.pl_stoa_cards($1) c`, [nid]))[0].c;
ok(cards.length === 2 && cards.every((c) => !c.released), "before the leader releases, no card is marked released");
await q(`insert into public.team_releases(network_id, team_id) values ($1, 'staff')`, [nid]);
cards = (await q(`select public.pl_stoa_cards($1) c`, [nid]))[0].c;
const k = cards.find((c) => c.email === "kayla@pinewood.org"), d = cards.find((c) => c.email === "dana@pinewood.org");
ok(k.released && !d.released, "released only for people who chose to share");
ok(k.headline === "Gifted in Teaching and Leadership", "headline from top gifts");
ok(JSON.stringify(k.strengths) === JSON.stringify(["Teaching", "Leadership", "Vision Casting", "Building Teams"]), "strengths skip marriage and rest areas");
ok(k.wiring.some((w) => w.label === "Pace" && w.value === "Driving") && k.wiring.some((w) => w.label === "People" && w.value === "Reflective"), "wiring leans in words");
const raw = JSON.stringify(cards).toLowerCase();
ok(!/health|marriage|partnership|family|rhythm|pillars|trust|team_summary/.test(raw), "no health, marriage, family, team-health or raw scores leave Plumbline");
ok(Object.keys(k).sort().join() === "church_slug,email,headline,released,strengths,wiring", "only the fields Stoa accepts");
await db.exec(`set role authenticated`);
let denied = false; try { await db.query(`select public.pl_stoa_cards($1)`, [nid]); } catch { denied = true; }
let denied2 = false; try { await db.query(`select * from public.pl_stoa_links`); } catch { denied2 = true; }
await db.exec(`reset role`);
ok(denied && denied2, "signed-in users can't read cards or links (service role only)");
console.log(failed ? `\n${failed} FAILED` : "\nAll Stoa checks passed"); process.exit(failed ? 1 : 0);
