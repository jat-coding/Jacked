import Foundation

/// Every exercise the add-exercise picker can offer, in the PWA's allEx() order: custom
/// (`jk_cex`), built-in machines and runs, exercise-db, warm-ups. exercise-db comes from
/// Jacked's own Storage bucket (DB_URL) and is cached on the phone so the picker works offline.
@MainActor
final class ExerciseCatalog: ObservableObject {
    @Published private(set) var db: [CatalogExercise] = []

    private static let dbURL = URL(string: ExerciseImages.base + "exercises.json")!
    private static let excludedCats: Set<String> = ["stretching", "plyometrics", "cardio", "olympic weightlifting"]
    private static var cacheURL: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("exercises.json")
    }

    func load() async {
        if db.isEmpty, let d = try? Data(contentsOf: Self.cacheURL) { db = Self.parse(d) }
        guard let (d, r) = try? await URLSession.shared.data(from: Self.dbURL),
              (r as? HTTPURLResponse)?.statusCode == 200 else { return }
        let parsed = Self.parse(d)
        if !parsed.isEmpty { db = parsed; try? d.write(to: Self.cacheURL, options: .atomic) }
    }

    func all(custom raw: [String: JSONValue]) -> [CatalogExercise] { Self.all(db: db, custom: raw) }

    nonisolated static func all(db: [CatalogExercise], custom raw: [String: JSONValue]) -> [CatalogExercise] {
        let renames = raw["jk_exRename"]?.object ?? [:]
        let ovs = raw["jk_exOverride"]?.object ?? [:]
        // byId(): a renamed exercise shows the new name; a built-in's edit (jk_exOverride) sets equip / category / assist.
        let rn: (CatalogExercise) -> CatalogExercise = { var e = $0; if let n = renames[e.id]?.string { e.name = n }
            if !e.custom, let o = ovs[e.id]?.object {
                if let q = o["equip"]?.string, !q.isEmpty { e.equip = q }
                if let c = o["category"]?.string, !c.isEmpty { e.category = c }
                if let a = o["assist"]?.bool { e.assist = a }
            }
            return e }
        let cust = (raw["jk_cex"]?.array ?? []).compactMap { $0.object }.compactMap { o -> CatalogExercise? in
            guard let id = o["id"]?.string else { return nil }
            return CatalogExercise(id: id, name: o["name"]?.string ?? id, muscle: o["muscle"]?.string ?? "", equip: o["equip"]?.string ?? "",
                                   tracking: o["tracking"]?.string ?? "weight_reps", assist: o["assist"]?.truthy ?? false, image: nil, custom: true,
                                   category: o["category"]?.string ?? "")
        }
        let warm = PWATables.builtIns.filter { $0.id.hasPrefix("wu_") }.map { e -> CatalogExercise in var e = e; e.category = "warmup"; return e }
        // allEx(): only the built-in runs carry a category ("cardio"); exercise-db rows are listed without one.
        let rest = PWATables.builtIns.filter { !$0.id.hasPrefix("wu_") }
            .map { e -> CatalogExercise in var e = e; if e.tracking == "distance" { e.category = "cardio" }; return e }
        return (cust + rest + db + warm).map(rn)
    }

    /// byId(): custom first, then built-ins, then exercise-db, else the humanised id.
    func byId(_ id: String, raw: [String: JSONValue]) -> CatalogExercise {
        all(custom: raw).first { $0.id == id }
            ?? CatalogExercise(id: id, name: id.replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " "),
                               muscle: "", equip: "", tracking: "weight_reps", assist: false, image: nil, custom: false)
    }

    private struct DBRow: Decodable {
        let id: String?; let name: String?; let equipment: String?; let category: String?
        let primaryMuscles: [String]?; let images: [String]?; let instructions: [String]?
        let mechanic: String?; let secondaryMuscles: [String]?
    }

    static func parse(_ d: Data) -> [CatalogExercise] {
        guard let rows = try? JSONDecoder().decode([DBRow].self, from: d) else { return [] }
        let idOK = try! NSRegularExpression(pattern: #"^[A-Za-z0-9_-]+$"#)
        return rows.compactMap { r in
            guard let id = r.id, idOK.firstMatch(in: id, range: NSRange(id.startIndex..., in: id)) != nil,
                  !excludedCats.contains((r.category ?? "").lowercased()) else { return nil }
            let m = (r.primaryMuscles?.first ?? "").lowercased()
            return CatalogExercise(id: id, name: prettyDB(r.name ?? id, r.equipment ?? ""), muscle: m == "abdominals" ? "core" : m,
                                   equip: PWATables.EQUIP_FIX[id] ?? r.equipment ?? "",
                                   tracking: PWATables.TIMED_HOLDS.contains(id) ? "duration" : "weight_reps",
                                   assist: false, image: r.images?.first, custom: false,
                                   images: r.images ?? [], instructions: r.instructions ?? [],
                                   mechanic: PWATables.MECH_FIX[id] ?? r.mechanic ?? "", secondary: r.secondaryMuscles ?? [], dbEquip: r.equipment ?? "", dbName: r.name ?? "")
        }
    }

    /// prettyDB: "Movement (equipment, detail)", display only.
    static func prettyDB(_ name: String, _ equip: String) -> String {
        guard !name.isEmpty else { return name }
        var base = name, detail = ""
        let dash = base.components(separatedBy: try! NSRegularExpression(pattern: #"\s+-\s+"#))
        if dash.count > 1 {
            base = dash[0]
            detail = dash.dropFirst().joined(separator: " ").lowercased()
                .replacingOccurrences(of: #"\bwith\b"#, with: "", options: .regularExpression)
                .replacingOccurrences(of: #"\bmedium\b"#, with: "med", options: .regularExpression)
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)
        }
        let tag = PWATables.EQUIP_TAG[equip.lowercased()] ?? ""
        let drop: Set<String> = ["barbell", "dumbbell", "cable", "machine", "band", "bands", "kettlebell", "kettlebells", "e-z", "ez"]
        let words: (String) -> [String] = { $0.split(whereSeparator: \.isWhitespace).map(String.init) }
        if !tag.isEmpty { base = words(base).filter { !drop.contains($0.lowercased()) }.joined(separator: " ") }
        if !detail.isEmpty { detail = words(detail).filter { !drop.contains($0.lowercased()) }.joined(separator: " ") }
        if base.isEmpty { base = name }
        var paren = words([tag, detail].filter { !$0.isEmpty }.joined(separator: ", ")).prefix(3).joined(separator: " ")
        if paren.hasSuffix(",") { paren.removeLast() }
        return paren.isEmpty ? base : "\(base) (\(paren))"
    }
}

private extension String {
    func components(separatedBy re: NSRegularExpression) -> [String] {
        var out: [String] = [], last = startIndex
        for m in re.matches(in: self, range: NSRange(startIndex..., in: self)) {
            guard let r = Range(m.range, in: self) else { continue }
            out.append(String(self[last..<r.lowerBound])); last = r.upperBound
        }
        out.append(String(self[last...]))
        return out
    }
}
