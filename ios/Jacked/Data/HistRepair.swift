import Foundation

/// Edit Workout / Delete Workout on a past workout, ported from the PWA function by function
/// (index.html saveWE, delW inside openWD, chTouched, commitHistRepair, setRepairedPR,
/// setRepairedCardioPR, setRepairedHoldPR, chHistBest, replayRecord). Pure: works on the raw
/// blob, no disk, no network. An edited exercise gets its PR stars and records rebuilt from the
/// whole history, stamped `repaired` so the cloud merge accepts a lower record than a stale copy.
/// Parity: Tests/parity/histrepair-run.sh (the PWA's real functions in node vs this).
///
/// iPhone-only addition, not in the PWA: `stampLrev` after the port. The merge keeps the local
/// copy of a workout unless the cloud's carries a higher `lrev`, so an edit without a bump is
/// reverted by the web app's next save from its own (older) local copy (Fable review 2026-11-07).
enum HistRepair {
    typealias Obj = [String: JSONValue]

    private static func d(_ v: JSONValue?) -> Double { v?.string.map(BackupMerge.parseISO) ?? .nan }   // +new Date(x)
    private static func exOf(_ v: JSONValue) -> LogExercise? { v.object.map(LogExercise.init(json:)) }
    private static func hist(_ raw: Obj) -> [JSONValue] { raw["jk_hist"]?.array ?? [] }

    // MARK: saveWE / delW

