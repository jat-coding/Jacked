import SwiftUI

/// #dayModal: the workouts on one calendar day, or the PWA's cheeky rest-day note.
struct DaySheet: View {
    let dayKey: String
    let workouts: [Workout]
    let settings: Settings
    /// PRReplay.map over the whole history, for workouts saved before finish kept prSets.
    var replay: [String: PRReplay.Entry] = [:]
    var onOpen: (Workout) -> Void
    var onLog: () -> Void = {}

    var body: some View {
        SheetScaffold(title: JackedDate.dayTitle(dayKey)) {
            if workouts.isEmpty {
                VStack(spacing: 8) {
                    JIcon("bed", 36).foregroundStyle(Theme.muted)
                    Text("sorry little baby didn't workout this day")
                        .font(Theme.body(15, .semibold)).foregroundStyle(Theme.text2).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 14)
            } else {
                ForEach(workouts) { w in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(w.name).font(Theme.heading(18, .extraBold)).foregroundStyle(Theme.accent)
                                if w.prCount > 0 {
                                    Text("\u{2605} \(w.prCount) PR\(w.prCount > 1 ? "s" : "")")
                                        .font(Theme.body(11, .bold)).foregroundStyle(Color(hex: 0xFFD700))
                                }
                            }
                            Spacer()
                            Text(summary(w)).font(Theme.body(11)).foregroundStyle(Theme.muted)
                        }
                        let pr = w.shownPRs(replay: replay)
                        ForEach(Array(w.exercises.enumerated()), id: \.offset) { ei, e in
                            // Gold star line on an exercise that set a PR; a suggested PR shows its set and the tag.
                            let p = pr.list.first { $0.ei == ei }
                            let g = p == nil ? pr.sug.first { $0.ei == ei } : nil
                            HStack(spacing: 8) {
                                Text((p != nil ? "\u{2605} " : "") + e.name).font(Theme.body(13, .semibold))
                                    .foregroundStyle(p != nil ? Self.gold : Theme.text2)
                                Spacer(minLength: 4)
                                if let p {
                                    Text(Workout.prSetText(p, settings: settings)).font(Theme.body(11, .bold)).foregroundStyle(Self.gold)
                                } else if let g {
                                    Text(Workout.prSetText(g, settings: settings)).font(Theme.body(11)).foregroundStyle(Theme.muted)
                                    Text("SUGGESTED").font(Theme.body(9, .bold)).tracking(0.4).foregroundStyle(Color(hex: 0xD9B84A))
                                        .padding(.horizontal, 6).padding(.vertical, 1)
                                        .overlay(Capsule().stroke(Color(hex: 0xD9B84A).opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [2, 2])))
                                } else {
                                    let n = e.sets.filter(\.done).count
                                    let c = n > 0 ? n : e.sets.count
                                    Text("\(c) set\(c == 1 ? "" : "s")").font(Theme.body(11)).foregroundStyle(Theme.muted)
                                }
                            }
                            .lineLimit(1)
                            .padding(.vertical, 6)
                            Divider().overlay(Theme.border)
                        }
                        Button("View details") { onOpen(w) }
                            .buttonStyle(GhostButtonStyle()).padding(.top, 4)
                    }
                    .padding(14)
                    .card(fill: Theme.bg3, radius: Theme.radius)
                }
            }
            Button("+ Log a workout for this day") { onLog() }
                .buttonStyle(AccentButtonStyle()).padding(.top, 10)
        }
    }

    private static let gold = Color(hex: 0xFFD700)

    private func summary(_ w: Workout) -> String {
        let load = w.totalVolume > 0 || w.distance <= 0
            ? "\(HomeMath.fmtV(settings.display(w.totalVolume))) \(settings.unitLabel)"
            : "\(HomeMath.miles(w.distance)) mi"
        return "\(w.duration) \u{00B7} \(w.sets) sets \u{00B7} \(load)"
    }
}

/// #wdModal: every exercise and set of one finished workout, plus Edit Workout (saveWE), Save as
/// Routine and Delete Workout (delW, behind the menu like the web app's 3-dot), all through
/// merge+CAS. Edit and Delete rebuild the PR records of the exercises they touch (HistRepair).
struct WorkoutDetailSheet: View {
    let opened: Workout
    let settings: Settings
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @State private var editing = false
    @State private var confirmDelete = false
    @Environment(\.dismiss) private var dismiss
    @State private var saveNote: String?
    @State private var savingRoutine = false
    @State private var routineName = ""

