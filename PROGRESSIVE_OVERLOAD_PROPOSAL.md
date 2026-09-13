# Progressive-overload nudges — proposal (2026-09-13)

**Status: rules decided by Dad (2026-09-13); Wear implements first as the reference,
PWA/watchOS when Jack agrees.** Originated from Dad's own training on the Galaxy watch;
applies to PWA, Wear and watchOS equally.

Decisions taken: streak of **3** sessions · badge says **"go up", no specific weight**
(increments differ per exercise/equipment) · "down" hint only when **no set reached the
minimum** · **bodyweight-only exercises excluded**.

## The idea

People get complacent: they find a weight that lets them hit the top of their rep range
every set, and stay there for months. Conversely, some pick a weight they can't move for
the minimum reps on the first set. The app already knows both — it has every set of every
session — but says nothing. Add two **quiet** signals:

1. **"Ready to go up."** When the user has completed all target sets at (or above) the
   max reps, at the same weight, for **3 consecutive sessions** of an exercise, show a
   small badge on that exercise's card the *next* time it appears. It says "go up", not
   how much — available increments differ per exercise and equipment.
2. **"Consider going down."** When **no set** of an exercise reached the minimum reps,
   mention it once on the finish summary ("Nice work" screen), alongside the PR lines.
   Never mid-workout, never on the card.

Plus one enabler:

3. **Personal targets** — sets × rep-range (Dad: 3 × 8–12) — as a setting, which also
   lets a *new* exercise (no history) pre-load `targetSets` sets at `repMax` instead of
   one empty set.

## Why this is nearly free at the "cloud level"

- `jk_hist` already holds every set (`weight`, `reps`, `done`) per exercise per session.
  Both signals are a **pure function of history + settings** — nothing new is stored,
  nothing is written by the rule, so there is no sync/merge/clobber surface.
- Targets live in the existing `jk_settings` object (three new optional keys). It is
  already inside `profiles.backup`, so every client sees the same targets. Missing keys →
  defaults, exactly like `restDefault`/`autoRest` today.
- Server: **no change.** Not a column, not a trigger, not an RLS policy.

The work is one deterministic function, ported three times (JS / Kotlin / Swift) against
a shared test-vector table (§6) — the same parity discipline the watch ports already use.

## 1. Settings (`jk_settings`, blob-shared)

| Key | Type | Default | Meaning |
|---|---|---|---|
| `targetSets` | int | `3` | Working sets the user aims for per exercise |
| `repMin` | int | `8` | Bottom of the rep range |
| `repMax` | int | `12` | Top of the rep range |
| `progressStreak` | int | `3` | Qualifying sessions before the "go up" badge (probably not user-facing at first) |

Edited in the PWA's Profile/Settings (Jack). The watches **read** them; if a watch wants
its own override it follows the existing watch-local pattern (Wear `WatchSettingsStore`,
watchOS equivalent) — watches never write `jk_settings` (playbook: local-wins key).

Per-exercise overrides (e.g. 5×5 for squats) are a natural v2: `jk_exTargets[exId]`.
Not in v1.

## 2. Rule: "ready to go up" (badge on the card)

Applies to **`weight_reps`**, and to `bodyweight_reps` **only when the sets carry added
load** (`bwMode:"added"`, `weight > 0`). Pure bodyweight work (pull-ups, dips at body
weight) is excluded — the remedy there ("add weight") is a different conversation. Never
duration / reps_only / distance.

For an exercise X, walk sessions **newest → oldest**. A session *qualifies* when:

- it has **≥ `targetSets` done sets** of X, and
- **every done set has `reps ≥ repMax`**, and
- its **top weight equals the top weight of the newest session** (`|Δ| < 0.01 kg`).

Count consecutive qualifying sessions from the newest; stop at the first that doesn't.
If `count ≥ progressStreak` → **badge on**.

Why "same weight as the newest session": the moment the user does go up, the newest
session has a new weight, the count restarts at 1, and the badge clears itself. No
dismiss state, no "snooze" record, nothing to sync.

