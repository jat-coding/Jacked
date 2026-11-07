// Swift side of the badge parity check: reads badges-fixtures.json (written by badges-gen.mjs from the
// PWA's own computeBadges), runs each account through BadgeMath with the clock pinned, writes
// badges-swift-out.json in the same shape.
import Foundation

struct BCase: Decodable { let name: String; let now: Double; let raw: [String: JSONValue] }

@main struct BadgesMain {
    @MainActor static func main() throws {
        let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".")
        let cases = try JSONDecoder().decode([BCase].self, from: Data(contentsOf: dir.appendingPathComponent("badges-fixtures.json")))
        let db = ExerciseCatalog.parse(try Data(contentsOf: dir.appendingPathComponent("exercises.json")))
        let s: (String?) -> JSONValue = { $0.map(JSONValue.string) ?? .null }
        let outs: [JSONValue] = cases.map { c in
            let m = MetricsMath(raw: c.raw, lib: ExLib(db: db, raw: c.raw), now: Date(timeIntervalSince1970: c.now / 1000))
            let r = m.computeBadges()
            let list: [JSONValue] = r.list.map { b in
                .object(["name": .string(b.name), "earned": .bool(b.earned), "tier": s(b.tier), "curV": s(b.curV),
                         "all": b.all.map { a in .object(["v": .string(a.v), "tier": a.hasTier ? s(a.tier) : .string("(none)")]) } ?? .null,
                         "desc": .string(b.desc), "detail": s(b.detail),
                         "sections": .array(b.sections.map { x in .object(["t": .string(x.t), "met": .bool(x.met), "rows": .array(x.rows.map { .array([.string($0.0), .string($0.1)]) })]) }),
                         "lifts": .array(b.lifts.map { l in .object(["key": .string(l.key), "tier": s(l.tier), "disp": .string(l.disp)]) }),
                         "months": .number(Double(b.months)), "everYM": s(b.everYM)])
            }
            let T = r.ladders, n: ([Double]) -> JSONValue = { .array($0.map(JSONValue.number)) }
            return .object(["name": .string(c.name), "got": .object(["list": .array(list), "mb": .object(r.monthBadges),
                "T": .object(["bench": n(T.bench), "ohpFrac": n(T.ohp), "squatFrac": n(T.squat), "pullup": n(T.pullup), "pushup": n(T.pushup), "cardio": n(T.cardio)])])])
        }
        try JSONEncoder().encode(outs).write(to: dir.appendingPathComponent("badges-swift-out.json"))
        print("swift finished \(outs.count) accounts")
    }
}
