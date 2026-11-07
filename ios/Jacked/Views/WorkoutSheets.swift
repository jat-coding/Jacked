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
                    Image(systemName: "bed.double").font(.system(size: 36)).foregroundStyle(Theme.muted)
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

/// #wdModal: every exercise and set of one finished workout, plus Rename (saveWE for a
/// name-only edit) and Save as Routine. Not yet: the full Edit Workout and Delete Workout, which
/// rebuild PR records across the rest of history (commitHistRepair) and need that ported first.
struct WorkoutDetailSheet: View {
    let opened: Workout
    let settings: Settings
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @State private var renaming = false
    @State private var draft = ""
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
                Button { draft = workout.name; renaming = true } label: {
                    Label("Rename", systemImage: "pencil").font(Theme.body(13, .semibold))
                }
                .tint(Theme.accent)
                .disabled(opened.rawId == nil)
                Button { routineName = workout.name; savingRoutine = true } label: {
                    Label("Save as Routine", systemImage: "square.grid.2x2").font(Theme.body(13, .semibold))
                }
                .tint(Theme.accent)
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
                            if s.done { Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.accent) }
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
        .alert("Rename workout", isPresented: $renaming) {
            TextField("Name", text: $draft)
            Button("Cancel", role: .cancel) {}
            Button("Save") {
                guard let id = opened.rawId else { return }
                let name = draft
                Task {
                    let ok = await store.renameWorkout(id: id, to: name, auth: auth)
                    saveNote = ok ? "Saved" : "Saved on this phone, will sync when online"
                }
            }
        }
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
                    Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.text2)
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

