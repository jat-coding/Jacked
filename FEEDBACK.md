# Jacked — User Feedback Log

In-app feedback (Profile → Feedback) is saved to the Supabase `feedback` table.
A daily 6pm job (scripts/jacked-feedback-review.py in the agent repo) pulls new rows,
triages them against the current app, marks the not-worth-it ones wontfix in Supabase,
and logs every row here (#id = Supabase row id). Worth-building items stay `new`.

**Status key:** 🆕 new · ✅ added · ⛔ won't fix / deferred

| Date received | From | Feedback | Status | Build addressed |
|---|---|---|---|---|
| 2026-06-09 | @dad | #1 There is an issue when modifying the exercises in a routine. I have successfully making a single change like adding or replacing an exercise and then saving, however if I try to add multiple exercises it seems to have a problem. I also tried to create an exercise while modifying the routine but it didn't seem to save the exercise I created. | ⛔ 2026-10-09 | Looks fixed: confirmAESelection merges multi-select into rExs; saveCE auto-selects a new exercise when _ceReturn==='ae', so saveR keeps it |
| 2026-09-22 | @dad | #2 Can you add the ability to reorder your routines? | ⛔ 2026-10-09 | Already built: 'Reorder' button on My routines opens routineOrderModal, with drag to reorder sections and routines in them |
| 2026-10-09 | @dad | #9 When using the app on Android, if I press the "back arrow", the standard Android button for returning to the previous page, it would be helpful to return to the Home tab from any other tab. | 🆕 2026-10-09 | No popstate/history.pushState handling in index.html, so Android back leaves the PWA. Adding a history entry per tab is small |

---
_Last synced from Supabase: 2026-10-09 (auto, daily 6pm: scripts/jacked-feedback-review.py)._
