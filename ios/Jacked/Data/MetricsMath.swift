import Foundation

/// byId() and allDB.find() for the Metrics math, built once per render from the catalog and the
/// blob: custom first, then built-ins, then exercise-db (each with the user's jk_exOverride and
/// jk_exRename applied, like index.html byId), else the humanised id.
struct ExLib {
    private var lib: [String: CatalogExercise] = [:]
    private var dbRows: [String: CatalogExercise] = [:]
    private let renames: [String: JSONValue]

    init(db: [CatalogExercise], raw: [String: JSONValue]) {
        renames = raw["jk_exRename"]?.object ?? [:]
        let ov = raw["jk_exOverride"]?.object ?? [:]
        func over(_ e: CatalogExercise) -> CatalogExercise {
            var e = e
            if let o = ov[e.id]?.object {
                if let v = o["muscle"]?.string { e.muscle = v }
                if let v = o["equip"]?.string { e.equip = v }
                if let v = o["tracking"]?.string { e.tracking = v }
                if let v = o["assist"] { e.assist = v.truthy }
                if let v = o["mechanic"]?.string { e.mechanic = v }
                if let v = o["secondary"]?.array { e.secondary = v.compactMap(\.string) }
            }
            return e
        }
        for e in db where dbRows[e.id] == nil { dbRows[e.id] = e }
        let cust = (raw["jk_cex"]?.array ?? []).compactMap(\.object).compactMap { o -> CatalogExercise? in
            guard let id = o["id"]?.string else { return nil }
            return CatalogExercise(id: id, name: o["name"]?.string ?? id, muscle: o["muscle"]?.string ?? "", equip: o["equip"]?.string ?? "",
                                   tracking: o["tracking"]?.string ?? "weight_reps", assist: o["assist"]?.truthy ?? false, image: nil, custom: true,
                                   mechanic: o["mechanic"]?.string ?? "", secondary: (o["secondary"]?.array ?? []).compactMap(\.string))
        }
        for e in cust.reversed() { lib[e.id] = e }   // Map(): the last duplicate wins, like cexById
        for e in PWATables.builtIns where lib[e.id] == nil { lib[e.id] = over(e) }
        for e in db where lib[e.id] == nil { lib[e.id] = over(e) }
    }

    func db(_ id: String) -> CatalogExercise? { id.isEmpty ? nil : dbRows[id] }

    func byId(_ id: String) -> CatalogExercise {
        var e = lib[id] ?? CatalogExercise(id: id, name: id.isEmpty ? "Unknown" : id.replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " "),
                                           muscle: "", equip: "", tracking: "weight_reps", assist: false, image: nil, custom: false)
        if let n = renames[id]?.string { e.name = n }
        return e
    }
}

/// One logged exercise as the stats read it: the stored fields with JS's "missing" kept apart
/// from "empty" where index.html's `a||b` fallbacks care.
struct HEx {
    let exId: String          // "" when the log has none
    let name: String          // "" when the log has none
    let log: LogExercise
    init(_ o: [String: JSONValue]) {
        log = LogExercise(json: o)
        exId = o["exId"]?.string ?? ""
        name = o["name"]?.string ?? ""
    }
}

struct HWorkout {
    let w: Workout
    let ms: Double?           // +new Date(w.date), nil when invalid
    let exercises: [HEx]
    init(_ o: [String: JSONValue]) {
        w = Workout(o)
        ms = w.date.map { $0.timeIntervalSince1970 * 1000 }
        exercises = (o["exercises"]?.array ?? []).compactMap { $0.object.map(HEx.init) }
    }
}

/// The Metrics tab's math, ported function by function from index.html (names in the comments).
/// Everything takes `now` so the parity run (Tests/parity/metrics-*) can pin the clock.
struct MetricsMath {
    static let MGROUPS = ["chest", "back", "shoulders", "biceps", "triceps", "legs", "glutes", "core"]
    static let MGNAME = ["chest": "Chest", "back": "Back", "shoulders": "Shoulders", "biceps": "Arms (Biceps)", "triceps": "Arms (Triceps)",
                         "legs": "Legs", "glutes": "Glutes", "core": "Core"]
    static let TIER_CUT = [0.34, 0.67, 0.9]

    let raw: [String: JSONValue]
    let lib: ExLib
    let now: Date
    let cal: Calendar
    let hist: [HWorkout]
    let bw: Double

    init(raw: [String: JSONValue], lib: ExLib, now: Date = Date(), calendar: Calendar = .current) {
        self.raw = raw; self.lib = lib; self.now = now; cal = calendar
        hist = (raw["jk_hist"]?.array ?? []).compactMap { $0.object.map(HWorkout.init) }
        bw = jsNum(raw["jk_bw"])
    }

    private var nowMs: Double { now.timeIntervalSince1970 * 1000 }
    var settings: Settings { Settings(raw["jk_settings"]?.object ?? [:]) }
    var prCount: Int { raw["jk_prs"]?.object?.count ?? 0 }

