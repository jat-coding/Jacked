// Screenshot the LOCAL PWA (python http.server over jacked-pwa/) logged in as the THROWAWAY
// iOS test account. Live Supabase, same account as the simulator, so both sides show the same data.
// node pwa_shot.mjs <out.png> [day:YYYY-MM-DD|workout:0|routines|lib|libq:<search>|exinfo:<exId>|active:<exId>=<lb>x<reps>,...;<exId>=...]
// friends | friends:<cmp>|<month|all> | friend:<code|me>[/<workout index>[/copy]|/badges] | metrics (full page) | recap:YYYY-MM | ach (achievements page) | badge:<name> (one badge's page)
// gymyears | gymyears:<code>: the Gym years page (yours, or that person's).
// prof | profbody: My Profile (Profile tab / Body Metrics tab); prints the saved name, rest, sex and birthday.
// sugstart:<label|pick>: taps Start on that Suggested today row (never finished, never saved).
// active: starts an empty workout and logs those sets through uSet/togSet (never finished, never saved).
import { createRequire } from 'module'; import { spawn } from 'child_process'; import fs from 'fs';
const require = createRequire('/home/roni/agent/projects/Jacked/tests/e2e/');
const { chromium } = require('playwright');
const acct = JSON.parse(fs.readFileSync('/home/roni/agent/config/jacked-ios-dev-test-account.json'));
const PORT = 8791, out = process.argv[2], open = process.argv[3] || '';
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', '/home/roni/agent/projects/Jacked/jacked-pwa'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const b = await chromium.launch({ executablePath: process.env.PW_EXE || chromium.executablePath(), args: ['--no-sandbox'] });
try {
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: 'America/Denver', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.waitForSelector('#loginUser', { state: 'visible', timeout: 15000 });
  await p.fill('#loginUser', '@' + acct.username); await p.fill('#loginPass', acct.password);
  await p.click('#ob0 button[type=submit]');
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem('jk_hist') || '[]')).length > 0, null, { timeout: 20000 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { document.querySelectorAll('.modal.open,.mo.open').forEach(m => m.classList.remove('open')); });
  if (open.startsWith('day:')) await p.evaluate(d => openDay(d), open.slice(4));
  if (open.startsWith('workout:')) await p.evaluate(i => { const h = gH(); openWD(h[h.length - 1 - i].id); }, +open.slice(8));
  if (open === 'routines') { await p.evaluate(() => sp('routines')); await p.waitForTimeout(1500); }
  if (open === 'lib' || open.startsWith('exinfo:') || open.startsWith('libq:')) { await p.evaluate(() => sp('exercises')); await p.waitForTimeout(2500); }
  if (open.startsWith('libq:')) await p.evaluate(q => { document.getElementById('exSearch').value = q; renderEx(); }, open.slice(5));
  if (open.startsWith('exinfo:')) await p.evaluate(id => openExInfo(id), open.slice(7));
  if (open.startsWith('active:')) await p.evaluate(script => {
    startEmpty();
    for (const part of script.split(';')) {
      const [id, sets] = part.split('='); const ex = byId(id);
      aw.exercises.push({ exId: id, name: ex.name, muscle: ex.muscle || '', equip: ex.equip || '', assist: ex.assist || false,
        tracking: ex.tracking || 'weight_reps', imgUrl: imgUrl(ex) || null, sets: seedSets(id) });
      const ei = aw.exercises.length - 1;
      sets.split(',').forEach((st, si) => { const [w, r] = st.split('x');
        while (aw.exercises[ei].sets.length <= si) addSet(ei);
        const t = aw.exercises[ei].tracking;
        if (+w > 0) uSet(ei, si, 'weight', w, t === 'duration' ? 'dur' : t === 'distance' ? false : true);
        uSet(ei, si, 'reps', r, t === 'distance' ? 'clock' : undefined); togSet(ei, si); });
    }
    renderWS();
  }, open.slice(7));
  if (open === 'metrics' || open.startsWith('recap:')) { await p.evaluate(() => sp('metrics')); await p.waitForTimeout(1500); }
  if (open.startsWith('recap:')) await p.evaluate(k => openRecap(+k.slice(0, 4), +k.slice(5, 7) - 1), open.slice(6));
  if (open === 'ach' || open.startsWith('badge:')) { await p.evaluate(() => sp('metrics')); await p.waitForTimeout(1500); await p.evaluate(() => openAch()); }
  if (open.startsWith('badge:')) await p.evaluate(n => badgeInfo(n), open.slice(6));
  if (open === 'ach' || open.startsWith('badge:')) console.log(JSON.stringify(await p.evaluate(() => computeBadges().map(b => [b.name, !!b.earned, b.tier || null, String(b.desc).replace(/<[^>]*>/g, '')]))));
  if (open.startsWith('friends') || open.startsWith('friend:')) { await p.evaluate(() => sp('leaderboard')); await p.waitForTimeout(3500); }
  if (open.startsWith('friends:')) { const [k, r] = open.slice(8).split('|'); await p.evaluate(([k, r]) => { cmpM = k; if (r) cmpRange = r; renderLB(); }, [k, r]); }
  if (open.startsWith('friend:')) await p.evaluate(o => { const [c, sub] = o.split('/'); openFriend(c === 'me' ? gProf().code : c);
    if (sub === 'badges') showFriendBadges(c === 'me' ? gProf().code : c); else if (sub) openFriendWorkout(c, +sub);
    if (o.endsWith('/copy')) copyFriendWorkout(c, +sub); }, open.slice(7));
  if (open === 'gymyears') await p.evaluate(() => openGymYears());
  if (open.startsWith('gymyears:')) { await p.evaluate(() => sp('leaderboard')); await p.waitForTimeout(3500); await p.evaluate(c => openGymYears(c), open.slice(9)); }
  if (open.startsWith('sugstart:')) console.log(await p.evaluate(l => { if (l === 'pick') { const c = todaysCuratedPick(dayKey(new Date())); startCuratedRoutine(c.pi, c.ri); } else startGroupWorkout(l);
    return aw.name + ': ' + aw.exercises.map(e => e.name).join(', '); }, open.slice(9)));
  if (open === 'prof' || open === 'profbody') console.log(await p.evaluate(b => { openProf(); if (b) switchProfTab(document.querySelector('#profTabTog [data-v=body]'));
    return JSON.stringify({ name: profName.value, rest: setRest.value, sex: segVal('setSexTog'), birthday: profBirthday.value, age: profAgeReadout.textContent }); }, open === 'profbody'));
  await p.waitForTimeout(800);
  if (open === 'home') console.log(await p.evaluate(() => document.getElementById('suggestCard').innerText.replace(/\s*\n\s*/g, ' | ')));
  await p.screenshot({ path: out, fullPage: open === 'metrics' || open === 'home' });
  console.log(out, await p.evaluate(() => JSON.parse(localStorage.getItem('jk_hist')).length + ' workouts'));
} finally { await b.close(); srv.kill(); }
