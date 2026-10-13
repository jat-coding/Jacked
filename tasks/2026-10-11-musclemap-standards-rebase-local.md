# Muscle Map standards: rebase + finish, local only (no push)

## Context
Mr. Roni approved the harder, sourced STRENGTH_STD ladders (back/glutes/biceps/triceps/core
from strengthlevel.com) built on `feat/musclemap-standards` (commit `4ac0d56`, worktree
`/tmp/jk-musclemap`). He explicitly wants this finished and committed **locally only — do
not push to `origin/staging` or `origin/main`.**

Branch is 6 commits behind current `staging` (80d4886) and 1 ahead (the musclemap commit
itself). Rebase it onto current staging first.

## Steps
1. In `/tmp/jk-musclemap`, `git fetch` and rebase `feat/musclemap-standards` onto current
   `origin/staging` (80d4886).
2. Update the 5 e2e test expectations in `tests/e2e/run.mjs` that the result doc
   (`research/jacked-musclemap-standards-result-20261008.md` §5) already identified as
   needing to change for the new tiers:
   - L1473, L1494 `triceps-tier` (solid bench + pushdowns: Strong -> Building)
   - L1760, L1765 `multi-credit` (315x5 squat @229lb: Legs/Glutes Strong -> Building)
   - L1771 `multi-credit` (bench-only triceps close-grip label)
3. Run the full e2e suite (`tests/e2e/run.mjs`) and confirm all pass against the new tiers
   (no other regressions).
4. `node --check` the inline `<script>` blocks in `index.html`.
5. Commit locally on `feat/musclemap-standards` (or merge into local `staging` if that's
   cleaner — worktree author's call). **Do not push to any remote.** Leave the worktree in
   place.
6. Report back exactly which branch/commit holds the final state and confirm nothing was
   pushed (`git status` / `git log @{u}..HEAD` style check against both origin/staging and
   origin/main).

## Out of scope
- PR-badge cardio/hold fix and the holds stopwatch-notation fix are NOT part of this job —
  both are already merged into `origin/main` (confirmed via `git merge-base --is-ancestor`
  on 2026-10-11), contrary to earlier stale notes. Nothing to do there.
- Android back-button fix is already on `origin/staging` (not yet prod) — also out of scope
  here.