    // MARK: cardOverview / cardSummary / cardLifetime

    struct Overview: Equatable { var thisMonth: Int; var allTime: Int; var prs: Int }
    func overview() -> Overview {
        let c = cal.dateComponents([.year, .month], from: now)
        let ms = cal.date(from: DateComponents(year: c.year, month: c.month, day: 1))!.timeIntervalSince1970 * 1000
        return Overview(thisMonth: hist.filter { ($0.ms ?? -.infinity) >= ms }.count, allTime: hist.count, prs: prCount)
    }

    struct Summary: Equatable { var last7: Int; var last30: Int; var avgVol: Double; var prs: Int; var leastTrained: String? }
    func summary() -> Summary? {
        guard !hist.isEmpty else { return nil }
        let l7 = hist.filter { ($0.ms ?? -.infinity) >= nowMs - 7 * 864e5 }.count
        let l30 = hist.filter { ($0.ms ?? -.infinity) >= nowMs - 30 * 864e5 }.count
        let avg = hist.reduce(0) { $0 + $1.w.totalVolume } / Double(hist.count)
        let freq = muscleUsage(credit: true)
        // trained.sort((a,b)=>freq[a]-freq[b])[0]: stable, so the first MGROUPS entry wins a tie
        let least = Self.MGROUPS.enumerated().filter { freq[$0.element]! > 0 }
            .sorted { freq[$0.element]! != freq[$1.element]! ? freq[$0.element]! < freq[$1.element]! : $0.offset < $1.offset }.first?.element
        return Summary(last7: l7, last30: l30, avgVol: jsRound(avg), prs: prCount, leastTrained: least)
    }

    struct TopPR: Equatable { var exId: String; var name: String; var weight: Double; var reps: Double }
    struct Lifetime: Equatable { var workouts: Int; var volume: Double; var sets: Int; var avgMin: Int; var top: TopPR? }
    func lifetime() -> Lifetime {
        let tv = hist.reduce(0) { $0 + $1.w.totalVolume }, ts = hist.reduce(0) { $0 + $1.w.sets }
        let durs: [Double] = hist.map { h in
            let p = h.w.duration.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
            guard p.count == 2, p.allSatisfy({ !$0.isEmpty && jsNumber($0) != nil }) else { return 0 }
            return (jsNumber(p[0])! * 60 + jsNumber(p[1])!) / 60
        }.filter { $0 > 0 }
        let avg = durs.isEmpty ? 0 : Int(jsRound(durs.reduce(0, +) / Double(durs.count)))
        return Lifetime(workouts: hist.count, volume: tv, sets: ts, avgMin: avg, top: topPRSet())
    }

    /// topPRSet(): heaviest raw weight lifted, reps break a tie, then the earlier set.
    func topPRSet() -> TopPR? {
        struct C { var exId: String; var name: String; var weight: Double; var reps: Double; var t: Double; var ei: Int }
        var best: C?
        let key: (Double) -> Double = { ($0 * 100).rounded(.toNearestOrAwayFromZero) }
        for h in hist {
            let imported = WorkoutMath.importedId.firstMatch(in: h.w.id, range: NSRange(h.w.id.startIndex..., in: h.w.id)) != nil
            let t = h.ms ?? 0
            for (ei, ex) in h.exercises.enumerated() {
                let e = ex.log
                if ex.exId.isEmpty || ex.exId == "?" || !WorkoutMath.isWT(e) || WorkoutMath.isCardio(e) || WorkoutMath.isHold(e) || isPlainBW(e) { continue }
                for st in e.sets {
                    let kg = st.weight, reps = st.reps
                    if kg <= 0 || reps <= 0 || (!st.done && !imported) { continue }
                    let c = C(exId: ex.exId, name: ex.name, weight: kg, reps: reps, t: t, ei: ei)
                    if let b = best {
                        let kc = key(kg), kb = key(b.weight)
                        if kc > kb || (kc == kb && (reps > b.reps || (reps == b.reps && (t < b.t || (t == b.t && ei < b.ei))))) { best = c }
                    } else { best = c }
                }
            }
        }
        return best.map { TopPR(exId: $0.exId, name: lib.byId($0.exId).name, weight: $0.weight, reps: $0.reps) }
    }

    func isPlainBW(_ e: LogExercise) -> Bool {
        if WorkoutMath.bwMode(e) == "added" { return false }
        let nm = e.name.lowercased()
        return WorkoutMath.isBodyweightEx(e) || WorkoutMath.bwCapable(e) || (nm.contains("bodyweight") && !nm.contains("weighted"))
    }

    // MARK: Monthly recaps (recapData / cardRecaps)

