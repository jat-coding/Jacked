# Profile modal — obvious active tab

## Goal
In the Profile modal, the Profile / Body Metrics segmented toggle (`profTabTog`,
`.unit-tog`) floats above the content with no visual link to it. Scrolling down
through a tab's fields (e.g. Preferences, Units, Default Rest) loses the tab
reminder once the pill scrolls off-screen — his screenshot shows the "Profile"
tab active but the section below (Preferences) doesn't read as belonging to it.
Make it obvious, while looking at the data, which tab you're in.

## Open questions
1. How should the link be made obvious? ANSWERED 2026-09-29 7:32pm: "Wrap each tab's fields in a
   card connected to the active pill (no pinning)." Build 3 looks for him to pick from.
2. Which of A / B / C? Sent 2026-09-29 (msgs 1331/1333/1334, topic 620). Waiting on his pick.

## Done when (2026-09-30 queue step 1: ship A only)
- [x] Only the folder look (A, with the blend fix) remains: variants B/C CSS, the `?ptv` switch,
  `jkui_ptv` and the repeated in-panel heading are deleted.
- [x] Whichever fields are showing read as belonging to the active tab (they sit in its card).
- [x] Save Profile inside the card; Data & Backup outside it.
- [x] Switching tabs is still a single tap, same as now.
- [x] e2e `profileTabs` suite (7 checks); full `tests/e2e/run.mjs` 588/588 on JK_PORT 8799.
- [x] No new console errors.
- [x] Screenshots of both tabs at 390x844 sent to room -1003926058645 topic 620
  (artifacts/jacked-profile-tabs/final/profile-tabs-{profile,body}.png).
- [x] BUILD v1.10.45, pushed to staging (PUSHED read back).

## Not doing
- Changing what fields live in which tab.

## Tries
5

## Status
**2026-09-30: shipped as v1.10.45 on branch feat/sep30-queue -> staging.**

Mockups built on local branch `mock/profile-tabs` (commit dc1f839, cut from origin/staging; not pushed,
not on staging). One codebase, switch `?ptv=a|b|c` (sticks in localStorage `jkui_ptv`, default a):
A folder tab, B outlined panel + caret, C tinted full-width panel. Save Profile inside the panel;
Data & Backup outside. Full e2e 581/581 on the branch (default look A). Screenshots:
~/agent/artifacts/jacked-profile-tabs/variant-{A,B,C}.png (390x844: Profile tab, Body Metrics tab,
scrolled halfway, gold mode). Shot script: tests/e2e/shot-profile-tabs.mjs.
Recommended C. Next, once he picks: keep that look's CSS, delete the other two and the ?ptv switch
(profTabsMark), add an e2e check that the panel wraps the fields + Save, then merge to staging.

**2026-09-29 19:46 MDT — he picked A**, but flagged the inactive tab looked cut off (photo:
bridge/run/photos/-1003926058645_620-1790732768579.jpg). Fixed same commit-session, commit on
`mock/profile-tabs`: inactive tab bg changed `var(--bg3)`->`var(--bg2)` (was lighter than the
modal, so it popped forward instead of receding), border dropped to transparent (was the hard
edge reading as "cut off"), opacity .75->.55, margin-top 6px->9px. New screenshots sent
(msg 1338/1339, artifacts/jacked-profile-tabs/variant-A-fixed-{profile,body}.png) — not yet
confirmed by him. Full e2e not re-run for this tweak (CSS-only on the mockup toggle, not yet
merging); re-run before the eventual staging merge. Once he confirms: drop `?ptv=b|c` CSS/switch,
keep only the A look (with this fix), add the e2e check from the original plan, merge to staging.
