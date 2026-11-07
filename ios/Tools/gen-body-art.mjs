// Writes ios/Jacked/Data/BodyArt.swift from the PWA's OWN BODY_ART, FRONT_SLUG_TO_GROUP and
// BACK_SLUG_TO_GROUP in jacked-pwa/index.html (no hand copy): the Muscle Map's front/back figure.
// Every SVG path is normalised to absolute M / L / C / Z only (relative commands resolved, H/V to
// L, S/Q/T to cubics, arcs to cubics) so the Swift side only needs a four-command reader.
//   node ios/Tools/gen-body-art.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '../../jacked-pwa/index.html'), 'utf8');
const lineOf = name => { const m = html.match(new RegExp(`^const ${name}=(.*);\\s*$`, 'm')); if (!m) throw new Error('not found ' + name); return m[1]; };
const ART = JSON.parse(lineOf('BODY_ART'));
const FRONT = Function('return ' + lineOf('FRONT_SLUG_TO_GROUP'))(), BACK = Function('return ' + lineOf('BACK_SLUG_TO_GROUP'))();

function tokens(d) {
  const out = []; const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g; let m;
  // arc flags can be packed with no separator ("a1 1 0 01 2 3"): read them one char at a time below
  while ((m = re.exec(d))) out.push(m[1] || +m[2]);
  return out;
}
// Arc flags packed against the next number ("011.5") break a generic number scan, so arcs re-scan raw text.
function parse(d) {
  const segs = []; const re = /[MmLlHhVvCcSsQqTtAaZz]/g; let idx = [], m;
  while ((m = re.exec(d))) idx.push(m.index); idx.push(d.length);
  for (let i = 0; i < idx.length - 1; i++) {
    const cmd = d[idx[i]], body = d.slice(idx[i] + 1, idx[i + 1]);
    if (/[Aa]/.test(cmd)) {
      const nums = []; let s = body, pos = 0, k = 0;
      const num = /^[\s,]*(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/, flag = /^[\s,]*([01])/;
      while (true) {
        const isFlag = k % 7 === 3 || k % 7 === 4; const r = (isFlag ? flag : num).exec(s.slice(pos));
        if (!r) break; nums.push(+r[1]); pos += r[0].length; k++;
      }
      segs.push([cmd, nums]);
    } else segs.push([cmd, tokens(body).filter(x => typeof x === 'number')]);
  }
  return segs;
}
function arcToCubics(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  const rad = phi * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  let lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den)); if (fa === fs) co = -co;
  const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  let t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry), dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2))), step = dt / n, out = [];
  const k = 4 / 3 * Math.tan(step / 4);
  const pt = (t) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const dv = (t) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * step, b = a + step, [ax, ay] = pt(a), [bx, by] = pt(b), [dax, day] = dv(a), [dbx, dby] = dv(b);
    out.push([ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
  }
  out[out.length - 1][4] = x2; out[out.length - 1][5] = y2;
  return out;
}
function normalise(d) {
  const out = []; let x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null, prev = '';
  const f = v => +v.toFixed(2);
  for (const [cmd, a] of parse(d)) {
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }[C];
    if (C === 'Z') { out.push('Z'); x = sx; y = sy; lc = lq = null; prev = 'Z'; continue; }
    for (let i = 0; i + arity <= a.length; i += arity) {
      const p = a.slice(i, i + arity); const ox = rel ? x : 0, oy = rel ? y : 0;
      let c = C; if (C === 'M' && i > 0) c = 'L';
      if (c === 'M') { x = p[0] + ox; y = p[1] + oy; sx = x; sy = y; out.push(`M${f(x)} ${f(y)}`); lc = lq = null; }
      else if (c === 'L' || c === 'H' || c === 'V') {
        if (c === 'L') { x = p[0] + ox; y = p[1] + oy; } else if (c === 'H') x = p[0] + (rel ? x : 0); else y = p[0] + (rel ? y : 0);
        out.push(`L${f(x)} ${f(y)}`); lc = lq = null;
      } else if (c === 'C' || c === 'S') {
        let x1, y1, x2, y2, ex, ey;
        if (c === 'C') { [x1, y1, x2, y2, ex, ey] = [p[0] + ox, p[1] + oy, p[2] + ox, p[3] + oy, p[4] + ox, p[5] + oy]; }
        else { [x1, y1] = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y]; [x2, y2, ex, ey] = [p[0] + ox, p[1] + oy, p[2] + ox, p[3] + oy]; }
        out.push(`C${f(x1)} ${f(y1)} ${f(x2)} ${f(y2)} ${f(ex)} ${f(ey)}`); lc = [x2, y2]; lq = null; x = ex; y = ey;
      } else if (c === 'Q' || c === 'T') {
        let qx, qy, ex, ey;
        if (c === 'Q') { [qx, qy, ex, ey] = [p[0] + ox, p[1] + oy, p[2] + ox, p[3] + oy]; }
        else { [qx, qy] = lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y]; [ex, ey] = [p[0] + ox, p[1] + oy]; }
        const x1 = x + 2 / 3 * (qx - x), y1 = y + 2 / 3 * (qy - y), x2 = ex + 2 / 3 * (qx - ex), y2 = ey + 2 / 3 * (qy - ey);
        out.push(`C${f(x1)} ${f(y1)} ${f(x2)} ${f(y2)} ${f(ex)} ${f(ey)}`); lq = [qx, qy]; lc = null; x = ex; y = ey;
      } else if (c === 'A') {
        const ex = p[5] + ox, ey = p[6] + oy;
        for (const cc of arcToCubics(x, y, p[0], p[1], p[2], p[3], p[4], ex, ey)) out.push('C' + cc.map(f).join(' '));
        x = ex; y = ey; lc = lq = null;
      }
    }
  }
  return out.join('');
}
const sw = s => JSON.stringify(s);
let o = `// GENERATED by ios/Tools/gen-body-art.mjs from jacked-pwa/index.html (BODY_ART, FRONT_SLUG_TO_GROUP,
// BACK_SLUG_TO_GROUP). Do not edit by hand: re-run the generator. Paths are absolute M/L/C/Z only.
enum BodyArt {
    static let frontSlugToGroup: [String: String] = [${Object.entries(FRONT).map(([k, v]) => `${sw(k)}: ${sw(v)}`).join(', ')}]
    static let backSlugToGroup: [String: String] = [${Object.entries(BACK).map(([k, v]) => `${sw(k)}: ${sw(v)}`).join(', ')}]
    /// figure key -> [(slug, [path])], in the PWA's own draw order.
    static let regions: [String: [(String, [String])]] = [
`;
for (const k of ['frontMale', 'frontFemale', 'backMale', 'backFemale'])
  o += `        ${sw(k)}: [\n` + Object.entries(ART[k]).map(([slug, ps]) => `            (${sw(slug)}, [${ps.map(p => sw(normalise(p))).join(', ')}])`).join(',\n') + `],\n`;
o += `    ]\n    /// outline key -> (viewBox x, y, w, h, path)\n    static let outlines: [String: (Double, Double, Double, Double, String)] = [\n`;
o += Object.entries(ART.outlines).map(([k, v]) => { const [a, b, c, d] = v.viewBox.split(/\s+/).map(Number); return `        ${sw(k)}: (${a}, ${b}, ${c}, ${d}, ${sw(normalise(v.d))})`; }).join(',\n') + `\n    ]\n}\n`;
fs.writeFileSync(path.join(here, '../Jacked/Data/BodyArt.swift'), o);
// Self-check file for the desktop: each normalised path next to its original, rendered by Chromium.
fs.writeFileSync('/tmp/bodyart/check.json', JSON.stringify({ ART, norm: Object.fromEntries(['frontMale', 'backMale', 'frontFemale', 'backFemale'].map(k => [k, Object.fromEntries(Object.entries(ART[k]).map(([s, ps]) => [s, ps.map(normalise)]))])), onorm: Object.fromEntries(Object.entries(ART.outlines).map(([k, v]) => [k, normalise(v.d)])) }));
console.log('wrote BodyArt.swift', o.length);
