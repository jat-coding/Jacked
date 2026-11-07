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
    static func list(_ all: [CatalogExercise], raw: [String: JSONValue], query: String, chip: String?) -> [CatalogExercise] {
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
        }.prefix(80).map(\.element)
    }

    static func capW(_ s: String) -> String {
        s.replacingOccurrences(of: "_", with: " ").split(separator: " ", omittingEmptySubsequences: false)
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
    }
}
