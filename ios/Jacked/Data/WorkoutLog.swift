import Foundation

/// The workout being logged (the PWA's `aw`), its exercises and sets, in the PWA's own field
/// names so a finished workout lands in `jk_hist` exactly as the web app would have written it.
/// Weights are kg (miles for distance, seconds for duration), like everywhere in the blob.
struct LogSet: Codable, Equatable {
    var weight: Double = 0
    var reps: Double = 0
    var done = false
    /// Last session's numbers for this set (seedSets): shown greyed, adopted on check-off if left blank.
    var pw: Double?
    var pr: Double?
    /// Single / Both choice, only for SINGLE_BOTH_IDS lifts.
    var single: Bool?
}

struct LogExercise: Codable, Equatable, Identifiable {
    /// Local only (never written to the blob): lets the screen tell two copies of one lift apart.
    var uid = UUID().uuidString
    var exId: String
    var name: String
    var muscle = ""
    var equip = ""
    var assist = false
    var tracking = "weight_reps"
    var imgUrl: String?
    var bwMode: String?
    /// Exercise-level Single / Both choice once tapped on the card (setSingleArmEx).
    var single: Bool?
    /// Two exercises paired as a superset share this id (grouping only).
    var supersetId: String?
    /// Hold display unit picked on the card: sec | min | hr (stored values stay seconds).
    var durUnit: String?
    var sets: [LogSet] = []
    var id: String { uid }
}

struct ActiveWorkout: Codable, Equatable {
    var id: String
    var routineId: String?
    var name: String
    /// ISO time the workout started (the PWA's `date: new Date().toISOString()`).
    var date: String
    var exercises: [LogExercise]
    /// ms since 1970, the PWA's awStart / aw.startedAt.
    var startedAt: Double
    /// When the rest timer ends (ms), if one is running.
    var restEndsAt: Double?
}

/// One exercise in the picker: built-ins (warm-ups, machines, runs), exercise-db, custom.
struct CatalogExercise: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var muscle: String
    var equip: String
    var tracking: String
    var assist: Bool
    var image: String?
    var custom: Bool
    /// exercise-db extras for the Library: category ("strength", "warmup"...), every photo, how-to steps.
    var category = ""
    var images: [String] = []
    var instructions: [String] = []
}

// MARK: - JSON (blob) shape

extension LogSet {
    init(json o: [String: JSONValue]) {
        weight = jsNum(o["weight"]); reps = jsNum(o["reps"]); done = o["done"]?.truthy ?? false
        pw = o["pw"]?.double; pr = o["pr"]?.double; single = o["single"]?.bool
    }
    var json: JSONValue {
        var o: [String: JSONValue] = ["weight": .number(weight), "reps": .number(reps), "done": .bool(done)]
        if let pw { o["pw"] = .number(pw) }
        if let pr { o["pr"] = .number(pr) }
        if let single { o["single"] = .bool(single) }
        return .object(o)
    }
}

extension LogExercise {
    init(json o: [String: JSONValue]) {
        exId = o["exId"]?.string ?? "?"; name = o["name"]?.string ?? "Exercise"
        muscle = o["muscle"]?.string ?? ""; equip = o["equip"]?.string ?? ""
        assist = o["assist"]?.truthy ?? false; tracking = o["tracking"]?.string ?? "weight_reps"
        imgUrl = o["imgUrl"]?.string; bwMode = o["bwMode"]?.string; single = o["single"]?.bool
        supersetId = o["supersetId"]?.string; durUnit = o["durUnit"]?.string
        sets = (o["sets"]?.array ?? []).compactMap { $0.object.map(LogSet.init(json:)) }
    }
    var json: [String: JSONValue] {
        var o: [String: JSONValue] = ["exId": .string(exId), "name": .string(name), "muscle": .string(muscle),
                                      "equip": .string(equip), "assist": .bool(assist), "tracking": .string(tracking),
                                      "imgUrl": imgUrl.map(JSONValue.string) ?? .null, "sets": .array(sets.map(\.json))]
        if let bwMode { o["bwMode"] = .string(bwMode) }
        if let single { o["single"] = .bool(single) }
        if let supersetId { o["supersetId"] = .string(supersetId) }
        if let durUnit { o["durUnit"] = .string(durUnit) }
        return o
    }
}

