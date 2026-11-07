// Swift side of the Import parity check: reads import-fixtures.json (written by import-gen.mjs from the PWA's own
// importWorkoutCsv / importJsonBackup), runs ImportMath, writes import-swift-out.json.
import Foundation

struct ICase: Decodable { let name: String; let kind: String; let raw: [String: JSONValue]?; let text: String; let unit: String?; let dayFirst: Bool? }
struct IOut: Encodable { let name: String; let got: [String: JSONValue] }

@main struct ImportMain {
    static func main() throws {
        let dir = URL(fileURLWithPath: CommandLine.arguments[1])
        let cases = try JSONDecoder().decode([ICase].self, from: Data(contentsOf: dir.appendingPathComponent("import-fixtures.json")))
        let db = ExerciseCatalog.parse(try Data(contentsOf: dir.appendingPathComponent("exercises.json")))
        let outs: [IOut] = cases.map { c in
            if c.kind == "date" {
                let d = ImportMath.parseImportDate(c.text, dayFirst: c.dayFirst ?? false)
                return IOut(name: c.name, got: ["ms": d.map { .number(($0.timeIntervalSince1970 * 1000).rounded()) } ?? .null])
            }
            var raw = c.raw ?? [:], toast = ""
            if c.kind == "json" {
                switch ImportMath.parseBackup(c.text) {
                case .invalid: toast = "Invalid backup file"
                case .noData: toast = "No Jacked data found in file"
                case .bundle(let b):
                    let r = ImportMath.applyBundle(&raw, b)
                    toast = r.written.isEmpty ? "Nothing importable in that file \u{2014} nothing was changed."
                        : r.rejected.isEmpty ? "Data imported \u{2014} reloading\u{2026}" : "Imported \u{2014} skipped \(r.rejected.count) malformed section(s). Reloading\u{2026}"
                }
            } else {
                switch ImportMath.plan(c.text) {
                case .failure(let e): toast = e.message
                case .success(let p):
                    let unit = c.unit.flatMap(ImportMath.CSVPlan.Unit.init(rawValue:))
                    if p.needsUnit && unit == nil { toast = "Import cancelled"; break }
                    switch ImportMath.importCSV(p, unit: unit, raw: raw, lib: ExerciseCatalog.all(db: db, custom: raw)) {
                    case .failure(let e): toast = e.message
                    case .success(let r): raw = r.raw; toast = ImportMath.doneMessage(r)
                    }
                }
            }
            return IOut(name: c.name, got: ["blob": .object(raw), "toast": .string(toast)])
        }
        try JSONEncoder().encode(outs).write(to: dir.appendingPathComponent("import-swift-out.json"))
        print("swift ran \(outs.count) import cases")
    }
}
