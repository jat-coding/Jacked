# Garmin port plan — Jacked on Connect IQ

Port of the field-proven Wear OS client to Garmin, following the same template
that briefed the watchOS port. The Wear app (github.com/pberry3452/jacked-wear)
retired nearly all product risk — treat its Kotlin as executable spec. This
plan is translation plus platform swaps, with one big architectural caveat
(§ Platform reality) that the other ports didn't have.

Read first: [SPEC.md](./SPEC.md) (product scope — written for Wear, the
feature set and flows carry over), [API.md](./API.md) (backend contract),
[SYNC_PLAYBOOK.md](./SYNC_PLAYBOOK.md) (non-negotiable data-safety rules),
[DESIGN.md](./DESIGN.md) (visual system).

> Platform specifics below are from general Connect IQ knowledge — verify
> current limits against the SDK docs for the actual target device before
> committing to an architecture. Fill in: **target device = ____________**.

## Platform reality (the big differences)

1. **Language/toolchain:** Monkey C + Connect IQ SDK (VS Code extension,
   bundled simulator). No Kotlin/Swift niceties — no coroutines, minimal
   generics; plan simple state machines.
2. **Networking is usually phone-proxied.** `Communications.makeWebRequest`
   routes through the Garmin Connect Mobile app over Bluetooth on most watches
   (LTE/Wi-Fi direct only on a few models). Unlike the Wear/watchOS clients,
   this is effectively NOT a standalone-in-the-gym client unless the phone is
   along — which makes the offline-first outbox (SYNC_PLAYBOOK §4) even more
   central: assume every workout is logged offline and synced later.
3. **Memory is tiny.** Device apps get on the order of a few hundred KB
   (device-dependent). The Wear client's "mirror the whole backup blob"
   approach will not fit for a large history. Design for a **trimmed working
   set** from day one:
   - PostgREST can project inside the JSONB: e.g.
     `select=backup->jk_prs,backup->jk_settings,updated_at` or
     `backup->jk_hist` alone — pull only what a screen needs.
   - Caution: server-side projection conflicts with "merge the whole blob
     before writing" (SYNC_PLAYBOOK §1). Resolution: the Garmin client should
     **never write the whole backup blob at all** — see §4 below.
4. **Response/storage size limits.** `makeWebRequest` responses and
   `Application.Storage` values both have hard size caps that a 200-workout
   `jk_hist` will blow through. Chunk or trim everything.
5. **Recording:** use `ActivityRecording` (sport = strength training) so
   sessions land natively in Garmin Connect with HR/calories — the Garmin
   equivalent of what HealthKit gives the Apple port for free. Jacked remains
   the system of record for sets/weights; Garmin Connect gets the
   physiological session.
6. **UI/input:** WatchUi (Menu2, custom Dc drawing, Picker); 5-button
   navigation on most devices, touch on some; MIP displays have ~64 colors
   (see DESIGN.md Garmin notes). No bezel/crown on most models — the velocity-
   tiered increment design maps to press-and-hold repeat on up/down buttons.
7. **Distribution:** sideload during dev (simulator + USB copy), Connect IQ
   Store later — which has a review process and would make the no-auth backend
   (SYNC_PLAYBOOK §7) an immediate problem. Family sideload is the v1 target.

## Recommended architecture: outbox-only writer ("thin client")

The Wear and watchOS clients are full blob mirrors. On Garmin, memory and
response caps argue for a fundamentally thinner shape:

- **Reads (working set only):** current PRs, settings, routine list, last-N
  workout summaries — via JSONB projections. Enough to prefill sets ("prev"
  hints) and start from a routine.
- **Writes: never write `profiles.backup` from the watch.** Instead, push each
  finished workout into a small outbox and let a **merge-capable peer** apply
  it: simplest v1 = a tiny "inbox" key the PWA merges on next open (additive
  and tombstone-safe by construction), or a Supabase edge function that does
  read-merge-write server-side. This sidesteps the entire class of
  blob-clobber bugs on the most constrained platform — the device least able
  to hold the whole blob should not be responsible for rewriting it.
- Decide this before Phase 1; it is the one place the Garmin port should
  *diverge* from the sibling clients rather than copy them.

## What ports 1:1 (use jacked-wear as executable spec)

- Formulas: Epley 1RM, effective weight (incl. bodyweight modes), stats
  (streak skips a workout-less today; consistency = workouts in 30d) — copy
  the unit-test numbers.
- Canonical data facts and `normU` (SYNC_PLAYBOOK §6).
- UX decisions that came from field data-loss and gym testing: prefill new
  sets with last session's count+values, adopt-prefill-on-done, rest timer as
  an overlay with vibration, "PREV 100×12" hints, finish-confirm on 0 done
  sets, summary card.
- The trimmed exercise library (`jacked-wear` bundles a 640-entry
  PWA-filtered `exercises.json` + 13 warm-ups) — re-trim harder for Garmin
  memory; name + muscle + tracking-type is enough, drop equipment/images.

## Phases (compressed; simulator-first)

0. SDK + hello-world device app in the simulator; black/teal look per
   DESIGN.md; button navigation skeleton. Pick target device(s).
1. Data core: workout record model with **extras passthrough** (even the thin
   client must round-trip unknown keys in anything it stores/forwards),
   formulas + parity tests against jacked-wear's numbers.
2. Sync (the risky phase — do it early): working-set reads via projections,
   outbox writes per the architecture decision above; live test against
   `@watchdev` only; prove the repeat-backup scenario can't clobber.
3. Screens: routine start → active workout → set entry (button-repeat
   increments) → finish; ActivityRecording session wrapping the workout.
4. History-lite + PR views from the working set; PWA round-trip verification
   (log on Garmin → see it in the PWA → log in PWA → prev-hints on Garmin).
5. Hardening: offline drills (phone away!), kill-resume mid-workout, memory
   profiling on-device; sideload build for the developer's own watch.

## Definition of done (v1)

A full weights session logged from the Garmin watch with the phone in a locker
(offline), appearing correctly in the PWA and on the Android watch after sync,
with PRs consistent everywhere and the session visible in Garmin Connect with
HR/calories — and zero possibility of the watch erasing anyone's history.
