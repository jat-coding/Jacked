import Foundation

/// One badge as the Achievements page shows it (index.html computeBadges() list entry).
struct Badge: Identifiable {
    var id: String { name }
    let name: String
    let icon: String            // uic() icon name: dumbbell | trophy | heart | target | flame | calendarCheck | bed | arrowUp | crown
    let color: String           // hex, or a theme token ("blue", "orange", "green", "muted", "accent")
    var tiered = false
    var tier: String?           // bronze | silver | gold
    var earned = false
    var threeMonth = false
    var monthly = false
    var needsWeight = false
    var locked = false
    var desc = ""               // plain text (the PWA bolds the reached thresholds; here `ladder` carries them)
    var detail: String?
    var ladder: [Rung] = []
    var curV: String?
    var all: (v: String, tier: String?, hasTier: Bool)?
    var sections: [(t: String, met: Bool, rows: [(String, String)])] = []
    var group: String?
    var lifts: [BadgeLift] = []
    var everYM: String?
    var months = 0
}

typealias Rung = (label: String, reached: Bool)

struct BadgeLift { let key: String; let label: String; let v: Double; let tier: String?; let disp: String }

/// computeBadges() and its helpers, ported from index.html (names in the comments). Badges only
/// count ticked sets. The one write computeBadges makes (jk_monthBadges: this month's Challenge
/// group, done/comeback flags, the months Jacked was held) comes back as `monthBadges` + `dirty`
/// so the caller can save it through the merge + compare-and-swap layer like the web app does.
/// Hevy-imported workouts are judged by their stored exercise id (the web app re-matches them by
/// name once the library has loaded; not ported yet).
extension MetricsMath {
    struct BadgeResult { var list: [Badge]; var monthBadges: [String: JSONValue]; var dirty: Bool; var ladders: BadgeLadders }
    struct BadgeLadders { var bench, ohp, squat, pullup, pushup, cardio: [Double] }

    static let TIER_RANK = ["bronze": 1, "silver": 2, "gold": 3]
    static let MCOL = ["chest": "#5aa9ff", "back": "#3ddc97", "shoulders": "#ff9f4d", "biceps": "#b07cff", "triceps": "#ff5d6c", "legs": "#20d3c2",
                       "glutes": "#ffca4d", "core": "#4ad9d9", "cardio": "#ff5d6c"]
    static let TIERC = ["bronze": "#cd7f32", "silver": "#b8b8c8", "gold": "#ffd700"]
    struct Variant { let key: String; let label: String; let mult: Double }
    static let LIFT_VARIANTS: [String: [Variant]] = [
        "bench": [Variant(key: "bench", label: "Barbell bench", mult: 1), Variant(key: "benchDb", label: "Dumbbell bench", mult: BadgeTables.BADGE_DB_BONUS),
                  Variant(key: "benchSmith", label: "Smith machine bench", mult: BadgeTables.BADGE_SMITH_CUT)],
        "ohp": [Variant(key: "ohp", label: "Barbell overhead press", mult: 1), Variant(key: "ohpDb", label: "Dumbbell overhead press", mult: BadgeTables.BADGE_DB_BONUS),
                Variant(key: "ohpSmith", label: "Smith machine overhead press", mult: BadgeTables.BADGE_SMITH_CUT)],
    ]
    static let CARDIO_LEGS: [(key: String, ids: [String], label: String)] = [
        ("cardio", ["bi_run_outdoor"], "Running (outdoor)"), ("cardioTread", ["Running_Treadmill", "Jogging_Treadmill"], "Running (treadmill)")]

    // MARK: units (lbN / lbTxt / fmtClock)
    var isLb: Bool { settings.isLb }
    func lbN(_ lb: Double) -> Int { Int(jsRound(isLb ? lb : lb / 2.20462)) }
    func lbTxt(_ lb: Double) -> String { "\(lbN(lb)) \(isLb ? "lb" : "kg")" }
    static func fmtClock(_ min: Double) -> String {
        guard min.isFinite, min > 0 else { return "\u{2014}" }
        let m = Int(min.rounded(.down)), s = Int(jsRound((min - Double(m)) * 60))
        return "\(s == 60 ? m + 1 : m):" + String(format: "%02d", s == 60 ? 0 : s)
    }

    // MARK: which exercise counts (badgeStdId / isStdEx / repBadgeEx / stdRun)
    func badgeStdId(_ ex: HEx) -> String? { ex.exId.isEmpty || ex.exId.hasPrefix("cex") ? nil : ex.exId }
    func isStdEx(_ ex: HEx, _ key: String) -> Bool { badgeStdId(ex).map { BadgeTables.BADGE_STD[key]?.contains($0) ?? false } ?? false }
    func repBadgeEx(_ ex: HEx, _ kind: String) -> Bool { !ex.log.assist && WorkoutMath.bwMode(ex.log) != "assist" && isStdEx(ex, kind) }
    func stdRun(_ ex: HEx) -> Bool { ex.log.tracking == "distance" && isStdEx(ex, "cardio") }

