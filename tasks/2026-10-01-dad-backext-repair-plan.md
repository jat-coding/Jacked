---
project: Jacked
date: 2026-10-01
status: built -- v1.10.56 on staging (8565a62); runs on Dad's phone the first time he opens a build that has it; production needs Mr. Roni's go
---

# Repair plan: Dad (@dad) back-extension numbers

Sets themselves are correct and stay as they are. Only derived numbers that were saved with his body weight added
change. Source of truth: cloud backup profile_backups code='@dad' (updated 2026-10-01 17:24Z). Apply from his phone's
side or in the backup with his device closed, otherwise mergeBackup can push the old higher PR back up (PR merge keeps
the heavier record) -- safest is a one-shot in-app repair that runs on his device after v1.10.55, then syncs.

| Where | Now | Should be |
|---|---|---|
| jk_prs.Hyperextensions_Back_Extensions | 147.418 kg (325 lb) x 12, 2026-09-26T21:55:54.517Z | 34.019 kg (75 lb) x 12, same date |
| Workout w1790104898582 (9/22) totalVolume | 25,805 kg | 21,723 kg (-4,082 kg / -9,000 lb) |
| Workout w1790448706480 (9/26) totalVolume | 25,106 kg | 21,024 kg (-4,082 kg) |
| Workout w1790714236686 (9/29) totalVolume | 26,186 kg | 22,104 kg (-4,082 kg) |
| Workout w1790104898582 (9/22) prCount | 3 | 2 (70 x 12 only tied his 9/14 70 x 12; confirm with prReplay at apply time) |
| Same 3 workouts, Hyperextensions entry | equip 'body only', bwMode 'added' | optional tidy: equip 'other', drop bwMode (v1.10.55 already reads them right) |

Effect he'll see: Top PR becomes Leg Press / Calf Press on the leg press 275 lb x 12; lifetime "lb lifted" drops by
27,000 lb (still shows 2M); back-extension PR 75 lb x 12.

Not part of this repair, flagged only: his pre-9/27 Hevy import kept the old wrong matches (e.g. "Leg Press
(Machine)" filed as Calf Press on the leg press, "Bench Press (Dumbbell)" and "(Smith Machine)" as barbell bench,
"Bicep Curl (Machine)" as dumbbell curl). No weights are wrong; only which exercise they count toward.

## Approved and built (2026-10-01)
Mr. Roni 4:08pm topic 620: "your suggestion and repair, let's do that". Built as a one-shot in-app repair, v1.10.56,
commit 8565a62 on staging. Nothing written to Dad's cloud row from here; his phone does it.
- repairBackExtBW() at launch, before any cloud pull/backup: any account, any workout whose Hyperextensions entry is
  equip 'body only' + bwMode 'added' (weight_reps): totalVolume minus that day's body weight (jk_bwlog) x done reps,
  prCount = stored - old-rule PR + new-rule PR (prSets rebuilt if present), entry -> equip 'other', bwMode dropped;
  jk_prs record rebuilt from prReplay, stamped repaired. Sets untouched. Logs "[repair] ..." to the console.
- Device flag jacked_repairBackExt1 (not backed up); applyBundle (login/import) clears it so restored data is checked.
- jk_prRepair {exId: ISO} rides the backup; mergePRs drops pre-repair, unstamped records for those exIds, so the
  cloud's 325 or a stale device/watch can't resurrect it. enforcePRRepairs() at each launch replaces a stale record.
- Verified on a fixture from his backup (read-only): PR 75 x 12, totals 21,723 / 21,024 / 22,104 kg (-9,000 lb each),
  9/22 prCount 3 -> 2, Top PR Leg Press / Calf Press 275 x 12. Unaffected user byte-identical.
- e2e backExtRepair 28 checks; full suite 785/785.
- Watch: WATCH_BRIDGE + SYNC_PLAYBOOK say to keep jk_prRepair and honour it in the jk_prs merge.
Still not done (separate, unapproved): Top PR ranking, Mr. Roni's 9/25 dip "+ Added 230", Dad's old Hevy label matches.

---
## Follow-up, approved 2026-10-02 7:06am MDT -- BUILT v1.10.59 (staging)
1. Mr. Roni's own 9/25 Dips: "+ Added 230" (his body weight) -> 459 lb x 12 record. Approved: added weight 0.
   Built for all four sets of that entry (all carried 230). See tasks/2026-10-02-dip-and-hevy-relabel.md.
2. Dad's pre-9/27 Hevy import labels: relabel with the current matcher. Built, enabled for @dad only; @jat dry run
   reported, not applied. Same card.
3. Production push of v1.10.56 (and now v1.10.59) is HELD -- Mr. Roni: "I'll check staging first."
