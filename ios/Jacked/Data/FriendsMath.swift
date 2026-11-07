import Foundation

/// One shared set as a friend's app publishes it (friendWorkoutSummary): canonical kg / miles / seconds.
struct SharedSet { var mi, min, w, r, sec: Double? }
struct SharedEx { var id: String; var n: String; var t: String; var sets: [SharedSet] }
struct SharedWorkout { var name: String; var date: String; var vol: Double; var sets: Double; var dist: Double?; var pace: Double?; var ex: [SharedEx] }
struct SharedBadge { var n: String; var t: String; var e: String }

/// A person on the Friends tab (index.html refreshFriends mk() + cleanPerson, or yourStats()).
struct Person: Identifiable {
    var id: String { code }
    var code: String
    var name = "Lifter"
    var username = ""
    var avatarUrl = ""
    var isYou = false
    var pending = false
    var totalVolume = 0.0, workouts = 0.0, prs = 0.0, streak = 0.0, consistency = 0.0, badges = 0.0
    var days: [String] = []
    var recent: [SharedWorkout] = []
    var wd: [SharedWorkout] = []
    var badgeList: [SharedBadge] = []
    var mVol = 0.0, mWorkouts = 0.0, mPRs = 0.0, pmVol = 0.0, mStreak = 0.0, mCons = 0.0, mBadges = 0.0
    var mYm = ""

    var hasJacked: Bool { badgeList.contains { $0.n == "Jacked" } }

