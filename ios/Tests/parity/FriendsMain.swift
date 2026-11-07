// Swift side of the Friends parity check: reads friends-fixtures.json (written by friends-gen.mjs from the
// PWA's own yourStats/myActivity/monthOf/crownCodes), runs each account through FriendsMath with the clock
// pinned, writes friends-swift-out.json in the same shape.
import Foundation

struct FCase: Decodable { let name: String; let now: Double; let raw: [String: JSONValue]; let rows: [[String: JSONValue]] }

@main struct FriendsMain {
    @MainActor static func main() throws {
        let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".")
        let cases = try JSONDecoder().decode([FCase].self, from: Data(contentsOf: dir.appendingPathComponent("friends-fixtures.json")))
        let db = ExerciseCatalog.parse(try Data(contentsOf: dir.appendingPathComponent("exercises.json")))
        let outs: [JSONValue] = cases.map { c in
            let m = MetricsMath(raw: c.raw, lib: ExLib(db: db, raw: c.raw), now: Date(timeIntervalSince1970: c.now / 1000))
            let badges = m.computeBadges().list
            let friends = c.rows.compactMap { Person(row: $0, pending: false) }
            let mo: [JSONValue] = friends.map { f in let x = m.monthOf(f)
                return .object(["v": .number(x.v), "w": .number(x.w), "p": .number(x.p), "pv": .number(x.pv), "st": .number(x.st), "c": .number(x.c), "b": .number(x.b)]) }
            let code = c.raw["jk_prof"]?.object?["code"]?.string ?? ""
            var me = Person(you: code); me.pmVol = m.monthStats(badges: nil).pv
            let crown = m.crownCodes([me] + friends).sorted().map(JSONValue.string)
            return .object(["name": .string(c.name), "got": .object(["pub": .object(m.publishColumns(badges: badges)), "monthOf": .array(mo), "crown": .array(crown)])])
        }
        try JSONEncoder().encode(outs).write(to: dir.appendingPathComponent("friends-swift-out.json"))
        print("swift finished \(outs.count) accounts")
    }
}
