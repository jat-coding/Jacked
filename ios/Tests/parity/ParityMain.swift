// Swift side of the merge parity check: reads fixtures.json (written by gen.mjs from the PWA's
// own mergeBackup), runs every case through BackupMerge.merge, writes swift-out.json.
import Foundation

struct Case: Decodable { let name: String; let cloud: [String: JSONValue]; let local: [String: JSONValue]; let pending: [String] }
struct Out: Encodable { let name: String; let actual: [String: JSONValue] }

@main struct ParityMain {
    static func main() throws {
        let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".")
        let cases = try JSONDecoder().decode([Case].self, from: Data(contentsOf: dir.appendingPathComponent("fixtures.json")))
        let outs = cases.map { Out(name: $0.name, actual: BackupMerge.merge(cloud: $0.cloud, local: $0.local, pendingNotes: $0.pending)) }
        try JSONEncoder().encode(outs).write(to: dir.appendingPathComponent("swift-out.json"))
        print("swift merged \(outs.count) cases")
    }
}