    // MARK: ladders (badgeT and friends)
    static func mccullochFactor(_ age: Int?) -> Double {
        guard let a = age, a >= 41 else { return 1 }
        return 1 / BadgeTables.MCCULLOCH[min(a, 80) - 41]
    }
    static func r5(_ x: Double) -> Double { jsRound(x / 5) * 5 }
    var bwLb: Double { bw * 2.20462 }
    var benchSex: String? { let s = raw["jk_prof"]?["sex"]?.string; return s == "male" || s == "female" ? s : nil }
    var benchOK: Bool { benchSex != nil && bwLb > 0 }
    func benchLadder() -> [Double] {
        let f = Self.mccullochFactor(age)
        let bg: [Double]
        if let sex = benchSex, bwLb > 0 {
            let c = BadgeTables.GL_BENCH[sex]!
            bg = BadgeTables.BENCH_POINTS.map { p in
                let kg = p * (c[0] - c[1] * exp(-c[2] * bwLb * 0.45359237)) / 100
                return Self.r5(kg / 0.45359237 * f)
            }
        } else { bg = BadgeTables.BENCH_FALLBACK_LB.map { Self.r5($0 * f) } }
        return [bg[0], Self.r5((bg[0] + bg[1]) / 2), bg[1]]
    }
    static func interpStd(_ rows: [[Double]], _ bwLb: Double) -> [Double] {
        if bwLb <= rows[0][0] { return Array(rows[0].dropFirst()) }
        if bwLb >= rows[rows.count - 1][0] { return Array(rows[rows.count - 1].dropFirst()) }
        for i in 0..<(rows.count - 1) where bwLb <= rows[i + 1][0] {
            let t = (bwLb - rows[i][0]) / (rows[i + 1][0] - rows[i][0])
            return (1..<rows[i].count).map { j in rows[i][j] + (rows[i + 1][j] - rows[i][j]) * t }
        }
        return Array(rows[rows.count - 1].dropFirst())
    }
    func stdLadder(_ table: [String: [[Double]]]) -> [Double] {
        let v = Self.interpStd(table[sex]!, bwLb), f = Self.mccullochFactor(age)
        let b = Self.r5(v[0] * f), g = Self.r5(v[2] * f)
        return [b, Self.r5((b + g) / 2), g]
    }
    static func repInterp(_ xs: [Double], _ x: Double, _ f: (Int) -> [Double]) -> [Double] {
        if x <= xs[0] { return f(0) }
        if x >= xs[xs.count - 1] { return f(xs.count - 1) }
        for i in 0..<(xs.count - 1) where x <= xs[i + 1] {
            let t = (x - xs[i]) / (xs[i + 1] - xs[i]), a = f(i), b = f(i + 1)
            return a.indices.map { a[$0] + (b[$0] - a[$0]) * t }
        }
        return f(xs.count - 1)
    }
    func repLadder(_ table: [String: RepStd]) -> [Double] {
        let T = table[sex]!, a = Double(age ?? 30)
        let v = bwLb > 0
            ? Self.repInterp(BadgeTables.REP_STD_AGES, a) { i in Self.repInterp(T.bw, bwLb) { j in Array(T.rows[i][(j * 3)..<(j * 3 + 3)]) } }
            : Self.repInterp(T.age.map { $0[0] }, a) { i in Array(T.age[i].dropFirst()) }
        let b = max(1, jsRound(v[0])), g = max(b + 2, jsRound(v[2]))
        let s = max(b + 1, min(g - 1, jsRound((b + g) / 2)))
        return [b, s, g]
    }
    func cardioLadder() -> [Double] {
        let f = age.map { BadgeTables.WMA_MILE[sex]![min(100, max(5, $0)) - 5] } ?? 1
        let std = BadgeTables.CARDIO_STD[sex]!
        let b = Self.r5(std[0] / f), g = Self.r5(std[1] / f), s = Self.r5((b + g) / 2)
        return [b, s, g].map { $0 / 60 }
    }
    func badgeT() -> BadgeLadders {
        BadgeLadders(bench: benchLadder(), ohp: stdLadder(BadgeTables.OHP_STD), squat: stdLadder(BadgeTables.SQUAT_STD),
                     pullup: repLadder(BadgeTables.PULLUP_STD), pushup: repLadder(BadgeTables.PUSHUP_STD), cardio: cardioLadder())
    }
    static func tierOfLive(_ v: Double, _ t: [Double]) -> String? { v >= t[2] ? "gold" : v >= t[1] ? "silver" : v >= t[0] ? "bronze" : nil }
    static func tierOfLiveLow(_ v: Double, _ t: [Double]) -> String? { v <= t[2] ? "gold" : v <= t[1] ? "silver" : v <= t[0] ? "bronze" : nil }

