# Watch app dev notes (Mr. Roni, running list)

Read `WATCH_BRIDGE.md` (same folder) first: it lists which phone-app changes the watch must mirror.
This file is the watch-only to-do list.

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

## 3. Dial edits the wrong field after touching another one — OPEN
Source: Mr. Roni, 2026-09-19 3:15pm MDT (adds to item 1).

**Where:** the set row on the active workout, fields Sets and Reps (SPEC §4.2, bezel scrubs "the focused field").

**Observed (his words):** with Reps selected, touching the Sets value and changing it works,
but Sets does not become the selected field, so the dial keeps editing Reps.

**Required behavior:**
1. Touching a field (tap, or touch-drag/scroll on it) makes it the focused field immediately,
   before any dial input. The dial then edits that field.
2. Exactly one field is focused at a time, and it shows a visible focus state, so it is clear
   what the dial will change.
3. Applies to every editable field in the row (Sets, Reps, Weight, and the duration/distance
   variants), not only Sets and Reps.
4. Changing a value by touch and then turning the dial edits that same field, with no extra tap.

**Acceptance test:** focus Reps. Touch Sets and change it by touch. Turn the dial: Sets
changes and Reps stays put. Touch Reps: the dial now edits Reps.

**First thing to look at:** the touch handler on the value changes the value but never sets
the focused-field state that the dial handler reads. Verify in the watch code.

## 4. Change-exercise / search screen is visually muddled — OPEN
Source: Mr. Roni, 2026-09-19 3:18pm MDT (same screen as item 2).

**Where:** the picker opened by changing an exercise (and "+ Exercise", same screen).

**Observed (his words):** the search interface is "muddled together", hard to tell where
things are, "a bunch of text together". He wants: a clear hierarchy of titles, a search bar
that stands out, and sections that look cohesive and clearly sectioned off. More digestible.

**Required behavior (use DESIGN.md tokens, no new colors or fonts):**
1. **Title hierarchy:** three distinct levels. Screen title (Barlow Condensed bold, white),
   section headers (uppercase, letter-spaced, muted, small, per DESIGN.md §2 label style),
   exercise rows (DM Sans, name white bold, one muted line under it for muscle/equipment).
2. **Search bar:** its own inset box (`bg4` on `bg2`, 18px radius per DESIGN.md §3), search
   icon, placeholder text, teal outline when focused. Clearly separate from the list below,
   with spacing above and below. It is the first thing under the title.
3. **Muscle filter:** shown as its own row of pills under the search bar. The selected pill
   is teal filled, the rest are `bg4` (this is where item 2's pre-selected filter shows).
4. **Sections:** the list is grouped under muted uppercase headers in the order from item 2:
   FAVOURITES, RECENT, then ALL (label the last one by the active muscle filter). Each group
   is a card (`bg2` on black) with a small gap between cards. No header when a group is empty.
5. Rows keep 48dp tap targets. One primary teal element only (the selected filter pill).

**Acceptance test:** a person can tell at a glance, without reading, which part is the title,
which is the search bar, which is the filter, and which group each exercise is in.

**Note:** no mockup exists yet. Before building, produce one for Mr. Roni and get his
approval; do not choose the final look alone.

## 5. Focus mode: one exercise fills the whole screen — OPEN
Source: Mr. Roni, 2026-09-19 3:28pm MDT.

**Where:** the active workout list (SPEC §4.2, the vertical list of exercise cards).

**Observed (his words):** scrolling down the workout and lining things up is fiddly. He wants
to tap an exercise, have it become the whole screen, finish it, then move to the next, so he
can "lock in" on one exercise at a time.

**Required behavior:**
1. Tapping an exercise card in the workout list opens that exercise full screen (focus view).
2. The focus view shows only that exercise: name, PR line, all its set rows (with the
   field focus and dial behavior from items 1 and 3), + Set, and the rest timer.
   No other exercises are visible, so nothing needs scrolling or lining up.
3. Leaving the focus view returns to the workout list, with the exercise's sets and
   done state saved exactly as entered.
4. A "next exercise" control in the focus view goes straight to the next exercise in workout
   order, without returning to the list. On the last exercise it becomes the path to Finish.
5. Optional but wanted: a way to go back to the previous exercise the same way.
6. The list stays the home view. Focus view is opened by the user, never forced.

**Acceptance test:** from a 4-exercise workout, tap exercise 2, log all sets, tap next, land on
exercise 3 full screen, back out to the list: exercise 2 shows its logged sets.

**Decided by Mr. Roni (2026-09-19 3:40pm MDT):**
- Advance is tap-only. Tapping next goes to the next exercise's focus view. It never
  auto-advances when the last set is checked.
- The user can always go back to the full workout list from the focus view.
- Leaving the focus view: a close button AND a back swipe. Both return to the full list.

## Open questions for Mr. Roni
- None yet. Add here instead of picking an answer.
