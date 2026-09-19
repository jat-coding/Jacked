# Watch app dev notes (Mr. Roni, running list)

Each item is written as a spec so the bot working it does not have to decide what was meant.
Source: Mr. Roni, Jacked room, 2026-09-19 3:13pm MDT. Status column: open until he says done.

## 1. Rep/set dial (rotary) is erratic — OPEN
**Where:** editing the reps and sets values on an exercise (SPEC §4.2, "Rotary bezel scrubs the focused field").

**Observed (his words):** no vibration as the number changes; spinning fast makes the value
jump in steps of 5 and larger; "sporadic and erratic". He wants it precise.

**Required behavior:**
1. One detent of dial travel = exactly ±1 on the value. Never more per detent.
2. Fast spinning must not skip numbers. If events arrive faster than the UI can draw, queue
   or sum them so the final value equals the detent count, and step the displayed value
   one at a time. No velocity multiplier, no acceleration, no 5s.
3. A haptic tick fires on every value change (one tick per number). Use the platform's
   lightest tick/click effect, not a buzz.
4. Weight is not part of this item. Do not change how weight increments work.

**Acceptance test:** spin 20 detents fast, the value moves by exactly 20 and 20 ticks fire;
spin back 20, the value returns to the start.

**First thing to look at:** whether the dial handler applies the raw event delta or a
velocity/scroll-amount value (the 5+ jumps point at delta or acceleration being applied to
the value). Verify in the watch code before changing it. Note: this repo has only the specs
for the watch client (`watch-client/*.md`); the watch source is not in it, so read the real
code first and record its path here.

## 2. Change-exercise picker should start filtered and ranked — OPEN
**Where:** changing an existing exercise on the active workout (not "+ Exercise" for a new one).

**Observed (his words):** it opens the picker on "All muscle groups". For a leg press it
should already be filtered to Legs.

**Required behavior:**
1. Opening the picker from an existing exercise pre-selects that exercise's muscle group
   filter (`muscle` from the exercise record, API.md §5). The user can still clear it to see all.
2. Ordering inside the list: favourites first (`jk_favEx`), then exercises the user has
   logged before, most recently used first, then everything else in library order (what the PWA does).
   Same rule the PWA uses (`jacked-pwa/index.html`, list ordering near line 1267: favourites,
   then used exercises). Reuse it; do not invent a second rule.
3. The exercise being replaced does not appear in its own list.

**Acceptance test:** on a leg press, tap change: the filter reads Legs, a favourited leg
exercise is at the top, then recently used leg exercises, then the rest of Legs.

## Open questions for Mr. Roni
- None yet. Add here instead of picking an answer.