    // MARK: per-badge bests
    struct VariantResult { var tier: String?; var value: Double; var by: BadgeLift?; var lifts: [BadgeLift] }
    func liftVariantsOf(_ badge: String, _ h: [HWorkout], _ minReps: Double, _ T: [Double]?) -> VariantResult {
        let V = Self.LIFT_VARIANTS[badge]!
        var v = [Double](repeating: 0, count: V.count)
        for w in h { for ex in w.exercises {
            guard let i = V.firstIndex(where: { isStdEx(ex, $0.key) }) else { continue }
            for s in ex.log.sets where s.done && s.reps >= minReps { let c = s.weight * 2.20462 * V[i].mult; if c > v[i] { v[i] = c } }
        } }
        let lifts = V.indices.filter { v[$0] > 0 }.map { i in
            BadgeLift(key: V[i].key, label: V[i].label, v: v[i], tier: T.flatMap { Self.tierOfLive(v[i], $0) }, disp: lbTxt(v[i])) }
        let top = lifts.enumerated().sorted { a, b in
            let ra = Self.TIER_RANK[a.element.tier ?? ""] ?? 0, rb = Self.TIER_RANK[b.element.tier ?? ""] ?? 0
            if ra != rb { return ra > rb }
            if a.element.v != b.element.v { return a.element.v > b.element.v }
            return a.offset < b.offset
        }.first?.element
        return VariantResult(tier: top?.tier, value: top?.v ?? 0, by: top, lifts: lifts)
    }
    func repTierOf(_ key: String, _ h: [HWorkout], _ T: BadgeLadders) -> (tier: String?, value: Double) {
        var best = 0.0
        for w in h { for ex in w.exercises where repBadgeEx(ex, key) { for s in ex.log.sets where s.done && s.reps > best { best = s.reps } } }
        return (Self.tierOfLive(best, key == "pullup" ? T.pullup : T.pushup), best)
    }
    func cardioBreakdown(_ src: [HWorkout], _ T: BadgeLadders) -> (tier: String?, value: Double, lifts: [BadgeLift]) {
        var v = [Double](repeating: .infinity, count: Self.CARDIO_LEGS.count)
        for w in src { for ex in w.exercises where stdRun(ex) {
            guard let id = badgeStdId(ex), let i = Self.CARDIO_LEGS.firstIndex(where: { $0.ids.contains(id) }) else { continue }
            for s in ex.log.sets where s.done && s.weight > 0 && s.reps > 0 { let me = WorkoutMath.mileEquiv(s.weight, s.reps); if me < v[i] { v[i] = me } }
        } }
        let lifts = Self.CARDIO_LEGS.indices.filter { v[$0].isFinite }.map { i in
            BadgeLift(key: Self.CARDIO_LEGS[i].key, label: Self.CARDIO_LEGS[i].label, v: v[i], tier: Self.tierOfLiveLow(v[i], T.cardio), disp: Self.fmtClock(v[i]) + "/mi") }
        let top = lifts.enumerated().sorted { a, b in
            let ra = Self.TIER_RANK[a.element.tier ?? ""] ?? 0, rb = Self.TIER_RANK[b.element.tier ?? ""] ?? 0
            if ra != rb { return ra > rb }
            if a.element.v != b.element.v { return a.element.v < b.element.v }
            return a.offset < b.offset
        }.first?.element
        return (top?.tier, top?.v ?? .infinity, lifts)
    }
    func bestLb(_ key: String, _ minReps: Double, _ src: [HWorkout]) -> Double {
        var best = 0.0
        for w in src { for ex in w.exercises where isStdEx(ex, key) { for s in ex.log.sets where s.done && s.reps >= minReps { best = max(best, s.weight * 2.20462) } } }
        return best
    }
    /// bestWeekTotal(): best rolling 7-day total of prCount.
    func bestWeekTotal(_ h: [HWorkout]) -> Int {
        var byDay: [String: Int] = [:]
        for w in h where w.w.prCount != 0 { byDay[w.w.dayKey, default: 0] += w.w.prCount }
        let days = byDay.keys.sorted()
        let ms = days.map { JackedDate.noon(of: $0, calendar: cal).map { $0.timeIntervalSince1970 * 1000 } ?? .nan }
        var best = 0, start = 0, sum = 0
        for end in days.indices {
            sum += byDay[days[end]]!
            while ms[end] - ms[start] > 6 * 864e5 { sum -= byDay[days[start]]!; start += 1 }
            best = max(best, sum)
        }
        return best
    }
    func bestStreak(_ h: [HWorkout]) -> Int { HomeMath.bestStreak(h.map(\.w), calendar: cal) }
    func last3mo() -> [HWorkout] {
        let c = cal.dateComponents([.year, .month, .day], from: now)
        let cut = cal.date(from: DateComponents(year: c.year, month: c.month! - 3, day: c.day))!.timeIntervalSince1970 * 1000
        return hist.filter { ($0.ms ?? -.infinity) >= cut }
    }