    struct Recap: Equatable {
        var y: Int; var m: Int; var sessions: Int; var vol: Double; var prs: Int; var days: Int
        var best: (name: String, w: Double, r: Double)?
        var bestWeek: (start: Date, vol: Double, n: Int)?
        var comeback: Bool; var challenge: (group: String, target: Double, done: Bool)?
        static func == (a: Recap, b: Recap) -> Bool {
            a.y == b.y && a.m == b.m && a.sessions == b.sessions && a.vol == b.vol && a.prs == b.prs && a.days == b.days
        }
        var label: String { MetricsMath.MONTHS[m] }
    }
    static let MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

    /// recapData(y, m): m is 0-based like JS.
    func recapData(_ y: Int, _ m: Int) -> Recap? {
        let hm = hist.filter { h in
            guard let d = h.w.date else { return false }
            let c = cal.dateComponents([.year, .month], from: d); return c.year == y && c.month == m + 1
        }
        if hm.isEmpty { return nil }
        let vol = hm.reduce(0) { $0 + $1.w.totalVolume }, prs = hm.reduce(0) { $0 + $1.w.prCount }
        let days = Set(hm.map { $0.w.date.map { JackedDate.dayKey($0, calendar: cal) } ?? "" }).count
        var best: (e: Double, name: String, w: Double, r: Double)?
        for h in hm { for ex in h.exercises {
            let e = ex.log
            if !WorkoutMath.isWT(e) || isPlainBW(e) { continue }
            for st in e.sets where st.weight > 0 && st.reps > 0 {
                let v = WorkoutMath.e1rm(st.weight, st.reps)
                if best == nil || v > best!.e { best = (v, ex.name, st.weight, st.reps) }
            }
        } }
        var weeks: [(s0: Date, vol: Double, n: Int)] = []
        for h in hm {
            let d = h.w.date!
            let dc = cal.dateComponents([.year, .month, .day, .weekday], from: d)
            let s0 = cal.date(from: DateComponents(year: dc.year, month: dc.month, day: dc.day! - (dc.weekday! - 1)))!
            if let i = weeks.firstIndex(where: { $0.s0 == s0 }) { weeks[i].vol += h.w.totalVolume; weeks[i].n += 1 }
            else { weeks.append((s0, h.w.totalVolume, 1)) }
        }
        let bw = weeks.enumerated().sorted { a, b in
            if a.element.vol != b.element.vol { return a.element.vol > b.element.vol }
            if a.element.n != b.element.n { return a.element.n > b.element.n }
            return a.offset < b.offset
        }.first?.element
        let rec = raw["jk_monthBadges"]?[String(format: "%d-%02d", y, m + 1)]?.object ?? [:]
        let ch = rec["group"]?.string.flatMap { g in g.isEmpty ? nil : (g, jsNum(rec["target"]), rec["done"]?.truthy ?? false) }
        return Recap(y: y, m: m, sessions: hm.count, vol: vol, prs: prs, days: days,
                     best: best.map { ($0.name, $0.w, $0.r) }, bestWeek: bw.map { ($0.s0, $0.vol, $0.n) },
                     comeback: rec["comeback"]?.truthy ?? false, challenge: ch)
    }

    /// cardRecaps(): the last 12 calendar months that have workouts, newest first.
    func recaps() -> [Recap] {
        let c = cal.dateComponents([.year, .month], from: now)
        return (1...12).compactMap { k in
            let d = cal.date(from: DateComponents(year: c.year, month: c.month! - k, day: 1))!
            let dc = cal.dateComponents([.year, .month], from: d)
            return recapData(dc.year!, dc.month! - 1)
        }
    }

    // MARK: Body weight (gBWlog / cardWeight)

    /// jk_bwlog, the last 14 entries: (day key, kg).
    func weightLog() -> [(d: String, kg: Double)] {
        let log = (raw["jk_bwlog"]?.array ?? []).compactMap { $0.object }.map { ($0["d"]?.string ?? "", jsNum($0["kg"])) }
        return Array(log.suffix(14))
    }

    // MARK: Muscle groups (logGroup / exCredits / muscleUsage)

    func logMuscle(_ ex: HEx) -> String {
        let m = ex.log.muscle
        if m.lowercased() == "cardio", ex.exId.hasPrefix("imp_"), !(ex.log.tracking.contains("distance") || ex.log.tracking.contains("duration")) {
            return Self.guessMuscle(ex.name)
        }
        return m
    }

    func logGroup(_ ex: HEx) -> String {
        let libM = ex.exId.isEmpty ? "" : lib.byId(ex.exId).muscle
        return [LibraryMath.muscleGroup(logMuscle(ex)), LibraryMath.muscleGroup(libM)].first { Self.MGROUPS.contains($0) } ?? ""
    }

    static func mapMuscle(_ m: String) -> String { let s = m.lowercased(); return s == "abdominals" ? "core" : s }

