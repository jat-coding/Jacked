# Apply account-status rate-limit migration

**His words** (verbatim, from the audit report's tap question and his answer):
> "Switch on the account-lookup rate limit that is already written and tested?" → "Yes, apply it"

**Goal:** Apply `supabase/migrations/20261016_account_status_rate_limit.sql` to the live
Jacked Supabase project so `account_status(p_code)` is throttled per-IP (20 lookups / 5 min,
then a 15-min lock), closing the open high finding from the 2026-10-25 security review.

**Done when:**
- `supabase/tests/setup_sql_test.mjs`, `rls_test.mjs`, `set_my_email_test.mjs` all pass
  against PGlite with the migration applied.
- Migration applied to the live project (Supabase SQL editor via the Management API
  token); `account_status_attempts` table exists live with `revoke all` confirmed (no
  anon/authenticated grant).
- Calling `account_status` live 21 times in under 5 minutes from the same IP returns
  `status: rate_limited` on the 21st call; a different IP in the same window is unaffected.
- `supabase/regen_setup_sql.sh` re-run so `jacked-pwa/SUPABASE_SETUP.sql` includes this
  migration; `supabase/tests/setup_sql_test.mjs` still passes against the regenerated file
  (double-apply check).
- Rollback script `supabase/rollback/20261016_account_status_rate_limit_down.sql` confirmed
  present and reviewed (not run — just confirmed it would work if needed).
- No app code (`index.html`) changes — this is DB-only.

**Reference:** none (no UI).

**Not doing:** changing the lockout window/threshold (20/5min/15min) he hasn't asked to
tune; no change to `account_status`'s existing response shape besides the new
`rate_limited` status it already returns.

**Tries:** 5

**Open questions:** none — this is DB-only and fully specified by his "yes, apply it."

## Status: DONE 2026-11-03 (applied live)

- PGlite: setup_sql_test 13/13, rls_test 79/79, set_my_email_test 32/32, new
  account_status_rate_limit_test 19/19 (standalone migration + rollback round trip).
- Applied live 2026-11-03 ~20:15 UTC via the Management API `database/query` endpoint
  (`scripts/broker/supabase-api`), same path as the 2026-10-28 migrations. Table exists,
  relacl `{postgres,service_role}` only, no anon/authenticated grant.
- Live test: 21 calls in 5 seconds from one (fake TEST-NET) x-forwarded-for value: calls 1-19
  `not_found`, calls 20 and 21 `rate_limited` (retry_after 900); a second IP unaffected. Test
  rows deleted afterwards.
- Note: the lock trips on call 20, not 21 (count+1 >= 20), so 19 real lookups per window.
  Threshold left as is per "Not doing".
- Live confirmed finding #14: the bucket key is the client-supplied leftmost
  x-forwarded-for (a spoofed value got its own bucket). 20261026_account_status_hardening.sql
  fixes that and is still NOT applied live; needs its own go.
- regen_setup_sql.sh re-run: no diff (SUPABASE_SETUP.sql already contained this migration).
- Rollback reviewed: restores the exact live pre-migration function (sql, stable) and drops
  the table; exercised in PGlite, not run live.
