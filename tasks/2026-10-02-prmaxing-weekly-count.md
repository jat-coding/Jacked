# PR-Maxing: streak -> rolling 7-day PR count (Mr. Roni, locked 2026-09-30 10:19-10:25am,
threshold revised 2026-10-02 7:32-11:28pm, room -1003926058645 topic 620)

See tasks/2026-09-30-badge-fixes-2.md item 2 for the full decision history (10 -> 7 threshold
revision, rolling-vs-calendar-week answer).

## Goal
PR-Maxing required a personal record on each of 7 CONSECUTIVE days (`bestStreak` over
workouts with `prCount>0`). Replaced with: earned when the best ROLLING 7-day window (any
start day, not a fixed calendar week) has a running total of at least 7 PRs, summed from
each workout's `prCount` (a workout can contribute more than 1 toward the total). Only the
last 3 months of history count — the existing `threeMonth:true` reset is unchanged.

## Done when
- [x] New `bestWeekTotal(h)` helper: two-pointer sliding window over distinct days with
      PRs, sums `prCount` within any 7-calendar-day span, returns the best total.
- [x] `computeBadges()` PR-Maxing calc (`prBest3`/`prBestAll`) uses `bestWeekTotal` instead
      of `bestStreak`; `prWeek = prBest3>=7` unchanged shape.
- [x] Label/desc, `BADGE_HOW['PR-Maxing']`, `BADGE_DETAIL['PR-Maxing']`, and the `ALL[]`
      all-time summary string all describe a count ("best: N PRs in 7 days") instead of a
      day-streak.
- [x] Stale comments describing the old streak rule updated (computeBadges() PR-Maxing
      comment, the Consistency-Maxing "not a duplicate of PR-Maxing" comment, the
      LIVE-METRIC-TIER-BADGES section comment).
- [x] e2e: 7 PRs spread across 6 days in one rolling week triggers it (not just 7
      consecutive 1-PR days).
- [x] e2e: 6 PRs in a rolling week does not earn it.
- [x] e2e: a single workout with 2 PRs plus 5 more scattered PRs across the window still
      totals correctly (7, desc shows it).
- [x] e2e: PRs older than 3 months don't count toward the total.
- [x] Full suite passes: 1038/1038.
- [x] BUILD bumped (v1.10.69 -> v1.10.71; v1.10.70 landed first from a concurrent push), pushed to `staging` only.

## Not doing
- Item 1 (Shoulder-Maxing OHP audit) and item 3 (Coward-Maxing pill color) from
  2026-09-30-badge-fixes-2.md — separate, out of scope for this task.
- No change to Consistency-Maxing, Coward-Maxing, or any other badge's rule.

## Result
Staging v1.10.71, branch `fix/oct2-prmaxing-weekly-count`, pushed via
`scripts/jacked-push.sh --branch staging`. Not pushed to main/production.
