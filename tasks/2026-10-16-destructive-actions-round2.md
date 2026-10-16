# Destructive actions, round 2 (friends/workout/exercise/profile photo)

Follows projects/Jacked/tasks/2026-10-16-hide-destructive-actions.md (Routines
3-dot menu, already shipped) and its Part 2 audit in
research/jacked-hide-destructive-result-2026-10-16.md. Mr. Roni's decisions
per audit item, from a voice memo 2026-10-16:

## Done when
1. **Friends list row (#1):** remove the inline ✕ "remove friend" button from
   each row in `lbRow()` (jacked-pwa/index.html ~7359-7370). No 3-dot menu
   here — the row still opens that friend's profile on tap (unchanged
   `onclick="openFriend('${p.code}')"`). Removing a friend is now reachable
   ONLY from their profile popup — one path, not two.
2. **Friend profile "Remove Friend" (#2):** stays the sole removal path
   (`openFriend()`'s bottom button, ~index.html:7443-7444, calling `rmFr()`).
   It currently has NO confirm before deleting the friend link server-side —
   add one (`showConfirm('Remove this friend?')` or similar, matching the
   app's existing confirm pattern), since it's now the only way to do this
   and should not be a bare one-tap delete. (Judgment call, not explicitly
   asked for — flag it as a judgment call in the report, don't hide it.)
3. **Workout detail popup "Delete Workout" (#3):** put behind a 3-dot menu
   reveal, same pattern as the Routines 3-dot menu (small sheet, Edit
   Workout / Save as Routine / Delete Workout rows, or however the popup's
   existing non-destructive actions are laid out — ask the existing code,
   don't guess the other button labels, read the popup first). The existing
   "Delete this workout?" confirm after picking Delete stays.
4. **Exercise info popup "Delete Exercise"/"Hide from Library" (#4):** same
   treatment — 3-dot reveal, existing confirm after stays.
5. **Active workout trash icon (#5):** no change — leave as is, one tap,
   already confirmed when sets are logged.
6. **Active workout "- Set" (#6):** no change — leave as is.
7. **Routine editor per-exercise "Delete" (#7):** no change — leave as is
   (draft-only until Save Routine).
8. **Edit Workout trash / "- Set" (#8):** no change — leave as is
   (draft-only until save).
9. **Profile avatar "Remove" (#9):** replace the bare "Remove" button with
   an "Edit Photo" button. Tapping it opens a small reveal (same popup
   pattern as the others) with two rows: "Edit" (pick a new photo, existing
   upload flow) and "Delete" (removes the photo + cloud copy, existing
   behavior). Neither needs an additional confirm beyond this reveal step
   unless the app's existing photo-remove already has one (check first).
10. **Create/Edit Exercise photo "Remove" (#10):** no change — leave as is
    (draft-only until the exercise is saved).
11. `node tests/e2e/run.mjs` full suite passes, 0 new console errors —
    report the real pass count, and specifically confirm existing
    friend-removal and workout/exercise-delete e2e coverage (if any) still
    passes after these changes, or was updated to match.
12. `git status` clean commit on local `main` only — no push to
    `origin/main` or Netlify without a separate explicit go.

## Not doing
- Items 5, 6, 7, 8, 10 — explicitly left as is.
- Any change to Metrics card-order hide, Home "Suggested today" dismiss,
  install-banner X, Cancel workout, Sign out, Reset PR — audit already
  found these aren't real deletes / already protected, no change needed.

## Tries
5

## Open questions
None — scope confirmed 2026-10-16 (voice memo), except #2's added confirm
is my own judgment call, called out in the report rather than asked (low
risk, consistent with the whole effort).

## Results (2026-10-16, try 1)
Built on one shared sheet, `#actMenu` (same `.mo` markup/CSS as the Routines `rMenuModal`, z-index 300 so it sits
above the popup it opens from and below the confirm). `openActMenu(title, rows)` / `actMenuPick(i)`: picking a row closes
the sheet, then runs the same function the old button ran. Backdrop tap, Escape and Android back close it through the
existing `.mo`/`closeTopPopup` path. Each 3-dot uses the Routines `.rc-more` button (44x44) and its `dots` icon.

1. PASS. `lbRow()` has no X any more (the `canRemove` option is gone from both callers). The row still opens `openFriend(code)`.
2. PASS (judgment call, not asked for). Remove Friend → `confirmRmFr()` → `showConfirm('Remove this friend?')` → the
   unchanged `rmFr()`. Cancel keeps the friend and the profile stays open. Pending-request "Decline" still calls `rmFr`
   directly; that's out of scope and unchanged.
3. PASS. The footer Delete Workout button is gone. A header 3-dot lists Edit Workout / Save as Routine / Delete Workout,
   the existing actions read from the popup. Edit Workout and Save as Routine also stay as footer buttons (judgment call:
   the card didn't say to hide them). The "Delete this workout?" confirm and the deletion logic are unchanged.
4. PASS. The Delete Exercise / Hide from Library button is gone from the popup body. A header 3-dot lists Edit /
   (Delete Exercise | Hide from Library). The existing deleteEx confirms are unchanged. Favorite, Edit and Reset PR are untouched.
5-8, 10. Not touched.
9. PASS. With a photo: an "Edit Photo" button replaces Change Photo + Remove, and opens Edit (the existing #avFile
   upload flow) / Delete (the existing `removeAvatar`, local + cloud). No extra confirm: the old Remove had none.
   With no photo: the old "Change Photo" button is shown, unchanged (judgment call: "Edit Photo" with nothing to edit
   made no sense).
11. PASS. Full `node tests/e2e/run.mjs`: 1511/1511, exit 0 (was 1472; +39 in the new `destructiveRound2` suite).
    0 page errors in every suite. The new suite's console check shows 0 errors; it excludes only the
    harness's deliberately-aborted supabase avatar image load. Existing coverage still passes: adv3FriendRemove
    (calls rmFr directly, unchanged), adv4DeleteRun (updated to delete via `#wdMore` → `#actMenu-del` instead of
    the removed `#wdDel`), exercisePhoto (deleteEx), routineMenu. Mutation check: with the friend confirm removed,
    the new suite fails; restored. Full runs used JK_PORT=8793 because another session was running the same suite
    on the default port 8765, and its server shutdown killed the first attempt. Screens: /tmp/jk16/shots/round2-*.png.
12. PASS. Committed on local main only (index.html, run.mjs, this card); not pushed.