    static let STR_EQUIP_FACTOR: [String: Double] = ["barbell": 1, "e-z curl bar": 1, "machine": 0.9, "cable": 1.1, "dumbbell": 2, "kettlebells": 2, "body only": 1, "bands": 1.5]
    static let STR_EQUIP_ALIAS = ["kettlebell": "kettlebells", "resistance_band": "bands", "band": "bands", "ez_bar": "e-z curl bar", "bodyweight": "body only", "trap_bar": "barbell"]
    static let STR_REF_ISOLATION: Set<String> = ["biceps", "core"]
    static let STR_BEST_ONLY: Set<String> = ["core"]
    static let CREDIT_REF: [String: Double] = ["chest": 212, "shoulders": 137, "legs": 289, "back": 192, "glutes": 309, "biceps": 99, "triceps": 206]
    static let CREDIT_PAIR = ["chest": ["triceps", "shoulders"], "shoulders": ["triceps"], "triceps": ["chest"], "back": ["biceps"], "legs": ["glutes"]]
    static let CREDIT_SET_SHARE = 0.5
    private static func ri(_ p: String) -> NSRegularExpression { try! NSRegularExpression(pattern: p, options: .caseInsensitive) }
    private static func rx(_ p: String) -> NSRegularExpression { try! NSRegularExpression(pattern: p) }
    static func test(_ r: NSRegularExpression, _ s: String) -> Bool { r.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil }
    struct CreditLift { let n: String; let re: NSRegularExpression; let avg: Double; let native: Bool; let from: [String]; let to: [String] }
    static let LOWER = ["legs", "glutes", "back"]
    static let CREDIT_LIFTS: [CreditLift] = [
        CreditLift(n: "Romanian / stiff-leg deadlift", re: ri(#"romanian|\brdl\b|stiff.?leg"#), avg: 270, native: false, from: LOWER, to: ["glutes", "back"]),
        CreditLift(n: "Good morning", re: ri(#"good ?mornings?"#), avg: 190, native: false, from: LOWER, to: ["glutes", "back"]),
        CreditLift(n: "Deadlift", re: ri(#"deadlift|rack pull"#), avg: 340, native: false, from: LOWER, to: ["glutes", "legs", "back"]),
        CreditLift(n: "Hip thrust / glute bridge", re: ri(#"hip thrust|glute bridge|hip raise|\bbridges?\b"#), avg: 309, native: false, from: LOWER, to: []),
        CreditLift(n: "Leg press", re: ri("leg press"), avg: 500, native: true, from: LOWER, to: ["glutes"]),
        CreditLift(n: "Hack squat", re: ri("hack squat"), avg: 335, native: true, from: LOWER, to: ["glutes"]),
        CreditLift(n: "Smith machine squat", re: ri("smith.*squat"), avg: 246, native: true, from: LOWER, to: ["glutes"]),
        CreditLift(n: "Front squat", re: ri("front squat"), avg: 231, native: false, from: LOWER, to: ["glutes"]),
        CreditLift(n: "Lunge / split squat", re: ri(#"lunges?|split squat"#), avg: 178, native: false, from: LOWER, to: ["glutes"]),
        CreditLift(n: "Squat", re: ri(#"squats?\b"#), avg: 289, native: false, from: LOWER, to: ["glutes"]),
        CreditLift(n: "Push press", re: ri("push press"), avg: 180, native: false, from: ["shoulders"], to: ["triceps"]),
        CreditLift(n: "Pull-up / pulldown", re: ri(#"pulldown|pull.?downs?|pull.?ups?|chin.?ups?|\bchins?\b"#), avg: 180, native: true, from: ["back"], to: ["biceps"]),
        CreditLift(n: "Seated cable row", re: ri("cable row|seated row|seated cable"), avg: 186, native: true, from: ["back"], to: ["biceps"]),
    ]
    static let CREDIT_NAME: [String: NSRegularExpression] = [
        "chest": ri(#"bench|press|push.?ups?|\bdips?\b"#), "shoulders": ri("press|jerk"),
        "triceps": ri(#"close.?grip|\bdips?\b|jm press|floor press"#), "back": ri(#"^(?!.*upright).*\brows?\b"#), "legs": ri(#"step.?ups?"#),
    ]
    static let CREDIT_NAME_ONLY: Set<String> = ["shoulders"]
    static let CREDIT_NOT = ri(#"fl(y|ies|yes)\b|flye|raise|pec deck|pullover|crossover|calf|scapular|\bcurls?\b|extension|kickback|pushdown|shrug"#)
    static let FOREARM_NECK = ri("forearm|neck")

    /// strEquip(exId)
    func strEquip(_ exId: String) -> String {
        let l = lib.byId(exId)
        if l.assist { return "body only" }
        let d = lib.db(exId)
        let e = ((d.map { $0.dbEquip }).flatMap { $0.isEmpty ? nil : $0 } ?? l.equip).lowercased()
        return Self.STR_EQUIP_ALIAS[e] ?? e
    }

    func mechanic(_ exId: String) -> String {
        if let m = lib.db(exId)?.mechanic, !m.isEmpty { return m }
        return exId.isEmpty ? "" : lib.byId(exId).mechanic
    }

    /// exStrengthFactor(exId, group)
    func exStrengthFactor(_ exId: String, _ group: String) -> Double {
        var f = Self.STR_EQUIP_FACTOR[strEquip(exId)] ?? 1
        if mechanic(exId) == "isolation" && !Self.STR_REF_ISOLATION.contains(group) { f *= 1.8 }
        return f
    }

    /// exCredits(ex): {group: f} for every other group one logged exercise trains.
    func exCredits(_ ex: HEx) -> [String: Double] {
        var out: [String: Double] = [:]
        let l = ex.exId.isEmpty ? nil : lib.byId(ex.exId)
        let name = !ex.name.isEmpty ? ex.name : (l?.name ?? "")
        let src = logGroup(ex); if !Self.MGROUPS.contains(src) { return out }
        let d = lib.db(ex.exId)
        let sec = d.map { $0.secondary } ?? (l?.secondary ?? [])
        let mech = d.flatMap { $0.mechanic.isEmpty ? nil : $0.mechanic } ?? (l?.mechanic ?? "")
        let not = Self.test(Self.CREDIT_NOT, name)
        let lift = not ? nil : Self.CREDIT_LIFTS.first { Self.test($0.re, name) && $0.from.contains(src) }
        let byName = Self.CREDIT_NAME[src].map { Self.test($0, name) } ?? false
        let compound = mech != "isolation" && !not && (mech == "compound" || lift != nil || (sec.isEmpty && byName) || (d != nil && mech.isEmpty))
        let eqF: () -> Double = {
            let k = !ex.exId.isEmpty ? self.strEquip(ex.exId) : (l?.equip ?? "").lowercased()
            return Self.STR_EQUIP_FACTOR[k] ?? 1
        }
        func add(_ g: String, _ f: Double) { if g == src || !Self.MGROUPS.contains(g) { return }; if out[g] == nil || f > out[g]! { out[g] = f } }
        for m in sec where !Self.test(Self.FOREARM_NECK, m) {
            let g = LibraryMath.muscleGroup(Self.mapMuscle(m)); if !g.isEmpty { add(g, 0) }
        }
        if !compound { return out }
        if let lift {
            for g in lift.to { add(g, (lift.native ? 1 : eqF()) * Self.CREDIT_REF[g]! / lift.avg) }
        } else {
            for g in Self.CREDIT_PAIR[src] ?? [] {
                let listed = sec.contains { !Self.test(Self.FOREARM_NECK, $0) && LibraryMath.muscleGroup(Self.mapMuscle($0)) == g }
                if Self.CREDIT_NAME_ONLY.contains(src) ? byName : (listed || byName) { add(g, eqF() * Self.CREDIT_REF[g]! / Self.CREDIT_REF[src]!) }
            }
        }
        return out
    }

    /// muscleUsage(credit): completed sets per group (all sets if none were checked off).
    func muscleUsage(credit: Bool) -> [String: Double] {
        var freq: [String: Double] = [:]; Self.MGROUPS.forEach { freq[$0] = 0 }
        for h in hist { for ex in h.exercises {
            let g = logGroup(ex); if g.isEmpty || freq[g] == nil { continue }
            let done = ex.log.sets.filter(\.done).count, n = Double(done > 0 ? done : ex.log.sets.count)
            freq[g]! += n
            if credit && WorkoutMath.isWT(ex.log) {
                for (c, f) in exCredits(ex) where f > 0 && freq[c] != nil { freq[c]! += n * Self.CREDIT_SET_SHARE }
            }
        } }
        return freq
    }

    // MARK: Muscle Map strength (musclePerf and friends)

    static let STRENGTH_STD: [String: [String: [Double]]] = [
        "chest": ["male": [0.50, 1.00, 1.25, 1.50], "female": [0.30, 0.50, 0.75, 1.10]],
        "shoulders": ["male": [0.35, 0.55, 0.80, 1.05], "female": [0.20, 0.35, 0.50, 0.70]],
        "legs": ["male": [0.75, 1.25, 1.75, 2.25], "female": [0.50, 0.75, 1.25, 1.75]],
        "back": ["male": [0.50, 0.75, 1.00, 1.50], "female": [0.30, 0.45, 0.70, 0.95]],
        "glutes": ["male": [0.50, 1.25, 1.75, 2.75], "female": [0.50, 1.00, 1.75, 2.50]],
        "biceps": ["male": [0.25, 0.40, 0.60, 0.80], "female": [0.10, 0.25, 0.40, 0.55]],
        "triceps": ["male": [0.50, 0.75, 1.25, 1.50], "female": [0.30, 0.50, 0.75, 1.05]],
        "core": ["male": [0.25, 0.50, 0.75, 1.25], "female": [0.25, 0.50, 0.75, 1.25]],
    ]
    static let TRI_ISO_STD: [String: [String: [Double]]] = [
        "pushdown": ["male": [0.25, 0.45, 0.70, 1.05], "female": [0.15, 0.25, 0.45, 0.70]],
        "lying": ["male": [0.20, 0.35, 0.55, 0.75], "female": [0.10, 0.20, 0.30, 0.50]],
        "dumbbell": ["male": [0.05, 0.15, 0.25, 0.45], "female": [0.05, 0.10, 0.20, 0.30]],
    ]
    static let TRI_ONE_ARM = 1.96
    static let TRI_COMPOUND = ri(#"close.?grip|\bdips?\b|jm press|diamond|bench|floor press"#)
    static let BW_IS_LOAD = ri(#"pull.?ups?|chin.?ups?|\bchins?\b|muscle.?ups?|\bdips?\b"#)
    static let STR_WINDOW_DAYS = 90.0, STR_REP_CAP = 10.0, STR_TOP_N = 3

    var sex: String { raw["jk_prof"]?["sex"]?.string == "female" ? "female" : "male" }

    /// ageFromBirthday(prof.birthday)
    var age: Int? {
        guard let iso = raw["jk_prof"]?["birthday"]?.string, !iso.isEmpty,
              let b = JackedDate.noon(of: String(iso.prefix(10)), calendar: cal), JackedDate.isDayKey(iso) else { return nil }
        let bc = cal.dateComponents([.year, .month, .day], from: b), tc = cal.dateComponents([.year, .month, .day], from: now)
        var a = tc.year! - bc.year!
        if tc.month! < bc.month! || (tc.month! == bc.month! && tc.day! < bc.day!) { a -= 1 }
        return a >= 0 && a < 130 ? a : nil
    }

    static func badgeAgeFactor(_ age: Int?) -> Double {
        guard let a = age else { return 1 }
        return a < 16 ? 0.75 : a < 18 ? 0.85 : a < 40 ? 1 : a < 50 ? 0.95 : a < 60 ? 0.88 : a < 70 ? 0.78 : 0.68
    }

    static func ladderScore(_ t: [Double], _ ratio: Double) -> Double {
        guard ratio > 0 else { return 0 }
        let pts: [(Double, Double)] = [(0, 0), (t[0], TIER_CUT[0] / 2), (t[1], TIER_CUT[0]), (t[2], TIER_CUT[1]), (t[3], TIER_CUT[2]), (t[3] * 1.5, 1)]
        for i in 0..<(pts.count - 1) {
            let (x0, y0) = pts[i], (x1, y1) = pts[i + 1]
            if ratio <= x1 { return y0 + (ratio - x0) / (x1 - x0) * (y1 - y0) }
        }
        return 1
    }

    func strengthScore(_ group: String, _ ratio: Double) -> Double {
        guard let std = Self.STRENGTH_STD[group], ratio != 0, !ratio.isNaN else { return 0 }
        return Self.ladderScore(std[sex]!, ratio / Self.badgeAgeFactor(age))
    }

    /// The log exercise with name/equipment filled from the library (index.html `exn`).
    private func exn(_ ex: HEx) -> LogExercise {
        var e = ex.log
        let l = ex.exId.isEmpty ? nil : lib.byId(ex.exId)
        e.name = !ex.name.isEmpty ? ex.name : (l?.name ?? "")
        if e.equip.isEmpty { e.equip = l?.equip ?? "" }
        return e
    }

    func strLoad(_ e: LogExercise, _ s: LogSet) -> Double {
        let body = WorkoutMath.bwCapable(e) || WorkoutMath.isBodyweightEx(e)
        if !body || Self.test(Self.BW_IS_LOAD, e.name) { return WorkoutMath.effWeight(e, s, bw: bw) }
        return WorkoutMath.bwCapable(e) && WorkoutMath.bwMode(e) == "added" ? max(0, s.weight) : 0
    }

    private var windowStart: Double { nowMs - Self.STR_WINDOW_DAYS * 864e5 }
    private var inWindow: [HWorkout] { hist.filter { ($0.ms ?? -.infinity) >= windowStart } }

    private func counts(_ s: LogSet) -> Bool { s.done || s.weight > 0 }

    func muscleStrengthRatio() -> [String: Double] {
        var out: [String: Double] = [:]; Self.MGROUPS.forEach { out[$0] = 0 }
        guard bw > 0 else { return out }
        var best: [String: [String: Double]] = [:]
        var order: [String: [String]] = [:]
        for h in inWindow { for ex in h.exercises {
            let g = logGroup(ex); if g.isEmpty || !WorkoutMath.isWT(ex.log) { continue }
            let key = !ex.exId.isEmpty ? ex.exId : ex.name, f = exStrengthFactor(ex.exId, g), e = exn(ex)
            for s in ex.log.sets where counts(s) {
                let v = WorkoutMath.e1rm(strLoad(e, s), min(s.reps, Self.STR_REP_CAP)) * f
                if v > 0 {
                    if best[g]?[key] == nil { order[g, default: []].append(key) }
                    if v > (best[g]?[key] ?? 0) { best[g, default: [:]][key] = v }
                }
            }
        } }
        for g in Self.MGROUPS {
            let vals = (order[g] ?? []).map { best[g]![$0]! }.sorted(by: >).prefix(Self.STR_BEST_ONLY.contains(g) ? 1 : Self.STR_TOP_N)
            if !vals.isEmpty { out[g] = (vals.reduce(0, +) / Double(vals.count)) / bw }
        }
        return out
    }

    func creditStrength() -> [String: Double] {
        var out: [String: Double] = [:]
        guard bw > 0 else { return out }
        for h in inWindow { for ex in h.exercises {
            if !WorkoutMath.isWT(ex.log) { continue }
            let cr = exCredits(ex).filter { $0.value > 0 }; if cr.isEmpty { continue }
            let e = exn(ex), src = logGroup(ex), sf = exStrengthFactor(ex.exId, src)
            for s in ex.log.sets where counts(s) {
                let v = WorkoutMath.e1rm(strLoad(e, s), min(s.reps, Self.STR_REP_CAP)); if !(v > 0) { continue }
                let own = strengthScore(src, v * sf / bw)
                for (g, f) in cr {
                    let sc = min(own, strengthScore(g, v * f / bw))
                    if sc > (out[g] ?? 0) { out[g] = sc }
                }
            }
        } }
        return out
    }

    func triStrength() -> Double {
        var score = 0.0
        guard bw > 0 else { return 0 }
        let ageF = Self.badgeAgeFactor(age)
        for h in inWindow { for ex in h.exercises {
            let g = logGroup(ex); if !WorkoutMath.isWT(ex.log) || g != "triceps" { continue }
            let e = exn(ex), name = e.name
            let d = lib.db(ex.exId)
            let equip = !ex.exId.isEmpty ? strEquip(ex.exId) : (lib.byId(ex.exId).equip).lowercased()
            let ladder: [Double]; var f = 1.0
            let compound = d.map { $0.mechanic == "compound" } ?? Self.test(Self.TRI_COMPOUND, name)
            if compound {
                if isPlainBW(e) { continue }
                ladder = Self.STRENGTH_STD["triceps"]![sex]!
                f = Self.STR_EQUIP_FACTOR[equip] == nil || equip == "machine" || equip == "cable" ? 1 : Self.STR_EQUIP_FACTOR[equip]!
            } else {
                let kind = Self.test(Self.rx("dumbbell|kettlebell"), equip) ? "dumbbell"
                    : (Self.test(Self.rx("barbell|e-z|ez"), equip) || Self.test(Self.ri("skull|lying"), name)) ? "lying" : "pushdown"
                ladder = Self.TRI_ISO_STD[kind]![sex]!
                f = kind == "pushdown" && Self.test(Self.ri("one.?arm|single.?arm|unilateral"), name) ? Self.TRI_ONE_ARM : 1
            }
            for s in ex.log.sets where counts(s) {
                let ratio = WorkoutMath.e1rm(WorkoutMath.effWeight(ex.log, s, bw: bw), min(s.reps, Self.STR_REP_CAP)) * f / bw
                let sc = Self.ladderScore(ladder, ratio / ageF)
                if sc > score { score = sc }
            }
        } }
        return score
    }

    /// musclePerf(): 0..1 per group; strength vs body weight, or set counts when no body weight is logged.
    func musclePerf() -> (mode: String, score: [String: Double]) {
        var score: [String: Double] = [:]
        if bw == 0 {
            let freq = muscleUsage(credit: true), mx = max(1, Self.MGROUPS.map { freq[$0]! }.max()!)
            Self.MGROUPS.forEach { score[$0] = freq[$0]! / mx }
            return ("volume", score)
        }
        let ratio = muscleStrengthRatio(), cred = creditStrength()
        Self.MGROUPS.forEach { score[$0] = strengthScore($0, ratio[$0]!) }
        score["triceps"] = triStrength()
        for g in Self.MGROUPS { if let c = cred[g], c > score[g]! { score[g] = c } }
        return ("strength", score)
    }

    /// musclePerf() groups ranked strongest first (stable on ties, MGROUPS order).
    func ranking() -> (mode: String, rows: [(group: String, score: Double)]) {
        let p = musclePerf()
        let rows = Self.MGROUPS.enumerated().sorted { p.score[$0.element]! != p.score[$1.element]! ? p.score[$0.element]! > p.score[$1.element]! : $0.offset < $1.offset }
            .map { ($0.element, p.score[$0.element]!) }
        return (p.mode, rows)
    }

    static func strengthLabel(_ p: Double) -> String {
        p <= 0 ? "Untrained" : p < TIER_CUT[0] ? "Needs Work" : p < TIER_CUT[1] ? "Building" : p < TIER_CUT[2] ? "Strong" : "Elite"
    }

    // MARK: Card order (metricsOrdered)

    static let cardIds = ["overview", "weight", "body", "summary", "lifetime", "recaps", "badges"]
    static let cardTitles = ["overview": "Overview", "weight": "Body Weight", "body": "Muscle Map", "summary": "Workout Summary",
                             "lifetime": "Lifetime Stats", "recaps": "Monthly Recaps", "badges": "Achievements"]
    static func orderedCards(_ settings: [String: JSONValue]) -> [String] {
        let ord = (settings["cardOrder"]?.array ?? []).compactMap(\.string)
        let rank: (String) -> Int = { id in ord.firstIndex(of: id) ?? (id == "overview" ? -1 : 999) }
        return cardIds.enumerated().sorted { rank($0.element) != rank($1.element) ? rank($0.element) < rank($1.element) : $0.offset < $1.offset }.map(\.element)
    }
    static func hiddenCards(_ settings: [String: JSONValue]) -> Set<String> { Set((settings["hiddenCards"]?.array ?? []).compactMap(\.string)) }

    // MARK: guessMuscle (import name -> muscle)

    static func guessMuscle(_ name: String) -> String {
        let n = name.folding(options: .diacriticInsensitive, locale: nil).lowercased()
        let notCardio = rx(#"\b(lunges?|farmers?|yoke|carry|sled|monster|crunch(es)?|curls?|press|squats?|air bike|bicycle)\b"#)
        let cardio = rx(#"\b(run|running|jog|jogging|treadmill|cycle|cycling|bike|biking|spin|spinning|stair ?master|stair climb(er|ing)?|stepper|elliptical|walk|walking|hike|hiking|swim|swimming|rowing machine|rowing,? stationary|rower|erg|bicycling|skating|step ?mill|rope jumping|stationary|sauna|danc(e|ing)|cardio|battle ropes?|jump rope|skipping|sprints?)\b"#)
        if !test(notCardio, n) && test(cardio, n) { return "cardio" }
        let table: [(String, String)] = [
            (#"\bshrugs?\b|\btraps?\b"#, "traps"), (#"\bcalf\b|\bcalves\b"#, "calves"), (#"\bforearms?\b|\bwrists?\b"#, "forearms"),
            (#"\bcrunch(es)?\b|\bplanks?\b|\bsit.?ups?\b|\bleg raises?\b|\bknee raises?\b|\bab\b|\babs\b|ab wheel|\broll.?outs?\b|\bobliques?\b|\bflutter|jackknife|bicycle|russian twist|pallof|dead ?bugs?\b|\bhollow|\bv.?ups?\b|toes.?to.?bar|wood.?chop"#, "abdominals"),
            (#"\bleg curls?\b|hamstring|glute.?ham|\bnordic|romanian|\brdl\b|stiff.?leg|good ?mornings?\b"#, "hamstrings"),
            (#"\badduct"#, "adductors"),
            (#"tricep|pushdown|skull ?crusher|close.?grip (bench|press|push)|jm press|tate press|\bdips?\b"#, "triceps"),
            (#"\bglutes?\b|kickback|hip thrust|hip abduct|\bbridges?\b|donkey kick|fire hydrant"#, "glutes"),
            (#"\bsquats?\b|leg press|\blunges?\b|leg extensions?\b|\bhack\b|step.?ups?\b|\bpistol"#, "quadriceps"),
            (#"deadlift|hyperextension|back extension|rack pull"#, "lower back"),
            (#"rear delt|reverse fl(y|ies|yes)\b|face pulls?\b|upright rows?\b|lateral raises?\b|front raises?\b|shoulder|\bdelts?\b|deltoid|arnold|overhead press|military|push press"#, "shoulders"),
            (#"\bcurls?\b"#, "biceps"),
            (#"\brows?\b|pulldown|pull.?ups?\b|chin.?ups?\b|\bchins?\b|\blats?\b"#, "lats"),
            (#"bench|chest|\bfl(y|ies|yes)\b|flye|\bpecs?\b|pec deck|push.?ups?\b|floor press|butterfly|crossover|pullover"#, "chest"),
            (#"\bpress\b|pull.?apart"#, "shoulders"),
        ]
        return table.first { test(rx($0.0), n) }?.1 ?? ""
    }
}

/// Math.round (half up, toward +infinity on .5).
func jsRound(_ v: Double) -> Double { (v + 0.5).rounded(.down) }

/// `+s` / `isNaN(s)` for a string: nil when JS would give NaN.
func jsNumber(_ s: String) -> Double? {
    let t = s.trimmingCharacters(in: .whitespaces)
    if t.isEmpty { return 0 }
    return Double(t)
}
