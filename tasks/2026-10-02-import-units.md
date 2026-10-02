---
project: Jacked
date: 2026-10-02
status: built -- v1.10.64 on staging (importer fix); history repair NOT built: nothing qualifies on any account
---

# CSV/Hevy importer: a pound value is never stored as kg

## Ask
Mr. Roni 2026-10-02 3:34-3:38pm (topic 620): Wrist Curl PR "way too high" (55 lb). An earlier reply in the topic
said it was "~25 lb saved as 24.95 kg unconverted". Approved: (a) fix the importer; (b) recompute already-imported
history for the same bug, relabel-style one-shot repair, only where certain; list ambiguous sets.

## Finding (read-only SELECTs on profile_backups, 2026-10-02 ~22:00Z; nothing written)
- The Wrist Curl is NOT the unit bug. 24.95 kg = 55.0 lb exactly (55 / 2.20462 = 24.948). An unconverted
  "25 lb" would be stored as 25, not 24.95; an unconverted 55 would be stored as 55 (shown 121 lb). His imported
  "Seated Palms Up Wrist Curl" rows: 45 lb most sessions, 55 lb on 2025-05-08 (2 sets), 2025-05-20 (3),
  2025-05-31 (1), 50 lb on 5/31; app-logged since July: 35-45 lb. So his Hevy file itself said 55 lb. The earlier
  "unconverted" claim was wrong arithmetic (logged to the mistake queue).
- Detection rule for the bug: an imported set (workout id w<ms>_<n>, weight-tracked) whose stored kg value is
  NOT within 0.03 of a whole or half pound after x 2.20462. A correctly converted Hevy/lb file always lands on whole
  or half pounds; a raw pound number stored as kg (55 -> 121.25 lb) almost never does. Kg-native round numbers
  (20 kg = 44.09 lb) would also fail this test, so a hit is "suspect", not proof.
- Result, every account with a backup: @jat 3,374 imported weighted sets, @dad 1,205, @dwant 1,964,
  @darkskinwarrior 724, @mom 1,054, @watchdev 48 -- every one lands on a whole/half pound. Suspects: 0. Round-kg
  values: only 63.5 kg (= 140 lb exactly) -- @jat 23 sets, @dad 18 -- which are clean 140 lb conversions, not raw
  63.5 lb. Ambiguous: none.
- So the "same relabel-style repair" would change nothing anywhere; not built (a no-op repair is risk without
  benefit). The Hevy export always names the unit (weight_lbs / weight_kg), which is why the bug never fired; the
  code hole was real for other apps' CSVs (bare "Weight" header, "Weight (lbs)" header read as 0).
- Also corrected: memory note project/jacked-csv-import-weight-unit-bug-confirmed-2026-10-01 blamed Dad's 325 lb
  back extension on this bug; the 10/1 card showed it was body weight added by "+ Added" (fixed v1.10.55/56).

## Fix (v1.10.64)
- [x] Weight column: Hevy names, else any header starting "weight" (not "weight unit").
- [x] Unit: header says lb/kg; else per-row unit column (weight_unit/unit: lbs/kg); else ask "pounds or
      kilograms?" (askImportUnit; Kilograms only by the button; backdrop/dismiss = import nothing). No path assumes kg.

## Tests
- [x] e2e importUnits (9 checks) with his rows (2025-05-08 Seated Palms Up Wrist Curl 55x12, 55x15, 45x12):
      weight_lbs -> 24.95/24.95/20.41 kg shown 55/55/45, PR 55 lb; weight_kg as is; bare "weight" asks,
      Pounds -> 55 lb, Kilograms -> 55 kg, dismissed -> nothing; "Weight Unit" lbs column; "Weight (lbs)" header.
      5 of 9 fail on v1.10.63 (bare weight stored 55 kg shown 121.3 lb; "Weight (lbs)" read as 0).
- [x] Full suite 897/897 on JK_PORT 8799.

## Send-backs
(none yet)
