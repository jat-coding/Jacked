# JACKED — Claude Code Handoff Document

> **For Claude Code:** This document is your complete brief. Read it fully before touching any file.
> The deliverable is a deployed PWA. All current source lives in `jacked-pwa/`. Start there.

---

## 1. Project Overview

**Jacked** is a mobile-first Progressive Web App (PWA) workout tracker — think Hevy or Strong, but self-contained with no backend. Users log workouts, track PRs, monitor body metrics (BMI, muscle rankings), and compete with friends on a leaderboard.

The app is **100% client-side**: one HTML file, no framework, no build step, no server. It deploys as a static site (Netlify, GitHub Pages, etc.) and installs natively on iOS/Android via "Add to Home Screen."

---

## 2. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | Vanilla JS (ES2020+) | No build toolchain needed, single-file deploy |
| Styling | Hand-written CSS with CSS variables | Dark theme, full control, no dependencies |
| Fonts | Google Fonts (Barlow Condensed + DM Sans) | CDN, loads fast |
| Exercise DB | [free-exercise-db](https://github.com/yuhonas/free-exercise-db) | Public domain, 800+ exercises with photos, JSON API |
| Exercise photos | `raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/` | Free CDN, real demo images per exercise |
| Storage | `localStorage` with `jk_` key prefix | Offline-first, no backend |
| PWA | `manifest.json` + `sw.js` service worker | Installable, offline capable |
| Deployment | Netlify (drag-and-drop) | Free tier, HTTPS required for PWA install prompt |

### Key external URLs
```
Exercise JSON:   https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
Exercise images: https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/{filename}
```

---

## 3. File Structure

```
jacked-pwa/
├── index.html       ← Entire app (HTML + CSS + JS, ~92KB, 1704 lines)
├── manifest.json    ← PWA manifest (name, icons, theme colour #e8ff47)
├── sw.js            ← Service worker (cache-first for app, network-first for exercise DB)
├── icon-192.png     ← App icon 192×192 (yellow "J" on dark background)
└── icon-512.png     ← App icon 512×512
```

**Everything is in `index.html`.** There is no build process, no `package.json`, no node_modules. To edit the app, edit `index.html`.

---

## 4. Architecture Inside index.html

### 4.1 CSS Custom Properties (Design Tokens)
```css
--bg, --bg2, --bg3, --bg4          /* Dark backgrounds, darkest to lightest */
--border, --border2                 /* Dividers */
--accent: #e8ff47                   /* Brand yellow — primary CTAs, highlights */
--accent2: #c8e030                  /* Hover state for accent */
--red, --green, --blue, --orange, --purple  /* Semantic colours */
--muted                             /* Subdued text */
--fh: 'Barlow Condensed'           /* Headings, numbers, stats */
--fb: 'DM Sans'                    /* Body text */
--r: 10px   --rl: 16px             /* Border radii */
```

### 4.2 Page Structure
The app uses a **single-page architecture** with CSS `display:none/block` toggling.

| Page ID | Nav label | Content |
|---|---|---|
| `page-home` | Home | Stats grid, calendar heatmap, recent workouts |
| `page-routines` | Routines | Routine cards with start/edit/delete |
| `page-exercises` | Library | Searchable exercise library with photos |
| `page-metrics` | Metrics | BMI calculator, muscle rankings, recommendations |
| `page-leaderboard` | Board | Friend leaderboard across 5 metrics |
| `page-active` | (no tab) | Live workout session with timer and set logging |

Navigation function: `sp(pageId)` — switches pages and calls the relevant render function.

### 4.3 Modal System
All modals use class `.mo` (overlay) + `.md` (sheet). Open/close: `om('modalId')` / `cm('modalId')`.

| Modal ID | Purpose |
|---|---|
| `qsModal` | Quick-start: pick routine or empty workout |
| `crModal` | Create/edit routine |
| `ceModal` | Create custom exercise (full form with grip/tracking type) |
| `aeModal` | Add exercise picker (multi-select for routines, single for workouts) |
| `wdModal` | Workout detail / delete |
| `restModal` | Rest timer (auto-opens after completing a set) |
| `profModal` | Profile name/username/code |
| `afModal` | Add friend by code |

### 4.4 localStorage Schema
All keys are prefixed `jk_`. Use `S.g(key)` to read, `S.s(key, value)` to write.

| Key | Type | Contents |
|---|---|---|
| `jk_appVersion` | string | e.g. `'v1.0.0'` — bump to force re-onboard |
| `jk_prof` | `{name, username, code}` | User profile + invite code |
| `jk_routines` | `Routine[]` | User-created routines |
| `jk_cex` | `CustomExercise[]` | User-created exercises |
| `jk_hist` | `WorkoutRecord[]` | All completed workout sessions |
| `jk_prs` | `{[exId]: {weight, reps, date}}` | Personal records per exercise |
| `jk_friends` | `Friend[]` | Friend list (accepted + pending) |
| `jk_metrics` | `{age, weight, height, sex, unit}` | Saved body metrics |
| `jk_settings` | `{wUnit:'kg'\|'lb', restDefault:number, autoRest:bool}` | Units (drives logger + Metrics page), default rest seconds, auto-rest toggle. Defaults to `lb`. |
| `jk_activeWorkout` | `{aw, awStart}` | In-progress session (transient; cleared on finish/cancel; excluded from export) |

### V2 notes
- **Versioning:** `BUILD` (e.g. `v2.0.0`) is the display version shown at the bottom of Home + Profile; `APP_VERSION` is the *data-reset* stamp (kept at `v1.0.0` so V2's additive changes don't wipe data). Bump `BUILD` every release; bump `APP_VERSION` only for a breaking schema change.
- **PRs commit on finish only.** During a session a gold ★ marks any done set that beats the stored PR on weight *or* reps (`beatsPR()` in `renderWS`); nothing is written. `commitPRs()` runs in `finishW()` and never downgrades a heavier PR. `WorkoutRecord` gains `prCount`. The finish summary modal (`#fsModal`) shows time, sets, total weight lifted, and the PRs hit.
- **Set inputs:** new sets are empty; the previous set/PR shows as a greyed placeholder; checking a set adopts the placeholder if left blank; a fully-backspaced field stores 0 and renders empty.
- **Switch/reorder:** `moveEx`/`switchEx` (active session) and `moveExR` + `openAEModal('routineReplace',i)` (routine builder). Picker gained `workoutReplace`/`routineReplace` single-select modes.
- **Supabase (friends + leaderboard):** paste `SUPABASE_URL` + `SUPABASE_ANON_KEY` near the bottom of the `<script>` and run `SUPABASE_SETUP.sql`. Identity = friend code, no auth. `syncMe()` upserts your `profiles` row; `refreshFriends()` reads `friend_requests` + `profiles`. Blank keys ⇒ fully local fallback (unchanged behaviour). Tables: `profiles`, `friend_requests` (RLS permissive).
- **Mobile:** zoom locked (`user-scalable=no`), sticky page headers with `env(safe-area-inset-top)` so nothing hides under the notch, fixed bottom chrome hidden while typing (`body.kb`), and the exercise picker is a fixed-height sheet (search pinned top, list scrolls, action bar overlaid by keyboard).
- **Plate calculator** (`#pcModal`, `openPlate`/`calcPlates`) — launched from the active-workout footer; works in the chosen unit.

#### Key object shapes
```js
// Routine
{ id: 'r'+Date.now(), name: string, desc: string, exercises: string[] /* exercise IDs */ }

// CustomExercise
{ id: 'cex'+Date.now(), name: string, muscle: string, equip: string,
  tracking: 'weight_reps'|'bodyweight_reps'|'duration'|'distance'|'reps_only',
  category: string, notes: string, images: [], _c: true }

// WorkoutRecord (saved to hist)
{ id: 'w'+Date.now(), name: string, date: ISO8601, routineId?: string,
  exercises: WorkoutExercise[], duration: 'MM:SS', sets: number, totalVolume: number }

// WorkoutExercise (inside a record)
{ exId: string, name: string, muscle: string, tracking: string,
  imgUrl: string|null, sets: SetRecord[] }

// SetRecord
{ weight: number, reps: number, done: boolean }

// Friend
{ id: string, name: string, username: string, code: string,
  totalVolume: number, workouts: number, prs: number,
  streak: number, consistency: number, pending: boolean }
```

### 4.5 Exercise Database Integration
- `loadDB()` — async, fetches the free-exercise-db JSON on first visit to Library page
- `allDB` — module-level array holding all DB exercises after load
- `allEx()` — returns `[...customExercises, ...dbExercises]` — always call this, never `allDB` directly
- `byId(id)` — safe lookup; never returns undefined; falls back to humanising the slug
- `imgUrl(ex)` — returns full GitHub CDN URL or `null` for custom exercises
- `thumbH(ex, size)` — returns full `<img>` or emoji placeholder HTML string
- Exercises are filtered: `EXCLUDED_CATS` removes stretching/plyometrics; `ALLOWED_MUSCLES` restricts to strength muscle groups

### 4.6 Active Workout State
```js
let aw = null;        // Active workout object (null when no session)
let wt = null;        // setInterval ref for workout timer
let ws = 0;           // Elapsed seconds
let rt = null;        // setInterval ref for rest timer
let restSec = 0;      // Rest seconds remaining
```
The workout object `aw` is built in memory and only written to `jk_hist` when `finishW()` is called.

### 4.7 Onboarding Flow
1. On boot, `resetIfStale()` checks `jk_appVersion`. If missing/different → wipes all `jk_*` keys.
2. `checkOnboarding()` reads `jk_prof`. If null → shows `#onboarding` overlay, hides nav.
3. Step 1 (`#ob1`): name + username → `obNext1()` saves to `jk_prof`, shows step 2.
4. Step 2 (`#ob2`): displays generated invite code → `obFinish()` calls `initDefaultData()` + `finishOnboard()`.
5. `initDefaultData()` seeds empty arrays for all keys (no demo data).
6. `finishOnboard()` hides onboarding, shows nav, calls `renderHome()`.

---

## 5. Current Feature Status

### ✅ Done and working
- Onboarding (name, username, invite code generation)
- Version-stamp reset (all users re-onboard on version bump)
- Home page: 3-stat grid, month/year calendar heatmap, recent workouts list
- Routine CRUD: create, edit, delete, start
- Exercise library: 800+ exercises from free-exercise-db with real photos, muscle filter chips, search
- Custom exercise creation: muscle group, category, equipment, grip/variant, tracking type, bodyweight toggle, notes
- Active workout: live stopwatch timer, per-exercise set table, weight+reps inputs, set completion checkmark, add/remove sets, add/remove exercises mid-session
- Auto rest timer (90s, adjustable) after each completed set
- PR detection: any set that beats previous volume (weight × reps) triggers a PR toast and saves
- Workout finish: saves to history with duration, total sets, total volume
- Workout detail modal: full breakdown by exercise and set
- Exercise picker: pre-populated list, muscle filter chips, multi-select for routines, single-select for workouts
- Metrics tab: BMI calculator (metric + imperial), BMR/TDEE, ideal weight range, muscle group rankings (from real PR + history data), workout summary insights, personalised recommendations, lifetime stats
- Leaderboard: 5 metrics (volume, workouts, PRs, streak, consistency), your real stats vs friends
- Friend system: unique `JCKD-XXXXXX` invite codes, add by code, accept/decline pending requests, remove friends
- Profile modal: edit name/username, view/copy invite code
- PWA: manifest, service worker, install prompt banner, iOS meta tags
- Fully offline after first load (service worker caches app shell)
- **Service worker ships updates** — network-first for the app shell + auto-activate of new SW (cache `jacked-v2`), so code changes reach installed users instead of being stuck on the cached HTML
- **Timestamp-based timers** — workout stopwatch and rest timer recompute from a start/end timestamp, so they stay accurate when the screen locks or the tab is backgrounded (mobile throttles `setInterval`)
- **Active workout persistence** — the live session is saved to `localStorage` on every change; on next load you're offered to resume an unfinished workout (cleared on finish/cancel)
- **Data export/import** — Profile → Data & Backup downloads all `jk_*` data as JSON and re-imports it (replaces current data)
- **kg/lb unit** — Profile preference; all weights stored canonically in kg and converted only for display/input across logger, history, library, PRs and lifetime stats (leaderboard intentionally stays kg since friend data is self-reported in kg). Duration/distance tracking is not unit-converted.
- **Current streak** banner on Home; **haptic feedback** on set completion and a **buzz when the rest timer ends**; **configurable default rest time** (Profile)

### ⚠️ Known limitations / not yet built
- **Backend is optional (Supabase)** — once `SUPABASE_URL`/`SUPABASE_ANON_KEY` are filled in and `SUPABASE_SETUP.sql` is run, friend requests cross devices and the leaderboard is live. With blank keys the app is fully local as before. Note: identity is the friend code with permissive RLS (no auth) — fine for casual use, not for sensitive data.
- **No push notifications** — rest timer buzzes via `navigator.vibrate` when the app is open, but there are no background/system alerts if the app is fully closed
- **No workout editing** — completed workouts can only be deleted, not edited
- **Icons are programmatically generated PNGs** — a designer-made SVG icon set would look better
- **Friend leaderboard uses self-reported stats** — friends' data is whatever they entered locally; there's no server to validate or sync

---

## 6. Suggested Next Steps (Priority Order)

### P0 — Must-have for real use
1. **Backend / sync layer** — The biggest gap. Options ranked by complexity:
   - **(Easiest)** Supabase: free Postgres + realtime + auth. Add a `users` table and `friend_requests` table. Each user's `jk_*` data syncs to a row. Friend requests become real DB rows.
   - **(Medium)** Firebase Firestore: similar, Google ecosystem
   - **(Hard)** Custom Node/Express API on Railway or Fly.io
   
2. **Imperial/metric toggle persisted to workout logger** — When user sets imperial in Metrics, the set input labels in active workout should say "lbs" and convert stored values.

3. **Data backup / export** — "Export my data as JSON" button in Profile. Let users download their history.

### P1 — Quality of life
4. **Edit completed workouts** — Tap a set in workout detail to correct a value
5. **Workout notes field** — Free-text notes per session (mood, energy, what worked)
6. **Streak display on home** — Show current streak prominently on the home screen
7. **Exercise PR history graph** — Tap an exercise in Library to see a sparkline of weight over time
8. **Rest timer preference** — Let user set default rest duration (currently hardcoded 90s)
9. **Plate calculator** — Given a target weight and bar weight, show which plates to load
10. **Body weight logging** — Track weight over time with a simple graph on Metrics page

### P2 — Social / engagement
11. **Real friend requests via backend** (depends on P0.1)
12. **Push notifications** for rest timer, friend PRs, weekly summary
13. **Workout sharing** — Generate a shareable image/card of a completed workout
14. **Challenge system** — "Beat my squat 1RM this week" sent to a friend

### P3 — Polish
15. **Animated transitions** between pages
16. **Dark/light mode toggle** (currently dark-only)
17. **Better icons** — Replace the programmatic PNG icons with a proper SVG icon
18. **Haptic feedback** on set completion (navigator.vibrate)
19. **Landscape support** — Currently optimised for portrait only

---

## 7. Deployment Instructions

### Current deploy target: Netlify (free)
1. Go to [netlify.com](https://netlify.com) → New site → Deploy manually
2. Drag the `jacked-pwa/` folder into the upload area
3. Netlify gives you `https://your-name.netlify.app`
4. **HTTPS is required** for the PWA install prompt to work on Android

### To update after changes
- Netlify: drag the updated folder again, or connect a GitHub repo for auto-deploy on push
- GitHub Pages: push to a repo, enable Pages on the `main` branch root or `/docs` folder

### To force all users to re-onboard (e.g. after a breaking storage schema change)
In `index.html`, find this line and bump the version string:
```js
const APP_VERSION = 'v1.0.0';   // change to 'v1.1.0' etc.
```
On next load, any browser with the old version stamp will have all `jk_*` keys wiped.

---

## 8. How to Work on This in Claude Code

### Initial setup
```bash
# Clone or copy the jacked-pwa/ folder into your working directory
# No npm install, no build step needed

# To preview locally (any of these work):
npx serve jacked-pwa
python3 -m http.server 8080 --directory jacked-pwa
# Then open http://localhost:8080
```

> ⚠️ **Must serve over HTTP, not open as a file://  URL.** Service workers require HTTP/HTTPS. The exercise image fetches will also fail on file:// due to CORS.

### Key editing patterns

**Adding a new page:**
1. Add a `.page` div with `id="page-yourname"` in the HTML
2. Add a `.nb` button in `<nav>` with `id="nav-yourname"`
3. Add a case in `sp()`: `else if (id==='yourname') renderYourname();`
4. Write `function renderYourname() { ... }`

**Adding a new modal:**
1. Add a `.mo` div with `id="yournameModal"` in the HTML
2. Open it with `om('yournameModal')`, close with `cm('yournameModal')`

**Adding a new localStorage key:**
1. Add a getter: `const gNewKey = () => S.g('newkey') || defaultValue;`
2. Write with: `S.s('newkey', value);`
3. Document it in the schema table above

**Modifying the exercise picker:**
- `openAEModal(target)` — call with `'routine'` or `'workout'`
- `renderAEList()` — re-renders the list; called on search input and chip tap
- `toggleAEItem(id)` — handles tap; single-select for workout, multi-select for routine
- `confirmAESelection()` — called by "Add Selected" button; only active in routine mode

**Modifying the active workout:**
- All state lives in `aw` (the workout object) — mutate it directly, then call `renderWS()` to re-render
- `uSet(exerciseIndex, setIndex, field, value)` — update a single set field
- `togSet(exerciseIndex, setIndex)` — mark a set done/undone; triggers PR check and rest timer

---

## 9. Design System Cheatsheet

```html
<!-- Primary button -->
<button class="btn ba">Label</button>

<!-- Ghost/outline button -->
<button class="btn bg">Label</button>

<!-- Danger button -->
<button class="btn bd">Delete</button>

<!-- Small modifier -->
<button class="btn ba sm">Small</button>

<!-- Icon-only button -->
<button class="btn bg ic">✏️</button>

<!-- Full-width -->
<button class="btn ba wf">Full Width</button>

<!-- Badges -->
<span class="badge bm">neutral</span>
<span class="badge baccent">PR</span>
<span class="badge bgreen">Strong</span>
<span class="badge bblue">Average</span>
<span class="badge borange">Needs Work</span>
<span class="badge bred">Alert</span>

<!-- Stat card -->
<div class="sc"><div class="sv">42</div><div class="sl">Label</div></div>

<!-- Section title -->
<div class="st">Section Header</div>

<!-- Card containers -->
<div class="card">...</div>
<div class="card-dark">...</div>

<!-- Separator -->
<div class="sep"></div>

<!-- Toast (JS only) -->
toast('Message', 'ok');   // green
toast('Message', 'err');  // red
toast('Message', 'pr');   // yellow/accent (PR celebrations)
toast('Message');          // neutral
```

---

## 10. Context from Development History

This app was built iteratively in claude.ai across one conversation. Key decisions made:

- **Single-file architecture** was chosen deliberately so it deploys as a static file with zero infrastructure
- **free-exercise-db** was chosen over manual exercise lists because it has 800+ exercises with real demonstration photos, public domain licensed
- **Stretching and plyometrics categories were explicitly excluded** from the exercise DB filter — the user wants strength/hypertrophy only
- **Multi-select exercise picker** was added after user feedback that single-tap-to-add was cumbersome for building routines
- **Grip/variant system** in custom exercise creation was added so users can distinguish "EZ Bar Curl (inner grip)" from "EZ Bar Curl (outer grip)" etc.
- **Imperial/metric toggle** was added after user feedback; BMI supports both but the workout logger still defaults to kg (known issue, see Next Steps)
- **All demo data (fake friends Marcus/Jordan/Sam, seeded routines) was stripped** — the user explicitly requested a clean slate where every piece of data is user-generated
- **Version-stamp reset system** was added so the developer can force all users to re-onboard by bumping a single string constant
- **Friend system is local-only** — the user understands this limitation; a backend is the top P0 item

---

*Generated from claude.ai conversation — May 2026*
*Hand this file to Claude Code along with the `jacked-pwa/` folder.*
