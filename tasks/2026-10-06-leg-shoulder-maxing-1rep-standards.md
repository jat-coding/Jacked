# Leg-Maxing and Shoulder-Maxing: sourced 1-rep standards, same approach as Bench

## Goal
Mr. Roni, 11:56am-11:58am: "For the leg and shoulder maxing they should all be 1 reps. Just
as how bench maxing is. This should be the standing rule for future exercise PR
achievements as well." Answers: tiers get sourced 1-rep standards adjusted for sex, age,
body weight, same approach as Bench; whatever counts as Bench's 1-rep lift counts the same
way for all three badges.

## What changed
- Leg-Maxing (squat) and Shoulder-Maxing (ohp) now require only 1 rep on a set (was 5),
  matching Bench-Maxing exactly — raw logged weight, no e1rm conversion (Bench doesn't do
  this either, confirmed by reading its code before building).
- Their tier ladders are no longer a hand-picked fraction of body weight
  (squatFrac:[1,1.5,2], ohpFrac:[.25,.5,1], 5-rep calibrated, unsourced). They're now
  interpolated from StrengthLog's real 1RM strength-standard tables (squat: 15,314 men /
  6,760 women; OHP: 14,081 men / 5,711 women), Intermediate/Advanced/Elite rows mapped to
  Bronze/Silver/Gold, by body weight (lb) and sex.
- Confirmed no official IPF GL coefficient exists for squat or OHP alone (fetched the
  IPF's own IPF_GL_Coefficients-2020.pdf: only 4 rows exist — Classic/Equipped
  Powerlifting Total and Classic/Equipped Bench Press). So unlike Bench, these can't use
  the GOODLIFT formula; StrengthLog is the real-data substitute.
- Age-easing switched from the generic `badgeAgeFactor` (used by pull-up/push-up/cardio)
  to the same McCulloch masters factor Bench uses (eases 41+, no change under 40) — this
  is what makes "all three badges count the same way" literally true, not just similar.
- All UI copy ("5 reps" / "×5" / "% of body weight") updated to "1 rep" / plain lb
  numbers, mirroring Bench's existing text exactly.

## Known gap, not built
Bench got a grandfather clause when its formula changed (BENCH_GL_FROM /
benchLegacyT()): nobody loses an already-earned tier to a formula recalibration. Not
replicated here for squat/ohp — would need two more legacy ladders + a reps≥5-before-cutoff
tracker, real but nontrivial extra surface. If someone's Leg-Maxing or Shoulder-Maxing
tier drops under the new sourced numbers, that's the known, deliberate omission. One more
build if he wants it added.

## Done when
- [x] Squat and OHP accept a 1-rep set (was 5) — tested directly, and via Hevy import.
- [x] New tier ladder sourced from real external data, interpolated by sex + body weight,
  matches StrengthLog's published tables at the test bodyweight (180 lb).
- [x] Seated presses, front squats, Smith squat, and all other excluded variants still
  excluded — unaffected by the tier-source change (tested).
- [x] Dumbbell +15% / Smith -15% credit mechanism for OHP still works against the new
  ladder (tested).
- [x] Popup/list copy says "1 rep" and lb numbers, no stale "5 reps"/"×5"/"% of body
  weight" text anywhere (grepped clean).
- [x] Full suite `node tests/e2e/run.mjs`: 1096/1096 (17 tests updated for the new
  numbers/behavior, 2 stale test fixtures fixed that hardcoded the old squat Gold
  threshold).
- [x] Pushed to `staging`, PUSHED/VERDICT read back. No touch to `main`/prod.

## Not doing
- No grandfather clause for already-earned squat/ohp tiers (see "Known gap" above).
- Not touching Bench-Maxing itself — already matches this approach, used as the reference.
- Not renaming the internal `ohpFrac`/`squatFrac` field names, even though they're no
  longer fractions — would touch every call site again for a cosmetic rename; flagged in
  a code comment instead.
