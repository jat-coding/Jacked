---
project: Jacked
date: 2026-09-30
status: partial (dumbbell done; Smith machine STOPPED, needs his call)
---

# Bench-Maxing substitutes (Smith machine, dumbbell)

## Goal
Mr. Roni 2026-09-30 10:09-10:13am: for people without a flat barbell bench, Bench-Maxing ONLY (not the 1000lb
Club) also accepts Smith machine bench (he expected a discount / negative multiplier) and dumbbell bench (bonus /
positive multiplier; logged per hand). Ratios must be SOURCED, same standard as the GOODLIFT research
(research/research-20260925-211435-52441.md); no credible source => stop that one and say so.
Display: each applicable lift shows on the tier it reached with its converted value; the badge tier is the highest;
label the value with the exercise that reached it (popup + list row). Remove GOODLIFT points from the popup; keep
the thresholds.

## Sources (read in full from PubMed E-utilities / the paper PDF, 2026-09-30)
1. **Saeterbakken AH, van den Tillaar R, Fimland MS (2011).** A comparison of muscle activity and 1-RM strength of
   three chest-press exercises with different stability requirements. *J Sports Sci* 29(5):533-538,
   doi:10.1080/02640414.2010.543916, PMID 21225489. 12 resistance-trained men, all three lifts, counterbalanced.
   "The dumbbell load was 14% less than that for the Smith machine and 17% less than that for the barbell.
   The barbell load was ~3% higher than that for the Smith machine."
2. **Cotterman ML, Darby LA, Skelly WA (2005).** Comparison of muscle force production using the Smith machine and
   free weights for bench press and squat exercises. *J Strength Cond Res* 19(1):169-176, doi:10.1519/14433.1,
   PMID 15705030. 16 men + 16 women. "The bench 1RM was greater for FWs than the SM ... for men and women."
   SM bench 1RM (kg) = -6.76 + 0.95 x FW bench 1RM.
3. **Smoak Y (2023).** Randomized trial comparing barbell and dumbbell bench press on maximal strength and power
   output. *J Strength Perf* 2-1, doi:10.21428/6404b16e.2ce996b2. Baseline 1RM: barbell 104.4 / 107.1 kg, dumbbell
   75.6 / 77.5 kg (ratio 0.72); post 0.735 / 0.751. Weaker: small journal, subject details disagree between the
   abstract and methods. Used as a bracket only.
4. **Heinecke ML et al. (2020).** Relationship of barbell and dumbbell repetitions with 1RM bench press in college
   football players. *JSCR*, PMID 33666593. Reps to failure: 90.9 kg barbell 13.8 vs 2 x 45.5 kg dumbbells 12.5
   (r=0.96) -- implies a much smaller gap (~0.97 by Epley). Indirect (no dumbbell 1RM). Bracket only.

## Decision
- **Dumbbell bench (`Dumbbell_Bench_Press`, flat only): BUILT.** barbell-equivalent = (2 x per-hand weight) / 0.83,
  from source 1 (the only direct, peer-reviewed 1RM comparison in the same subjects). Sources 3 and 4 bracket it
  (0.72 and ~0.97), so 0.83 is the middle, not the most generous. 100 lb dumbbells per hand -> 241 lb.
  Per-hand: the app (STR_EQUIP_FACTOR dumbbell:2) and Hevy both log one dumbbell's weight; the x2 is applied.
- **Smith machine: STOPPED, not built.** Both sources that measured it (1, 2) found the Smith bench 1RM LOWER than
  the free barbell (about 3% in source 1; 0.95 x FW - 6.76 kg in source 2, ~12% lower at 100 kg). A sourced
  conversion would therefore RAISE a Smith number, the opposite of the discount he asked for. Building it either
  way breaks either his instruction or the sources. Options for him: (a) sourced bonus (~x1.03 to x1.12),
  (b) count a Smith lift 1:1 (already slightly in the barbell's favour per both studies) -- my recommendation,
  simplest and never makes Smith the easy route, (c) leave Smith out. Smith bench currently earns nothing.

## Done when
- [x] Dumbbell bench counts for Bench-Maxing only, converted as above; 1000lb Club untouched (test).
- [x] Per-hand handling checked and tested (100/hand -> 241).
- [x] Popup: each lift on the tier row it reached, value + "from 2 x N lb dumbbells"; under Bronze shows as
      "Below Bronze"; badge tier = highest; list row and highest-ever show "241 lb (Dumbbell bench)".
- [x] GOODLIFT points removed from the popup and list text ("Set for your sex and N lb body weight"); thresholds kept.
- [x] Neutral-grip / incline / decline / custom dumbbell bench don't count; Hevy "Bench Press (Dumbbell)" does.
- [x] Live logger chip fires on the dumbbell bench and says "barbell-equivalent".
- [x] e2e suite benchSubstitutes (15 checks); full 639/639 on JK_PORT 8799.
- [ ] Smith machine: waiting on his pick (a/b/c above).
- [x] BUILD v1.10.47 on staging.
