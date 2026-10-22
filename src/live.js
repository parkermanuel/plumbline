// Live data layer: Supabase auth for network leaders, link-based saving for planters, spouses and references.
import { createClient } from "@supabase/supabase-js";

const CFG = (typeof window !== "undefined" && window.PLUMBLINE_CONFIG) || {};
export const LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
export const sb = LIVE ? createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } }) : null;

export const state = { session: null, cases: [], loaded: false, error: null };
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = (why) => listeners.forEach((fn) => fn(why));

export const siteUrl = () => (CFG.siteUrl || location.origin).replace(/\/$/, "");
export const personLink = (token) => `${siteUrl()}/#/t/${token}`;
export const refLink = (refToken) => `${siteUrl()}/#/r/${refToken}`;

// ---------- leaders ----------
export async function initAuth() {
  if (!LIVE) return;
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  sb.auth.onAuthStateChange((_e, session) => {
    const was = !!state.session;
    state.session = session;
    if (session && !was) { loadCases(); subscribe(); }
    if (!session) { state.cases = []; state.loaded = false; }
    emit("auth");
  });
  if (state.session) { await loadCases(); subscribe(); }
}

export async function sendMagicLink(email) {
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: siteUrl() + "/" } });
  if (error) throw error;
}
export async function signOut() { await sb.auth.signOut(); }

function toCase(row, people) {
  const ps = people.filter((p) => p.case_id === row.id);
  const done = (role) => ps.find((p) => p.role === role && p.status === "finished")?.answers || null;
  return {
    id: row.id, live: true,
    label: row.married && row.spouse_name ? `${row.planter_name.split(" ")[0]} & ${row.spouse_name}` : row.planter_name,
    planterName: row.planter_name, spouseName: row.spouse_name || "", married: row.married, city: row.city,
    network: { name: row.network_name, signGifts: row.sign_gifts }, created: row.created_at?.slice(0, 10),
    refToken: row.ref_token, released: row.reports_released, notesRemote: row.notes || {},
    people: ps.sort((a, b) => ["planter", "spouse", "reference"].indexOf(a.role) - ["planter", "spouse", "reference"].indexOf(b.role) || (a.created_at || "").localeCompare(b.created_at || "")),
    planter: done("planter"), spouse: done("spouse"),
    refs: ps.filter((p) => p.role === "reference" && p.status === "finished").map((p) => p.answers),
  };
}
let rows = [], people = [];
const rebuild = () => { state.cases = rows.filter((r) => !r.archived).map((r) => toCase(r, people)); };

export async function loadCases() {
  try {
    const [c, p] = await Promise.all([
      sb.from("cases").select("*").order("created_at", { ascending: false }),
      sb.from("participants").select("id,case_id,role,token,name,relationship,status,step,total,progress,chapter,answers,started_at,finished_at,updated_at"),
    ]);
    if (c.error) throw c.error; if (p.error) throw p.error;
    rows = c.data; people = p.data; rebuild(); state.loaded = true; state.error = null;
  } catch (err) { state.error = err.message || String(err); }
  emit("cases");
}

let channel = null;
function subscribe() {
  if (channel) return;
  channel = sb.channel("pl-progress")
    .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, (payload) => {
      const n = payload.new, old = payload.old;
      if (payload.eventType === "DELETE") people = people.filter((x) => x.id !== old.id);
      else {
        const i = people.findIndex((x) => x.id === n.id);
        if (i >= 0) people[i] = { ...people[i], ...n }; else people.push(n);
      }
      rebuild(); emit("progress");
    })
    .subscribe();
}

export async function createCase(f) {
  const { data, error } = await sb.from("cases").insert({
    leader_id: state.session.user.id, planter_name: f.planterName, spouse_name: f.married ? f.spouseName : null,
    married: f.married, city: f.city || null, network_name: f.network || null, sign_gifts: f.signGifts,
  }).select().single();
  if (error) throw error;
  rows.unshift(data);
  await loadCases();
  return data.id;
}
export async function setReleased(id, released) {
  const { error } = await sb.from("cases").update({ reports_released: released }).eq("id", id);
  if (error) throw error;
  const r = rows.find((x) => x.id === id); if (r) r.reports_released = released; rebuild(); emit("cases");
}
export async function archiveCase(id) {
  const { error } = await sb.from("cases").update({ archived: true }).eq("id", id);
  if (error) throw error;
  rows = rows.filter((x) => x.id !== id); rebuild(); emit("cases");
}
let noteTimer = null;
export function saveNotes(id, notes) {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(async () => { await sb.from("cases").update({ notes }).eq("id", id); const r = rows.find((x) => x.id === id); if (r) r.notes = notes; }, 700);
}
export async function resetPerson(participantId) {
  const { error } = await sb.from("participants").update({ status: "started", finished_at: null, progress: 0, step: 0 }).eq("id", participantId);
  if (error) throw error;
}

// ---------- people with a link ----------
export async function openToken(token) {
  const { data, error } = await sb.rpc("pl_open", { p_token: token });
  if (error) throw error;
  return data;
}
export async function refCase(refToken) {
  const { data, error } = await sb.rpc("pl_ref_case", { p_ref_token: refToken });
  if (error) throw error;
  return data;
}
export async function joinReference(refToken, name) {
  const { data, error } = await sb.rpc("pl_join_reference", { p_ref_token: refToken, p_name: name });
  if (error) throw error;
  return data;
}
export async function report(token) {
  const { data, error } = await sb.rpc("pl_report", { p_token: token });
  if (error) throw error;
  return data;
}

// Saving: every answer saves locally at once and to the server shortly after.
const saver = { timer: null, pending: null, status: "saved", inflight: false };
export const saveStatus = () => saver.status;
export function queueSave(token, answers, step, total, chapter) {
  try { localStorage.setItem("pl.backup." + token, JSON.stringify({ answers, step, at: Date.now() })); } catch {}
  saver.pending = { token, answers, step, total, chapter };
  saver.status = "saving"; emit("save");
  clearTimeout(saver.timer);
  if (Date.now() - (saver.last || 0) > 4000) flush(); // never go more than a few seconds unsaved
  else saver.timer = setTimeout(flush, 500);
}
export async function flush() {
  if (!saver.pending || saver.inflight) return;
  const p = saver.pending; saver.pending = null; saver.inflight = true; saver.last = Date.now();
  try {
    const { error } = await sb.rpc("pl_save", { p_token: p.token, p_answers: p.answers, p_step: p.step, p_total: p.total, p_chapter: p.chapter });
    if (error) throw error;
    saver.status = saver.pending ? "saving" : "saved";
  } catch {
    saver.pending = saver.pending || p; saver.status = "offline";
    clearTimeout(saver.timer); saver.timer = setTimeout(flush, 4000);
  } finally { saver.inflight = false; emit("save"); if (saver.pending && saver.status !== "offline") flush(); }
}
export async function finish(token, answers) {
  clearTimeout(saver.timer); saver.pending = null;
  const { data, error } = await sb.rpc("pl_finish", { p_token: token, p_answers: answers });
  if (error) throw error;
  try { localStorage.removeItem("pl.backup." + token); } catch {}
  return data;
}
export function backup(token) { try { return JSON.parse(localStorage.getItem("pl.backup." + token) || "null"); } catch { return null; } }
if (typeof window !== "undefined") window.addEventListener("online", () => flush());