    // MARK: computeBadges()
    func computeBadges() -> BadgeResult {
        let h = hist
        let dates = Array(Set(h.map(\.w.dayKey).filter { !$0.isEmpty })).sorted()
        let nc = cal.dateComponents([.year, .month, .day], from: now)
        let mAt: (Int) -> Date = { k in self.cal.date(from: DateComponents(year: nc.year, month: nc.month! + k, day: 1))! }
        let mStart = mAt(0)
        let h3 = last3mo()
        let today = JackedDate.dayKey(now, calendar: cal)

        // 1) Coward-Maxing
        var weekOff = false
        if let f = dates.first, let first = JackedDate.noon(of: f, calendar: cal) {
            let dset = Set(dates); var d = mStart, run = 0
            while JackedDate.dayKey(d, calendar: cal) < today {
                let k = JackedDate.dayKey(d, calendar: cal)
                if dset.contains(k) || JackedDate.noon(of: k, calendar: cal)! <= first { run = 0 }
                else { run += 1; if run >= 7 { weekOff = true; break } }
                d = cal.date(byAdding: .day, value: 1, to: d)!
            }
        }
        // 2) PR-Maxing
        let prBest3 = bestWeekTotal(h3), prBestAll = bestWeekTotal(h)
        // 3) 1000lb Club
        var bestSingle = 0.0, club = false
        var bestParts: (bench: Double, squat: Double, dead: Double, by: Variant?)?
        for w in h {
            var bench = 0.0, squat = 0.0, dead = 0.0; var by: Variant?
            for ex in w.exercises {
                let lb = ex.log.sets.filter(\.done).reduce(0.0) { max($0, $1.weight) } * 2.20462
                if let bv = Self.LIFT_VARIANTS["bench"]!.first(where: { isStdEx(ex, $0.key) }) {
                    let c = lb * bv.mult; if c > bench { bench = c; by = bv }
                } else if isStdEx(ex, "squat") { squat = max(squat, lb) }
                else if isStdEx(ex, "deadlift") { dead = max(dead, lb) }
            }
            if bench > 0 && squat > 0 && dead > 0 {
                let t = bench + squat + dead
                if t > bestSingle { bestSingle = t; bestParts = (bench, squat, dead, by) }
                if t >= 1000 { club = true }
            }
        }
        // 4) tiered
        let TH = badgeT(), haveBW = bw > 0
        let benchR = liftVariantsOf("bench", h3, 1, TH.bench)
        let ohpR = liftVariantsOf("ohp", h3, 1, bwLb > 0 ? TH.ohp : nil)
        let ohpT = haveBW ? ohpR.tier : nil
        let sq = bestLb("squat", 1, h3), sqT = haveBW ? Self.tierOfLive(sq, TH.squat) : nil
        let benchBy: (VariantResult) -> String = { r in r.value > 0 ? self.lbTxt(r.value) + (r.by != nil && r.by!.key != "bench" ? " (\(r.by!.label))" : "") : "" }
        let ohpBy: (VariantResult) -> String = { r in self.lbTxt(r.value) + (r.by != nil && r.by!.key != "ohp" ? " (\(r.by!.label))" : "") }
        let pullR = repTierOf("pullup", h3, TH), pushR = repTierOf("pushup", h3, TH)
        let cardioR = cardioBreakdown(h3, TH), cardioAllR = cardioBreakdown(h, TH)
        var varSeen = Set<String>()
        for w in h { for ex in w.exercises where ex.log.sets.contains(where: \.done) {
            let k = ex.exId.isEmpty ? ex.name.lowercased().filter { $0 >= "a" && $0 <= "z" } : ex.exId
            if !k.isEmpty { varSeen.insert(k) }
        } }
        let variety = varSeen.count
        let bestRun = bestStreak(h3), bestRunAll = bestStreak(h)
        let ohpAll = liftVariantsOf("ohp", h, 1, bwLb > 0 ? TH.ohp : nil), qA = bestLb("squat", 1, h)
        let puR = repTierOf("pullup", h, TH), psR = repTierOf("pushup", h, TH)
        let benchAll = liftVariantsOf("bench", h, 1, TH.bench)
        var ALL: [String: (String, String?, Bool)] = [:]
        if benchAll.value > 0 { ALL["Bench-Maxing"] = (benchBy(benchAll), benchAll.tier, true) }
        if haveBW && ohpAll.value > 0 { ALL["Shoulder-Maxing"] = (ohpBy(ohpAll), ohpAll.tier, true) }
        if haveBW && qA > 0 { ALL["Leg-Maxing"] = (lbTxt(qA), Self.tierOfLive(qA, TH.squat), true) }
        if puR.value > 0 { ALL["Pull-up-Maxing"] = ("\(Int(puR.value)) reps", puR.tier, true) }
        if psR.value > 0 { ALL["Push-up-Maxing"] = ("\(Int(psR.value)) reps", psR.tier, true) }
        if cardioAllR.value.isFinite { ALL["Cardio-Maxing"] = ("\(Self.fmtClock(cardioAllR.value)) per mile", cardioAllR.tier, true) }
        if prBestAll > 0 { ALL["PR-Maxing"] = ("\(prBestAll) PR\(prBestAll != 1 ? "s" : "") in 7 days", nil, false) }
        if bestRunAll > 0 { ALL["Consistency-Maxing"] = ("\(bestRunAll) day\(bestRunAll != 1 ? "s" : "") in a row", nil, false) }

        // Monthly badges
        let ymOf: (Date) -> String = { d in let c = self.cal.dateComponents([.year, .month], from: d); return String(format: "%d-%02d", c.year!, c.month!) }
        let inMonth: (Date) -> [HWorkout] = { d0 in
            let c0 = self.cal.dateComponents([.year, .month], from: d0)
            return h.filter { w in guard let d = w.w.date else { return false }; let c = self.cal.dateComponents([.year, .month], from: d); return c.year == c0.year && c.month == c0.month }
        }
        let curYM = ymOf(mAt(0)), prevYM = ymOf(mAt(-1))
        var mb = raw["jk_monthBadges"]?.object ?? [:]
        var dirty = false
        let nCur = inMonth(mAt(0)).count, nLast = inMonth(mAt(-1)).count
        let avg3 = Double(inMonth(mAt(-2)).count + inMonth(mAt(-3)).count + inMonth(mAt(-4)).count) / 3
        let bounce = avg3 > 0 && Double(nLast) < avg3 && nCur > nLast
        let dimCur = cal.range(of: .day, in: .month, for: mStart)!.count
        let dCur = Set(inMonth(mAt(0)).map(\.w.dayKey)).count
        let steady = dCur * 2 >= dimCur
        let comeback = bounce || steady
        let grpOf: (HWorkout) -> Set<String> = { w in Set(w.exercises.map { self.logGroup($0) }.filter { !$0.isEmpty }) }
        if (mb[curYM]?["group"]?.string ?? "").isEmpty {
            let prevG = mb[prevYM]?["group"]?.string
            let CAND = Self.MGROUPS.filter { $0 != "glutes" && $0 != prevG }
            var src = inMonth(mAt(-1)); if src.isEmpty { src = h3 }
            var use: [String: Int] = [:]; CAND.forEach { use[$0] = 0 }
            for w in src { for e in w.exercises {
                let g = logGroup(e); guard use[g] != nil else { continue }
                let d = e.log.sets.filter(\.done).count
                use[g]! += d != 0 ? d : e.log.sets.count
            } }
            let low = CAND.map { use[$0]! }.min()!, ties = CAND.filter { use[$0] == low }
            let group = ties[(cal.component(.month, from: mAt(0)) - 1) % ties.count]
            let prevHits = inMonth(mAt(-1)).filter { grpOf($0).contains(group) }.count
            mb[curYM] = .object(["group": .string(group), "target": .number(Double(min(10, max(4, prevHits + 2))))]); dirty = true
        }
        var ch = mb[curYM]?.object ?? [:]
        let chGroup = ch["group"]?.string ?? "", chTarget = jsNum(ch["target"])
        let chCnt = inMonth(mAt(0)).filter { grpOf($0).contains(chGroup) }.count
        let chDone = Double(chCnt) >= chTarget || (ch["done"]?.truthy ?? false)
        if chDone && !(ch["done"]?.truthy ?? false) { ch["done"] = .bool(true); dirty = true }
        if comeback && !(ch["comeback"]?.truthy ?? false) { ch["comeback"] = .bool(true); dirty = true }
        mb[curYM] = .object(ch)
        let chWins = mb.values.filter { $0["done"]?.truthy ?? false }.count
        let cbWins = mb.values.filter { $0["comeback"]?.truthy ?? false }.count

        func tl(_ best: Double, _ t: [Double], _ fmt: (Double) -> String) -> [Rung] { t.map { (label: fmt($0), reached: best >= $0) } }
        let lbFmt: (Double) -> String = { "\(self.lbN($0))" }, rFmt: (Double) -> String = { "\(Int(jsRound($0)))" }
        let unit = isLb ? "lb" : "kg"
        let lineOf: ([Rung]) -> String = { $0.map(\.label).joined(separator: " / ") }
        let pullBest = Int(pullR.value), pushBest = Int(pushR.value)
        var list: [Badge] = []
        var b = Badge(name: "Bench-Maxing", icon: "dumbbell", color: Self.MCOL["chest"]!, tiered: true, tier: benchR.tier, earned: benchR.tier != nil)
        b.ladder = tl(benchR.value, TH.bench, lbFmt)
        b.desc = "\(benchOK ? "1-rep bench" : "Standard 1-rep bench") (\(unit)): \(lineOf(b.ladder))" + (benchR.by.map { $0.key != "bench" ? " · \($0.label) \(lbN(benchR.value))" : "" } ?? "")
        b.lifts = benchR.lifts; list.append(b)
        b = Badge(name: "Shoulder-Maxing", icon: "dumbbell", color: Self.MCOL["shoulders"]!, tiered: true, tier: ohpT, earned: ohpT != nil, needsWeight: !haveBW)
        if haveBW { b.ladder = tl(ohpR.value, TH.ohp, lbFmt); b.lifts = ohpR.lifts }
        b.desc = !haveBW ? "Enter body weight in Profile to unlock" : "1-rep OHP (\(unit)): \(lineOf(b.ladder))" + (ohpR.by.map { $0.key != "ohp" ? " · \($0.label) \(lbN(ohpR.value))" : "" } ?? "")
        list.append(b)
        b = Badge(name: "Leg-Maxing", icon: "dumbbell", color: Self.MCOL["legs"]!, tiered: true, tier: sqT, earned: sqT != nil, needsWeight: !haveBW)
        if haveBW { b.ladder = tl(sq, TH.squat, lbFmt) }
        b.desc = !haveBW ? "Enter body weight in Profile to unlock" : "1-rep squat (\(unit)): \(lineOf(b.ladder))"
        list.append(b)
        b = Badge(name: "1000lb Club", icon: "trophy", color: "#ffd700", earned: club)
        b.desc = bestSingle > 0 ? "Best single-session Big-3: \(lbTxt(bestSingle)) / \(lbTxt(1000))" : "Barbell bench + back squat + deadlift ≥ 1000 lb in one workout"
        if let p = bestParts {
            b.sections = [("Bench", false, [("Your best in that workout", lbTxt(p.bench) + (p.by != nil && p.by!.key != "bench" ? " (\(p.by!.label), credited)" : ""))]),
                          ("Squat", false, [("Your best in that workout", lbTxt(p.squat))]), ("Deadlift", false, [("Your best in that workout", lbTxt(p.dead))]),
                          ("Total", club, [("Combined", lbTxt(bestSingle) + " / " + lbTxt(1000))])]
        }
        list.append(b)
        b = Badge(name: "Pull-up-Maxing", icon: "dumbbell", color: Self.MCOL["back"]!, tiered: true, tier: pullR.tier, earned: pullR.tier != nil)
        b.ladder = tl(pullR.value, TH.pullup, rFmt); b.desc = "Best set: \(pullBest) reps — \(lineOf(b.ladder))"; list.append(b)
        b = Badge(name: "Push-up-Maxing", icon: "dumbbell", color: Self.MCOL["triceps"]!, tiered: true, tier: pushR.tier, earned: pushR.tier != nil)
        b.ladder = tl(pushR.value, TH.pushup, rFmt); b.desc = "Best set: \(pushBest) reps — \(lineOf(b.ladder))"; list.append(b)
        b = Badge(name: "Cardio-Maxing", icon: "heart", color: Self.MCOL["cardio"]!, tiered: true, tier: cardioR.tier, earned: cardioR.tier != nil)
        b.ladder = TH.cardio.map { (label: Self.fmtClock($0), reached: cardioR.value.isFinite && cardioR.value <= $0) }
        b.desc = cardioR.value.isFinite ? "Best mile pace: \(Self.fmtClock(cardioR.value))/mi — \(lineOf(b.ladder))" : "Log a Running exercise (miles + minutes) to unlock"
        b.lifts = cardioR.lifts; list.append(b)
        b = Badge(name: "Variety-Maxing", icon: "target", color: "blue", earned: variety >= 100); b.desc = "\(variety) / 100 different exercises logged"; list.append(b)
        b = Badge(name: "PR-Maxing", icon: "flame", color: "orange", earned: prBest3 >= 7, threeMonth: true)
        b.desc = "7 PRs in a rolling week — best: \(prBest3) PR\(prBest3 != 1 ? "s" : "") in 7 days"; list.append(b)
        b = Badge(name: "Consistency-Maxing", icon: "calendarCheck", color: "green", earned: bestRun >= 7, threeMonth: true)
        b.desc = "Train 7 days in a row — best: \(bestRun) day\(bestRun != 1 ? "s" : "")"; list.append(b)
        b = Badge(name: "Coward-Maxing", icon: "bed", color: "muted", earned: weekOff); b.desc = "7+ days off in a row"; list.append(b)
        let gName = Self.MGNAME[chGroup] ?? chGroup
        b = Badge(name: "Challenge-Maxing", icon: "dumbbell", color: Self.MCOL[chGroup] ?? "accent", earned: chDone, monthly: true)
        b.group = chGroup
        b.desc = "\(gName) \(min(chCnt, Int(chTarget))) / \(Int(chTarget))"
        b.detail = "Train \(gName) in \(Int(chTarget)) different workouts this month. \(chCnt) so far." + (chWins > 0 ? " Completed \(chWins) month\(chWins != 1 ? "s" : "") so far." : "")
        list.append(b)
        let half = Int((Double(dimCur) / 2).rounded(.up))
        b = Badge(name: "Comeback-Maxing", icon: "arrowUp", color: "green", earned: comeback || (ch["comeback"]?.truthy ?? false), monthly: true)
        b.desc = "\(dCur) / \(half) days this month"
        b.detail = "\(dCur) / \(half) days trained this month" + (cbWins > 0 ? " · earned \(cbWins) month\(cbWins != 1 ? "s" : "") so far" : "")
        b.sections = [("Steady", steady, [("Days trained this month", "\(dCur) / \(half)")]),
                      ("Bounce back", bounce, [("Sessions this month", "\(nCur)"), ("Sessions last month", "\(nLast)"),
                                               ("Your usual month", avg3 > 0 ? Self.jsStr(jsRound(avg3 * 10) / 10) : "none yet"),
                                               ("Last month below usual", avg3 > 0 && Double(nLast) < avg3 ? "Yes" : "No")])]
        list.append(b)
        for i in list.indices { if let a = ALL[list[i].name] { list[i].all = (a.0, a.1, a.2) } }
        let CUR: [String: String] = ["Bench-Maxing": benchBy(benchR), "Shoulder-Maxing": haveBW && ohpR.value > 0 ? ohpBy(ohpR) : "",
                                     "Leg-Maxing": haveBW && sq > 0 ? lbTxt(sq) : "", "Pull-up-Maxing": pullBest > 0 ? "\(pullBest) reps" : "",
                                     "Push-up-Maxing": pushBest > 0 ? "\(pushBest) reps" : "", "Cardio-Maxing": cardioR.value.isFinite ? "\(Self.fmtClock(cardioR.value))/mi" : ""]
        for i in list.indices { if let c = CUR[list[i].name] { list[i].curV = c } }
        let req = list.filter { $0.tiered || $0.threeMonth || $0.monthly }, tiered = list.filter(\.tiered)
        let nEarned = req.filter(\.earned).count, nGold = tiered.filter { $0.tier == "gold" }.count
        let jEarned = nEarned == req.count && !weekOff
        var jk = Badge(name: "Jacked", icon: "crown", color: "#ffd700", earned: jEarned, locked: weekOff)
        jk.desc = jEarned ? "Every monthly and 3-month badge earned" : "Unlock it and something special happens"
        jk.detail = "\(nEarned) / \(req.count) badges earned" + (tiered.isEmpty ? "" : " · \(nGold) / \(tiered.count) at Gold") + (weekOff ? " · locked by Coward-Maxing" : "")
        var jm: [String] = (mb["_jackedMonths"]?.array?.compactMap(\.string)) ?? (mb["_jacked"]?.string.map { [$0] } ?? [])
        if jEarned && !jm.contains(curYM) { jm.append(curYM); mb["_jackedMonths"] = .array(jm.map(JSONValue.string)); mb["_jacked"] = .string(curYM); dirty = true }
        jk.everYM = jm.last; jk.months = jm.count
        list.append(jk)
        return BadgeResult(list: list, monthBadges: mb, dirty: dirty, ladders: TH)
    }