**No suggested weight.** Increments differ per exercise (barbell plates vs. dumbbell
steps vs. machine stacks vs. cable pins, and the user's own gym), so a number would be
confidently wrong often enough to erode trust. The badge says the weight is ready to go
up; the user knows their equipment.

**Where it's evaluated:** from saved history when the card is built — the in-progress
session does not count. So the badge appears at the **start of the 4th session**: "you've
done 12×3 at 80 lb three times — go up today." That's the moment the decision is made.

**What it looks like (recommendation — see §5 for alternatives):** on the card's PR line,
in the accent color, `▲ 12×3 ×3 — ready to go up` (or shorter on the watch: `▲ Go up`).
Same slot and visual language as `★ PR`, so it's read as "a status", not "a nag". No
haptic, no popup, no toast.

## 3. Rule: "consider going down" (summary line only)

At finish, for each eligible exercise (same tracking rule as §2) in the workout:

- look at **all done sets**;
- if **every** done set has `reps < repMin` → add a summary line
  `▼ Squat — never reached 8, consider lighter`.

"Never reached the minimum in any set" is deliberately strict: missing the last set is
normal fatigue, missing the first can be a cold start; missing *all* of them is a weight
error. Suppressed when the same exercise also produced a PR in this workout
(contradictory messages). Shown once, on the summary, in the muted color — below the PR
lines, above Done. Never on the card mid-workout, where it could discourage.

## 4. New-exercise pre-load

Today an exercise with no history starts as **one empty set**. With targets:
`targetSets` sets, each `reps = repMax`, `weight` empty (user types it). Done-marking a set
with a null weight still records 0 volume (unchanged behaviour); the reps pre-fill just
removes three taps. Applies in all three clients (`buildEntry` on Wear, its port on
watchOS, the PWA's add-exercise path).

## 5. Badge symbol — options

| Option | Pros | Cons |
|---|---|---|
| **`▲ Go up` / `▲ Ready to go up`, accent color, on the PR line** (recommended) | Reuses the `★ PR` slot the user already reads as exercise status; tiny footprint on a 1.5" screen; reads as information, not a nag | Shares the line with the PR text — on the watch show `▲` before the PR text when both apply |
| `↑` before the exercise name | Even smaller, visible on Home's recent rows too | Easy to miss; no words at all |
| `⬆︎ Level up` chip under the name | Feels like a reward, fits the badge culture in Metrics | Takes a full row; the card is already dense after the 2×2 cluster |
| Color the exercise name (e.g. orange) | Zero pixels | Meaningless without a legend; conflicts with PR orange |

Colour: use **accent (teal)** for "ready", keep **orange** for PR, **red** for destructive
actions. The "down" hint uses **muted** grey on the summary only.

## 6. Shared test vectors (all three ports must agree)

Targets: `targetSets=3, repMin=8, repMax=12, streak=3`. Sessions listed oldest → newest as
`weight × reps` per done set. Weights in kg.

| # | Sessions of exercise X (oldest → newest) | up? | down line at finish of newest? |
|---|---|---|---|
| 1 | `80×12,12,12` · `80×12,12,12` · `80×12,12,12` | **yes** | no |
| 2 | `80×12,12,12` · `80×12,12,12` | no (streak 2) | no |
| 3 | `80×12,12,12` · `80×12,12,11` · `80×12,12,12` | no (middle fails) | no |
| 4 | `80×12,12,12` · `80×12,12,12` · `80×12,12,12` · `85×12,12,10` | no (newest at 85, streak 1) | no |
| 5 | `80×12,12,12` · `80×12,12,12` · `80×12,12` (2 sets) | no (< targetSets) | no |
| 6 | `80×13,12,14` ×3 | **yes** (≥ max counts) | no |
| 7 | newest session `80×6,7,5` | — | **yes** (no set reached 8) |
| 8 | newest session `80×6,8,8` | — | no (a set reached 8) |
| 9 | newest session `80×10,8,6` | — | no |
| 10 | newest session `80×6,7,5` **and** a PR on X | — | no (PR suppresses) |
| 11 | X is `distance` / `duration` / `reps_only`, or bodyweight-only (`bodyweight_reps`, weight 0) | no | no |
| 12 | X is `bodyweight_reps` with `+10 kg` added, `×12,12,12` ×3 at +10 | **yes** | no |
| 13 | 4 done sets `80×12,12,12,12` ×3 (more than targetSets) | **yes** | no |

Implement as one function with this signature in each language and check the table in
the unit tests:

```
evaluateProgress(exId, hist, settings) → { readyUp: bool, streak: int }
neverReachedMin(workout, settings)     → [ { exId, name, repMin } ]
```

## 7. "Helpful, not annoying" — the rules we hold ourselves to

- Passive only: a glyph on a card and a line on the summary. No modal, no haptic, no
  notification, no toast.
- Appears only when it is actionable (right tracking type, enough history), and clears
  itself by the user's own action (going up) — no dismiss state to manage or sync.
- Never contradict: no "down" line for an exercise that just set a PR; never "up" and
  "down" on the same exercise in the same session.
- Never auto-change a weight, never name one. The user knows their equipment.
- Down-hint only when no set reached the minimum; a missed first or last set alone is
  not a signal.

## 8. Rollout order — Wear first, by design

**Wear (Dad) goes first** and becomes the reference implementation. This is safe
precisely because the feature writes nothing: the badge and the summary line are derived
on-device from history the watch already mirrors, and the targets are watch-local
defaults. The PWA and Apple Watch see no change at all until they implement it.

1. **Wear:** `ProgressionAdvisor` (pure Kotlin, unit-tested against §6), badge on
   `ExerciseCard`'s PR line, summary line in `SummaryScreen`, pre-load in
   `SessionManager.buildEntry`, targets in watch Settings via `WatchSettingsStore` — and
   the watch **reads `jk_settings.targetSets/repMin/repMax` when present**, so the PWA's
   future values win the moment they exist (same `combine(db, overrides)` as the pause
   timer). Adaptation cost when the PWA ships: zero code on the watch.
2. **PWA (Jack), when agreed:** settings UI writing the three keys + the same function
   (JS) + badge on the exercise card + summary line + pre-load. Vectors in §6 keep it
   identical.
3. **watchOS:** parity port via AGENT_COMMS.

## Decided (Dad, 2026-09-13)

- Streak: **3** sessions.
- **No suggested weight** — increments vary per exercise and gym; say "go up" only.
- "Down" hint only when **no set reached the minimum**.
- **Bodyweight-only exercises excluded** (bodyweight with added load is in).

Open for Jack: key names in `jk_settings` (`targetSets` / `repMin` / `repMax` proposed —
the watch will read exactly these), and whether the PWA wants per-exercise targets
(`jk_exTargets`) in the same release or later.
