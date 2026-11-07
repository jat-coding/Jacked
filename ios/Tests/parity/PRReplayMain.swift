// Swift side of the PR replay parity check: reads prreplay-fixtures.json (written by
// prreplay-gen.mjs from the PWA's own prReplay), runs PRReplay.compute, writes prreplay-swift-out.json.
import Foundation

struct RCase: Decodable { let name: String; let hist: [JSONValue]; let bw: Double }
struct ROut: Encodable { let name: String; let got: [String: [String: [[JSONValue]]]] }

@main struct PRReplayMain {
    static func main() throws {
        let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".")
        let cases = try JSONDecoder().decode([RCase].self, from: Data(contentsOf: dir.appendingPathComponent("prreplay-fixtures.json")))
        let outs: [ROut] = cases.map { c in
            let m = PRReplay.compute(c.hist.compactMap { $0.object }, bw: c.bw)
            let row: (PRReplay.Hit) -> [JSONValue] = { [.string($0.exId), .number(Double($0.ei)), .number(Double($0.si)), .number($0.weight), .number($0.reps)] }
            return ROut(name: c.name, got: m.mapValues { ["list": $0.list.map(row), "sug": $0.sug.map(row)] })
        }
        try JSONEncoder().encode(outs).write(to: dir.appendingPathComponent("prreplay-swift-out.json"))
        print("swift replayed \(outs.count) histories")
    }
}
