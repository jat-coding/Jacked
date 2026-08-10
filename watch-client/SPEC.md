# Jacked Watch — Standalone Wear OS client spec

**Target device:** Samsung Galaxy Watch 8 Classic (Wear OS 5 / One UI Watch, Exynos W1000,
~1.34" 438×438 circular AMOLED, rotating bezel + two side buttons, LTE or Wi-Fi).
**Mode:** **Standalone** — the watch talks directly to the Jacked cloud with **no companion
phone app required** during a workout.
**Backend contract:** [API.md](./API.md). **Server limitations:** `../APP_STORE_READINESS.md`.

The goal: log a full weightlifting session from the wrist in a gym — pick exercises, enter
weight × reps, rest-timer, save — and have it appear in the phone/web app, and vice-versa,
because both read and write the same one-user database (`profiles.backup`, per API.md §2).

---

## 1. Scope

### In scope (v1)
- Read the user's **complete** lifting database from the cloud on launch.
- Log a new workout on the watch: add exercises, enter sets (weight×reps, plus cardio &
  bodyweight/reps/duration variants), check sets done, rest timer, finish & save.
- Write changes back to the cloud so the phone/web app sees them (and merges without data loss).
- View recent history and current PRs for an exercise.
- Work through a dropped connection: **log offline, sync when back**.

### Out of scope (v1)
- Friends / leaderboard / social (single-user only — API.md §9).
- Editing avatars, routines authoring beyond "start from an existing routine".
- Any real authentication (there is none server-side yet — §7 of this doc, and API.md §0).
- Being a "companion" of the phone app over Bluetooth. This is a **direct-to-cloud** client.

---

## 2. Platform decisions

| Concern | Decision | Why |
|---|---|---|
| Language / UI | **Kotlin + Jetpack Compose for Wear OS** (`androidx.wear.compose`) | The standard, first-class Wear OS 5 toolkit; scrolling lists, time-text, rotary input built in. |
| Min / target SDK | minSdk 33 (Wear OS 4) or 34, target latest | Galaxy Watch 8 Classic is Wear OS 5; 33 keeps one prior gen working. |
| Networking | **Ktor client** or **Retrofit + OkHttp** + kotlinx.serialization | Plain REST against PostgREST (API.md). No Supabase SDK needed; `supabase-kt` is optional sugar. |
| Local store | **Room** (or DataStore for the blob) | The offline queue + a local mirror of the database. Room if you want to query history offline. |
| Connectivity | Wi-Fi or LTE directly; **do not** depend on a paired phone | "Standalone" requirement. Declare the app standalone in the manifest (`meta-data` `WATCH_APP_STANDALONE=true`). |
| Async | Coroutines + `WorkManager` for deferred sync | Battery-friendly retry of queued writes. |

**Standalone manifest flags** (both, so it installs & runs without the phone app):
```xml
<meta-data android:name="com.google.android.wearable.standalone" android:value="true"/>
<uses-feature android:name="android.hardware.type.watch"/>
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.WAKE_LOCK"/>   <!-- rest timer -->
```

---

## 3. Data & sync architecture

The server has **no per-set API** — the whole database is one JSON blob (API.md §2, §6). So the
watch keeps a **local mirror** and treats the cloud as a blob to reconcile with.

```
┌────────────┐   full read (blob)    ┌──────────────────────┐
│  Supabase  │◀──────────────────────│  Watch: LocalDb       │
│  profiles  │   whole-blob upsert    │  (Room mirror of the  │
│  .backup   │──────────────────────▶│   jk_* database)       │
└────────────┘                        │  + OutboxQueue         │
                                      └──────────────────────┘
```

**Model layer (mirror of API.md §3), keep these as Kotlin data classes:**
`Database(jkHist, jkPrs, jkCardioPr, jkRoutines, jkProf, jkSettings, jkBw, jkBwlog, passthrough…)`,
`Workout`, `Exercise`, `Set`, `PR`, `CardioPR`, `Routine`. Serialize/deserialize with the *exact*
key names and units (kilograms canonical) so the PWA can still read what the watch writes.

### Sync rules (implement exactly)
1. **On launch / resume:** full read (API.md §4a). If offline, use the last local mirror.
2. **All edits happen on the local mirror first** and are immediately persisted (survive a crash
   mid-set).
3. **On "Finish workout"** (and opportunistically on resume with a pending outbox):
   - re-check `updated_at` (API.md §4b); if the cloud moved since last read, **re-fetch and
     re-apply** the queued change onto the fresh blob (append the new workout, re-commit PRs),
   - write `backup` first, then the recomputed stat columns (API.md §6–§7),
   - only clear the outbox item on a confirmed `2xx`.
4. **Conflict policy:** last-write-wins *after* re-merge. A single user is rarely editing on watch
   and phone in the same instant; the re-fetch-before-write step (API.md §6) makes the common case
   safe. Never blind-overwrite `backup`.
5. **Offline:** queue the finished workout in the outbox; `WorkManager` retries with backoff when
   connectivity returns. The user must be able to finish and leave the gym with no signal and trust
   it'll land.

> **Golden rule from the PWA's history of bugs:** never send `backup` or `data` unless it's the
> full, current object. A partial write is what previously blanked friends' calendars (API.md §10).

---

## 4. Screens & flows

Design for a **1.34" circular screen, gloved/sweaty hands, glanceable in a gym.** Big tap targets
(≥48dp), high contrast, minimal typing, **rotating bezel** for all list scrolling and number
scrubbing. Use the Jacked accent (teal) so it feels like the same product.

### 4.1 Launch / Home (`ScalingLazyColumn`)
- Top `TimeText` (Wear standard).
- **Resume card** if an unfinished workout exists locally (offline-safe resume).
- **Start Empty Workout** (primary).
- **Start from Routine** → list of `jk_routines`.
- **Recent** — last 3 workouts (name · date · volume; cardio shows distance+pace, never "0 lb").
- Small sync-status chip: `Synced ✓ / Offline · N queued / Syncing…`.

### 4.2 Active workout
Vertical list of exercises; each exercise is a card:
- Exercise name + a compact "PR: 100 kg × 5" line pulled from `jk_prs` / `jk_cardioPR`.
- One row per set: **[weight] × [reps]** with a done-check. Rotary bezel scrubs the focused field;
  tap to toggle done (haptic on complete, matching the app).
- **+ Set** appends a blank set (placeholder = previous set's value, per PWA behavior).
- **+ Exercise** → searchable picker over the **bundled** exercise library (API.md §5). Selecting
  creates the `Exercise` with the correct `exId`, `tracking`, etc.
- **Rest timer**: auto-start on a completed set when `jk_settings.autoRest` is on; default
  `restDefault` (90 s). Show as a ring; vibrate at 0. Must run with the screen off (WAKE_LOCK /
  foreground service or ongoing notification).

**Tracking-aware set entry (critical — API.md §3):**
| `tracking` | Fields shown | Stored as |
|---|---|---|
| `weight_reps` | Weight (kg/lb) × Reps | `weight` kg, `reps` |
| `bodyweight_reps` | ± Added/Assist × Reps | `weight` added-kg, `reps`, `bwMode` |
| `duration` | Time | `reps` = minutes/seconds |
| `reps_only` | Reps | `reps` |
| `distance` (cardio) | **Distance (mi)** × **Time (min)**, live pace readout | `weight`=miles, `reps`=minutes |

Always convert display↔storage using `jk_settings.wUnit` (store **kg**). Show cardio as
distance + pace — **never render a distance set as "0 lb"**.

### 4.3 Finish
- Confirm dialog (skip if 0 sets? mirror app: warn but allow).
- Compute `duration`, `sets` (done count), `totalVolume` (API.md §7), commit PRs
  (`jk_prs` weight PRs via Epley 1RM; `jk_cardioPR` cardio bests), append to `jk_hist`.
- Persist locally → enqueue sync → show a short summary (time / sets / volume / new PRs) like the
  app's finish card.

### 4.4 History / Exercise detail (read)
- Recent workouts list; tap → exercise breakdown.
- Per-exercise: current PR + last few sessions' top sets. Read-only in v1.

---

## 5. Non-functional requirements

- **Gym-proof input:** every primary action reachable one-handed; bezel-first, typing-last. Assume
  sweat and gym gloves — no tiny controls, no precise drags.
- **Battery:** no polling loops. Sync on launch/resume and on finish only. Rest timer via efficient
  alarm, not a busy wait.
- **Screen-off safety:** an in-progress workout and its rest timer survive ambient/AOD and screen
  timeout. Nothing is lost if the watch sleeps mid-set.
- **Crash/kill safety:** the active workout is written to local storage on every mutation, so a
  process death mid-session resumes cleanly (the Resume card).
- **Data fidelity:** round-trip test — a workout logged on the watch must appear correctly in the
  PWA, and a workout in the PWA must display correctly on the watch (esp. cardio, bodyweight lifts,
  and units).
- **Small payloads:** read only `backup`+`updated_at` when you need the DB; use the stat-only GET
  (API.md §4b) for change detection. A full mature `backup` can be a few hundred KB — cache it.

---

## 6. Testing checklist

- [ ] Cold launch on a watch that has never synced → empty DB, can still start a workout.
- [ ] Log `weight_reps`, `bodyweight_reps`, `duration`, `reps_only`, and `distance` (cardio) sets;
      each stores and re-displays correctly, and cardio never shows "0 lb".
- [ ] Finish offline (airplane mode) → workout queued → re-enable network → lands in cloud; PWA
      shows it.
- [ ] Edit on phone while watch is open → watch's finish re-fetches and does **not** clobber the
      phone's newer data (API.md §6 re-merge).
- [ ] `total_volume`, `workouts`, `prs`, `streak` after a watch write match what the PWA computes.
- [ ] Units: log in lb on the watch, open PWA in kg → same underlying kg values.
- [ ] Rest timer fires with screen off; workout survives screen timeout and app kill.
- [ ] Missing-column resilience: a project missing `avatar_url` still reads/writes (drop-and-retry).

---

## 7. Security & forward-compatibility (must-read)

The backend has **no authentication**: the only "credential" is a username plus a *public* API
key (API.md §0; `../APP_STORE_READINESS.md` #1/#2). Consequences for the watch build:

- **Do not** advertise or store anything sensitive through this.
- **Isolate identity.** Put "who am I + how do I authenticate" behind a single `AuthProvider`
  interface. v1 implements it as "hold the username + public key"; when the server gains real
  Supabase Auth, only that provider changes — screens, sync, and the data model stay put.
- Assume `code` must be **normalized** (lowercased/trimmed) before every query, or reads return
  empty (API.md §10).
- When real auth lands server-side, the whole-blob model may also be replaced by owned, per-row
  tables. Keep the sync layer (§3) behind a `SyncRepository` interface so that migration doesn't
  ripple into the UI.

---

## 8. Open questions for the build

1. **Onboarding:** how does the watch learn the username on first run? Options: type it on the
   watch once (rotary keyboard — painful), or a one-time QR/deep-link shown by the PWA that the
   watch scans/receives. Recommend the latter to avoid typing and to prefill the (future) token.
2. **Exercise library size:** bundle the full free-exercise-db (~hundreds of exercises, a few MB
   JSON) or a curated subset to save space/scan time? Recommend a curated common set + search.
3. **How much history to mirror locally** for the History screen vs. fetch-on-demand.
4. **Routines authoring** on the watch — v1 assumes read/start-only; confirm that's enough.

---

## 9. Definition of done (v1)

A user can, standalone on the Galaxy Watch 8 Classic with the phone in a locker:
start a workout, log weighted, bodyweight, and cardio sets with a working rest timer, finish and
save it, and see that workout appear in the Jacked phone/web app — and see a workout logged on the
phone appear on the watch — with volumes, PRs, and units all consistent, and with an offline
session reliably syncing when signal returns.
