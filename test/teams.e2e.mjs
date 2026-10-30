// Plumbline Teams end to end on the React (Lovable) site: PL_SITE=http://127.0.0.1:5173 node test/teams.e2e.mjs
import { db, device, emails, calls, errs, SITE, b, text, wait, click, submit, linkIn, shot, answer } from "./harness-teams.mjs";
let failed = 0;
const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) failed++; };
import { personEmail as pe } from "../supabase/functions/plumbline-email/templates.js";

// 0. The team invite email reads as a team invite, never as hiring
{
  const e = pe("invite", { role: "planter", name: "Ava Stone", token: "t", planter_name: "Ava Stone", network_name: "Pinewood Church", sender_name: "Parker Manuel", audience: "staff", purpose: "team", team_name: "Pinewood staff" }, SITE);
  ok(/Plumbline Teams/.test(e.subject) && /growth report/.test(e.text) && !/consider|hiring decision\b(?!,)/i.test(e.text.replace("isn't part of a hiring decision", "")), "team invite email: Plumbline Teams, growth report, no hiring language");
}

// 1. A leader starts a team from the Teams home
const owner = await device("owner");
await owner.goto(SITE + "/teams"); await wait(1500);
ok((await text(owner)).includes("An assessment your whole team takes"), "Teams home page loads");
await click(owner, 'main a[href="/teams/new"]'); await owner.waitForSelector("#onboard", { timeout: 20000 }).catch(() => {});
ok((await text(owner)).includes("Set up Plumbline Teams"), "new leader sets up their organization first");
await owner.waitForSelector('[data-act="ob-team-org"]', { timeout: 20000 }).catch(() => {});
ok((await owner.$$('[data-act="ob-team-org"]')).length >= 3, "it asks what kind of organization the team is part of");
await click(owner, '[data-act="ob-team-org"][data-v="staff"]'); await owner.waitForSelector("#o-net", { timeout: 20000 });
await owner.fill("#o-net", "Front Range Church"); await owner.fill("#o-me", "Dana Ellis");
await submit(owner, "#onboard form"); await owner.waitForSelector("#t-people", { timeout: 20000 }).catch(() => {});
ok(!!(await owner.$("#t-people")), "then the start-a-team form");
await owner.fill("#t-name", "Front Range staff");
await owner.fill("#t-people", "Ava Stone, ava@fr.church\nBen Cole <ben@fr.church>\nCara Diaz\tcara@fr.church\nDev Patel, dev@fr.church\nno email here");
await wait(300);
let t = await text(owner);
ok(/4 people/.test(t) && /1 line need/.test(t), "it reads 4 people and flags the line without an email");
const BETA = (process.env.PL_TODAY || "2027-02-01") <= "2026-12-31";
if (BETA) {
  // Free beta through Dec 31, 2026: no plan picker, nothing to buy, the team starts right away
  ok(!(await owner.$$('[data-act="choose-plan"]')).length && !(await owner.$eval("#t-go", (b) => b.disabled)), "beta: no plan needed to start a team of 4");
} else {
ok(/You have 1 free assessment, and this adds 4/.test(t) && await owner.$eval("#t-go", (b) => b.disabled), "with 1 free assessment it asks for a plan before starting");
ok((await owner.$$('[data-act="choose-plan"]')).length === 3 && /Choose Starter/.test(await owner.$eval(".teams-plan.pick", (e) => e.innerText)), "it shows the three plans and points to Starter for 4 people");
await shot(owner, "teams-plans-desktop");
// Stripe confirms a Starter plan (what the payment function records after checkout)
await db.query(`select public.pl_record_payment('cs_e2e_team', (select id from public.networks limit 1), 'teams', 8, 24900, 'usd', null, null, 'cus_e2e')`);
await owner.reload(); await owner.waitForSelector("#t-people", { timeout: 20000 });
ok(/Your Teams plan covers 8 people/.test(await text(owner)) && /0 on teams now, 8 open/.test(await text(owner)), "the start-a-team page shows the plan: 8 people, all open");
}
await owner.fill("#t-name", "Front Range staff");
await owner.fill("#t-people", "Ava Stone, ava@fr.church\nBen Cole, ben@fr.church\nCara Diaz, cara@fr.church\nDev Patel, dev@fr.church");
await submit(owner, "#newteam");
await owner.waitForURL(/\/teams\/t_[a-f0-9]+/, { timeout: 20000 }).catch(() => {});
const teamUrl = owner.url();
ok(/\/teams\/t_[a-f0-9]+$/.test(teamUrl), "lands on the team page (" + teamUrl.replace(SITE, "") + ")");
await owner.waitForSelector("text=0 of 4 finished", { timeout: 15000 }).catch(() => {});
ok((await text(owner)).includes("0 of 4 finished"), "team page: 0 of 4 finished");
const inv = emails.filter((e) => e.kind === "invite");
ok(inv.length === 4, "each person is emailed their link (" + inv.length + ")");
const rows = (await db.query(`select settings, reports_released from public.cases where settings->>'purpose' = 'team'`)).rows;
ok(rows.length === 4 && rows.every((r) => r.settings.team.name === "Front Range staff" && r.settings.audience === "staff" && r.reports_released), "4 team assessments, released, with the team name");
ok((await db.query(`select credits from public.networks`)).rows[0].credits === 1, "the Teams plan covered all 4 people (the free assessment is still there)");

