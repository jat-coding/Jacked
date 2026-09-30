# Friend avatar enlarge/lightbox (Mr. Roni, 2026-09-30 10:33am, room -1003926058645 topic 620)

Queue AFTER feat/sep30-queue and tasks/2026-09-30-badge-fixes-2.md — same repo/branch, don't
run concurrently.

Ask: "Make the ability to click on the profile pic of the friend and it shows their pic
enlarged in a nice looking display."

## Current state (checked index.html)
- `avHTML(p,size)` (~1354) renders the circular avatar div (photo via `cleanAvatar` bg-image,
  or initials if none). No click handler on it anywhere.
- `openFriend(code)` (~5297) is the friend-profile popup (`fpModal`); its avatar is `fpAv`,
  rendered at avHTML(p,48) — small, top of the popup.
- Friends/leaderboard list rows (that call `openFriend(code)` on tap) also render avHTML at a
  small size — tapping a row already opens the profile popup.

ANSWERED (Mr. Roni, 2026-09-30 10:59am): profile popup avatar only (fpAv) — not the friends
list rows.

## Implementation sketch (once answered)
- New lightweight overlay (reuse existing modal pattern) — darkened full-screen backdrop,
  the photo centered near-full-width, rounded corners, tap backdrop or an X to close.
- Only wire the click when `p.avatarUrl` resolves to a real photo (`cleanAvatar` non-empty);
  initials-only avatars aren't clickable — nothing to enlarge.
- No zoom/pan needed unless he asks; just a clean bigger view.

## Done-when
- [x] Scope answered (2026-09-30 10:59am): popup-only
- [x] Tap opens enlarged photo, tap-away/X closes, no dead-click on initials-only avatars
- [x] Tested (666/666), staging push (v1.10.50, commit bf38478, merged 37d1c1e), version bumped