    init(workout: Workout, settings: Settings) { opened = workout; self.settings = settings }

    /// Re-read from the store so a rename (or a sync) shows straight away.
    private var workout: Workout { store.backup.history.first { $0.rawId == opened.rawId && $0.id == opened.id } ?? opened }

    var body: some View {
        SheetScaffold(title: workout.name) {
            HStack {
                if let saveNote { Text(saveNote).font(Theme.body(12)).foregroundStyle(store.dirty ? Theme.orange : Theme.muted) }
                Spacer()
                Button { routineName = workout.name; savingRoutine = true } label: {
                    Text("Save as Routine").font(Theme.body(13, .semibold))
                }
                .tint(Theme.accent)
                Menu {
                    Button { editing = true } label: { Label("Edit Workout", image: "ic-pencil") }
                    Button { routineName = workout.name; savingRoutine = true } label: { Text("Save as Routine") }
                    Button(role: .destructive) { confirmDelete = true } label: { Label("Delete Workout", image: "ic-trash") }
                } label: {
                    JIcon("dots", 14).foregroundStyle(Theme.text2)
                        .frame(width: 30, height: 30).background(Theme.bg4, in: Circle())
                }
                .disabled(rawWorkout == nil)
                .accessibilityLabel("Workout options")
            }
            HStack(spacing: 8) {
                stat(JackedDate.short(workout.date), "Date")
                stat(workout.duration.isEmpty ? "-" : workout.duration, "Time")
                stat("\(workout.sets)", "Sets")
                stat(HomeMath.fmtV(settings.display(workout.totalVolume)), settings.unitLabel)
            }
            ForEach(workout.exercises) { e in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        ExerciseThumb(exercise: e, size: 38)
                        Text(e.name).font(Theme.body(14, .semibold)).foregroundStyle(Theme.text)
                    }
                    ForEach(Array(e.sets.enumerated()), id: \.element.id) { i, s in
                        HStack {
                            Text("\(i + 1)").font(Theme.body(12, .bold)).foregroundStyle(Theme.muted).frame(width: 22, alignment: .leading)
                            Text(SetText.describe(s, exercise: e, settings: settings))
                                .font(Theme.body(13)).foregroundStyle(s.done ? Theme.text2 : Theme.muted)
                            Spacer()
                            if s.done { JIcon("tick", 11).foregroundStyle(Theme.accent) }
                        }
                    }
                }
                .padding(12)
                .card(fill: Theme.bg3, radius: Theme.radius)
            }
        }
        .alert("Name this routine:", isPresented: $savingRoutine) {
            TextField("Name", text: $routineName)
            Button("Cancel", role: .cancel) {}
            Button("Save") { Task { await saveAsRoutine(routineName) } }
        }
        .task {
            #if DEBUG
            if let n = DevHooks.saveRoutine { try? await Task.sleep(nanoseconds: 800_000_000); await saveAsRoutine(n) }
            #endif
        }
        .sheet(isPresented: $editing) {
            if let w = rawWorkout, let id = opened.rawId {
                EditWorkoutSheet(id: id, original: w, settings: settings) { ok in
                    saveNote = ok ? "Workout updated \u{2713}" : "Saved on this phone, will sync when online"
                }
                .presentationBackground(Theme.bg2)
            }
        }
        .confirmationDialog("Delete this workout?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await deleteWorkout() } }
            Button("Cancel", role: .cancel) {}
        }
        .task {
            #if DEBUG
            if DevHooks.editW != nil { try? await Task.sleep(nanoseconds: 800_000_000); editing = true }
            if DevHooks.delW { try? await Task.sleep(nanoseconds: 800_000_000); await deleteWorkout() }
            #endif
        }
    }

    /// This workout as stored in jk_hist (every field, including ones this app does not know).
    private var rawWorkout: [String: JSONValue]? {
        guard let id = opened.rawId else { return nil }
        return store.backup.raw["jk_hist"]?.array?.first { $0["id"] == id }?.object
    }

    private func deleteWorkout() async {
        guard let id = opened.rawId else { return }
        let ok = await store.deleteWorkout(id: id, auth: auth)
        DevHooks.log("dev delete workout ok=\(ok) \(id)")
        dismiss()
    }

    /// saveWorkoutAsRoutine(id): this workout's exercises (each once, in order) as a new routine.
    private func saveAsRoutine(_ nm: String) async {
        var seen = Set<String>(), ids: [String] = []
        for e in workout.exercises where !e.exId.isEmpty && e.exId != "?" && seen.insert(e.exId).inserted { ids.append(e.exId) }
        guard !ids.isEmpty else { saveNote = "No exercises to save"; return }
        let name = nm.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Saved Workout" : nm.trimmingCharacters(in: .whitespacesAndNewlines)
        let desc = "Saved from " + MetricsMath.fmtD(workout.date.map { $0.timeIntervalSince1970 * 1000 })
        let rid = "r\(Int(Date().timeIntervalSince1970 * 1000))"
        let ok = await store.edit(auth: auth) { raw in
            var rs = raw["jk_routines"]?.array ?? []
            rs.append(.object(["id": .string(rid), "name": .string(name), "desc": .string(desc), "exercises": .array(ids.map(JSONValue.string))]))
            raw["jk_routines"] = .array(rs)
        }
        saveNote = ok ? "Saved as routine \u{2713}" : "Saved on this phone, will sync when online"
        DevHooks.log("dev save as routine ok=\(ok) \(name) \(ids)")
    }

    private func stat(_ v: String, _ k: String) -> some View {
        VStack(spacing: 2) {
            Text(v).font(Theme.heading(16, .bold)).foregroundStyle(Theme.text).lineLimit(1).minimumScaleFactor(0.6)
            Text(k).font(Theme.body(10)).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 10)
        .card(fill: Theme.bg3, radius: Theme.radius)
    }
}

