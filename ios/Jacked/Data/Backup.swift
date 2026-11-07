import Foundation

/// The whole `profile_backups.backup` blob: every `jk_*` key the PWA keeps in localStorage
/// (watch-client/API.md section 3). `raw` is the source of truth and is what gets saved to
/// disk; the typed accessors below are read-only views over it.
struct Backup: Equatable {
    var raw: [String: JSONValue]

    static let empty = Backup(raw: [:])

    /// `jk_hist`, cleaned like the PWA's histClean(): a null or non-object where a workout,
    /// exercise or set belongs is dropped instead of breaking every screen. Stored order is
    /// kept (the PWA reads history newest-last).
    var history: [Workout] {
        (raw["jk_hist"]?.array ?? []).compactMap { $0.object.map(Workout.init) }
    }

    var settings: Settings { Settings(raw["jk_settings"]?.object ?? [:]) }

    var profileName: String? { raw["jk_prof"]?["name"]?.string }
    var avatarURL: URL? { (raw["jk_prof"]?["avatarUrl"]?.string).flatMap(URL.init(string:)) }
}

/// `jk_settings`, with the PWA's gSet() defaults.
struct Settings {
    var wUnit: String
    var restDefault: Int
    var autoRest: Bool
    /// The go-up / consider-lighter rep range (progMin / progMax).
    var repMin: Int
    var repMax: Int

    init(_ o: [String: JSONValue]) {
        wUnit = o["wUnit"]?.string ?? "lb"
        restDefault = o["restDefault"]?.int ?? 90
        autoRest = o["autoRest"]?.bool ?? true
        let mn = Settings.parseInt(o["repMin"]).flatMap { $0 >= 1 ? $0 : nil } ?? 5
        repMin = mn
        repMax = Settings.parseInt(o["repMax"]).flatMap { $0 > mn ? $0 : nil } ?? max(12, mn + 1)
    }

    /// parseInt(v, 10) for a number or a numeric string.
    private static func parseInt(_ v: JSONValue?) -> Int? {
        if let d = v?.double, d.isFinite { return Int(d) }
        guard let s = v?.string?.trimmingCharacters(in: .whitespaces) else { return nil }
        let digits = s.prefix { $0.isNumber || $0 == "-" }
        return Int(digits)
    }

    var isLb: Bool { wUnit == "lb" }
    var unitLabel: String { isLb ? "lb" : "kg" }
    /// Every weight is stored in kg; this is only for display (index.html toDisp).
    func display(_ kg: Double) -> Double { isLb ? kg * 2.20462 : kg }
}

struct Workout: Identifiable {
    let id: String
    /// The stored `id` exactly as it is in the blob (number or string): edits match on this.
    let rawId: JSONValue?
    let name: String
    let date: Date?
    let rawDate: String?
    let duration: String
    let sets: Int
    let totalVolume: Double
    let prCount: Int
    let exercises: [WorkoutExercise]

    init(_ o: [String: JSONValue]) {
        id = o["id"]?.string ?? o["id"]?.double.map { String(Int($0)) } ?? UUID().uuidString
        rawId = o["id"]
        name = o["name"]?.string ?? "Workout"
        rawDate = o["date"]?.string
        date = rawDate.flatMap(JackedDate.parse)
        duration = o["duration"]?.string ?? ""
        sets = o["sets"]?.int ?? 0
        totalVolume = o["totalVolume"]?.double ?? 0
        prCount = o["prCount"]?.int ?? 0
        exercises = (o["exercises"]?.array ?? []).compactMap { $0.object.map(WorkoutExercise.init) }
    }

    /// Local calendar day, "YYYY-MM-DD" (index.html dayKey).
    var dayKey: String {
        if let r = rawDate, JackedDate.isDayKey(r) { return r }
        return date.map { JackedDate.dayKey($0) } ?? ""
    }

    /// Miles over every distance-tracked set (index.html workoutDistance).
    var distance: Double {
        exercises.filter { $0.tracking == "distance" }.reduce(0) { $0 + $1.sets.reduce(0) { $0 + $1.weight } }
    }

    /// Minutes per mile over every distance-tracked set; 0 if none (index.html workoutPace).
    var pace: Double {
        var d = 0.0, t = 0.0
        for e in exercises where e.tracking == "distance" { for s in e.sets { d += s.weight; t += s.reps } }
        return d > 0 && t > 0 ? t / d : 0
    }
}

struct WorkoutExercise: Identifiable {
    let id = UUID()
    let exId: String
    let name: String
    let muscle: String
    let tracking: String
    let imgUrl: String?
    let durUnit: String?
    let sets: [WorkoutSet]

    init(_ o: [String: JSONValue]) {
        exId = o["exId"]?.string ?? ""
        name = o["name"]?.string ?? "Exercise"
        muscle = o["muscle"]?.string ?? ""
        tracking = o["tracking"]?.string ?? "weight_reps"
        imgUrl = o["imgUrl"]?.string
        durUnit = o["durUnit"]?.string
        sets = (o["sets"]?.array ?? []).compactMap { $0.object.map(WorkoutSet.init) }
    }

    var imageURL: URL? { imgUrl.map(ExerciseImages.rewrite).flatMap(URL.init(string:)) }
}

struct WorkoutSet: Identifiable {
    let id = UUID()
    /// kg, or miles for cardio, or seconds for duration (API.md "Set").
    let weight: Double
    /// reps, or minutes for cardio.
    let reps: Double
    let done: Bool

    init(_ o: [String: JSONValue]) {
        weight = o["weight"]?.double ?? 0
        reps = o["reps"]?.double ?? 0
        done = o["done"]?.bool ?? false
    }
}

/// Exercise photos moved from GitHub raw to Jacked's own Storage bucket (93b6ebf). Older
/// workouts still carry the GitHub URL; the PWA rewrites it at render time (exImgSrc).
enum ExerciseImages {
    static let base = SupabaseConfig.url.absoluteString + "/storage/v1/object/public/exercise-images/"
    private static let legacy = try! NSRegularExpression(
        pattern: #"^https://[^/]+/yuhonas/free-exercise-db/main/exercises/"#)

    static func rewrite(_ u: String) -> String {
        legacy.stringByReplacingMatches(in: u, range: NSRange(u.startIndex..., in: u), withTemplate: base)
    }
}
