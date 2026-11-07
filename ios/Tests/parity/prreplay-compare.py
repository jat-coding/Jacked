#!/usr/bin/env python3
"""Compare prreplay-fixtures.json (node, the PWA's prReplay) with prreplay-swift-out.json (Swift)."""
import json, sys, os
d = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
exp = {c["name"]: c["expected"] for c in json.load(open(os.path.join(d, "prreplay-fixtures.json")))}
got = {c["name"]: c["got"] for c in json.load(open(os.path.join(d, "prreplay-swift-out.json")))}
def norm(m): return {k: {t: [[r[0], int(r[1]), int(r[2]), round(r[3], 6), round(r[4], 6)] for r in v[t]] for t in ("list", "sug")} for k, v in m.items()}
ok = 0; bad = []
for n, e in exp.items():
    if norm(e) == norm(got.get(n, {})): ok += 1
    else: bad.append(n)
print(f"PR replay parity: {ok}/{len(exp)} identical")
for n in bad[:5]: print(n, "\n node:", json.dumps(norm(exp[n]))[:600], "\n swift:", json.dumps(norm(got.get(n, {})))[:600])
sys.exit(0 if not bad else 1)
