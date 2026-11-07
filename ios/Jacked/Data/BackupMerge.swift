import Foundation

/// Line-for-line port of the PWA's `mergeBackup()` and its helpers (jacked-pwa/index.html,
/// "Merge helpers (pure)"; rules in watch-client/SYNC_PLAYBOOK.md section 2). Pure: no disk,
/// no network, no clock. Proven against the JS by ios/Tests/parity (same fixtures through node
/// and Swift, outputs compared key-order-insensitively).
///
/// Works on raw JSON so every key and field this app does not know about survives untouched
/// (playbook section 5). Where the JS leans on truthiness or `+new Date(x)` the port does the
/// same thing on purpose, including the odd cases, so both sides decide identically.
enum BackupMerge {
    typealias Obj = [String: JSONValue]

    /// Keys a fresh device initialises empty: an empty local value never beats a non-empty cloud one.
    static let emptyLocalYields = ["jk_cex", "jk_routines", "jk_friends"]

    /// `mergeBackup(cloud, local, pendingNotes)`. `pendingNotes` = exercise ids whose note this
    /// device edited since its last successful write (the PWA's jacked_exNotesPending).
    static func merge(cloud: Obj?, local: Obj?, pendingNotes: [String]) -> Obj {
        let cloud = cloud ?? [:], local = local ?? [:]
        var out = cloud.merging(local) { _, l in l }   // {...cloud, ...local}

        for k in emptyLocalYields where isEmptyish(local[k]) && !isEmptyish(cloud[k]) { out[k] = cloud[k] }

        if let notes = mergeExNotes(cloud["jk_exNotes"], local["jk_exNotes"], pendingNotes) { out["jk_exNotes"] = .object(notes) }
        else { out["jk_exNotes"] = nil }

        // Tombstones: union of both sides' deleted workout ids, cloud's first, first-seen order.
        var del: [JSONValue] = [], delSet = Set<JSONValue>()
        for v in (cloud["jk_deleted"]?.array ?? []) + (local["jk_deleted"]?.array ?? []) where delSet.insert(v).inserted { del.append(v) }
        if !delSet.isEmpty { out["jk_deleted"] = .array(del) }

        // jk_hist: union by id, verbatim; local wins unless the cloud copy has a higher lrev.
        let ch = cloud["jk_hist"]?.array ?? [], lh = local["jk_hist"]?.array ?? []
        if !ch.isEmpty || !lh.isEmpty {
            var byId: [JSONValue: JSONValue] = [:]
            for w in lh { if let id = histId(w) { byId[id] = w } }
            for w in ch {
                guard let id = histId(w) else { continue }
                if let l = byId[id], !(lrev(w) > lrev(l)) { continue }
                byId[id] = w
            }
            var merged: [JSONValue] = [], seen = Set<JSONValue>()
            for w in lh { if let id = histId(w), seen.insert(id).inserted { merged.append(byId[id]!) } }
            for w in ch { if let id = histId(w), seen.insert(id).inserted { histInsert(&merged, byId[id]!) } }
            out["jk_hist"] = .array(merged.filter { !delSet.contains(histId($0)!) })
        }

        let repairs = mergeDateMap(cloud["jk_prRepair"], local["jk_prRepair"], earliest: true)
        if let repairs { out["jk_prRepair"] = .object(repairs) }
        let resets = mergeDateMap(cloud["jk_prReset"], local["jk_prReset"], earliest: false)
        if let resets { out["jk_prReset"] = .object(resets) }
        func rs(_ v: JSONValue?, _ dateOf: (Obj) -> JSONValue?) -> JSONValue? {
            guard let resets, let v, v.truthy, let m = v.object else { return v }
            return .object(dropPreReset(m, resets, dateOf))
        }
        let prDate: (Obj) -> JSONValue? = { $0["date"] }
        let cardioDate: (Obj) -> JSONValue? = { r in (r["date"].map { $0.truthy } ?? false) ? r["date"] : r["maxDate"] }
        let present: (String) -> Bool = { k in (cloud[k]?.truthy ?? false) || (local[k]?.truthy ?? false) }

        if present("jk_prs") {
            out["jk_prs"] = .object(mergePRs(rs(cloud["jk_prs"], prDate), rs(local["jk_prs"], prDate), repairs, better: prHeavier))
        }
        if present("jk_prSug") {
            let sug = mergePRs(rs(cloud["jk_prSug"], prDate), rs(local["jk_prSug"], prDate), repairs, better: prImpliesMore)
            out["jk_prSug"] = .object(pruneSug(sug, out["jk_prs"]?.object))
        }
        if present("jk_cardioPR") {
            out["jk_cardioPR"] = .object(mergeCardioPRs(rs(cloud["jk_cardioPR"], cardioDate), rs(local["jk_cardioPR"], cardioDate)))
        }
        if present("jk_holdPR") {
            out["jk_holdPR"] = .object(mergeHoldPRs(rs(cloud["jk_holdPR"], prDate), rs(local["jk_holdPR"], prDate)))
        }

        if let log = mergeBWlog(cloud["jk_bwlog"], local["jk_bwlog"]) {
            out["jk_bwlog"] = .array(log)
            out["jk_bw"] = log.last!["kg"] ?? .null   // JSON.stringify drops undefined; ok() guarantees kg exists
        }
        return out
    }

