#!/usr/bin/env python3
"""Compare finish-fixtures.json expected vs finish-swift-out.json. PR-record `date`/`maxDate`
are the wall clock at commit time on each side, so they are compared as present/absent only."""
import json, sys, os
d = sys.argv[1] if len(sys.argv) > 1 else "."
exp = json.load(open(os.path.join(d, "finish-fixtures.json")))
got = {o["name"]: o for o in json.load(open(os.path.join(d, "finish-swift-out.json")))}
def norm(v, in_state=False):
    if isinstance(v, dict): return {k: ("<t>" if in_state and k in ("date", "maxDate") else norm(x, in_state)) for k, x in v.items()}
    if isinstance(v, list): return [norm(x, in_state) for x in v]
    if isinstance(v, float) and v.is_integer(): return int(v)
    if isinstance(v, float): return round(v, 9)
    return v
bad = 0
for c in exp:
    g = got.get(c["name"])
    e_rec, g_rec = norm(c["expected"]["rec"]), norm(g["rec"]) if g else None
    e_st, g_st = norm(c["expected"]["state"], True), norm(g["state"], True) if g else None
    if e_rec != g_rec or e_st != g_st:
        bad += 1
        if bad <= 3:
            print("MISMATCH", c["name"]); 
            for k in set(e_rec) | set(g_rec or {}):
                if e_rec.get(k) != (g_rec or {}).get(k): print("  rec." + k, "\n   pwa:", json.dumps(e_rec.get(k))[:400], "\n   ios:", json.dumps((g_rec or {}).get(k))[:400])
            for k in set(e_st) | set(g_st or {}):
                if e_st.get(k) != (g_st or {}).get(k): print("  state." + k, "\n   pwa:", json.dumps(e_st.get(k))[:400], "\n   ios:", json.dumps((g_st or {}).get(k))[:400])
print(f"{len(exp) - bad}/{len(exp)} finished workouts identical")
sys.exit(1 if bad else 0)
