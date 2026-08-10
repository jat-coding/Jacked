# Jacked — App Store Readiness

**Status as of 2026-08-09 · current build v1.5 · live at https://jacked-trainer.netlify.app**

Jacked today is a single-file PWA (`jacked-pwa/index.html`, ~225 KB) on Netlify, backed by
Supabase project `qehlrwnumrjktujidabz`. A second client now exists — a standalone Galaxy
Watch (Wear OS) app in the separate `jacked-wear` project — that talks to the SAME Supabase
backend (see `watch-client/API.md` + `SPEC.md`). This file tracks everything standing between
that and an App Store listing. Written to survive a lost session — anything a fresh Claude (or
another dev) needs to pick this up should be here, not in chat.

**None of the six 🔴 blockers below have moved since v1.2** — session work through v1.5 was
data-integrity and features, not App Store gating. What changed: the cloud-sync data-loss bug
class is now fixed (merge-safe backup, v1.5), and there's a second client to keep in mind when
auth lands. See "Changes since v1.2" at the bottom.

---

## The table

| # | Item | Type | Effort | Why it matters |
|---|------|------|--------|----------------|
| 1 | **No authentication at all** | 🔴 Blocker | L | Identity is an unverified username string. Anyone can claim any account. |
| 2 | **RLS policies are `using (true)`** | 🔴 Blocker | M | Every row readable/writable by anyone with the anon key — including full backups. |
| 3 | **Hotlinking `raw.githubusercontent.com`** | 🔴 Blocker | S | Violates GitHub ToS, rate-limited, breaks offline. Must vendor assets. |
| 4 | **Guideline 4.2 — thin web wrapper** | 🔴 Blocker | M | A bare WKWebView of a PWA gets rejected. Needs real native capability. |
| 5 | **In-app account deletion** | 🔴 Blocker | S | Guideline 5.1.1(v). Mandatory for any app with account creation. No exceptions. |
| 6 | **Privacy policy URL** | 🔴 Blocker | S | Guideline 5.1.1. Must be publicly reachable before review. |
| 7 | App Privacy "nutrition labels" | 🟠 Required | S | Declared in App Store Connect. Must match actual data collection. |
| 8 | Apple Developer Program | 🟠 Required | — | $99/year. Gate for everything. |
| 9 | Mac + Xcode | 🟠 Required | — | No Mac = no build. Cloud Mac is a workaround. |
| 10 | Encryption export compliance | 🟠 Required | XS | `ITSAppUsesNonExemptEncryption` in Info.plist. HTTPS-only = exempt. |
| 11 | Screenshots + listing copy | 🟠 Required | S | 6.9" and 6.5" required sizes. |
| 12 | Age rating questionnaire | 🟠 Required | XS | Fitness app — straightforward. |
| 13 | Native wrapper (Capacitor) | 🟠 Required | M | The actual iOS shell. Pairs with #4. |
| 14 | **"Jacked" trademark search** | 🟡 Risk | S | Common fitness term. Check before committing to the name. |
| 15 | Supabase cost at scale | 🟡 Risk | — | Free tier is fine for now. See Capacity below. |
| 16 | Face ID / biometric unlock | 🟢 Wanted | S | Also helps clear #4. **Depends on #1.** |
| 17 | HealthKit sync | 🟢 Wanted | M | Strongest possible answer to #4. |
| 18 | Push notifications | 🟢 Wanted | M | Native entitlement; helps #4. |
| 19 | Offline support | 🟢 Wanted | S | Mostly there via `sw.js`. Blocked by #3. |
| 20 | Exercise DB licence | ✅ Clear | — | free-exercise-db is Unlicense/public domain. Data + images fine to ship. |

Effort: XS < S < M < L.

---

## Detail on the blockers

### 1 + 2 — Auth and RLS (the big one)

`SUPABASE_SETUP.sql` says it outright:

> There is NO auth, so the policies below allow the anonymous key to read/write.
> [...] anyone with your anon key can read/modify these two tables.

