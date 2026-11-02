# Edit email in Account settings

## His words (verbatim, in order)

Voice memo, 2026-10-26 ~1:47pm MDT:
> "Also, where is the location for adding your email to your account? Where could I find
> that on the main product?"

My reply: there is no such place — email is only ever captured once, at sign-up, and
nothing in Profile/Account lets you add or change it afterward.

Tap answer, same day:
> "Add an edit-email option to Jacked's Account settings? → Yes, build it"

Follow-up message, same day:
> "Once we add that email convergence then we'll push"

Meaning: he wants a real "add/change your email" control added to the Account section of
the app (not just at sign-up), and he's deferring the already-approved resident-tab-update
fix's production push until this lands too, so both go out together
([[jacked-push-bundled-with-email-feature-2026-10-26]]).

## Goal

A user with an existing Jacked account can add an email (if they signed up without one) or
change the email on file, from Profile → Account, without needing to re-register.

## How today's code works (read before building)

- Accounts are NOT native Supabase Auth. They're a custom table + RPCs:
  `registerAccount({code, password, name, email, proofIds})` (jacked-pwa/index.html ~8471),
  `accountStatus(code)`, `accountStatusByEmail(email)` (RPC `account_status_by_email`).
  Email is optional at sign-up, used only so the same account can also log in by email.
- Email uniqueness is presumably enforced server-side today (sign-up flow throws
  `email_taken` — see toast at line 1743). Confirm the real constraint (migration/RPC) before
  assuming — don't duplicate or weaken it.
- Profile modal (`#profModal`) "Account" block is ~line 1168-1175: Export backup / Sign Out,
  directly above the version footer. This is where the new control goes.
- No client-side email-change flow exists anywhere in the codebase today (checked directly,
  not from memory — [[jacked-no-edit-email-in-account-2026-10-26]]).

## Done when

- Profile → Account shows the current email on file (or "No email on file" / similar if
  none), and a way to add/change it.
- Submitting a new email updates the account's email column via a new or existing Supabase
  RPC (not `supabase.auth.updateUser` — this app doesn't use native Supabase Auth).
- Taking someone else's already-in-use email is rejected with a clear error (reuses or
  matches the existing `email_taken` behavior from sign-up), not a silent failure or a
  generic 500.
- An invalid/malformed email is rejected client-side before any network call (reuses
  existing `invalid_email` validation pattern from sign-up).
- A fresh-signed-up account with no email set can add one for the first time (not just
  change an existing one) — this is the case he originally asked about.
- Full e2e suite passes (`node tests/e2e/run.mjs`), count reported as "X/X", 0 new console
  errors — per VERIFY.md #1-2.
- `git status` clean, committed locally. **Not pushed to origin/main, not deployed** — his
  go is pending and bundled with the resident-update fix per his own instruction above.

## Not doing

- Not touching the resident-tab content-version-check fix (separate, already built, held
  for the same future push).
- Not adding email-based 2FA, password reset via email, or any notification/marketing use
  of email — just the ability to see/add/change the email on file.
- Not migrating accounts to native Supabase Auth — stays on the existing custom RPC system.

## Open questions

None — scope is narrow enough (view + edit one field, reusing existing validation/error
patterns) to build without further input. If the real email-change server-side story turns
out to need confirmation-link verification (can't be done from client-only RPC safely), stop
and ask before building a weaker version.

## Tries

5
