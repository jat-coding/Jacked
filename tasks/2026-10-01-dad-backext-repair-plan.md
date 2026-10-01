---
project: Jacked
date: 2026-10-01
status: proposed -- NOT APPLIED, needs Mr. Roni's go
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
