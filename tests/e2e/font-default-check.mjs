// font-default-check.mjs -- standing-questions 2026-10-20 item 11 verification (queue
// "Jacked mockups didn't look like the app", "JK_FONTS"): confirms real fonts load by
// DEFAULT now, with no env flags at all, by reading the actual computed font-family off a
// live page -- not just reading the source diff.
//   JK_PORT=18799 node tests/e2e/font-default-check.mjs
import { startServer, stopServer, launch, close, phone } from './harness.mjs';

await startServer();
await launch();
const { page, ctx } = await phone({ seed: {} });
// getComputedStyle().fontFamily reports the CSS-SPECIFIED stack regardless of whether the
// font actually loaded, so it can't tell "blocked" from "loaded" -- it printed the same
// "'DM Sans', sans-serif" in both cases on a first pass at this check (caught before this
// was shipped as a verification). document.fonts (the real Font Loading API) is what
// actually reflects whether the DM Sans FontFace loaded, so that's the real signal here.
await page.evaluate(() => document.fonts.ready);
const loadedFamilies = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family));
await ctx.close();
await close();
stopServer();

console.log(JSON.stringify({ loadedFontFamilies: loadedFamilies }));
const usesRealFont = loadedFamilies.some((f) => /DM Sans/i.test(f));
console.log(usesRealFont
  ? 'PASS: the real "DM Sans" FontFace actually loaded with NO env flags set -- real fonts load by default'
  : `FAIL: "DM Sans" never loaded (loaded families: ${JSON.stringify(loadedFamilies)}) -- default did not flip`);
process.exit(usesRealFont ? 0 : 1);