extension ActiveWorkout {
    init(json o: [String: JSONValue], startedAt: Double) {
        id = o["id"]?.string ?? "w\(Int(startedAt))"; routineId = o["routineId"]?.string
        name = o["name"]?.string ?? "Quick Workout"; date = o["date"]?.string ?? ""
        exercises = (o["exercises"]?.array ?? []).compactMap { $0.object.map(LogExercise.init(json:)) }
        self.startedAt = startedAt
    }
}

// MARK: - The PWA's workout math, function by function (index.html names in the comments)

enum WorkoutMath {
    static let importedId = try! NSRegularExpression(pattern: #"^w\d+_\d+$"#)

    static func isWT(_ e: LogExercise) -> Bool { e.tracking == "weight_reps" || e.tracking == "bodyweight_reps" }
    static func isCardio(_ e: LogExercise) -> Bool { e.tracking == "distance" }
    static func isHold(_ e: LogExercise) -> Bool { e.tracking == "duration" }
    /// e1rm: Epley; 0 reps lifted nothing.
    static func e1rm(_ w: Double, _ reps: Double) -> Double { reps <= 0 ? 0 : reps == 1 ? w : w * (1 + reps / 30) }
    static func prE1rm(_ pr: [String: JSONValue]?) -> Double { pr.map { e1rm(jsNum($0["weight"]), jsNum($0["reps"])) } ?? 0 }
    static func mileEquiv(_ d: Double, _ t: Double) -> Double { d > 0 && t > 0 ? t / pow(d, 1.06) : .infinity }
    static func pacePerMile(_ d: Double, _ t: Double) -> Double { d > 0 && t > 0 ? t / d : 0 }
    static func fmtPace(_ mpm: Double) -> String {
        guard mpm > 0 else { return "—" }
        let m = Int(mpm.rounded(.down)), s = Int(((mpm - Double(m)) * 60).rounded(.toNearestOrAwayFromZero))
        return "\(s == 60 ? m + 1 : m):\(String(format: "%02d", s == 60 ? 0 : s))/mi"
    }
    static func fmtHold(_ sec: Double) -> String {
        let s = Int(sec.rounded(.toNearestOrAwayFromZero))
        return s >= 60 ? "\(s / 60):\(String(format: "%02d", s % 60))" : "\(s)s"
    }
    static let sugEps = 0.05

    static func isBodyweightEx(_ e: LogExercise) -> Bool {
        if e.assist || PWATables.NOT_BW_IDS.contains(e.exId) { return false }
        if e.name.lowercased().contains("weighted") { return false }
        if e.tracking == "bodyweight_reps" { return true }
        let eq = e.equip.lowercased()
        return eq == "body only" || eq == "bodyweight"
    }
    static func bwMode(_ e: LogExercise) -> String { e.bwMode ?? (e.assist ? "assist" : "body") }
    static func bwCapable(_ e: LogExercise) -> Bool {
        e.tracking == "bodyweight_reps" || (e.tracking == "weight_reps" && (isBodyweightEx(e) || e.assist))
    }
    /// effWeight: the load a set really moved (body weight for bodyweight lifts).
    static func effWeight(_ e: LogExercise, _ s: LogSet, bw: Double) -> Double {
        let w = max(0, s.weight)
        if bwCapable(e) {
            switch bwMode(e) {
            case "added": return bw + w
            case "assist": return max(0, bw - w)
            default: return bw
            }
        }
        return isBodyweightEx(e) ? bw : w
    }
    static func setSingle(_ e: LogExercise, _ s: LogSet) -> Bool {
        PWATables.SINGLE_BOTH_IDS.contains(e.exId) && (s.single ?? PWATables.DOUBLE_VOL_IDS.contains(e.exId))
    }
    static func stampSingle(_ a: inout ActiveWorkout) {
        for i in a.exercises.indices where PWATables.SINGLE_BOTH_IDS.contains(a.exercises[i].exId) {
            for j in a.exercises[i].sets.indices where a.exercises[i].sets[j].single == nil {
                a.exercises[i].sets[j].single = PWATables.SINGLE_DEFAULT_IDS.contains(a.exercises[i].exId)
            }
        }
    }
    static func volWeight(_ e: LogExercise, _ s: LogSet, workoutId: String, bw: Double) -> Double {
        let imported = importedId.firstMatch(in: workoutId, range: NSRange(workoutId.startIndex..., in: workoutId)) != nil
        return effWeight(e, s, bw: bw) * (setSingle(e, s) && !imported ? 2 : 1)
    }

    struct Best { let si: Int; let weight: Double; let reps: Double }

    /// prBest
    static func prBest(_ e: LogExercise, bw: Double) -> Best? {
        guard !e.exId.isEmpty, e.exId != "?" else { return nil }
        var best: Best?
        if isCardio(e) {
            for (si, s) in e.sets.enumerated() where s.done && s.weight > 0 && s.reps > 0 {
                if best == nil || mileEquiv(s.weight, s.reps) < mileEquiv(best!.weight, best!.reps) { best = Best(si: si, weight: s.weight, reps: s.reps) }
            }
            return best
        }
        if isHold(e) {
            for (si, s) in e.sets.enumerated() where s.done && s.weight > 0 && (best == nil || s.weight > best!.weight) {
                best = Best(si: si, weight: s.weight, reps: 0)
            }
            return best
        }
        guard isWT(e) else { return nil }
        for (si, s) in e.sets.enumerated() where s.done && (s.weight > 0 || s.reps > 0) {
            let w = effWeight(e, s, bw: bw)
            if best == nil || e1rm(w, s.reps) > e1rm(best!.weight, best!.reps) { best = Best(si: si, weight: w, reps: s.reps) }
        }
        return best
    }

    /// prWeightStep: documented PR = heaviest raw set (more reps breaks a tie); suggested = best e1RM above it.
    static func prWeightStep(_ e: LogExercise, prev: [String: JSONValue]?, sug: [String: JSONValue]?, bw: Double)
        -> (doc: Best?, sug: Best?, keepSug: Bool) {
        let pw = jsNum(prev?["weight"]), pwReps = jsNum(prev?["reps"]), se = prE1rm(sug)
        var heavy: Best?, est: Best?
        for (si, s) in e.sets.enumerated() where s.done && (s.weight > 0 || s.reps > 0) {
            let w = effWeight(e, s, bw: bw), reps = s.reps
            guard reps > 0 else { continue }
            if heavy == nil || w > heavy!.weight || (w == heavy!.weight && reps > heavy!.reps) { heavy = Best(si: si, weight: w, reps: reps) }
            if est == nil || e1rm(w, reps) > e1rm(est!.weight, est!.reps) { est = Best(si: si, weight: w, reps: reps) }
        }
        let doc = heavy.flatMap { $0.weight > pw || ($0.weight == pw && $0.reps > pwReps) ? $0 : nil }
        let dw = doc?.weight ?? pw
        let ee = est.map { e1rm($0.weight, $0.reps) } ?? 0
        let nsug = est.flatMap { ee > dw + sugEps && ee > se ? $0 : nil }
        return (doc, nsug, nsug == nil && se > dw + sugEps)
    }

    struct PRHit: Equatable { let exId: String; let ei: Int; let si: Int; let name: String; let weight: Double; let reps: Double; var label: String? }

    /// commitPRs: writes jk_prs / jk_prSug / jk_cardioPR / jk_holdPR into `raw`, returns (PRs, suggested).
    static func commitPRs(_ w: ActiveWorkout, raw: inout [String: JSONValue], bw: Double, now: String) -> (list: [PRHit], suggested: [PRHit]) {
        var prs = raw["jk_prs"]?.object ?? [:], cardio = raw["jk_cardioPR"]?.object ?? [:]
        var hold = raw["jk_holdPR"]?.object ?? [:], sugs = raw["jk_prSug"]?.object ?? [:]
        var pD = false, cD = false, hD = false, sD = false
        var list: [PRHit] = [], suggested: [PRHit] = []
        for (ei, ex) in w.exercises.enumerated() {
            let exId = ex.exId
            guard !exId.isEmpty, exId != "?", let best = prBest(ex, bw: bw) else { continue }
            if isHold(ex) {
                if best.weight > jsNum(hold[exId]?["sec"]) {
                    hold[exId] = .object(["sec": .number(best.weight), "date": .string(now)]); hD = true
                    list.append(PRHit(exId: exId, ei: ei, si: best.si, name: ex.name, weight: best.weight, reps: 0, label: "\(fmtHold(best.weight)) hold"))
                }
                continue
            }
            if isCardio(ex) {
                let prev = cardio[exId]?.object ?? [:]
                let longest = ex.sets.filter { $0.done && $0.weight > 0 && $0.reps > 0 }.reduce(0) { max($0, $1.weight) }
                var nrec = prev; var changed = false
                if mileEquiv(best.weight, best.reps) < mileEquiv(jsNum(prev["dist"]), jsNum(prev["time"])) {
                    nrec["dist"] = .number(best.weight); nrec["time"] = .number(best.reps); nrec["date"] = .string(now); changed = true
                    list.append(PRHit(exId: exId, ei: ei, si: best.si, name: ex.name, weight: best.weight, reps: best.reps,
                                      label: "\(fmtPace(pacePerMile(best.weight, best.reps))) · \(jsNumberString(best.weight)) mi"))
                }
                if longest > jsNum(prev["maxDist"]) { nrec["maxDist"] = .number(longest); nrec["maxDate"] = .string(now); changed = true }
                if changed { cardio[exId] = .object(nrec); cD = true }
                continue
            }
            let st = prWeightStep(ex, prev: prs[exId]?.object, sug: sugs[exId]?.object, bw: bw)
            if let d = st.doc {
                prs[exId] = .object(["weight": .number(d.weight), "reps": .number(d.reps), "date": .string(now)]); pD = true
                list.append(PRHit(exId: exId, ei: ei, si: d.si, name: ex.name, weight: d.weight, reps: d.reps))
            }
            if let g = st.sug {
                sugs[exId] = .object(["weight": .number(g.weight), "reps": .number(g.reps), "date": .string(now)]); sD = true
                suggested.append(PRHit(exId: exId, ei: ei, si: g.si, name: ex.name, weight: g.weight, reps: g.reps))
            } else if !st.keepSug, sugs[exId] != nil { sugs[exId] = nil; sD = true }
        }
        if pD { raw["jk_prs"] = .object(prs) }
        if sD { raw["jk_prSug"] = .object(sugs) }
        if cD { raw["jk_cardioPR"] = .object(cardio) }
        if hD { raw["jk_holdPR"] = .object(hold) }
        return (list, suggested)
    }

    /// A weight/plate for display: at most one decimal, no trailing ".0".
    static func n(_ v: Double) -> String {
        let r = (v * 10).rounded() / 10
        return r == r.rounded() ? String(Int(r)) : String(format: "%.1f", r)
    }

    /// JS `${n}` for a number (125 not 125.0).
    static func jsNumberString(_ n: Double) -> String {
        n == n.rounded() && abs(n) < 1e15 ? String(Int(n)) : String(n)
    }

    /// autoNameWorkout
    static func autoName(_ exs: [LogExercise], bw: Double) -> String {
        var bestW: String?, bestWScore = 0.0, bestOther: String?, bestOtherScore = 0.0
        for ex in exs {
            let done = ex.sets.filter(\.done); if done.isEmpty { continue }
            if isWT(ex) {
                let top = done.reduce(0.0) { max($0, e1rm(effWeight(ex, $1, bw: bw), $1.reps)) }
                if top > bestWScore { bestWScore = top; bestW = ex.name }
            } else {
                let m = done.reduce(0.0) { $0 + $1.reps + $1.weight }
                if m > bestOtherScore { bestOtherScore = m; bestOther = ex.name }
            }
        }
        return (bestW ?? bestOther).map { "\($0) Day" } ?? "Workout"
    }

    struct Finished { let rec: [String: JSONValue]; let prs: [PRHit]; let suggested: [PRHit]; let volume: Double; let duration: String; let sets: Int }

    /// buildFinishRec + the PR commit: the history record for a finished workout. PR maps in `raw` are updated.
    static func buildFinishRec(_ a0: ActiveWorkout, endMs: Double, raw: inout [String: JSONValue], now: String) -> Finished {
        var a = a0
        stampSingle(&a)
        let bw = jsNum(raw["jk_bw"])
        let ts = a.exercises.reduce(0) { $0 + $1.sets.filter(\.done).count }
        let sec = max(0, Int(((endMs - (a.startedAt > 0 ? a.startedAt : endMs)) / 1000).rounded(.down)))
        let vol = a.exercises.reduce(0.0) { v, e in
            isWT(e) ? v + e.sets.filter(\.done).reduce(0.0) { $0 + volWeight(e, $1, workoutId: a.id, bw: bw) * max(0, $1.reps) } : v
        }
        let dur = String(format: "%02d:%02d", sec / 60, sec % 60)
        let (list, sug) = commitPRs(a, raw: &raw, bw: bw, now: now)
        let notes = raw["jk_exNotes"]?.object ?? [:]
        let hit: (PRHit) -> JSONValue = { .object(["exId": .string($0.exId), "ei": .number(Double($0.ei)), "si": .number(Double($0.si)),
                                                   "weight": .number($0.weight), "reps": .number($0.reps)]) }
        var rec: [String: JSONValue] = ["id": .string(a.id), "name": .string(a.name), "date": .string(a.date),
                                        "duration": .string(dur), "sets": .number(Double(ts)), "totalVolume": .number(vol.rounded(.toNearestOrAwayFromZero)),
                                        "prCount": .number(Double(list.count)), "prSets": .array(list.map(hit)),
                                        "prRule": .number(2), "sugSets": .array(sug.map(hit))]
        if let r = a.routineId { rec["routineId"] = .string(r) }
        rec["exercises"] = .array(a.exercises.map { e in
            var o = e.json
            if let u = e.imgUrl, u.hasPrefix("data:") { o["imgUrl"] = .null }
            if let n = notes[e.exId]?.string, !n.isEmpty { o["note"] = .string(n) }
            return .object(o)
        })
        if a.name.isEmpty || a.name == "Quick Workout" { rec["name"] = .string(autoName(a.exercises, bw: bw)) }
        return Finished(rec: rec, prs: list, suggested: sug, volume: vol.rounded(.toNearestOrAwayFromZero), duration: dur, sets: ts)
    }

    /// histInsert: keep jk_hist in date order, a new workout after any with the same time.
    static func histInsert(_ h: [JSONValue], _ rec: [String: JSONValue]) -> [JSONValue] {
        var h = h
        let t = rec["date"]?.string.flatMap(JackedDate.parse)
        var i = h.count
        if let t { while i > 0, (h[i - 1]["date"]?.string.flatMap(JackedDate.parse) ?? .distantPast) > t { i -= 1 } }
        h.insert(.object(rec), at: i)
        return h
    }

    /// seedSets: the layout of last time's sets for this exercise, numbers greyed in pw/pr.
    static func seedSets(exId: String, tracking: String, history: [JSONValue]) -> [LogSet] {
        for w in history.reversed() {
            guard let ex = (w["exercises"]?.array ?? []).first(where: { $0["exId"]?.string == exId && ($0["tracking"]?.string ?? "weight_reps") == tracking }),
                  let sets = ex["sets"]?.array, !sets.isEmpty else { continue }
            let all = sets.compactMap(\.object)
            let done = all.filter { $0["done"]?.truthy ?? false }
            return (done.isEmpty ? all : done).map { s in
                LogSet(weight: 0, reps: 0, done: false, pw: jsNum(s["weight"]), pr: jsNum(s["reps"]), single: s["single"]?.bool)
            }
        }
        return [LogSet()]
    }

    /// setSuggestion: the greyed placeholder (earlier sets cascade, then last time's pw/pr, else the PR).
    static func suggestion(_ e: LogExercise, _ si: Int, raw: [String: JSONValue]) -> (w: Double, r: Double) {
        let pr: [String: JSONValue] = e.tracking == "duration"
            ? ["weight": .number(jsNum(raw["jk_holdPR"]?[e.exId]?["sec"]))]
            : (raw["jk_prs"]?[e.exId]?.object ?? [:])
        var w = jsNum(pr["weight"]), r = jsNum(pr["reps"])
        for i in 0..<min(si, e.sets.count) { let s = e.sets[i]; if s.weight > 0 { w = s.weight }; if s.reps > 0 { r = s.reps } }
        if si < e.sets.count { let s = e.sets[si]; if (s.pw ?? 0) > 0 { w = s.pw! }; if (s.pr ?? 0) > 0 { r = s.pr! } }
        return (w, r)
    }

    // MARK: stopwatch notation (minToClock / clockToMin / toDispDur / fromDispDur)
    // The digits after the dot are the next-smaller unit, typed as on a stopwatch: 5.30 = 5m30s.

    private static func splitClock(_ v: String) -> (Int, Int) {
        let t = v.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        let p = t.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
        func pi(_ s: Substring?) -> Int { Int(String((s ?? "").prefix { $0.isNumber || $0 == "-" })) ?? 0 }
        var whole = pi(p.first), sub = p.count > 1 ? pi(p[1]) : 0
        if sub >= 60 { whole += sub / 60; sub %= 60 }
        return (whole, sub)
    }
    static func minToClock(_ min: Double) -> String {
        guard min > 0 else { return "" }
        let m = Int(min.rounded(.down)), s = Int(((min - Double(m)) * 60).rounded(.toNearestOrAwayFromZero))
        return s > 0 ? "\(m).\(String(format: "%02d", s))" : "\(m)"
    }
    static func clockToMin(_ v: String) -> Double {
        guard !v.trimmingCharacters(in: .whitespaces).isEmpty else { return 0 }
        let (m, s) = splitClock(v); return Double(m) + Double(s) / 60
    }
    static func toDispDur(_ sec: Double, _ u: String) -> String {
        guard sec > 0 else { return "" }
        if u == "sec" { return String(Int(sec.rounded(.toNearestOrAwayFromZero))) }
        if u == "min" {
            let m = Int((sec / 60).rounded(.down)), s = Int(sec.truncatingRemainder(dividingBy: 60).rounded(.toNearestOrAwayFromZero))
            return s > 0 ? "\(m).\(String(format: "%02d", s))" : "\(m)"
        }
        let h = Int((sec / 3600).rounded(.down)), m = Int((sec.truncatingRemainder(dividingBy: 3600) / 60).rounded(.toNearestOrAwayFromZero))
        return m > 0 ? "\(h).\(String(format: "%02d", m))" : "\(h)"
    }
    static func fromDispDur(_ v: String, _ u: String) -> Double {
        let t = v.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return 0 }
        if u == "sec" { return (Double(t.replacingOccurrences(of: ",", with: ".")) ?? 0).rounded(.toNearestOrAwayFromZero) }
        let (w, s) = splitClock(t)
        return Double(u == "min" ? w * 60 + s : w * 3600 + s * 60)
    }
    static func durUnit(_ e: LogExercise) -> String { e.durUnit ?? "sec" }

