# Jacked sync playbook — hard-won data-safety rules for ANY new client

Platform-agnostic distillation of every data-loss scar from the Wear OS client
and the PWA (August 2026 incidents + fixes, field-tested in a real gym and in a
headless multi-device harness). A new client (Garmin, watchOS, anything) that
skips any rule below will recreate a bug we have already paid for.

The backend contract lives in [API.md](./API.md). This document is the *why*
and the *invariants*; API.md is the wire format.

---

## 1. The cardinal rule: never write without reading and merging first

The whole account is ONE JSONB blob (`profiles.backup`). A blind write is a
total overwrite of someone's entire history — from every other device.

- **Read → merge → write. Every time.** No exceptions, including "I just synced
  a minute ago."
- **A failed read means NO write.** If the pre-write read errors, times out, or
  returns something unparsable, abort the backup and retry later. Writing your
  local state after a failed read erased real workouts twice in Aug 2026.
- **Never serve reads from a cache.** The PWA's service worker cached Supabase
  GET responses; the second backup in a session then merged against a stale
  snapshot and erased newer data (fixed in v1.7). Whatever your platform's
  networking layer is: API reads must always hit the network.

## 2. Merge rules (mirror the PWA's `mergeBackup`, v1.5+)

- `jk_hist`: **union by workout `id`**. Keep entries verbatim (byte-preserved
  maps, not re-serialized models — see §5). On id clash, local wins.
- `jk_deleted`: tombstone list of deleted workout ids. **Deletion is a
  tombstone, not an absence** — filter tombstoned ids out of the union, and
  union the tombstone lists themselves. A client that treats "missing from my
  list" as "deleted" (or "present in cloud" as "restore it") will resurrect
  deleted workouts or delete kept ones.
- `jk_prs` / cardio PRs: merge per-exercise, **best record wins** (never
  downgrade a heavier/better PR).
- Everything else (`jk_prof`, `jk_settings`, routines, …): local wins on
  conflict, but unknown keys are preserved (§5).

## 3. Concurrency: the `updated_at` watermark

- Read the row, remember the server's `updated_at` string. Before writing,
  re-read; if the watermark moved, re-merge against the fresh blob, then write.
- **Compare only server-returned strings to each other.** PostgREST reformats
  timestamps; parsing or comparing to locally-generated time breaks. Treat the
  watermark as an opaque token.

## 4. Offline-first outbox (Supabase free tier WILL fail you)

- Free-tier Supabase throws intermittent 522s; gym connectivity drops. A
  finished workout is **persisted locally first, always**, then drained to the
  cloud when possible. Losing a workout because the network blinked at "Finish"
  is the unforgivable failure mode.
- Drains are **idempotent by workout id** and guarded by a non-reentrant lock —
  we hit a real double-drain race (two triggers, same workout applied twice).
- Keep a **pushed-workout registry**: ids this device has successfully pushed.
  If a cloud read comes back missing one of them and it isn't tombstoned,
  re-push it (self-healing) instead of silently adopting the cloud's amnesia.

## 5. Extras preservation — the passthrough requirement

The blob holds keys your client has never heard of (`jk_badges`, future
features, other clients' keys). **Round-trip every unknown key untouched, at
every nesting level** — blob level, workout level, exercise level, set level.
The Wear client models this as "typed fields + extras map" with hand-written
codecs and round-trip tests asserting byte-equality on real PWA blobs. Do the
same. A client that deserializes into a closed struct and re-serializes it
deletes everyone else's data.

## 6. Canonical data facts (do not rediscover)

- **All stored weights are KILOGRAMS**, including `totalVolume`. Convert at the
  display layer only (`jk_settings.wUnit`).
- **Cardio encoding:** `weight` = miles, `reps` = minutes. Yes, really.
- `duration` is `"MM:SS"` with **unclamped minutes** (`"75:30"` is valid).
- `code` (the account key) = `@handle`, normalized exactly like the PWA's
  `normU`: trim → strip leading `@`s → lowercase → strip non-`[a-z0-9_]` →
  prepend `@`. A bare un-normalized code reads an empty row and looks like a
  brand-new user — this exact bug cost a day.
- Upsert = `POST /profiles?on_conflict=code` with
  `Prefer: resolution=merge-duplicates`. It returns **201 even on update**;
  treat any 2xx as success.
- PRs commit on workout finish only (never mid-session), effective-weight
  based, never downgrade.

## 7. Security reality check

There is **no authentication** — a shared anon key and permissive RLS; identity
is the `@handle` string. Fine for the family; a hard blocker for any public
release (see `../APP_STORE_READINESS.md`). Don't build features that pretend
otherwise (e.g. "private" anything), and never embed secrets beyond the
already-public anon key.

## 8. Test discipline

- **Scratch accounts only: `@watchdev`, `@watchdev2`. Never test-write real
  accounts** (`@dad`, `@jat`, …). Real history has been lost to test code.
- Verify claims via direct REST reads (`curl` against PostgREST), not via the
  app's own UI — the app under test is not its own witness.
- Verify what's actually deployed with
  `curl -s https://jacked-trainer.netlify.app/index.html` (check the `BUILD`
  const) before assuming a fix is live.
- The repeat-backup case (backup twice in one session, second time with staler
  local state) is the scenario that exposed the worst bug we ever shipped.
  Put it in your test plan.

## 9. Update hygiene

Long-resident clients running months-old code caused silent divergence (three
family devices synced daily on stale code). The PWA now self-updates (v1.7);
a watch client should surface its version, and any change to shared data
shapes must stay **additive + tolerant** (`ignoreUnknownKeys` everywhere) so
old and new clients coexist against the same blob.
