# Jacked — App Store Readiness

**Refreshed 2026-11-04** (previous full pass: 2026-08-09, v1.5) · live PWA at
https://jacked-trainer.netlify.app · native iOS plan: [`IOS_REWRITE_PLAN.md`](./IOS_REWRITE_PLAN.md)

Jacked today is a single-file PWA (`jacked-pwa/index.html`, now ~830 KB) on Netlify, backed by
Supabase project `qehlrwnumrjktujidabz`. Two watch clients (Wear OS `jacked-wear`, watchOS
`jacked-watchos`) talk to the SAME Supabase backend (see `watch-client/API.md`,
`watch-client/AUTH_HANDOFF.md`). This file tracks everything standing between that and an App
Store listing. Written to survive a lost session.

**What changed since 2026-08-09:** the two biggest blockers (#1 auth, #2 RLS) are done and live.
Exercise assets (#3) moved off GitHub in the repo but the live site has not been redeployed yet.
**In-app account deletion (#5) is NOT built**: an earlier memory note said a
`delete_own_account()` RPC shipped; it never reached `main` (zero hits for it anywhere in git
history, all branches, checked 2026-11-04). The App Store route is now a ground-up native
SwiftUI app (#13), decided 2026-10-28, not a wrapper.

How each status below was verified (2026-11-04): reading `supabase/migrations/` + `index.html`
on `main` at `93b6ebf`, plus read-only anon-key probes of the live project (no writes, no
schema calls): `GET /rest/v1/profiles` → `[]`; `profile_backups`, `friend_requests`,
`live_workouts`, `feedback` → `42501 permission denied`; `rpc/account_status` →
`{"status":"not_found"}` for a made-up username; `functions/v1/jacked-auth` with a bad body →
`{"status":"invalid_username"}`; `storage/.../exercise-images/exercises.json` → 200, 1.0 MB;
live `index.html` still has the GitHub `IMG_BASE`.

---

## The table

| # | Item | Type | Effort | Status / why it matters |
|---|------|------|--------|----------------|
| 1 | **Authentication** | ✅ Done | — | Username + password on Supabase Auth since 2026-09-13 (`0d20216`, `20260913_password_auth.sql`, `jacked-auth` edge function). Optional login email added 2026-10-21/26 (`73f1abd`, `10f4508`). Login lookup rate-limited + hardened, applied live 2026-11-03 (`0aa28d5`, `ce59245`). |
| 2 | **RLS lockdown** | ✅ Done | — | Every table now ownership/friendship-checked (`owns_code()`, `is_friend_of()`); see detail. Live probe confirms anon reads get nothing. Residual: `feedback` is still anon-insertable (write-only by design). |
| 3 | **Vendored assets (off `raw.githubusercontent.com`)** | 🟡 Partial | XS | Fixed in repo 2026-11-03 (`93b6ebf`): own `exercise-images` bucket, serving live. **Not deployed to Netlify yet**, and `sw.js` still only caches GitHub URLs (offline cache won't cover the new host). Irrelevant to the native app, which fetches/bundles from the bucket directly. |
| 4 | **Guideline 4.2 — thin web wrapper** | 🟢 Addressed by plan | — | Moot under #13: the iOS app is native SwiftUI, not a WebView. Still worth one clearly native feature (HealthKit/Live Activity) for review and for users. |
| 5 | **In-app account deletion** | 🔴 Blocker | S–M | **Not built.** No delete RPC, no button, nothing in any branch. Guideline 5.1.1(v). Needs a new migration (Mr. Roni's go before it runs live) + UI in both PWA and iOS. See detail. |
| 6 | **Privacy policy URL** | 🟡 Drafted | XS | Drafted 2026-11-04 from the real schema: [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md) + `jacked-pwa/privacy.html`, staged in the repo, **not deployed**. Left: fill `[[CONTACT_EMAIL]]`/`[[EFFECTIVE_DATE]]`, Netlify deploy (Mr. Roni's go). Section 7 must change when #5 ships. |
| 7 | App Privacy "nutrition labels" | 🟡 Drafted | XS | Answers drafted per data type in `PRIVACY_POLICY.md` Part 2 (all App Functionality, linked, no tracking; Health + Fitness declared). Mr. Roni enters them in App Store Connect himself. |
| 8 | Apple Developer Program | ✅ Done | — | Active (Mr. Roni, confirmed 2026-10-28 and 2026-11-04). |
| 9 | Mac + Xcode | ✅ Done | — | Xcode installed on his Mac (2026-11-04). Builds/signing happen there; source is written on the desktop. |
| 10 | Encryption export compliance | 🟠 Required | XS | `ITSAppUsesNonExemptEncryption = NO` already set in the iOS scaffold's Info.plist (HTTPS only = exempt). |
| 11 | Screenshots + listing copy | 🟠 Required | S | Still open. 6.9" and 6.5" sizes. |
| 12 | Age rating questionnaire | 🟠 Required | XS | Still open. |
| 13 | **Native iOS app (SwiftUI rewrite)** | 🟠 In progress | L | Ground-up SwiftUI app talking to the same Supabase backend over its REST/Auth HTTP API, same tables/RPCs/blob format as the PWA and watches. **Not** a wrapper around the PWA. Kickoff 2026-11-04: plan in `IOS_REWRITE_PLAN.md`, project shell + login/signup screen in `ios/`. |
| 14 | **"Jacked" trademark search** | 🟡 Risk (moderate) | — | Informal pass done 2026-11-04 (USPTO search API + App Store). No live bare JACKED mark in Class 9/41/42, but sound-alike **JACK'D** is registered in Class 9 for a dating/social app, "Jacked" is likely refused as descriptive for fitness, and 3+ fitness apps already use the name. Usable with a distinctive App Store name; not ownable as a bare mark. See detail. Not legal clearance. |
| 15 | Supabase cost at scale | 🟡 Risk | — | Free tier is fine for now. See Capacity below. |
| 16 | Face ID / biometric unlock | 🟢 Wanted | S | Unblocked (#1 done). Natural fit for the native app's Keychain-stored session. |
| 17 | HealthKit sync | 🟢 Wanted | M | Strongest native feature; also the smart-scale path Mr. Roni asked for (2026-09-02). |
| 18 | Push notifications | 🟢 Wanted | M | Native entitlement. Rest timer can use local notifications (no server) first. |
| 19 | Offline support | 🟢 Wanted | S | PWA: see #3 `sw.js` gap. Native: local store + queued sync by design. |
| 20 | Exercise DB licence | ✅ Clear | — | free-exercise-db is Unlicense/public domain. Data + images fine to ship. |
| 21 | **Password-reset email** | 🟢 Wanted | S | Tabled 2026-09-21. Accounts can now carry an optional real email (#1), but no reset flow is built. See detail below. |

Effort: XS < S < M < L.

---

## 21 — Password-reset email (tabled)

Mr. Roni asked 2026-09-21 whether he could make an email address for this himself; answer below
is recorded so it's not re-derived. The Supabase Auth login id is still a synthetic
`{uuid}@users.jacked.example.com` (`supabase/functions/jacked-auth/logic.ts`) that is never
mailed. Since 2026-10-21/26 a profile can also carry an optional real `profiles.email`
(signup field + Profile > Account), used only as an alternate login handle. A reset flow would
send to that address, but it is not wired: Supabase's built-in `resetPasswordForEmail` targets
the auth email (synthetic), so this needs a custom path (edge function that looks up
`profiles.email`, mails a link via a transactional service, then sets the password with the
admin API).

Sending needs a domain + a transactional-email service (Resend, Postmark, SendGrid) via DNS
records. No domain is owned for Jacked yet; register one when this is picked up.

## 14 — "Jacked" trademark check (informal, 2026-11-04)

**Method.** Queried the USPTO's own trademark search backend (the API behind
`tmsearch.uspto.gov`) for every word mark containing JACKED (204 records, 74 live), plus the
sound-alikes JACK'D, JAKD, JAKED; then the US App Store (iTunes lookup/search API) and a web
search for apps and fitness brands using the name. This is a knockout search, **not a legal
clearance**: it does not cover state registrations, unregistered common-law use in depth,
foreign registers, or design marks, and it is not a lawyer's opinion.

**Bare JACKED in the classes that matter (9 software, 41 fitness services, 42 SaaS): none
live.** Earlier ones are all dead: JACKED (Roundbox, Class 9, abandoned, sn 77078453); JACKED
(Van De Wall B.V., Class 41/25, cancelled, sn 85416029); JACKED (Jacked, Inc., Class 42/35,
cancelled, sn 77977009). Live bare JACKED marks exist only in unrelated goods: Frito-Lay
(Class 30 snacks, pending, sn 98384663), BEEP BEEP! LLC (Classes 20/25/34, pending),
JACKED! (Dynamic Nutrition, Class 5 supplements, reg 3093105).

**The real risks, most serious first.**
1. **JACK'D, Class 9, registered and live** (reg 4689393 and 4692582, LD Interactive LLC, the
   Jack'd dating app now run by Perry Street Software): "software for dating and social
   networking". Identical sound, same class, and Jacked has social features (friends,
   leaderboards). Goods differ (dating vs workout tracking), so a dispute over *using* the
   name is unlikely, but a USPTO examiner could cite it against a JACKED Class 9 application.
2. **Descriptiveness.** "Jacked" means muscular. For a fitness app, an examiner would likely
   call a bare JACKED merely descriptive (Section 2(e)(1)), so registering it alone would
   probably fail regardless of conflicts. The dozens of compound JACKED fitness marks below
   point the same way: the word is shared, nobody owns it alone.
3. **Crowded App Store.** Live US Health & Fitness apps: "Jacked: Gym Coach & Tracker"
   (Phillip Strong, id6761029900, a strength tracker with AI coach, the closest direct
   competitor, no USPTO filing found), "JackedFit Gym Workout Planner" (id6651836686, sold as
   "Jacked" in Canada), "Jacked Dadbod", "Getting Jacked", "Legally Jacked", "GetJacked:
   Beginner Gym Plan". Google Play has "Jacked - All in One Gym App" (Norbyte) and others.
   Prior users have common-law rights for their own name even without registration.
4. **Compound marks in Class 41/9 fitness (low risk to "Jacked" alone, but crowd the space):**
   JACK'D WELLNESS (fitness training, reg 7382412), GET JACKED (Cross & Clark, fitness
   instruction, reg 6064974), JACKED & PILLED (personal training, reg 8048313), JACKED RABBITS
   (strength training, pending sn 99221745), JACKED JAVELIN (reg 8037023), LEAN IS THE NEW
   JACKED (fitness app, Class 9, reg 6452087), GET JACKED (Anchor Demand, Class 9/42 loyalty
   software, pending sn 99917281).

**Recommendation: real but moderate risk, not a stop.** Using "Jacked" as the brand is
defensible because no one holds it for fitness software, but it cannot realistically be
owned as a bare word, and the App Store name has to differ from existing listings anyway.
Practical path: keep "Jacked" in the icon/brand and ship under a distinctive App Store name
(for example "Jacked: Lift Log with Friends"), and if a registration matters, file the
distinctive compound or a logo, after a paid attorney clearance (roughly a few hundred
dollars for a search opinion, plus about $350 per class to file at the USPTO).

## Detail on the blockers

### 1 + 2 — Auth and RLS (DONE, live)

What is on `main` and live (each migration's header says it was applied by hand in the SQL
editor; live behaviour confirmed by the anon probes above):

- `20260913_password_auth.sql` (`0d20216`): `profiles.user_id → auth.users`; the full workout
  blob moved out of `profiles` into owner-only `profile_backups` (`pb_*` policies,
  `owns_code(code)`); `profiles` update = own row only; `friend_requests` = the two parties
  only; avatar writes = owner only; `account_status()` and `rename_profile()` RPCs.
- `20260924_profiles_data_private.sql`, `20260925_profiles_public_username_avatar_only.sql`
  (`9cb6197`, `57f1768`): `profiles` SELECT is now `owns_code(code) or is_friend_of(code)` for
  `authenticated` only. Strangers get name/username/avatar through `public_profiles()`;
  friends' stats through `friend_profiles()`.
- `20261006_live_workouts.sql`: `live_workouts` (shared phone↔watch session), owner-only.
- `20261016_account_status_rate_limit.sql` + `20261026_account_status_hardening.sql`: per-IP
  throttle on the username→login-id lookup; applied live 2026-11-03.
- `20261026_friend_requests_lockdown.sql` (`4a4fd7f`): only the recipient can accept; inserts
  must be `pending`. Applied live 2026-10-28.
- `20261021_signup_email.sql`, `20261026_set_my_email.sql`: optional login email.

Signup is `POST /functions/v1/jacked-auth {code, password, name, email?, proofIds?}` (service
role creates the auth user + `profiles` row atomically, or claims a password-less legacy
profile only with proof of its workout ids). Login is `rpc/account_status(code)` → synthetic
email → `POST /auth/v1/token?grant_type=password`. The iOS app uses exactly this contract.

Residual, not blocking: `feedback` accepts anon inserts (no read-back for anyone);
`SUPABASE_SETUP.sql` still starts with the old `using (true)` policies but every one is
dropped and replaced further down the same file by the migrations above.

### 3 — Vendored assets (repo done, not deployed)

`93b6ebf` (2026-11-03) points `IMG_BASE`/`DB_URL` at
`https://qehlrwnumrjktujidabz.supabase.co/storage/v1/object/public/exercise-images/` and
rewrites legacy GitHub URLs stored in old workouts (`_LEGACY_IMG_RE`). The bucket is live
(`exercises.json` 200, images 200). Left: (a) a Netlify deploy (needs Mr. Roni's go, as every
prod deploy does); (b) `jacked-pwa/sw.js` line ~81 still matches only
`raw.githubusercontent.com` for its cache-first rule, so photos from the new host are no longer
cached for offline use. Small follow-up fix, not done here.

### 4 — Guideline 4.2, Minimum Functionality

Was the reason a WebView wrapper was risky. The native rewrite (#13) removes the premise. One
genuinely native feature (HealthKit, Live Activity for the rest timer, Face ID) still helps the
review and is planned in `IOS_REWRITE_PLAN.md`.

### 5 — Account deletion (NOT built)

Guideline 5.1.1(v): any app that lets you create an account must let you delete it **from
inside the app**. Not an email link, not a web form. Today there is only "Sign Out", which
clears the device. Needs:

1. A migration with a `security definer` RPC (`delete_own_account()`) that, for `auth.uid()`:
   deletes `live_workouts`, `friend_requests` (both directions), `profile_backups`,
   `profiles_history` rows for the user's code, the `profiles` row, and the avatar object; then
   the `auth.users` row. Deleting from `auth.users` needs the service role, so the clean shape
   is an edge-function action (like `jacked-auth`) rather than a plain SQL RPC.
2. A confirm-twice UI in the PWA (Profile > Account) and in the iOS app (Settings).
3. Watch clients: a deleted account's refresh token dies; they already handle that (AUTH_HANDOFF
   §3d) by returning to sign-in.

Runs against live data, so the migration/function deploy needs Mr. Roni's explicit go.
Must land before App Store submission, not before TestFlight.

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

## Suggested order (refreshed 2026-11-04)

Done: auth + RLS (#1, #2), developer program (#8), Mac + Xcode (#9).

1. **Native app vertical slices** (#13) — sequence in `IOS_REWRITE_PLAN.md`.
2. **Account deletion** (#5) — server function + PWA button + iOS screen. Hard App Store blocker.
3. **Trademark check** (#14) — informal pass done 2026-11-04 (moderate risk, see detail); decide the App Store name before the listing.
4. **Deploy #3 + fix `sw.js` caching** — PWA-side tidy-up, independent.
5. **One native hook** (#16/#17/#18) — HealthKit first.
6. **Privacy policy, labels, screenshots, age rating** (#6, #7, #11, #12) — policy + label answers drafted 2026-11-04 (`PRIVACY_POLICY.md`); last mile, before
   the first App Store (not TestFlight) submission.

## Context a fresh session needs

*(Historical, from the 2026-08-09 pass. Windows paths and the zip routine are out of date: the
desktop clone is `projects/Jacked` under the agent repo; pushes go through
`scripts/jacked-worktree-merge.sh` / `jacked-push.sh`.)*

- **Source of truth is now GitHub**: `https://github.com/jat-coding/Jacked` (branch `main`).
  Git root is the `C:\Users\jackb\Claude` workspace; the app is `jacked-pwa/index.html`. Commit +
  push every change here (build zips, screenshots and data dumps are gitignored). The repo can be
  ahead of the live Netlify deploy (CLI deploy is separate, not auto-wired to GitHub yet).
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
