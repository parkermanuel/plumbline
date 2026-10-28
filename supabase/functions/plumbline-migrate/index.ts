// Applies supabase/setup.sql to the live database (owner, 28 Oct 2026).
// Why: the GitHub token can deploy functions but can't change the database, so database updates never went live on
// their own. The deploy workflow bundles setup.sql into this function, sets a fresh random key, calls it once, and
// the function runs the file over the project's own database connection (SUPABASE_DB_URL, provided by Supabase).
// setup.sql is safe to run again and again. Without the matching key the function does nothing.
import postgres from "npm:postgres@3.4.4";
import SETUP_SQL from "./setup_sql.ts";

Deno.serve(async (req) => {
  const key = Deno.env.get("PL_MIGRATE_KEY") || "";
  if (key.length < 32 || req.headers.get("x-migrate-key") !== key) return new Response(JSON.stringify({ ok: false }), { status: 403 });
  const url = Deno.env.get("SUPABASE_DB_URL");
  if (!url) return Response.json({ ok: false, error: "SUPABASE_DB_URL missing" }, { status: 500 });
  const db = postgres(url, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 20 });
  try {
    await db.unsafe(SETUP_SQL);
    return Response.json({ ok: true, bytes: SETUP_SQL.length });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error)?.message || e) }, { status: 500 });
  } finally {
    await db.end({ timeout: 5 });
  }
});
