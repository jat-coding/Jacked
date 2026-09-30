// Screenshots of the Profile modal's folder tabs (his pick, 2026-09-29), one per tab at 390x844.
// Run: JK_PORT=8799 JK_FONTS=1 PW=... node tests/e2e/shot-profile-tabs.mjs <outdir>
import { startServer, stopServer, launch, close, phone } from './harness.mjs';
import fs from 'fs';
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
await startServer(); await launch();
const seed = { prof: { name: 'Jat', username: '@jat', code: '@jat', sex: 'male', birthday: '2000-07-10' }, bw: 229 / 2.20462, settings: { wUnit: 'lb' } };
const errs = [];
for (const tab of ['main', 'body']) {
  const { page, ctx, errors } = await phone({ seed, now: new Date('2026-09-30T12:00:00-06:00') });
  await page.evaluate(() => openProf()); await page.waitForTimeout(400);
  if (tab === 'body') await page.locator('#profTabTog button[data-v=body]').click();
  await page.waitForTimeout(200);
  await page.evaluate(() => { const md = document.querySelector('#profModal .md'); md.scrollTop = document.getElementById('profTabs').offsetTop - 250; });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/profile-tabs-${tab === 'main' ? 'profile' : 'body'}.png` });
  errs.push(...errors.map(e => `${tab}: ${e}`)); await ctx.close();
}
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no page errors');
await close(); stopServer();
