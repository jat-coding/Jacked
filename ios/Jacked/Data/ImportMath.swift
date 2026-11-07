import Foundation

/// Profile > Data & Backup > Import, ported from index.html importData / importJsonBackup /
/// importWorkoutCsv (with parseCSV, parseImportDate and resolveExercise). Pure functions over the
/// blob: the caller runs the result through BackupStore.edit, so it is saved with merge + CAS like
/// every other change. Parity with the PWA's own code: ios/Tests/parity/import-run.sh.
enum ImportMath {
    typealias Obj = [String: JSONValue]

    /// importData(): a file whose text starts with { or [ is a Jacked backup, anything else a workout-log CSV.
    static func isJSON(_ text: String) -> Bool {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.hasPrefix("{") || t.hasPrefix("[")
    }

    // MARK: Jacked backup (importJsonBackup + applyBundle without wipe)

    enum JSONResult: Equatable { case invalid, noData, bundle(Obj) }

    /// The jk_ keys of a backup file ({data:{...}} or the bare object). nil-equivalent results carry the PWA's toast.
    static func parseBackup(_ text: String) -> JSONResult {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parsed = try? JSONDecoder().decode(JSONValue.self, from: Data(t.utf8)) else { return .invalid }
        let inner = parsed["data"], data: JSONValue = inner?.object != nil || inner?.array != nil ? inner! : parsed
        guard let o = data.object else { return .noData }
        let keys = o.filter { $0.key.hasPrefix("jk_") }
        return keys.isEmpty ? .noData : .bundle(keys)
    }

    /// KEY_SHAPE / shapeOk: a key whose value has the wrong shape (an object where a list belongs) is skipped.
    static let keyShape: [String: Character] = [
        "routines": "a", "routineSections": "a", "collapsedSections": "a", "hist": "a", "cex": "a", "friends": "a", "closeBuddies": "a",
        "favEx": "a", "hiddenEx": "a", "deleted": "a", "bwlog": "a",
        "prof": "o", "prs": "o", "settings": "o", "exRename": "o", "exOverride": "o", "exNotes": "o", "cardioPR": "o", "holdPR": "o", "metrics": "o",
        "sugToday": "o", "sugLog": "o", "sugCuratedLog": "o", "activeWorkout": "o", "monthBadges": "o", "prRepair": "o", "prReset": "o", "prSug": "o",
    ]
    static func shapeOk(_ k: String, _ v: JSONValue) -> Bool {
        guard let t = keyShape[k], v != .null else { return true }
        return t == "a" ? v.array != nil : v.object != nil
    }

    /// Keys this phone never sends to the server (collectBackup leaves them out, so the web app's sync never carries them).
    static let localOnly: Set<String> = ["jk_activeWorkout", "jk_appVersion", "jk_friendsCache"]

    /// restoreKeys over the account blob: each well-shaped key replaces what is there. Returns the keys written and skipped.
    static func applyBundle(_ raw: inout Obj, _ bundle: Obj) -> (written: [String], rejected: [String]) {
        var w: [String] = [], r: [String] = []
        for k in bundle.keys.sorted() {
            let v = bundle[k]!
            if !shapeOk(String(k.dropFirst(3)), v) { r.append(k); continue }
            w.append(k)
            if localOnly.contains(k) { continue }
            // A legacy export kept some values as JSON text; restoreKeys stores those verbatim, so S.g() reads them parsed.
            if case .string(let s) = v, let p = try? JSONDecoder().decode(JSONValue.self, from: Data(s.utf8)) { raw[k] = p } else { raw[k] = v }
        }
        return (w, r)
    }

    // MARK: CSV (parseCSV)

