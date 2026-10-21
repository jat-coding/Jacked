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
  check('onboarding: choice screen (#ob0) is what shows first, not the sign-up form',
    await page.evaluate(() => document.getElementById('ob0').classList.contains('active') && !document.getElementById('ob1').classList.contains('active')));
  check('onboarding: sign-up form is not visible yet', !(await page.locator('#ob1').isVisible()));
  check('onboarding: choice screen offers Sign up and Log in', await page.locator('#ob0').getByRole('button', { name: 'Sign up' }).isVisible()
    && await page.locator('#ob0').getByRole('button', { name: 'Log in' }).isVisible());

  await page.locator('#ob0').getByRole('button', { name: 'Sign up', exact: true }).tap();
  check('onboarding: tapping Sign up reveals the username/password form (#ob1)',
    await page.evaluate(() => document.getElementById('ob1').classList.contains('active') && !document.getElementById('ob0').classList.contains('active')));
  check('onboarding: sign-up form keeps its password show/hide toggles (not removed by the new field)',
    await page.locator('#ob1 .pw-tog').count() === 2);
  check('onboarding: Back on the sign-up form returns to the choice screen', await page.locator('#ob1').getByRole('button', { name: '‹ Back' }).isVisible());
  await page.locator('#ob1').getByRole('button', { name: '‹ Back' }).tap();
  check('onboarding: Back actually switches the step back to #ob0',
    await page.evaluate(() => document.getElementById('ob0').classList.contains('active') && !document.getElementById('ob1').classList.contains('active')));

  await page.locator('#ob0').getByRole('button', { name: 'Log in', exact: true }).tap();
  check('onboarding: Log in opens the existing #loginModal (not a rebuilt form)', await page.locator('#loginModal').evaluate(el => el.classList.contains('open')));
  check('onboarding: login modal still asks for "Username or email"', (await page.locator('#loginModal label').first().textContent()) === 'Username or email');
  check('onboarding: login form keeps its password show/hide toggle', await page.locator('#loginModal .pw-tog').count() === 1);
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
    byEmail: { 'alice@example.com': { status: 'claimed', email: 'synthetic-alice@users.jacked.example.com', code: '@alice' } },
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
    check('login by email: looks it up via account_status_by_email(p_email), not account_status', calls.some(([fn, a]) => fn === 'account_status_by_email' && a.p_email === 'alice@example.com')
      && !calls.some(([fn]) => fn === 'account_status'), JSON.stringify(calls));
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
}

export const AUTH_FLOW_SUITES = [onboardingChoice, signupEmailFieldLocal, signupEmailOnline, loginUsernameOrEmail];
