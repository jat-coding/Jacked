---
project: Jacked
date: 2026-10-02
status: built -- v1.10.63 on staging; production needs Mr. Roni's go
---

# Bottom tab bar moves while scrolling (Friends)

## Ask
Mr. Roni 2026-10-02 3:36pm (topic 620): "The bottom tab bar is moving while I scroll." Photo
(bridge/run/photos/-1003926058645_620-1790976986312.jpg): Friends tab, scrolled, the nav pill sits ~310 px up the
screen over the leaderboard/Friends list.

## Reproduction (what was and wasn't possible)
- Headless Chromium 390x844 touch + wheel, Friends with 14 friends, every popup opened/closed, landscape lock and
  back: the nav never moves in Chromium (bottom 836 = viewport - 8 every time). The bug is iOS WebKit only.
- No iOS to test on: the Mac has Xcode but no simulator runtimes and the licence is not accepted (needs sudo);
  Playwright WebKit is not installed and is not iOS scrolling anyway.
- He is on staging (photo shows the calendar-month board, v1.10.58), so he has the v1.10.55 popup lock. Production
  (02aaab3, 9/28) does not. The frosted nav has been there since 9/20 with no report.

## Cause
The v1.10.55 popup scroll lock. Opening any popup set body position:fixed; top:-scrollY (document becomes one
screen tall, scrollY 0); closing removed it and called scrollTo(0, Y) in the same frame. On iOS that leaves the
fixed nav at its scroll-0 spot in the document: it sits Y px up the screen and moves with the list. The photo fits:
the pill's bottom is ~310 px above the viewport bottom, the same place it would be in the document at scroll 0.
Inferred from code + geometry + timing, not observed on an iPhone. Second, weaker candidate (no fix shipped): iOS
leaving the layout viewport offset after the keyboard closes (the ~310 px also matches a keyboard height).

## Fix (v1.10.63)
- [x] syncScrollLock no longer touches body style or scroll position. While a popup is open, wheel and touchmove
      are cancelled unless an element inside the popup can still scroll that way (_popupCanScroll walks up from the
      target; an inner scroller at its edge hands over to an outer one, never the page). Range inputs exempt.
      Nothing to restore on close; a popup that switched tabs sends the new tab to its top.
- [x] Rotated landscape frame: #jkRoot overflow:hidden as before (touch axes are screen axes there).
- [x] Old lock also left inline top:-Ypx/width:100% on body when a popup stayed open across a rotation (beat the
      rotate CSS); gone.

## Tests
- [x] e2e navPinned (12 checks): nav bottom = viewport bottom at start, after touch scroll, after wheel; 26 popup
      types (every .mo + achievements, recap, badge): opening never moves the page or makes body fixed, a drag
      over it doesn't scroll the page, after closing the nav stays pinned while scrolling down and up; long popup
      still touch-scrolls; tab-switching popup; landscape lock -> popups -> portrait; popup open across
      portrait->landscape->close->portrait and landscape->portrait->close. On the old code 2 checks fail (body
      fixed / page moved on open; inline body offset across rotation); Chromium can't show the iOS float itself.
- [x] popupScrollLock (35) updated to read the lock from html.popup-lock instead of body position.
- [x] Full suite 888/888 on JK_PORT 8799.

## Send-backs
(none yet)