/// #weModal (openWE / renderWE / saveWE): edit a finished workout on a copy, written only on Save.
/// Name, date, each set's numbers and check, + Add Set / - Set, remove an exercise. Saving rebuilds the
/// PRs of every exercise whose sets moved (HistRepair.saveEdit) and bumps lrev (BackupStore.editWorkout).
struct EditWorkoutSheet: View {
    let id: JSONValue
    let original: [String: JSONValue]
    let settings: Settings
    var onSaved: (Bool) -> Void
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @Environment(\.dismiss) private var dismiss
    @State private var draft: [String: JSONValue] = [:]
    @State private var name = ""
    @State private var day = Date()
    @State private var removing: Int?
    @State private var saving = false
    @State private var adding = false
    @State private var already = false
    @EnvironmentObject private var catalog: ExerciseCatalog
    private var dirty: Bool { !saving && (draft != original || name != (original["name"]?.string ?? "")
        || day != ((original["date"]?.string).flatMap(JackedDate.parse) ?? day)) }

    init(id: JSONValue, original: [String: JSONValue], settings: Settings, onSaved: @escaping (Bool) -> Void) {
        self.id = id; self.original = original; self.settings = settings; self.onSaved = onSaved
        _draft = State(initialValue: original)
        _name = State(initialValue: original["name"]?.string ?? "")
        _day = State(initialValue: (original["date"]?.string).flatMap(JackedDate.parse) ?? Date())
    }

    private var exercises: [JSONValue] { draft["exercises"]?.array ?? [] }

