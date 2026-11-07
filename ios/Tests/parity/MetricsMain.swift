// Swift side of the Metrics parity check: reads metrics-fixtures.json (written by metrics-gen.mjs
// from the PWA's own stats functions) and exercises.json, runs each account through MetricsMath
// with the clock pinned to the same instant, writes metrics-swift-out.json.
import Foundation

struct MCase: Decodable { let name: String; let now: Double; let raw: [String: JSONValue] }

@main struct MetricsMain {
    @MainActor static func main() throws {
        let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".")
        let cases = try JSONDecoder().decode([MCase].self, from: Data(contentsOf: dir.appendingPathComponent("metrics-fixtures.json")))
        let db = ExerciseCatalog.parse(try Data(contentsOf: dir.appendingPathComponent("exercises.json")))
        print("catalog", db.count)
        let n: (Double) -> JSONValue = { .number($0) }
        let outs: [JSONValue] = cases.map { c in
            let m = MetricsMath(raw: c.raw, lib: ExLib(db: db, raw: c.raw), now: Date(timeIntervalSince1970: c.now / 1000))
            let o = m.overview(), l = m.lifetime()
            var e: [String: JSONValue] = [:]
            e["overview"] = .object(["thisMonth": n(Double(o.thisMonth)), "allTime": n(Double(o.allTime)), "prs": n(Double(o.prs))])
            e["summary"] = m.summary().map { s in .object(["last7": n(Double(s.last7)), "last30": n(Double(s.last30)), "avgVol": n(s.avgVol),
                                                          "prs": n(Double(s.prs)), "least": s.leastTrained.map(JSONValue.string) ?? .null]) } ?? .null
            e["lifetime"] = .object(["workouts": n(Double(l.workouts)), "volume": n(l.volume), "sets": n(Double(l.sets)), "avgMin": n(Double(l.avgMin)),
                                     "top": l.top.map { t in .object(["exId": .string(t.exId), "name": .string(t.name), "weight": n(t.weight), "reps": n(t.reps)]) } ?? .null])
            e["recaps"] = .array(m.recaps().map { r in
                .object(["y": n(Double(r.y)), "m": n(Double(r.m)), "sessions": n(Double(r.sessions)), "vol": n(r.vol), "prs": n(Double(r.prs)),
                         "days": n(Double(r.days)),
                         "best": r.best.map { b in .object(["name": .string(b.name), "w": n(b.w), "r": n(b.r)]) } ?? .null,
                         "bw": r.bestWeek.map { b in .object(["s0": n(b.start.timeIntervalSince1970 * 1000), "vol": n(b.vol), "n": n(Double(b.n))]) } ?? .null,
                         "comeback": .bool(r.comeback),
                         "challenge": r.challenge.map { ch in .object(["group": .string(ch.group), "target": n(ch.target), "done": .bool(ch.done)]) } ?? .null])
            })
            e["usage"] = .object(m.muscleUsage(credit: true).mapValues(n))
            e["usage0"] = .object(m.muscleUsage(credit: false).mapValues(n))
            let p = m.musclePerf()
            e["perf"] = .object(["mode": .string(p.mode), "score": .object(p.score.mapValues(n))])
            return .object(["name": .string(c.name), "got": .object(e)])
        }
        try JSONEncoder().encode(outs).write(to: dir.appendingPathComponent("metrics-swift-out.json"))
        print("swift finished \(outs.count) accounts")
    }
}
