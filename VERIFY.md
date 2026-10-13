# Jacked — VERIFY

How to check a build on this project is real, not "looks done." Single-file app:
`jacked-pwa/index.html`. Playwright e2e suite: `tests/e2e/run.mjs` (harness.mjs boots a
real headless browser against the file, no build step). Chromium was previously missing
system libs on the desktop host — resolved 2026-09-15
([[desktop-wsl2-chromium-missing-system-libs-2026-09-15]]); confirm `npx playwright
--version` / a real launch works before trusting a green run.

## Every build on this project runs

1. `node tests/e2e/run.mjs` (or whatever the current suite entry point is — check for a
   newer runner before assuming this path is still current) — full suite must pass, 0
   failures. Note the pass count (e.g. "247/247") in the report back to him, not just
   "tests passed."
2. No new console errors introduced (`errors.length === 0` pattern the suite already
   checks per tab).
3. Any change touching exercise data, categorization (muscle/equipment/cardio detection),
   or math (e1rm, effWeight, strength ratios, badge tiers, per-session stats) is checked
   against the REAL `free-exercise-db` dataset (`dist/exercises.json`, 876 entries), not
   synthetic/made-up exercise names — a fix is only "confirmed" if verified against real
   data.
4. `git status` clean commit before any push attempt (`scripts/jacked-push.sh` refuses
   otherwise).
5. Push target: **`main` is the only branch** (the `staging` branch was retired 2026-10-12;
   `~/agent/research/jacked-delete-staging-execution-result-2026-10-12.md`). Commit on the local
   checkout's `main` (served on :8090) and stop there: a post-commit hook pushes every commit to the
   hidden backup ref `refs/backup/desktop` on GitHub (not a branch, nothing deploys it;
   `scripts/jacked-push.sh --backup` does it by hand). **Pushing to `main` needs Mr. Roni's
   explicit go each time**, in the same turn's instruction, via `scripts/jacked-push.sh` — read
   back its PUSHED / VERDICT lines verbatim. Pushed is not live: Netlify production is locked
   and publishes only on his separate go. `--branch staging` now stops on purpose; don't
   follow an old brief that says otherwise.
6. New exercises added to the library must render with the app's existing icon-placeholder
   convention (colored icon via `exIcon()`/`_ICON`/`MCOL`, matching how a user's own custom
   exercise renders with no photo) — screenshot or Playwright-assert this, don't just trust
   the data shape.

7. **Anything touching the active workout (`aw`), Finish/auto-finish, `commitPRs`, `mergeBackup`'s
   `jk_hist` rule, or `live_workouts`** (live shared workout, WATCH_BRIDGE.md A17, added 2026-10-06):
   the `live*` suites in `tests/e2e/live.mjs` must stay green — run them alone with
   `JK_ONLY=liveWrites,liveConcurrent,liveFinishOnce,liveFinishLock,liveLateSets,liveLifecycle,liveFinishEdges node tests/e2e/run.mjs`.
   They drive TWO real app pages against one shared in-memory row (stubbed Supabase client), so
   they catch double commits and lost sets that a single page never shows. A new mutation path on
   `aw` needs nothing special (stamping diffs on `saveAW()`), but it must end in `saveAW()` /
   `renderWS()` or the change never reaches the other device. When a test here passes on the first
   try, break the code it guards once (mutation check) and confirm it fails: two of these tests
   passed against broken code until rewritten (the Playwright round-trip hid the race window).
8. **Any new or changed file in `supabase/migrations/`**: run its PGlite test (pattern:
   `supabase/tests/live_workouts_test.mjs` — copy `supabase/` next to a `node_modules` with
   `@electric-sql/pglite`, ESM ignores NODE_PATH) including the rollback. Never apply a migration
   to the real project without Mr. Roni's explicit go for that migration.

9. **Before building anything the watches also implement**, read `git log origin/main -- watch-client/`
   (not just the local checkout's copy of `BOARD.md`): Phil's team pushes to `main`, and on 2026-10-06 three
   overnight commits there (`3584bf1`, `cd9895b`, `472a92e`) fixed the exact `doc` format and found phone-side
   bugs after the build brief was written. Caught only because `jacked-push.sh` merged `main` in and the
   commit list showed them; build to what the other client already shipped unless there is a reason not to.

10. **Adversarial pass, not just the deterministic suite** ([[jacked-finish-bugs-fixed-2026-10-12]]):
    the double routine-update prompt and the Finish-workout stuck-on-screen bug both shipped to
    staging and were only found by him using the real app, because the existing e2e suite only
    exercised the happy path (no rejected/slow network, no "swap where the target already exists
    in the routine"). Any change to the active-workout/finish/live-sync pipeline (VERIFY #7's list)
    needs a written-first adversarial repro for its failure mode (force the dependency to fail/
    reject/return garbage, race two devices, double-tap, go offline mid-action) BEFORE the fix, same
    standard as the 2026-09-18 GPS stress test (4 real bugs found that way, see
    memory/project/jacked-workout-app.md) — not just "all green" on tests written to the happy path.

## Screens/data that matter for this kind of change

- Exercise Library tab (add/search/filter by muscle group + Cardio chip)
- Add-Exercise picker (mid-workout)
- Metrics tab (body-map heat-map, Achievements, strength ranking) — anything touching
  categorization or math shows up here
- Real seeded history (via the harness's seed mechanism), not a fresh/empty account, when
  testing derived stats
