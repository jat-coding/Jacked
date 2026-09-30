# Badge math in per-exercise sections + trim popup wording (Mr. Roni, 2026-09-30 4:19pm, room -1003926058645 topic 620)

Queue AFTER feat/sep30-queue, badge-fixes-2, friend-avatar-lightbox, exercise-image,
routine-section-header-style, add-section-button-in-reorder, routine-sections-collapsible
— same repo/branch, don't run concurrently. 8th in the follow-up queue.

Ask: "When explaining the math on the achievements for how each workout works explain it
in sections specific to the exercise also for the tiers just show the exercise and the
weights no extra wording. Clean up all the popup screens they shouldnt have excess amount
of wording."

## Current state (checked jacked-pwa/index.html)
- `badgeInfo()` (~4293) renders the achievement popup: one prose "How to earn it" block
  (`BADGE_DETAIL[name].how`, ~4283-4296) and a "Tiers" list (`d.tiers`, `[label, value]`
  pairs) via `bf-tier` rows.
- Only **Bench-Maxing** currently has more than one counting exercise (barbell + dumbbell
  substitute, added 2026-09-30): its `how` text is one long paragraph covering both, and
  its tier rows already append each lift under the tier it hit via `liftsAt()` — but with
  extra wording per lift: `<span>from ${l.raw}</span>` (the raw pre-conversion number).
  Every other tiered badge (Shoulder/Leg/Pull-up/Push-up/Cardio-Maxing) has exactly one
  exercise, so "sections specific to the exercise" has nothing to split there today.
- `BADGE_HOW`/`BADGE_DETAIL` prose is generally dense: exclusion clauses ("Incline,
  decline, Smith machine and other variations don't count, and neither do exercises you
  created"), sourcing notes (benchHowNote()), adjustment notes (badgeAdjNote()) are
  appended to most entries.

ANSWERED (Mr. Roni, 2026-09-30 4:21-4:23pm):
1. Section-split applies to EVERY achievement with multiple exercises, not just
   Bench-Maxing. Per `BADGE_STD` (~3281) that's currently: **Bench-Maxing** (barbell +
   dumbbell, alternatives with a conversion), **Cardio-Maxing** (outdoor running +
   treadmill running, alternatives, same unit, no conversion), **1000lb Club** (bench +
   squat + deadlift, summed to a total, not alternatives — structurally different: this
   one needs a section per exercise showing its own contribution, then the total, not a
   "pick your best" tier ladder). Every other tiered badge has exactly one exercise —
   nothing to split there.
2. Scope is achievement popups ONLY (not friend profile, routine modals, etc.). Rewrite
   the "How to earn it" text across `BADGE_HOW`/`BADGE_DETAIL` (~4265-4296) shorter and
   less vague — his words: "too much text and the instructions are vague." Trim exclusion
   clauses/sourcing asides down to what's load-bearing; cut restating what the tier list
   below already shows.

## Done-when
- [x] Scope answered (2026-09-30 4:23pm): all multi-exercise badges, achievement popups only
- [x] Bench-Maxing, Cardio-Maxing, 1000lb Club "How to earn it" split into per-exercise
      sections (1000lb Club: per-exercise contribution + running total)
- [x] Tier/section rows show exercise + weight only, no "from X" or other asides
- [x] Every `BADGE_HOW`/`BADGE_DETAIL` "how" string rewritten shorter and concrete —
      spot-check against his complaint (too much text, vague instructions) before shipping
- [x] Tested (670/670), staging push (v1.10.54, commit c281b50, merged 37d1c1e), version bumped

This was the most structurally invasive of the 6 (touches computeBadges() core scoring,
not just popup markup) — worth Mr. Roni actually opening the 1000lb Club and Cardio-Maxing
popups on staging before this goes to prod.
