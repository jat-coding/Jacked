// Edit-survives check (Fable review 2026-11-07): the web app, signed in to the THROWAWAY test account and holding
// its own local copy, waits while the iPhone edits workout <id>; then, without reloading, finishes a workout (its
// own syncBackup from the stale copy) and prints what it holds for <id> before and after.
//   node lrev-retest.mjs <workout id> <dir>   (touch <dir>/go once the iPhone edit has landed)
import { createRequire } from 'module'; import { spawn } from 'child_process'; import fs from 'fs';
const require = createRequire('/home/roni/agent/projects/Jacked/tests/e2e/');
const { chromium } = require('playwright');
const acct = JSON.parse(fs.readFileSync('/home/roni/agent/config/jacked-ios-dev-test-account.json'));
if (!acct.username.startsWith('ios_dev_test_')) throw new Error('refusing: not the test account');
const [wid, dir] = process.argv.slice(2), PORT = 8792;
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', '/home/roni/agent/projects/Jacked/jacked-pwa'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const b = await chromium.launch({ executablePath: process.env.PW_EXE || chromium.executablePath(), args: ['--no-sandbox'] });
const look = p => p.evaluate(id => { const w = JSON.parse(localStorage.getItem('jk_hist') || '[]').find(x => x.id === id);
  return w && { lrev: w.lrev, set0: w.exercises[0].sets[0], n: JSON.parse(localStorage.getItem('jk_hist')).length }; }, wid);
try {
  const p = await (await b.newContext({ viewport: { width: 393, height: 852 }, timezoneId: 'America/Denver', serviceWorkers: 'block' })).newPage();
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.waitForSelector('#loginUser', { state: 'visible', timeout: 15000 });
  await p.fill('#loginUser', '@' + acct.username); await p.fill('#loginPass', acct.password);
  await p.click('#ob0 button[type=submit]');
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem('jk_hist') || '[]')).length > 0, null, { timeout: 20000 });
  await p.waitForTimeout(3000);
  console.log('web local copy at start:', JSON.stringify(await look(p)));
  fs.writeFileSync(dir + '/ready', '1');
  for (let i = 0; i < 400 && !fs.existsSync(dir + '/go'); i++) await p.waitForTimeout(1000);
  console.log('web local copy just before its finish:', JSON.stringify(await look(p)));
  await p.evaluate(() => { startEmpty(); const id = 'Hammer_Curls', ex = byId(id);
    aw.exercises.push({ exId: id, name: ex.name, muscle: ex.muscle || '', equip: ex.equip || '', assist: false, tracking: 'weight_reps', imgUrl: null, sets: seedSets(id) });
    uSet(0, 0, 'weight', '20', true); uSet(0, 0, 'reps', '10'); togSet(0, 0); finishW(true); });
  await p.waitForTimeout(10000);
  console.log('web local copy after its finish + save:', JSON.stringify(await look(p)));
  await p.screenshot({ path: dir + '/web-after.png' });
} finally { await b.close(); srv.kill(); }