    /// saveWE(): `draft` is the edited copy of workout `id`; `dayKey` the date field ("YYYY-MM-DD", nil = unchanged).
    static func saveEdit(_ raw: inout Obj, id: JSONValue, draft d0: Obj, name: String, dayKey: String?, at: String) {
        var draft = d0
        let nm = name.trimmingCharacters(in: .whitespacesAndNewlines)
        draft["name"] = .string(!nm.isEmpty ? nm : (draft["name"]?.truthy == true ? draft["name"]!.string ?? "Workout" : "Workout"))
        if let dv = dayKey, !dv.isEmpty {
            let old = d(draft["date"])
            var hh = 12, mm = 0
            if !old.isNaN {
                let c = Calendar.current.dateComponents([.hour, .minute], from: Date(timeIntervalSince1970: old / 1000))
                hh = c.hour ?? 12; mm = c.minute ?? 0
            }
            let p = dv.split(separator: "-").compactMap { Int($0) }
            if p.count == 3, let t = Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: hh, minute: mm, second: 0)) {
                draft["date"] = .string(isoString(t))
            }
        }
        let bw = jsNum(raw["jk_bw"]), wid = PRReplay.key(draft["id"])
        let exs = (draft["exercises"]?.array ?? []).compactMap(exOf)
        let ts = exs.reduce(0) { $0 + $1.sets.filter(\.done).count }
        let vol = exs.reduce(0.0) { a, e in
            WorkoutMath.isWT(e) ? a + e.sets.filter(\.done).reduce(0.0) { $0 + WorkoutMath.volWeight(e, $1, workoutId: wid, bw: bw) * max(0, $1.reps) } : a
        }
        draft["sets"] = .number(Double(ts)); draft["totalVolume"] = .number((vol + 0.5).rounded(.down))   // Math.round
        var h = hist(raw)
        guard let idx = h.firstIndex(where: { $0["id"] == id }) else { return }
        let old = h[idx].object ?? [:]
        if old["date"] == draft["date"] { h[idx] = .object(draft) } else { h.remove(at: idx); h = WorkoutMath.histInsert(h, draft) }
        let ch = chTouched(old, draft)
        if !ch.isEmpty { commitHistRepair(&raw, h, ch, at: at) } else { raw["jk_hist"] = .array(h) }
    }

    /// delW(): drop the workout, rebuild what it held, tombstone its id.
    static func delete(_ raw: inout Obj, id: JSONValue, at: String) {
        let all = hist(raw), gone = all.first { $0["id"] == id }?.object, rest = all.filter { $0["id"] != id }
        let ch = gone.map { chTouched($0, nil) } ?? []
        if !ch.isEmpty { commitHistRepair(&raw, rest, ch, at: at) } else { raw["jk_hist"] = .array(rest) }
        var del = raw["jk_deleted"]?.array ?? []
        if !del.contains(id) { del.append(id) }
        raw["jk_deleted"] = .array(del)
    }

    /// chTouched(a, b): exercises whose sets, tracking or position changed, or all of them when the date moved.
    static func chTouched(_ a: Obj?, _ b: Obj?) -> [String] {
        func key(_ w: Obj?) -> (order: [String], m: [String: [JSONValue]]) {
            var m: [String: [JSONValue]] = [:], order: [String] = []
            for (ei, ex) in (w?["exercises"]?.array ?? []).enumerated() {
                let id = ex["exId"]?.string ?? ""
                if m[id] == nil { order.append(id) }
                m[id, default: []].append(.array([.number(Double(ei)), ex["tracking"] ?? .null, ex["sets"] ?? .null]))
            }
            return (order, m)
        }
        let ka = key(a), kb = key(b), moved = a != nil && b != nil && a!["date"] != b!["date"]
        var ids: [String] = []
        for id in ka.order + kb.order where !id.isEmpty && id != "?" && !ids.contains(id) && (moved || ka.m[id] != kb.m[id]) { ids.append(id) }
        return ids
    }

    // MARK: commitHistRepair

    static func commitHistRepair(_ raw: inout Obj, _ hist2: [JSONValue], _ exIdList: [String], at: String) {
        let exIds = Set(exIdList), bw = jsNum(raw["jk_bw"])
        let prev = hist(raw)
        var prevById: [JSONValue: Obj] = [:]
        for w in prev { if let id = w["id"], prevById[id] == nil, let o = w.object { prevById[id] = o } }
        func has(_ w: JSONValue) -> Bool { (w["exercises"]?.array ?? []).contains { exIds.contains($0["exId"]?.string ?? "\u{0}") } }
        let wids = Set(prev.filter(has).compactMap { $0["id"] })
        func replay(_ h: [JSONValue]) -> PRReplay.Full { PRReplay.full(h.compactMap(\.object), bw: bw) }
        let before = replay(prev), after = replay(hist2)
        func mine(_ rp: PRReplay.Full, _ id: JSONValue?) -> [PRReplay.Hit] { (rp.map[PRReplay.key(id)]?.list ?? []).filter { exIds.contains($0.exId) } }
        func hitObj(_ p: PRReplay.Hit) -> JSONValue {
            .object(["exId": .string(p.exId), "ei": .number(Double(p.ei)), "si": .number(Double(p.si)), "weight": .number(p.weight), "reps": .number(p.reps)])
        }
        func chAt(_ w: Obj, _ p: JSONValue) -> Bool {
            guard let ei = p["ei"]?.double, ei >= 0, ei == ei.rounded(), let exs = w["exercises"]?.array, Int(ei) < exs.count,
                  let ex = exOf(exs[Int(ei)]) else { return false }
            return ex.exId == p["exId"]?.string && (WorkoutMath.isCardio(ex) || WorkoutMath.isHold(ex))
        }
        let hist3: [JSONValue] = hist2.map { wv in
            guard let w = wv.object, let wid = w["id"] else { return wv }
            if !wids.contains(wid) && !has(wv) { return wv }
            var o = mine(before, wid).map(hitObj)
            let n = mine(after, wid), pw = prevById[wid]
            if let pw, let ps = pw["prSets"]?.array {
                o = mine(before, wid).filter { !($0.cardio || $0.hold) }.map(hitObj) + ps.filter { exIds.contains($0["exId"]?.string ?? "\u{0}") && chAt(pw, $0) }
            }
            let ns = (after.map[PRReplay.key(wid)]?.sug ?? []).filter { exIds.contains($0.exId) }
            let sugHas = (w["sugSets"]?.array ?? []).contains { exIds.contains($0["exId"]?.string ?? "\u{0}") }
            if o.isEmpty && n.isEmpty && ns.isEmpty && !sugHas { return wv }
            var w2 = w
            if let ss = w["sugSets"]?.array { w2["sugSets"] = .array(ss.filter { !exIds.contains($0["exId"]?.string ?? "\u{0}") } + ns.map(hitObj)) }
            if case .number(let c)? = w["prCount"] { w2["prCount"] = .number(max(0, c - Double(o.count) + Double(n.count))) }
            if let ps = w["prSets"]?.array { w2["prSets"] = .array(ps.filter { !exIds.contains($0["exId"]?.string ?? "\u{0}") } + n.map(hitObj)) }
            return .object(w2)
        }
        raw["jk_hist"] = .array(hist3)
        var kinds: [String: Set<Character>] = [:]
        for w in prev + hist3 {
            for exv in w["exercises"]?.array ?? [] {
                guard let ex = exOf(exv), exIds.contains(ex.exId) else { continue }
                kinds[ex.exId, default: []].insert(WorkoutMath.isCardio(ex) ? "c" : WorkoutMath.isHold(ex) ? "h" : "w")
            }
        }
        let rp = replay(hist3)
        var prs = raw["jk_prs"]?.object ?? [:], cardio = raw["jk_cardioPR"]?.object ?? [:], hold = raw["jk_holdPR"]?.object ?? [:]
        var cut = raw["jk_prRepair"]?.object ?? [:]
        var cDirty = false, hDirty = false
        for id in exIdList {
            let k = kinds[id] ?? []
            if k.contains("w") || k.isEmpty { setRepairedPR(&raw, &prs, id, at: at, rp: rp, hist: hist3) }
            if k.contains("c") { setRepairedCardioPR(raw, &cardio, id, at: at, hist: hist3); cDirty = true }
            if k.contains("h") { setRepairedHoldPR(raw, &hold, id, at: at, hist: hist3); hDirty = true }
            if !(cut[id]?.truthy ?? false) || jsGreater(cut[id]!, .string(at)) { cut[id] = .string(at) }
        }
        raw["jk_prs"] = .object(prs); raw["jk_prRepair"] = .object(cut)
        if cDirty { raw["jk_cardioPR"] = .object(cardio) }
        if hDirty { raw["jk_holdPR"] = .object(hold) }
    }

    /// cut[id] > at for the strings the PWA stores (ISO times): plain string order.
    private static func jsGreater(_ a: JSONValue, _ b: JSONValue) -> Bool {
        if let x = a.string, let y = b.string { return x > y }
        return a.jsNumber > b.jsNumber
    }

    private static func find(_ h: [JSONValue], _ id: JSONValue?) -> Obj? { id.flatMap { i in h.first { $0["id"] == i }?.object } }

    static func setRepairedPR(_ raw: inout Obj, _ prs: inout Obj, _ exId: String, at: String, rp: PRReplay.Full, hist h: [JSONValue]) {
        var sugs = raw["jk_prSug"]?.object ?? [:]
        let sr = rp.sugEnd[exId], rsAt = raw["jk_prReset"]?[exId], srW = find(h, sr?.wid)
        let blocked = rsAt.map { $0.truthy } == true && srW != nil && d(srW!["date"]) < d(rsAt)
        if let sr, !blocked {
            let cur = sugs[exId]?.object
            var date: JSONValue = .string(at)
            if let cur, cur["weight"] == .number(sr.weight), cur["reps"] == .number(sr.reps), let cd = cur["date"], cd.truthy { date = cd }
            else if let sd = srW?["date"], sd.truthy { date = sd }
            sugs[exId] = .object(["weight": .number(sr.weight), "reps": .number(sr.reps), "date": date, "repaired": .string(at)])
            raw["jk_prSug"] = .object(sugs)
        } else if sugs[exId] != nil { sugs[exId] = nil; raw["jk_prSug"] = .object(sugs) }
        let old = prs[exId]?.object
        guard let r = rp.docEnd[exId] else { prs[exId] = nil; return }
        let rw = find(h, r.wid)
        let wd = rw?["date"], od = old?["date"]
        let same = (wd?.truthy ?? false) && (od?.truthy ?? false) && d(od) >= d(wd) && d(od) - d(wd) < 864e5
        let date: JSONValue = same ? od! : ((wd?.truthy ?? false) ? wd! : .string(at))
        prs[exId] = .object(["weight": .number(r.weight), "reps": .number(r.reps), "date": date, "repaired": .string(at)])
    }

    struct CH { var c: (dist: Double, time: Double, date: JSONValue?)?; var h: (sec: Double, date: JSONValue?)?; var far: (dist: Double, date: JSONValue?)? }

    /// chHistBest(exId): fastest mile-equivalent, longest distance, longest hold, from the last Reset PR on.
    static func chHistBest(_ raw: Obj, _ exId: String, hist h: [JSONValue]) -> CH {
        let reset = raw["jk_prReset"]?[exId]
        let from = (reset?.truthy ?? false) ? d(reset) : -.infinity
        let items = h.enumerated().map { ($0.offset, $0.element, d($0.element["date"])) }
        let order = PRReplay.jsSort(items) { a, b in
            let x = a.2 - b.2
            return (x.isNaN || x == 0) ? Double(a.0 - b.0) : x
        }
        var out = CH()
        for (_, w, t) in order {
            if t < from { continue }
            for exv in w["exercises"]?.array ?? [] {
                guard let ex = exOf(exv), ex.exId == exId else { continue }
                let b = WorkoutMath.prBest(ex, bw: 0)
                if WorkoutMath.isCardio(ex) {
                    if let b, out.c == nil || WorkoutMath.mileEquiv(b.weight, b.reps) < WorkoutMath.mileEquiv(out.c!.dist, out.c!.time) { out.c = (b.weight, b.reps, w["date"]) }
                    for s in ex.sets where s.done && s.weight > 0 && s.reps > 0 && (out.far == nil || s.weight > out.far!.dist) { out.far = (s.weight, w["date"]) }
                } else if WorkoutMath.isHold(ex), let b, out.h == nil || b.weight > out.h!.sec { out.h = (b.weight, w["date"]) }
            }
        }
        return out
    }

    static func setRepairedCardioPR(_ raw: Obj, _ cardio: inout Obj, _ exId: String, at: String, hist h: [JSONValue]) {
        let old = cardio[exId]?.object, b = chHistBest(raw, exId, hist: h)
        guard let c = b.c else { cardio[exId] = nil; return }
        let same = old != nil && old!["dist"] == .number(c.dist) && old!["time"] == .number(c.time) && (old!["date"]?.truthy ?? false)
        var now = old ?? [:]
        now["dist"] = .number(c.dist); now["time"] = .number(c.time); now["date"] = same ? old!["date"] : c.date; now["repaired"] = .string(at)
        if let far = b.far {
            now["maxDist"] = .number(far.dist)
            if let o = old, o["maxDist"] == .number(far.dist), let md = o["maxDate"], md.truthy { now["maxDate"] = md } else { now["maxDate"] = far.date }
        }
        cardio[exId] = .object(now)
    }

    static func setRepairedHoldPR(_ raw: Obj, _ hold: inout Obj, _ exId: String, at: String, hist h: [JSONValue]) {
        let old = hold[exId]?.object
        guard let hb = chHistBest(raw, exId, hist: h).h else { hold[exId] = nil; return }
        var now = old ?? [:]
        now["sec"] = .number(hb.sec)
        now["date"] = (old != nil && old!["sec"] == .number(hb.sec) && (old!["date"]?.truthy ?? false)) ? old!["date"] : hb.date
        now["repaired"] = .string(at)
        hold[exId] = .object(now)
    }

    // MARK: iPhone-only: the lrev bump

    /// Every workout whose stored copy this edit changed gets lrev = old lrev + 1, so the merge on
    /// either side takes this version over an older copy of the same workout.
    static func stampLrev(before: [JSONValue], after: inout [JSONValue]) {
        var old: [JSONValue: JSONValue] = [:]
        for w in before { if let id = w["id"], old[id] == nil { old[id] = w } }
        for i in after.indices {
            guard var o = after[i].object, let id = o["id"], let was = old[id], was != after[i] else { continue }
            o["lrev"] = .number((was["lrev"].map { $0.jsNumber.isNaN ? 0 : $0.jsNumber } ?? 0) + 1)
            after[i] = .object(o)
        }
    }

    /// new Date().toISOString()
    static func isoString(_ t: Date) -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: t)
    }
}
