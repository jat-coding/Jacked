import { register, type Store } from "../functions/jacked-auth/logic.ts";
function fake(profiles: Record<string, string|null>, hist: Record<string, string[]>) {
  const users = new Set<string>(); let n = 0;
  const s: Store & { users: Set<string> } = {
    users,
    async getProfile(c) { return c in profiles ? { code: c, user_id: profiles[c] } : null; },
    async getBackupHistIds(c) { return hist[c] ?? []; },
    async createUser() { const id = "u" + (++n); users.add(id); return id; },
    async deleteUser(id) { users.delete(id); },
    async claimProfile(c, uid) { if (profiles[c] !== null) return false; profiles[c] = uid; return true; },
    async insertProfile(c, _n, uid) { if (c in profiles) return false; profiles[c] = uid; return true; },
  };
  return s;
}
let fails = 0;
const eq = (a: unknown, b: unknown, m: string) => { const p = a === b; console.log((p ? "PASS " : "FAIL ") + m + (p ? "" : ` got=${a}`)); if (!p) fails++; };
const PW = "hunter2hunter2";
{ const s = fake({ "@mom": null }, { "@mom": ["w1", "w2"] });
  eq((await register(s, { code: "@mom", password: PW, proofIds: ["zzz"] })).status, "proof_failed", "wrong proof rejected");
  eq((await register(s, { code: "@mom", password: PW })).status, "proof_failed", "missing proof rejected");
  eq(s.users.size, 0, "no auth user created on failed proof");
  const r = await register(s, { code: "MOM", password: PW, proofIds: ["x", "w2"] });
  eq(r.status, "ok", "matching proof claims (username normalised)");
  eq(typeof (r as {email?: string}).email, "string", "email returned");
  eq((await register(s, { code: "@mom", password: PW, proofIds: ["w1"] })).status, "already_claimed", "second claim refused"); }
{ const s = fake({ "@empty": null }, {});
  eq((await register(s, { code: "@empty", password: PW })).status, "ok", "empty-history account claimable without proof"); }
{ const s = fake({}, {});
  eq((await register(s, { code: "@newbie", password: PW, name: "New" })).status, "ok", "new username signup");
  eq((await register(s, { code: "@newbie", password: PW })).status, "already_claimed", "taken new username"); }
{ const s = fake({}, {});
  eq((await register(s, { code: "@ab", password: PW })).status, "invalid_username", "short username");
  eq((await register(s, { code: "@abc", password: "short" })).status, "weak_password", "short password");
  eq((await register(s, { code: "@abc", password: 12345678 })).status, "weak_password", "non-string password"); }
{ // race: profile claimed between check and claim → auth user rolled back
  const s = fake({ "@race": null }, {});
  const orig = s.claimProfile; s.claimProfile = async (c, u) => { await orig("@race", "other"); return orig(c, u); };
  eq((await register(s, { code: "@race", password: PW })).status, "already_claimed", "race loser told already_claimed");
  eq(s.users.size, 0, "race loser's auth user deleted"); }
console.log(fails ? `${fails} FAILED` : "ALL PASS");
if (fails) Deno.exit(1);
