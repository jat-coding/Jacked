# Jacked — build the real account-deletion server function

Mr. Roni's go, 2026-11-08 12:03pm: "Yes, build it" to "Build the small server function that
really deletes an account (its data and friendships), so Delete Account works?" This is the
one remaining piece of the `account-deletion` stage in `ios/REWRITE_STATUS.json` (status
`gate`) — the iPhone side is already fully built and wired, waiting on this.

## What already exists (read before writing anything)

- `ios/Jacked/Views/ProfileSheet.swift` (`DeleteAccountSheet`, `AccountDeletion` enum, line
  ~565-647): the iPhone screen, the confirm-by-typing-username step, and the client call are
  done. `AccountDeletion.delete(auth:)` POSTs `functions/v1/jacked-delete-account` with body
  `{"confirm": "<the signed-in user's own username>"}` and the caller's bearer access token,
  and expects back either success or an error message string. `AccountDeletion.serverLive` is
  `false` — flip it to `true` only after the function is deployed for real and verified to
  actually delete an account end to end.
- `supabase/functions/jacked-auth/` (`index.ts` + `logic.ts`) is the only existing Edge
  Function — copy its shape: a thin `index.ts` (CORS, JSON helper, routes to `logic.ts`),
  service-role `admin` client (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` env vars Supabase
  injects), `Deno.serve`. Unlike `jacked-auth` (deploy with `verify_jwt = false`, callers are
  signed-out), this new function's callers ARE signed in, so deploy it with the default
  `verify_jwt = true` and read the caller's identity from the verified JWT (`auth.uid()` via a
  client built with the request's own bearer token, or decode the JWT's `sub` — check which
  pattern Supabase Edge Functions expects for a verified-JWT function with a service-role admin
  client doing the actual writes).
- `supabase/migrations/20261026_set_my_email.sql` is the pattern for a security-definer,
  caller-scoped Postgres function if any piece of this is cleaner as SQL than as
  Edge-Function admin-client calls. Follow its comment style (why, what it touches, rollback
  file) if you add a migration. A full `admin` client in the Edge Function already bypasses
  RLS, so a migration may not be necessary at all — your call.
- Table names and shapes are in `supabase/setup_base.sql` and `supabase/migrations/*.sql`:
  `profiles` (one row per account, `code`/`username`, `user_id` -> `auth.users.id`),
  `profile_backups` (the backup blob), `profiles_history`, `friend_requests` (both directions,
  `from_code`/`to_code`), `account_status_attempts`. Read the actual current schema yourself
  (`regen_setup_sql.sh`'s output or the live project) rather than trusting this list — it may
  be incomplete.
- **Before any Supabase DDL on the real project**, run `scripts/jacked-callers.sh` for every
  table/function you're about to touch (required by `order-rules.py` rule
  `jacked-ddl-needs-caller-read`; works on the Mac). Deploy with
  `scripts/broker/supabase-api` (Supabase Management API) rather than asking Mr. Roni to paste
  SQL by hand — he already gave the go for this specific function.

## What to build

1. A real `functions/v1/jacked-delete-account` Edge Function. On a valid POST with a valid
   bearer session: resolve the caller's own `profiles` row from the verified JWT (never trust
   a user id from the request body), check `body.confirm` equals that caller's OWN username
   (case rule: same normalization `Username.normalize` uses on the client — check
   `logic.ts`/`BackupStore.swift` for the exact rule), and if it doesn't match, return an error
   without deleting anything (defense in depth even though the iPhone UI already enforces the
   typed match).
2. On a confirmed match, delete everything the account owns: the `profile_backups` row, the
   `profiles_history` rows, every `friend_requests` row in either direction
   (`from_code`/`to_code`), the `account_status_attempts` rows if they key by this account,
   `live_workouts` if it has a row for this account, then the `profiles` row itself, and
   **last** `admin.auth.admin.deleteUser(user_id)` (deleting the auth user first would orphan
   the rest with no owner to clean them up). If anything fails partway, don't leave it
   silently half-deleted — log which step failed and return a real error rather than claiming
   success.
3. Return JSON shaped so the client's `AccountDeletion.Outcome` maps cleanly: success ->
   whatever `.deleted` needs (the client just checks the HTTP call didn't throw — match
   `SupabaseHTTP().send`'s success contract, same as `jacked-auth`'s callers), failure -> a
   message string the client surfaces as `.failed(message)`.
4. Write a test mirroring `supabase/tests/*_test.mjs` (e.g. `account_status_hardening_test.mjs`
   for the live-project-call pattern) — **but never touch Mr. Roni's real account.** Create a
   fresh disposable Supabase test account the same way the iOS chain's test account was made
   (sign up for real through `jacked-auth`, give it a couple of fake workouts/friend requests
   so there's something to verify is actually gone), call the new function for real, then
   confirm: the auth user can no longer sign in, the `profiles` row is gone, and any
   `friend_requests` rows involving it are gone too. This is a genuinely destructive call —
   test it against a throwaway account you made for this test, never
   `config/jacked-ios-dev-test-account.json` (that one is shared and reused by the whole iOS
   chain; deleting it would break every later chain job) and never his real account.
5. Once verified live, flip `ProfileSheet.swift`'s `AccountDeletion.serverLive` to `true`,
   build in the simulator on the throwaway iOS chain test account's app session (don't
   actually delete that shared account — use `DevHooks.deleteAccount` only up to the confirm
   screen, or a second disposable account signed into the simulator, to see the real button
   flow work), and confirm the UI's success path (dismiss + sign out) actually fires.

## Guardrails (same as the rest of this chain)

- Never touch `projects/Jacked/jacked-pwa/`, never push the Jacked repo to origin — Mr. Roni's
  go here is for the server function to exist and run live, not for the 50+ local commits to
  be pushed. Commit locally to `main` only (`jacked-worktree-merge.sh --no-push` /
  `--no-origin-sync`, matching every earlier job in this chain).
- The Edge Function and any migration DO get deployed for real to the live Supabase project —
  that's the whole point of his go — but through `scripts/broker/supabase-api`, with the
  `jacked-callers.sh` read done first, never by guessing at the schema.
- This is this chain's last named gate (`REWRITE_BUILD_BRIEF.md`'s hard-stop list). After this
  is done and verified, update `ios/REWRITE_STATUS.json`'s `account-deletion` stage to
  `status: "done"` with a plain-words summary/detail in the same voice as the rest of that
  file, and **stop** — do not self-dispatch `native-extras` or anything past it, that's out of
  scope for this chain per the original brief.

## Output format

Start the output file with a `## Summary` block (TL;DR / What I found and did / Need from
you, Mr. Roni's usual format). "Need from you" should be "Nothing" unless you hit a real
external blocker (a credential only he has, a Supabase project setting you can't change
yourself).
