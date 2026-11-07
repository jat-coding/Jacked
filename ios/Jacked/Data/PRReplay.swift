import Foundation

/// prReplay(): every workout's PR stars worked out by replaying ALL history oldest-first, for
/// workouts saved before finish stored prSets / sugSets. Same three record books as the PWA:
/// rec / sugR (today's documented-vs-suggested rule, prWeightStep), leg (the e1RM record pre-rule
/// workouts were counted against), and best pace / longest hold. Workouts finished under prRule 2
/// take the live rule exactly; older ones keep the e1RM stars their prCount was stored with;
/// Strong / Hevy imports (ids like w123_4) use importBest's raw rule.
/// Parity: Tests/parity/prreplay-run.sh (the PWA's own prReplay in node vs this, same histories).
enum PRReplay {
    struct Hit: Equatable { let exId: String; let ei: Int; let si: Int; let weight: Double; let reps: Double; let cardio: Bool; let hold: Bool }
    struct Entry: Equatable { var list: [Hit] = []; var sug: [Hit] = [] }

    private static var memo: (key: Int, bw: Double, map: [String: Entry])?

    /// Memoised on the history's content and body weight, like _prMemo.
    static func map(raw: [String: JSONValue]) -> [String: Entry] {
        let bw = jsNum(raw["jk_bw"]), hist = (raw["jk_hist"]?.array ?? []).compactMap { $0.object }
        var h = Hasher(); h.combine(raw["jk_hist"]); let key = h.finalize()
        if let m = memo, m.key == key, m.bw == bw { return m.map }
        let r = compute(hist, bw: bw)
        memo = (key, bw, r)
        return r
    }

    /// importBest: heaviest raw set, more reps breaking a tie.
    static func importBest(_ e: LogExercise) -> WorkoutMath.Best? {
        var best: WorkoutMath.Best?
        for (si, s) in e.sets.enumerated() where s.weight > 0 || s.reps > 0 {
            if best == nil || s.weight > best!.weight || (s.weight == best!.weight && s.reps > best!.reps) { best = .init(si: si, weight: s.weight, reps: s.reps) }
        }
        return best
    }

    static func compute(_ hist: [[String: JSONValue]], bw: Double) -> [String: Entry] { full(hist, bw: bw).map }

    /// The record history ends on per exercise, with the id of the workout that set it (map.docEnd / map.sugEnd).
    struct End: Equatable { let weight: Double; let reps: Double; let wid: JSONValue? }
    struct Full { var map: [String: Entry]; var docEnd: [String: End]; var sugEnd: [String: End] }