    var body: some View {
        SheetScaffold(title: "Edit Workout") {
            VStack(alignment: .leading, spacing: 6) {
                Text("Name").font(Theme.body(11, .semibold)).foregroundStyle(Theme.muted)
                TextField("Workout", text: $name)
                    .font(Theme.body(15, .semibold)).foregroundStyle(Theme.text)
                    .padding(10).background(Theme.bg3, in: RoundedRectangle(cornerRadius: 9))
                DatePicker("Date", selection: $day, displayedComponents: .date)
                    .font(Theme.body(14, .semibold)).foregroundStyle(Theme.text2).tint(Theme.accent)
            }
            if exercises.isEmpty {
                Text("No exercises left \u{2014} saving will keep an empty workout, or delete it instead.")
                    .font(Theme.body(12)).foregroundStyle(Theme.muted).padding(.vertical, 8)
            }
            ForEach(Array(exercises.enumerated()), id: \.offset) { ei, exv in
                exerciseCard(ei, LogExercise(json: exv.object ?? [:]))
            }
            Button("+ Add Exercise") { adding = true }.buttonStyle(GhostButtonStyle())
            if already { Text("Already in workout").font(Theme.body(12, .semibold)).foregroundStyle(Theme.red) }
            Button(saving ? "Saving\u{2026}" : "Save Changes") { Task { await save() } }
                .buttonStyle(AccentButtonStyle()).disabled(saving).padding(.top, 6)
        }
        .popup(dirty: dirty)
        .sheet(isPresented: $adding) { ExercisePickerSheet { addExercise($0) }.popup() }
        .confirmationDialog("Remove this exercise from the workout?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
            Button("Remove", role: .destructive) { if let ei = removing { mutateExercises { $0.remove(at: ei) } }; removing = nil }
            Button("Cancel", role: .cancel) { removing = nil }
        }
        .task {
            #if DEBUG
            if let script = DevHooks.editW { try? await Task.sleep(nanoseconds: 600_000_000); runDev(script); await save() }
            #endif
        }
    }

