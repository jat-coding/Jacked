// Swift side of the Edit / Delete Workout parity check: reads histrepair-fixtures.json (written by
// histrepair-gen.mjs from the PWA's own saveWE / commitHistRepair), runs HistRepair, writes histrepair-swift-out.json.
import Foundation

struct HOp: Decodable { let kind: String; let id: JSONValue; let dayKey: String?; let name: String?; let draft: [String: JSONValue]? }
struct HCase: Decodable { let name: String; let raw: [String: JSONValue]; let op: HOp }
struct HOut: Encodable { let name: String; let got: [String: JSONValue] }

@main struct HistRepairMain {
    static func main() throws {
        let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".")
        let cases = try JSONDecoder().decode([HCase].self, from: Data(contentsOf: dir.appendingPathComponent("histrepair-fixtures.json")))
        let at = "2026-11-07T15:30:00.000Z"
        let outs: [HOut] = cases.map { c in
            var raw = c.raw
            if c.op.kind == "edit" { HistRepair.saveEdit(&raw, id: c.op.id, draft: c.op.draft ?? [:], name: c.op.name ?? "", dayKey: c.op.dayKey, at: at) }
            else { HistRepair.delete(&raw, id: c.op.id, at: at) }
            return HOut(name: c.name, got: raw)
        }
        try JSONEncoder().encode(outs).write(to: dir.appendingPathComponent("histrepair-swift-out.json"))
        print("swift ran \(outs.count) edits/deletes")
    }
}
