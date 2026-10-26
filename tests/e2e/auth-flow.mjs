// Onboarding sign-up-vs-log-in choice, optional sign-up email, and username-or-email
// login (Mr. Roni, 2026-10-21 voice memo + follow-up tap confirm).
// Real Supabase is blocked by the harness (see harness.mjs), so the online paths
// (registerAccount's edge-function call, cloudLogin's account_status*/signIn/profile
// reads) are exercised against an in-page SUPA stub, the same pattern live.mjs and
// friend-invite-dedup.mjs already use.
import { phone, check } from './harness.mjs';

const toasts = page => page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));

// Re-enter onboarding on an already-booted page instead of seeding `prof: null` through
// phone(): phone()'s own boot wait blocks on nav becoming visible, which never happens
// while onboarding is up.
async function dropToOnboarding(page) {
  await page.evaluate(() => { localStorage.removeItem('jk_prof'); checkOnboarding(); });
}

async function onboardingChoice() {
  const { page, ctx, errors } = await phone({});
  await dropToOnboarding(page);
  check('onboarding: the log-in form (#ob0) is what shows first, not the sign-up form',
    await page.evaluate(() => document.getElementById('ob0').classList.contains('active') && !document.getElementById('ob1').classList.contains('active')));
  check('onboarding: sign-up form is not visible yet', !(await page.locator('#ob1').isVisible()));
  check('onboarding: log-in form is inline, not a modal popup', !(await page.locator('#loginModal').count()));
  check('onboarding: log-in form has the username-or-email and password fields',
    await page.locator('#ob0 #loginUser').isVisible() && await page.locator('#ob0 #loginPass').isVisible());
  check('onboarding: log-in form keeps its password show/hide toggle', await page.locator('#ob0 .pw-tog').count() === 1);
  check('onboarding: a secondary "Sign up" link is offered below the log-in form',
    await page.locator('#ob0').getByRole('button', { name: 'Sign up', exact: true }).isVisible());
  check('onboarding: "Restore from a backup file" is still reachable from the log-in view',
    await page.locator('#ob0').getByRole('button', { name: 'Restore from a backup file' }).isVisible());

  await page.locator('#ob0').getByRole('button', { name: 'Sign up', exact: true }).tap();
  check('onboarding: tapping Sign up reveals the username/password form (#ob1)',
    await page.evaluate(() => document.getElementById('ob1').classList.contains('active') && !document.getElementById('ob0').classList.contains('active')));
  check('onboarding: sign-up form keeps its password show/hide toggles (not removed by the new field)',
    await page.locator('#ob1 .pw-tog').count() === 2);
  check('onboarding: sign-up form offers a way back to the log-in view', await page.locator('#ob1').getByRole('button', { name: 'Log in', exact: true }).isVisible());
  await page.locator('#ob1').getByRole('button', { name: 'Log in', exact: true }).tap();
  check('onboarding: that link actually switches the step back to #ob0',
    await page.evaluate(() => document.getElementById('ob0').classList.contains('active') && !document.getElementById('ob1').classList.contains('active')));
  check('onboarding: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function signupEmailFieldLocal() {
  // Offline (no backend reachable): obNext1() must still validate the optional email
  // client-side before falling into the local-only account path.
  const { page, ctx, errors } = await phone({});
  await dropToOnboarding(page);
  await page.locator('#ob0').getByRole('button', { name: 'Sign up', exact: true }).tap();
  check('sign-up: email field is present with the right id/placeholder',
    await page.locator('#obEmail').getAttribute('placeholder') === 'Email (optional — lets you log in with it too)');

  await page.locator('#obUser').fill('newlifter');
  await page.locator('#obEmail').fill('not-an-email');
  await page.locator('#obPass').fill('correcthorse1');
  await page.locator('#obPass2').fill('correcthorse1');
  await page.locator('#ob1 button[type=submit]').tap();
  check('sign-up: a malformed email blocks Continue with a clear error', /valid email/.test(await toasts(page)), await toasts(page));
  check('sign-up: still on the sign-up step after the email error', await page.evaluate(() => document.getElementById('ob1').classList.contains('active')));

  await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await page.locator('#obEmail').fill('');   // optional -- blank must be allowed through
  await page.locator('#ob1 button[type=submit]').tap();
  await page.waitForTimeout(150);
  check('sign-up: a blank email does not block signing up (it is optional)',
    await page.evaluate(() => document.getElementById('ob2').classList.contains('active')));
  check('sign-up: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// Installs a SUPA stub whose jacked-auth invoke always answers `status`, and records
// every call it received so the test can check what registerAccount actually sent.
async function installRegisterStub(page, status) {
  await page.evaluate((status) => {
    window.__invokes = [];
    SUPA = {
      functions: { invoke: async (name, { body }) => { window.__invokes.push([name, body]); return { data: { status, email: 'uuid-x@users.jacked.example.com' }, error: null }; } },
      auth: { signInWithPassword: async () => ({ data: { session: { user: { id: 'uid-x' } } }, error: null }) },
    };
  }, status);
}

async function signupEmailOnline() {
  const { page, ctx, errors } = await phone({});
  await dropToOnboarding(page);
  await page.locator('#ob0').getByRole('button', { name: 'Sign up', exact: true }).tap();
  await installRegisterStub(page, 'ok');
  await page.locator('#obUser').fill('newlifter');
  await page.locator('#obEmail').fill('newlifter@example.com');
  await page.locator('#obPass').fill('correcthorse1');
  await page.locator('#obPass2').fill('correcthorse1');
  await page.locator('#ob1 button[type=submit]').tap();
  await page.waitForTimeout(150);
  const [name, body] = (await page.evaluate(() => window.__invokes))[0];
  check('sign-up online: the sign-up request carries the typed email through to jacked-auth', name === 'jacked-auth' && body.email === 'newlifter@example.com', JSON.stringify(body));
  check('sign-up online: a successful create advances past the username step', await page.evaluate(() => document.getElementById('ob2').classList.contains('active')));
  check('sign-up online: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // email_taken: the server-side statuses this feature adds must map to a real message,
  // not the generic "Could not create account" catch-all. Fresh page -- ob1 is already
  // the active step on the first one, with no reset path back to the ob0 choice screen.
  const p2 = await phone({});
  await dropToOnboarding(p2.page);
  await p2.page.locator('#ob0').getByRole('button', { name: 'Sign up', exact: true }).tap();
  await installRegisterStub(p2.page, 'email_taken');
  await p2.page.locator('#obUser').fill('otherlifter');
  await p2.page.locator('#obEmail').fill('taken@example.com');
  await p2.page.locator('#obPass').fill('correcthorse1');
  await p2.page.locator('#obPass2').fill('correcthorse1');
  await p2.page.locator('#ob1 button[type=submit]').tap();
  await p2.page.waitForTimeout(150);
  check('sign-up online: email_taken reports the email as the problem, not the username', /email is already in use/.test(await toasts(p2.page)), await toasts(p2.page));
  check('sign-up online (email_taken): no page errors', p2.errors.length === 0, p2.errors.join(' | '));
  await p2.ctx.close();
}

async function installLoginStub(page, { byCode, byEmail }) {
  await page.evaluate(({ byCode, byEmail }) => {
    window.__rpcCalls = [];
    SUPA = {
      rpc: async (fn, args) => {
        window.__rpcCalls.push([fn, args]);
        if (fn === 'account_status') return { data: byCode[args.p_code] || { status: 'not_found' }, error: null };
        if (fn === 'account_status_by_email') return { data: byEmail[args.p_email] || { status: 'not_found' }, error: null };
        return { data: null, error: { message: 'unexpected rpc ' + fn } };
      },
      auth: {
        signInWithPassword: async () => ({ data: { session: { user: { id: 'uid-alice' } } }, error: null }),
        signOut: async () => ({}),
      },
      from: (table) => ({
        select() { return this; }, eq() { return this; },
        maybeSingle: async () => table === 'profile_backups' ? { data: { backup: {} }, error: null } : { data: { code: '@alice', name: 'Alice' }, error: null },
      }),
    };
  }, { byCode, byEmail });
}

async function loginUsernameOrEmail() {
  const STATUSES = {
    byCode: { '@alice': { status: 'claimed', email: 'synthetic-alice@users.jacked.example.com' } },
    // No `email` here (weekly review #13, 2026-10-26): account_status_by_email no longer
    // hands back the sign-in email directly, only the username -- cloudLogin resolves the
    // real email through a second account_status(code) call, same as the username path.
    byEmail: { 'alice@example.com': { status: 'claimed', code: '@alice' } },
  };

  { // Username path: unchanged behaviour, still resolves through account_status(p_code).
    const { page, ctx, errors } = await phone({});
    await installLoginStub(page, STATUSES);
    await page.evaluate(() => { document.getElementById('loginUser').value = '@alice'; document.getElementById('loginPass').value = 'hunter2'; });
    await page.evaluate(() => cloudLogin());
    const calls = await page.evaluate(() => window.__rpcCalls);
    check('login by username: looks it up via account_status(p_code)', calls.some(([fn, a]) => fn === 'account_status' && a.p_code === '@alice'), JSON.stringify(calls));
    const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('jk_prof') || 'null'));
    check('login by username: signs in as the right account (@alice)', prof && prof.code === '@alice' && prof.username === '@alice', JSON.stringify(prof));
    check('login by username: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  { // Email path: same field, same password, resolved via account_status_by_email -> code.
    const { page, ctx, errors } = await phone({});
    await installLoginStub(page, STATUSES);
    await page.evaluate(() => { document.getElementById('loginUser').value = 'alice@example.com'; document.getElementById('loginPass').value = 'hunter2'; });
    await page.evaluate(() => cloudLogin());
    const calls = await page.evaluate(() => window.__rpcCalls);
    // weekly review #13 (2026-10-26): account_status_by_email no longer hands back the
    // sign-in email itself, so the email path now makes a SECOND call, to
    // account_status(code), to resolve it -- same throttle, same round trip the username
    // path already made.
    check('login by email: looks it up via account_status_by_email(p_email)', calls.some(([fn, a]) => fn === 'account_status_by_email' && a.p_email === 'alice@example.com'), JSON.stringify(calls));
    check('login by email: then resolves the real sign-in email via account_status(p_code), not from account_status_by_email directly', calls.some(([fn, a]) => fn === 'account_status' && a.p_code === '@alice'), JSON.stringify(calls));
    const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('jk_prof') || 'null'));
    check('login by email: resolves to the SAME account (@alice), same password', prof && prof.code === '@alice' && prof.username === '@alice', JSON.stringify(prof));
    check('login by email: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  { // An email with no matching account: a distinct, honest message -- not "wrong password".
    const { page, ctx, errors } = await phone({});
    await installLoginStub(page, STATUSES);
    await page.evaluate(() => { document.getElementById('loginUser').value = 'nobody@example.com'; document.getElementById('loginPass').value = 'hunter2'; });
    await page.evaluate(() => cloudLogin());
    check('login by email: an unknown email says so', /No account found with that email/.test(await toasts(page)), await toasts(page));
    check('login by email (unknown): no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  { // Garbage input (neither a valid username nor an email shape) is rejected before any
    // network call -- proves the detection itself, not just the two happy paths.
    const { page, ctx, errors } = await phone({});
    await installLoginStub(page, STATUSES);
    await page.evaluate(() => { document.getElementById('loginUser').value = 'ab'; document.getElementById('loginPass').value = 'hunter2'; });
    await page.evaluate(() => cloudLogin());
    check('login: an input that is neither a valid username nor an email is rejected up front', /Enter a valid username or email/.test(await toasts(page)), await toasts(page));
    check('login: garbage input never reaches the server', (await page.evaluate(() => window.__rpcCalls)).length === 0);
    check('login (garbage input): no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  { // A server-side throttle (weekly review #13/#14) must show a clear message, not the
    // generic "wrong password" a dropped email/undefined status would have produced.
    const { page, ctx, errors } = await phone({});
    await installLoginStub(page, { byCode: {}, byEmail: { 'alice@example.com': { status: 'rate_limited', retry_after: 300 } } });
    await page.evaluate(() => { document.getElementById('loginUser').value = 'alice@example.com'; document.getElementById('loginPass').value = 'hunter2'; });
    await page.evaluate(() => cloudLogin());
    check('login by email: rate_limited from account_status_by_email shows a clear message', /Too many attempts/.test(await page.locator('#loginMsg').textContent()), await page.locator('#loginMsg').textContent());
    check('login (rate limited by email): no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  { // The email path's SECOND call (account_status(code), to resolve the real sign-in
    // email) can itself be the one that's throttled -- must fail the same clear way, not
    // sign in with an undefined email.
    const { page, ctx, errors } = await phone({});
    await installLoginStub(page, { byCode: { '@alice': { status: 'rate_limited', retry_after: 300 } }, byEmail: { 'alice@example.com': { status: 'claimed', code: '@alice' } } });
    await page.evaluate(() => { document.getElementById('loginUser').value = 'alice@example.com'; document.getElementById('loginPass').value = 'hunter2'; });
    await page.evaluate(() => cloudLogin());
    check('login by email: rate_limited on the second (account_status) hop shows the same clear message', /Too many attempts/.test(await page.locator('#loginMsg').textContent()), await page.locator('#loginMsg').textContent());
    const prof2 = await page.evaluate(() => JSON.parse(localStorage.getItem('jk_prof')||'null'));
    check('login by email: never signed in with a missing email (this device stays on its own account)', prof2 && prof2.code !== '@alice', JSON.stringify(prof2));
    check('login (rate limited on second hop): no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}

// Profile -> Account email (Mr. Roni, 2026-10-26: "where is the location for adding your
// email to your account?"). The stub mirrors set_my_email()'s rules from
// supabase/migrations/20261026_set_my_email.sql (PGlite-tested there): trim + lowercase,
// unique case-insensitively against OTHER accounts. Records every rpc so the tests can
// prove a malformed email never reaches the network.
async function installEmailStub(page, { mine, others = [], missing = false }) {
  await page.evaluate(({ mine, others, missing }) => {
    window.__rpcCalls = [];
    window.__email = { mine, others };
    _authUid = 'uid-me';
    SUPA = {
      rpc: async (fn, args) => {
        window.__rpcCalls.push([fn, args]);
        if (missing) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.' + fn } };
        const st = window.__email;
        if (fn === 'my_email') return { data: { status: 'ok', email: st.mine }, error: null };
        if (fn === 'set_my_email') {
          const v = String(args.p_email || '').trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 255) return { data: { status: 'invalid_email' }, error: null };
          if (st.others.includes(v)) return { data: { status: 'email_taken' }, error: null };
          st.mine = v; return { data: { status: 'ok', email: v }, error: null };
        }
        return { data: null, error: { message: 'unexpected rpc ' + fn } };
      },
      auth: { getSession: async () => ({ data: { session: { user: { id: 'uid-me' } } } }), signOut: async () => ({}) },
      from: () => ({ select() { return this; }, eq() { return this; }, in() { return this; }, maybeSingle: async () => ({ data: null, error: null }), then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
    };
  }, { mine, others, missing });
}
const emailVal = page => page.locator('#profEmailVal').textContent();
const clearToasts = page => page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));

async function accountEmail() {
  { // First-time add: an account that signed up with no email (the case he asked about).
    const { page, ctx, errors } = await phone({});
    await installEmailStub(page, { mine: null, others: ['taken@example.com'] });
    await page.evaluate(() => openProf());
    await page.waitForFunction(() => document.getElementById('profEmailVal').textContent !== 'Loading…');
    check('account email: Profile has an Email row in the Account section',
      await page.evaluate(() => { const b = document.getElementById('profEmailBlk'); let n = b; while ((n = n.previousElementSibling)) if (n.classList.contains('blk-t')) return n.textContent === 'Account'; return false; }));
    check('account email: no email on file says so', (await emailVal(page)) === 'No email on file', await emailVal(page));
    check('account email: offers "Add email" when none is on file', (await page.locator('#profEmailBtn').textContent()) === 'Add email' && await page.locator('#profEmailBtn').isVisible());
    await page.locator('#profEmailBtn').tap();
    check('account email: Add email opens an email input', await page.locator('#profEmailIn').isVisible() && (await page.locator('#profEmailIn').getAttribute('type')) === 'email');

    const before = (await page.evaluate(() => window.__rpcCalls.length));
    for (const bad of ['not-an-email', 'a@b', '']) {
      await clearToasts(page);
      await page.locator('#profEmailIn').fill(bad);
      await page.locator('#profEmailSave').tap();
      check(`account email: ${JSON.stringify(bad)} is rejected with a clear message`, /Enter (a valid )?(an )?email address/.test(await toasts(page)), await toasts(page));
    }
    check('account email: malformed/blank emails never reach the network', (await page.evaluate(() => window.__rpcCalls.length)) === before,
      JSON.stringify(await page.evaluate(() => window.__rpcCalls)));

    await clearToasts(page);
    await page.locator('#profEmailIn').fill('Taken@Example.com');
    await page.locator('#profEmailSave').tap();
    await page.waitForTimeout(100);
    check("account email: someone else's email is rejected as already in use (same wording as sign-up)", /That email is already in use on another account/.test(await toasts(page)), await toasts(page));
    check('account email: after email_taken the input stays open with what was typed', await page.locator('#profEmailIn').isVisible() && (await page.locator('#profEmailIn').inputValue()) === 'Taken@Example.com');
    check('account email: email_taken saved nothing', (await page.evaluate(() => window.__email.mine)) === null);

    await clearToasts(page);
    await page.locator('#profEmailIn').fill('  Me@Example.com ');
    await page.locator('#profEmailSave').tap();
    await page.waitForTimeout(100);
    const calls = await page.evaluate(() => window.__rpcCalls.filter(c => c[0] === 'set_my_email'));
    check('account email: saving calls the set_my_email RPC (not supabase.auth)', calls.length === 2 && calls[1][1].p_email === 'Me@Example.com', JSON.stringify(calls));
    check('account email: first-time add confirms "Email added"', /Email added/.test(await toasts(page)), await toasts(page));
    check('account email: the saved email shows in the row (lowercased like sign-up)', (await emailVal(page)) === 'me@example.com', await emailVal(page));
    check('account email: button now says Change', (await page.locator('#profEmailBtn').textContent()) === 'Change');
    check('account email: input closed after save', !(await page.locator('#profEmailIn').isVisible()));
    check('account email (first-time add): no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  { // Change an existing email; reopening Profile re-reads it from the server.
    const { page, ctx, errors } = await phone({});
    await installEmailStub(page, { mine: 'old@example.com', others: [] });
    await page.evaluate(() => openProf());
    await page.waitForFunction(() => document.getElementById('profEmailVal').textContent !== 'Loading…');
    check('account email: shows the current email on file', (await emailVal(page)) === 'old@example.com', await emailVal(page));
    await page.locator('#profEmailBtn').tap();
    check('account email: Change pre-fills the current email', (await page.locator('#profEmailIn').inputValue()) === 'old@example.com');
    await page.locator('#profEmailIn').fill('new@example.com');
    await page.locator('#profEmailIn').press('Enter');
    await page.waitForTimeout(100);
    check('account email: changing confirms "Email updated"', /Email updated/.test(await toasts(page)), await toasts(page));
    await page.evaluate(() => { cm('profModal'); openProf(); });
    await page.waitForFunction(() => document.getElementById('profEmailVal').textContent !== 'Loading…');
    check('account email: reopening Profile shows the changed email from the server', (await emailVal(page)) === 'new@example.com', await emailVal(page));
    await page.locator('#profEmailBtn').tap();
    await page.locator('#profEmailIn').fill('x@y.co');
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().tap();
    check('account email: Cancel closes the input without saving', !(await page.locator('#profEmailIn').isVisible()) && (await page.evaluate(() => window.__email.mine)) === 'new@example.com');
    check('account email (change): no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  { // Not signed in (local-only account): no button, a plain hint instead of a failing call.
    const { page, ctx, errors } = await phone({});
    await page.evaluate(() => openProf());
    check('account email: signed out shows "Sign in to add an email" and no button',
      (await emailVal(page)) === 'Sign in to add an email' && !(await page.locator('#profEmailBtn').isVisible()), await emailVal(page));
    check('account email (signed out): no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  { // Server not migrated yet (RPC missing): a clear note, not a generic failure or a crash.
    const { page, ctx, errors } = await phone({});
    await installEmailStub(page, { mine: null, missing: true });
    await page.evaluate(() => openProf());
    await page.waitForFunction(() => document.getElementById('profEmailVal').textContent !== 'Loading…');
    check('account email: missing RPC shows "not switched on yet"', /isn't switched on yet/.test(await emailVal(page)), await emailVal(page));
    check('account email (rpc missing): no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}

export const AUTH_FLOW_SUITES = [onboardingChoice, signupEmailFieldLocal, signupEmailOnline, loginUsernameOrEmail, accountEmail];
