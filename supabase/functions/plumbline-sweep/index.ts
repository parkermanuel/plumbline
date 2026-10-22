// Plumbline sweep (Supabase Edge Function), run once a day by .github/workflows/sweep.yml.
// Deletes uploaded result files that no assessment points to any more: the person was deleted or purged,
// or they removed the file in the app. It only ever deletes, so it's safe for anyone to call.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const bucket = admin.storage.from("results");
  let removed = 0;
  for (let offset = 0; ; offset += 100) {
    const { data: folders, error } = await bucket.list("", { limit: 100, offset });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!folders?.length) break;
    const tokens = folders.filter((f) => !f.id && /^[0-9a-f]{64}$/.test(f.name)).map((f) => f.name);
    if (!tokens.length) { if (folders.length < 100) break; continue; }
    const { data: people } = await admin.from("participants").select("token, answers").in("token", tokens);
    const keep = new Map((people ?? []).map((p: any) => [p.token, new Set((p.answers?.other?.files ?? []).map((f: any) => f.path))]));
    for (const t of tokens) {
      const { data: files } = await bucket.list(t, { limit: 100 });
      const gone = (files ?? []).map((f) => `${t}/${f.name}`).filter((path) => !keep.get(t)?.has(path));
      // Leave files added in the last day alone: the person may still be saving.
      const recent = new Set((files ?? []).filter((f) => Date.now() - new Date(f.created_at).getTime() < 86400000).map((f) => `${t}/${f.name}`));
      const del = keep.has(t) ? gone.filter((p) => !recent.has(p)) : gone;
      if (del.length) { await bucket.remove(del); removed += del.length; }
    }
    if (folders.length < 100) break;
  }
  return Response.json({ removed });
});