    // MARK: live card badges (renderWS / evaluateProgress)

    static let progressStreak = 3
    static func progressTrackable(_ t: String) -> Bool { t == "weight_reps" || t == "bodyweight_reps" }

    struct Progress: Equatable { var up = false; var down = false; var weight = 0.0 }

    /// evaluateProgress: newest -> oldest saved workouts with this lift. Down = no set in the last one
    /// reached Min; up = the last 3 at one weight with every set at or above Max.
    static func evaluateProgress(exId: String, history: [JSONValue], settings: Settings, bw: Double) -> Progress {
        var occ: [(w: Double, reps: [Double])] = []
        for h in history.reversed() where occ.count < progressStreak {
            guard let wo = (h["exercises"]?.array ?? []).first(where: { $0["exId"]?.string == exId })?.object else { continue }
            let wex = LogExercise(json: wo)
            if !progressTrackable(wex.tracking) { return Progress() }
            if wex.tracking == "bodyweight_reps" && bwMode(wex) != "added" { continue }
            let done = wex.sets.filter(\.done)
            if done.isEmpty { continue }
            occ.append((done.reduce(0) { max($0, effWeight(wex, $1, bw: bw)) }, done.map { $0.reps }))
        }
        guard let first = occ.first else { return Progress() }
        var p = Progress(weight: first.w)
        p.down = !first.reps.isEmpty && first.reps.allSatisfy { $0 < Double(settings.repMin) }
        if occ.count >= progressStreak, occ.allSatisfy({ abs($0.w - first.w) < 0.01 }) {
            p.up = occ.allSatisfy { !$0.reps.isEmpty && $0.reps.allSatisfy { $0 >= Double(settings.repMax) } }
        }
        return p
    }

