# Badge fixes (Mr. Roni, 2026-09-30 10:19am, room -1003926058645 topic 620)

Queue AFTER feat/sep30-queue (spawn-agent PID ~2063753, started 10:19am, 3h timeout) finishes —
same repo/branch, don't run concurrently.

## 1. Shoulder-Maxing (OHP) barbell/dumbbell audit — CHECKED, no bug found
He asked to look for a per-hand/sneak-in bug like the bench one. Checked jacked-pwa/index.html:
- `ohpPred` (line ~4035) and the `key==='ohp'` matcher (line ~3350) both require
  `nm.includes('barbell') && (nm.includes('overhead press')||nm.includes('military press'))`.
- Dumbbell OHP does NOT match either pattern — it is excluded entirely, does not sneak into
  Shoulder-Maxing. No per-hand halving issue exists here because dumbbell OHP contributes nothing.
- This matches his 10:13am scope lock: substitute-exercise multiplier applies to Bench-Maxing
  ONLY. Nothing to fix unless he wants dumbbell OHP added as a substitute (not requested).

## 2. PR-Maxing: streak -> weekly count
Current (index.html ~4010-4012, 4090, 4148): earned = best streak of 7 CONSECUTIVE days each
with >=1 PR, computed over the last 3 months (`prBest3=bestStreak(...)`, `prWeek=prBest3>=7`).
Still a `threeMonth:true`, non-tiered, single earned/locked badge.

New rule (Mr. Roni, 2026-09-30 10:19am): earned = 10 total PRs within any 7-day window
("a week"), not a day-streak. Each workout's `w.prCount` (already tracked, can be >1/day)
sums toward the window total.

ANSWERED (Mr. Roni, 2026-09-30 10:25am): rolling 7-day window (any start day), not a fixed
calendar week.

Implementation sketch: replace `bestStreak` PR calc with a sliding-window sum of `prCount`
over `h3` (last-3-months filtered history) by day, best window's total displayed instead of
"best: N days"; earned when best window total >=10. Update desc string, BADGE_HOW,
BADGE_DETAIL (lines ~4090, 4148, 4191, 4216) to describe count not streak. Test: 10 PRs
spread across 6 days triggers it; 9 PRs in a week does not; PRs >3 months old don't count.

## 3. Coward-Maxing "Earned" pill wrong color — CONFIRMED BUG, fix is unambiguous
index.html line 4967-4968:
```
: (b.earned&&b.name!=='Coward-Maxing')?'<span class="badge baccent">Earned</span>'
: b.earned?'<span class="badge bgreen">Earned</span>':'<span class="badge bm">Locked</span>';
```
Every other earned non-tiered badge gets `.baccent` (teal, rgba(32,211,194)). Coward-Maxing
earned is explicitly carved out to `.bgreen` (bright green, rgba(77,255,145)) — same
"good news" green used everywhere else in the app for success, even though holding
Coward-Maxing is bad (it's a penalty that locks Jacked). That's the wrong-color bug he's
pointing at: a penalty badge shouldn't read as a win.
Fix: give Coward-Maxing's earned pill a distinct warning class (e.g. new `.bwarn` — amber/red,
not green/teal) instead of `.bgreen`. Also check `computeBadges()` badge object (~4150) /
the `teal` bool at 4224 for other spots Coward-Maxing color is decided, keep them consistent.
Test: Coward-Maxing earned shows visibly different (non-green, non-teal) from every other
earned pill.

## Done-when
- [x] 2 answered: rolling 7-day window (2026-09-30 10:25am)
- [ ] PR-Maxing rebuilt to weekly-count rule, tests pass
- [ ] Coward-Maxing pill recolored off bgreen, tests pass
- [ ] staging push, version bumped, screenshot of achievements screen sent
