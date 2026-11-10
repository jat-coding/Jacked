#!/usr/bin/env python3
"""Generate Assets.xcassets/ic-*.imageset (template-rendered SVG) from the PWA's own icons:
_ICON (index.html ~1467), the five tab icons (~648-661) and the inline close/check/play/eye icons.
   Tools/gen-icons.py ../jacked-pwa/index.html"""
import re, os, sys, json
src = open(sys.argv[1]).read()
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Jacked/Assets.xcassets")
i = src.index("const _ICON"); j = src.index("};\nfunction exIcon")
icons = {m.group(1): m.group(2).replace("'", '"') for m in re.finditer(r"^\s{2}(\w+):`(.*)`,?\s*$", src[i:j], re.M)}
assert len(icons) == 34, len(icons)
def svg(body, sw=2, fill="none", cap=True):
    extra = ' stroke-linecap="round" stroke-linejoin="round"' if cap else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="{fill}" stroke="#000" stroke-width="{sw}"{extra}>{body}</svg>\n'
out = {f"ic-{k}": svg(v) for k, v in icons.items()}
# tab icons: .nb svg stroke-width 1.8 (Routines/Home/Metrics use butt caps in the PWA, Library/Friends round)
tabs = {
 "tab-routines": ('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>', False),
 "tab-library": ('<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>', True),
 "tab-home": ('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', False),
 "tab-metrics": ('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>', False),
 "tab-friends": ('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', True),
}
for k, (b, cap) in tabs.items(): out[f"ic-{k}"] = svg(b, 1.8, cap=cap)
out["ic-close"] = svg('<path d="M6 6l12 12M18 6L6 18"/>', 2.6, cap=False).replace('stroke-width="2.6"', 'stroke-width="2.6" stroke-linecap="round"')
out["ic-check"] = svg('<path d="M5 12l5 5l10 -10"/>', 3.2)
out["ic-tick"] = svg('<polyline points="20 6 9 17 4 12"/>', 2.5, cap=False)
out["ic-play"] = svg('<path d="M8 5v14l11-7z"/>', 0, fill="#000").replace('stroke-width="0"', 'stroke="none"').replace('stroke="#000" stroke="none"', 'stroke="none"')
out["ic-eye"] = svg('<path d="M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"/>')
m = re.search(r'<svg viewBox="0 0 24 24" width="18" height="18"[^>]*><path d="M10\.585 10\.587.*?</svg>', src, re.S)
body = re.search(r"<svg[^>]*>(.*)</svg>", m.group(0), re.S).group(1)
out["ic-eyeoff"] = svg(body)
out["ic-search"] = svg('<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/>')
out["ic-grip"] = svg("".join(f'<circle cx="{x}" cy="{y}" r="1.7"/>' for x in (9, 15) for y in (6, 12, 18)), 0, fill="#000").replace('stroke="#000" stroke-width="0"', 'stroke="none"')
out["ic-starfill"] = svg('<path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245"/>', 1, fill="#000", cap=False)
for name, s in out.items():
    d = os.path.join(root, name + ".imageset"); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, name + ".svg"), "w").write(s)
    json.dump({"images": [{"filename": name + ".svg", "idiom": "universal"}],
               "info": {"author": "xcode", "version": 1},
               "properties": {"preserves-vector-representation": True, "template-rendering-intent": "template"}},
              open(os.path.join(d, "Contents.json"), "w"), indent=2)
print(len(out), "icons")
