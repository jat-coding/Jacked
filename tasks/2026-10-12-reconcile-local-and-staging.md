# Reconcile the local serving checkout with origin/staging

## Reported
2026-10-12 9:19pm: "The stress testing should be for the local version as that is the most
up to date with features." He's right that it's diverged, but diverged in BOTH directions —
this needs reconciling before further stress testing is meaningful, not just redirecting.

## Why this matters
`~/agent/projects/Jacked` (the shared clone) IS what's served on :8090/Tailscale — what he
actually tests. Right now (checked 9:19pm):
- Local is **7 commits ahead** of `origin/staging` with real feature work not pushed
  anywhere else: `10d7b45` (sourced pull-up/push-up/cardio-maxing standards), `c4d5209`
  (active-workout scroll-banner color fix), `0321da2` (friend-invite spam fix), `09e77ec`
  (password show/hide toggle), plus the muscle-map-standards merge (`9124d8b`, `1777688`,
  `364a823`).
- Local is **10 commits behind** `origin/staging`: it is MISSING the finish-workout fixes
  (`a2a39ab`, merged via `28a6d5e`), the nav-bar-scroll-detach fix (`9b431e8`), and every
  bug the two stress-test passes found and pushed tonight (`cd17752` through at least
  `193d740` — check `git log origin/staging` for the exact current tip, another stress-test
  job may still be pushing as this task starts).
- Local's working tree is **dirty**: `jacked-pwa/index.html`, `tests/e2e/live.mjs`,
  `tests/e2e/run.mjs`, `VERIFY.md`, `tasks/2026-09-30-bench-substitutes.md` all show
  uncommitted changes. The `index.html`/`live.mjs`/`run.mjs` diff looks like an EARLIER,
  uncommitted attempt at the same finish-workout fix that shipped as `a2a39ab` (compare
  the diffs — if they're functionally the same fix, the uncommitted copy is superseded and
  safe to discard once `a2a39ab` is merged in; do not assume, actually compare). The
  `VERIFY.md` diff is a new item 10 (adversarial-testing requirement) added earlier
  tonight directly in this clone — keep it, it's real and not duplicated upstream as far as
  known. Check `tasks/2026-09-30-bench-substitutes.md`'s diff too before deciding whether
  to keep or discard.

## What "done" means
1. `git fetch origin staging` for the current tip (don't work off a stale fetch — if
   another job is actively pushing, wait for it to settle: check
   `bridge/run/notify/20261012-201005-3342358.json`'s state; if still "running", poll
   briefly before the final push so you don't race it).
2. Merge so this exact working tree ends up with ALL of: local's 7 feature commits AND
   origin/staging's fixes, with nothing silently dropped. Resolve the dirty working tree
   first (compare against what's incoming, discard only what's truly superseded, keep
   everything else — commit anything worth keeping before merging).
3. Full e2e suite green (state pass count) and the live* suite (VERIFY.md #7, and the
   broader "all 15 live suites" run if that's now how the suite's organized) green (state
   pass count).
4. Spot-check the merge didn't silently revert either side: the nav pill must still use
   the `position:fixed; inset:0; overflow:hidden` document-never-scrolls approach (not the
   old `-webkit-overflow-scrolling:touch` body scroll), AND the pull-up/push-up/cardio
   sourced standards and password toggle must still be present.
5. Push the merged result to `origin/staging` via `scripts/jacked-push.sh --branch
   staging` (from this clone directly — it honours cwd; if its untracked-files clean-check
   stops you, the untracked task cards in `tasks/` are fine to leave, check exactly what
   it's complaining about before working around it). Confirm by reading back
   `origin/staging`'s SHA, same discipline as every prior job tonight — don't trust a
   bare "done".
6. Report the before/after SHA on both sides and exactly what (if anything) was discarded
   from the dirty working tree and why.

Do NOT touch `main`/Netlify prod. Don't touch the `jacked-wt-prbadge` worktree. Don't kill
or interfere with job `20261012-201005-3342358` if it's still running when you start —
just wait for it to settle before your own push, per step 1.

## Not doing
- Not continuing the stress test's areas 2-5 in this task — that's separate, and should
  target this reconciled checkout once it exists, not a fresh clone of origin/staging.
- Not touching `main`/prod.

## Tries
Up to 4 rounds. If a genuine conflict can't be resolved without a product decision (e.g.
two incompatible versions of the same UI element with no clear "this one's newer"),
stop and report exactly what the conflict is rather than guessing.
