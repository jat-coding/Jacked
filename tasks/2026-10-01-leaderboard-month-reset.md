---
project: Jacked
date: 2026-10-01
status: done -- v1.10.58 on staging; production needs Mr. Roni's go
---

# Leaderboard "This Month" resets on the 1st

## Ask
Mr. Roni 2026-10-01, topic 620, photo taken Oct 1 (bridge/run/photos/-1003926058645_620-1790900593302.jpg):
"Past Month" still showed Dad 413.1K lb. "For the leaderboards first day of the month should show the metrics reset
for the leaderboards."

## Root cause
monthStats() was a trailing 30 days (it slid, never reset), and Streak/Consistency/Badges had no month value at all
(the month getter returned the all-time number). Friends' month numbers were whatever their device last published
(data.m, also trailing 30 days, unstamped), so a friend who hadn't synced since September kept September numbers.
Dad's 413.1K lb = his published m.v 187,401 kg from Oct 1 20:30Z (old build).

## Done criteria
- [x] Calendar month in local time (monthBounds/ymKey), resets at midnight on the 1st. Toggle renamed "This Month".
- [x] Every chip has a month definition, shown as a one-line caption under the chips:
      Weight = total lifted since the 1st; PRs = PRs set since the 1st (sum of prCount); Sessions = workouts since
      the 1st; Streak = longest run of consecutive training days inside the month; Consistency = training days this
      month / days so far this month (1st..today); Badges = monthly badges earned this month (Challenge-Maxing,
      Comeback-Maxing, Jacked).
- [x] On the 1st with no workouts: everyone 0, no medals for 0, you first then by name, "New month, fresh board" note.
- [x] Crown = previous calendar month's winner (pv), measured per person on that month (see friends).
- [x] All Time unchanged.
- [x] Published data.m stamped with ym and carries st/c/b; cleanPerson + refreshFriends keep them.
- [x] Friends (monthOf): stamped with the viewer's current month -> their numbers. Otherwise (old build publishing
      rolling 30 days, or no publish since the 1st) their published totals are never used: Weight and Sessions are
      counted from their friend-visible workouts (data.wd, last 30 days) dated this month; Streak/Consistency from
      their training days (days + wd + recent); PRs and Badges 0 (not readable from shared data), so nothing stale
      ranks them up. Crown pv: stamped last month -> that month's final total; stamped this month -> their pv;
      unstamped -> their pv only when the same publish holds a workout dated this month (so it was computed after the
      1st), else last month's shared workouts summed. This stops an old build's pv from being August.
- [x] Watch: nothing it reads changes. data.m shape changed (additive + meaning of v/w/p): API.md §7 updated,
      WATCH_BRIDGE changelog row, BOARD.md heads-up in the pwa section. WATCH_STATUS untouched.
- [x] Tests (monthReset, 25 checks; the suite fails on v1.10.57, 1/5 then crash): Sep 30 23:59 vs Oct 1 00:05 America/Denver
      (a Sep 30 23:30 MDT workout = 05:30Z Oct 1 stays September); all chips 0 on Oct 1 for you, an old-build friend
      and a September-stamped friend; crown on Oct 1 = September winner from shared Sept workouts, not the stale pv;
      Oct 5 values match for you, an old-build friend and an October-stamped friend; published m equals the board;
      board order/medals/toggle text; All Time unchanged. Crown fixtures in the older suite gained mYm.
- [x] Full suite 823/823 (JK_PORT 8799).

## What his board shows tonight (read-only SQL on profiles.data, 2026-10-01 ~18:30 MDT)
Everyone is on an unstamped build until they update. Dad, Mom, Isaac: no October workouts -> 0. Grant logged on
Oct 1 -> that workout counts. Crown (September): Dad from his shared September workouts (about 413K lb, same as his
own September total); Mom's crown figure becomes her September (~265K lb) instead of the August 71K her old pv held.

## Notes
- Another session committed a smaller version of this on local main (72c946a, 18:25 MDT, not pushed: calendar
  v/w/p + rename only, no friend handling, Streak/Consistency/Badges unchanged). This build supersedes it; 72c946a
  was not pushed and local main was not fast-forwarded (it diverges).

## Send-backs
(none yet)
