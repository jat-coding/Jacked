---
project: Jacked
date: 2026-09-27
status: done
---

# Multi-muscle (compound) credit for strength tiers

## Goal

Mr. Roni, 2026-09-27 8:04pm: "Glutes say that they aren't worked out but squats use multiple muscle groups and
incorporate glutes ... Look at all exercises and see what apply to multiple muscle groups. And adjust the math."

## Done when

- [x] One general model (exCredits / creditStrength) replaces the triceps-only press credit; every library
      exercise + customs/imports by name. Factors from Strength Level averages (table in
      research/jacked-multi-muscle-credit-20260927.md).
- [x] Group score = max(direct, credit); credit capped at the lift's own tier. Bench->triceps equivalent
      (0.9717 unrounded vs 0.97); OHP->triceps >= old.
- [x] Body map, ranking row, Suggested today agree for glutes; volume mode (no body weight) credits half sets.
- [x] Table of every exercise dumped with flags (tests/e2e/credit-table.mjs).
- [x] e2e: new multiMuscleCredit suite; full run 550/550 on JK_PORT 8799.
- [x] Mr. Roni's real 90 days (read-only): Glutes Untrained -> Strong.

## Not doing

- Deadlift's own Back score (counts 1:1 as a row) and leg press's Legs score (0.9 x as a squat): pre-existing,
  flagged as his call.
- Suggested today still does not count a chest day as Arms (2026-09-25 rule), even though bench now credits triceps.
