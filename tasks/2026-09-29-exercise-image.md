# Exercise image — edit + take photo

Queue AFTER feat/sep30-queue, tasks/2026-09-30-badge-fixes-2.md, and
tasks/2026-09-30-friend-avatar-lightbox.md — same repo/branch, don't run concurrently.

## Goal
Let him attach a photo to an exercise and change it later — same idea as the
existing profile-photo upload, applied to exercises instead of the user.

## Answered (Mr. Roni, 2026-09-30 11:03am) — all questions closed
1. ✅ Scope: **custom exercises only** (built-in DB exercises keep their official demo photos).
2. ✅ Capture method: **native picker** (tap it, phone's camera/gallery chooser opens — same
   as profile photo), confirmed 2026-09-29.
3. ✅ Where it shows: **everywhere the exercise appears** — library list, add-exercise
   picker, exercise info, in-workout.
4. ✅ Storage: **local to the device only**, not synced across devices. Same exercise on a
   second device keeps the icon-placeholder until photographed there too.

## Done when
- [ ] Editing an exercise (Edit Exercise form) has an image field: shows current
  photo or the existing icon-placeholder, with a way to change/remove it.
- [ ] Tapping the image control lets him pick a photo or take one with the camera
  (native picker, same UX as profile photo).
- [ ] New/changed photo is resized/compressed client-side before storing (reuse
  `resizeAvatar`-style center-crop, don't keep multi-MB phone photos raw).
- [ ] Stored locally (IndexedDB/localStorage, not Supabase) keyed by exercise id — persists
  across reload on the same device; a second device shows the placeholder, not an error.
- [ ] Photo renders in all four places: library list, add-exercise picker, exercise info,
  in-workout.
- [ ] Removing the photo falls back cleanly to the existing icon-placeholder
  convention (`exIcon()`/`_ICON`/`MCOL`) — no broken image, no blank tile.
- [ ] `node tests/e2e/run.mjs` full suite passes, 0 failures, pass count reported.
- [ ] No new console errors.

## Not doing
- Touching built-in DB exercise demo photos from free-exercise-db (scope is custom
  exercises only).
- Cross-device sync — explicitly declined (Q4 above).

## Tries
5

## Status
Unblocked — all open questions answered 2026-09-30 11:03am. Ready to build once the queue
ahead of it (feat/sep30-queue, badge-fixes-2, friend-avatar-lightbox) clears.
