# Active workout: sticky mini stat bar on scroll

## Goal
On the Active Workout screen, the big "lb lifted / sets done" tile scrolls away with the
exercise list. Add a low-profile bar that appears just below the timer header once that
tile scrolls out of view, showing the same two numbers, so they stay visible while logging.

## Reported
2026-10-05 9:46pm, Telegram (Jacked room, topic 620), with screenshot:
`bridge/run/photos/-1003926058645_620-1791258380202.jpg`. Keep the existing big tile as-is;
this is additive, and it must be visibly thinner/lower-profile than that tile.

## Done when
- [x] A new element appears fixed just below `.ab` (the timer/Cancel/Finish header), only
      while on the Active Workout page and only once the big `.wstats` tile has scrolled
      above it — verified via scrollTo(0,0) → hidden, scrollTo(0,900) → shown with correct
      numbers, scrollTo(0,0) again → hidden.
- [x] Shows the same two live numbers as the big tile (lb lifted, sets done), kept in sync
      on every `renderWS()` call.
- [x] Visually low-profile: thinner padding/smaller font than `.wstats`, not a second big
      card.
- [x] Full e2e suite still passes, 0 failures.
- [x] No new console errors.
- [x] Committed and pushed to `staging` only (not main/prod without his go).

## Not doing
- Not removing or resizing the original big `.wstats` tile.
- Not pushing to main/prod.

## Tries
1 (built and verified first pass)
