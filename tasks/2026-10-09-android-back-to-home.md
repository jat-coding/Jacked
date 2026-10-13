# Android back button returns to Home (Feedback #9)

## Goal
On Android (Capacitor WebView), pressing the hardware/gesture back button while on any
tab other than Home should navigate to Home, not exit the app. Source: in-app Feedback
#9 (@dad, 2026-10-09), approved by Mr. Roni via Telegram to build now.

## Done when
1. PASS. A `popstate` handler exists (`jacked-pwa/index.html:1927-1930`) and `sp()`
   (`index.html:1903-1920`) pushes a history entry (`history.pushState({jkTab:id},'',
   location.pathname)`) whenever it switches (not a re-tap of the already-active tab) to
   a non-home tab (routines/exercises/metrics/leaderboard).
2. PASS. `tests/e2e/run.mjs` `androidBack()`: switches to `leaderboard`, confirms
   `history.state.jkTab === 'leaderboard'`, calls `history.back()`, asserts `page-home`
   is `.active` and `page.url()` is unchanged (still `index.html`, no real navigation).
3. PASS. Same suite: 5x `sp('routines')` -> `history.back()` cycles, `history.length`
   grows by at most 1 net (`len1 - len0 <= 1`); a direct `sp('home')` call pushes nothing
   (`history.length` unchanged) — no unbounded growth, no loop trap.
4. PASS. `node tests/e2e/run.mjs` (via
   `PW=/home/roni/agent/projects/Jacked/tests/e2e/node_modules/playwright`): 1096/1096
   before this change (baseline, re-checked by stashing the edit and re-running), then
   1103/1103 with the 7 new `androidBack` assertions added, on top of the pre-existing
   suite unchanged. After merging in 22 same-day commits from `origin/main` (PR-badge
   cardio/hold fix, auto-finish cap, etc.) the combined suite is 1142/1142.
5. PASS. `androidBack: no page errors` assertion (`errors.length === 0`) passes; no new
   console errors anywhere in the 1142/1142 run.
6. PASS. Committed (`2ba96a0`, then merge commit `80d4886` for `origin/main`'s 22
   commits), pushed to `staging` via `scripts/jacked-push.sh --branch staging`:
   `PUSHED: origin/staging == local HEAD == 80d4886 (read back from GitHub after the push)`.
   `main`/Netlify prod untouched, per scope — the script's own VERDICT line confirms
   prod still serves `7c33135`, unrelated to this fix.

## Not doing
- Modal-level back handling (closing an open modal on back) — feedback only asked about
  tab navigation; a separate ask if he wants it.
- iOS back-swipe gesture — Capacitor/iOS doesn't route through the same path; out of scope.
- Changing what happens when back is pressed while already on Home (still falls through
  to default browser/Capacitor behavior, which may exit — not addressed by this feedback).

## Tries
5

## Open questions
None — scope is narrow enough from the feedback text and the audit already done.
