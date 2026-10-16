# Gym years full-history view

## Goal
Add a full-screen "gym years" view — a GitHub-contribution-style grid, one square
per calendar day, lit when the person trained that day, grouped by month columns
under a year heading, one block per year of history. Opens from tapping the
month/year label on Home's mini-calendar (`#calLabel`), and also reachable from a
friend's profile (Athlete tab / `openFriend` popup) showing their days.

## Done when
1. Tapping `#calLabel` on Home (index.html:617) opens a new full-screen overlay
   that follows the existing `achFull`/`badgeFull`/`recapFull` pattern (added to
   `POPUP_SEL` line ~1999, `SCROLL_LOCK_SEL` line ~9060, and the close-case switch
   around line 2010) showing YOUR gym-years grid, built from `gH()`/`dayKey()`.
2. Grid renders one year-block per year that has any history (oldest first, no
   hardcoded 2-year range), Jan–Dec month columns, one square per day, lit with
   `var(--accent)` (or the app's existing "worked" day color used by `.cd.worked`)
   when `dayKey` is in that person's day-set, unlit otherwise. Binary only — no
   volume shading.
3. Friend's profile (`openFriend` popup) gets a tappable entry point to the same
   grid rendered from that friend's `p.days` (already un-capped full history per
   `myActivity()` — confirmed, no 30-day cutoff on `days`, only on `wd`), labeled
   with their name.
4. Overlay closes via the X, the Android/back gesture, and browser back — reuses
   the app's existing popstate/back handling, same as `recapFull`.
5. `node tests/e2e/run.mjs` full suite passes, 0 new console errors — report the
   pass count (e.g. "250/250"), not just "passed."
6. Screenshot at 390px width against a seeded account with multi-year real
   history (not an empty account): grid doesn't overflow horizontally, reads
   cleanly, matches the app's existing dark theme.
7. `git status` clean commit on local `main` only (VERIFY.md #5) — no push to
   `origin/main` or Netlify without a separate explicit go from Mr. Roni.

## Not doing
- Volume/intensity shading (binary only, per his answer).
- "See you there in [next year]" closing line — nice to have, skip unless trivial.
- Any change to the existing month mini-calendar's own behavior/UI.
- Watch-client changes.

## Tries
5

## Open questions
None — scope confirmed 2026-10-16 (own + friend via Athlete tab; binary lit/unlit).

## Result (2026-10-16, try 1)
Built in jacked-pwa/index.html: `#gymYears` overlay, `openGymYears(code?)` / `closeGymYears()` / `gymYearsHtml()`,
`#calLabel` tap, friend-profile "Gym years ›" button. New e2e suite `gymYears` (24 checks) in tests/e2e/run.mjs.
Screenshots: ~/agent/research/jacked-gym-years-2026-10-16/ (gym-years-own.png, gym-years-own-bottom.png,
gym-years-friend.png, friend-profile-button.png).

1. PASS: `#calLabel` tap opens `#gymYears`, in POPUP_SEL, SCROLL_LOCK_SEL and closeTopPopup; built from gH()/dayKey().
2. PASS: one block per year with history, oldest first (seeded 2023..2026 / friend 2021..2026); Jan-Dec, 365/366
   squares per year; lit = var(--accent) exactly on trained days, binary. Layout: two rows of six months per year
   (Jan-Jun, Jul-Dec) so squares stay ~9px at 390px instead of ~5px in one 53-column strip.
3. PASS: friend profile has a "Gym years ›" button under their month calendar, header shows their name. Found and
   fixed along the way: the brief's "p.days is un-capped" was only true on the SEND side. cleanPerson() kept only
   the first (OLDEST) 400 days on receive, so a long-time friend's recent days vanished (also from their month
   calendar). Now keeps the newest 4000, sorted. Mutation check: with the old cap restored the friend checks fail
   (400 lit of 905, years stop at 2023).
4. PASS: closes via X, history.back() (Android/browser back), Escape; from a friend profile, back closes the grid
   first and leaves the profile open, a second back closes the profile.
5. PASS: full suite 1420/1420, 0 page errors (each suite's errors.length check); separate run with a console
   listener: 0 console errors opening/closing it.
6. PASS: 390px screenshots against seeded multi-year history; test asserts no horizontal overflow (own + friend)
   and every square the same size (within 0.5px, >= 8px).
7. PASS: committed on local main only, not pushed to origin/main or Netlify.
