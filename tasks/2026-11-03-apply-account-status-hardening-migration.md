# Apply account-status hardening migration (findings #13/#14)

**His words** (verbatim):
> "Turn on the follow-up hardening too (fake-proof address check, plus the same limit on
> email lookups)?" → "Yes, apply it"

**Goal:** Apply `supabase/migrations/20261026_account_status_hardening.sql` to the live
Jacked Supabase project. Two fixes from the 2026-10-25/26 weekly review, on top of the
2026-11-03 rate-limit migration already live:
- #13: `account_status_by_email` gets the same per-IP throttle `account_status` has, and
  stops handing back the real sign-in email (code only now) — `account_status(code)`
  is the only call that ever returns email.
- #14: both functions' throttle was keyed on the LEFTMOST `x-forwarded-for` entry, which
  is attacker-controlled (a real proxy chain appends to the end, never the front) — fixed
  via a shared `_client_ip()` helper that reads the RIGHTMOST entry instead. Live-confirmed
  during the rate-limit migration job as an actual spoofable gap, not theoretical.

**Done when:**
- The app's client code (`jacked-pwa/index.html` `cloudLogin()` ~line 9300-9327) already
  expects this migration's shape (two-call email-login resolving sign-in email via a
  second `account_status(code)` call) — confirm this by reading it, do NOT change
  `index.html` for this task. If it turns out the client does NOT already match, STOP and
  report back rather than writing new client code under this card.
- Migration applies cleanly to PGlite, then to the live project, via the same mechanism
  used for `20261016_account_status_rate_limit.sql` (Management API `database/query`
  endpoint, `scripts/broker/supabase-api`).
- `supabase/tests/setup_sql_test.mjs`, `rls_test.mjs`, `set_my_email_test.mjs` pass against
  PGlite with this migration applied on top of the rate-limit one.
- Live verification: `account_status_by_email` on a claimed account's email no longer
  returns an `email` field in its `claimed` response (code only).
- Live verification: a spoofed `x-forwarded-for` with a fabricated leftmost entry (e.g.
  `1.2.3.4, <real-caller-ip>`) throttles on the RIGHTMOST (real) entry, not the fake one —
  repro the exact finding #14 gap against the OLD function first if possible (or cite the
  live test already done during the rate-limit job as the before-state), then show it's
  fixed after.
- `supabase/regen_setup_sql.sh` re-run, `SUPABASE_SETUP.sql` updated if it changed,
  `setup_sql_test.mjs` still passes against the regenerated file.
- Rollback `supabase/rollback/20261026_account_status_hardening_down.sql` reviewed
  (restores the pre-migration functions) — not run, just confirmed correct.

**Reference:** none (no UI).

**Not doing:** no change to the 20/5min/15-min threshold; no client-code change (see
Done-when line 1 — if one turns out to be needed, that's a stop-and-report, not a silent
scope expansion).

**Tries:** 5

**Open questions:** none — fully specified by his "yes, apply it," DB-only.

## Status: DONE 2026-11-03 (applied live)

- Client check: `cloudLogin()` (index.html ~9300-9330) already does the two-call email login
  (`account_status_by_email` -> code, then `account_status(code)` -> sign-in email, both
  handling `rate_limited`). Same code is on origin/main and on the live production site
  (fetched jacked-trainer.netlify.app, contains the #13 comment and `st2.email`). Watches never
  call `account_status_by_email`. index.html not touched.
- PGlite: new `supabase/tests/account_status_hardening_test.mjs` 27/27 (live before-state =
  20260913 + 20261016 + 20261021, repros #13/#14, applies twice, rollback round trip; mutation
  check: reverting `_client_ip` to leftmost fails 9 assertions). account_status_rate_limit_test
  19/19, setup_sql_test 13/13, rls_test 79/79, set_my_email_test 32/32.
- Live before-state (old functions, real REST endpoint, publishable key): a spoofed
  `X-Forwarded-For: 192.0.2.201` got its own bucket next to the real IP 136.36.238.26 (#14);
  `account_status_by_email` on a temporary claimed test account returned the sign-in email
  and answered 25/25 calls unthrottled (#13).
- Applied live 2026-11-03 20:30 UTC via Management API `database/query`
  (`scripts/broker/supabase-api`). `_client_ip` exists, both functions call it, anon +
  authenticated execute grants intact.
- Live after: no-spoof, `1.2.3.4`, `1.2.3.4, 136.36.238.26` and `1.2.3.4, 9.9.9.9` all landed in
  the single real-IP bucket (the edge appends the true client IP last). 17 more calls rotating
  `192.0.2.N` as the spoof: lock tripped on call 20 (rate_limited, retry_after 900); a
  by_email call with yet another spoof was rate_limited too (shared bucket). by_email on the
  test account returned `{code, status:claimed}`, no email; `account_status(code)` still
  returned the sign-in email.
- Cleanup: test auth user + profile deleted, throttle row deleted (it would have locked his
  home network for 15 min). Profiles back to 21, attempts table empty.
- regen_setup_sql.sh re-run: no diff (already included). setup_sql_test passes on it.
- Rollback reviewed + exercised in PGlite: restores `account_status` byte-identical to the
  live before-state (md5 96bc4092...), `by_email` as sql STABLE with the same text as live
  (live copy had CRLF line endings only), drops `_client_ip`. Not run live.
