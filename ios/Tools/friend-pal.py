#!/usr/bin/env python3
"""Act as one of the two THROWAWAY iOS test accounts on the friends tables, for the Friends checks.
  friend-pal.py <main|pal> requests                  list my friend_requests rows
  friend-pal.py <main|pal> profiles <code>...        rpc friend_profiles (what the Friends tab reads)
  friend-pal.py pal request                          pal sends a request to the main test account
  friend-pal.py pal accept                           pal accepts the main test account's request
  friend-pal.py pal publish                          pal publishes stats with one shared workout this month (syncMe shape)
  friend-pal.py <main|pal> unfriend                  delete every row between the two test accounts
Refuses to run as anything but config/jacked-ios-dev-test-account{,-2}.json."""
import json, sys, urllib.request, urllib.parse, datetime
U = "https://qehlrwnumrjktujidabz.supabase.co"; K = "sb_publishable_vmf9BELfVFZpKrdMN3Z34g_R9l056gJ"
CFG = {"main": "/home/roni/agent/config/jacked-ios-dev-test-account.json", "pal": "/home/roni/agent/config/jacked-ios-dev-test-account-2.json"}
code_of = lambda who: "@" + json.load(open(CFG[who]))["username"]
who = sys.argv[1]; me = code_of(who); other = code_of("pal" if who == "main" else "main")
assert me.startswith("@ios_dev_test_") or me.startswith("@ios_dev_pal_"), "refusing: not a throwaway test account"
def call(method, path, body=None, tok=K, extra=None):
    h = {"apikey": K, "Authorization": "Bearer " + tok, "Content-Type": "application/json", "Prefer": "return=representation"}
    h.update(extra or {})
    r = urllib.request.Request(U + path, method=method, headers=h, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r) as resp: t = resp.read(); return json.loads(t) if t else None
    except urllib.error.HTTPError as e: print("HTTP", e.code, e.read()[:300].decode()); sys.exit(1)
import os  # the sign-in id never changes; caching it keeps repeated runs under account_status's rate limit
_cf = os.path.expanduser("~/.cache/jacked-ios-test-emails.json"); _c = json.load(open(_cf)) if os.path.exists(_cf) else {}
st = {"email": _c[me]} if me in _c else call("POST", "/rest/v1/rpc/account_status", {"p_code": me})
if "email" not in st: print("account_status:", st); sys.exit(1)
_c[me] = st["email"]; json.dump(_c, open(_cf, "w"))
tok = call("POST", "/auth/v1/token?grant_type=password", {"email": st["email"], "password": json.load(open(CFG[who]))["password"]})["access_token"]
q = urllib.parse.quote
pair = f"or=(and(from_code.eq.{q(me)},to_code.eq.{q(other)}),and(from_code.eq.{q(other)},to_code.eq.{q(me)}))"
cmd = sys.argv[2]
if cmd == "requests": print(json.dumps(call("GET", f"/rest/v1/friend_requests?select=*&or=(from_code.eq.{q(me)},to_code.eq.{q(me)})", tok=tok), indent=1))
elif cmd == "profiles": print(json.dumps(call("POST", "/rest/v1/rpc/friend_profiles", {"p_codes": sys.argv[3:]}, tok=tok), indent=1))
elif cmd == "request": print(call("POST", "/rest/v1/friend_requests", {"from_code": me, "to_code": other, "status": "pending"}, tok=tok))
elif cmd == "accept": print(call("PATCH", f"/rest/v1/friend_requests?from_code=eq.{q(other)}&to_code=eq.{q(me)}&status=eq.pending&select=id", {"status": "accepted"}, tok=tok))
elif cmd == "unfriend": print(call("DELETE", "/rest/v1/friend_requests?" + pair, tok=tok))
elif cmd == "publish":
    now = datetime.datetime.now(datetime.timezone.utc); iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    d1 = now - datetime.timedelta(days=1); ym = now.astimezone().strftime("%Y-%m")
    wd = [{"name": "Pal Push Day", "date": iso(d1), "vol": 4535.92, "sets": 3,
           "ex": [{"id": "Barbell_Bench_Press_-_Medium_Grip", "n": "Barbell Bench Press - Medium Grip", "t": "weight_reps", "sets": [{"w": 60, "r": 8}, {"w": 70, "r": 6}, {"w": 80, "r": 3}]}]}]
    data = {"days": [d1.astimezone().strftime("%Y-%m-%d")], "recent": [{"name": "Pal Push Day", "date": iso(d1), "totalVolume": 4535.92, "sets": 3}], "wd": wd,
            "m": {"ym": ym, "v": 4536, "w": 1, "p": 1, "pv": 0, "st": 1, "c": 14, "b": 0}, "badgeList": [{"n": "Bench-Maxing", "t": "bronze", "e": "dumbbell|#5aa9ff"}]}
    print(call("PATCH", f"/rest/v1/profiles?code=eq.{q(me)}&select=code,updated_at", {"name": "iOS Test Pal", "total_volume": 4536, "workouts": 1, "prs": 1, "streak": 1,
          "consistency": 3, "badges": 1, "data": data, "updated_at": iso(now)}, tok=tok))
