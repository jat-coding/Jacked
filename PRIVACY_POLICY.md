# Jacked Privacy Policy

Draft, 2026-11-04. Grounded in what the code on `main` actually collects: `supabase/migrations/`,
`jacked-pwa/SUPABASE_SETUP.sql`, `jacked-pwa/index.html`, `watch-client/`. The web copy of
the same policy is `jacked-pwa/privacy.html`. Keep the two in step.

**Placeholders to fill in before publishing** (search for `[[`):
`[[CONTACT_EMAIL]]` (the address people write to for privacy requests) and
`[[EFFECTIVE_DATE]]`. Section 7 also has to change when in-app account deletion
(`APP_STORE_READINESS.md` #5) is built.

**Re-check this policy whenever any of these change:** a new table or column in Supabase, a new
third-party script or SDK, HealthKit (planned, #17), push notifications (#18), analytics or
crash reporting of any kind, or a password-reset email service (#21).

---

## Part 1: The policy (public text)

**Effective date:** [[EFFECTIVE_DATE]]

Jacked is a workout tracker. You log your lifts and cardio, see your progress, and compare
with friends you add. This policy explains exactly what Jacked stores, where, who can see it,
and how to get it deleted. It covers the Jacked iPhone app, the Jacked web app at
jacked-trainer.netlify.app, and the Jacked watch apps, which all use the same account and
the same data.

The short version: we only store what the app needs to work. No ads, no analytics, no
tracking across other apps or websites, and we never sell or rent your data.

### 1. What we collect

**Account**
- Your **username** (your public handle in Jacked, which friends use to add you) and your
  **display name**.
- Your **password**. It is handled by our sign-in provider (Supabase Auth) and stored only
  as a one-way hash. We never see it in plain text.
- Your **email address**, only if you choose to add one. It is optional and used only as
  another way to sign in. We do not send marketing email.

**Your training data**
- **Workouts**: date, name, exercises, sets, weights, reps, distances, durations and paces,
  personal records, routines, custom exercises you create, and your settings.
- **In-progress workout**: while a workout is running it is synced so your phone and watch
  can show the same session.
- **Heart rate and calories**, only if you use a Jacked watch app. The watch records them
  during a workout and they are saved with that workout.

**Body metrics (optional)**
- **Body weight** (and its history, if you log it over time), **birthday**, and **sex**
  (male/female). These are used only to calculate strength rankings and badges on your own
  Metrics screen. You can leave them blank.

**Profile photo (optional)**
- If you upload one, it is stored so friends can see it.

**Friends**
- Who you have sent friend requests to, received them from, and accepted.

**Feedback**
- Anything you type into the in-app Feedback box, together with your username so we can
  follow up.

**Security data**
- When someone tries to sign in, the **IP address** the attempt came from is kept in a
  rate-limit counter for a short window so repeated guessing can be slowed down. It is not
  linked to your account.

**What we do not collect:** your location, contacts, address book, browsing history,
advertising identifiers, payment information, or any usage analytics. Jacked has no
analytics, advertising or crash-reporting software in it.

### 2. Why we use it

Only to run the app for you:
- keep you signed in and protect your account;
- save your workouts to the cloud so they survive a lost or replaced phone and stay in sync
  between your phone, the web app and your watch;
- show your progress, personal records, badges and rankings;
- let the friends you choose see your training and compare on leaderboards;
- read and act on feedback you send.

We do not use your data for advertising, profiling, or anything unrelated to the app.

### 3. Who can see what

**Only you:** your full workout history, body weight, birthday, sex, email address, settings,
and your backup copies.

**Friends you have accepted** can see: your display name, username and photo; your total
volume lifted, number of workouts, personal record count, streak, consistency and badges;
which days you trained; and a summary of your workouts from roughly the last 30 days (workout
name and date, each exercise, and the weight and reps of each set, or distance and pace for
cardio). Friends never see your body weight, birthday, sex or email.

**Any signed-in Jacked user** can look up a username and see that account's username and
profile photo, so friend requests work. Profile photos are stored in a public storage folder,
so anyone who has a photo's exact web address can open it. Do not upload a photo you would
not want to be public.

**Nobody else.** Access is enforced on the server by database rules, not just hidden in the app.

### 4. Service providers that handle your data

We do not sell, rent or share your data with anyone for their own purposes. These companies
process it for us so the app can run:

- **Supabase, Inc.** hosts the Jacked database, sign-in system and file storage (project
  `qehlrwnumrjktujidabz`, running on Amazon Web Services infrastructure). Everything listed in
  section 1 is stored there. Supabase also keeps short-lived technical logs of requests
  (including IP addresses) for operating and securing its service.
- **Netlify, Inc.** hosts the Jacked web app's files. Like any web host it receives your IP
  address and browser details when you load the web app.
- **Web app only:** the web app loads its fonts from **Google Fonts** (Google LLC) and one code
  library from the **jsDelivr** network. Your browser contacts them directly when the web app
  loads, which gives them your IP address and browser details. No account or workout data is
  sent to them. The iPhone app does not use either.
- **Apple** distributes the iPhone app through the App Store and TestFlight under Apple's own
  privacy policy.

We may disclose data if the law requires it, for example a valid court order.

### 5. Your data on your device

The app also keeps a copy of your data on your device so it works offline and loads quickly.
Signing out clears it from that device. You can export a full copy of your data at any time
from Profile, Data & Backup, Export.

### 6. How long we keep it

- Your account, workouts and profile: for as long as you have an account.
- Backup restore points: Jacked keeps up to 14 daily restore points of your backup so lost data
  can be recovered after a sync problem. Older ones are deleted automatically.
- Feedback: until it has been dealt with.
- Sign-in rate-limit counters: overwritten as new attempts come in; they are not tied to an
  account.
- When your account is deleted, everything above that belongs to it is deleted too, including
  restore points and your photo.

### 7. Deleting your account and your rights

You can ask us to delete your account and all of its data at any time by emailing
[[CONTACT_EMAIL]] from the email on your account, or by sending a request through the in-app
Feedback box. We will confirm and complete the deletion within 30 days.

<!-- When APP_STORE_READINESS #5 ships, replace the paragraph above with:
"You can delete your account and all of its data at any time from inside the app:
Profile, Account, Delete account (iPhone: Settings, Delete account). Deletion is immediate
and permanent." and keep the email route as a fallback. -->

You can also ask us for a copy of your data (or export it yourself, see section 5), correct
it (most of it you can edit in the app), or ask any question about how it is handled.
Depending on where you live, you may have further rights under laws such as the GDPR or
California's CCPA/CPRA; write to us and we will honour them.

### 8. Security

Data travels only over encrypted HTTPS connections. Passwords are stored hashed. Database
rules make sure only you (and, for the parts listed in section 3, your accepted friends) can
read your data, and repeated sign-in guessing is rate-limited. No system is perfectly secure,
but we keep what we store to the minimum the app needs.

### 9. Children

Jacked is not directed at children under 13 and we do not knowingly collect data from them. If
you believe a child under 13 has an account, contact us and we will delete it.

### 10. Changes

If this policy changes we will update it here and change the effective date at the top. If a
change affects how your existing data is used, we will tell you in the app first.

### 11. Contact

Questions or requests: [[CONTACT_EMAIL]].

---

## Part 2: App Store Connect privacy label ("nutrition label") answers

For Mr. Roni to copy into App Store Connect > the app > App Privacy. Only he can submit it
(his Apple account). These answers describe the **native iOS app as currently planned**
(talking to the same Supabase backend as the PWA). If HealthKit, push notifications, analytics
or crash reporting get added, revisit.

**Global answers**
- Do you or your third-party partners collect data from this app? **Yes.**
- Used for tracking (linked with third-party data for ads, or shared with data brokers)?
  **No, for every data type below.** No ad SDKs, no analytics SDKs, no IDFA.
- Privacy Policy URL: the hosted `privacy.html` (e.g.
  `https://jacked-trainer.netlify.app/privacy.html` once deployed).

For every data type marked Yes below the answers are the same unless noted:
**Linked to the user's identity: Yes. Used for tracking: No. Purpose: App Functionality only.**
(Not Analytics, not Product Personalization in Apple's sense, not Developer's Advertising,
not Third-Party Advertising, not Other Purposes.)

**Contact Info**
- [x] Name: Yes (display name).
- [x] Email Address: Yes (optional login email). App Functionality.
- [ ] Phone Number: No.
- [ ] Physical Address: No.
- [ ] Other User Contact Info: No.

**Health & Fitness**
- [x] Health: Yes. Body weight and its history, plus heart rate recorded by the watch apps.
  (Conservative call: Apple's definition centres on HealthKit/medical data; body weight and
  heart rate are close enough that declaring them is the safe side. Becomes clearly Yes once
  HealthKit lands.)
- [x] Fitness: Yes. Workouts, sets, reps, weights, distances, calories.

**Financial Info**: all No (no payments, no in-app purchases today).

**Location**: Precise No. Coarse No.

**Sensitive Info**: No. (Biological sex for strength standards is not in Apple's sensitive list,
which covers racial/ethnic data, sexual orientation, pregnancy, disability, religion, union
membership, political opinion, genetic and biometric data.)

**Contacts**: No. (Friends are added by Jacked username; the address book is never read.)

**User Content**
- [ ] Emails or Text Messages: No.
- [x] Photos or Videos: Yes (optional profile photo).
- [ ] Audio Data: No.
- [ ] Gameplay Content: No.
- [x] Customer Support: Yes (in-app Feedback text, stored with the username).
- [x] Other User Content: Yes (names of custom exercises and routines, workout names).

**Browsing History**: No. **Search History**: No.

**Identifiers**
- [x] User ID: Yes (username / account id).
- [x] Device ID: Yes, conservative. The app tags live-workout syncs with an app-generated
  device id (`live_workouts.updated_by`, e.g. `phone-...`) so phone and watch edits can be told
  apart. It is not the advertising identifier. App Functionality.

**Purchases**: No.

**Usage Data**: Product Interaction No. Advertising Data No. Other Usage Data No.

**Diagnostics**: Crash Data No. Performance Data No. Other Diagnostic Data No.
(Apple's own TestFlight/App Store crash reports are collected by Apple, not by the developer,
and are not declared.)

**Other Data**
- [x] Other Data Types: Yes. Birthday and sex (optional, for strength rankings).
  Sign-in attempt IP addresses for rate limiting are kept unlinked from any account; if Apple's
  form is answered per type, this falls under the same "Other Data" entry, purpose App
  Functionality (security), so the linked answer stays Yes because of birthday/sex.

**Related App Store items this data inventory affects**
- Account deletion in-app (readiness #5) is required by Guideline 5.1.1(v) and must exist before
  App Store review; the policy's section 7 is written for the interim and says what to swap in.
- Age rating questionnaire (#12): nothing in the data inventory pushes it above 4+; friends can
  see each other's workouts but there is no free-text chat between users.

---

## Part 3: How each claim was checked (for the next person editing this)

- Tables: `profiles` (code/username, name, email, stats, `data` = friend-visible activity,
  `avatar_url`), `profile_backups` (full localStorage blob: `jk_hist`, `jk_bwlog`, `jk_prof`,
  `jk_settings`, routines, custom exercises), `profiles_history` (daily restore points, newest
  14 per user, plus a one-off `pre_auth_migration` snapshot for accounts that existed before
  2026-09-13), `friend_requests`, `live_workouts` (in-progress session, `hr`, `kcal`,
  `updated_by` device id), `feedback` (username + text), `account_status_attempts` (IP-keyed
  rate-limit counter). Storage buckets: `avatars` (public), `exercise-images` (public, app
  assets only, no user data).
- Friend visibility: `friend_profiles()` / `public_profiles()` in
  `20260925_profiles_public_username_avatar_only.sql`; `myActivity()` and
  `friendWorkoutSummary()` in `index.html` (30-day / 40-workout cap, per-set weights, no body
  metrics).
- Third parties in `index.html` / `sw.js`: only `qehlrwnumrjktujidabz.supabase.co`,
  `fonts.googleapis.com`, `cdn.jsdelivr.net` (supabase-js, pinned with SRI). No analytics.
- Heart rate: `hrSeries`/`hrAvg`/`kcal` written into workouts by the watch apps
  (`watch-client/WATCH_STATUS.md`), preserved verbatim by the PWA's backup merge.
- **Gaps the deletion build (#5) must close for section 6 to be true:** delete the user's
  `profiles_history` rows including `pre_auth_migration`, their avatar object, `live_workouts`,
  both directions of `friend_requests`, their `feedback` rows, `profile_backups`, `profiles`,
  and the `auth.users` row. Note the `archive_profile_backup()` trigger archives a row on
  DELETE, so the deletion must remove `profiles_history` after `profile_backups`, not before.
- `account_status_attempts` rows are never purged (only overwritten per IP). Low priority, but a
  periodic purge would make "short window" literally true.
