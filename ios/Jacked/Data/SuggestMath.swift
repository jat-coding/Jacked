import Foundation

/// index.html renderSuggest / exGroups / bestRoutineFor / startGroupWorkout / todaysCuratedPick: the Home
/// "Suggested today" card. Muscle groups ranked by days since last trained, longest gap first.
extension MetricsMath {
    static let SUGNAME = ["chest": "chest", "back": "back", "shoulders": "shoulders", "biceps": "arms", "triceps": "arms",
                          "legs": "legs", "glutes": "glutes", "core": "core"]
    private static let GLUTE_MOVE = try! NSRegularExpression(pattern: #"squat|deadlift|\brdl\b|lunge|hip thrust|glute bridge|leg press|step.?up|good ?morning|kettlebell swing"#, options: .caseInsensitive)
    private static let CORE_MOVE = try! NSRegularExpression(pattern: #"plank|crunch|sit.?up|leg raise|knee raise|toes.?to.?bar|russian twist|ab wheel|roll.?out|hollow|dead ?bug|\bv.?ups?\b|oblique|woodchop|pallof|flutter"#, options: .caseInsensitive)
    private static func ti(_ p: String, _ s: String) -> Bool { test(try! NSRegularExpression(pattern: p, options: .caseInsensitive), s) }

    /// exGroups(ex, w): every group one logged (or routine) exercise trains.
    func exGroups(_ ex: HEx, workout w: [String: JSONValue]? = nil) -> [String] {
        var gs: [String] = []
        func add(_ g: String) { if !gs.contains(g) { gs.append(g) } }
        let l: CatalogExercise? = ex.exId.isEmpty ? nil : lib.byId(ex.exId)
        let name = !ex.name.isEmpty ? ex.name : (l?.name ?? "")
        let g0 = LibraryMath.muscleGroup(logMuscle(ex)), g1 = LibraryMath.muscleGroup(l?.muscle ?? "")
        let g2 = LibraryMath.muscleGroup(Self.mapMuscle(lib.db(ex.exId)?.muscle ?? ""))
        if let p = [g0, g1, g2].first(where: { Self.MGROUPS.contains($0) }) { add(p) }
        for g in exCredits(ex).keys.sorted() where g == "glutes" || g == "core" { add(g) }
        if Self.test(Self.CORE_MOVE, name) && !Self.ti(#"(front|rear|side) leg raise|step.?up"#, name) { add("core") }
        if Self.test(Self.GLUTE_MOVE, name) && !Self.ti("calf", name) { add("glutes"); if !Self.ti(#"hip thrust|glute bridge|swing"#, name) { add("legs") } }
        let tr = !ex.log.tracking.isEmpty ? ex.log.tracking : (l?.tracking ?? "")
        if gs.isEmpty, g0 != "cardio", g1 != "cardio", !(tr.contains("distance") || tr.contains("duration")), let w {
            let rName = w["routineId"].flatMap { rid in (raw["jk_routines"]?.array ?? []).compactMap(\.object).first { $0["id"] == rid } }?["name"]?.string ?? ""
            let g = LibraryMath.muscleGroup(rName).isEmpty ? LibraryMath.muscleGroup(w["name"]?.string ?? "") : LibraryMath.muscleGroup(rName)
            if Self.MGROUPS.contains(g) { add(g) }
        }
        return gs
    }

    static func sugGroups(_ lbl: String) -> [String] { MGROUPS.filter { (SUGNAME[$0] ?? $0) == lbl } }
    private static func routineEx(_ id: String, _ c: CatalogExercise) -> HEx {
        HEx(["exId": .string(id), "name": .string(c.name), "muscle": .string(c.muscle), "tracking": .string(c.tracking)])
    }

    /// bestRoutineFor(lbl): a saved routine counts only when at least half its exercises hit the label's groups.
    func bestRoutineFor(_ lbl: String) -> [String: JSONValue]? {
        let gs = Self.sugGroups(lbl); var best: [String: JSONValue]?, bf = 0.0
        for r in (raw["jk_routines"]?.array ?? []).compactMap(\.object) {
            let ids = (r["exercises"]?.array ?? []).compactMap(\.string); if ids.isEmpty { continue }
            let c = ids.filter { id in exGroups(Self.routineEx(id, lib.byId(id))).contains { gs.contains($0) } }.count
            let f = Double(c) / Double(ids.count)
            if f >= 0.5 && f > bf { bf = f; best = r }
        }
        return best
    }

    /// startGroupWorkout(lbl): the 5 exercises done most for this label, most first.
    func groupWorkoutIds(_ lbl: String) -> [String] {
        let gs = Self.sugGroups(lbl); var n: [String: Int] = [:], order: [String] = []
        for o in (raw["jk_hist"]?.array ?? []).compactMap(\.object) {
            for ex in (o["exercises"]?.array ?? []).compactMap({ $0.object.map(HEx.init) })
            where !ex.exId.isEmpty && !ex.log.sets.isEmpty && exGroups(ex, workout: o).contains(where: { gs.contains($0) }) {
                if n[ex.exId] == nil { order.append(ex.exId) }
                n[ex.exId, default: 0] += 1
            }
        }
        return Array(order.enumerated().sorted { n[$0.element]! != n[$1.element]! ? n[$0.element]! > n[$1.element]! : $0.offset < $1.offset }.map(\.element).prefix(5))
    }

    struct Suggestion: Identifiable { var id: String { label }; let label: String; let sub: String; let routine: [String: JSONValue]? }

    /// renderSuggest(): the top three labels (nil = no history, the "Let's get started" card).
    func suggestions(today: String) -> [Suggestion]? {
        if hist.isEmpty { return nil }
        var last: [String: String] = [:]
        for o in (raw["jk_hist"]?.array ?? []).compactMap(\.object) {
            let w = Workout(o); guard let date = w.date else { continue }
            let d = JackedDate.dayKey(date, calendar: cal)
            for ex in (o["exercises"]?.array ?? []).compactMap({ $0.object.map(HEx.init) }) where !ex.log.sets.isEmpty {
                for g in exGroups(ex, workout: o) { let l = Self.SUGNAME[g] ?? g; if last[l] == nil || d > last[l]! { last[l] = d } }
            }
        }
        let since: (String) -> Int = { l in last[l].map { max(0, Self.calDays(today, $0)) } ?? 999 }
        var labels: [String] = []; for g in Self.MGROUPS { let l = Self.SUGNAME[g] ?? g; if !labels.contains(l) { labels.append(l) } }
        let picks = labels.enumerated().sorted { since($0.element) != since($1.element) ? since($0.element) > since($1.element) : $0.offset < $1.offset }.prefix(3).map(\.element)
        return picks.map { l in
            let d = since(l)
            return Suggestion(label: l, sub: d >= 900 ? "not trained yet" : d == 0 ? "trained today" : "\(d)d since last", routine: bestRoutineFor(l))
        }
    }

    static func calDays(_ a: String, _ b: String) -> Int {
        let u: (String) -> Double = { k in let p = k.split(separator: "-").compactMap { Double($0) }; guard p.count == 3 else { return 0 }
            var c = DateComponents(); c.year = Int(p[0]); c.month = Int(p[1]); c.day = Int(p[2])
            var g = Calendar(identifier: .gregorian); g.timeZone = TimeZone(identifier: "UTC")!
            return g.date(from: c)!.timeIntervalSince1970 }
        return Int(((u(a) - u(b)) / 86400).rounded())
    }

    /// CURATED_FLAT + todaysCuratedPick(today): the trusted-program routine featured today, cycling every
    /// routine across every program before repeating one. `write` is the jk_sugCuratedLog / jk_sugToday
    /// change to save when today's pick isn't cached yet (nil when it is).
    struct CuratedPick { let pi: Int; let ri: Int; let name: String; let program: String; let source: String }
    func todaysCuratedPick(today: String) -> (pick: CuratedPick?, write: ((inout [String: JSONValue]) -> Void)?) {
        let flat = Curated.programs.enumerated().flatMap { pi, p in p.routines.enumerated().map { ri, r in CuratedPick(pi: pi, ri: ri, name: r.name, program: p.name, source: p.source) } }
        let cache = raw["jk_sugToday"]?.object ?? [:]
        if cache["day"]?.string == today, let c = cache["curated"]?.object, let pi = c["pi"]?.double, let ri = c["ri"]?.double {
            return (CuratedPick(pi: Int(pi), ri: Int(ri), name: c["name"]?.string ?? "", program: c["program"]?.string ?? "", source: c["source"]?.string ?? ""), nil)
        }
        let log = raw["jk_sugCuratedLog"]?.object ?? [:]
        let key: (CuratedPick) -> String = { "\($0.pi)_\($0.ri)" }
        let shownAgo: (CuratedPick) -> Int = { c in log[key(c)]?.string.map { Self.calDays(today, String($0.prefix(10))) } ?? 999 }
        let ranked = flat.enumerated().sorted { shownAgo($0.element) != shownAgo($1.element) ? shownAgo($0.element) > shownAgo($1.element) : $0.offset < $1.offset }.map(\.element)
        let pick = ranked.first { shownAgo($0) >= flat.count - 1 } ?? ranked.first
        return (pick, { r in
            if let p = pick {
                var l = r["jk_sugCuratedLog"]?.object ?? [:]; l[key(p)] = .string(today); r["jk_sugCuratedLog"] = .object(l)
            }
            var c = r["jk_sugToday"]?.object ?? [:]
            c["day"] = .string(today)
            c["curated"] = pick.map { .object(["pi": .number(Double($0.pi)), "ri": .number(Double($0.ri)), "name": .string($0.name), "program": .string($0.program), "source": .string($0.source)]) } ?? .null
            r["jk_sugToday"] = .object(c)
        })
    }
}