    static func parseCSV(_ text: String) -> [[String]] {
        var rows: [[String]] = [], row: [String] = [], field = String.UnicodeScalarView(), q = false
        let s = Array(text.unicodeScalars)
        var i = 0
        while i < s.count {
            let c = s[i]
            if q {
                if c == "\"" { if i + 1 < s.count && s[i + 1] == "\"" { field.append("\""); i += 1 } else { q = false } } else { field.append(c) }
            } else if c == "\"" { q = true }
            else if c == "," { row.append(String(field)); field = .init() }
            else if c == "\n" { row.append(String(field)); rows.append(row); row = []; field = .init() }
            else if c == "\r" {}
            else { field.append(c) }
            i += 1
        }
        if !field.isEmpty || !row.isEmpty { row.append(String(field)); rows.append(row) }
        return rows.filter { !($0.count == 1 && $0[0].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
    }

    // MARK: dates (parseImportDate)

    private static func rx(_ p: String, _ o: NSRegularExpression.Options = []) -> NSRegularExpression { try! NSRegularExpression(pattern: p, options: o) }
    private static func groups(_ re: NSRegularExpression, _ s: String) -> [String?]? {
        guard let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
        return (0..<m.numberOfRanges).map { Range(m.range(at: $0), in: s).map { String(s[$0]) } }
    }
    private static let slashRe = rx(#"^(\d{1,2})([\/.])(\d{1,2})\2(\d{2}|\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$"#)

    /// new Date(y, mon-1, day, H, M, S) in local time, with JS's rollover (Feb 30 = Mar 1/2). The calendar day is
    /// rolled over first, then the wall-clock time is set on it, so a DST change that day doesn't move the hour.
    static func localDate(_ y: Int, _ mon: Int, _ day: Int, _ h: Int = 0, _ mi: Int = 0, _ sec: Int = 0, _ ms: Double = 0) -> Date? {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = .current
        guard let jan = cal.date(from: DateComponents(year: y, month: 1, day: 1, hour: 12)),
              let m = cal.date(byAdding: .month, value: mon - 1, to: jan),
              let d = cal.date(byAdding: .day, value: day - 1 + h / 24, to: m) else { return nil }
        let c = cal.dateComponents([.year, .month, .day], from: d)
        guard let out = cal.date(from: DateComponents(year: c.year, month: c.month, day: c.day, hour: h % 24, minute: mi, second: sec)) else { return nil }
        return out.addingTimeInterval(ms / 1000)
    }

    static func parseImportDate(_ s0: String, dayFirst: Bool) -> Date? {
        let s = s0.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return nil }
        if let m = groups(slashRe, s) {
            let a = Int(m[1]!)!, b = Int(m[3]!)!, yy = Int(m[4]!)!
            let df = m[2] == "." || dayFirst || a > 12
            let day = df ? a : b, mon = df ? b : a, y = yy < 100 ? 2000 + yy : yy
            var H = m[5].flatMap { Int($0) } ?? 12
            if let ap = m[8] { H = H % 12 + (ap.lowercased().hasPrefix("p") ? 12 : 0) }
            guard let d = localDate(y, mon, day, H, Int(m[6] ?? "0") ?? 0, Int(m[7] ?? "0") ?? 0) else { return nil }
            var cal = Calendar(identifier: .gregorian); cal.timeZone = .current
            return cal.component(.month, from: d) == mon && cal.component(.day, from: d) == day ? d : nil
        }
        var t = s
        if groups(rx(#"^\d{4}-\d{2}-\d{2}$"#), t) != nil { t += "T12:00:00" }
        if let d = jsDateParse(t) { return d }
        if let r = t.range(of: ",") { t.replaceSubrange(r, with: "") }
        return jsDateParse(t)
    }

    /// `new Date(string)` for the shapes workout apps export: the ECMAScript ISO format, then V8's
    /// legacy reading ("15 Oct 2024, 18:05", "Oct 15, 2024 6:05 PM", "2024-10-15 18:05:00", "2024/10/15").
    static func jsDateParse(_ s: String) -> Date? {
        let iso = BackupMerge.parseISO(s)
        if !iso.isNaN { return Date(timeIntervalSince1970: iso / 1000) }
        // ISO year or year-month: UTC, the 1st.
        if let g = groups(rx(#"^(\d{4})(?:-(\d{2}))?$"#), s) {
            let mo = g[2].flatMap { Int($0) } ?? 1
            guard (1...12).contains(mo) else { return nil }
            var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "UTC")!
            return cal.date(from: DateComponents(year: Int(g[1]!)!, month: mo, day: 1))
        }
        // V8 rolls an ISO local date-time's day over (2024-02-30T12:00 is March 1) where the spec says invalid.
        if let g = groups(rx(#"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$"#), s) {
            let n = g.dropFirst().prefix(6).map { $0.flatMap { Int($0) } ?? 0 }
            guard (1...12).contains(n[1]), (1...31).contains(n[2]), n[3] < 24, n[4] < 60, n[5] < 60 else { return nil }
            return localDate(n[0], n[1], n[2], n[3], n[4], n[5], g[7].map { Double(($0 + "00").prefix(3))! } ?? 0)
        }
        return legacyDate(s)
    }

    private static let months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    private static let dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
    private static let tokenRe = rx(#"(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?|[A-Za-z]+|[+-]\d{4}|\d+|[(),/\-. ]"#)

    private static func legacyDate(_ s: String) -> Date? {
        var nums: [String] = [], mon: Int?, time: (Int, Int, Int, Double)?, ampm: String?, offset: Int?, utc = false
        var covered = 0
        let ns = s as NSString
        for m in tokenRe.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
            guard m.range.location == covered else { return nil }
            covered = m.range.location + m.range.length
            let tok = ns.substring(with: m.range)
            if m.range(at: 1).location != NSNotFound {
                guard time == nil else { return nil }
                let ms = m.range(at: 4).location != NSNotFound ? Double((ns.substring(with: m.range(at: 4)) + "00").prefix(3))! : 0
                time = (Int(ns.substring(with: m.range(at: 1)))!, Int(ns.substring(with: m.range(at: 2)))!,
                        m.range(at: 3).location != NSNotFound ? Int(ns.substring(with: m.range(at: 3)))! : 0, ms)
            } else if let c = tok.unicodeScalars.first, CharacterSet.letters.contains(c) {
                let w = tok.lowercased()
                if w == "am" || w == "pm" { ampm = w }
                else if w == "z" || w == "utc" || w == "gmt" || w == "ut" { utc = true }
                else if w == "t" && time == nil {}
                else if w.count >= 3, let i = months.firstIndex(where: { w.hasPrefix($0) }) { guard mon == nil else { return nil }; mon = i + 1 }
                else if w.count >= 3, dayNames.contains(where: { w.hasPrefix($0) }) {}
                else { return nil }
            } else if (tok.hasPrefix("+") || tok.hasPrefix("-")) && tok.count == 5 {
                let v = Int(tok.dropFirst())!, sign = tok.hasPrefix("-") ? -1 : 1
                if time != nil { offset = sign * ((v / 100) * 60 + v % 100) } else { nums.append(String(tok.dropFirst())) }
            } else if tok.first!.isNumber {
                nums.append(tok)
            }
        }
        guard covered == ns.length else { return nil }
        var y: Int, mo: Int, d: Int
        if mon == nil && nums.count == 1 && time == nil {
            // A lone number: 1-12 is that month of 2001, 0 is 2000, 32-49 20xx, 50-99 19xx, 100+ a year; 13-31 NaN.
            let n = Int(nums[0])!
            switch n {
            case 1...12: return localDate(2001, n, 1)
            case 0: return localDate(2000, 1, 1)
            case 32...49: return localDate(2000 + n, 1, 1)
            case 50...99: return localDate(1900 + n, 1, 1)
            case 100...275_760: return localDate(n, 1, 1)
            default: return nil
            }
        }
        if let mon {
            guard nums.count == 2 else { return nil }
            mo = mon
            let a = Int(nums[0])!, b = Int(nums[1])!
            if nums[0].count >= 3 || a > 31 { y = a; d = b } else { d = a; y = b }
        } else {
            guard nums.count == 3 else { return nil }
            if nums[0].count >= 3 { y = Int(nums[0])!; mo = Int(nums[1])!; d = Int(nums[2])! }
            else { mo = Int(nums[0])!; d = Int(nums[1])!; y = Int(nums[2])! }
        }
        if y < 50 && String(y).count <= 2 { y += 2000 } else if y < 100 { y += 1900 }
        guard (1...12).contains(mo), (1...31).contains(d) else { return nil }
        var (h, mi, sec, ms) = time ?? (0, 0, 0, 0)
        if let ampm { guard h <= 12 else { return nil }; h = h % 12 + (ampm == "pm" ? 12 : 0) }
        guard h <= 24, mi < 60, sec < 60 else { return nil }
        if utc || offset != nil {
            var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(secondsFromGMT: (offset ?? 0) * 60)!
            guard let base = cal.date(from: DateComponents(year: y, month: mo, day: 1)) else { return nil }
            return base.addingTimeInterval(Double((d - 1) * 86400 + h * 3600 + mi * 60 + sec) + ms / 1000)
        }
        return localDate(y, mo, d, h, mi, sec, ms)
    }

    // MARK: exercise matching (normName / resolveExercise)

    static func normName(_ s: String) -> String {
        var t = s.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !(0x300...0x36F).contains($0.value) }
            .map(String.init).joined().lowercased()
        t = t.replacingOccurrences(of: #"\(.*?\)"#, with: " ", options: .regularExpression)
        t = t.replacingOccurrences(of: "[^a-z0-9 ]", with: " ", options: .regularExpression)
        t = t.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        return t.trimmingCharacters(in: .whitespaces)
    }
    private static func words(_ s: String) -> [String] { normName(s).split(separator: " ").map(String.init) }
    private static func paren(_ s: String) -> String {
        let re = rx(#"\(([^)]*)\)"#), ns = s as NSString
        return re.matches(in: s, range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range(at: 1)) }.joined(separator: " ")
    }
    private static func flatEq(_ s: String) -> String {
        let f = s.lowercased().replacingOccurrences(of: "[^a-z]", with: "", options: .regularExpression)
        return ["bodyweight": "bodyonly", "bands": "band", "kettlebells": "kettlebell", "ezcurlbar": "ezbar", "ezbar": "ezbar", "smithmachine": "machine"][f] ?? f
    }
    private static let EQ: Set<String> = ["barbell", "dumbbell", "machine", "cable", "bodyonly", "band", "kettlebell", "ezbar", "other", "medicineball", "exerciseball"]
    private static let SOFT: Set<String> = ["grip", "medium", "med", "standard", "with", "the", "a", "and", "v", "attachment"]
    private static let ALIAS: [(String, String)] = [(#"\boverhead press\b"#, "standing military press"), (#"\bohp\b"#, "standing military press"),
                                                    (#"\brdl\b"#, "romanian deadlift"), (#"\bside plank\b"#, "side bridge"), (#"\bskullcrushers?\b"#, "skullcrusher")]
    private static func tokEq(_ t: String, _ w: String) -> Bool { t == w || t == w + "s" || t == w + "es" || w == t + "s" || w == t + "es" }
    private static func flat(_ a: [String]) -> String { a.joined().replacingOccurrences(of: "e?s$", with: "", options: .regularExpression) }

    struct Candidate { let e: CatalogExercise; let base: [String]; let detail: [String]; let hay: [String]; let eq: String; let builtIn: Bool }

    /// The scored library for resolveExercise, built once per import (allEx() order).
    static func candidates(_ lib: [CatalogExercise]) -> [Candidate] {
        let b = Set(PWATables.builtIns.filter { !$0.id.hasPrefix("wu_") }.map(\.id))
        return lib.map { e in
            let base = words(e.name), detail = words(paren(e.name).replacingOccurrences(of: ",", with: " "))
            return Candidate(e: e, base: base, detail: detail,
                             hay: base + words(e.equip) + (e.dbName.isEmpty ? [] : words(e.dbName)) + detail, eq: flatEq(e.equip),
                             builtIn: b.contains(e.id) && !e.custom)
        }
    }

    static func resolveExercise(_ keyword: String, _ lib: [Candidate]) -> String? {
        let all = words(keyword).filter { $0.count > 1 }
        if all.isEmpty { return nil }
        let hint = flatEq(paren(keyword)), hintEq = EQ.contains(hint) ? hint : ""
        let cardio = MetricsMath.guessMuscle(keyword) == "cardio"
        func pick(_ want: [String]) -> (String, Double)? {
            var best: CatalogExercise?, bs = Double.infinity
            let fw = flat(want)
            for c in lib {
                if cardio && !LibraryMath.isCardioCat(c.e) { continue }
                let joined = fw == flat(c.base)
                if !joined && !want.allSatisfy({ w in c.hay.contains { tokEq($0, w) } }) { continue }
                var sc = joined ? 0 : c.base.filter { t in !want.contains { tokEq(t, $0) } }.reduce(0.0) { $0 + (SOFT.contains($1) ? 0.5 : 1) }
                sc += 0.01 * Double(want.filter { !c.base.contains($0) }.count)
                sc += 0.1 * Double(c.detail.filter { t in !SOFT.contains(t) && !EQ.contains(flatEq(t)) && !want.contains { tokEq(t, $0) } }.count)
                if !hintEq.isEmpty && c.eq != hintEq { sc += 2 }
                if c.builtIn { sc += 0.5 }
                if sc < bs { bs = sc; best = c.e }
            }
            return best.map { ($0.id, bs) }
        }
        let gripRe = rx("^(wide|close|narrow|neutral|rope|single|one|arm|two)$")
        func tryAll(_ want: [String]) -> (String, Double)? {
            pick(want) ?? pick(want.filter { !SOFT.contains($0) && groups(gripRe, $0) == nil })
        }
        let joinedAll = all.joined(separator: " ")
        let alias = ALIAS.reduce(joinedAll) { $0.replacingOccurrences(of: $1.0, with: $1.1, options: .regularExpression) }
        let hits = [tryAll(all), alias != joinedAll ? tryAll(alias.split(separator: " ").map(String.init)) : nil].compactMap { $0 }
        return hits.enumerated().sorted { $0.element.1 != $1.element.1 ? $0.element.1 < $1.element.1 : $0.offset < $1.offset }.first?.element.0
    }

    static func impId(_ name: String) -> String {
        "imp_" + name.lowercased().replacingOccurrences(of: "[^a-z0-9]+", with: "_", options: .regularExpression)
    }

    // MARK: workout-log CSV (importWorkoutCsv)

    struct CSVPlan {
        enum Unit: String { case lb, kg }
        let rows: [[String]]
        let header: [String]
        let ci: [String: Int]
        let distMi: Double
        /// The weight unit the file states; nil with needsUnit = ask (askImportUnit).
        let fileUnit: Unit?
        let needsUnit: Bool
    }
    enum CSVError: Error, Equatable {
        case unreadable, unrecognized, noNew
        /// The PWA's toast for each.
        var message: String {
            switch self {
            case .unreadable: return "Could not read that file"
            case .unrecognized: return "Unrecognized file \u{2014} expected a Hevy-style CSV"
            case .noNew: return "No new workouts found in file"
            }
        }
    }

    /// Reading the header: which column is which, and whether the weight unit has to be asked.
    static func plan(_ text: String) -> Result<CSVPlan, CSVError> {
        let rows = parseCSV(text)
        if rows.count < 2 { return .failure(.unreadable) }
        let header = rows[0].map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().replacingOccurrences(of: #"\s+"#, with: "_", options: .regularExpression) }
        func col(_ names: String...) -> Int { for n in names { if let i = header.firstIndex(of: n) { return i } }; return -1 }
        var ci: [String: Int] = [
            "title": col("title", "workout_name", "workout", "workout_title"), "start": col("start_time", "date", "workout_date", "start"),
            "end": col("end_time", "end"), "ex": col("exercise_title", "exercise_name", "exercise"),
            "reps": col("reps", "rep_count", "rep"), "setType": col("set_type"),
            "dist": col("distance_km", "distance_miles", "distance_mi", "distance"), "dur": col("duration_seconds", "duration_sec", "duration"),
            "unit": col("weight_unit", "weight_units", "unit", "units"),
        ]
        var w = col("weight_kg", "weight_lbs", "weight_lb", "weight")
        if w < 0 { w = header.firstIndex { $0.hasPrefix("weight") && !$0.contains("unit") } ?? -1 }
        ci["w"] = w
        let distMi = ci["dist"]! >= 0 && header[ci["dist"]!].contains("km") ? 1 / 1.609344 : 1
        if ci["ex"]! < 0 { return .failure(.unrecognized) }
        let hw = w >= 0 ? header[w] : ""
        let fileUnit: CSVPlan.Unit? = hw.contains("lb") ? .lb : hw.contains("kg") ? .kg : nil
        let p0 = CSVPlan(rows: rows, header: header, ci: ci, distMi: distMi, fileUnit: fileUnit, needsUnit: false)
        let needs = fileUnit == nil && w >= 0 && rows.dropFirst().contains { r in jsParseFloat(cell(r, w)) > 0 && rowUnit(p0, r) == nil }
        return .success(CSVPlan(rows: rows, header: header, ci: ci, distMi: distMi, fileUnit: fileUnit, needsUnit: needs))
    }

    private static func cell(_ r: [String], _ i: Int) -> String { i >= 0 && i < r.count ? r[i] : "" }
    private static func rowUnit(_ p: CSVPlan, _ r: [String]) -> CSVPlan.Unit? {
        let u = cell(r, p.ci["unit"]!).lowercased()
        return u.contains("lb") || u.contains("pound") ? .lb : u.contains("kg") || u.contains("kilo") ? .kg : nil
    }

    struct CSVResult { var raw: Obj; let imported: Int; let badDate: Int }

    /// The import itself. `unit` is the answer to the pounds/kilograms question (nil when the file says it).
    /// `lib` is allEx(); byId falls back to the humanised id like the PWA's.
    static func importCSV(_ p: CSVPlan, unit: CSVPlan.Unit?, raw: Obj, lib: [CatalogExercise]) -> Result<CSVResult, CSVError> {
        let fileUnit = p.fileUnit ?? unit
        let ci = p.ci
        // Group rows into workouts by start time + title (Map insertion order).
        var order: [String] = [], grp: [String: (title: String, start: String, end: String, rows: [[String]])] = [:]
        for r in 1..<p.rows.count {
            let row = p.rows[r]; if row.isEmpty { continue }
            let t = cell(row, ci["title"]!), title = t.isEmpty ? "Workout" : t
            let st = cell(row, ci["start"]!), start = st.isEmpty ? String(r) : st
            let key = start + "|" + title
            if grp[key] == nil { order.append(key); grp[key] = (title, start, cell(row, ci["end"]!), []) }
            grp[key]!.rows.append(row)
        }
        let hist = histClean(raw["jk_hist"]?.array ?? [])
        let existing = Set(hist.map { w -> String in
            let d = w["date"]?.string.map { String($0.split(separator: "T", omittingEmptySubsequences: false).first ?? "") } ?? ""
            return d + "|" + (w["name"].map(jsString) ?? "undefined")
        })
        let firstNum = rx(#"^(\d{1,2})\/\d{1,2}\/"#)
        let dayFirst = order.contains { k in
            let s = grp[k]!.start.trimmingCharacters(in: .whitespacesAndNewlines)
            return groups(firstNum, s).map { Int($0[1]!)! > 12 } ?? false
        }
        let cands = candidates(lib)
        let byId: (String) -> CatalogExercise = { id in
            lib.first { $0.id == id } ?? CatalogExercise(id: id, name: id, muscle: "", equip: "", tracking: "weight_reps", assist: false, image: nil, custom: false)
        }
        var built: [Obj] = [], badDate = 0
        for k in order {
            let g = grp[k]!
            guard let d = parseImportDate(g.start, dayFirst: dayFirst) else { badDate += 1; continue }
            let iso = HistRepair.isoString(d)
            if existing.contains(String(iso.prefix(10)) + "|" + g.title) { continue }
            struct RS { var weight: Double; var reps: Double; var mi: Double; var sec: Double }
            var exOrder: [String] = [], exMap: [String: [RS]] = [:]
            for row in g.rows {
                let name = cell(row, ci["ex"]!).trimmingCharacters(in: .whitespacesAndNewlines); if name.isEmpty { continue }
                if ci["setType"]! >= 0 && cell(row, ci["setType"]!).lowercased() == "warmup" { continue }
                var w = ci["w"]! >= 0 ? jsParseFloat(cell(row, ci["w"]!)) : 0; if w.isNaN { w = 0 }; w = max(0, w)
                if (rowUnit(p, row) ?? fileUnit) == .lb { w = w / 2.20462 }
                var reps = ci["reps"]! >= 0 ? jsParseInt(cell(row, ci["reps"]!)) : 0; if reps.isNaN { reps = 0 }; reps = max(0, reps)
                var dist = ci["dist"]! >= 0 ? jsParseFloat(cell(row, ci["dist"]!)) : 0; if dist.isNaN { dist = 0 }; dist = max(0, dist)
                var secs = ci["dur"]! >= 0 ? jsParseFloat(cell(row, ci["dur"]!)) : 0; if secs.isNaN { secs = 0 }; secs = max(0, secs)
                if exMap[name] == nil { exOrder.append(name); exMap[name] = [] }
                exMap[name]!.append(RS(weight: jsRound(w * 100) / 100, reps: reps, mi: dist * p.distMi, sec: secs))
            }
            if exOrder.isEmpty { continue }
            var exercises: [Obj] = []
            for name in exOrder {
                let sets = exMap[name]!
                let id = resolveExercise(name, cands) ?? impId(name)
                let meta = byId(id)
                let tracking = meta.tracking == "distance" && sets.contains { $0.mi > 0 && $0.sec > 0 } ? "distance"
                    : meta.tracking == "duration" && sets.contains { $0.sec > 0 } ? "duration" : "weight_reps"
                let js: [JSONValue] = sets.map { x in
                    tracking == "distance" ? .object(["weight": .number(jsRound(x.mi * 100) / 100), "reps": .number(jsRound(x.sec / 60 * 100) / 100), "done": .bool(true)])
                        : tracking == "duration" ? .object(["weight": .number(jsRound(x.sec)), "reps": .number(0), "done": .bool(true)])
                        : .object(["weight": .number(x.weight), "reps": .number(x.reps), "done": .bool(true)])
                }
                let muscle = meta.muscle.isEmpty ? MetricsMath.guessMuscle(name) : meta.muscle
                // histImgUrl: an own exercise's photo stays on the phone, so only a library photo goes into history.
                let img: JSONValue = meta.custom ? .null : meta.image.map { .string(ExerciseImages.base + $0) } ?? .null
                exercises.append(["exId": .string(id), "name": .string(name), "muscle": .string(muscle), "equip": .string(meta.equip),
                                  "tracking": .string(tracking), "imgUrl": img, "sets": .array(js)])
            }
            let ts = exercises.reduce(0) { $0 + ($1["sets"]?.array?.count ?? 0) }
            let vol = exercises.reduce(0.0) { a, e in
                let tr = e["tracking"]?.string
                return a + (tr == "distance" || tr == "duration" ? 0 : (e["sets"]?.array ?? []).reduce(0.0) { $0 + jsNum($1["weight"]) * jsNum($1["reps"]) })
            }
            var dur = "\u{2014}"
            if !g.end.isEmpty, let de = parseImportDate(g.end, dayFirst: dayFirst) {
                let sec = max(0, Int(jsRound((de.timeIntervalSince1970 * 1000 - d.timeIntervalSince1970 * 1000) / 1000)))
                if sec != 0 { dur = String(format: "%02d:%02d", sec / 60, sec % 60) }
            }
            let ms = Int64((d.timeIntervalSince1970 * 1000).rounded())
            built.append(["id": .string("w\(ms)_\(built.count)"), "name": .string(g.title), "date": .string(iso),
                          "exercises": .array(exercises.map(JSONValue.object)), "duration": .string(dur), "sets": .number(Double(ts)),
                          "totalVolume": .number(jsRound(vol))])
        }
        if built.isEmpty { return .failure(.noNew) }

        let t: (Obj) -> Double = { BackupMerge.jsDate($0["date"]) }
        built = PRReplay.jsSort(built) { t($0) - t($1) }
        // Recompute PRs chronologically so the 1000lb-club / PR-Maxing badges can unlock.
        var prs = raw["jk_prs"]?.object ?? [:], hold = raw["jk_holdPR"]?.object ?? [:], cardio = raw["jk_cardioPR"]?.object ?? [:]
        for wi in built.indices {
            var n = 0
            let date = built[wi]["date"]!
            for e in built[wi]["exercises"]?.array ?? [] {
                guard let id = e["exId"]?.string, let tr = e["tracking"]?.string else { continue }
                let sets = (e["sets"]?.array ?? []).map { (w: jsNum($0["weight"]), r: jsNum($0["reps"])) }
                if tr == "distance" {
                    guard id != "?" else { continue }
                    var b: (w: Double, r: Double)?
                    for s in sets where s.w > 0 && s.r > 0 { if b == nil || BackupMerge.mileEquiv(s.w, s.r) < BackupMerge.mileEquiv(b!.w, b!.r) { b = s } }
                    guard let b else { continue }
                    let prev = (cardio[id]?.truthy ?? false) ? (cardio[id]?.object ?? [:]) : [:]
                    var nrec = prev
                    let far = sets.reduce(0.0) { max($0, $1.w) }
                    if BackupMerge.mileEquiv(b.w, b.r) < BackupMerge.mileEquiv(jsNum(prev["dist"]), jsNum(prev["time"])) {
                        nrec["dist"] = .number(b.w); nrec["time"] = .number(b.r); nrec["date"] = date; n += 1
                    }
                    if far > jsNum(prev["maxDist"]) { nrec["maxDist"] = .number(far); nrec["maxDate"] = date }
                    cardio[id] = .object(nrec)
                    continue
                }
                if tr == "duration" {
                    guard id != "?" else { continue }
                    var b: Double?
                    for s in sets where s.w > 0 { if b == nil || s.w > b! { b = s.w } }
                    let cur = (hold[id]?.truthy ?? false) ? jsNum(hold[id]?["sec"]) : 0
                    if let b, b > cur { hold[id] = .object(["sec": .number(b), "date": date]); n += 1 }
                    continue
                }
                let done = sets.filter { $0.w > 0 || $0.r > 0 }; if done.isEmpty { continue }
                let best = done.enumerated().sorted { a, c in
                    let x = c.element.w - a.element.w != 0 ? c.element.w - a.element.w : c.element.r - a.element.r
                    return x != 0 ? x < 0 : a.offset < c.offset
                }[0].element
                let prev = prs[id].flatMap { $0.truthy ? $0 : nil }
                let pw = prev.map { $0["weight"].map { $0.jsNumber } ?? .nan } ?? 0, pr = prev.map { $0["reps"].map { $0.jsNumber } ?? .nan } ?? 0
                if best.w > pw || (best.w == pw && best.r > pr) {
                    prs[id] = .object(["weight": .number(best.w), "reps": .number(best.r), "date": date]); n += 1
                }
            }
            built[wi]["prCount"] = .number(Double(n))
        }
        var out = raw
        let merged = PRReplay.jsSort(hist + built.map(JSONValue.object)) { BackupMerge.jsDate($0["date"]) - BackupMerge.jsDate($1["date"]) }
        out["jk_hist"] = .array(merged)
        out["jk_prs"] = .object(prs); out["jk_holdPR"] = .object(hold); out["jk_cardioPR"] = .object(cardio)
        let sugs = raw["jk_prSug"]?.object ?? [:], keep = BackupMerge.pruneSug(sugs, prs)
        if keep.count != sugs.count { out["jk_prSug"] = .object(keep) }
        return .success(CSVResult(raw: out, imported: built.count, badDate: badDate))
    }

    /// The finished toast: "Imported 3 workouts", plus how many were skipped for an unreadable date.
    static func doneMessage(_ r: CSVResult) -> String {
        "Imported \(r.imported) workout\(r.imported != 1 ? "s" : "") \u{2713}" + (r.badDate > 0 ? " \u{00B7} \(r.badDate) skipped (date not readable)" : "")
    }

    // MARK: JS number parsing

    private static let floatRe = rx(#"^[\t\n\v\f\r  ﻿]*([+-]?(?:Infinity|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?))"#)
    static func jsParseFloat(_ s: String) -> Double {
        guard let g = groups(floatRe, s), let t = g[1] else { return .nan }
        if t.hasSuffix("Infinity") { return t.hasPrefix("-") ? -.infinity : .infinity }
        return Double(t) ?? .nan
    }
    private static let intRe = rx(#"^[\t\n\v\f\r  ﻿]*([+-]?\d+)"#)
    static func jsParseInt(_ s: String) -> Double {
        guard let g = groups(intRe, s), let t = g[1] else { return .nan }
        return Double(t) ?? .nan
    }
    /// histClean(): drop a null / non-object workout, exercise or set; the healthy case is returned as is.
    static func histClean(_ h: [JSONValue]) -> [JSONValue] {
        func ok(_ x: JSONValue?) -> Bool { x?.object != nil }
        func clean(_ w: JSONValue) -> Bool {
            guard ok(w) else { return false }
            guard let ex = w["exercises"]?.array else { return true }
            return ex.allSatisfy { e in ok(e) && (e["sets"]?.array.map { $0.allSatisfy(ok) } ?? true) }
        }
        if h.allSatisfy(clean) { return h }
        return h.filter(ok).map { w in
            guard var o = w.object, let ex = o["exercises"]?.array else { return w }
            o["exercises"] = .array(ex.filter(ok).map { e in
                guard var eo = e.object, let sets = eo["sets"]?.array else { return e }
                eo["sets"] = .array(sets.filter(ok)); return .object(eo)
            })
            return .object(o)
        }
    }

    /// String(x) for a workout name (always a string in practice).
    private static func jsString(_ v: JSONValue) -> String {
        switch v {
        case .string(let s): return s
        case .null: return "null"
        case .bool(let b): return b ? "true" : "false"
        case .number(let n): return WorkoutMath.jsNumberString(n)
        default: return v.array != nil ? "" : "[object Object]"
        }
    }
}
