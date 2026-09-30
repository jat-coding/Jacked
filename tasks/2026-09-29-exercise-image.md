# Exercise image — edit + take photo

## Goal
Let him attach a photo to an exercise and change it later — same idea as the
existing profile-photo upload, applied to exercises instead of the user.

## Open questions (blocking build — see [[ask]] sent to him)
1. ✅ Scope: **custom exercises only** (built-in DB exercises keep their official demo photos).
2. ✅ Capture method: **native picker, choice of camera or gallery** (same as profile photo) — confirmed 2026-09-29.
3. Where the photo shows: everywhere the exercise appears (library list,
   add-exercise picker, exercise info, in-workout), or just the exercise info screen?
4. Storage: synced via Supabase storage like the profile avatar (new bucket,
   e.g. `exercise-images`, keyed by exercise id), or local-only?

## Done when (draft — will finalize once he answers)
- [ ] Editing an exercise (Edit Exercise form) has an image field: shows current
  photo or the existing icon-placeholder, with a way to change/remove it.
- [ ] Tapping the image control lets him pick a photo or take one with the camera.
- [ ] New/changed photo is resized/compressed client-side before upload (reuse
  `resizeAvatar`-style center-crop, don't ship multi-MB phone photos).
- [ ] Photo persists across reload and (if synced) across devices for that exercise.
- [ ] Removing the photo falls back cleanly to the existing icon-placeholder
  convention (`exIcon()`/`_ICON`/`MCOL`) — no broken image, no blank tile.
- [ ] `node tests/e2e/run.mjs` full suite passes, 0 failures, pass count reported.
- [ ] No new console errors.

## Not doing
- Touching built-in DB exercise demo photos from free-exercise-db, unless he
  answers Q1 to include that scope.

## Tries
5

## Status
Blocked on his answers to the open questions above.