    /// String(n) for a JS number with at most one decimal ("2", "2.3").
    static func jsStr(_ v: Double) -> String { v == v.rounded() ? String(Int(v)) : String(v) }

    /// benchHowNote(): where the bench numbers come from, for this profile.
    func benchHowNote() -> String {
        let ag = Self.mccullochFactor(age) != 1 ? ", eased for age \(age!)" : ""
        return benchOK ? "Set for your sex and \(lbTxt(bwLb)) body weight\(ag)." : "Standard numbers\(ag): set your sex and body weight in Profile to get your own."
    }

    /// badgeAdjNote(mccullochFactor): the squat / OHP "Adjusted for your profile" suffix.
    func badgeAdjNote() -> String {
        let fem = benchSex == "female", a = Self.mccullochFactor(age)
        return (fem || a != 1) ? " Adjusted for your profile" + (fem && a != 1 ? " (sex and age)" : fem ? " (sex)" : " (age)") + "." : ""
    }

    /// stdHowNote(key): where the pull-up / push-up / cardio numbers come from, for this profile.
    func stdHowNote(_ key: String) -> String {
        let fem = benchSex == "female", who = (fem ? "women" : "men") + (age.map { " aged \($0)" } ?? "")
        if key == "cardio" {
            return " Tiers are Running Level's Intermediate, Advanced and Elite mile times for \(fem ? "women" : "men")"
                + (age.map { ", adjusted to age \($0) with the official WMA/USATF age-grading factors" } ?? "")
                + ". Body weight isn't used: no running standard accounts for it." + (age == nil ? " Set your birthday in Profile to adjust for age." : "")
        }
        let name = key == "pullup" ? "pull-up" : "push-up"
        return " Tiers are Strength Level's Intermediate, Advanced and Elite \(name) standards for \(who)"
            + (bwLb > 0 ? " at \(lbTxt(bwLb)) body weight." : " at any body weight. Set your body weight in Profile to get your own.")
            + (age == nil ? " Set your birthday to adjust for age." : "")
    }

