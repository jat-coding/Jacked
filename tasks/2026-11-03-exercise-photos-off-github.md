# Move exercise photos off GitHub, resized, before iOS launch

**His words** (verbatim):
> "Move the exercise photos off GitHub onto your own hosting, resized, before the iOS
> launch?" → "Yes, do it"

**Goal:** `IMG_BASE` (`index.html:1373`) and `DB_URL` (`index.html:1374`) currently point
at `raw.githubusercontent.com/yuhonas/free-exercise-db` directly — every user's phone hits
a third party's GitHub repo, uncached, unresizable, and outside his control, for all 876
exercises / 1746 images (confirmed live count via the real `dist/exercises.json`, avg
~38KB/image full-res ≈ 66MB raw). Mirror the image set onto hosting he owns, resized down
from full-res, and point the app at that instead.

**Done when:**
- All 1746 images from `free-exercise-db` mirrored once, resized (target: longest edge
  ≤600px — the library/picker/detail views never render these larger; confirm against
  actual rendered size in CSS before locking the number) and re-encoded (webp with jpg
  fallback or plain resized jpg, whichever the app's existing image-handling pattern
  already uses elsewhere — check `getExPhoto`/avatar upload path for the convention).
- `exercises.json` (`DB_URL`) also mirrored locally so the app no longer depends on
  GitHub at runtime at all, not just the images.
- `IMG_BASE` and `DB_URL` repointed to the new location; old GitHub URLs no longer
  referenced anywhere in `index.html`.
- `node tests/e2e/run.mjs` full suite passes, 0 failures.
- Exercise Library tab, Add-Exercise picker, and exercise detail view all render photos
  correctly from the new location (VERIFY.md's "screens that matter" list) — screenshot
  each, spot-check against a sample of exercises including ones with 2 images.
- A user with the OLD cached version (pre-change) and a user with the new version both
  still see exercise photos — no broken-image state during the rollout window (the old
  GitHub URLs should keep working, or there should be a graceful fallback, during
  whatever cache lifetime the PWA uses).
- Total asset size added to wherever this is hosted is confirmed and reported back (not
  assumed) — this is a real new weight if bundled into the app's own deploy.

**Reference:** none (resized photos should look the same, not visually redesigned).

**Not doing:** not re-tagging or re-categorizing any exercise (the 2026-10-25 audit's
muscle/equipment detection work is separate); not adding new exercises or images beyond
what free-exercise-db already has.

**Tries:** 5

**Decided 2026-11-03** (he picked "least impact on storage space"): new Supabase storage
bucket, same pattern as `avatars`. Reasoning: bundling into the Netlify static deploy
would add the full resized image set to the git repo permanently — and this repo gets
`git worktree`'d fresh for every concurrent build job on this project, so that weight
would be duplicated on disk every time. A Supabase bucket stores the set once, outside
git, no repo growth, no per-worktree duplication. Make the bucket PUBLIC READ, write
restricted to service role only (images never change per-user, no need for authenticated
upload policy like avatars has) — this is static reference data, not user content.