    private func exerciseCard(_ ei: Int, _ ex: LogExercise) -> some View {
        let tr = ex.tracking, isW = tr == "weight_reps" || tr == "bodyweight_reps", isDur = tr == "duration"
        let u = WorkoutMath.durUnit(ex)
        let c3 = tr == "distance" ? "Miles" : isDur ? (u == "min" ? "Min" : u == "hr" ? "Hr" : "Sec") : tr == "reps_only" ? "\u{2014}" : settings.unitLabel
        let c4 = tr == "distance" ? "Min" : isDur ? "\u{2014}" : "Reps"
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(ex.name).font(Theme.heading(16, .bold)).foregroundStyle(Theme.accent).lineLimit(1)
                Spacer()
                Button { removing = ei } label: {
                    JIcon("trash", 13).foregroundStyle(Theme.red)
                        .frame(width: 30, height: 30).background(Theme.bg4, in: RoundedRectangle(cornerRadius: 8))
                }
                .accessibilityLabel("Remove exercise")
            }
            HStack {
                Text("SET").frame(width: 30, alignment: .leading)
                Text(c3.uppercased()).frame(maxWidth: .infinity)
                Text(c4.uppercased()).frame(maxWidth: .infinity)
                Text("\u{2713}").frame(width: 40)
            }
            .font(Theme.body(10)).foregroundStyle(Theme.muted)
            ForEach(Array(ex.sets.enumerated()), id: \.offset) { si, st in
                HStack {
                    Text("\(si + 1)").font(Theme.body(13, .bold)).foregroundStyle(Theme.text2).frame(width: 30, alignment: .leading)
                    if tr == "reps_only" { Text("\u{2014}").frame(maxWidth: .infinity).foregroundStyle(Theme.muted) }
                    else if isDur {
                        NumberField(value: st.weight, placeholder: 0, format: { WorkoutMath.toDispDur($0, u) }, parse: { WorkoutMath.fromDispDur($0, u) }) { setField(ei, si, "weight", $0) }
                    } else if isW {
                        NumberField(value: (settings.display(st.weight) * 10).rounded() / 10, placeholder: 0) { setField(ei, si, "weight", max(0, settings.isLb ? $0 / 2.20462 : $0)) }
                    } else {
                        NumberField(value: st.weight, placeholder: 0) { setField(ei, si, "weight", max(0, $0)) }
                    }
                    if isDur { Text("\u{2014}").frame(maxWidth: .infinity).foregroundStyle(Theme.muted) }
                    else if tr == "distance" {
                        NumberField(value: st.reps, placeholder: 0, format: WorkoutMath.minToClock, parse: WorkoutMath.clockToMin) { setField(ei, si, "reps", max(0, $0)) }
                    } else {
                        NumberField(value: st.reps, placeholder: 0, keyboard: .numberPad) { setField(ei, si, "reps", max(0, $0)) }
                    }
                    Button { toggleDone(ei, si) } label: {
                        JIcon("tick", 13)
                            .foregroundStyle(st.done ? Color(hex: 0x4DFF91) : Theme.muted).frame(width: 40, height: 32)
                    }
                }
            }
            HStack(spacing: 8) {
                Button("+ Add Set") { mutateSets(ei) { $0.append(.object(["weight": .number(0), "reps": .number(0), "done": .bool(true)])) } }
                    .buttonStyle(GhostButtonStyle())
                if ex.sets.count > 1 { Button("\u{2212} Set") { mutateSets(ei) { _ = $0.popLast() } }.buttonStyle(GhostButtonStyle()).frame(width: 90) }
            }
        }
        .padding(12)
        .card(fill: Theme.bg3, radius: Theme.radius)
    }

    // MARK: draft edits (weUpd / weTogDone / weAddSet / weRemoveSet / weRemoveEx), in place on the raw copy

    private func mutateExercises(_ f: (inout [JSONValue]) -> Void) {
        var exs = exercises; f(&exs); draft["exercises"] = .array(exs)
    }
    private func mutateSets(_ ei: Int, _ f: @escaping (inout [JSONValue]) -> Void) {
        mutateExercises { exs in
            guard exs.indices.contains(ei), var o = exs[ei].object else { return }
            var sets = o["sets"]?.array ?? []; f(&sets); o["sets"] = .array(sets); exs[ei] = .object(o)
        }
    }
    /// weAddEx(): an exercise forgotten at the time. Its first set starts checked (this is history,
    /// not something still being logged), and the same exercise twice is refused.
    private func addExercise(_ exId: String) {
        if exercises.contains(where: { $0.object?["exId"]?.string == exId }) { already = true; return }
        already = false
        let c = catalog.byId(exId, raw: store.backup.raw)
        mutateExercises { $0.append(.object([
            "exId": .string(exId), "name": .string(c.name), "muscle": .string(c.muscle), "equip": .string(c.equip),
            "assist": .bool(c.assist), "tracking": .string(c.tracking.isEmpty ? "weight_reps" : c.tracking),
            "imgUrl": c.image.map { .string(ExerciseImages.base + $0) } ?? .null,
            "sets": .array([.object(["weight": .number(0), "reps": .number(0), "done": .bool(true)])])
        ])) }
    }
    private func setField(_ ei: Int, _ si: Int, _ k: String, _ v: Double) {
        mutateSets(ei) { sets in
            guard sets.indices.contains(si), var s = sets[si].object else { return }
            s[k] = .number(v.isFinite ? v : 0); sets[si] = .object(s)
        }
    }
    private func toggleDone(_ ei: Int, _ si: Int) {
        mutateSets(ei) { sets in
            guard sets.indices.contains(si), var s = sets[si].object else { return }
            s["done"] = .bool(!(s["done"]?.truthy ?? false)); sets[si] = .object(s)
        }
    }

    private func save() async {
        saving = true
        let origDay = (original["date"]?.string).flatMap(JackedDate.parse).map { JackedDate.dayKey($0) }
        let dk = JackedDate.dayKey(day)
        let ok = await store.editWorkout(id: id, draft: draft, name: name, dayKey: dk == origDay ? nil : dk, auth: auth)
        DevHooks.log("dev edit workout ok=\(ok) \(id)")
        saving = false
        onSaved(ok)
        dismiss()
    }

    #if DEBUG
    private func runDev(_ script: String) {
        for part in script.split(separator: ";").map(String.init) {
            if part.hasPrefix("name=") { name = String(part.dropFirst(5)); continue }
            if part.hasPrefix("day="), let d = JackedDate.parse(String(part.dropFirst(4))) { day = d; continue }
            if part.hasPrefix("add=") { addExercise(String(part.dropFirst(4))); continue }
            let n = part.split(separator: ",").compactMap { Double($0) }
            guard n.count >= 3 else { continue }
            setField(Int(n[0]), Int(n[1]), "weight", n[2])
            if n.count >= 4 { setField(Int(n[0]), Int(n[1]), "reps", n[3]) }
        }
    }
    #endif
}

