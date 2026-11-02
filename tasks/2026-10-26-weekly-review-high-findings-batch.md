# Jacked — Weekly review batch: 13 confirmed high-severity findings (2026-10-26)

## His words (verbatim)
- 9:23 AM, Mr. Roni: "What bout the rest of the fixes?"
- Reply explained: critical #1 built-not-pushed, critical #2 deferred, 13 more confirmed
  high findings untouched, 96 more never verified, plus the live privacy-migration gap.
- 11:41 AM, tap answers on the follow-up questions:
  - "Push the banner-removal + RLS fix now (4 commits, ready)?" → **Yes, push**
  - "Also apply both SQL fixes live in the Supabase editor (RLS lockdown + the missing
    privacy migration)?" → **Yes, apply both**
  - "Start on the 13 untouched high findings next?" → **Yes, queue them**

## Goal
Fix the 13 confirmed-high (not critical, not unverified) findings from the 2026-10-25
weekly review of jacked-pwa (`research/project-review-jacked-pwa-weekly-20261025/report.md`,
findings #3-15), one real bug each.

## Done when
Each is its own pass/fail, verified against the real app per VERIFY.md, not just "code
changed":
1. `#3` — bumping `BUILD`/a cache-busting change in `sw.js` on a real deploy-shaped test
   actually reaches an already-open tab (a live e2e assertion, not just "the file changed").
2. `#4` — supabase-js is pinned to an exact version with SRI (or self-hosted), and the SW's
   cache for it now expires/revalidates instead of caching forever.
3. `#5` — third-party exercise DB fields (name, instructions, etc.) render via textContent/
   sanitized insertion, not raw innerHTML/inline onclick; a test exercise name containing
   `<img onerror=...>` renders as inert text.
4. `#6` — editing a built-in warm-up and saving actually persists the edit (re-open shows the
   change), not just a success toast.
5. `#7` — deleting a warm-up exercise removes it from the library too, not just from routines
   it was already in (or: routines keep it and library keeps it, pick one real behavior and
   test it — no more "stays in the library" ghost state).
6. `#8` — adding/starting a curated program while the exercise DB hasn't loaded yet either
   waits for it or blocks the action with a message; no silently-dropped exercises.
7. `#9` — removing/switching an exercise's sets produces a tombstone that reaches the wire;
   a second sync of the same device does not re-write the same sets again (no resync loop).
8. `#10` — Cardio-Maxing's live tier chip fires during an actual in-progress cardio workout
   (give the in-progress pseudo-workout a date/timestamp so it isn't filtered out).
9. `#11` — editing or deleting a workout that contained a PR re-derives/repairs the PR record
   instead of leaving the old (possibly wrong) PR standing forever.
10. `#12` — a failed `friend_requests` fetch in `refreshFriends` leaves the existing friends
    list/cache alone (shows a retry/error state) instead of wiping it.
11. `#13` — `account_status_by_email` requires auth or is otherwise throttled; a script
    hitting it 50x in a minute for different emails gets rate-limited, and it no longer
    hands back the login email itself (username-exists signal only, if anything).
12. `#14` — the `account_status` rate limit keys on something the client cannot spoof (not
    the first `X-Forwarded-For` hop); a test that sets a fake XFF header does not get a fresh
    quota.
13. `#15` — `SUPABASE_SETUP.sql` is regenerated from (or checked against) the actual applied
    migrations so re-running it would not reopen any table; note in the file how it's kept
    in sync going forward.
14. Full existing suite (`node tests/e2e/run.mjs`) still passes, 0 failures, pass count
    reported.
15. New tests added specifically for #13 and #14 (security-relevant) since neither had
    coverage before.
16. Local `main` has these commits via `scripts/jacked-worktree-merge.sh --no-push` — merged
    locally, **not pushed to origin, not applied to the live Supabase DB**.

## Reference
none (bug fixes, not a visual redesign).

## Not doing
- Findings #1-2 (critical forged-friendship / account-takeover) — separate thread, already
  built and being pushed/applied live outside this task.
- Findings #16 and beyond — never verified by the review (96 items beyond its verify cap),
  out of scope until he asks for them specifically.
- Pushing to `origin/main` or touching the live Supabase database — this batch stops at a
  local, tested merge; he reviews and gives the push/apply go separately, same as every
  other Jacked batch (`jacked-localhost-test-before-prod`, `full-visual-regression-before-
  every-push`).

## Tries
5

## Open questions
none — already decided by his tap answers above.
