// Account deletion (App Store rule 5.1.1(v)). The caller is identified only by their own
// verified access token; nothing in the body names whose account to delete. body.confirm
// must equal the caller's own username (same normalization as jacked-auth's normU and the
// iPhone's Username.normalize) -- the app already enforces the typed match, this is the
// server's own check.
//
// Delete order matters (live schema, 2026-11-08):
// - profile_backups has a BEFORE DELETE trigger (archive_profile_backup) that copies the
//   blob into profiles_history, so history is cleared AFTER the backup row is gone.
// - profile_backups and live_workouts cascade from profiles; deleting them first just makes
//   each step's failure name the table it failed on.
// - friend_requests has no FK, so both directions are deleted by hand.
// - The avatar (avatars/<code>.jpg) must go before the auth user: Auth refuses to delete a
//   user who still owns Storage objects.
// - The profiles row is the last piece of data, so the only step that can still be pending
//   after it is gone is the auth user itself.
// - The auth user goes LAST: deleting it first would leave the rest with no owner who can
//   ever call this again to finish.
// - account_status_attempts is keyed by IP, not account; feedback rows are messages sent
//   to the developer, not account data. Neither is touched.
//
// Retry: every step is idempotent. If a run fails after the profiles row is gone, the same
// signed-in caller calling again finds no profile and only the auth user is deleted --
// never anything named by the request body.

export function normU(s: unknown): string {
  const h = String(s ?? "").trim().replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  return h ? "@" + h : "";
}

export interface Store {
  getCodeForUser(uid: string): Promise<string | null>;
  deleteBackup(code: string): Promise<void>;
  deleteLiveWorkout(code: string): Promise<void>;
  deleteFriendRequests(code: string): Promise<void>;
  deleteProfile(code: string): Promise<void>;
  deleteHistory(code: string): Promise<void>;
  deleteAvatar(code: string): Promise<void>;
  deleteAuthUser(uid: string): Promise<void>;
}

export type Result = { http: number; body: Record<string, unknown> };
const fail = (http: number, error: string, message: string): Result => ({ http, body: { error, message } });

export async function deleteAccount(store: Store, uid: string, body: { confirm?: unknown }, log = console.error): Promise<Result> {
  const typed = normU(body?.confirm);
  if (!typed) return fail(400, "confirm_required", "type your username to confirm");

  const code = await store.getCodeForUser(uid);
  if (code && typed !== code) return fail(400, "confirm_mismatch", "the username you typed isn't yours");

  const steps: [string, () => Promise<void>][] = code
    ? [
      ["profile_backups", () => store.deleteBackup(code)],
      ["live_workouts", () => store.deleteLiveWorkout(code)],
      ["friend_requests", () => store.deleteFriendRequests(code)],
      ["profiles_history", () => store.deleteHistory(code)],
      ["avatar", () => store.deleteAvatar(code)],
      ["profiles", () => store.deleteProfile(code)],
      // Deleting profiles cascades to profile_backups; if a sync slipped a backup row back in
      // between the steps above, its archive trigger just wrote a fresh history row.
      ["profiles_history", () => store.deleteHistory(code)],
    ]
    : [];
  steps.push(["auth_user", () => store.deleteAuthUser(uid)]);

  for (const [name, run] of steps) {
    try {
      await run();
    } catch (e) {
      log(`jacked-delete-account: step ${name} failed for ${code ?? uid}`, e);
      return fail(500, "delete_failed", `the server stopped partway (${name.replace(/_/g, " ")}); try again`);
    }
  }
  return { http: 200, body: { status: "deleted" } };
}
