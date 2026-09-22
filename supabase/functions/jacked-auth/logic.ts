export type Profile = { code: string; user_id: string | null };

export interface Store {
  getProfile(code: string): Promise<Profile | null>;
  getBackupHistIds(code: string): Promise<string[]>;
  createUser(email: string, password: string): Promise<string | null>;
  deleteUser(id: string): Promise<void>;
  claimProfile(code: string, uid: string): Promise<boolean>;
  insertProfile(code: string, name: string, uid: string): Promise<boolean>;
}

export type RegisterBody = { code?: unknown; password?: unknown; name?: unknown; proofIds?: unknown };

export function normU(s: unknown): string {
  const h = String(s ?? "").trim().replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  return h ? "@" + h : "";
}

// Sets the password for a username: creates the account if the username is free,
// or claims an existing password-less profile. Claiming a profile that already
// exists always requires proof the caller holds that account's data (at least
// one matching workout id) — knowing the username alone is not enough.
//
// profiles.code/name/stats are public (leaderboard), so a bare username is
// guessable/enumerable by anyone with the anon key. A profile with zero cloud
// workout history has nothing to prove against, so it fails closed rather than
// (as before) letting whoever asks first claim it — that let an attacker who
// only knew a public code hijack any never-synced account. A genuine owner of
// a no-history local account needs manual reconciliation, not self-serve claim.
export async function register(store: Store, body: RegisterBody) {
  const code = normU(body.code);
  if (!/^@[a-z0-9_]{3,20}$/.test(code)) return { status: "invalid_username" };
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8 || password.length > 72) return { status: "weak_password" };

  const prof = await store.getProfile(code);
  if (prof?.user_id) return { status: "already_claimed" };

  if (prof) {
    const cloudIds = await store.getBackupHistIds(code);
    const proof = Array.isArray(body.proofIds) ? body.proofIds.slice(0, 5000).map(String) : [];
    const have = new Set(proof);
    if (!cloudIds.length || !cloudIds.some((id) => have.has(id))) return { status: "proof_failed" };
  }

  // Never mailed: login resolves username → email via account_status().
  const email = `${crypto.randomUUID()}@users.jacked.example.com`;
  const uid = await store.createUser(email, password);
  if (!uid) return { status: "error" };

  const name = String(body.name ?? "").trim().slice(0, 40) || code.slice(1);
  const won = prof ? await store.claimProfile(code, uid) : await store.insertProfile(code, name, uid);
  if (!won) {
    await store.deleteUser(uid);
    return { status: prof ? "already_claimed" : "taken" };
  }
  return { status: "ok", email };
}
