// Exercise photos + exercises.json moved off raw.githubusercontent.com onto the app's own
// public Supabase bucket (tasks/2026-11-03-exercise-photos-off-github.md). Real network,
// real mirror: the photos must actually decode (naturalWidth > 0), not just carry a src.
import { phone, check, wk } from './harness.mjs';

const MIRROR = 'https://qehlrwnumrjktujidabz.supabase.co/storage/v1/object/public/exercise-images/';
const LEGACY = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const SHOTS = process.env.JK_PHOTO_SHOTS || '';

const imgState = sel => [...document.querySelectorAll(sel)].map(i => ({ src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight, ok: i.complete && i.naturalWidth > 0 }));
async function settle(page, sel) {
  await page.waitForFunction(s => { const a = [...document.querySelectorAll(s)]; return a.length && a.every(i => i.complete); }, sel, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(200);
}

async function exercisePhotosMirror() {
  // A workout saved before the move carries the full old GitHub URL in imgUrl (jk_hist).
  const hist = [wk('2026-11-01', [{ name: 'Barbell Squat', exId: 'Barbell_Squat', muscle: 'quadriceps', tracking: 'weight_reps', imgUrl: LEGACY + 'Barbell_Squat/0.jpg', sets: [{ weight: 100, reps: 5, done: true }] }])];
  const { page, ctx, errors } = await phone({ seed: { hist } });
  const gh = [];
  page.on('request', r => { if (/githubusercontent|github\.com/.test(r.url())) gh.push(r.url()); });
  await page.waitForFunction(() => dbLoaded, null, { timeout: 20000 });
  check('photo mirror: exercise DB loaded from the mirror (643 after the app stretch filter)', await page.evaluate(() => allDB.length > 600 && DB_URL.startsWith(IMG_BASE)), String(await page.evaluate(() => allDB.length)));
  check('photo mirror: IMG_BASE is the Supabase bucket', await page.evaluate(m => IMG_BASE === m, MIRROR));

  // Library tab: real rows, photos decode from the mirror.
  await page.evaluate(() => { sp('exercises'); document.getElementById('exSearch').value = 'barbell'; renderEx(); });
  await settle(page, '#exList img');
  const lib = (await page.evaluate(imgState, '#exList img')).slice(0, 12);
  check('photo mirror: library photos load from the mirror', lib.length >= 5 && lib.every(i => i.ok && i.src.startsWith(MIRROR)), JSON.stringify(lib.slice(0, 3)));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/library.png' });

  // Add-Exercise picker.
  await page.evaluate(() => { openAEModal('workout'); const s = document.getElementById('aeSearch'); if (s) { s.value = 'dumbbell curl'; } renderAEList(); });
  await settle(page, '#aeList img');
  const ae = (await page.evaluate(imgState, '#aeList img')).slice(0, 12);
  check('photo mirror: add-exercise picker photos load from the mirror', ae.length >= 3 && ae.every(i => i.ok && i.src.startsWith(MIRROR)), JSON.stringify(ae.slice(0, 3)));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/picker.png' });
  await page.evaluate(() => cm('aeModal'));

  // Exercise detail: both start/end frames, resized to <=600px.
  for (const id of ['Barbell_Squat', 'Dumbbell_Bicep_Curl', 'Pullups']) {
    await page.evaluate(i => openExInfo(i), id);
    await settle(page, '#exInfoContent img');
    const d = await page.evaluate(imgState, '#exInfoContent img');
    check(`photo mirror: ${id} detail shows both frames from the mirror, <=600px`, d.length === 2 && d.every(i => i.ok && i.src.startsWith(MIRROR) && Math.max(i.w, i.h) <= 600), JSON.stringify(d));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/detail-${id}.png` });
    await page.evaluate(() => cm('exInfoModal'));
  }

  // The pre-move saved workout still shows its photo, now served from the mirror.
  await page.evaluate(() => sp('home'));
  await settle(page, '#recentW img');
  const rec = await page.evaluate(imgState, '#recentW img');
  check('photo mirror: a workout saved with the old GitHub imgUrl renders from the mirror', rec.length === 1 && rec[0].ok && rec[0].src === MIRROR + 'Barbell_Squat/0.jpg', JSON.stringify(rec));
  check('photo mirror: the stored history itself is untouched (render-time rewrite only)', await page.evaluate(l => JSON.parse(localStorage.getItem('jk_hist'))[0].exercises[0].imgUrl === l + 'Barbell_Squat/0.jpg', LEGACY));
  check('photo mirror: zero requests to GitHub at runtime', gh.length === 0, gh.slice(0, 3).join(' '));
  check('exercisePhotosMirror: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

export const EXERCISE_PHOTO_SUITES = [exercisePhotosMirror];
