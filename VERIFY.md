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
5. Push target: `staging` branch only, via `scripts/jacked-push.sh --branch staging` —
   read back its PUSHED / VERDICT lines verbatim, don't just assume it worked.
   **`main` / Netlify prod need Mr. Roni's explicit go each time** — never push main
   without it in the same turn's instruction
   ([[jacked-github-always-pushed-netlify-needs-his-ok-2026-09-20]]).
6. New exercises added to the library must render with the app's existing icon-placeholder
   convention (colored icon via `exIcon()`/`_ICON`/`MCOL`, matching how a user's own custom
   exercise renders with no photo) — screenshot or Playwright-assert this, don't just trust
   the data shape.

7. **Anything touching the active workout (`aw`), Finish/auto-finish, `commitPRs`, `mergeBackup`'s
   `jk_hist` rule, or `live_workouts`** (live shared workout, WATCH_BRIDGE.md A17, added 2026-10-06):
   the `live*` suites in `tests/e2e/live.mjs` must stay green — run them alone with
   `JK_ONLY=liveWrites,liveConcurrent,liveFinishOnce,liveFinishLock,liveLateSets,liveLifecycle node tests/e2e/run.mjs`.
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

## Screens/data that matter for this kind of change

- Exercise Library tab (add/search/filter by muscle group + Cardio chip)
- Add-Exercise picker (mid-workout)
- Metrics tab (body-map heat-map, Achievements, strength ranking) — anything touching
  categorization or math shows up here
- Real seeded history (via the harness's seed mechanism), not a fresh/empty account, when
  testing derived stats
