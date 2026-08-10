# Jacked — Cloud API (watch client contract)

**Audience:** a developer building a standalone Wear OS client (Galaxy Watch 8 Classic)
that reads and writes one user's complete weightlifting database.
**Companion doc:** [SPEC.md](./SPEC.md) — the watch app itself.
**Server of record:** Supabase project `qehlrwnumrjktujidabz`.

This document describes the *existing* server exactly as the "Jacked" PWA uses it today.
Nothing here requires server changes: the watch talks to the same tables and Storage bucket
the web app already uses, so the two stay interoperable automatically.

---

## 0. Read this first — the security model

**There is no authentication.** Identity is a username string (`code`), and the API key
that grants read/write is a *public* key shipped in the web app. Any client that knows a
username and holds the (public) anon key can read or overwrite that user's entire database.

- This is a known, documented limitation — see `../APP_STORE_READINESS.md`, items #1 and #2
  (the #1 blocker for any public release).
- For a private app used by one person (you) it is acceptable. **Do not** treat this API as
  a secure boundary, and do not store anything sensitive through it.
- The watch client should therefore be built so that swapping in real auth later (Supabase
  Auth + `auth.uid()`-scoped rows) changes only the *transport/header* layer, not the data
  model. Keep the "who am I" concern in one place.

---

## 1. Connection

| | Value |
|---|---|
| Base URL | `https://qehlrwnumrjktujidabz.supabase.co` |
| REST base | `https://qehlrwnumrjktujidabz.supabase.co/rest/v1` |
| Storage base | `https://qehlrwnumrjktujidabz.supabase.co/storage/v1` |
| Anon (publishable) key | `sb_publishable_vmf9BELfVFZpKrdMN3Z34g_R9l056gJ` |

This is PostgREST (Supabase's auto-generated REST layer over Postgres). You can use it three ways:

1. **Raw REST/HTTP** (recommended for Wear OS — Retrofit/OkHttp or Ktor). Documented below.
2. The **`supabase-kt`** Kotlin SDK (community). Wraps the same REST/Storage/Realtime endpoints.
3. The JS SDK — not relevant to a native client, but the PWA's calls (`SUPA.from('profiles')…`)
   map 1:1 to the REST calls here, so PWA behavior is the reference implementation.

### Required headers (every REST call)

```
apikey:        sb_publishable_vmf9BELfVFZpKrdMN3Z34g_R9l056gJ
Authorization: Bearer sb_publishable_vmf9BELfVFZpKrdMN3Z34g_R9l056gJ
Content-Type:  application/json          (on writes)
```

---

## 2. The single source of truth: `profiles.backup`

A user's **complete weightlifting database** lives in **one JSONB column**:
`profiles.backup`. It is a snapshot of every `jk_*` key from the web app's local storage.
The PWA's "Export", cross-device "Restore", and daily cloud backup all move this exact blob.

**The watch reads and writes the whole database by reading and writing this one column.**
There is no per-set or per-workout endpoint on the server today — the granularity is the
blob. (§6 covers how to mutate it safely; §7 covers the denormalized stat columns you must
also update so the leaderboard stays correct.)

### `public.profiles` — full schema

| Column | Type | Meaning |
|---|---|---|
| `code` | `text` **PK** | Identity. Normalized (lowercased, trimmed) username. |
| `name` | `text` | Display name. |
| `username` | `text` | `@handle` as shown to friends. |
| `total_volume` | `numeric` | Denormalized: lifetime volume, **kilograms**. |
| `workouts` | `integer` | Denormalized: workout count. |
| `prs` | `integer` | Denormalized: number of exercises with a weight PR. |
| `streak` | `integer` | Denormalized: current day-streak. |
| `consistency` | `integer` | Denormalized: % of last 30 days trained. |
| `badges` | `integer` | Denormalized: earned achievement count. |
| `data` | `jsonb` | Denormalized activity for friends: `{days, recent, m, badgeList}`. |
| `avatar_url` | `text` | Public URL of the profile photo (image in Storage). |
| `backup` | `jsonb` | **The complete database** (all `jk_*` keys). ← primary read/write target. |
| `updated_at` | `timestamptz` | Last write time (client-set, ISO 8601). |

The denormalized columns (`total_volume`…`data`) exist **only** so friends/leaderboard can
show numbers without downloading everyone's full `backup`. They are derived from `backup`.
The watch must keep them consistent when it writes (see §7), or the user's own leaderboard
card will drift.

---

## 3. The `backup` blob — data model

`backup` is a JSON object whose keys are the app's storage keys. Every key is optional; treat
missing keys as their empty default. The ones the watch cares about:

| Key | Shape | Notes |
|---|---|---|
| `jk_hist` | `Workout[]` | **The workout history.** Primary read/write for the watch. |
| `jk_prs` | `{ [exId]: PR }` | Weight PRs (estimated-1RM based). |
| `jk_cardioPR` | `{ [exId]: CardioPR }` | Cardio bests (pace + longest distance). |
| `jk_routines` | `Routine[]` | Saved routines (workout templates). |
| `jk_prof` | `Profile` | `{name, username, code, sex?, avatarUrl?}`. |
| `jk_settings` | `Settings` | `{wUnit:'lb'|'kg', restDefault, autoRest}`. |
| `jk_bw` | `number` | Current body weight, **kg**. |
| `jk_bwlog` | `{d, kg}[]` | Body-weight history (`d` = `YYYY-MM-DD`). |
| `jk_favEx`, `jk_hiddenEx`, `jk_closeBuddies`, `jk_metrics`, `jk_cex` | — | Library/social prefs; watch can pass through untouched. |

> **Units:** every weight is stored **canonically in kilograms**. `jk_settings.wUnit` is only a
> *display* preference. The watch must store kg and convert for the UI (`lb = kg × 2.20462`).

### `Workout` (element of `jk_hist`)

```jsonc
{
  "id":       "w1718900000000",          // "w"+epoch-ms, unique
  "name":     "Push Day",
  "date":     "2026-07-18T12:00:00.000Z",// ISO 8601
  "duration": "42:15",                    // "MM:SS" wall-clock string
  "sets":      18,                         // count of completed sets (done:true)
  "totalVolume": 5400,                     // kg, rounded (see §7 for the formula)
  "prCount":   2,                          // PRs set in this workout (display only)
  "routineId": "r1718…",                   // optional: source routine
  "exercises": [ Exercise, … ]
}
```

### `Exercise` (element of `Workout.exercises`)

```jsonc
{
  "exId":     "Barbell_Bench_Press",       // library id; the join key for PRs
  "name":     "Barbell Bench Press",
  "muscle":   "chest",
  "equip":    "barbell",
  "assist":   false,
  "tracking": "weight_reps",               // see tracking types below
  "imgUrl":   "https://…/0.jpg",           // may be null
  "bwMode":   "added",                     // optional: "added"|"assist" for BW-loaded lifts
  "sets":     [ Set, … ]
}
```

### `Set` (element of `Exercise.sets`)

```jsonc
{ "weight": 60, "reps": 8, "done": true, "pw": 57.5, "pr": 8 }
```

- `pw`/`pr` are "previous session" placeholder hints — optional, safe to omit on new sets.
- **The meaning of `weight` and `reps` depends on `tracking`:**

| `tracking` | `weight` field holds | `reps` field holds | Counts as lifting volume? | PR type |
|---|---|---|---|---|
| `weight_reps` | kilograms | reps | **yes** | weight (est. 1RM) |
| `bodyweight_reps` | added/assist kg | reps | **yes** (uses body weight) | weight (est. 1RM) |
| `duration` | — | seconds/minutes | no | none |
| `reps_only` | — | reps | no | none |
| `distance` (cardio) | **miles** | **minutes** | no | cardio (pace) |

> **Cardio is the field that trips people up.** For `tracking:"distance"`, a set stores
> `weight = miles` and `reps = minutes`. Pace = `minutes ÷ miles`. Never render a cardio set
> as "0 lb" — show distance + pace. (This exact bug was fixed in the PWA.)

### `PR` (value in `jk_prs`)

```jsonc
{ "weight": 100, "reps": 5, "date": "2026-07-01T…Z" }   // kg
```

### `CardioPR` (value in `jk_cardioPR`)

```jsonc
{ "dist": 3.1, "time": 24.5, "date":"…", "maxDist": 6.2, "maxDate":"…" }
```
`dist`/`time` = the fastest effort (lowest `time ÷ dist^1.06`, Riegel-normalized);
`maxDist` = longest single distance.

### `Routine` (element of `jk_routines`)

```jsonc
{ "id":"r1718…", "name":"Push", "desc":"", "exercises":["Barbell_Bench_Press", …] }
// exercises is an array of exId strings (a template), not full Exercise objects.
```

---

## 4. Reading the database

### 4a. Fetch the whole thing (cold start / full sync)

```
GET /rest/v1/profiles?code=eq.<code>&select=backup,updated_at
Accept: application/json
```

Returns an array with 0 or 1 element. Example:

```bash
curl "https://qehlrwnumrjktujidabz.supabase.co/rest/v1/profiles?code=eq.jack&select=backup,updated_at" \
  -H "apikey: sb_publishable_vmf9BELfVFZpKrdMN3Z34g_R9l056gJ" \
  -H "Authorization: Bearer sb_publishable_vmf9BELfVFZpKrdMN3Z34g_R9l056gJ"
```

- `[]` → no such user (or never backed up). Treat as empty database.
- `[{ "backup": {…}, "updated_at": "…" }]` → parse `backup`; keep `updated_at` as your
  last-synced watermark for conflict detection (§6).

Ask for a single object instead of an array with:
```
Accept: application/vnd.pgrst.object+json      → 406 if not exactly one row
```

### 4b. Fetch just the stat columns (cheap poll)

```
GET /rest/v1/profiles?code=eq.<code>&select=total_volume,workouts,prs,streak,updated_at
```
Use this to detect "something changed elsewhere" without pulling the whole `backup`.

---

## 5. The exercise library (read-only reference data)

Exercise metadata (`exId`, name, muscle, equipment, `tracking`, instructions, images) is **not**
in Supabase. The PWA loads it from the public-domain **free-exercise-db**:

```
Data:   https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
Images: https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>/<n>.jpg
```

- License is Unlicense / public domain — fine to bundle.
- **Hosting caveat:** GitHub raw is rate-limited and not a CDN (readiness doc item #3). For a
  gym watch app on flaky signal, **bundle `exercises.json` in the APK** rather than fetching it.
  Images are optional on a small screen — skip them or bundle a subset.
- The `exId` in a workout must match an `id` in this DB for PRs and history to line up with the
  PWA. If the watch lets the user pick from the bundled library, reuse those ids verbatim.

---

## 6. Writing the database (upsert)

All writes are an **upsert** on the `profiles` row keyed by `code`. PostgREST does this with a
`POST` to the collection plus a merge preference:

```
POST /rest/v1/profiles?on_conflict=code
Prefer: resolution=merge-duplicates,return=minimal
Content-Type: application/json

{ "code":"jack", "backup": { …full blob… }, "updated_at":"2026-07-20T15:04:00.000Z", … }
```

`merge-duplicates` = insert if the `code` doesn't exist, otherwise update. `return=minimal`
avoids echoing the (large) row back.

> A `PATCH /rest/v1/profiles?code=eq.<code>` also works for updating an existing row, but the
> upsert form is preferred because it also covers the "first ever write" case.

### The concurrency reality — read-modify-write on a blob

Because the database is one JSON blob, **there is no field-level merge on the server.** If the
watch writes `backup`, it overwrites whatever the phone/PWA wrote. To avoid clobbering:

1. **Never blind-write.** Fetch `backup` + `updated_at` first (§4a).
2. Mutate the parsed object locally (e.g. append a workout to `jk_hist`).
3. Before writing, **re-check `updated_at`** with a cheap GET (§4b). If it changed since your
   read, someone else wrote — re-fetch, re-apply your change, then write.
4. Write the whole blob back with a fresh `updated_at`.

For a single user who is either at the gym on the watch *or* on their phone — rarely both at the
exact same second — last-write-wins with this check is sufficient. Design the watch so a lost
network write is *queued locally and retried* rather than dropped (see SPEC §"Offline").

> **Partial-write safety valve:** the PWA deliberately splits its writes so a failure can't blank
> data — `syncMe()` touches only stats/`data`, `syncBackup()` touches only `backup`. The watch
> should do the same: **never** send `backup` and the stat columns in a way where a half-failed
> write leaves them inconsistent. Write `backup` first; on success, write the recomputed stats.

### Minimal "append one workout" sequence

```
1. GET  profiles?code=eq.jack&select=backup,updated_at         → blob, ts0
2. blob.jk_hist.push(newWorkout)                               (local)
3. recompute jk_prs / jk_cardioPR from the new sets           (§7, local)
4. GET  profiles?code=eq.jack&select=updated_at               → ts1
   if ts1 != ts0  → goto 1 (re-merge)
5. POST profiles?on_conflict=code  { code, backup:blob, updated_at:now }
6. POST profiles?on_conflict=code  { code, …recomputed stat columns…, data:{…}, updated_at:now }
```

---

## 7. Keeping the denormalized columns correct

After changing `jk_hist`/`jk_prs`, recompute and write these so the user's leaderboard card and
friends' views stay right. Formulas are taken verbatim from the PWA:

**`total_volume`** (kg, rounded) — sum over all workouts of each *weight-tracked* set's
`effectiveWeight × reps`, where only `weight_reps` and `bodyweight_reps` count:
```
effectiveWeight(set) =
    weight_reps      → set.weight
    bodyweight_reps  → bodyWeight + set.weight (bwMode "added")   |  bodyWeight − set.weight ("assist")
volume += Σ over done sets of effectiveWeight × reps        // distance/duration/reps_only contribute 0
```

**`workouts`** = `jk_hist.length`.

**`prs`** = number of keys in `jk_prs`.

**Estimated 1RM (Epley)**, used to decide weight PRs:
`e1rm(w, reps) = reps ≤ 1 ? w : w × (1 + reps/30)`. A set beats the PR when its `e1rm` exceeds
the stored PR's `e1rm`.

**`streak`** = consecutive days up to today with ≥1 workout (calendar-day based).

**`consistency`** = `round( (#workouts in last 30 days / 30) × 100 )`.

**`badges`** = earned achievement count (the watch may leave this untouched if it doesn't
implement badge logic — stale badge count is cosmetic).

**`data`** (activity for friends), shape:
```jsonc
{
  "days":   ["2026-07-18", …],                       // distinct YYYY-MM-DD with a workout
  "recent": [ { "name","date","totalVolume","sets",  // last 6, newest first
                "dist"?, "pace"? } ],                 // dist/pace only for cardio workouts
  "m":      { "v": monthVolume, "w": monthWorkouts, "p": monthPRs },
  "badgeList": [ { "n":name, "t":tier, "e":emoji } ]
}
```
If the watch doesn't want to recompute `data`, it may omit it from its stat write — but then the
next time the *phone* syncs it will refresh `data` from the phone's copy, which is fine as long as
the phone's `jk_hist` is up to date (it will be, because the watch wrote `backup`).

> **Simplest correct strategy for the watch:** always write the full `backup`, and recompute at
> least `total_volume`, `workouts`, `prs`, `streak`, `consistency`. Skip `badges`/`data` if you
> want; they self-heal on the next phone sync.

---

## 8. Profile photo (optional, Storage)

Avatars live in the public `avatars` bucket as `<code>.jpg` (256px square JPEG, ~15 KB), and the
public URL is stored in `profiles.avatar_url`. The watch generally only needs to *read* it:

```
GET /storage/v1/object/public/avatars/<code>.jpg
```
Writing an avatar from the watch is out of scope (camera/crop UX doesn't fit the platform).

---

## 9. Friends / realtime (out of scope, documented for completeness)

`public.friend_requests` drives the social features; the watch app in SPEC.md is single-user and
does **not** need it. If a future version shows a leaderboard:

- `GET /rest/v1/friend_requests?or=(from_code.eq.<code>,to_code.eq.<code>)`
- Realtime: `friend_requests` is in the `supabase_realtime` publication (websocket at
  `/realtime/v1`), so friend adds can push instantly. The app also polls every 25 s as fallback.

---

## 10. Errors & gotchas

| Symptom | Cause / fix |
|---|---|
| `401` | Missing/incorrect `apikey` **and** `Authorization` header (need both). |
| `404` on table | Wrong table name — it's `profiles`, lowercase. |
| `406` | You sent `Accept: …object+json` but 0 or >1 rows matched. |
| Empty `[]` on read | User has never synced, or `code` mismatch — `code` is **lowercased/normalized**, not the display `@handle`. Normalize before querying. |
| Column error like `PGRST204` / `42703` | Target project missing a migration (e.g. `avatar_url`/`backup`). The PWA guards this by retrying without the unknown column — mirror that: on a missing-column error, drop that column and retry. |
| Friend calendars/history blanked | Historically caused by a write that overwrote `data`/`backup` with a partial payload. **Never** write `backup` or `data` unless you have the full, current object. |
| Cardio shows "0 lb" | You rendered `weight` as kilograms for a `tracking:"distance"` set. It's miles+minutes. |

---

## 11. What this API does *not* give you (and what to plan for)

- **No auth, no ownership** — see §0 and `../APP_STORE_READINESS.md` #1/#2. Isolate identity so
  a future Supabase-Auth swap is a one-file change on the watch.
- **No delta/patch endpoint** — writes are whole-blob. Keep the read-modify-write discipline in §6.
- **No server-side validation** — the server will store any JSON you put in `backup`. The watch is
  responsible for keeping the shape valid so the PWA can still read it.
- **No push to the watch on remote change** — Realtime exists for `friend_requests` only, not
  `profiles`. The watch should re-sync on resume / before a write, not assume it's current.
