---
project: Jacked
date: 2026-10-02
status: built -- v1.10.59 on staging; each part runs on the owner's device the first time it opens a build that has it; production needs Mr. Roni's go
---

# Mr. Roni's 9/25 dip "+ Added 230" and Dad's pre-9/27 Hevy labels

## Ask
Mr. Roni 2026-10-02 7:06am (topic 620), approving the follow-ups in tasks/2026-10-01-dad-backext-repair-plan.md:
1. Dip: "set added weight to 0 for that set" (his body weight typed into "+ Added" -> 459 lb x 12 record).
2. Dad: "relabel with the new matching". Same issue on Mr. Roni's own account: build it generic, enable for @dad
   only (per-account allow-list), report a dry run for @jat so he can decide.
Same mechanism as v1.10.56: one-shot, on the owner's device, flagged, idempotent, merge can't resurrect. Nothing
written to anyone's cloud row from the desktop (Supabase profile_backups read with SELECT only).

## Findings (read-only, backups @dad 2026-10-01 17:24Z, @jat 18:23Z)
- The dip workout is w1790301227388 (2026-09-25T01:53Z = 9/24 7:53pm MDT, "Chest"), exercise Dips_-_Chest_Version
  (body only, bwMode added). ALL FOUR sets carry 104.326 kg (230 lb), not one: 230 x 12, 7, 8, 6. Fixing only set 1
  would leave a 459 lb x 8 record, so all four are fixed (spec said "that set"; flagged in the result).
  Stored totalVolume 12,269 kg counted (body 229 + 230) x 33 reps; jk_prs.Dips_-_Chest_Version 208.2 kg x 12.
- The importer stores the original Hevy name verbatim as the entry's `name` (importWorkoutCsv), so item 2 is
  possible without guessing. Dad: 28 distinct (name, exId) pairs over 386 imported entries; @jat: 146 pairs.
- Dad's backup has no jk_prRepair: his phone has not run v1.10.56 yet, so it will run both repairs on one launch.
- The current matcher reads the user's own renames (jk_exRename). @jat renamed Side_Lateral_Raise to "Lateral Raise
  Front and Side (dumbbell)", which makes "Lateral Raise (Dumbbell)" match Lying Rear Lateral Raise. Dad has no
  renames.

## Built (v1.10.59)
- [x] commitHistRepair(hist2, exIds, at): stores the edited history; per touched workout prCount = stored - old
      replay PRs + new replay PRs for those exIds (prSets rebuilt if present; other exercises' PRs untouched); jk_prs
      for each exId rebuilt via setRepairedPR (stamped `repaired`) and added to jk_prRepair (merge drops stale copies).
- [x] repairDipAdded(): DIP_FIXES matches account @jat + workout id + exId + set index + stored 104.33 kg (+/-0.01);
      weight -> 0, totalVolume -= weight x reps of done sets; flag jacked_repairDip1. Runs at boot before sync.
      Other accounts: returns without a flag.
- [x] relabelHevyImports() + hevyRelabelPlan() (dry run): imported entries only; target = resolveExercise(name) ||
      imp_ id (same as the importer, shared impId()); moves exId/muscle/equip/imgUrl; never name/sets/totalVolume.
      Skips (logged): entry under the user's own exercise; target with another tracking type; loaded sets onto a
      body-weight target (Hevy "Chest Dip (Assisted)" weight is the assist, it would read as load). Allow-list
      HEVY_RELABEL_ACCOUNTS = {@dad}. Needs the exercise library, so it runs after loadDB in the boot IIFE; no DB ->
      no flag, next launch. Flag jacked_relabelHevy1. applyBundle clears both flags (login/import restore re-checks).
- [x] Dry run on the full backups in the real app (scratch, not committed):
      Dad: 168 entries moved, 14 skipped (Chest Dip (Assisted) -> body-weight Dips). Weights/volume unchanged by the
      relabel; his Top PR stays Leg Press 275 x 12. Records: barbell bench 185x3 -> 135x12 (Smith 185x3 becomes the
      machine bench record), dumbbell curl 100x12 -> 80x12, machine curl 90x12 -> 100x12, cable lateral raise
      110x12 -> 100x12 (machine lateral raise 110x12), hip adduction 50x12 moves to the cable one, cable triceps
      ext / barbell hack squat / imp back extension / imp rear kick records go (their sets now sit under the right
      exercise). No badge changes.
      @jat dip: 4 sets -> 0 added; that workout 27,048 -> 19,458 lb; dip record 459x12 -> body weight x 12 (232);
      prCount unchanged; Top PR unchanged.
      @jat relabel (NOT applied): 446 entries would move, 18 skipped (cardio/reps-only targets). Top PR would read
      Leg Press 500 x 12. Bad matches in it: Lateral Raise (Dumbbell) 44 -> Lying Rear Lateral Raise (his rename),
      Skullcrusher (Barbell) -> Skull Crusher (bands), Squat (Machine)/(Smith) 8 -> Chair Squat, Shoulder Press
      (Machine Plates) 2 -> barbell, Overhead Press (Dumbbell) 4 -> barbell, Bicep Curl (Barbell) 11 -> dumbbell,
      Dumbbell Row 7 -> Incline Row, Triceps Extension (Dumbbell) 3 -> Decline, Crunch 3 -> cable crunch.
- [x] e2e dipRepair (15 checks) + hevyRelabel (33 checks), fixtures = compact real rows from both backups.
      Full suite 871/871 on JK_PORT 8799.
- [x] WATCH_BRIDGE row (APP-WIDE): no new keys; keep honouring jk_prRepair; keep phone jk_hist entries verbatim.

## Not done / open
- @jat relabel: off until he decides. Before enabling, the matcher misses above should be fixed (ignore user renames
  when matching, and the equipment misses), then re-run the dry run.
- Dad's 14 "Chest Dip (Assisted)" Hevy entries stay where they are; his Dips record 165 lb x 12 is a Hevy assist
  weight read as load (5 older entries were already matched to Dips). Separate fix if wanted.
- A device still on an old build can upload the old labels/sets again; the phone with this build keeps its own
  (local wins) and PR records can't come back (jk_prRepair). Same limit as v1.10.56.

## Send-backs
(none yet)
