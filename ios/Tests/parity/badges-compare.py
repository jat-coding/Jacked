#!/usr/bin/env python3
"""Compare badges-fixtures.json expected vs badges-swift-out.json: badge by badge, plus the ladders
and the jk_monthBadges record computeBadges writes."""
import json, sys, os
d = sys.argv[1] if len(sys.argv) > 1 else "."
exp = json.load(open(os.path.join(d, "badges-fixtures.json")))
got = {o["name"]: o["got"] for o in json.load(open(os.path.join(d, "badges-swift-out.json")))}
def norm(v):
    if isinstance(v, dict): return {k: norm(x) for k, x in v.items()}
    if isinstance(v, list): return [norm(x) for x in v]
    if isinstance(v, bool) or v is None or isinstance(v, str): return v
    if isinstance(v, (int, float)): return round(float(v), 9)
    return v
bad = 0; per = {}
for c in exp:
    e, g = norm(c["expected"]), norm(got.get(c["name"]) or {})
    diffs = []
    for k in ("mb", "T"):
        if e[k] != g.get(k): diffs.append((k, e[k], g.get(k)))
    gl = {b["name"]: b for b in g.get("list", [])}
    for b in e["list"]:
        o = gl.get(b["name"], {})
        for f in b:
            if b[f] != o.get(f): diffs.append((b["name"] + "." + f, b[f], o.get(f)))
    for k, _, _ in diffs: per[k] = per.get(k, 0) + 1
    if diffs:
        bad += 1
        if bad <= 4:
            print("MISMATCH", c["name"])
            for k, a, b in diffs[:6]: print("  " + k, "\n   pwa:", json.dumps(a)[:400], "\n   ios:", json.dumps(b)[:400])
print("mismatches by field:", dict(sorted(per.items(), key=lambda x: -x[1])[:15]) or "none")
print(f"{len(exp) - bad}/{len(exp)} accounts identical")
sys.exit(1 if bad else 0)
