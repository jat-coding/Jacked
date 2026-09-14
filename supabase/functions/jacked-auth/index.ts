// Deploy with verify_jwt = false: callers are signed-out devices using the
// publishable key, which is not a JWT.
import { createClient } from "npm:@supabase/supabase-js@2";
import { register, type Store } from "./logic.ts";

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

const store: Store = {
  async getProfile(code) {
    const { data, error } = await admin.from("profiles").select("code,user_id").eq("code", code).maybeSingle();
    if (error) throw error;
    return data;
  },
  async getBackupHistIds(code) {
    const { data, error } = await admin.from("profile_backups").select("backup").eq("code", code).maybeSingle();
    if (error) throw error;
    const hist = data?.backup?.jk_hist;
    return Array.isArray(hist) ? hist.filter((w) => w && w.id != null).map((w) => String(w.id)) : [];
  },
  async createUser(email, password) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) { console.error("createUser", error); return null; }
    return data.user?.id ?? null;
  },
  async deleteUser(id) {
    await admin.auth.admin.deleteUser(id);
  },
  async claimProfile(code, uid) {
    const { data, error } = await admin.from("profiles").update({ user_id: uid }).eq("code", code).is("user_id", null).select("code");
    if (error) throw error;
    return (data ?? []).length === 1;
  },
  async insertProfile(code, name, uid) {
    const { error } = await admin.from("profiles").insert({ code, name, username: code, user_id: uid });
    if (error?.code === "23505") return false;
    if (error) throw error;
    return true;
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ status: "bad_request" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ status: "bad_request" }, 400); }
  try {
    return json(await register(store, body));
  } catch (e) {
    console.error("jacked-auth", e);
    return json({ status: "error" }, 500);
  }
});