    /// BADGE_HOW: the one-line how-to under each badge in a friend's (or your own) badge list.
    func badgeShortHow(_ name: String, _ T: BadgeLadders) -> String {
        switch name {
        case "Bench-Maxing": return "Barbell flat bench, 1 rep. Flat dumbbell bench counts at +15% (both dumbbells together), Smith machine flat bench at -15%. Bronze \(lbN(T.bench[0])), Silver \(lbN(T.bench[1])), Gold \(lbTxt(T.bench[2])). " + benchHowNote()
        case "Shoulder-Maxing": return "Standing barbell overhead press, 1 rep, vs sourced strength standards for your sex and body weight (set it in Profile). Standing dumbbell press counts at +15% (both dumbbells together). Seated presses, including the Smith machine one, don't count. Bronze \(lbN(T.ohp[0])), Silver \(lbN(T.ohp[1])), Gold \(lbTxt(T.ohp[2]))." + badgeAdjNote()
        case "Leg-Maxing": return "Barbell back squat, 1 rep, vs sourced strength standards for your sex and body weight (set it in Profile). Bronze \(lbN(T.squat[0])), Silver \(lbN(T.squat[1])), Gold \(lbTxt(T.squat[2]))." + badgeAdjNote()
        case "1000lb Club": return "Barbell flat bench press + barbell back squat + conventional barbell deadlift from one workout, summed to 1000 lb or more. Flat dumbbell bench counts at +15%, Smith machine bench at -15%; no other variations."
        case "PR-Maxing": return "Hit 7 personal records within any rolling 7-day window. Only the last 3 months count."
        case "Consistency-Maxing": return "Finish a workout 7 days in a row. Only the last 3 months count."
        case "Coward-Maxing": return "Given after 7+ days off in a row this month. Resets monthly."
        case "Jacked": return "Every Monthly and 3-month badge earned -- any tier counts on the tiered ones. Permanent badges not needed. Locked while you hold Coward-Maxing."
        case "Pull-up-Maxing": return "Most reps in one set of strict pull-ups. Chin-ups, assisted and band pull-ups don't count. Bronze \(Self.jsStr(T.pullup[0])), Silver \(Self.jsStr(T.pullup[1])), Gold \(Self.jsStr(T.pullup[2]))." + stdHowNote("pullup")
        case "Push-up-Maxing": return "Most reps in one set of standard push-ups (not summed). Bronze \(Self.jsStr(T.pushup[0])), Silver \(Self.jsStr(T.pushup[1])), Gold \(Self.jsStr(T.pushup[2]))." + stdHowNote("pushup")
        case "Cardio-Maxing": let c = T.cardio.map(Self.fmtClock); return "Best mile pace from Running (outdoor) or Running (treadmill); other cardio doesn't count. Bronze \(c[0]), Silver \(c[1]), Gold \(c[2]) per mile." + stdHowNote("cardio")
        case "Challenge-Maxing": return "Train your weakest muscle group (glutes excluded) enough times this month. New group every month."
        case "Comeback-Maxing": return "Train half the days this month, or beat last month after a slow one."
        case "Variety-Maxing": return "Log one real set on 100 different library exercises. Each counts once, forever."
        default: return ""
        }
    }

