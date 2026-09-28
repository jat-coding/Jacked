---
project: Jacked
date: 2026-09-27
status: done
---

# Exercise-library gaps + categorization/math audit

## Goal

Add the 4 exercise-library gaps Mr. Roni confirmed he wants (icon-only, no photo), fix the
crunch/cardio regex bug found during the earlier audit, and do a wider pass over how
exercises get categorized (muscle/equipment/cardio/bodyweight tagging) and the math built
on top of that categorization (e1rm, strength ratios, badge tiers, per-session stats),
fixing any confirmed bugs found the same way the crunch bug was found — real, checked
against the real dataset, not suspected.

## Done when

- [x] PASS — Lat Raise (machine), Hip Thrust (machine), Assisted Pull-Up (machine),
      Assisted Dip (machine) exist as `bi_*` built-ins tagged shoulders/glutes/back/
      triceps, equipment machine, icon-only (colored dumbbell glyph via exIcon, no
      photo). Confirmed by screenshot of the real Add-Exercise picker
      (research/jacked-machines-picker-20260927.png) showing all 4 with colored icons
      next to real-photo entries — not just a data-shape check.
- [x] PASS — the real bug was in `guessMuscle()` (the import muscle guesser), not
      `isCardioCat()` itself (which has no name regex and never miscategorized
      crunches as Cardio). `/run/` substring there guessed "cardio" for all 23 crunch
      names in the 876-entry free-exercise-db dataset; fixed to whole-word matching.
      Verified both directions against the real dataset in tests/e2e/run.mjs: 0 crunch
      names guess cardio, all 14 real cardio names still do.
- [x] PASS — full audit done across all 660 library exercises (643 free-exercise-db +
      13 warm-ups + 4 new machines): 14 confirmed, fixed bugs (bodyweight-as-full-BW
      strength scoring, 0-rep/negative-weight math, missing filter chips, import
      name-matching false positives, mechanic tag errors, per-hand/band factors, blank-
      muscle usage skip, assisted reps counting toward Pull-up-Maxing). 9 judgment
      calls surfaced, not silently changed. Full per-exercise table + evidence in
      research/jacked-exercise-audit-20260927.md. Core-inclusion logic unchanged by
      this pass (still credits Core from stored muscle, library secondary muscles, and
      routine name per the 2026-09-25 fix) — could not locate a logged transcript of
      the specific 5:35pm exchange to diff against; flagged as an open item rather than
      assumed.
- [x] PASS — 524/524, independently re-run (JK_PORT 8801, fresh port), 0 failures.
- [x] PASS — committed (b77d383, dc595ca, 1633504, v1.10.39-41); pushed to `staging`
      only via `scripts/jacked-push.sh --branch staging`, PUSHED/VERDICT confirmed
      below. `main`/Netlify not pushed.
- [x] PASS — sent via Telegram, reply-to 1170, room -1003926058645 topic 620 (see
      send confirmation in research/jacked-exercise-audit-20260927.md).

## Not doing

- Cardio depth (adding more cardio *exercises*) — that's a separate, bigger ask he hasn't
  greenlit; this task only fixes the miscategorization bug, not the thinness of the real
  cardio category.
- Any photo/image work — all 4 new entries are icon-only by his own decision this session.
- Pushing to `main` / Netlify prod.

## Tries

5 build-and-check rounds before stopping to ask.

## Open questions

None outstanding — he gave a fully specific go-ahead on all three parts in this session.