    // MARK: helpers, same names as index.html

    static func isEmptyish(_ v: JSONValue?) -> Bool {
        switch v {
        case nil, .null?: return true
        case .array(let a)?: return a.isEmpty
        case .object(let o)?: return o.isEmpty
        default: return false
        }
    }

    /// `w && w.id != null`
    private static func histId(_ w: JSONValue) -> JSONValue? {
        guard w.truthy, let o = w.object, let id = o["id"], id != .null else { return nil }
        return id
    }

    private static func lrev(_ w: JSONValue) -> Double {
        guard let v = w["lrev"] else { return 0 }
        let n = v.jsNumber
        return n.isNaN ? 0 : n
    }

    /// histInsert(h, rec): insert by date so the list stays newest-last.
    static func histInsert(_ h: inout [JSONValue], _ rec: JSONValue) {
        let t = dateParse(rec["date"])
        var i = h.count
        if !t.isNaN {
            while i > 0 {
                let p = dateParse(h[i - 1]["date"])
                if (p.isNaN || p == 0 ? 0 : p) > t { i -= 1 } else { break }
            }
        }
        h.insert(rec, at: i)
    }

    /// mergeExNotes: cloud map with this device's pending edits overlaid (absent locally = delete).
    static func mergeExNotes(_ cloud: JSONValue?, _ local: JSONValue?, _ pending: [String]) -> Obj? {
        let c = jsObject(cloud), l = jsObject(local)
        if c == nil && l == nil { return nil }
        var out = c ?? [:]
        for id in pending {
            if let l, let v = l[id], v.truthy { out[id] = v } else { out[id] = nil }
        }
        return out
    }

    /// `(x && typeof x === 'object') ? x : null`, objects only (the blob never stores these keys as arrays).
    private static func jsObject(_ v: JSONValue?) -> Obj? { v?.object }

    /// mergePRRepair (earliest wins) and mergePRReset (latest wins): per key, ISO time values.
    static func mergeDateMap(_ a: JSONValue?, _ b: JSONValue?, earliest: Bool) -> Obj? {
        var out = jsObject(a) ?? [:]
        for (k, v) in jsObject(b) ?? [:] {
            let cur = out[k]
            if !(cur?.truthy ?? false) { out[k] = v; continue }
            let nb = jsDate(v), nc = jsDate(cur)
            if earliest ? nb < nc : nb > nc { out[k] = v }
        }
        return out.isEmpty ? nil : out
    }

    static func dropPreReset(_ map: Obj, _ resets: Obj, _ dateOf: (Obj) -> JSONValue?) -> Obj {
        var out = map
        for (id, cut) in resets {
            guard let r = out[id], r.truthy else { continue }
            let d = r.object.flatMap(dateOf)
            let when = (d?.truthy ?? false) ? jsDate(d) : 0   // new Date(dateOf(r)||0)
            if when < jsDate(cut) { out[id] = nil }
        }
        return out
    }

