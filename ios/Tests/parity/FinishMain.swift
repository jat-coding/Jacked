// Swift side of the finish/PR parity check: reads finish-fixtures.json (written by finish-gen.mjs
// from the PWA's own buildFinishRec + commitPRs), runs each workout through
// WorkoutMath.buildFinishRec, writes finish-swift-out.json.
import Foundation

struct FCase: Decodable { let name: String; let aw: [String: JSONValue]; let startedAt: Double; let endMs: Double; let state: [String: JSONValue] }
struct FOut: Encodable { let name: String; let rec: [String: JSONValue]; let state: [String: JSONValue] }

@main struct FinishMain {
    static func main() throws {
        let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".")
        let cases = try JSONDecoder().decode([FCase].self, from: Data(contentsOf: dir.appendingPathComponent("finish-fixtures.json")))
        let outs: [FOut] = cases.map { c in
            var raw: [String: JSONValue] = [:]
            for (k, v) in c.state { raw["jk_" + k] = v }
            let aw = ActiveWorkout(json: c.aw, startedAt: c.startedAt)
            let f = WorkoutMath.buildFinishRec(aw, endMs: c.endMs, raw: &raw, now: "NOW")
            var st: [String: JSONValue] = [:]
            for (k, v) in raw { st[String(k.dropFirst(3))] = v }
            return FOut(name: c.name, rec: f.rec, state: st)
        }
        try JSONEncoder().encode(outs).write(to: dir.appendingPathComponent("finish-swift-out.json"))
        print("swift finished \(outs.count) workouts")
    }
}
