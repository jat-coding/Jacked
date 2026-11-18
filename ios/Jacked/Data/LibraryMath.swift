import Foundation

/// The Library page's filtering and ordering (index.html exSearchMatch / chipMatch / exRankCmp)
/// and the body-map muscle grouping it shares with Metrics (muscleGroup).
enum LibraryMath {
    static let chipCats: [(String, String)] = [("chest", "Chest"), ("back", "Back"), ("shoulders", "Shoulders"), ("biceps", "Biceps"),
                                               ("triceps", "Triceps"), ("legs", "Legs"), ("glutes", "Glutes"), ("core", "Core"),
                                               ("cardio", "Cardio"), ("warmup", "Warm-up")]

    private static func re(_ p: String) -> NSRegularExpression { try! NSRegularExpression(pattern: p) }
    private static let groups: [(NSRegularExpression, String)] = [
        (re(#"quad|hamstring|\bcalf\b|\bcalves\b|\blegs?\b|abductor|adductor"#), "legs"),
        (re("glute"), "glutes"),
        (re(#"chest|\bpecs?\b|pectoral"#), "chest"),
        (re(#"\blats?\b|latissimus|\bback\b|\btraps?\b|trapezius|spine|teres|rhomboid|erector"#), "back"),
        (re("bicep|forearm"), "biceps"),
        (re("tricep"), "triceps"),
        (re(#"shoulder|\bdelts?\b|deltoid|\bneck\b"#), "shoulders"),
        (re(#"\babs?\b|abdominal|\bcore\b|oblique"#), "core"),
        (re("cardio"), "cardio"),
    ]

    /// muscleGroup: a muscle tag (or a routine/workout name) to one of the body-map groups, or "".
    static func muscleGroup(_ m: String) -> String {
        let s = m.lowercased(), r = NSRange(s.startIndex..., in: s)
        return groups.first { $0.0.firstMatch(in: s, range: r) != nil }?.1 ?? ""
    }

    static func isCardioCat(_ e: CatalogExercise) -> Bool {
        e.muscle.lowercased() == "cardio" || e.category.lowercased() == "cardio" || e.tracking == "distance"
    }

    /// chipOf: the chip an exercise files under, or nil (a custom "Full Body" lift).
    static func chipOf(_ e: CatalogExercise) -> String? {
        if e.category.lowercased() == "warmup" { return "warmup" }
        if isCardioCat(e) { return "cardio" }
        let g = muscleGroup(e.muscle)
        return chipCats.contains { $0.0 == g } ? g : nil
    }

    /// renderAEList: hidden left out, search + chip, ranked like the Library, and (no search) up to 8
    /// "Used before" exercises pulled to the top. `rest` is capped at `cap`; `more` is what was cut.
    static func pickerList(_ all: [CatalogExercise], raw: [String: JSONValue], query: String, chip: String?, cap: Int = 60)
        -> (recent: [CatalogExercise], rest: [CatalogExercise], more: Int) {
        let full = list(all, raw: raw, query: query, chip: chip, cap: Int.max)
        var recent: [CatalogExercise] = []
        if query.trimmingCharacters(in: .whitespaces).isEmpty {
            let hidden = Set((raw["jk_hiddenEx"]?.array ?? []).compactMap(\.string))
            var byId: [String: CatalogExercise] = [:]; for e in all where byId[e.id] == nil { byId[e.id] = e }
            recent = Array(usedIds(raw).compactMap { byId[$0] }.filter { !hidden.contains($0.id) && chipMatch(chip, $0) }.prefix(8))
        }
        let rIds = Set(recent.map(\.id))
        let rest = full.filter { !rIds.contains($0.id) }
        return (recent, Array(rest.prefix(cap)), max(0, rest.count - cap))
    }

    static func chipMatch(_ flt: String?, _ e: CatalogExercise) -> Bool {
        guard let flt else { return true }
        if flt == "warmup" { return e.category.lowercased() == "warmup" }
        if flt == "cardio" { return isCardioCat(e) }
        return muscleGroup(e.muscle) == flt
    }

    /// exSearchMatch: every word somewhere in name + muscle + equipment + category, plural-tolerant.
    static func searchMatch(_ q: String, _ e: CatalogExercise) -> Bool {
        let words = q.lowercased().split(whereSeparator: \.isWhitespace).map(String.init)
        if words.isEmpty { return true }
        let hay = [e.name, e.muscle, e.equip, e.category].filter { !$0.isEmpty }.joined(separator: " ").lowercased()
        let flat = hay.filter { $0.isLetter || $0.isNumber }
        return words.allSatisfy { w in
            if hay.contains(w) { return true }
            let fw = w.filter { $0.isLetter || $0.isNumber }
            if fw.count > 2 && flat.contains(fw) { return true }
            let stem = w.replacingOccurrences(of: "(es|s)$", with: "", options: .regularExpression)
            return stem.count > 1 && (hay.contains(stem) || hay.contains(stem + "s") || hay.contains(stem + "es"))
        }
    }

    /// usedExIds: exercises from history (newest first), then from routines.
    static func usedIds(_ raw: [String: JSONValue]) -> [String] {
        var seen = Set<String>(), out: [String] = []
        for w in (raw["jk_hist"]?.array ?? []).reversed() {
            for ex in w["exercises"]?.array ?? [] { if let id = ex["exId"]?.string, seen.insert(id).inserted { out.append(id) } }
        }
        for r in raw["jk_routines"]?.array ?? [] {
            for id in (r["exercises"]?.array ?? []).compactMap(\.string) where seen.insert(id).inserted { out.append(id) }
        }
        return out
    }

    /// renderEx(): hidden left out, search + chip, favourites -> used before -> the rest (stable), first 80.
    static func list(_ all: [CatalogExercise], raw: [String: JSONValue], query: String, chip: String?, cap: Int = 80) -> [CatalogExercise] {
        let hidden = Set((raw["jk_hiddenEx"]?.array ?? []).compactMap(\.string))
        let fav = Set((raw["jk_favEx"]?.array ?? []).compactMap(\.string))
        var rank: [String: Int] = [:]; for (i, id) in usedIds(raw).enumerated() { rank[id] = i }
        let f = all.enumerated().filter { !hidden.contains($0.element.id) && searchMatch(query, $0.element) && chipMatch(chip, $0.element) }
        return f.sorted { a, b in
            let fa = fav.contains(a.element.id) ? 0 : 1, fb = fav.contains(b.element.id) ? 0 : 1
            if fa != fb { return fa < fb }
            let ua = rank[a.element.id] ?? Int.max, ub = rank[b.element.id] ?? Int.max
            if ua != ub { return ua < ub }
            return a.offset < b.offset
        }.prefix(cap).map(\.element)
    }

    static func capW(_ s: String) -> String {
        s.replacingOccurrences(of: "_", with: " ").split(separator: " ", omittingEmptySubsequences: false)
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
    }
}

/// The name matcher (index.html normName / resolveExercise): a Hevy-style "Bench Press (Barbell)" to a library
/// exercise id. Used by the CSV import and by the badge name re-match (badgeStdId).
enum ExerciseMatch {
    private static func rx(_ p: String) -> NSRegularExpression { try! NSRegularExpression(pattern: p) }

    static func normName(_ s: String) -> String {
        var t = s.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !(0x300...0x36F).contains($0.value) }
            .map(String.init).joined().lowercased()
        t = t.replacingOccurrences(of: #"\(.*?\)"#, with: " ", options: .regularExpression)
        t = t.replacingOccurrences(of: "[^a-z0-9 ]", with: " ", options: .regularExpression)
        t = t.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        return t.trimmingCharacters(in: .whitespaces)
    }
    private static func words(_ s: String) -> [String] { normName(s).split(separator: " ").map(String.init) }
    private static func paren(_ s: String) -> String {
        let re = rx(#"\(([^)]*)\)"#), ns = s as NSString
        return re.matches(in: s, range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range(at: 1)) }.joined(separator: " ")
    }
    private static func flatEq(_ s: String) -> String {
        let f = s.lowercased().replacingOccurrences(of: "[^a-z]", with: "", options: .regularExpression)
        return ["bodyweight": "bodyonly", "bands": "band", "kettlebells": "kettlebell", "ezcurlbar": "ezbar", "ezbar": "ezbar", "smithmachine": "machine"][f] ?? f
    }
    private static let EQ: Set<String> = ["barbell", "dumbbell", "machine", "cable", "bodyonly", "band", "kettlebell", "ezbar", "other", "medicineball", "exerciseball"]
    private static let SOFT: Set<String> = ["grip", "medium", "med", "standard", "with", "the", "a", "and", "v", "attachment"]
    private static let ALIAS: [(String, String)] = [(#"\boverhead press\b"#, "standing military press"), (#"\bohp\b"#, "standing military press"),
                                                    (#"\brdl\b"#, "romanian deadlift"), (#"\bside plank\b"#, "side bridge"), (#"\bskullcrushers?\b"#, "skullcrusher")]
    private static func tokEq(_ t: String, _ w: String) -> Bool { t == w || t == w + "s" || t == w + "es" || w == t + "s" || w == t + "es" }
    private static func flat(_ a: [String]) -> String { a.joined().replacingOccurrences(of: "e?s$", with: "", options: .regularExpression) }

    struct Candidate { let e: CatalogExercise; let base: [String]; let detail: [String]; let hay: [String]; let eq: String; let builtIn: Bool }

    /// The scored library for resolveExercise, built once per import (allEx() order).
    static func candidates(_ lib: [CatalogExercise]) -> [Candidate] {
        let b = Set(PWATables.builtIns.filter { !$0.id.hasPrefix("wu_") }.map(\.id))
        return lib.map { e in
            let base = words(e.name), detail = words(paren(e.name).replacingOccurrences(of: ",", with: " "))
            return Candidate(e: e, base: base, detail: detail,
                             hay: base + words(e.equip) + (e.dbName.isEmpty ? [] : words(e.dbName)) + detail, eq: flatEq(e.equip),
                             builtIn: b.contains(e.id) && !e.custom)
        }
    }

    static func resolveExercise(_ keyword: String, _ lib: [Candidate]) -> String? {
        let all = words(keyword).filter { $0.count > 1 }
        if all.isEmpty { return nil }
        let hint = flatEq(paren(keyword)), hintEq = EQ.contains(hint) ? hint : ""
        let cardio = MetricsMath.guessMuscle(keyword) == "cardio"
        func pick(_ want: [String]) -> (String, Double)? {
            var best: CatalogExercise?, bs = Double.infinity
            let fw = flat(want)
            for c in lib {
                if cardio && !LibraryMath.isCardioCat(c.e) { continue }
                let joined = fw == flat(c.base)
                if !joined && !want.allSatisfy({ w in c.hay.contains { tokEq($0, w) } }) { continue }
                var sc = joined ? 0 : c.base.filter { t in !want.contains { tokEq(t, $0) } }.reduce(0.0) { $0 + (SOFT.contains($1) ? 0.5 : 1) }
                sc += 0.01 * Double(want.filter { !c.base.contains($0) }.count)
                sc += 0.1 * Double(c.detail.filter { t in !SOFT.contains(t) && !EQ.contains(flatEq(t)) && !want.contains { tokEq(t, $0) } }.count)
                if !hintEq.isEmpty && c.eq != hintEq { sc += 2 }
                if c.builtIn { sc += 0.5 }
                if sc < bs { bs = sc; best = c.e }
            }
            return best.map { ($0.id, bs) }
        }
        let gripRe = rx("^(wide|close|narrow|neutral|rope|single|one|arm|two)$")
        func tryAll(_ want: [String]) -> (String, Double)? {
            pick(want) ?? pick(want.filter { !SOFT.contains($0) && gripRe.firstMatch(in: $0, range: NSRange($0.startIndex..., in: $0)) == nil })
        }
        let joinedAll = all.joined(separator: " ")
        let alias = ALIAS.reduce(joinedAll) { $0.replacingOccurrences(of: $1.0, with: $1.1, options: .regularExpression) }
        let hits = [tryAll(all), alias != joinedAll ? tryAll(alias.split(separator: " ").map(String.init)) : nil].compactMap { $0 }
        return hits.enumerated().sorted { $0.element.1 != $1.element.1 ? $0.element.1 < $1.element.1 : $0.offset < $1.offset }.first?.element.0
    }
}
