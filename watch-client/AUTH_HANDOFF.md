# Handoff: password sign-in for watch clients

**For:** jacked-wear (Wear OS) and any other watch client.
**Why:** Jacked accounts now have passwords, and the database only lets a signed-in owner
read or write their data. Until the watch signs in, it can't sync.
**Goes live:** the same moment the PWA update ships. From then on, today's anon-key calls
fail (they error or change 0 rows), so no cloud data is lost. Workouts logged on the watch
before its update must stay queued on the watch until it can sign in.
**Server source of truth:** `supabase/migrations/20260913_password_auth.sql` and
`supabase/functions/jacked-auth/` in the Jacked repo.

Everything in [API.md](./API.md) §3 (the blob format), §7 (the stats formulas) and
[SYNC_PLAYBOOK.md](./SYNC_PLAYBOOK.md) still applies. The rest of this doc covers what
**changes**: auth, where the backup lives, and which writes are allowed.

---

## 1. What changed on the server

| Before | After |
|---|---|
| No auth. The anon key could read or write anything | Supabase Auth. Every data call carries the user's access token |
| `profiles.backup` (anyone could read it) | **`profile_backups.backup`**. Only the owner can read or write it. The `profiles.backup` column is **gone** |
| Clients upsert `profiles` | Clients may only **PATCH** their own `profiles` row (listed columns only). No insert, no delete |
| `friend_requests` open to everyone | Readable and writable only by the two people in the request |
| Anyone can write `avatars/<code>.jpg` | Only the owner of `<code>` can write it. Reads stay public |

Unchanged: base URL, publishable key, blob schema, merge rules, the `updated_at` watermark
approach, and the exercise library.

---

## 2. Accounts: who sets the password

- **The watch never creates an account or sets a password.** The phone does that. An
  existing phone gets a "Protect your account" prompt when it opens the updated PWA.
  Signing up on the web app also sets one.
- The watch **signs in** with a username and password that already exist.
- Usernames keep their current format: lowercase, a leading `@`, then 3–20 characters of
  `a-z 0-9 _`, e.g. `@mom`. Always percent-encode `@` as `%40` in query strings.

---

## 3. Sign-in flow (raw HTTP)

All auth calls send `apikey: sb_publishable_vmf9BELfVFZpKrdMN3Z34g_R9l056gJ` and
`Content-Type: application/json`.

### 3a. Username → account status (no token needed)

```
POST /rest/v1/rpc/account_status
{ "p_code": "@mom" }
```
Response:

| `status` | Meaning | Watch should |
|---|---|---|
| `claimed` (+ `email`) | Has a password | Continue to 3b using `email` |
| `unclaimed` | No password yet | Show "Open Jacked on your phone and set a password first" |
| `not_found` | No such user | Show "No account with that username" |

`email` is a synthetic, never-mailed login id (`<uuid>@users.jacked.example.com`). Don't
display it, and don't try to derive it from the username. Always look it up.

### 3b. Password → session

```
POST /auth/v1/token?grant_type=password
{ "email": "<from 3a>", "password": "<typed>" }
```
`200` → `{ access_token, refresh_token, expires_in, expires_at, user: { id } }`
`400 invalid_credentials` → "Wrong password" (keep the username, clear the password).
`429` → rate limited (about 30 attempts per 5 min per IP): "Too many tries, wait a minute".

### 3c. Every data call after sign-in

```
apikey:        sb_publishable_vmf9BELfVFZpKrdMN3Z34g_R9l056gJ
Authorization: Bearer <access_token>          ← was the publishable key; now the user's token
```

### 3d. Stay signed in (refresh)

Access tokens last about 1 hour. Refresh before `expires_at`, or after any `401`:
```
POST /auth/v1/token?grant_type=refresh_token
{ "refresh_token": "<stored>" }
```
- **Refresh tokens rotate.** Each refresh returns a new `refresh_token` and the old one
  stops working a few seconds later. Save the new pair **atomically, before** using it. If
  a crash or kill loses the new token, the user has to type their password again.
- Retry a failed call **once** after a refresh. If the refresh itself returns `400/401`,
  the session is dead (password changed, signed out elsewhere, or the admin reset it).
  Clear the tokens and show the sign-in screen. **Keep any unsynced local workouts queued.**
- A network failure is *not* a dead session. Keep the tokens and retry later.

### 3e. Sign out

```
POST /auth/v1/logout            (Authorization: Bearer <access_token>)
```
Then delete the stored tokens. If offline, just delete them locally.

### Storage on the watch

Keep `refresh_token`, `access_token`, `expires_at`, `code` and `user.id` in encrypted
storage (Wear OS: `EncryptedSharedPreferences` / Keystore-backed DataStore). **Never store
the password.** The refresh token is what keeps the user signed in.

---

## 4. Data calls — before → after

