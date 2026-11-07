#!/usr/bin/env python3
"""Compare friends-fixtures.json expected vs friends-swift-out.json: the syncMe columns (every field of
data included), monthOf for each friend, and the crown."""
import json, sys, os
d = sys.argv[1] if len(sys.argv) > 1 else "."
exp = json.load(open(os.path.join(d, "friends-fixtures.json")))
got = {o["name"]: o["got"] for o in json.load(open(os.path.join(d, "friends-swift-out.json")))}
def norm(v):
    if isinstance(v, dict): return {k: norm(x) for k, x in v.items()}
    if isinstance(v, list): return [norm(x) for x in v]
    if isinstance(v, bool) or v is None or isinstance(v, str): return v
    if isinstance(v, (int, float)): return round(float(v), 9)
    return v
def walk(a, b, path, out):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in set(a) | set(b): walk(a.get(k, "<missing>"), b.get(k, "<missing>"), path + "." + k, out)
    elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        for i, (x, y) in enumerate(zip(a, b)): walk(x, y, path + "[]", out)
    elif a != b: out.append((path, a, b))
bad = 0; per = {}
for c in exp:
    diffs = []; walk(norm(c["expected"]), norm(got.get(c["name"]) or {}), "", diffs)
    for k, _, _ in diffs: per[k] = per.get(k, 0) + 1
    if diffs:
        bad += 1
        if bad <= 4:
            print("MISMATCH", c["name"])
            for k, a, b in diffs[:6]: print("  " + k, "\n   pwa:", json.dumps(a)[:300], "\n   ios:", json.dumps(b)[:300])
print("mismatches by field:", dict(sorted(per.items(), key=lambda x: -x[1])[:15]) or "none")
print(f"{len(exp) - bad}/{len(exp)} accounts identical")
sys.exit(1 if bad else 0)
