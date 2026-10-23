// Live data layer: Supabase sign-in for network teams, link-based saving for planters, spouses and references.
import { createClient } from "@supabase/supabase-js";

const CFG = (typeof window !== "undefined" && window.PLUMBLINE_CONFIG) || {};
export const LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
export const sb = LIVE ? createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } }) : null;

export const state = {
  session: null, loaded: false, error: null,
  memberships: [], networks: [], activeId: null, // the network being viewed
  cases: [], status: [], full: {}, // full: caseId -> participants with answers (loaded on open)
  team: [], invites: [], scores: {}, isPlatformAdmin: false,
};
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = (why) => listeners.forEach((fn) => fn(why));

export const siteUrl = () => (CFG.siteUrl || location.origin).replace(/\/$/, "");
export const personLink = (token) => `${siteUrl()}/#/t/${token}`;
export const refLink = (refToken) => `${siteUrl()}/#/r/${refToken}`;
export const joinLink = (token) => `${siteUrl()}/#/join/${token}`;
const uid = () => state.session?.user?.id;
const must = ({ data, error }) => { if (error) throw error; return data; };

export const active = () => state.networks.find((n) => n.id === state.activeId) || null;
export const myRole = (nid = state.activeId) => state.memberships.find((m) => m.network_id === nid)?.role || null;
export const canAdmin = (nid) => ["owner", "admin"].includes(myRole(nid));

// ---------- sign-in ----------
export async function initAuth() {
  if (!LIVE) return;
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  sb.auth.onAuthStateChange((_e, session) => {
    const was = !!state.session;
    state.session = session;
    if (session && !was) { loadAll(); subscribe(); }
    if (!session) Object.assign(state, { loaded: false, memberships: [], networks: [], cases: [], status: [], full: {}, team: [], invites: [] });
    emit("auth");
  });
  if (state.session) { await loadAll(); subscribe(); }
}
export async function sendMagicLink(email, back = "") {
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: siteUrl() + "/" + back } });
  if (error) throw error;
}
// The same email carries a 6-digit code; the iPhone app signs in with it so nobody has to leave the app.
// Only accounts given a password in Supabase (the App Store reviewer's) can use this; everyone else signs in by email.
export async function signInPassword(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function verifyCode(email, token) {
  const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
}
export async function signOut() { await sb.auth.signOut(); }

// ---------- loading ----------
export async function loadAll() {
  try {
    state.memberships = must(await sb.from("network_members").select("network_id,role,name,email").eq("user_id", uid()));
    state.networks = must(await sb.from("networks").select("*").order("created_at", { ascending: true }));
    let saved = null; try { saved = localStorage.getItem("pl.network"); } catch {}
    state.activeId = state.networks.find((n) => n.id === saved)?.id || state.networks[0]?.id || null;
    try { state.isPlatformAdmin = !!must(await sb.rpc("pl_platform_stats")); } catch { state.isPlatformAdmin = false; }
    await loadNetwork();
    state.loaded = true; state.error = null;
  } catch (err) { state.error = err.message || String(err); state.loaded = true; }
  emit("cases");
}
export async function loadNetwork() {
  const nid = state.activeId;
  if (!nid) { state.cases = []; state.status = []; state.team = []; state.invites = []; return; }
  const [c, s, t] = await Promise.all([
    sb.from("cases").select("id,network_id,created_by,planter_name,spouse_name,married,city,settings,ref_token,reports_released,created_at,archived").eq("network_id", nid).eq("archived", false).order("created_at", { ascending: false }).limit(500),
    sb.from("participant_status").select("*").eq("network_id", nid),
    sb.from("network_members").select("user_id,role,name,email,created_at").eq("network_id", nid),
  ]);
  state.cases = must(c); state.status = must(s); state.team = must(t);
  state.invites = canAdmin(nid) ? must(await sb.from("network_invites").select("id,email,role,token,created_at,emailed_at,accepted_at").eq("network_id", nid)).filter((i) => !i.accepted_at) : [];
}
export async function switchNetwork(id) {
  state.activeId = id; try { localStorage.setItem("pl.network", id); } catch {}
  state.full = {}; await loadNetwork(); resubscribe(); emit("cases");
}

// Shape used by the screens (same as the sample cases)
export function caseView(row) {
  const people = state.status.filter((p) => p.case_id === row.id);
  const full = state.full[row.id];
  const done = (role) => full?.find((p) => p.role === role && p.status === "finished")?.answers || null;
  const s = row.settings || {};
  return {
    id: row.id, live: true,
    label: row.married && row.spouse_name ? `${row.planter_name.split(" ")[0]} & ${row.spouse_name}` : row.planter_name,
    planterName: row.planter_name, spouseName: row.spouse_name || "", married: row.married, city: row.city,
    network: { name: s.networkName, signGifts: s.signGifts !== false }, settings: s, created: row.created_at?.slice(0, 10),
    refToken: row.ref_token, released: row.reports_released, createdBy: row.created_by,
    people: (full ? full.map((p) => ({ ...(people.find((x) => x.participant_id === p.id) || {}), ...p })) : people.map((p) => ({ ...p, id: p.participant_id })))
      .sort((a, b) => ["planter", "spouse", "reference"].indexOf(a.role) - ["planter", "spouse", "reference"].indexOf(b.role) || String(a.created_at || "").localeCompare(String(b.created_at || ""))),
    loadedFull: !!full,
    planter: done("planter"), spouse: done("spouse"),
    refs: (full || []).filter((p) => p.role === "reference" && p.status === "finished").map((p) => p.answers),
    finishedRoles: people.filter((p) => p.status === "finished").map((p) => p.role),
  };
}
export const cases = () => state.cases.map(caseView);

export async function openCase(id) {
  let row = state.cases.find((c) => c.id === id);
  if (!row) {
    row = must(await sb.from("cases").select("*").eq("id", id).maybeSingle());
    if (!row) return null;
    if (row.network_id !== state.activeId) { await switchNetwork(row.network_id); }
  }
  state.full[id] = must(await sb.from("participants").select("*").eq("case_id", id));
  state.scores[id] = must(await sb.from("interview_scores").select("*").eq("case_id", id));
  emit("case");
  return caseView(state.cases.find((c) => c.id === id) || row);
}

// ---------- live progress ----------
let channel = null, refreshTimer = null;
function resubscribe() { if (channel) { sb.removeChannel(channel); channel = null; } subscribe(); }
function subscribe() {
  if (channel || !state.activeId) return;
  channel = sb.channel("pl-progress-" + state.activeId)
    .on("postgres_changes", { event: "*", schema: "public", table: "participant_status", filter: `network_id=eq.${state.activeId}` }, (payload) => {
      const n = payload.new, old = payload.old;
      if (payload.eventType === "DELETE") state.status = state.status.filter((x) => x.participant_id !== old.participant_id);
      else if (n.network_id === state.activeId) {
        const i = state.status.findIndex((x) => x.participant_id === n.participant_id);
        const wasDone = i >= 0 && state.status[i].status === "finished";
        if (i >= 0) state.status[i] = { ...state.status[i], ...n }; else state.status.push(n);
        if (n.status === "finished" && !wasDone && state.full[n.case_id]) { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => openCase(n.case_id), 600); }
        if (!state.cases.find((c) => c.id === n.case_id)) loadNetwork().then(() => emit("progress"));
      }
      emit("progress");
    })
    .subscribe();
}

