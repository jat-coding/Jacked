# Watch app dev notes (Mr. Roni, running list)

Read `WATCH_BRIDGE.md` (same folder) first: it lists which phone-app changes the watch must mirror.
This file is the watch-only to-do list.

Each item is written as a spec so the bot working it does not have to decide what was meant.
Source: Mr. Roni, Jacked room, 2026-09-19 3:13pm MDT. Status: closed when the watch dev reports it built and the version (Mr. Roni, 2026-09-25: no waiting for him to say done).

## 1. Rep/set dial (rotary) is erratic — BUILT (Wear v0.17; closed 2026-09-25)
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

## 2. Change-exercise picker should start filtered and ranked — BUILT (Wear v0.15; closed 2026-09-25)
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

## 3. Dial edits the wrong field after touching another one — BUILT (Wear v0.15; closed 2026-09-25)
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

## 4. Change-exercise / search screen is visually muddled — BUILT (Wear v0.17; closed 2026-09-25)
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

## 5. Focus mode: one exercise fills the whole screen — BUILT (Wear v0.15; closed 2026-09-25)
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

## 6. Back / swipe-out must never skip a page — BUILT (Wear v0.18; closed 2026-09-25)
Source: Mr. Roni, 2026-09-20 3:31pm MDT.

**Observed (his words):** in the change-exercise menu on a routine, he opens the muscle-group
filter page. Backing out or swiping out of it goes to the *routine*, not back to the change-exercise
page. It skips a page. He wants this checked for **all** instances: no skipped pages when backing out.

**Required behavior:**
1. Every screen's back action (the platform back / right-swipe on Wear; the back gesture and back
   button on watchOS) returns to the screen that opened it, one step at a time.
2. Applies to every screen and every flow, not just the filter page. Both watches.
3. The focus view keeps its decided behavior (item 5): close button and back swipe both return to the list.
4. Do not guess the cause. Reproduce on the emulator first, then read the navigation code
   (a pop-up-to / replace / reset of the stack on the filter route is one candidate, unverified).

**Audit deliverable:** list every screen and what opens it, then for each open-then-back pair
record the screen you land on, for swipe AND button. Put the table in `WATCH_STATUS.md`. Every row lands on the opener.

**Acceptance test:** routine -> change exercise -> muscle filter -> back lands on change exercise;
back again lands on the routine. Same for every other pair in the audit table.

## 7. Confirm before Finish and before Discard — BUILT (Wear v0.19; closed 2026-09-25)
Source: Mr. Roni, 2026-09-20 3:35pm MDT.

**Why:** misclicks. Today one tap on Finish or Discard ends the workout.

**Required behavior:**
1. Tapping **Finish** or **Discard** (workout list, and the focus view's tail from item 5) opens a
   confirmation first. Nothing is saved or deleted until it is confirmed. Cancel returns to the workout unchanged.
2. Match the phone's wording (`jacked-pwa/index.html`: `showConfirm`): Finish = "Finish and save this workout?"
   (with 0 sets logged: "No sets logged — finish anyway?"); Discard = "Cancel workout? All progress will be lost."
3. The confirm's destructive/confirm button must not sit where the tap that opened it lands (the
   point is to stop a stray double-tap). Default: cancel is the pre-focused/first option.
4. Applies to every route to finish/discard on both watches, including item 8's long-press discard.

**Acceptance test:** tap Finish then Cancel: workout intact, sets intact. Tap Discard then Cancel: same. Confirm: it finishes/discards.

## 8. Long-press the Resume button to discard — BUILT (Wear v0.19; closed 2026-09-25)
Source: Mr. Roni, 2026-09-20 3:35pm MDT.

**Where:** the main page while a workout is in progress shows a **Resume workout** button.

**Required behavior:**
1. **Do not change the Resume button's look or tap behavior.** Tap still resumes.
2. **Press and hold** it opens a **Discard** option (a small menu or sheet with Discard and Cancel).
3. Choosing Discard goes through item 7's confirmation, then deletes the in-progress workout and the
   main page returns to its no-workout state.
4. Add a discoverability hint only if it costs no layout change (his instruction is no interface change). Default: none.

**Acceptance test:** start a workout, go to main: tap Resume resumes. Hold Resume: Discard option appears. Discard -> confirm ->
main page shows no Resume button and the workout is gone from the watch.

## 9. Haptics on every value scroller, and the number drifts while scrolling — BUILT (Wear v0.18; closed 2026-09-25)
Source: Mr. Roni, 2026-09-20 3:40pm MDT.

**Observed (his words):** in Settings, the **Min, Max and Target sets** scrollers have no vibration
like the set-entry dial (item 1 / W1). He wants **every** scroll/dial value control to have it.
Also, changing those values, the number moves slightly **up** when scrolling up and slightly
**down** when scrolling down, i.e. it drifts off its resting position while scrolling.

**Mr. Roni, 2026-09-20 6:32pm MDT, driving this home:** the vibration is still not working on all
instances. There must be **one set piece of code, used by every value scroller and applied to each
instance**, so no scroller can be built without it. Per-screen haptic code is what caused the gaps.

**Required behavior:**
1. Every control that changes a value by scroll, bezel or dial gets the same feelable tick per
   value change as the set-entry wheels (CLICK class, per the v0.17 note: TICK is not felt on a wrist).
   Audit them all, not just those three: settings (Min, Max, Target sets, duration unit, anything else),
   set entry (weight, reps, distance, time, seconds), and any other picker. List each control and its
   haptic in `WATCH_STATUS.md`. Use one shared implementation (single component/modifier, the only place haptics are triggered for value changes) so a new scroller cannot miss it. Done = the audit table shows every control routed through it, and a grep for other haptic calls on value changes finds none.
