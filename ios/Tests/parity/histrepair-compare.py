#!/usr/bin/env python3
"""Compare histrepair-fixtures.json (node, the PWA's saveWE / delW) with histrepair-swift-out.json (Swift)."""
import json, sys, os
d = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
exp = {c["name"]: c["expected"] for c in json.load(open(os.path.join(d, "histrepair-fixtures.json")))}
got = {c["name"]: c["got"] for c in json.load(open(os.path.join(d, "histrepair-swift-out.json")))}
def norm(v):
    if isinstance(v, bool) or v is None: return v
    if isinstance(v, (int, float)): return round(float(v), 6)
    if isinstance(v, list): return [norm(x) for x in v]
    if isinstance(v, dict): return {k: norm(x) for k, x in v.items()}
    return v
ok = 0; bad = []
for n, e in exp.items():
    g = got.get(n, {})
    diff = [k for k in sorted(set(e) | set(g)) if norm(e.get(k)) != norm(g.get(k))]
    if not diff: ok += 1
    else: bad.append((n, diff))
print(f"Edit/Delete Workout parity: {ok}/{len(exp)} identical")
for n, diff in bad[:4]:
    for k in diff[:2]: print(n, k, "\n node: ", json.dumps(norm(exp[n].get(k)))[:700], "\n swift:", json.dumps(norm(got[n].get(k)))[:700])
sys.exit(0 if not bad else 1)
