#!/usr/bin/env python3
"""Compare metrics-fixtures.json expected vs metrics-swift-out.json, card by card.
A JS undefined name (dropped by JSON.stringify) compares equal to an empty string."""
import json, sys, os
d = sys.argv[1] if len(sys.argv) > 1 else "."
exp = json.load(open(os.path.join(d, "metrics-fixtures.json")))
got = {o["name"]: o["got"] for o in json.load(open(os.path.join(d, "metrics-swift-out.json")))}
def norm(v):
    if isinstance(v, dict):
        o = {k: norm(x) for k, x in v.items()}
        if "w" in o and "r" in o and "name" not in o: o["name"] = ""
        return o
    if isinstance(v, list): return [norm(x) for x in v]
    if isinstance(v, bool) or v is None or isinstance(v, str): return v
    if isinstance(v, (int, float)): return round(float(v), 9)
    return v
bad = 0; per = {}
for c in exp:
    e, g = norm(c["expected"]), norm(got.get(c["name"]) or {})
    diff = [k for k in e if e.get(k) != g.get(k)]
    for k in diff: per[k] = per.get(k, 0) + 1
    if diff:
        bad += 1
        if bad <= 4:
            print("MISMATCH", c["name"])
            for k in diff: print("  " + k, "\n   pwa:", json.dumps(e.get(k))[:600], "\n   ios:", json.dumps(g.get(k))[:600])
print("mismatches by card:", per or "none")
print(f"{len(exp) - bad}/{len(exp)} accounts identical")
sys.exit(1 if bad else 0)
