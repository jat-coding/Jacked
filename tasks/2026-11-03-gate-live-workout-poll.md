# Gate the 5s live_workouts poll on Realtime connection state

**His words** (verbatim):
> "Stop the 5 second live-workout poll from running when the instant push channel is
> already connected?" → "Yes, fix it"

**Goal:** `index.html:4123` currently calls `liveSync()` every `LIVE_POLL_MS` (5000ms) any
time `liveOn()` is true, regardless of whether the `jk_live_workouts` Realtime channel
(`liveSubscribe()`, `index.html:3948`) is actually connected. The comment calls it a
"fallback" but `.subscribe()` (`index.html:3953`) never checks its own status, so the
fallback always runs on top of the real push. Make the 5s poll only fire when Realtime is
NOT connected (disconnected/reconnecting/never subscribed) — i.e. make it a real fallback.

**Done when:**
- `liveSubscribe()`'s `.subscribe()` call tracks its status (`SUBSCRIBED` /
  `TIMED_OUT` / `CLOSED` / `CHANNEL_ERROR`) in a flag.
- The poll at `index.html:4123` only calls `liveSync()` when that flag is NOT `SUBSCRIBED`.
- When Realtime drops mid-workout (channel error/timeout/close), the flag flips back to
  "not connected" and the 5s poll resumes automatically — no permanently-stuck-off state.
- `node tests/e2e/run.mjs` full suite passes, 0 failures (note pass count).
- The `live*` suite (VERIFY.md #7) passes explicitly:
  `JK_ONLY=liveWrites,liveConcurrent,liveFinishOnce,liveFinishLock,liveLateSets,liveLifecycle,liveFinishEdges node tests/e2e/run.mjs`
- New adversarial check per VERIFY.md #10 (this touches the live-sync pipeline): force the
  Realtime subscribe to reject/time out and confirm the 5s poll keeps running as a real
  fallback in that case — written BEFORE the fix, confirmed it would have failed against
  the old always-poll code too (sanity check the test actually tests something).
- No change to `liveOn()`'s other gating (account code, Supabase enabled) — only the poll
  trigger condition changes.

**Reference:** none (no UI change — this is a network-efficiency fix, nothing visibly
different in the app).

**Not doing:** not changing the 250ms-debounced `liveSchedule()` triggered by the
Realtime `postgres_changes` callback itself — that stays as-is, it's the push path, not
the poll fallback.

**Tries:** 5

**Open questions:** none — fully specified.