// ---------- networks and teams ----------
export async function createNetwork(name, myName) {
  const id = must(await sb.rpc("pl_create_network", { p_name: name, p_name_self: myName || null }));
  try { localStorage.setItem("pl.network", id); } catch {}
  await loadAll();
  return id;
}
export async function updateNetwork(patch) {
  const n = active();
  const body = {};
  if (patch.name != null) body.name = patch.name;
  if (patch.logo_url !== undefined) body.logo_url = patch.logo_url;
  if (patch.settings) body.settings = { ...(n.settings || {}), ...patch.settings };
  const row = must(await sb.from("networks").update(body).eq("id", n.id).select().single());
  state.networks = state.networks.map((x) => (x.id === row.id ? row : x));
  emit("cases");
}
export async function uploadLogo(file) {
  const n = active();
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${n.id}/logo-${Date.now()}.${ext}`;
  must(await sb.storage.from("logos").upload(path, file, { upsert: true, contentType: file.type }));
  const { data } = sb.storage.from("logos").getPublicUrl(path);
  await updateNetwork({ logo_url: data.publicUrl });
  return data.publicUrl;
}
export async function inviteMember(email, role) {
  const id = must(await sb.rpc("pl_invite_member", { p_network: state.activeId, p_email: email, p_role: role }));
  let emailed = false;
  try { const r = await email_("team", { inviteId: id }); emailed = r?.sent > 0; } catch {}
  await loadNetwork(); emit("cases");
  return { id, emailed, token: state.invites.find((i) => i.id === id)?.token };
}
export async function revokeInvite(id) { must(await sb.from("network_invites").delete().eq("id", id)); await loadNetwork(); emit("cases"); }
export async function setMember(userId, role) { must(await sb.rpc("pl_set_member", { p_network: state.activeId, p_user: userId, p_role: role })); await loadNetwork(); emit("cases"); }
export async function inviteInfo(token) { return must(await sb.rpc("pl_invite_info", { p_token: token })); }
export async function acceptInvite(token, name) {
  const nid = must(await sb.rpc("pl_accept_invite", { p_token: token, p_name: name || null }));
  try { localStorage.setItem("pl.network", nid); } catch {}
  await loadAll();
  return nid;
}
export async function platformStats() { return must(await sb.rpc("pl_platform_stats")); }

// ---------- assessments ----------
export async function createCase(f) {
  const row = must(await sb.from("cases").insert({
    network_id: state.activeId, created_by: uid(), planter_name: f.planterName, spouse_name: f.married ? f.spouseName : null,
    planter_email: f.planterEmail || null, spouse_email: f.married ? f.spouseEmail || null : null,
    married: f.married, city: f.city || null, settings: { signGifts: f.signGifts, bankVersion: f.bankVersion },
  }).select().single());
  await loadNetwork();
  if (f.sendNow) {
    const ids = state.status.filter((p) => p.case_id === row.id).map((p) => p.participant_id);
    try { await email_("invite", { ids }); await loadNetwork(); } catch {}
  }
  emit("cases");
  return row.id;
}
export async function rotateRef(caseId) {
  const t = must(await sb.rpc("pl_rotate_ref", { p_case: caseId }));
  state.cases = state.cases.map((c) => (c.id === caseId ? { ...c, ref_token: t } : c)); emit("case");
  return t;
}
export async function setReleased(id, released) {
  must(await sb.from("cases").update({ reports_released: released }).eq("id", id));
  state.cases = state.cases.map((c) => (c.id === id ? { ...c, reports_released: released } : c)); emit("case");
}
// Results people upload from other tools live in the private "results" bucket at <their link token>/<random name>.
export async function uploadResult(token, file) {
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "pdf";
  const rand = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const path = `${token}/${rand}.${ext}`;
  must(await sb.storage.from("results").upload(path, file, { contentType: file.type, upsert: false }));
  return { path, name: file.name.slice(0, 120), size: file.size };
}
export async function resultUrl(path) {
  const { data, error } = await sb.storage.from("results").createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}
export async function deleteCase(id) {
  const full = must(await sb.from("participants").select("answers").eq("case_id", id));
  const paths = (full || []).flatMap((p) => p.answers?.other?.files || []).map((f) => f.path).filter((x) => typeof x === "string" && x.includes("/"));
  if (paths.length) await sb.storage.from("results").remove(paths).catch(() => {});
  must(await sb.from("cases").delete().eq("id", id));
  state.cases = state.cases.filter((c) => c.id !== id); delete state.full[id]; emit("cases");
}
// Deletes the signed-in person's account. Networks they lead alone go too, with every assessment and uploaded file in them.
export async function deleteAccount() {
  const mine = must(await sb.from("network_members").select("network_id").eq("user_id", uid()));
  for (const m of mine || []) {
    const others = must(await sb.from("network_members").select("user_id").eq("network_id", m.network_id).neq("user_id", uid()));
    if (others.length) continue;
    const cases = must(await sb.from("cases").select("id").eq("network_id", m.network_id));
    for (const c of cases || []) await deleteCase(c.id);
  }
  const { error } = await sb.rpc("pl_delete_account");
  if (error) throw error;
  await sb.auth.signOut();
}
export async function updatePerson(id, patch) {
  must(await sb.from("participants").update(patch).eq("id", id));
  const caseId = state.status.find((p) => p.participant_id === id)?.case_id;
  if (caseId) await openCase(caseId);
}
export async function addReference(caseId, name, email) {
  const row = must(await sb.from("participants").insert({ case_id: caseId, role: "reference", name, email: email || null }).select("id").single());
  await loadNetwork();
  if (email) { try { await email_("invite", { ids: [row.id] }); } catch { await openCase(caseId); return { emailed: false }; } }
  await openCase(caseId);
  return { emailed: !!email };
}
export async function emailPeople(kind, ids) {
  const r = await email_(kind, { ids });
  await loadNetwork(); emit("progress");
  return r;
}
// ---------- payments ----------
// How many assessments the active network can start: a yearly plan means unlimited until its date.
export function balance(n = active()) {
  if (!n) return { plan: false, credits: 0, can: false };
  const until = n.plan_until ? new Date(n.plan_until) : null;
  const plan = !!until && until > new Date();
  return { plan, until, credits: n.credits || 0, can: plan || (n.credits || 0) > 0 };
}
// Sends an owner or admin to Stripe Checkout. kind: "couples" ($99 each, quantity adjustable there) or "plan" ($2,500 a year).
export async function buy(kind, quantity = 1) {
  const { data, error } = await sb.functions.invoke("plumbline-stripe", { body: { action: "checkout", kind, quantity, networkId: state.activeId } });
  if (error || !data?.url) throw new Error(data?.error || error?.message || "Checkout isn't available right now");
  location.href = data.url;
}
// Platform admin: list, create or switch off discount codes.
export async function codes(op = "list", payload = {}) {
  const { data, error } = await sb.functions.invoke("plumbline-stripe", { body: { action: "codes", op, ...payload } });
  if (error || data?.error) throw new Error(data?.error || error?.message || "Couldn't reach Stripe");
  return data;
}
export async function grant(networkId, credits, months = 0) {
  const { error } = await sb.rpc("pl_grant", { p_network: networkId, p_credits: credits, p_months: months });
  if (error) throw error;
}
export async function setFounding(networkId, on) {
  const { error } = await sb.rpc("pl_set_founding", { p_network: networkId, p_on: on });
  if (error) throw error;
}
export async function refreshNetworks() {
  state.networks = must(await sb.from("networks").select("*").order("created_at", { ascending: true }));
  emit("cases");
}
async function email_(action, payload) {
  const { data, error } = await sb.functions.invoke("plumbline-email", { body: { action, ...payload } });
  if (error) throw error;
  return data;
}

// Each assessor's own interview notes
let scoreTimer = null;
export function myScores(caseId) { return (state.scores[caseId] || []).find((s) => s.user_id === uid())?.notes || null; }
export function teamScores(caseId) { return (state.scores[caseId] || []).filter((s) => s.user_id !== uid()); }
export function saveMyScores(caseId, notes) {
  clearTimeout(scoreTimer);
  scoreTimer = setTimeout(async () => {
    const me = state.team.find((m) => m.user_id === uid());
    const row = { case_id: caseId, user_id: uid(), name: me?.name || me?.email?.split("@")[0] || "Me", notes, updated_at: new Date().toISOString() };
    await sb.from("interview_scores").upsert(row, { onConflict: "case_id,user_id" });
    const list = (state.scores[caseId] ||= []); const i = list.findIndex((s) => s.user_id === uid());
    if (i >= 0) list[i] = row; else list.push(row);
  }, 600);
}

// ---------- people with a link ----------
export async function openToken(token) { return must(await sb.rpc("pl_open", { p_token: token })); }
export async function refCase(refToken) { return must(await sb.rpc("pl_ref_case", { p_ref_token: refToken })); }
export async function joinReference(refToken, name) { return must(await sb.rpc("pl_join_reference", { p_ref_token: refToken, p_name: name })); }
export async function report(token) { return must(await sb.rpc("pl_report", { p_token: token })); }

// Saving: every answer saves on the device at once and to the server within a few seconds.
const saver = { timer: null, pending: null, status: "saved", inflight: false, last: 0 };
export const saveStatus = () => saver.status;
export function queueSave(token, answers, step, total, chapter) {
  // the device copy never holds the private parts (note, safety, ratings of the spouse)
  try { const { privateNote, safety, spouseSees, ...shareable } = answers; localStorage.setItem("pl.backup." + token, JSON.stringify({ answers: shareable, step, at: Date.now() })); } catch {}
  saver.pending = { token, answers, step, total, chapter };
  saver.status = "saving"; emit("save");
  clearTimeout(saver.timer);
  if (Date.now() - saver.last > 4000) flush(); else saver.timer = setTimeout(flush, 500);
}
export async function flush() {
  if (!saver.pending || saver.inflight) return;
  const p = saver.pending; saver.pending = null; saver.inflight = true; saver.last = Date.now();
  try {
    must(await sb.rpc("pl_save", { p_token: p.token, p_answers: p.answers, p_step: p.step, p_total: p.total, p_chapter: p.chapter }));
    saver.status = saver.pending ? "saving" : "saved";
  } catch {
    saver.pending = saver.pending || p; saver.status = "offline";
    clearTimeout(saver.timer); saver.timer = setTimeout(flush, 4000);
  } finally { saver.inflight = false; emit("save"); if (saver.pending && saver.status !== "offline") flush(); }
}
export async function finish(token, answers) {
  clearTimeout(saver.timer); saver.pending = null;
  must(await sb.rpc("pl_finish", { p_token: token, p_answers: answers }));
  try { localStorage.removeItem("pl.backup." + token); } catch {}
  sb.functions.invoke("plumbline-email", { body: { action: "finished", token } }).catch(() => {});
  return true;
}
export function backup(token) { try { return JSON.parse(localStorage.getItem("pl.backup." + token) || "null"); } catch { return null; } }
if (typeof window !== "undefined") window.addEventListener("online", () => flush());
