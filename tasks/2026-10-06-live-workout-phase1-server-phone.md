# Live shared workout — Phase 1 (server + phone only)

**Status: DONE on `staging` (2026-10-06), `c6085fa` (app commits `bc1b6b7` + `d955380`), BUILD v1.10.72. Migration WRITTEN, NOT APPLIED — needs Mr. Roni's go. Result: `research/jacked-live-workout-phase1-result-20261006.md`.**

## Goal
Build the server + phone side of the live shared phone↔watch workout feature, per
Mr. Roni's full design approval (`watch-client/BOARD.md`, commits c9bd1dc + c7d9f25
on main) and Phil's team's schema proposal (`f775c3a`). This is rollout step 1: watches
stay untouched until this ships to staging and is tested. Do NOT edit anything under
`watch-client/wear` or `watch-client/watchos` — that's Phil's team's agent.

## Done when
- [x] 1. A new migration file exists at `supabase/migrations/<date>_live_workouts.sql`
   (+ matching rollback in `supabase/rollback/`) creating `live_workouts`: one row per
   account (`code`, `aw` jsonb, a version counter, `updated_at`, last-writer device),
   owner-only RLS matching `profile_backups`'s policy shape, added to the
   `supabase_realtime` publication. **Not applied to the live Supabase project** —
   written and reviewed only; applying it is a separate step that needs Mr. Roni's
   explicit go, same as any other prod DB change.
- [x] 2. `jacked-pwa/index.html`: while a workout is in progress (`aw` set), every change to
   it also writes `live_workouts` (debounced, not the whole-blob backup path) —
   Playwright-assertable via a mocked/stubbed Supabase client or a real staging table.
- [x] 3. Set-level merge implemented: each exercise/set has a stable id; on read, newest
   change per set wins; a delete is a tombstone (`jk_deleted`-style); the version
   counter is checked on write and a stale write triggers re-read + re-merge instead of
   clobbering. Unit/e2e test simulates two concurrent writers editing different sets and
   asserts both survive.
- [x] 4. Finish path: workout id minted at Start, carried through so a duplicate Finish from
   two devices unions harmlessly into `jk_hist` by id (idempotent). Finishing marks/clears
   the `live_workouts` row. Only the finishing write commits PRs (`jk_prs`, `jk_holdPR`,
   cardio PRs, A16, `jk_prReset`/`jk_prRepair`) — test asserts a second Finish call does
   not double-commit PRs.
- [x] 5. Auto-finish (idle/70-min forgotten-workout path, already shipped 2026-10-06) now goes
   through the same finish-lock/CAS as manual Finish — test: two near-simultaneous finish
   triggers (one manual, one auto) only commit once.
- [x] 6. Late-arriving offline sets (a device reconnecting after the other already finished)
   merge in and trigger a totals/PR recompute, not a silent drop.
- [x] 7. Full e2e suite still green (`node tests/e2e/run.mjs`, note pass count), 0 new console
   errors, pushed to `staging` branch only via `scripts/jacked-push.sh --branch staging`
   with PUSHED/VERDICT read back — no touching `main`/prod.

## Not doing
- Any wear/watchos client code (Phil's team's agent owns that, waits on this shipping).
- Applying the Supabase migration to the real project (flag it, don't run it).
- Rest-timer sharing, live HR/calorie display polish — functionally present per the
  design answers but not a hard check here; don't gold-plate.
- Routine-vs-ad-hoc UI differences beyond "both start a live record" — scope was
  confirmed as "both," not a new routine-workout feature.

## Tries
5 build-and-check rounds before stopping to ask. Used 3: (1) build + 41 tests, all green, mutation checks showed 2 tests that could not fail, rewritten; (2) full suite 1088/1088; (3) after Phil's overnight `main` commits (`472a92e` exact doc format, `cd9895b` review), wire format + auto-finish reworked to match, full suite 1096/1096.

## Open questions
- ~~For Mr. Roni (raised by Phil, `cd9895b` 2b): should the 70-min TOTAL auto-finish cap still end a long workout shared with a watch?~~ Answered 2026-10-07: raised to 90 min, still applies. `STALE_TOTAL_MS` in `jacked-pwa/index.html`, `WATCH_BRIDGE.md` A17, `BOARD.md` updated.
- ~~Applying `supabase/migrations/20261006_live_workouts.sql` to the real project: his go needed.~~ Applied 2026-10-06 (`BOARD.md` `10b3b16`).

(Originally: None — design is fully settled across both BOARD.md rounds (6 + 4 questions, all
answered). The only judgment call left (exact debounce interval, exact RLS SQL shape)
follows existing `profile_backups` patterns in the codebase.)
