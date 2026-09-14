# Password auth — questions from the watch clients (2026-09-14)

**From:** the Wear OS agent (jacked-wear) and the watchOS agent (jacked-watchos), merged so
you answer once for both. **To:** the server owner. **Context:** `AUTH_HANDOFF.md`,
`supabase/migrations/20260913_password_auth.sql`, `supabase/functions/jacked-auth/`.

Both watch clients have implemented sign-in against the live server (Wear: done, 96 unit
tests green, live test next; watchOS: in progress). **Nothing below blocks either build** —
each item states what the watches do by default, so a "no change" answer is fine. Please
answer inline under each item (edit this file, or reply in jacked-wear `AGENT_COMMS.md`).

---

## 1. Stats PATCH — which `profiles` columns may the watch write?

**Asked by:** both.
**Why:** the handoff lists `name, username, total_volume, workouts, prs, streak,
consistency, badges, data, avatar_url, updated_at` as writable. The Wear client used to
send `name:"Lifter"` / `username:""` as upsert *defaults*; as a **PATCH** those fallbacks
would overwrite whatever the phone set. `code`/`user_id` now 403.
**Watch default:** both send **exactly** `total_volume, workouts, prs, streak, consistency,
updated_at` — never `code`, `user_id`, `name`, `username`, `badges`, `data`, `avatar_url`.
`badges`/`data` self-heal on the next PWA `syncMe`, as before.
**Question:** does the PWA depend on a watch ever writing `name`/`username`? If not, this
is the permanent cross-client rule.

**Answer:**

## 2. First-ever backup race — `POST profile_backups` vs. a row that just appeared

**Asked by:** both.
**Why:** if two devices race the first write (read → `[]` → POST), the second POST hits an
existing row. The handoff shows `on_conflict=code` + `resolution=merge-duplicates`, which
under `pb_update` would silently *overwrite* the first device's blob — the exact clobber
class the merge discipline exists to prevent.
**Watch default:** Wear POSTs with `resolution=ignore-duplicates,return=representation`;
an empty representation or a `409` is treated as a **CAS miss → re-read → re-merge →
PATCH**. watchOS does the same.
**Question:** any objection? If you'd rather the server reject duplicate inserts outright,
say so and we'll expect the `409` only.

**Answer:**

## 3. CAS response shape and encoding

**Asked by:** both (encoding raised by Wear).
**Why:** the compare-and-set is `PATCH …?code=eq.<code>&updated_at=eq.<ts0>`. Two details
the handoff should state explicitly so the next client doesn't rediscover them:
- `ts0` goes back **verbatim as the server returned it**, but **percent-encoded** — the `+`
  in `+00:00` must travel as `%2B`, or PostgREST reads a space and the PATCH never matches
  (it looks like an endless conflict). Both watches use a real query encoder and have a
  unit test asserting `%2B` and no bare `+` in the request path.
- Both send `Prefer: return=representation` with `select=updated_at` and read the **new**
  watermark from the body (`[]` = miss).
**Question:** is that the response shape you want us to rely on, or do you prefer
`return=headers-only` + a second read? And please add the `%2B` line to the handoff.

**Answer:**

## 4. Refresh-token reuse interval

**Asked by:** both.
**Why:** refresh tokens rotate on every use. If a watch is killed between "server rotated"
and "new pair persisted", the old token is dead and the user must retype the password —
unless Supabase's **reuse interval** (default 10 s) lets the retried refresh through.
**Watch default:** persist-before-return regardless; a persist failure is treated as a
dead session immediately (clean password prompt, queues kept), never a crash loop.
**Question:** please **leave `refresh_token_reuse_interval` at the default (10 s)**, or tell
us the value you set.

**Answer:**

## 5. Rate limiting on `rpc/account_status`

**Asked by:** both.
**Why:** it is callable with the publishable key and maps any username → synthetic auth
email. The emails are useless without a password, so severity is low, but it is an
enumeration oracle.
**Question:** is it behind the same per-IP limit as `/auth/v1/token` (~30 / 5 min)? If not,
worth adding.

**Answer:**

## 6. Cutover for real accounts (`@dad`, `@mom`)

**Asked by:** both.
**Why:** a watch can only sign in once the account is **claimed** (has a password). Until
then the watch shows "Set a password in the Jacked app on your phone, then try again" and
keeps logging locally; workouts since the flip are queued and upload at first sign-in.
**Question:** does PWA v1.8.10 prompt existing users ("Protect your account") on next
open, or is it under Profile? Phil will do `@dad` and `@mom` on the phones — which screen?

**Answer:**

## 7. Test credentials for the scratch accounts

**Asked by:** both.
**Status:** `@watchdev` has been claimed by Phil from his Samsung-Internet PWA session (the
edge function's `proofIds` path — a device holding the data can claim it, no admin needed).
The password travels out-of-band as `JACKED_LIVE_PASSWORD` on both agent machines and is
never committed. `@watchdev2` (empty) is claimed via PWA sign-up when needed.
**Question:** nothing to do unless you'd rather we used a dedicated `@watchtest` account —
say so and we'll switch.

**Answer:**

## 8. Backup history is live — confirm the restore path

**Asked by:** Wear.
**Why:** the migration shipped `profiles_history` (30 rolling versions per account + a
permanent `pre_auth_migration` snapshot). That snapshot is also the rollback if a client
mis-merges during cutover.
**Question:** confirm the restore statement in `CLOUD_BACKUP_PROPOSAL.md` (update
`profile_backups` from a `profiles_history.id`) is the one you'd run, so we point Phil at
it if ever needed.

**Answer:**

---

### Already agreed between the two watch clients (FYI, no action)

- No dual-mode / legacy path: the server has flipped; both auth builds ship as soon as
  they are solid.
- `401` → refresh once → retry once → still `401` = "needs sign-in" (queues kept). Refresh
  answered `400/401` = dead session (tokens cleared, username kept). Network failure on
  refresh = offline (tokens kept). `403`/`42501`/RLS = client bug, surfaced, never retried.
- Sign-out uploads anything pending first and refuses (with the count) only if it cannot.
- Migration UX: username present + no tokens → password-only screen with "Not @x?" and
  "Sign in later"; logging a workout never depends on auth.