    static func e1rm(_ w: Double, _ reps: Double) -> Double { reps <= 0 ? 0 : reps == 1 ? w : w * (1 + reps / 30) }
    static func prE1rm(_ pr: JSONValue?) -> Double {
        guard let pr, pr.truthy else { return 0 }
        return e1rm(jsNum(pr["weight"]), jsNum(pr["reps"]))
    }
    static func prHeavier(_ n: JSONValue?, _ c: JSONValue?) -> Bool {
        let nw = jsNum(n?["weight"]), cw = jsNum(c?["weight"])
        return nw > cw || (nw == cw && jsNum(n?["reps"]) > jsNum(c?["reps"]))
    }
    static func prImpliesMore(_ n: JSONValue?, _ c: JSONValue?) -> Bool { prE1rm(n) > prE1rm(c) }

    static func prOkAfterRepair(_ r: JSONValue?, _ cut: JSONValue) -> Bool {
        guard let r, r.truthy else { return true }
        if r["repaired"]?.truthy ?? false { return true }
        let d = r["date"]
        return ((d?.truthy ?? false) ? jsDate(d) : 0) >= jsDate(cut)
    }

    static func mergePRs(_ a: JSONValue?, _ b: JSONValue?, _ repairs: Obj?, better: (JSONValue?, JSONValue?) -> Bool) -> Obj {
        let a = jsObject(a) ?? [:], b = jsObject(b) ?? [:]
        func ok(_ id: String, _ r: JSONValue?) -> Bool {
            guard let repairs, let cut = repairs[id], cut.truthy else { return true }
            return prOkAfterRepair(r, cut)
        }
        var out: Obj = [:]
        for (id, r) in a where ok(id, r) { out[id] = r }
        for (id, nw) in b where ok(id, nw) {
            let cur = out[id]
            if !(cur?.truthy ?? false) || better(nw, cur) { out[id] = nw }
        }
        return out
    }

    static let sugEps = 0.05
    static func pruneSug(_ sug: Obj, _ prs: Obj?) -> Obj {
        sug.filter { id, s in s.truthy && prE1rm(s) > jsNum(prs?[id]?["weight"]) + sugEps }
    }

    private static func chT(_ r: Obj) -> Double {
        let d = (r["date"]?.truthy ?? false) ? r["date"] : (r["maxDate"]?.truthy ?? false) ? r["maxDate"] : nil
        let t1 = d.map(jsDate) ?? 0, t2 = (r["repaired"]?.truthy ?? false) ? jsDate(r["repaired"]) : 0
        return max(t1.isNaN ? 0 : t1, t2.isNaN ? 0 : t2)   // Math.max(+x||0, +y||0)
    }
    static func chRepairedWinner(_ x: Obj, _ y: Obj) -> Obj? {
        if let r = y["repaired"], r.truthy, chT(x) < jsDate(r) { return y }
        if let r = x["repaired"], r.truthy, chT(y) < jsDate(r) { return x }
        return nil
    }

    static func mergeHoldPRs(_ a: JSONValue?, _ b: JSONValue?) -> Obj {
        let a = jsObject(a) ?? [:], b = jsObject(b) ?? [:]
        var out: Obj = [:]
        for id in Set(a.keys).union(b.keys) {
            let x = rec(a[id]), y = rec(b[id])
            if let r = chRepairedWinner(x, y) { out[id] = .object(r) }
            else { out[id] = .object(jsNum(y["sec"]) > jsNum(x["sec"]) ? y : x) }
        }
        return out
    }

    static func mileEquiv(_ d: Double, _ t: Double) -> Double { d > 0 && t > 0 ? t / pow(d, 1.06) : .infinity }

    static func mergeCardioPRs(_ a: JSONValue?, _ b: JSONValue?) -> Obj {
        let a = jsObject(a) ?? [:], b = jsObject(b) ?? [:]
        var out: Obj = [:]
        for id in Set(a.keys).union(b.keys) {
            let x = rec(a[id]), y = rec(b[id])
            if let r = chRepairedWinner(x, y) { out[id] = .object(r); continue }
            var base = mileEquiv(jsNum(y["dist"]), jsNum(y["time"])) < mileEquiv(jsNum(x["dist"]), jsNum(x["time"])) ? y : x
            let maxSide = jsNum(x["maxDist"]) >= jsNum(y["maxDist"]) ? x : y
            base["maxDist"] = maxSide["maxDist"]   // undefined in JS = key dropped by JSON.stringify
            base["maxDate"] = maxSide["maxDate"]
            out[id] = .object(base)
        }
        return out
    }