    /// BADGE_HOW / BADGE_DETAIL text for the badge page, ported (plain text).
    func badgeHow(_ name: String, _ T: BadgeLadders) -> (how: String, tiers: [(String, String)], note: String?) {
        let three = "Your tier follows your best in the last 3 months."
        let lbt: ([Double]) -> [(String, String)] = { t in [("Bronze", self.lbTxt(t[0])), ("Silver", self.lbTxt(t[1])), ("Gold", self.lbTxt(t[2]))] }
        let rt: ([Double]) -> [(String, String)] = { t in [("Bronze", "\(Int(t[0])) reps"), ("Silver", "\(Int(t[1])) reps"), ("Gold", "\(Int(t[2])) reps")] }
        switch name {
        case "Bench-Maxing": return ("Barbell flat bench press (Barbell Bench Press, medium grip), 1 rep. Incline, decline, close-grip, other bench variations and custom exercises don't count. Flat dumbbell bench counts at +15% (both dumbbells added together), flat Smith machine bench at -15%. Whichever lift reaches the higher tier sets the badge. " + benchHowNote(), lbt(T.bench), three)
        case "Shoulder-Maxing": return ("Standing barbell overhead press (Standing Military Press), 1 rep, measured against sourced strength standards for your sex and body weight, set in Profile. Standing dumbbell press counts at +15% (both dumbbells together). Seated presses, push press and custom exercises don't count.", lbt(T.ohp), three)
        case "Leg-Maxing": return ("Barbell back squat (Barbell Squat), 1 rep, measured against sourced strength standards for your sex and body weight, set in Profile. Front squats, Smith machine and custom exercises don't count.", lbt(T.squat), three)
        case "1000lb Club": return ("Your best barbell flat bench press + barbell back squat + conventional barbell deadlift, all from the same workout, added together to 1000 lb or more. The bench can also be a flat dumbbell bench (+15%) or a flat Smith machine bench (-15%).", [], nil)
        case "Pull-up-Maxing": return ("Most reps in one set of strict pull-ups (Pullups, palms facing away). Chin-ups, assisted, band, scapular and custom exercises don't count.", rt(T.pullup), three)
        case "Push-up-Maxing": return ("Most reps in one set of standard push-ups (Pushups), not summed across sets. Incline, knee, other variations and custom exercises don't count.", rt(T.pushup), three)
        case "Cardio-Maxing": return ("Your best mile pace from Running (outdoor) or Running (treadmill), endurance-adjusted for distance. Bike, elliptical, rower, walking and custom exercises don't count.",
                                     [("Bronze", Self.fmtClock(T.cardio[0]) + " per mile"), ("Silver", Self.fmtClock(T.cardio[1]) + " per mile"), ("Gold", Self.fmtClock(T.cardio[2]) + " per mile")],
                                     "Your tier follows your best pace in the last 3 months.")
        case "Challenge-Maxing": return ("Your weakest muscle group each month (glutes excluded, never repeated). Train it in the target number of different workouts.", [], "Resets monthly with a new muscle group.")
        case "Comeback-Maxing": return ("Two ways in: Steady (train at least half the days this month) or Bounce back (more sessions than a slow last month).", [], "Resets monthly. Either one earns it.")
        case "Variety-Maxing": return ("Log a real set on 100 different exercises from the library. Each new one counts once, forever.", [], nil)
        case "PR-Maxing": return ("Hit 7 personal records within any rolling 7-day window. A single workout's PRs all count toward the total.", [], "Resets every 3 months. Only the last 3 months count.")
        case "Consistency-Maxing": return ("Finish a workout on 7 calendar days in a row. Same day twice still counts as one.", [], "Resets every 3 months. Only the last 3 months count.")
        case "Coward-Maxing": return ("Given after 7+ days off in a row this month. Holding it locks Jacked.", [], "Resets monthly. Starts fresh on the 1st.")
        case "Jacked": return ("Earn every Monthly reset and 3-month reset badge. Any tier counts on the tiered ones, Gold not required. Permanent badges are not needed. You also cannot have Coward-Maxing: holding it locks Jacked.", [], "Checked every month. Dropping a tiered badge below Bronze, or missing a monthly badge, loses Jacked until you earn it back.")
        default: return ("", [], nil)
        }
    }
}
