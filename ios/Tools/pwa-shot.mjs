// Screenshot the LOCAL PWA (python http.server over jacked-pwa/) logged in as the THROWAWAY
// iOS test account. Live Supabase, same account as the simulator, so both sides show the same data.
// node pwa_shot.mjs <out.png> [day:YYYY-MM-DD|workout:0|active:<exId>=<lb>x<reps>,...;<exId>=...]
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
  await p.waitForTimeout(800);
  await p.screenshot({ path: out });
  console.log(out, await p.evaluate(() => JSON.parse(localStorage.getItem('jk_hist')).length + ' workouts'));
} finally { await b.close(); srv.kill(); }
