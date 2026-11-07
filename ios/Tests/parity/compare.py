#!/usr/bin/env python3
"""Compare swift-out.json with the node results in fixtures.json, key-order-insensitively
(same idea as the PWA's canonJson). Numbers compare by value (1 == 1.0). Exit 1 on any diff."""
import json, sys, os
d = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
fx = json.load(open(os.path.join(d, "fixtures.json"))); sw = json.load(open(os.path.join(d, "swift-out.json")))
def canon(v):
    if isinstance(v, bool) or v is None or isinstance(v, str): return v
    if isinstance(v, (int, float)): return float(v)
    if isinstance(v, list): return [canon(x) for x in v]
    return {k: canon(v[k]) for k in sorted(v)}
bad = 0
for f, s in zip(fx, sw):
    assert f["name"] == s["name"]
    if canon(f["expected"]) != canon(s["actual"]):
        bad += 1
        if bad <= 5:
            e, a = canon(f["expected"]), canon(s["actual"])
            keys = sorted(set(e) | set(a), key=str)
            print("DIFF", f["name"], [(k, e.get(k), a.get(k)) for k in keys if e.get(k) != a.get(k)])
print(f"{len(fx) - bad}/{len(fx)} cases identical" + ("" if len(fx) == len(sw) else f" (count mismatch {len(sw)})"))
sys.exit(1 if bad or len(fx) != len(sw) else 0)