    struct Note: Equatable { let up: Bool; let text: String }

    /// buildProgressNotes: "moved up" when a go-up signal was followed tonight, else "consider
    /// lighter" from history including tonight (skipped for a lift that set a PR).
    static func progressNotes(exercises: [LogExercise], pre: [String: Progress], postHistory: [JSONValue],
                              prNames: Set<String>, settings: Settings, bw: Double) -> [Note] {
        func dW(_ kg: Double) -> String { n((settings.display(kg) * 10).rounded() / 10) + settings.unitLabel }
        var out: [Note] = []
        for ex in exercises where progressTrackable(ex.tracking) {
            let done = ex.sets.filter(\.done); if done.isEmpty { continue }
            let todayW = done.reduce(0) { max($0, effWeight(ex, $1, bw: bw)) }
            if let p = pre[ex.exId], p.up, todayW > p.weight + 0.01 {
                out.append(Note(up: true, text: "Nice — you moved up on \(ex.name): \(dW(p.weight)) → \(dW(todayW)).")); continue
            }
            let post = evaluateProgress(exId: ex.exId, history: postHistory, settings: settings, bw: bw)
            if post.down && !prNames.contains(ex.name) {
                out.append(Note(up: false, text: "\(ex.name) — no set reached \(settings.repMin) reps at \(dW(post.weight)), consider lighter."))
            }
        }
        return out
    }