/// How a stored set reads, per tracking type (watch-client/API.md "Set").
enum SetText {
    static func describe(_ s: WorkoutSet, exercise e: WorkoutExercise, settings: Settings) -> String {
        func w(_ kg: Double) -> String {
            let v = (settings.display(kg) * 10).rounded() / 10
            return (v == v.rounded() ? String(Int(v)) : String(v)) + " " + settings.unitLabel
        }
        let reps = Int(s.reps.rounded())
        switch e.tracking {
        case "distance":
            let pace = s.weight > 0 && s.reps > 0 ? " \u{00B7} " + HomeMath.fmtPace(s.reps / s.weight) : ""
            return "\(HomeMath.miles(s.weight)) mi in \(HomeMath.miles(s.reps)) min" + pace
        case "duration":
            switch e.durUnit {
            case "hr": return HomeMath.miles(s.weight / 3600) + " hr"
            case "min": return HomeMath.miles(s.weight / 60) + " min"
            default: return "\(Int(s.weight.rounded())) sec"
            }
        case "reps_only": return "\(reps) reps"
        case "bodyweight_reps": return (s.weight > 0 ? "BW + " + w(s.weight) : "BW") + " \u{00D7} \(reps)"
        default: return w(s.weight) + " \u{00D7} \(reps)"
        }
    }
}

/// Sheet chrome shared by the Home sheets: title, close button, scrolling content.
/// Every popup rises from the bottom and drags down to dismiss. When `dirty` (unsaved input) a drag-down or
/// swipe is intercepted and asks Keep editing / Discard instead of silently losing the input.
private final class DismissGuardProxy: NSObject, UIAdaptivePresentationControllerDelegate {
    weak var original: UIAdaptivePresentationControllerDelegate?
    var onAttempt: () -> Void = {}
    func presentationControllerDidAttemptToDismiss(_ presentationController: UIPresentationController) { onAttempt() }
    override func responds(to a: Selector!) -> Bool { super.responds(to: a) || (original?.responds(to: a) ?? false) }
    override func forwardingTarget(for a: Selector!) -> Any? { original?.responds(to: a) == true ? original : super.forwardingTarget(for: a) }
}
private struct DismissGuardHook: UIViewControllerRepresentable {
    let onAttempt: () -> Void
    final class Coord { let proxy = DismissGuardProxy() }
    func makeCoordinator() -> Coord { Coord() }
    func makeUIViewController(context: Context) -> UIViewController { UIViewController() }
    func updateUIViewController(_ vc: UIViewController, context: Context) {
        let proxy = context.coordinator.proxy
        proxy.onAttempt = onAttempt
        DispatchQueue.main.async {
            guard let pc = vc.parent?.presentationController ?? vc.presentationController, pc.delegate !== proxy else { return }
            proxy.original = pc.delegate
            pc.delegate = proxy
        }
    }
}
private struct DiscardGuard: ViewModifier {
    let dirty: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var ask = false
    func body(content: Content) -> some View {
        content
            .presentationDragIndicator(.visible)
            .interactiveDismissDisabled(dirty)
            .background(DismissGuardHook { if dirty { ask = true } })
            .confirmationDialog("Discard your changes?", isPresented: $ask, titleVisibility: .visible) {
                Button("Discard changes", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) {}
            }
    }
}
extension View {
    /// Standard popup chrome: drag indicator + interactive swipe-down dismissal.
    func popup() -> some View { presentationDragIndicator(.visible) }
    /// Same, but with unsaved input a swipe-down asks before discarding.
    func popup(dirty: Bool) -> some View { modifier(DiscardGuard(dirty: dirty)) }
}

struct SheetScaffold<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(title).font(Theme.heading(24, .extraBold)).foregroundStyle(Theme.text).lineLimit(1)
                Spacer()
                Button { dismiss() } label: {
                    JIcon("close", 13).foregroundStyle(Theme.text2)
                        .frame(width: 30, height: 30).background(Theme.bg4, in: Circle())
                }
                .accessibilityLabel("Close")
            }
            .padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 12)
            ScrollView {
                VStack(spacing: 10) { content() }.padding(.horizontal, 18).padding(.bottom, 24)
            }
        }
        .background(Theme.bg2.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

