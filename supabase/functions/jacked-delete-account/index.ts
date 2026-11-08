// Deploy with verify_jwt = true (the default): callers are signed in, and the platform rejects
// any request whose bearer is not a valid session token before this code runs. The caller is
// then resolved from that same token via Auth (admin.auth.getUser), never from the body.
import { createClient } from "npm:@supabase/supabase-js@2";
import { deleteAccount, type Store } from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const must = ({ error }: { error: unknown }) => { if (error) throw error; };

const store: Store = {
  async getCodeForUser(uid) {
    const { data, error } = await admin.from("profiles").select("code").eq("user_id", uid).maybeSingle();
    if (error) throw error;
    return data?.code ?? null;
  },
  async deleteBackup(code) { must(await admin.from("profile_backups").delete().eq("code", code)); },
  async deleteLiveWorkout(code) { must(await admin.from("live_workouts").delete().eq("code", code)); },
  async deleteFriendRequests(code) {
    must(await admin.from("friend_requests").delete().eq("from_code", code));
    must(await admin.from("friend_requests").delete().eq("to_code", code));
  },
  async deleteHistory(code) { must(await admin.from("profiles_history").delete().eq("code", code)); },
  // remove() of a missing object is not an error, so a profile with no photo passes.
  async deleteAvatar(code) { must(await admin.storage.from("avatars").remove([`${code}.jpg`])); },
  async deleteProfile(code) { must(await admin.from("profiles").delete().eq("code", code)); },
  async deleteAuthUser(uid) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error && (error as { status?: number }).status !== 404) throw error;
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "bad_request", message: "POST only" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who, error: whoErr } = token ? await admin.auth.getUser(token) : { data: null, error: true };
  const uid = who?.user?.id;
  if (whoErr || !uid) return json({ error: "not_signed_in", message: "you're signed out" }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request", message: "bad request" }, 400); }
  try {
    const r = await deleteAccount(store, uid, body);
    return json(r.body, r.http);
  } catch (e) {
    console.error("jacked-delete-account", e);
    return json({ error: "error", message: "the server had a problem; nothing was deleted" }, 500);
  }
});
