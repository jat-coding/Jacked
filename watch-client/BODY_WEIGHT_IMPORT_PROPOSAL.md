# Body weight from Samsung Health into Jacked — proposal

**From:** Wear session (jacked-wear), for Phil and Mr. Roni · **Date:** 2026-09-23 · **Status:** proposal, nothing built

## Why

`jk_bw` (current body weight, kg) feeds the volume and PR maths for every bodyweight and
assisted lift, on the phone and on both watches (`effWeight`). Phil records his weight in
Samsung Health, never in Jacked, so his `jk_bw` is stale and every dip, pull-up and assisted
set is scored against an old number. The only writer today is the phone's `logWeight()`.

## What

The **phone companion ("Jacked Sync")** already signs in to Jacked and already reads Health
Connect's neighbour data to export workouts. It would additionally **read the user's weight
from Health Connect** (Samsung Health writes it there) and **add it to `jk_bwlog` / `jk_bw`**
in the cloud backup, on its existing 6-hourly run and on "Sync now". The user keeps weighing
in the way they already do; Jacked stays current with no typing.

## Data — exactly what the companion would write

Same shapes `logWeight()` writes (`index.html` ~line 1258), nothing new:

- `jk_bwlog`: `[{ "d": "YYYY-MM-DD", "kg": <number> }]`, sorted by `d`.
- `jk_bw`: `<number>` kg = the `kg` of the **latest-dated** `jk_bwlog` entry.

Rules on the companion side:

1. **Current weight only** (Phil, 2026-09-23: Jacked uses body weight only for bodyweight-based exercises, so only the current value matters). Each run reads the **most recent** Health Connect `WeightRecord`; the most recent reading counts for its day. **No history backfill.**
2. **One log entry, for that reading's day:** if `jk_bwlog` has no entry for that date the companion adds it; if it has one, the companion replaces it (most recent counts). It only writes when the reading is newer than the last one it imported (timestamp kept on the phone), so an old reading never overwrites a newer manual entry.
3. `jk_bw` = the `kg` of the latest-dated `jk_bwlog` entry after the write.
4. **Write safely:** the same read–merge–write with the `updated_at` compare-and-swap the
   watches use; on a CAS miss, re-read and retry. No other key is touched.
5. **Switch, ON by default** (Phil, 2026-09-23) in the companion ("Import body weight from
   Samsung Health"). Health Connect still requires the user to grant the new `READ_WEIGHT`
   permission once: the companion asks on first launch after the update. If it is declined,
   the switch shows off and nothing is imported; turning it on asks again.

## What the phone app needs first — this is the blocking part

`mergeBackup()` treats `jk_bw` / `jk_bwlog` as **whole-key local-wins** (the `{...cloud,
...local}` baseline). If the companion adds weights to the cloud, the phone's next backup
would put its own older `jk_bwlog` back and **silently erase them** — the same failure that
erased watch notes until v1.8.11 (`SYNC_PLAYBOOK.md` §2). So, before the companion ships:

- **`jk_bwlog`: union by `d`.** On a date both sides have, **local (phone) wins** — a weight
  typed on the phone that day after the import stays. (Rare: Phil weighs in on Samsung Health.)
- **`jk_bw`: derived, not merged** — after the `jk_bwlog` union, `jk_bw` = `kg` of the
  latest-dated entry. (If `jk_bwlog` is empty on both sides, keep today's local-wins value.)
- Add both to `SYNC_PLAYBOOK.md` §2's list of per-element merge rules.

Order: the phone rule ships and is **live** (checked with the `const BUILD` curl) before
the companion build that writes. The companion's release notes name the phone build it
requires.

## Not changing

- The watches keep **reading** `jk_bw` only. They never write body weight.
- No change to the stats columns, the CAS shape, or any other key.
- The Apple Watch / `@mom` path is unaffected (no companion there).

## Test plan

On the scratch account `@watchdev` only: seed a `jk_bwlog` with a manual entry for today,
give Health Connect a newer reading for today → expect today's entry replaced by it and `jk_bw` = it; give it a reading for a later day → expect a new entry and `jk_bw` = it. Then have the phone back up → the imported entry survives (proves the merge rule). Repeat with
the phone offline during the import.

## Decisions wanted

- **Mr. Roni:** the `jk_bwlog` union + derived `jk_bw` rule in `mergeBackup()` — yes/no, and
  the phone build it will ship in. Default if no reply: nothing is built; this stays a proposal.
- **Phil (decided 2026-09-23):** current weight only, no backfill; the most recent reading counts for the day. The import switch defaults to ON.