The anon key ships in `index.html` (`SUPABASE_ANON_KEY`, ~line 3097) — it is public by
definition. Identity is `code`, a normalised `@username`, with nothing proving you own it. Type
someone's username and you are them. The `backup` column holds a user's **entire workout
history**, readable the same way; the friend-visible `data.wd` (added v1.5) now also exposes a
30-day richer workout summary to anyone with the key.

**Now affects two clients.** The Wear OS app authenticates the same way (username + public
key — see `watch-client/API.md` §0). Whatever auth replaces this must cover the watch too, so
design the token/identity layer as a shared contract, not a PWA-only change.

For a friends app among people you know, fine. For a public App Store listing, it's a data
breach with a queue. **This is the single largest piece of work on the list and most other
items depend on it.**

Path: real Supabase Auth (email/passkey) → `auth.uid()` on every row → rewrite policies from
`using (true)` to ownership checks → migrate existing username-keyed rows to real user IDs
without data loss.

**Do not ship to the App Store before this is done.** Face ID (#16) over unauthenticated
data is a lock on an open door.

### 3 — Vendored assets

```js
const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const DB_URL   = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
```

GitHub raw is not a CDN and their ToS says don't use it as one. It's rate-limited, can go
down independently, and means the exercise library is broken offline — bad for a gym app
where signal is often poor. The *licence* is fine (Unlicense, public domain); the *hosting*
is not. Bundle `exercises.json` and the images into the app, or move them to Supabase
Storage / a real CDN.

### 4 — Guideline 4.2, Minimum Functionality

Apple rejects apps that are "simply a web site bundled as an app." A Capacitor shell around
the current PWA is exactly that shape. Clearing it means genuine native integration — Face
ID (#16), HealthKit (#17), and push (#18) each help. **Pick at least one and do it properly.**
HealthKit is the most persuasive for a fitness app and the most useful to users.

### 5 — Account deletion

Guideline 5.1.1(v): any app that lets you create an account must let you delete it **from
inside the app**. Not an email link, not a web form. Currently there's "sign out = leave this
profile" but no delete. Needs to remove the `profiles` row, `friend_requests` on both sides,
and the avatar in Storage. Small once auth exists; do it in the same pass.

---

## Capacity — where Supabase actually stands

Measured against the real June backup (226 workouts):

| | Before v1.1 | After v1.1 |
|---|---|---|
| `syncMe()` payload | 415 KB | **3.5 KB** |
| 1 hour on leaderboard (144 polls) | 58 MB | **0.5 MB** |

v1.1 fixed a bug where `syncMe()` pushed the full localStorage bundle on every call —
including a 25s poll — and, on failure, fell back to a payload that **silently wiped the
`data` column**, blanking the calendars friends could see. Both symptoms, one cause.

Free tier: 500 MB DB / 5 GB egress / 1 GB Storage / 50k MAU.

- **DB** was never the constraint: ~1,230 heavy users at 415 KB/backup.
- **Egress was**: 58 MB/hr/user would have burned 5 GB in ~86 user-hours. That's what the fix bought.
- **Avatars**: ~15 KB each → ~65,000 in 1 GB. Not a constraint.

Pro is $25/mo (8 GB DB / 250 GB egress). **Don't upgrade to paper over a bug — measure first.**
Unknown: which plan the account is currently on.

---

## Money

| Item | Cost |
|---|---|
| Apple Developer Program | **$99/year** — unavoidable |
| Mac for Xcode | Owned, or ~$50–100/mo cloud Mac |
| Supabase | $0 now; $25/mo Pro when outgrown |
| Netlify | $0 (stays useful for the PWA + marketing site) |
| Trademark search | $0 informal (USPTO TESS); ~$225+/class to file |

**Realistic floor: $99/year plus time.** The cost is the auth work, not the fees.

---

## Suggested order

1. **Auth + RLS** (#1, #2) — everything else depends on it; nothing ships without it.
2. **Account deletion** (#5) — same pass as auth, cheap then.
3. **Vendor assets** (#3) — independent, do anytime, also fixes offline.
4. **Trademark check** (#14) — do early; a rename after launch is expensive.
5. **Pick a native hook** (#16/#17/#18) — clears 4.2.
6. **Capacitor wrapper** (#13) — only once there's something native to wrap.
7. **Privacy policy, labels, screenshots, ratings** (#6, #7, #11, #12) — last mile.

---

## Context a fresh session needs

- **Deploy**: `netlify deploy --prod --dir jacked-pwa --site ae6d4847-2dfe-4e27-becd-0cb83230fbad --message "<version>"`
  (working dir isn't linked — pass `--site`). PowerShell shows netlify's stderr as
  NativeCommandError noise even on success; look for "Deploy is live!", not the exit code.
- **Zips**: one current version-named zip in `C:\Users\jackb\Claude`, overwrite each build,
  keep every 5th as an archive. `v0.22` (baseline) and `v1.0` (milestone) are kept.
- **`BUILD`** in `index.html` = footer version, bump per build (currently `v1.5`). **`APP_VERSION`
  is a data-reset stamp — bumping it wipes all user data.** Leave at `v1.0.0`.
- **Badges** follow the `<Title>-Maxing` convention.
- **Supabase SQL**: `jacked-pwa/SUPABASE_SETUP.sql` is idempotent — safe to re-run whole.
- **Zips**: one current version-named zip in `C:\Users\jackb\Claude`, overwrite each build,
  keep every 5th as an archive. Kept: `v0.22` (baseline), `v1.0` (milestone), `v1.5` (5th-build
  archive).
- **~~Open item~~ (RESOLVED v1.1–v1.5)**: `friend_requests` realtime + the avatar bucket SQL are
  applied and verified working against the project. No longer outstanding.

## Known-good / deliberately deferred

- Username change no longer drops the cloud backup (fixed v1.5 — `changeUsernameSupa` carries the
  `backup`/`data`/`badges`/`avatar_url` columns across and only deletes the old row after the new
  one is confirmed written). BUT it still orphans the old `<username>.jpg` avatar image in
  Storage — the new row's `avatar_url` keeps pointing at the old path (still resolves). Cosmetic;
  not worth fixing before auth reworks the keying.
- Avatar Storage policies have no owner check — anyone with the anon key can overwrite any
  picture. Consistent with the app's existing model; folded into the #1/#2 auth work.
- **Watch client writes a non-normalised `code`** — a bare `watchdev` row (no `@`) appeared
  alongside `@watchdev`, and it skips the `data` column. A `jacked-wear` bug (should `normU` its
  code and, ideally, populate `data`); flag to that project. Harmless to the PWA.
- Supersets (requested, not built). Recommendation: don't invent new metrics — volume and PRs
  should count as they already do. Add **density (volume ÷ duration)**, which supersetting
  genuinely improves. Structurally a `supersetId` on the exercise entry. Most invasive item
  on the feature list; sequence it last.

---

## Changes since v1.2

Not App Store blockers — recorded so the readiness picture stays honest.

- **v1.3** — capitalized exercise categories; portrait-lock guard; Create-Exercise modal z-index fix.
- **v1.4** — (folded with v1.3 UI work) suggested-workout placement, misc.
- **v1.5 (data-integrity release)** —
  - **Merge-safe cloud backup.** `syncBackup()` now GET→merge→write instead of blind-overwrite;
    backs up on every workout finish; deletion tombstones (`jk_deleted`); boot pull-merge; a
    persistent "Back up now" button. Fixes the two 2026-08-08 field data-loss incidents (a stale
    island's daily backup erasing newer workouts). Verified by code review + syntax; the spec's
    real-device `@watchdev` tests are **still pending**.
  - **Username-change backup preservation** (see deferred note above).
  - **Friend workout detail** — a privacy-safe 30-day richer summary (`data.wd`: exercise names +
    best set, no body weight/settings), with tap-through detail on the friend profile. Rolls out
    per-friend as each friend's app updates and syncs once.
