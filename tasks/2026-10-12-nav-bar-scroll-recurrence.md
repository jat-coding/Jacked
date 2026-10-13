# Bottom tab bar still detaches from the bottom while scrolling (recurrence)

## Reported
2026-10-12 7:52pm, screen recording (Jacked room): on the Friends tab, scrolling down then
up, the bottom nav pill visibly floats ~300px up into the middle of the content (over the
"Friends / Close Buddies" list) instead of staying pinned to the screen bottom, then snaps
back once the scroll settles. "This isn't the first time this has happened."

## This is a recurrence, not new
Same symptom, same screen (Friends tab), reported before: `tasks/2026-10-02-nav-bar-scroll.md`,
shipped as v1.10.63 on staging. That fix's root-cause theory was the v1.10.55 popup
scroll-lock (`body position:fixed; top:-scrollY` on popup open/close) leaving the nav
stranded at a stale scroll position. **That card says explicitly it was never verified on
real iOS** — no simulator, no Playwright WebKit install, inferred from code + geometry
only.

**This new video contradicts that theory**: no popup is opened anywhere in the recording —
it's a plain scroll/release on the Friends tab, nothing else. So either the 10/2 fix didn't
actually address the real cause, or there is a second, independent trigger (the far more
likely one: this is the well-known iOS WebKit bug where `position:fixed` elements lag/
detach from the visual viewport during momentum/rubber-band scroll, unrelated to any JS
scroll-lock). Go in assuming the popup-lock theory is NOT the (or not the only) cause.

## Investigate
- Current CSS: `html,body{height:100%;overscroll-behavior:none;-webkit-overflow-scrolling:touch}`
  and `nav{position:fixed;...bottom:var(--navB)...}` (jacked-pwa/index.html ~line 46, 51) —
  the page scrolls the document itself (no dedicated scroll container per `.page`), which is
  exactly the setup where this WebKit bug bites hardest.
- Try to get a real repro proxy: install Playwright WebKit (`npx playwright install webkit`)
  with iPhone device emulation + touch, and actually attempt to trigger the drift during a
  fast scroll-and-release gesture. State plainly whether WebKit (not just Chromium) can or
  cannot reproduce this — Chromium provably cannot (2026-10-02 card).
- Consider the standard fix for this bug class rather than another patch on the popup lock:
  restructure to a fixed app shell (`html,body{position:fixed;inset:0;overflow:hidden}`)
  with each `.page` as its own `overflow-y:auto` scroll container, nav as a sibling outside
  it — this removes document-level scrolling entirely, which is what actually stops iOS from
  ever re-laying-out a `position:fixed` sibling mid-gesture. This is a bigger change; weigh
  it against a lighter mitigation (own compositing layer via `transform:translateZ(0)` /
  `will-change:transform` on `nav`, dropping `-webkit-overflow-scrolling:touch` from
  `html,body` since that's a legacy iOS<13 overflow-container property with no business on
  the document root) and pick whichever actually holds up under test.

## Done when
- [x] State plainly whether WebKit emulation reproduces the drift (yes/no), and if yes, that
      the fix stops it under the same WebKit repro. **No** -- and more specifically than a
      plain "didn't reproduce": WebKit (installed + launched successfully under xvfb) has no
      available mechanism via Playwright to even attempt a touch-gesture scroll on mobile
      WebKit -- `mouse.wheel()` throws outright ("not supported in mobile WebKit"), and
      `page.touchscreen` exposes only a single `tap()`, no swipe/drag primitive; synthetic
      DOM TouchEvent construction also fails ("Illegal constructor") in this WebKitGTK build.
      So the fix below is NOT WebKit-verified; see the research report for full detail.
- [x] Fix applied; full e2e suite green (state pass count) including the existing
      `navPinned` suite from the 10/2 card, re-run and still passing. **1148/1148**, run twice
      for stability. `navPinned` (12 checks) and `popupScrollLock` (35 checks) both pass,
      adapted to read/set scroll position on `#jkRoot` instead of `window` now that the
      document itself can never scroll (the fix's whole point).
- [x] Be explicit in the report: Chromium-only "all green" is NOT sufficient confidence for
      this bug class (it wasn't last time either) — flag that real confirmation needs him to
      scroll the Friends tab on his actual phone before this is considered closed, same as
      the 10/2 card should have said more forcefully. Done in
      research/jacked-nav-scroll-recurrence-result-2026-10-12.md.
- [x] Committed to `staging` via `scripts/jacked-push.sh --branch staging`; no push to
      `main`/prod without his go. Pushed as 9b431e8 (origin/staging == local HEAD, verified
      by the script's own read-back). `main`/prod untouched.

## Not doing
- Not re-shipping the same popup-lock-only theory without addressing the no-popup repro in
  this video.
- Not touching `main`/prod.

## Tries
Default 5, but this is a "confirm, don't assume" task — if WebKit can't reproduce it either,
say so honestly rather than shipping a guess as a confirmed fix a third time.