    static func full(_ hist: [[String: JSONValue]], bw: Double) -> Full {
        typealias Rec = (weight: Double, reps: Double)
        var recW: [String: JSONValue?] = [:], sugW: [String: JSONValue?] = [:]
        func obj(_ r: Rec?) -> [String: JSONValue]? { r.map { ["weight": .number($0.weight), "reps": .number($0.reps)] } }
        func e1(_ r: Rec?) -> Double { r.map { WorkoutMath.e1rm($0.weight, $0.reps) } ?? 0 }
        var rec: [String: Rec] = [:], sugR: [String: Rec] = [:], leg: [String: Rec] = [:], bestC: [String: Double] = [:], bestH: [String: Double] = [:]
        var out: [String: Entry] = [:]
        // gH().map((w,i)=>({w,i})).sort((a,b)=>(new Date(a.w.date)-new Date(b.w.date))||(a.i-b.i)): with an unparseable
        // date that comparator falls back to the index and stops being consistent, so the order is whatever V8's sort
        // makes of it. jsSort follows V8's own algorithm so even that case lands the same.
        let items = hist.enumerated().map { ($0.offset, $0.element, JackedDate.parse($0.element["date"]?.string ?? "")?.timeIntervalSince1970) }
        let order = jsSort(items) { a, b in
            if let x = a.2, let y = b.2, x != y { return x - y }
            return Double(a.0 - b.0)
        }
        for (_, w, _) in order {
            let id = key(w["id"])
            let imported = WorkoutMath.importedId.firstMatch(in: id, range: NSRange(id.startIndex..., in: id)) != nil
            let v2 = !imported && jsNum(w["prRule"]) == 2
            var e = Entry()
            for (ei, exv) in (w["exercises"]?.array ?? []).enumerated() {
                guard let o = exv.object else { continue }
                let ex = LogExercise(json: o), exId = ex.exId
                guard !exId.isEmpty, exId != "?" else { continue }
                let cardio = WorkoutMath.isCardio(ex), hold = WorkoutMath.isHold(ex)
                guard let b = (imported && !cardio && !hold) ? importBest(ex) : WorkoutMath.prBest(ex, bw: bw) else { continue }
                var isPR: Bool
                if hold {
                    isPR = b.weight > (bestH[exId] ?? 0)
                    if isPR { bestH[exId] = b.weight }
                } else if cardio {
                    let cur = WorkoutMath.mileEquiv(b.weight, b.reps)
                    isPR = cur < (bestC[exId] ?? .infinity)
                    if isPR { bestC[exId] = cur }
                } else {
                    let prev = rec[exId] ?? (0, 0), lp = leg[exId] ?? (0, 0)
                    if imported {
                        isPR = b.weight > prev.weight || (b.weight == prev.weight && b.reps > prev.reps)
                        if isPR {
                            rec[exId] = (b.weight, b.reps); recW[exId] = w["id"]
                            // sugStands(sugR, rec)
                            if !(sugR[exId] != nil && e1(sugR[exId]) > b.weight + WorkoutMath.sugEps) { sugR[exId] = nil }
                        }
                        if b.weight > lp.weight || (b.weight == lp.weight && b.reps > lp.reps) { leg[exId] = (b.weight, b.reps) }
                    } else {
                        let st = WorkoutMath.prWeightStep(ex, prev: obj(prev), sug: obj(sugR[exId]), bw: bw)
                        if let d = st.doc { rec[exId] = (d.weight, d.reps); recW[exId] = w["id"] }
                        if let s = st.sug { sugR[exId] = (s.weight, s.reps); sugW[exId] = w["id"] } else if !st.keepSug { sugR[exId] = nil }
                        let legPR = WorkoutMath.e1rm(b.weight, b.reps) > e1(lp)
                        if legPR { leg[exId] = (b.weight, b.reps) }
                        if v2 {
                            if let d = st.doc { e.list.append(Hit(exId: exId, ei: ei, si: d.si, weight: d.weight, reps: d.reps, cardio: cardio, hold: hold)) }
                            if let s = st.sug { e.sug.append(Hit(exId: exId, ei: ei, si: s.si, weight: s.weight, reps: s.reps, cardio: cardio, hold: hold)) }
                            continue
                        }
                        isPR = legPR
                    }
                }
                if isPR { e.list.append(Hit(exId: exId, ei: ei, si: b.si, weight: b.weight, reps: b.reps, cardio: cardio, hold: hold)) }
            }
            out[id] = e
        }
        return Full(map: out,
                    docEnd: rec.reduce(into: [:]) { $0[$1.key] = End(weight: $1.value.weight, reps: $1.value.reps, wid: recW[$1.key] ?? nil) },
                    sugEnd: sugR.reduce(into: [:]) { $0[$1.key] = End(weight: $1.value.weight, reps: $1.value.reps, wid: sugW[$1.key] ?? nil) })
    }

    /// The key compute() files a workout under (String(w.id)).
    static func key(_ id: JSONValue?) -> String { id?.string ?? id?.double.map { String(Int($0)) } ?? "" }

    /// Array.prototype.sort as V8 runs it (TimSort; below 64 items one run plus binary insertion sort,
    /// exactly) for a comparator that may be inconsistent. 64+ items: a plain stable sort.
    static func jsSort<T>(_ input: [T], _ cmp: (T, T) -> Double) -> [T] {
        var a = input; let n = a.count
        if n < 2 { return a }
        if n >= 64 {
            return a.enumerated().sorted { let c = cmp($0.element, $1.element); return c != 0 ? c < 0 : $0.offset < $1.offset }.map(\.element)
        }
        // countAndMakeRun
        var run = 2
        let desc = cmp(a[1], a[0]) < 0
        var prev = a[1]
        var i = 2
        while i < n {
            let o = cmp(a[i], prev)
            if desc ? o >= 0 : o < 0 { break }
            prev = a[i]; run += 1; i += 1
        }
        if desc { a[0..<run].reverse() }
        // binaryInsertionSort(low 0, start run, high n)
        var start = run
        while start < n {
            let pivot = a[start]
            var left = 0, right = start
            while left < right {
                let mid = left + ((right - left) >> 1)
                if cmp(pivot, a[mid]) < 0 { right = mid } else { left = mid + 1 }
            }
            var p = start
            while p > left { a[p] = a[p - 1]; p -= 1 }
            a[left] = pivot
            start += 1
        }
        return a
    }
}