### Read the backup (full sync)
```
before: GET /rest/v1/profiles?code=eq.%40mom&select=backup,updated_at
after:  GET /rest/v1/profile_backups?code=eq.%40mom&select=backup,updated_at
```
- `[]` means no backup row yet (first sync), **or** you're not the owner. Once signed in as
  that code it means "none yet".
- `profile_backups.updated_at` is **the backup's own watermark**. It's separate from
  `profiles.updated_at`, which stats pushes change. Use this one for CAS.

### Write the backup (conditional update — required)
```
PATCH /rest/v1/profile_backups?code=eq.%40mom&updated_at=eq.<ts0 exactly as the server returned it>
Prefer: return=representation
{ "backup": { …merged blob… }, "updated_at": "<now ISO>" }
```
- `ts0` goes back **verbatim as the server returned it**, but **percent-encoded** in the
  query string — the `+` in `+00:00` must travel as `%2B`, or PostgREST reads it as a space
  and the PATCH never matches (looks like an endless conflict). Use a real query encoder,
  don't hand-build the string.
- Response `[ {…} ]` → landed. `[]` → the watermark moved: re-read, re-merge, retry (max
  about 4 tries), exactly as SYNC_PLAYBOOK §3 describes. Use `select=code` / `return=headers-only`
  patterns if you want to avoid echoing the blob back.
- **First-ever backup only** (the read returned `[]`):
  ```
  POST /rest/v1/profile_backups?on_conflict=code
  Prefer: resolution=merge-duplicates,return=minimal
  { "code": "@mom", "backup": { … }, "updated_at": "<now>" }
  ```

### Stats / friend activity
```
before: POST /rest/v1/profiles?on_conflict=code  { code, …stats… }
after:  PATCH /rest/v1/profiles?code=eq.%40mom    { …stats… }
```
Only these columns are writable: `name, username, total_volume, workouts, prs, streak,
consistency, badges, data, avatar_url, updated_at`. **Don't send `code` or `user_id`.** Any
other column gets `403`/permission denied. The row always exists for a signed-in account.

### Cheap poll
`GET /rest/v1/profiles?code=eq.%40mom&select=total_volume,workouts,prs,streak,updated_at` still
works (profiles stay publicly readable). To detect *backup* changes, poll
`profile_backups?…&select=updated_at` with the token instead.

### Friends (if used)
`friend_requests` calls need the token, and they only return or modify rows where you are
`from_code` or `to_code`. New requests must have `from_code` = your code.

### Avatar (if used)
`POST /storage/v1/object/avatars/%40mom.jpg` with `Authorization: Bearer <access_token>` and
`x-upsert: true`. Public reads are unchanged.

---

## 5. Error cheat-sheet

| Response | Meaning | Action |
|---|---|---|
| `401` (`PGRST301`/`PGRST303`, "JWT expired") | Access token expired | Refresh (3d), retry once |
| `42501` / `403` "permission denied" | Wrong column, wrong table, or not signed in | Bug. Check the token and that you aren't sending `code`/`user_id` |
| "new row violates row-level security policy" | Writing a code you don't own | Signed in as a different user than `code`: sign out |
| `PATCH` returns `[]` | CAS miss, or not the owner | Re-read; if still `[]` while signed in, treat as a CAS miss |
| `42703` "column profiles.backup does not exist" | Old endpoint still in use | Switch to `profile_backups` |

---

## 6. Watch UX (suggested)

1. **Sign-in screen** (first launch after the update, or after a dead session): username
   field → `account_status` → password field → sign in. On-watch keyboard or voice input is
   fine, because it's a one-time step thanks to refresh tokens.
2. After signing in: run a normal full sync (read → merge local queue → CAS write).
3. `unclaimed` → one clear screen: "Set a password in the Jacked app on your phone, then try
   again."
4. Settings: "Signed in as @mom", plus a **Sign out** button.
5. Never block logging a workout on auth. Log locally, queue it, and sync when signed in.

---

## 7. Testing

- Use the scratch accounts only: `@watchdev2` (empty) and `@watchdev` (has workouts).
- To give `@watchdev2` a password: in the Jacked web app on a fresh browser, **sign up with
  username `@watchdev2`**. Empty unclaimed accounts can be claimed that way. `@watchdev` has
  workouts, so it can only be claimed from a device that already holds them. Otherwise ask
  the Jacked admin to set it.
- Must-pass checks before shipping:
  1. Wrong password → rejected, nothing synced.
  2. Kill the app mid-refresh, relaunch → either still signed in or cleanly asks for the
     password. Never a crash loop, never lost queued workouts.
  3. Token expiry (wait more than 1 hour, or corrupt `access_token`) → silent refresh, sync
     succeeds.
  4. Two devices (phone PWA + watch) write the same minute → both workouts survive (CAS on
     `profile_backups.updated_at`).
  5. Offline workout → comes online → syncs with no password prompt.
  6. Sign out → tokens gone; the next launch shows sign-in and local unsynced data is still
     queued.