    /// renderWS prIdx: the ONE set that gets the gold star. Weight lifts use the finish rule itself
    /// (prWeightStep's documented PR); runs and holds use the single best set beating the record.
    static func prIndex(_ e: LogExercise, raw: [String: JSONValue]) -> Int? {
        let bw = jsNum(raw["jk_bw"])
        if isWT(e) {
            return prWeightStep(e, prev: raw["jk_prs"]?[e.exId]?.object, sug: raw["jk_prSug"]?[e.exId]?.object, bw: bw).doc?.si
        }
        var idx: Int?, best = -Double.infinity
        if isCardio(e) {
            let c = raw["jk_cardioPR"]?[e.exId]?.object
            let cBest = mileEquiv(jsNum(c?["dist"]), jsNum(c?["time"]))
            for (i, s) in e.sets.enumerated() where s.done && s.weight > 0 && s.reps > 0 && mileEquiv(s.weight, s.reps) < cBest {
                let sc = -mileEquiv(s.weight, s.reps); if sc > best { best = sc; idx = i }
            }
        } else if isHold(e) {
            let hBest = jsNum(raw["jk_holdPR"]?[e.exId]?["sec"])
            for (i, s) in e.sets.enumerated() where s.done && s.weight > hBest && s.weight > best { best = s.weight; idx = i }
        }
        return idx
    }

    /// exSingleUI: the card's Single / Both state.
    static func exSingleUI(_ e: LogExercise) -> Bool {
        if let s = e.single { return s }
        return e.sets.last.map { $0.single == true } ?? PWATables.SINGLE_DEFAULT_IDS.contains(e.exId)
    }


    /// Plate calculator (openPlate): plates per side for a target, in the display unit.
    static func plates(target: Double, bar: Double, isLb: Bool) -> (perSide: [Double], leftover: Double) {
        let sizes: [Double] = isLb ? [45, 35, 25, 10, 5, 2.5] : [25, 20, 15, 10, 5, 2.5, 1.25]
        var side = max(0, (target - bar) / 2), out: [Double] = []
        for p in sizes { while side + 1e-9 >= p { out.append(p); side -= p } }
        return (out, side * 2)
    }
}
