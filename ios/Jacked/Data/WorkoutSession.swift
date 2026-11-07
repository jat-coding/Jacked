import Foundation

/// The workout being logged right now (the PWA's aw / awStart, `jk_activeWorkout`). Kept on the
/// phone after every change, one file per account, so closing the app never loses a workout in
/// progress. Like the PWA, it is not part of the synced blob (SYNC_SKIP): only Finish writes,
/// once, through BackupStore's merge + compare-and-swap save.
@MainActor
final class WorkoutSession: ObservableObject {
    @Published var active: ActiveWorkout? { didSet { if active != oldValue { save() } } }
    @Published var summary: Summary?
    @Published var presented = false

    struct Summary: Identifiable {
        let id = UUID()
        let name: String; let duration: String; let sets: Int; let volume: Double
        let prs: [WorkoutMath.PRHit]; let suggested: [WorkoutMath.PRHit]
        let exerciseIds: [String]
        /// The routine the workout came from, when its exercise list ended up different.
        let routine: (id: String, name: String)?
        var savedToServer: Bool
    }

    private var code: String?

    func load(code: String) {
        self.code = code
        active = (try? Data(contentsOf: Self.fileURL(code))).flatMap { try? JSONDecoder().decode(ActiveWorkout.self, from: $0) }
    }

    // MARK: start (startEmpty / startEmptyOn / startRW)

    /// awBusy: a start while another workout is open waits for "Discard & start" (busyStart).
    @Published var busyStart: (() -> Void)?
    var busySets: Int { active?.exercises.reduce(0) { $0 + $1.sets.filter(\.done).count } ?? 0 }
    private func ifFree(_ f: @escaping () -> Void) -> Bool {
        guard active != nil else { return true }
        busyStart = { [weak self] in self?.active = nil; f() }
        return false
    }

    func startEmpty() {
        guard ifFree({ [weak self] in self?.startEmpty() }) else { return }
        active = ActiveWorkout(id: "w\(Self.nowMs)", routineId: nil, name: "Quick Workout", date: Self.isoNow(),
                               exercises: [], startedAt: Double(Self.nowMs))
        presented = true
    }

