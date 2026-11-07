import Foundation

/// Dates the way index.html handles them: ISO strings in, LOCAL calendar days out.
enum JackedDate {
    private static let isoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    private static let iso = ISO8601DateFormatter()

    /// toLocaleDateString('en-US', {month:'numeric', day:'numeric'}): "11/7".
    static func shortMD(_ s: String) -> String {
        guard let d = parse(s) else { return "" }
        let c = Calendar.current.dateComponents([.month, .day], from: d)
        return "\(c.month!)/\(c.day!)"
    }

    static func isDayKey(_ s: String) -> Bool {
        s.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
    }

    static func parse(_ s: String) -> Date? {
        if let d = isoFrac.date(from: s) ?? iso.date(from: s) { return d }
        if isDayKey(s) { return noon(of: s) }
        return nil
    }

    /// index.html dayKey(): local "YYYY-MM-DD".
    static func dayKey(_ d: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    /// `new Date(ds+'T12:00:00')`: local noon of a day key.
    static func noon(of key: String, calendar: Calendar = .current) -> Date? {
        let p = key.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12))
    }

    /// index.html fmtD(): "Nov 6, 2026".
    static func short(_ d: Date?) -> String {
        guard let d else { return "" }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US"); f.setLocalizedDateFormatFromTemplate("MMM d, yyyy")
        return f.string(from: d)
    }

    /// The day sheet title: "Thursday, Nov 6".
    static func dayTitle(_ key: String) -> String {
        guard let d = noon(of: key) else { return key }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US"); f.setLocalizedDateFormatFromTemplate("EEEE MMM d")
        return f.string(from: d)
    }
}

/// Home-screen math, ported function by function from index.html.
enum HomeMath {
    /// calcStreak(): consecutive trained days ending today. Today not trained yet doesn't
    /// break the streak, it just doesn't add to it. Steps by calendar day from noon (DST-safe).
    static func streak(_ h: [Workout], now: Date = Date(), calendar: Calendar = .current) -> Int {
        let days = Set(h.map(\.dayKey))
        let today = JackedDate.dayKey(now, calendar: calendar)
        var chk = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: now)!
        var n = 0
        for _ in 0..<365 {
            let ds = JackedDate.dayKey(chk, calendar: calendar)
            guard days.contains(ds) || ds == today else { break }
            if days.contains(ds) { n += 1 }
            chk = calendar.date(byAdding: .day, value: -1, to: chk)!
        }
        return n
    }

    /// bestStreak(): longest run of consecutive trained days ever.
    static func bestStreak(_ h: [Workout], calendar: Calendar = .current) -> Int {
        let days = Set(h.map(\.dayKey)).filter { !$0.isEmpty }.sorted()
        var best = 0, run = 0
        var prev: Date?
        for d in days {
            guard let t = JackedDate.noon(of: d, calendar: calendar) else { continue }
            if let p = prev, calendar.dateComponents([.day], from: p, to: t).day == 1 { run += 1 } else { run = 1 }
            best = max(best, run); prev = t
        }
        return best
    }

    /// fmtV(): rounded, K/M/B-suffixed.
    static func fmtV(_ v: Double) -> String {
        guard v != 0, v.isFinite else { return "0" }
        let a = abs(v)
        func s(_ x: Double) -> String { let t = String(format: "%.1f", x); return t.hasSuffix(".0") ? String(t.dropLast(2)) : t }
        if a >= 1e9 { return s(v / 1e9) + "B" }
        if a >= 1e6 { return s(v / 1e6) + "M" }
        if a >= 1e3 { return s(v / 1e3) + "K" }
        return String(Int(v.rounded()))
    }

    /// fmtPace(): "8:05/mi".
    static func fmtPace(_ mpm: Double) -> String {
        guard mpm > 0 else { return "\u{2014}" }
        var m = Int(mpm.rounded(.down)); var s = Int(((mpm - Double(m)) * 60).rounded())
        if s == 60 { m += 1; s = 0 }
        return "\(m):" + String(format: "%02d", s) + "/mi"
    }

    static func miles(_ d: Double) -> String {
        let r = (d * 100).rounded() / 100
        return r == r.rounded() ? String(Int(r)) : String(r)
    }
}
