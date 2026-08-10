# DESIGN — Jacked visual system for watch clients

Any watch client must read as the same product as the Jacked phone/web app.
Tokens below are **exact values extracted 2026-08-07 from the live PWA's CSS**
(`https://jacked-trainer.netlify.app` — CSS custom properties in `index.html`),
cross-checked against phone screenshots. Field-proven on the Wear OS client.

---

## 1. Color palette (verbatim from the PWA)

| Token | Hex | PWA usage |
|---|---|---|
| `--accent` | `#20D3C2` | The Jacked teal: stat numerals, active tab, exercise names, PR values, timer digits |
| `--accent-bright` | `#5CE9DA` | Light end of the primary-button gradient; selected toggle fill |
| `--accent2` | `#14A99B` | Darker teal variant (pressed/secondary accent) |
| `--on-accent` | `#04140A` | Text/icons on teal fills (near-black, slight green cast) |
| `--bg` | `#0C0C10` | Page background (near-black, blue-tinted) |
| `--bg2` | `#16161C` | Card background |
| `--bg3` | `#1E1E26` | Raised card / gradient top |
| `--bg4` | `#292932` | Chips, inset input boxes, highest surface |
| `--border` | `#26262F` | Default card/tile border |
| `--border2` | `#363642` | Emphasized border |
| `--text` | `#F3F3F8` | Primary text |
| `--text2` | `#A4A4B4` | Secondary text (dates, meta lines, labels) |
| `--muted` | `#70707F` | Tertiary/disabled text, uppercase section labels |
| `--red` | `#FF5D6C` | Destructive, "Needs Work", missed-day tint |
| `--green` | `#3DDC97` | Success/"Earned" |
| `--orange` | `#FF9F4D` | Warning/"Building"/bronze tier |
| `--blue` | `#5AA9FF` | Info ("Suggested today", "Strong") |
| `--purple` | `#B07CFF` | Occasional accent (metrics) |

## 2. Typography

- **Headers / display numerals:** `Barlow Condensed` (bold) — the chunky
  "JACKED." look and the big stat numbers.
- **Body:** `DM Sans` — all body copy, labels, list rows.
- Both are Google Fonts under the OFL — fine to bundle where the platform
  allows custom fonts.
- Conventions: uppercase + letter-spaced muted labels under stat numerals
  (`THIS MONTH`, `LB LIFTED`); `×` (not "x") between weight and reps
  (`110lb × 12 reps`); compact K-notation for volume (`16.7K` + small unit).

## 3. Watch adaptation rules (proven on Wear OS)

- **Background is pure black `#000000`**, not `--bg` — merges with a round
  bezel and saves AMOLED power. Keep the PWA surface ladder above it
  (`bg2` cards on black, `bg4` inset value boxes on `bg2`).
- **Glows and gradients are flourishes, not structure.** Keep the teal
  gradient on the single primary CTA per screen; skip glow elsewhere —
  small screens, battery, and legibility come first.
- Tap targets ≥ 48dp equivalents, pill-shaped buttons; 12/18px radius
  language reserved for cards and inset value boxes.
- Semantic colors carry over 1:1 (red destructive, green success, orange
  warning, blue info) — e.g. rest-timer in teal, overtime in orange.

### Garmin-specific notes

- **MIP displays (~64 colors, no true black-level advantage):** the palette
  must degrade to high-contrast flats — white text on black, teal `#20D3C2`
  approximated by the nearest palette teal, no gradients or glows at all.
  Reserve the full palette for AMOLED Garmins.
- **Custom fonts on Connect IQ are bitmap fonts** and cost memory; shipping
  Barlow Condensed for the big numerals only (digits + a few glyphs) gets the
  brand look cheaply — system fonts for body text are fine.
- Non-touch (5-button) devices: the "primary CTA" concept maps to the START
  button affordance + an on-screen hint, not a tappable pill.

## 4. Component conventions (screen-by-screen crib)

| Element | Convention (from the phone app) |
|---|---|
| Stat tile | Dark tile, big teal Barlow-Condensed numeral, uppercase muted label below |
| Primary CTA | Teal (gradient where possible) pill, `--on-accent` bold text ("Start Workout", "Finish" ✓) |
| Secondary action | `bg4` pill, white text ("Cancel", "+ Add Set") |
| Destructive | Dark-red tinted square, `--red` × icon |
| Exercise name | Teal, bold |
| PR line | Muted `PR: 100lb × 12 · 0/3 done` under the exercise name |
| Set row | Muted `PREV 100×12` hint; white bold values in inset boxes; done-check toggles to teal fill |
| Workout timer | Big teal Barlow Condensed digits (`00:25`), uppercase muted workout name above |
| History row | Name white bold, `date · duration · N sets` muted, right-aligned volume (`16.7K` + small `lb`) |
| Status chip | Tinted pill: blue "Strong", orange "Building", red "Needs Work", green "Earned" |
| Sync indicator (watch-only) | Teal ✓ synced, muted offline/queued count, blue syncing |