    /// startEmptyOn: a workout dated noon local time on a past calendar day ("YYYY-MM-DD").
    func startEmpty(on dayKey: String) {
        guard ifFree({ [weak self] in self?.startEmpty(on: dayKey) }) else { return }
        let p = dayKey.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3, let d = Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12)) else { return }
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        active = ActiveWorkout(id: "w\(Self.nowMs)", routineId: nil, name: "Workout", date: f.string(from: d),
                               exercises: [], startedAt: Double(Self.nowMs))
        presented = true
    }

    func start(routine r: [String: JSONValue], catalog: ExerciseCatalog, raw: [String: JSONValue]) {
        guard ifFree({ [weak self] in self?.start(routine: r, catalog: catalog, raw: raw) }) else { return }
        let ids = (r["exercises"]?.array ?? []).compactMap(\.string)
        active = ActiveWorkout(id: "w\(Self.nowMs)", routineId: r["id"]?.string, name: r["name"]?.string ?? "Workout",
                               date: Self.isoNow(), exercises: ids.map { exercise(for: catalog.byId($0, raw: raw), raw: raw) },
                               startedAt: Double(Self.nowMs))
        presented = true
    }

    func exercise(for c: CatalogExercise, raw: [String: JSONValue]) -> LogExercise {
        var e = LogExercise(exId: c.id, name: c.name, muscle: c.muscle, equip: c.equip, assist: c.assist, tracking: c.tracking,
                    imgUrl: c.image.map { ExerciseImages.base + $0 },
                    sets: WorkoutMath.seedSets(exId: c.id, tracking: c.tracking, history: raw["jk_hist"]?.array ?? []))
        // stampSingle: a Single / Both lift's sets carry an explicit choice from the moment they are drawn.
        if PWATables.SINGLE_BOTH_IDS.contains(c.id) {
            for i in e.sets.indices where e.sets[i].single == nil { e.sets[i].single = PWATables.SINGLE_DEFAULT_IDS.contains(c.id) }
        }
        return e
    }

    // MARK: edits (addSet / togSet / uSet / rmEx)

    func add(_ c: CatalogExercise, raw: [String: JSONValue]) { active?.exercises.append(exercise(for: c, raw: raw)) }

    func addSet(_ ei: Int) {
        guard var a = active, a.exercises.indices.contains(ei) else { return }
        let ex = a.exercises[ei]
        // The exercise's own choice, else the lift's default (addSet + stampSingle).
        let single = ex.single
            ?? (PWATables.SINGLE_BOTH_IDS.contains(ex.exId) ? PWATables.SINGLE_DEFAULT_IDS.contains(ex.exId) : nil)
        a.exercises[ei].sets.append(LogSet(single: single))
        active = a
    }

    /// replaceExAt: switch an exercise for another (its logged sets go, like the PWA).
    @discardableResult
    func replace(_ ei: Int, with c: CatalogExercise, raw: [String: JSONValue]) -> Bool {
        guard var a = active, a.exercises.indices.contains(ei), a.exercises[ei].exId != c.id else { return true }
        if a.exercises.indices.contains(where: { $0 != ei && a.exercises[$0].exId == c.id }) { return false }
        a.exercises[ei] = exercise(for: c, raw: raw)
        active = a
        return true
    }

    /// setSingleArmEx: the Single / Both pair applies to the exercise and every set on it.
    func setSingle(_ ei: Int, _ v: Bool) {
        guard var a = active, a.exercises.indices.contains(ei) else { return }
        a.exercises[ei].single = v
        for j in a.exercises[ei].sets.indices { a.exercises[ei].sets[j].single = v }
        active = a
    }

    /// setBWMode: Bodyweight / + Added / - Assist.
    func setBWMode(_ ei: Int, _ m: String) { if active?.exercises.indices.contains(ei) == true { active!.exercises[ei].bwMode = m } }

    func removeExercise(_ ei: Int) { if active?.exercises.indices.contains(ei) == true { active?.exercises.remove(at: ei) } }

    func removeSet(_ ei: Int, _ si: Int) {
        guard active?.exercises.indices.contains(ei) == true, active!.exercises[ei].sets.indices.contains(si) else { return }
        active!.exercises[ei].sets.remove(at: si)
    }

    func set(_ ei: Int, _ si: Int, weight: Double? = nil, reps: Double? = nil) {
        guard active?.exercises.indices.contains(ei) == true, active!.exercises[ei].sets.indices.contains(si) else { return }
        if let weight { active!.exercises[ei].sets[si].weight = max(0, weight) }
        if let reps { active!.exercises[ei].sets[si].reps = max(0, reps) }
    }

    /// togSet: checking a blank set adopts the greyed suggestion; starts the rest timer if auto rest is on.
    func toggle(_ ei: Int, _ si: Int, raw: [String: JSONValue], settings: Settings) {
        guard var a = active, a.exercises.indices.contains(ei), a.exercises[ei].sets.indices.contains(si) else { return }
        a.exercises[ei].sets[si].done.toggle()
        if a.exercises[ei].sets[si].done {
            let sug = WorkoutMath.suggestion(a.exercises[ei], si, raw: raw)
            if !(a.exercises[ei].sets[si].weight > 0) { a.exercises[ei].sets[si].weight = sug.w }
            if !(a.exercises[ei].sets[si].reps > 0) { a.exercises[ei].sets[si].reps = sug.r }
            if settings.autoRest { a.restEndsAt = Double(Self.nowMs) + Double(settings.restDefault) * 1000 }
        }
        active = a
    }

    func startRest(_ seconds: Int) { active?.restEndsAt = Double(Self.nowMs) + Double(seconds) * 1000 }
    func adjustRest(_ by: Int) {
        guard let e = active?.restEndsAt else { return }
        active?.restEndsAt = max(Double(Self.nowMs) + 5000, e + Double(by) * 1000)
    }
    func skipRest() { active?.restEndsAt = nil }

    func cancel() { active = nil; presented = false }

    // MARK: finish (_commitFinish)

    /// Builds the history record exactly like the PWA, commits PRs, inserts it into jk_hist and
    /// saves through the merge + compare-and-swap path. Offline it stays on the phone and goes out
    /// on the next sync (BackupStore keeps it dirty on disk).
    func finish(store: BackupStore, auth: AuthStore, endMs: Double? = nil) async {
        guard let a = active else { return }
        // Already in history (a double tap): nothing more to commit.
        if store.backup.history.contains(where: { $0.id == a.id }) { active = nil; presented = false; return }
        var result: WorkoutMath.Finished?
        var routine: (id: String, name: String)?
        let ok = await store.edit(auth: auth) { raw in
            let f = WorkoutMath.buildFinishRec(a, endMs: endMs ?? Double(Self.nowMs), raw: &raw, now: Self.isoNow())
            raw["jk_hist"] = .array(WorkoutMath.histInsert(raw["jk_hist"]?.array ?? [], f.rec))
            result = f
            if let rid = a.routineId,
               let r = (raw["jk_routines"]?.array ?? []).first(where: { $0["id"]?.string == rid }) {
                let was = (r["exercises"]?.array ?? []).compactMap(\.string)
                if was != a.exercises.map(\.exId) { routine = (rid, r["name"]?.string ?? "Routine") }
            }
        }
        guard let f = result else { return }
        summary = Summary(name: f.rec["name"]?.string ?? a.name, duration: f.duration, sets: f.sets, volume: f.volume,
                          prs: f.prs, suggested: f.suggested, exerciseIds: a.exercises.map(\.exId), routine: routine,
                          savedToServer: ok)
        active = nil
        presented = false
    }

    // MARK: routines (saveAsNewRoutine / updateRoutineFromWorkout)

    @discardableResult
    func saveAsRoutine(name: String, ids: [String], store: BackupStore, auth: AuthStore) async -> Bool {
        let ids = ids.filter { !$0.isEmpty }
        guard !ids.isEmpty else { return false }
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return await store.edit(auth: auth) { raw in
            var rs = raw["jk_routines"]?.array ?? []
            rs.append(.object(["id": .string("r\(Self.nowMs)"), "name": .string(n.isEmpty ? "My Routine" : n), "desc": .string(""),
                               "exercises": .array(ids.map(JSONValue.string))]))
            raw["jk_routines"] = .array(rs)
        }
    }

    @discardableResult
    func updateRoutine(id: String, ids: [String], store: BackupStore, auth: AuthStore) async -> Bool {
        await store.edit(auth: auth) { raw in
            guard var rs = raw["jk_routines"]?.array else { return }
            for i in rs.indices where rs[i]["id"]?.string == id {
                guard var o = rs[i].object else { continue }
                o["exercises"] = .array(ids.filter { !$0.isEmpty && $0 != "?" }.map(JSONValue.string)); rs[i] = .object(o)
            }
            raw["jk_routines"] = .array(rs)
        }
    }

    // MARK: disk

    static var nowMs: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
    static func isoNow() -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: Date())
    }

    private static func fileURL(_ code: String) -> URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("JackedBackup", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let safe = code.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) || $0 == "_" }
        return dir.appendingPathComponent("active-\(String(String.UnicodeScalarView(safe))).json")
    }

    private func save() {
        guard let code else { return }
        let url = Self.fileURL(code)
        if let a = active, let d = try? JSONEncoder().encode(a) { try? d.write(to: url, options: .atomic) }
        else if active == nil { try? FileManager.default.removeItem(at: url) }
    }
}
