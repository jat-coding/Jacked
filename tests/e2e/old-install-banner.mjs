// Old-install banner (2026-10-24): a home-screen icon added before the opaque-status-bar fix
// shipped (be72c87, 2026-10-24) still carries the old black-translucent config forever -- iOS
// only reads that meta at Add to Home Screen time -- and still shows the unpainted bottom strip.
// Real hardware can't be driven from here, so this reuses the exact spoof standalone-gap.mjs
// already uses to simulate that strip: navigator.standalone=true plus a screen reading taller
// than innerHeight by a status-bar-sized amount. This suite checks the banner appears only in
// that case, says the right thing, and that nothing else on screen moved -- plus that an ordinary
// browser tab, and a standalone app with no gap, never show it.
import { phone, check } from './harness.mjs';

const GAPPY_SCREEN = { w: 390, h: 844 + 59 };
const spoofStandalone = ({ w, h }) => {
  Object.defineProperty(navigator, 'standalone', { get: () => true, configurable: true });
  Object.defineProperty(screen, 'width', { get: () => w, configurable: true });
  Object.defineProperty(screen, 'height', { get: () => h, configurable: true });
};
const spoofStandaloneNoGap = () => {
  Object.defineProperty(navigator, 'standalone', { get: () => true, configurable: true });
};
const booted = page => page.waitForFunction(() => document.querySelector('nav') && document.querySelector('nav').style.display === 'flex');
const banner = page => page.evaluate(() => {
  const el = document.getElementById('jkOldInstallBanner');
  return el ? { visible: !!el.isConnected, text: el.textContent } : null;
});

async function oldInstallBannerShowsWhenGapped() {
  const { page, ctx, errors } = await phone({});
  await ctx.addInitScript(spoofStandalone, GAPPY_SCREEN);
  await page.reload(); await booted(page);
  const b = await banner(page);
  check('old-install-banner: shows when standalone + screen reads taller than innerHeight', !!b && b.visible, JSON.stringify(b));
  check('old-install-banner: tells the user to delete and re-add the icon', !!b && /Home Screen/i.test(b.text) && /Add to Home Screen/i.test(b.text), JSON.stringify(b));
  const nav = await page.evaluate(() => Math.round(document.querySelector('nav').getBoundingClientRect().bottom));
  const ih = await page.evaluate(() => innerHeight);
  check('old-install-banner: nav is untouched (still 8px above viewport bottom)', nav === ih - 8, `nav=${nav} ih=${ih}`);
  check('old-install-banner: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function oldInstallBannerHiddenWhenFixed() {
  const { page, ctx, errors } = await phone({});
  await ctx.addInitScript(spoofStandaloneNoGap);
  await page.reload(); await booted(page);
  const b = await banner(page);
  check('old-install-banner: hidden in standalone with no gap (screen == innerHeight)', b === null, JSON.stringify(b));
  check('old-install-banner (fixed case): no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function oldInstallBannerHiddenInBrowserTab() {
  const { page, ctx, errors } = await phone({});
  await page.reload(); await booted(page);
  const b = await banner(page);
  check('old-install-banner: never shown in an ordinary browser tab', b === null, JSON.stringify(b));
  check('old-install-banner (browser tab): no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function oldInstallBannerDismissStaysForSession() {
  const { page, ctx, errors } = await phone({});
  await ctx.addInitScript(spoofStandalone, GAPPY_SCREEN);
  await page.reload(); await booted(page);
  check('old-install-banner: present before dismiss', !!(await banner(page)));
  await page.evaluate(() => document.querySelector('#jkOldInstallBanner button').click());
  check('old-install-banner: gone right after dismiss', (await banner(page)) === null);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  check('old-install-banner: stays gone on resize within the same session', (await banner(page)) === null);
  check('old-install-banner (dismiss): no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

export const OLD_INSTALL_BANNER_SUITES = [oldInstallBannerShowsWhenGapped, oldInstallBannerHiddenWhenFixed, oldInstallBannerHiddenInBrowserTab, oldInstallBannerDismissStaysForSession];