2. The drift: the value should stay centred in place while it changes. Reproduce first, then find
   the cause (not guessed); check whether set entry has it too. If it is the wheel's scroll offset
   or animation, fix it in the shared wheel, so every scroller gets the fix.
3. **Needs one answer from Mr. Roni if the repro is unclear:** is the moving "set number" the
   number inside the scroller, or a different label near it? Default: the number inside the scroller.

**Acceptance test:** each control in the audit table ticks on every step, both directions. In
Settings, spin Min up and down: the number stays put (no visible up/down shift) while the value changes.

## 10. Focus view: no Finish/Discard; add a Lock in button — BUILT (Wear v0.19; closed 2026-09-25)
Source: Mr. Roni, 2026-09-20 6:07pm MDT (first asked 6:01pm as "Done", renamed and tightened). **Changes item 5** (its "last exercise shows the list's Finish/Discard tail").

**Required behavior:**
1. **Remove Finish and Discard from the focus view**, on every exercise including the last. They
   live only on the full workout list. Confirmed twice by Mr. Roni.
2. **Add a "Lock in" button at the end of the focus view** (below the set rows and the − Set / + Set row).
   It exists **only** on the focus screen. Tapping it **checks off the sets in that exercise**, then
   opens the **next exercise in line** in the focus view. If there is no next exercise it goes to the
   **full workout list**. Tap-only: it never fires by itself.
3. **Nothing else changes.** Exercises, sets, checking a set by hand, the list, and everything else work exactly
   as they did before; "lock in" is a function of this button alone and must not alter existing behavior.
4. Default (not specified): sets with no values are left as they are; Mr. Roni's wording is only "checks the sets".
5. No confirm on Lock in (approved by Mr. Roni). The item 7 confirms still apply to Finish and Discard on the list.
6. **On the last exercise (no next in line), the Next chip reads "Add another exercise"** and opens the add-exercise
   picker (item 4), instead of greying out as built in item 5. Mr. Roni, 6:32pm. If he does not add one, he taps Lock in,
   lands on the full list, and finishes from there.
7. Back/swipe from the focus view still returns to the list (item 5 / item 6). The ‹ Prev · All · Next › chips stay as built.

**Acceptance test:** last exercise's Next chip says "Add another exercise" and opens the picker; the added exercise then appears in focus order. Focus view of exercise 2 has no Finish or Discard. Enter sets, tap Lock in: the sets are
checked and exercise 3 opens. On the last exercise, Lock in lands on the full list. The button appears nowhere
else, and set checking outside it behaves as before.

## 11. Tapping an exercise in a routine opens the note prompt instead — OPEN
Source: Mr. Roni, 2026-09-21 6:58pm MDT.

**Where:** a routine, on the watch — before a workout starts (routines are read-only on the
watch per `WATCH_STATUS.md`) and, if it reproduces there too, in the workout list/focus view
after starting a workout from a routine.

**Observed (his words):** "it keeps prompting the notes section when trying to click anything
on the exercise in a routine." Wants it fixed everywhere — both watches, not just one.

**Required behavior:**
1. Tapping an exercise that belongs to a routine must not open the note editor/prompt. It
   should do whatever that screen's real action is (view the exercise, or nothing, since
   routine editing is read-only on the watch) — not fall through to notes.
2. Check every place a routine's exercises are tappable: the Routines list itself, and the
   workout list / focus view (item 5) when the workout was started from a routine.
3. Do not guess the cause. Reproduce on the emulator first (open a routine, tap an exercise),
   then find where that tap is wired to the note prompt instead of the expected handler.

**Acceptance test:** open a routine, tap each exercise in it — no note prompt appears, each
tap does its real, correct action. Start a workout from that routine and tap an exercise in
the resulting list/focus view — same result.

**Decided by Mr. Roni (2026-09-22 11:24pm MDT), answers requirement 1's "real action":**
tapping an exercise from the **full (list) view** of either a routine or a workout opens
**focus mode** (item 5) for that exercise. Same tap-to-focus behavior in both places, not
just the workout list — this replaces the note prompt as the real action for a routine's
exercises too.

**Update 2026-09-25 (Wear dev's corrected reading, Mr. Roni approved "sounds good"):** the watch has
no routine list to browse; the tap lands on a finished workout's exercise detail, where the note line
is the only live target. Fix: keep the note editable but make it a distinct, smaller "✎ Note" target
so it is not hit by accident; no other change. Still OPEN until Wear reports the version.

## 12. Focus-view Lock in button: stays full-width teal — DECIDED, no change
Source: Mr. Roni, 2026-09-22 11:24pm MDT, deciding between the two options in the mockup
sent 2026-09-22 (`BOARD.md` pwa entry, replying to Phil's wear field-test comment (b)).

**Decision:** keep **Lock in** as the full-width teal pill, as already built in item 10.
Phil's secondary-chip proposal (dark background, blending in with Prev/All/Next) is
**declined** — "the option on the left" (full-width teal) "looks cleaner." Nothing to
build; this closes comment (b). Comment (a) (centering the Discard confirm text on the
Galaxy) is unaffected and still approved.

## Open questions for Mr. Roni
- None yet. Add here instead of picking an answer.
