#!/usr/bin/env python3
"""Compare import-swift-out.json against the PWA's expected results in import-fixtures.json."""
import json, sys, os
d = sys.argv[1]
fx = json.load(open(os.path.join(d, 'import-fixtures.json')))
got = {o['name']: o['got'] for o in json.load(open(os.path.join(d, 'import-swift-out.json')))}
def norm(v):
    if isinstance(v, float) and v.is_integer(): return int(v)
    if isinstance(v, dict): return {k: norm(x) for k, x in v.items()}
    if isinstance(v, list): return [norm(x) for x in v]
    return v
def diff(a, b, p=''):
    if type(a) != type(b): return f'{p}: {json.dumps(a)[:200]} != {json.dumps(b)[:200]}'
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b: return f'{p}.{k}: only in {"swift" if k not in a else "pwa"}'
            r = diff(a[k], b[k], f'{p}.{k}')
            if r: return r
        return None
    if isinstance(a, list):
        if len(a) != len(b): return f'{p}: length {len(a)} != {len(b)}'
        for i, (x, y) in enumerate(zip(a, b)):
            r = diff(x, y, f'{p}[{i}]')
            if r: return r
        return None
    return None if a == b else f'{p}: {json.dumps(a)[:200]} != {json.dumps(b)[:200]}'
bad = 0
for c in fx:
    r = diff(norm(c['expected']), norm(got.get(c['name'], {})))
    if r:
        bad += 1
        if bad <= 15: print('MISMATCH', c['name'], r)
print(f'{len(fx) - bad}/{len(fx)} identical')
sys.exit(1 if bad else 0)
