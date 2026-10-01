---
project: Jacked
date: 2026-10-01
status: done
---

# Dad's 325 lb back extension + page scrolls behind popups

## Ask
Mr. Roni 2026-10-01 12:23pm (topic 620): Dad's Lifetime Stats Top PR reads "Hyperextensions (Back Extensions)
325lb x 12"; Dad never did that, the machine doesn't go that high ("a mixup on the import"). And: "when on the recap
page you are able to scroll the background page. That shouldn't be allowed on any popup screen".

## Finding (read-only, Supabase profile_backups @dad; nothing changed)
- Not the Hevy import. Dad's Hevy rows say "Back Extension (Machine)" (57 sets, max 70 lb); the importer never matched
  them to Hyperextensions (stored as unmatched id imp_back_extension_machine_), so they never touched this PR.
- His Hyperextensions sets are all logged in the app: 60-75 lb (82 sets, 10 workouts). Every set is right.
- f6c74a1 (9/8) tagged Hyperextensions_Back_Extensions "body only" in EQUIP_FIX. From 9/22 his workouts show the
  Body/+Added/-Assist switch; in Body mode there is no weight box, so he picked "+ Added" to enter the machine's 70/75.
  effWeight() then counted body weight (~250 lb at the time) + 75 = 325 lb. commitPRs stored 147.42 kg x 12 at the
  9/26 finish (21:55:54Z = 18:51:46 + 184 min). totalVolume of 9/22, 9/26, 9/29 is each 4,082 kg (9,000 lb = 250 x 36
  reps) higher than the sets add up to.
- Mr. Roni: no back-extension damage (his Hevy "Back Extension (Weighted Hyperextension)" 25 lb, unmatched, fine).

## Fix (v1.10.55)
- [x] Hyperextensions out of EQUIP_FIX; NOT_BW_IDS makes isBodyweightEx() false for it by id, so workouts already
      saved as "body only / + Added" read 75 lb too (prReplay, volume, badges). No body-weight switch on it any more.
- [x] Scroll lock: syncScrollLock() follows the DOM (MutationObserver on class): any .mo.open, #achFull/#badgeFull/
      #recapFull.open pins body (position:fixed at -scrollY, iOS-safe), last close restores the spot (top if a popup
      switched tabs). Rotated landscape frame locks #jkRoot instead. overscroll-behavior contain on popups.
      Replaces e21b130's lockScroll() (removed here): body overflow:hidden alone doesn't stop iOS Safari, and its
      counter went out of step on a backdrop tap of a non-.mo page or a double open. e21b130 was another session's
      unpushed local-main commit; my first jacked-push.sh call pushed it to staging (with a merge of origin/main,
      7afc951) because the script always pushes ~/agent/projects/Jacked's checked-out branch, not the worktree.
- [x] e2e backExtLoad (11 checks: Dad-shaped saved workouts, live finish, Top PR card, Hevy CSV with exact names
      "Back Extension (Machine)", "Back Extension (Weighted Hyperextension)", "Back Extension (Hyperextension)").
- [x] e2e popupScrollLock (35 checks: recap, badge, achievements, profile, friend profile, workout detail, photo,
      confirm, exercise info, card order; wheel + touch swipe; restore; nested; backdrop; Achievements still scrolls).
      36 of the 46 new checks fail on the pre-fix code.
- [x] Full suite 757/757 on JK_PORT 8799.

## Not done (needs Mr. Roni)
- Dad's stored data: repair plan in tasks/2026-10-01-dad-backext-repair-plan.md, NOT applied.
- Top PR ranking (weight x reps over jk_prs) still lets body-weight PRs win: Mr. Roni's own Top PR is Push-ups
  "229 lb x 62" (his body weight). Option only, not built: rank by e1RM over loaded lifts, skip isPlainBW() PRs.

## Send-backs
(none yet)