    /// `a[exId] || {}` then spread: a non-object record behaves as an empty one.
    private static func rec(_ v: JSONValue?) -> Obj { (v?.truthy ?? false) ? (v?.object ?? [:]) : [:] }

    /// mergeBWlog: union by `d`, local wins on a shared date, sorted by `d`. nil when neither side has one.
    static func mergeBWlog(_ cloud: JSONValue?, _ local: JSONValue?) -> [JSONValue]? {
        func ok(_ e: JSONValue) -> Bool {
            guard e.truthy, let d = e["d"]?.string, d.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return false }
            return (e["kg"]?.jsNumber ?? .nan) > 0
        }
        var byD: [String: JSONValue] = [:]
        for e in (cloud?.array ?? []) + (local?.array ?? []) where ok(e) { byD[e["d"]!.string!] = e }
        if byD.isEmpty { return nil }
        return byD.keys.sorted().map { byD[$0]! }
    }

    // MARK: JavaScript dates

    /// `+new Date(x)` in milliseconds; NaN where JS gives NaN (comparisons with NaN are false, as in JS).
    static func jsDate(_ v: JSONValue?) -> Double {
        switch v {
        case nil: return .nan
        case .null?: return 0
        case .bool(let b)?: return b ? 1 : 0
        case .number(let n)?: return n
        case .string(let s)?: return parseISO(s)
        default: return .nan
        }
    }

    /// `Date.parse(x)`: like jsDate, but a non-string is stringified first (null/undefined give NaN).
    static func dateParse(_ v: JSONValue?) -> Double {
        if case .string(let s)? = v { return parseISO(s) }
        return .nan
    }

    private static let isoRe = try! NSRegularExpression(pattern:
        #"^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?)?$"#)

    /// The ECMAScript date-time string format: a bare date is UTC, a date-time without an offset
    /// is local time, anything else is NaN.
    static func parseISO(_ s: String) -> Double {
        guard let m = isoRe.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return .nan }
        func g(_ i: Int) -> String? { Range(m.range(at: i), in: s).map { String(s[$0]) } }
        let y = Int(g(1)!)!, mo = Int(g(2)!)!, d = Int(g(3)!)!
        let h = g(4).flatMap(Int.init) ?? 0, mi = g(5).flatMap(Int.init) ?? 0, sec = g(6).flatMap(Int.init) ?? 0
        let ms = g(7).map { Double(String(($0 + "00").prefix(3)))! } ?? 0
        guard (1...12).contains(mo), (1...31).contains(d), h <= 24, mi < 60, sec < 60 else { return .nan }
        var cal = Calendar(identifier: .gregorian)
        let tz: TimeZone
        if g(4) == nil { tz = TimeZone(identifier: "UTC")! }
        else if let z = g(8) {
            if z == "Z" { tz = TimeZone(identifier: "UTC")! }
            else {
                let sign = z.hasPrefix("-") ? -1 : 1
                let p = z.dropFirst().split(separator: ":").compactMap { Int($0) }
                tz = TimeZone(secondsFromGMT: sign * (p[0] * 3600 + p[1] * 60))!
            }
        } else { tz = .current }
        cal.timeZone = tz
        guard let date = cal.date(from: DateComponents(year: y, month: mo, day: d, hour: h, minute: mi, second: sec)),
              cal.component(.day, from: date) == d || h == 24 else { return .nan }
        return (date.timeIntervalSince1970 * 1000).rounded() + ms
    }

    // MARK: change detection

    /// canonJson(): key-order-insensitive equality (jsonb reorders keys on every round trip).
    static func canonical(_ v: JSONValue) -> String {
        switch v {
        case .null: return "null"
        case .bool(let b): return b ? "true" : "false"
        case .number(let n):
            if n.isFinite && n == n.rounded() && abs(n) < 1e15 { return String(Int64(n)) }
            return n.isFinite ? "\(n)" : "null"
        case .string(let s):
            let d = (try? JSONEncoder().encode(s)) ?? Data()
            return String(decoding: d, as: UTF8.self)
        case .array(let a): return "[" + a.map(canonical).joined(separator: ",") + "]"
        case .object(let o):
            return "{" + o.keys.sorted().map { canonical(.string($0)) + ":" + canonical(o[$0]!) }.joined(separator: ",") + "}"
        }
    }
}
