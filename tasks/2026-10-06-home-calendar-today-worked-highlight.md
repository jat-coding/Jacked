# Home calendar: highlight today once a workout is finished

## Goal
On the home-screen mini calendar, once the first (or only) exercise of the day is
finished, today's cell should pick up the same "worked" highlight (teal background +
dot) that other worked days get — matching how the leaderboard's friend-profile
calendar already shows a worked-and-today day.

## Root cause
`renderCal()` (jacked-pwa/index.html:2127-2142) builds the day's CSS class with an
exclusive if/else: `today > future > worked > missed`. A day that is today never also
gets `worked`, even if `gH()` has a finished workout for it. The leaderboard's
`miniCal()` (index.html:6613-6626) concatenates classes instead
(`worked` and `today` can co-occur) — that's the "aligned with leaderboard" look he's
asking for.

## Done when
1. Today, with a finished workout logged for today in `gH()`, renders class
   `cd worked today` (both classes present) in `#calGrid`.
2. Today, with no workout finished yet today, still renders `cd today` only — no
   `worked`, and no `missed` tint (day isn't over, shouldn't look "missed").
3. A past day with a finished workout (not today) still renders `cd worked` only — no
   regression.
4. A past day with no workout (not today) still renders `cd missed` only — no
   regression.
5. A future day still renders `cd future` only — no regression.
6. Full e2e suite (`node tests/e2e/run.mjs`) passes, 0 failures — note pass count.
7. `git status` clean, pushed to `staging` via `scripts/jacked-push.sh --branch staging`,
   PUSHED/VERDICT lines read back. No push to `main`/prod without his explicit go.

## Not doing
- Not touching `miniCal()` / leaderboard — it's already correct, it's the reference.
- Not changing "missed" semantics for days that aren't today.
- Not adding any new data layer — `gH()` already has what's needed.

## Tries
5 (expect 1 — single conditional fix).

## Open questions
None — instruction was fully specific and the existing leaderboard code is a precise
reference for the target behavior.
