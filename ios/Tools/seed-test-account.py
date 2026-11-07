#!/usr/bin/env python3
"""Seed the THROWAWAY iOS test account (config/jacked-ios-dev-test-account.json) with a
fixture history, via the same first-time-enrolment upsert the PWA's syncBackup() uses.
Refuses to run if the row already has a backup (never overwrites)."""
import json, urllib.request, datetime, random, sys
U = "https://qehlrwnumrjktujidabz.supabase.co"; K = "sb_publishable_vmf9BELfVFZpKrdMN3Z34g_R9l056gJ"
acct = json.load(open("/home/roni/agent/config/jacked-ios-dev-test-account.json"))
code = "@" + acct["username"]
def call(method, path, body=None, tok=K, extra=None):
    h = {"apikey": K, "Authorization": "Bearer " + tok, "Content-Type": "application/json"}
    h.update(extra or {})
    r = urllib.request.Request(U + path, method=method, headers=h, data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(r) as resp: t = resp.read(); return json.loads(t) if t else None
st = call("POST", "/rest/v1/rpc/account_status", {"p_code": code})
tok = call("POST", "/auth/v1/token?grant_type=password", {"email": st["email"], "password": acct["password"]})["access_token"]
q = "/rest/v1/profile_backups?code=eq." + urllib.parse.quote(code) + "&select=backup,updated_at"
import urllib.parse
existing = call("GET", "/rest/v1/profile_backups?code=eq." + urllib.parse.quote(code) + "&select=updated_at,backup", tok=tok)
if "--status" in sys.argv: print(json.dumps([{"updated_at": r["updated_at"], "workouts": len((r["backup"] or {}).get("jk_hist", []))} for r in existing])); sys.exit()
if existing and existing[0].get("backup"): print("already seeded, refusing to overwrite:", existing[0]["updated_at"]); sys.exit(0)
IMG = "https://qehlrwnumrjktujidabz.supabase.co/storage/v1/object/public/exercise-images/"
EX = {
 "Barbell_Bench_Press": ("Barbell Bench Press", "chest", "barbell", "weight_reps"),
 "Barbell_Squat": ("Barbell Squat", "quadriceps", "barbell", "weight_reps"),
 "Barbell_Deadlift": ("Barbell Deadlift", "lower back", "barbell", "weight_reps"),
 "Pullups": ("Pullups", "lats", "body only", "bodyweight_reps"),
 "Standing_Military_Press": ("Standing Military Press", "shoulders", "barbell", "weight_reps"),
 "Plank": ("Plank", "abdominals", "body only", "duration"),
 "Running_Treadmill": ("Running, Treadmill", "quadriceps", "machine", "distance"),
}
def ex(i, sets):
    n, m, e, t = EX[i]
    return {"exId": i, "name": n, "muscle": m, "equip": e, "assist": False, "tracking": t, "imgUrl": IMG + i + "/0.jpg",
            "sets": [{"weight": w, "reps": r, "done": True} for w, r in sets]}
plan = [  # (days ago, name, exercises)
 (0, "Push Day", [ex("Barbell_Bench_Press", [(61.2, 8), (65.8, 6), (65.8, 6)]), ex("Standing_Military_Press", [(38.6, 8), (38.6, 7)])]),
 (1, "Leg Day", [ex("Barbell_Squat", [(84, 5), (88.5, 5), (88.5, 4)]), ex("Plank", [(60, 0), (75, 0)])]),
 (2, "Pull Day", [ex("Barbell_Deadlift", [(111, 5), (115.7, 3)]), ex("Pullups", [(0, 10), (0, 8), (0, 7)])]),
 (4, "Easy Run", [ex("Running_Treadmill", [(3.1, 27.5)])]),
 (5, "Push Day", [ex("Barbell_Bench_Press", [(61.2, 8), (63.5, 6), (63.5, 5)])]),
 (8, "Leg Day", [ex("Barbell_Squat", [(84, 5), (86.2, 5)])]),
 (9, "Pull Day", [ex("Barbell_Deadlift", [(109, 5), (111, 4)]), ex("Pullups", [(0, 9), (0, 8)])]),
 (12, "Full Body", [ex("Barbell_Bench_Press", [(59, 8)]), ex("Barbell_Squat", [(81.6, 5)]), ex("Pullups", [(0, 8)])]),
 (16, "Push Day", [ex("Barbell_Bench_Press", [(59, 8), (61.2, 6)])]),
 (17, "Leg Day", [ex("Barbell_Squat", [(81.6, 5), (84, 4)])]),
 (23, "Pull Day", [ex("Barbell_Deadlift", [(106.6, 5)]), ex("Pullups", [(0, 8), (0, 7)])]),
 (26, "Long Run", [ex("Running_Treadmill", [(5.0, 46.0)])]),
 (30, "Push Day", [ex("Barbell_Bench_Press", [(56.7, 8), (59, 6)])]),
 (37, "Leg Day", [ex("Barbell_Squat", [(79.4, 5)])]),
]
now = datetime.datetime.now().astimezone()
hist = []
for ago, name, exs in sorted(plan, key=lambda p: -p[0]):
    d = (now - datetime.timedelta(days=ago)).replace(hour=18 if ago else max(0, now.hour - 1), minute=5, second=0, microsecond=0)
    ts = int(d.timestamp() * 1000)
    done = sum(len(e["sets"]) for e in exs)
    vol = round(sum(s["weight"] * s["reps"] for e in exs if e["tracking"] == "weight_reps" for s in e["sets"]))
    hist.append({"id": "w%d" % ts, "name": name, "date": d.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                 "duration": "%d:%02d" % (35 + ago % 20, (ago * 7) % 60), "sets": done, "totalVolume": vol, "prCount": 1 if ago in (0, 2) else 0, "exercises": exs})
blob = {"jk_hist": hist, "jk_prof": {"name": "iOS Dev Test", "username": code, "code": code},
        "jk_settings": {"wUnit": "lb", "restDefault": 90, "autoRest": True}, "jk_bw": 81.6,
        "jk_bwlog": [{"d": (now - datetime.timedelta(days=10)).strftime("%Y-%m-%d"), "kg": 82.1}, {"d": now.strftime("%Y-%m-%d"), "kg": 81.6}]}
call("POST", "/rest/v1/profile_backups?on_conflict=code", {"code": code, "backup": blob, "updated_at": now.astimezone(datetime.timezone.utc).isoformat()},
     tok=tok, extra={"Prefer": "resolution=merge-duplicates,return=minimal"})
print("seeded", len(hist), "workouts for", code)