// 2. Three people take it
const people = ["ava@fr.church", "ben@fr.church", "cara@fr.church"];
for (const [i, who] of people.entries()) {
  const link = linkIn(inv.find((e) => e.to === who)).replace(/#\//, "");
  const p = await device(null, i === 0 ? 390 : 1100);
  await p.goto(link); await p.waitForSelector("#welcome", { timeout: 20000 }).catch(() => {});
  const w = await text(p);
  if (i === 0) {
    ok(/growth report is private to me/.test(w) && !/full report/.test(w), "welcome: says the growth report is private");
    ok(/isn't part of any hiring decision/.test(w), "welcome: says it isn't part of a hiring decision");
    await shot(p, "teams-welcome-phone");
  }
  const res = await answer(p, 900);
  ok(res === "done", `${who} finishes (${res})`);
  const d = await text(p);
  if (i === 0) {
    ok(/growth report is ready/.test(d) && /private to you/.test(d), "finish screen: the growth report is ready and private");
    await click(p, '[data-act="see-report"]'); await p.waitForSelector(".report", { timeout: 20000 }).catch(() => {});
    const rep = await text(p);
    ok(/how God has wired you/.test(rep) && /Your next 90 days/.test(rep), "they see their own growth report right away");
    ok(!/Ready with Conditions|Pause & Talk|Development Needed|Recommendation/.test(rep), "no grade or recommendation in their report");
    ok(/How to work with/.test(rep) && /I work best with/.test(rep) && /To work well with me/.test(rep), "their report has a How to work with me card");
    ok(/Your report is private/.test(rep) && !!(await p.$('[data-act="share-toggle"]')), "their report says it's private, with a Share button");
    ok(/\/my\/[a-f0-9]{64}$/.test(p.url()) && !p.url().includes(link.split("/t/")[1]), "their report opens at its own private address, not the assessment link");
    ok(/Bookmark this page/.test(rep), "the report page tells them to bookmark their private link");
    ok(!/Your story|debt|When could you start/i.test(JSON.stringify(await db.query(`select answers->'facts' f from public.participants where email = 'ava@fr.church'`).then((r) => r.rows[0].f || {}))), "team members skip the hiring-only questions");
    await click(p, '[data-act="share-toggle"]'); await wait(1200);
    ok((await db.query(`select shared from public.participants where email = 'ava@fr.church'`)).rows[0].shared === true && /Shared with/.test(await text(p)), "Ava shares her report with one tap");
    await shot(p, "teams-report-phone");
    await p.emulateMedia({ colorScheme: "dark" }); await shot(p, "teams-report-phone-dark");
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "the private report fits a phone screen");
    // Coming back to the old link on the same phone goes straight to the report
    await p.goto(link); await p.waitForURL(/\/my\//, { timeout: 15000 }).catch(() => {});
    ok(/\/my\//.test(p.url()), "the old link on their own phone goes on to their private report");
  }
  await p.context().close();
}

// 2b. A leader who copied Ava's link before she finished can't open her report with it
{
  const avaLink = linkIn(inv.find((e) => e.to === "ava@fr.church")).replace(/#\//, "");
  const spy = await device("owner", 390);
  await spy.goto(avaLink); await spy.waitForSelector(".intro-card", { timeout: 20000 }).catch(() => {}); await wait(800);
  const st = await text(spy);
  ok(!/how God has wired you/.test(st) && !(await spy.$(".report")) && /private/.test(st) && !!(await spy.$('[data-act="email-report-key"]')), "a leader with the old link sees only a private notice, never the report");
  await shot(spy, "teams-old-link-phone");
  await spy.emulateMedia({ colorScheme: "dark" }); await shot(spy, "teams-old-link-phone-dark");
  ok(await spy.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "the private notice fits a phone screen");
  const before = emails.length;
  await click(spy, '[data-act="email-report-key"]'); await wait(1200);
  const sent = emails.slice(before);
  ok(sent.length === 1 && sent[0].to === "ava@fr.church" && sent[0].kind === "report_key" && /\/my\/[a-f0-9]{64}/.test(sent[0].text) && /sent it to your email/i.test(await text(spy)), "asking for the link emails it to Ava's own address only");
  await spy.context().close();
}

// 3. The leader's team map: private until 3 finish, then combined; Ava shows by name because she shared
await owner.goto(teamUrl); await owner.waitForSelector("text=3 of 4 finished", { timeout: 20000 }).catch(() => {});
t = await text(owner);
ok(t.includes("3 of 4 finished") && t.includes("1 shared their report"), "team page: 3 of 4 finished, 1 shared");
ok(t.includes("Your team at a glance") && /strongest area/.test(t) && /Combined results from the 3 people/.test(t), "team map: combined results from 3 people");
ok((await owner.$$(".team-pillar")).length >= 5, "team map: each area with the team average");
ok((await owner.$$(".team-wiring")).length === 5 && (await owner.$$(".team-split")).length === 5, "team map: five wiring rows as counts");
ok(t.includes("Gifts on the team"), "team map: gifts for a church staff team");
ok((await owner.$$('a:has-text("Shared report")')).length === 1 && (await owner.$$(".team-private")).length === 2, "people: Ava's shared report opens; the other two show Private");
ok(!/Ben|Cara/.test(await owner.evaluate(() => [...document.querySelectorAll(".team-pillar, .team-wiring, .legend")].map((e) => e.innerText).join(" "))) && /Ava/.test(await owner.evaluate(() => document.querySelector(".legend")?.innerText || "")), "team map: only the person who shared shows by name");
ok(/Talk about it together/.test(t) && (await owner.$$(".guide-steps li")).length >= 5 && /60-minute/.test(t), "team map: a 60-minute team meeting guide");
await shot(owner, "teams-map-desktop");
const ph = await device("owner", 390); await ph.goto(teamUrl); await ph.waitForSelector(".team-pillar", { timeout: 20000 }).catch(() => {});
ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "team map fits a phone screen");
await shot(ph, "teams-map-phone");

// 4. Ava's shared report opens for the leader; a private person's page says so
await owner.click('a:has-text("Shared report")'); await owner.waitForURL(/\/case\//, { timeout: 20000 }).catch(() => {}); await owner.waitForSelector(".tabs", { timeout: 20000 }).catch(() => {}); await wait(800);

t = await text(owner);
ok(!t.includes("Leader report") && /shared report/i.test(await owner.evaluate(() => document.querySelector(".tabs")?.innerText || "")) && /how God has wired you/.test(t), "Ava's shared report opens, no leader report");
ok(/For your next 1:1/.test(t) && /next 1:1 with Ava/.test(t) && (await owner.$$(".qa-list li")).length >= 5, "Ava's shared report comes with 1:1 questions");
await shot(owner, "teams-shared-report-desktop");
const benCase = (await db.query(`select c.id from public.cases c where c.planter_name = 'Ben Cole'`)).rows[0].id;
await owner.goto(SITE + "/case/" + benCase); await owner.waitForSelector(".notice", { timeout: 20000 }).catch(() => {}); await wait(800);
t = await owner.evaluate(() => document.body.innerText);
ok(/private to them unless they choose to share/.test(t) && !/how God has wired you/.test(t), "Ben's page: finished, report private");

// 5. The dashboard groups them under the team
await owner.goto(SITE + "/leader"); await owner.waitForSelector("text=Front Range staff", { timeout: 20000 }).catch(() => {});
t = await text(owner);
ok(t.includes("Front Range staff") && t.includes("Team map ready") && !t.includes("Ava Stone"), "dashboard: one team row, not four people");

// 6. Adding people to the same team
await owner.goto(teamUrl); await owner.waitForSelector('a[href*="/teams/new?team="]', { timeout: 20000 });
await click(owner, 'a[href*="/teams/new?team="]'); await owner.waitForSelector("#t-people", { timeout: 20000 });
ok(!(await owner.$("#t-name")) && (await text(owner)).includes("Add people to Front Range staff"), "add people: keeps the team, no new name");
await owner.fill("#t-people", "Eli Moss, eli@fr.church"); await submit(owner, "#newteam");
await owner.waitForSelector("text=3 of 5 finished", { timeout: 20000 }).catch(() => {});
ok((await text(owner)).includes("3 of 5 finished"), "added to the same team: 3 of 5 finished");

console.log("emails:", emails.length, "page errors:", errs.length ? errs : "none");
await b.close();
process.exit(failed ? 1 : 0);