    /// A friend_profiles() row through mk() and cleanPerson(): every field typed, lists capped.
    init?(row o: [String: JSONValue], pending: Bool) {
        guard let c = o["code"]?.string, FriendsMath.cleanCode(c) else { return nil }
        code = c; self.pending = pending
        func s(_ v: JSONValue?, _ n: Int = 120) -> String { String((v?.string ?? "").prefix(n)) }
        func num(_ v: JSONValue?) -> Double { let x = jsNum(v); return x.isFinite ? x : 0 }
        func nn(_ v: JSONValue?) -> Double? { guard let v, v != .null else { return nil }; let x = v.jsNumber; return x.isFinite ? x : nil }
        let nm = s(o["name"], 40), un = s(o["username"], 40)
        name = !nm.isEmpty ? nm : !un.isEmpty ? un : "Lifter"
        username = un
        avatarUrl = FriendsMath.cleanAvatar(o["avatar_url"]?.string, code)
        totalVolume = num(o["total_volume"]); workouts = num(o["workouts"]); prs = num(o["prs"])
        streak = num(o["streak"]); consistency = num(o["consistency"]); badges = num(o["badges"])
        let data = o["data"]?.object ?? [:], m = data["m"]?.object ?? [:]
        mVol = num(m["v"]); mWorkouts = num(m["w"]); mPRs = num(m["p"]); pmVol = num(m["pv"])
        mStreak = num(m["st"]); mCons = num(m["c"]); mBadges = num(m["b"])
        let ym = m["ym"]?.string ?? ""
        mYm = ym.range(of: #"^\d{4}-\d{2}$"#, options: .regularExpression) != nil ? ym : ""
        days = Array((data["days"]?.array ?? []).compactMap(\.string).filter(JackedDate.isDayKey).sorted().suffix(4000))
        func wk(_ w: [String: JSONValue], volKey: String) -> SharedWorkout {
            var r = SharedWorkout(name: s(w["name"]), date: s(w["date"], 40), vol: num(w[volKey]), sets: num(w["sets"]), ex: [])
            if w["dist"] != nil && w["dist"] != .null { r.dist = num(w["dist"]); r.pace = num(w["pace"]) }
            r.ex = (w["ex"]?.array ?? []).prefix(60).compactMap(\.object).map { e in
                SharedEx(id: s(e["id"], 60), n: s(e["n"]), t: s(e["t"], 20), sets: (e["sets"]?.array ?? []).prefix(100).compactMap(\.object).map {
                    SharedSet(mi: nn($0["mi"]), min: nn($0["min"]), w: nn($0["w"]), r: nn($0["r"]), sec: nn($0["sec"]))
                })
            }
            return r
        }
        recent = (data["recent"]?.array ?? []).prefix(20).compactMap(\.object).map { wk($0, volKey: "totalVolume") }
        wd = (data["wd"]?.array ?? []).prefix(60).compactMap(\.object).map { wk($0, volKey: "vol") }
        badgeList = (data["badgeList"]?.array ?? []).prefix(100).compactMap(\.object).map { b in
            let t = b["t"]?.string ?? ""
            let parts = (b["e"]?.string ?? "").split(separator: "|", maxSplits: 1).map(String.init)
            let okIcon = parts.first.map { $0.range(of: #"^[a-z0-9_-]{1,30}$"#, options: [.regularExpression, .caseInsensitive]) != nil } ?? false
            let okCol = parts.count > 1 && parts[1].range(of: #"^(#[0-9a-f]{3,8}|var\(--[a-z0-9-]{1,30}\))$"#, options: [.regularExpression, .caseInsensitive]) != nil
            return SharedBadge(n: s(b["n"], 60), t: ["bronze", "silver", "gold"].contains(t) ? t : "", e: okIcon && okCol ? parts[0] + "|" + parts[1] : "")
        }
    }

    init(you code: String) { self.code = code; isYou = true }
}

enum FriendsMath {
    /// cleanCode(): @username or a legacy JCKD-XXXXXX code, the only thing allowed into a request filter.
    static func cleanCode(_ c: String) -> Bool { c.range(of: #"^[A-Za-z0-9@_-]{1,32}$"#, options: .regularExpression) != nil }

    /// cleanAvatar(): never a stored URL. Only the "?v=<digits>" version stamp is read; the URL is rebuilt
    /// from this project's avatars bucket and the person's own code.
    static func cleanAvatar(_ u: String?, _ code: String) -> String {
        guard let u, cleanCode(code), let r = u.range(of: #"[?&]v=(\d{1,15})$"#, options: .regularExpression) else { return "" }
        let v = u[r].split(separator: "=").last.map(String.init) ?? ""
        let c = code.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-_.!~*'()"))) ?? code
        return SupabaseConfig.url.absoluteString + "/storage/v1/object/public/avatars/\(c).jpg?v=\(v)"
    }

    /// avc(): the initials disc colour, hashed from the name like the web app.
    static let AVC: [UInt32] = [0x20d3c2, 0x3ddc97, 0x5aa9ff, 0xff9f4d, 0xb07cff, 0xff5d6c, 0x4ad9d9, 0xffca4d]
    static func avc(_ n: String) -> UInt32 {
        var h = 0.0   // a JS number: only `h<<5` goes through int32
        for ch in (n.isEmpty ? "?" : n) {
            let u = Double(String(ch).utf16.first ?? 0)
            let sh = Int32(truncatingIfNeeded: Int64(h.truncatingRemainder(dividingBy: 4294967296))) << 5
            h = u + (Double(sh) - h)
        }
        return AVC[Int(abs(h).truncatingRemainder(dividingBy: Double(AVC.count)))]
    }
    /// avi(): up to two initials.
    static func avi(_ n: String) -> String {
        let s = (n.isEmpty ? "?" : n).split(separator: " ", omittingEmptySubsequences: false).map { $0.first.map(String.init) ?? "" }.joined().uppercased()
        return s.isEmpty ? "??" : String(s.prefix(2))
    }

    /// normU(): "@" + lowercase letters, digits and underscore.
    static func normU(_ s: String) -> String {
        var h = s.trimmingCharacters(in: .whitespacesAndNewlines)
        while h.hasPrefix("@") { h.removeFirst() }
        h = String(h.lowercased().unicodeScalars.filter { CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_").contains($0) }.map(Character.init))
        return h.isEmpty ? "" : "@" + h
    }
    static func validU(_ u: String) -> String? {
        let h = normU(u).dropFirst()
        if h.count < 3 { return "Username needs at least 3 letters/numbers" }
        if h.count > 20 { return "Username too long (max 20)" }
        return nil
    }
}

/// The numbers the Friends tab ranks and the stats this phone publishes for friends (index.html
/// yourStats, monthStats, monthDayStats, myActivity, friendWorkoutSummary, monthOf, crownCodes, syncMe).
/// Parity-checked against the PWA's own functions: Tests/parity/friends-run.sh.
extension MetricsMath {
    struct Month: Equatable { var ym = ""; var v = 0.0, w = 0.0, p = 0.0, pv = 0.0, st = 0.0, c = 0.0, b = 0.0 }

    private func ymKey(_ d: Date) -> String { let c = cal.dateComponents([.year, .month], from: d); return String(format: "%04d-%02d", c.year!, c.month!) }
    private func monthStart(_ off: Int) -> Double {
        let c = cal.dateComponents([.year, .month], from: now)
        return cal.date(from: DateComponents(year: c.year, month: c.month! + off, day: 1))!.timeIntervalSince1970 * 1000
    }
    /// The raw history objects in stored order (gH(): histClean drops non-object entries).
    private var histRaw: [[String: JSONValue]] { (raw["jk_hist"]?.array ?? []).compactMap(\.object) }

    /// monthDayStats(): longest run of trained days this month, and % of this month's days so far trained.
    func monthDayStats(_ dayList: [String]) -> (st: Double, c: Double) {
        let ym = ymKey(now), today = cal.component(.day, from: now)
        let ds = Array(Set(dayList.filter { $0.count >= 10 && $0.prefix(7) == ym }.compactMap { Int($0.dropFirst(8).prefix(2)) }))
            .filter { $0 >= 1 && $0 <= today }.sorted()
        var st = 0, run = 0, prev = -9
        for n in ds { run = n == prev + 1 ? run + 1 : 1; if run > st { st = run }; prev = n }
        return (Double(st), min(100, jsRound(Double(ds.count) / Double(today) * 100)))
    }

    /// monthBadgeCount(): Challenge-Maxing, Comeback-Maxing (the monthly ones) plus Jacked.
    func monthBadgeCount(_ list: [Badge]) -> Int { list.filter { $0.earned && ($0.monthly || $0.name == "Jacked") }.count }

    /// monthStats(): this calendar month from local history, plus last month's weight (the crown).
    func monthStats(badges: [Badge]?) -> Month {
        let ms = monthStart(0), me = monthStart(1), ps = monthStart(-1)
        let inR: (HWorkout, Double, Double) -> Bool = { w, a, b in guard let t = w.ms else { return false }; return t >= a && t < b }
        let mh = hist.filter { inR($0, ms, me) }
        let pv = jsRound(hist.filter { inR($0, ps, ms) }.reduce(0) { $0 + $1.w.totalVolume })
        let ds = monthDayStats(hist.map(\.w.dayKey))
        return Month(ym: ymKey(now), v: jsRound(mh.reduce(0) { $0 + $1.w.totalVolume }), w: Double(mh.count), p: Double(mh.reduce(0) { $0 + $1.w.prCount }),
                     pv: pv, st: ds.st, c: ds.c, b: Double(badges.map(monthBadgeCount) ?? 0))
    }

    /// myBadgeList(): earned badges as {n, t, e: "icon|color"} with the PWA's color strings.
    func myBadgeList(_ list: [Badge]) -> [SharedBadge] {
        list.filter(\.earned).map { b in
            SharedBadge(n: b.name, t: b.tier ?? "", e: b.icon + "|" + (b.color.hasPrefix("#") ? b.color : "var(--\(b.color))"))
        }
    }

    /// yourStats(): you, as a leaderboard row.
    func yourStats(code: String, badges list: [Badge]) -> Person {
        let prof = raw["jk_prof"]?.object ?? [:]
        var p = Person(you: code)
        p.name = prof["name"]?.string.flatMap { $0.isEmpty ? nil : $0 } ?? "You"
        p.username = prof["username"]?.string.flatMap { $0.isEmpty ? nil : $0 } ?? "@you"
        p.avatarUrl = prof["avatarUrl"]?.string ?? ""
        p.totalVolume = hist.reduce(0) { $0 + $1.w.totalVolume }
        p.workouts = Double(hist.count)
        p.prs = Double(prCount)
        p.streak = Double(HomeMath.streak(hist.map(\.w), now: now, calendar: cal))
        let noon = cal.date(bySettingHour: 12, minute: 0, second: 0, of: now)!
        let from = JackedDate.dayKey(cal.date(byAdding: .day, value: -29, to: noon)!, calendar: cal), tod = JackedDate.dayKey(now, calendar: cal)
        let trained = Set(hist.map(\.w.dayKey).filter { !$0.isEmpty && $0 >= from && $0 <= tod })
        p.consistency = min(100, jsRound(Double(trained.count) / 30 * 100))
        p.badges = Double(list.filter(\.earned).count)
        let m = monthStats(badges: list)
        p.mVol = m.v; p.mWorkouts = m.w; p.mPRs = m.p; p.pmVol = m.pv; p.mYm = m.ym; p.mStreak = m.st; p.mCons = m.c; p.mBadges = m.b
        let act = myActivity(badges: list)
        p.days = (act["days"]?.array ?? []).compactMap(\.string)
        p.badgeList = myBadgeList(list)
        p.wd = (act["wd"]?.array ?? []).compactMap(\.object).compactMap { Person(row: ["code": .string(code), "data": .object(["wd": .array([.object($0)])])], pending: false)?.wd.first }
        p.recent = (act["recent"]?.array ?? []).compactMap(\.object).compactMap { Person(row: ["code": .string(code), "data": .object(["recent": .array([.object($0)])])], pending: false)?.recent.first }
        return p
    }

    private static func r2(_ n: Double) -> Double { jsRound(n * 100) / 100 }
    private static func distPace(_ o: [String: JSONValue]) -> (Double, Double) {
        var d = 0.0, t = 0.0
        for e in (o["exercises"]?.array ?? []).compactMap(\.object) where (e["tracking"]?.string ?? "") == "distance" {
            for s in (e["sets"]?.array ?? []).compactMap(\.object) { d += jsNum(s["weight"]); t += jsNum(s["reps"]) }
        }
        return (d, d > 0 && t > 0 ? t / d : 0)
    }

    /// friendWorkoutSummary(): name/date/volume/sets, miles and pace for cardio, every logged set per exercise.
    static func friendWorkoutSummary(_ w: [String: JSONValue]) -> JSONValue {
        var o: [String: JSONValue] = ["vol": .number(jsNum(w["totalVolume"])), "sets": .number(jsNum(w["sets"]))]
        if let n = w["name"], n != .null { o["name"] = n }
        if let d = w["date"], d != .null { o["date"] = d }
        let (d, pace) = distPace(w)
        if d > 0 { o["dist"] = .number(r2(d)); o["pace"] = .number(r2(pace)) }
        o["ex"] = .array((w["exercises"]?.array ?? []).compactMap(\.object).map { ex in
            let t = ex["tracking"]?.string.flatMap { $0.isEmpty ? nil : $0 } ?? "weight_reps"
            var e: [String: JSONValue] = ["id": .string(ex["exId"]?.string.flatMap { $0.isEmpty ? nil : $0 } ?? ""), "t": .string(t)]
            if let n = ex["name"], n != .null { e["n"] = n }
            e["sets"] = .array((ex["sets"]?.array ?? []).compactMap(\.object).filter { s in
                (s["done"]?.truthy ?? false) || jsNum(s["weight"]) > 0 || jsNum(s["reps"]) > 0
            }.map { s in
                let wt = jsNum(s["weight"]), rp = jsNum(s["reps"])
                switch t {
                case "distance": return .object(["mi": .number(r2(wt)), "min": .number(r2(rp))])
                case "duration": return .object(["sec": .number(jsRound(wt))])
                case "reps_only": return .object(["r": .number(jsRound(rp))])
                default: return .object(["w": .number(r2(wt)), "r": .number(jsRound(rp))])
                }
            })
            return .object(e)
        })
        return .object(o)
    }

    /// myActivity(): training days, the last 6 workouts, the last 30 days in detail (max 40), the
    /// month summary and the earned badges. All friends ever see of your history.
    func myActivity(badges list: [Badge]) -> [String: JSONValue] {
        var seen = Set<String>(), days: [JSONValue] = []
        for w in hist where !seen.contains(w.w.dayKey) { seen.insert(w.w.dayKey); days.append(.string(w.w.dayKey)) }
        let rev = Array(zip(histRaw, hist).reversed())
        let recent: [JSONValue] = rev.prefix(6).map { o, _ in
            var r: [String: JSONValue] = ["totalVolume": .number(jsNum(o["totalVolume"])), "sets": .number(jsNum(o["sets"]))]
            if let n = o["name"], n != .null { r["name"] = n }
            if let d = o["date"], d != .null { r["date"] = d }
            let (d, pace) = Self.distPace(o)
            if d > 0 { r["dist"] = .number(Self.r2(d)); r["pace"] = .number(Self.r2(pace)) }
            return .object(r)
        }
        let cutoff = nowMs - 30 * 864e5
        let wd = rev.filter { ($0.1.ms ?? -.infinity) >= cutoff }.prefix(40).map { Self.friendWorkoutSummary($0.0) }
        let m = monthStats(badges: list)
        let mObj: JSONValue = .object(["ym": .string(m.ym), "v": .number(m.v), "w": .number(m.w), "p": .number(m.p), "pv": .number(m.pv),
                                       "st": .number(m.st), "c": .number(m.c), "b": .number(m.b)])
        let bl: [JSONValue] = myBadgeList(list).map { .object(["n": .string($0.n), "t": .string($0.t), "e": .string($0.e)]) }
        return ["days": .array(days), "recent": .array(recent), "wd": .array(Array(wd)), "m": mObj, "badgeList": .array(bl)]
    }

    private var nowMs: Double { now.timeIntervalSince1970 * 1000 }

    /// syncMe(): the columns this phone writes to its own `profiles` row (code and updated_at aside).
    func publishColumns(badges list: [Badge]) -> [String: JSONValue] {
        let prof = raw["jk_prof"]?.object ?? [:]
        let you = yourStats(code: "", badges: list)
        return ["name": .string(prof["name"]?.string.flatMap { $0.isEmpty ? nil : $0 } ?? "Lifter"),
                "username": .string(prof["username"]?.string ?? ""),
                "total_volume": .number(jsRound(you.totalVolume)), "workouts": .number(you.workouts), "prs": .number(you.prs),
                "streak": .number(you.streak), "consistency": .number(you.consistency), "badges": .number(you.badges),
                "avatar_url": .string(prof["avatarUrl"]?.string ?? ""),
                "data": .object(myActivity(badges: list))]
    }

    /// monthOf(): this month's numbers for anyone on a board, on the viewer's calendar month.
    func monthOf(_ p: Person) -> Month {
        if p.isYou || p.mYm == ymKey(now) {
            return Month(ym: p.mYm, v: p.mVol, w: p.mWorkouts, p: p.mPRs, pv: p.pmVol, st: p.mStreak, c: p.mCons, b: p.mBadges)
        }
        let ms = monthStart(0), me = monthStart(1), ps = monthStart(-1)
        let cur = ymKey(now), prev = ymKey(Date(timeIntervalSince1970: ps / 1000))
        let wd: [(w: SharedWorkout, t: Double)] = p.wd.compactMap { w in
            guard !w.date.isEmpty, let d = JackedDate.parse(w.date) else { return nil }
            return (w, d.timeIntervalSince1970 * 1000)
        }
        let sumV: (Double, Double) -> Double = { a, b in jsRound(wd.filter { $0.t >= a && $0.t < b }.reduce(0) { $0 + $1.w.vol }) }
        let dk: (String) -> String = { s in JackedDate.isDayKey(s) ? s : JackedDate.parse(s).map { JackedDate.dayKey($0, calendar: self.cal) } ?? "" }
        let days = (p.days + wd.map { dk($0.w.date) } + p.recent.map { dk($0.date) }).filter { !$0.isEmpty }
        let ds = monthDayStats(days), latest = days.sorted().last ?? ""
        let pv = p.mYm == prev ? p.mVol : !p.mYm.isEmpty ? 0 : (latest.prefix(7) == cur ? p.pmVol : sumV(ps, ms))
        return Month(ym: "", v: sumV(ms, me), w: Double(wd.filter { $0.t >= ms && $0.t < me }.count), p: 0, pv: pv, st: ds.st, c: ds.c, b: 0)
    }

    /// crownCodes(): whoever lifted the most last calendar month on this board; nobody at 0, ties all crowned.
    func crownCodes(_ list: [Person]) -> Set<String> {
        let pv = list.map { monthOf($0).pv }, top = max(0, pv.max() ?? 0)
        return top > 0 ? Set(zip(list, pv).filter { $0.1 == top }.map(\.0.code)) : []
    }
}
