#!/usr/bin/env python3
"""Read or poke the THROWAWAY iOS test account's blob (config/jacked-ios-dev-test-account.json)
for the safe-saving checks. Never points at anyone else's account.
  test-account-blob.py dump <out.json>      write {updated_at, backup} as the server has it
  test-account-blob.py plant <name>         act as "another device": add one workout with a
                                            compare-and-swap PATCH, like the PWA's syncBackup"""
import json, sys, time, urllib.request, urllib.parse, datetime
U = "https://qehlrwnumrjktujidabz.supabase.co"; K = "sb_publishable_vmf9BELfVFZpKrdMN3Z34g_R9l056gJ"
acct = json.load(open("/home/roni/agent/config/jacked-ios-dev-test-account.json"))
code = "@" + acct["username"]
assert code.startswith("@ios_dev_test_"), "refusing: not the throwaway test account"
def call(method, path, body=None, tok=K, extra=None):
    h = {"apikey": K, "Authorization": "Bearer " + tok, "Content-Type": "application/json", "Cache-Control": "no-cache"}
    h.update(extra or {})
    r = urllib.request.Request(U + path, method=method, headers=h, data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(r) as resp: t = resp.read(); return json.loads(t) if t else None
st = call("POST", "/rest/v1/rpc/account_status", {"p_code": code})
tok = call("POST", "/auth/v1/token?grant_type=password", {"email": st["email"], "password": acct["password"]})["access_token"]
q = "/rest/v1/profile_backups?code=eq." + urllib.parse.quote(code)
row = call("GET", q + "&select=backup,updated_at", tok=tok)[0]
if sys.argv[1] == "dump":
    json.dump(row, open(sys.argv[2], "w")); print(row["updated_at"], len(row["backup"].get("jk_hist", [])), "workouts")
elif sys.argv[1] == "plant":
    b = row["backup"]; ts0 = row["updated_at"]
    d = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=3)
    b["jk_hist"].append({"id": "w%d" % int(time.time() * 1000), "name": sys.argv[2], "date": d.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                         "duration": "20:00", "sets": 1, "totalVolume": 0, "prCount": 0, "fromOtherDevice": True,
                         "exercises": [{"exId": "Pullups", "name": "Pullups", "tracking": "bodyweight_reps", "sets": [{"weight": 0, "reps": 6, "done": True}]}]})
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    res = call("PATCH", q + "&updated_at=eq." + urllib.parse.quote(ts0, safe="") + "&select=updated_at", {"backup": b, "updated_at": now}, tok=tok,
               extra={"Prefer": "return=representation"})
    print("planted" if res else "plant refused (watermark moved)", ts0, "->", res and res[0]["updated_at"])
