import SwiftUI

/// The PWA's #page-active: running clock, exercise cards with set rows (weight / reps / done),
/// the rest bar, the plate calculator, add exercise, cancel and finish.
struct ActiveWorkoutView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var session: WorkoutSession
    @EnvironmentObject private var catalog: ExerciseCatalog
    @State private var showAdd = false
    @State private var showPlates = false
    @State private var confirmFinish = false
    @State private var confirmCancel = false
    @State private var finishing = false

    var body: some View {
        let settings = store.backup.settings
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if let a = session.active {
                        ForEach(Array(a.exercises.enumerated()), id: \.element.uid) { ei, ex in
                            ExerciseCard(ei: ei, ex: ex, settings: settings)
                        }
                        if a.exercises.isEmpty {
                            Text("No exercises yet. Add one to start logging.")
                                .font(Theme.body(14)).foregroundStyle(Theme.muted).padding(.vertical, 30)
                        }
                    }
                    Button { showAdd = true } label: { Label("Add Exercise", systemImage: "plus").font(Theme.body(15, .semibold)) }
                        .buttonStyle(GhostButtonStyle())
                    Button(role: .destructive) { confirmCancel = true } label: {
                        Text("Cancel Workout").font(Theme.body(14, .semibold)).foregroundStyle(Theme.red)
                    }
                    .padding(.top, 6).padding(.bottom, 120)
                }
                .padding(.horizontal, 16).padding(.top, 8)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.bg.ignoresSafeArea())
            .safeAreaInset(edge: .bottom) { RestBar() }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { session.presented = false } label: { Image(systemName: "chevron.down") }
                        .accessibilityLabel("Minimize")
                }
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text(session.active?.name ?? "Workout").font(Theme.heading(20, .extraBold)).foregroundStyle(Theme.text)
                        ElapsedClock(start: session.active?.startedAt ?? 0)
                    }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { showPlates = true } label: { Image(systemName: "circle.circle") }.accessibilityLabel("Plate calculator")
                    Button("Finish") { confirmFinish = true }.font(Theme.body(15, .bold)).disabled(finishing)
                }
            }
            .toolbarBackground(Theme.bg2, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .sheet(isPresented: $showAdd) { AddExerciseSheet() }
        .sheet(isPresented: $showPlates) { PlateCalcSheet(settings: settings).presentationDetents([.medium]) }
        .confirmationDialog(finishPrompt, isPresented: $confirmFinish, titleVisibility: .visible) {
            Button("Finish and save") { Task { finishing = true; await session.finish(store: store, auth: auth); finishing = false } }
        }
        .confirmationDialog("Cancel workout? All progress will be lost.", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("Cancel workout", role: .destructive) { session.cancel() }
        }
    }

    private var finishPrompt: String {
        let n = session.active?.exercises.reduce(0) { $0 + $1.sets.filter(\.done).count } ?? 0
        return n == 0 ? "No sets logged — finish anyway?" : "Finish and save this workout?"
    }
}

struct ElapsedClock: View {
    let start: Double
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let s = max(0, Int(ctx.date.timeIntervalSince1970 - start / 1000))
            Text(s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%02d:%02d", s / 60, s % 60))
                .font(Theme.body(12, .semibold)).monospacedDigit().foregroundStyle(Theme.accent)
        }
    }
}

/// One exercise and its sets (renderWS).
struct ExerciseCard: View {
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var session: WorkoutSession
    let ei: Int
    let ex: LogExercise
    let settings: Settings
    @State private var confirmRemove = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                LogThumb(url: ex.imgUrl.map(ExerciseImages.rewrite).flatMap(URL.init(string:)), muscle: ex.muscle)
                VStack(alignment: .leading, spacing: 2) {
                    Text(ex.name).font(Theme.body(15, .semibold)).foregroundStyle(Theme.text)
                    if let pr = prLine { Text(pr).font(Theme.body(11)).foregroundStyle(Theme.muted) }
                }
                Spacer()
                Menu {
                    Button("Remove exercise", role: .destructive) { confirmRemove = true }
                } label: { Image(systemName: "ellipsis").foregroundStyle(Theme.text2).frame(width: 32, height: 32) }
            }
            HStack {
                Text("SET").frame(width: 34, alignment: .leading)
                Text(col1).frame(maxWidth: .infinity)
                Text(col2).frame(maxWidth: .infinity)
                Image(systemName: "checkmark").frame(width: 40)
            }
            .font(Theme.body(10, .bold)).foregroundStyle(Theme.muted)
            ForEach(Array(ex.sets.enumerated()), id: \.offset) { si, s in
                SetRow(ei: ei, si: si, ex: ex, set: s, settings: settings, star: beatsPR(si))
            }
            Button { session.addSet(ei) } label: {
                Label("Add Set", systemImage: "plus").font(Theme.body(13, .semibold)).frame(maxWidth: .infinity).padding(.vertical, 8)
            }
            .background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
        }
        .padding(14)
        .card()
        .confirmationDialog("Remove \(ex.name)?", isPresented: $confirmRemove, titleVisibility: .visible) {
            Button("Remove", role: .destructive) { session.removeExercise(ei) }
        }
    }

    private var col1: String {
        switch ex.tracking {
        case "distance": return "MILES"
        case "duration": return "SECONDS"
        case "reps_only": return "—"
        default: return settings.unitLabel.uppercased()
        }
    }
    private var col2: String { ex.tracking == "distance" ? "MINUTES" : ex.tracking == "duration" ? "—" : "REPS" }

    private var prLine: String? {
        guard WorkoutMath.isWT(ex), let pr = store.backup.raw["jk_prs"]?[ex.exId]?.object, jsNum(pr["weight"]) > 0 else { return nil }
        return "PR \(WorkoutMath.n(settings.display(jsNum(pr["weight"])).rounded())) \(settings.unitLabel) × \(Int(jsNum(pr["reps"])))"
    }

    /// The ★ on a done set that beats the stored record (beatsPR; PRs are only committed on finish).
    private func beatsPR(_ si: Int) -> Bool {
        guard WorkoutMath.isWT(ex), ex.sets.indices.contains(si), ex.sets[si].done else { return false }
        let bw = jsNum(store.backup.raw["jk_bw"]), s = ex.sets[si]
        let prev = store.backup.raw["jk_prs"]?[ex.exId]?.object
        let w = WorkoutMath.effWeight(ex, s, bw: bw)
        guard s.reps > 0, w > 0 else { return false }
        let pw = jsNum(prev?["weight"]), pr = jsNum(prev?["reps"])
        return w > pw || (w == pw && s.reps > pr)
    }
}

/// One set: number fields in the display unit, greyed with the suggestion, and the done check.
struct SetRow: View {
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var session: WorkoutSession
    let ei: Int, si: Int
    let ex: LogExercise
    let set: LogSet
    let settings: Settings
    let star: Bool

    var body: some View {
        let sug = WorkoutMath.suggestion(ex, si, raw: store.backup.raw)
        HStack {
            HStack(spacing: 2) {
                Text("\(si + 1)").font(Theme.body(14, .bold))
                if star { Image(systemName: "star.fill").font(.system(size: 9)).foregroundStyle(Color(hex: 0xFFD700)) }
            }
            .frame(width: 34, alignment: .leading).foregroundStyle(set.done ? Theme.accent : Theme.text2)
            if ex.tracking != "reps_only" {
                NumberField(value: shown(set.weight, weightLike: true), placeholder: shown(sug.w, weightLike: true)) {
                    session.set(ei, si, weight: stored($0, weightLike: true))
                }
            } else { Text("—").frame(maxWidth: .infinity).foregroundStyle(Theme.muted) }
            if ex.tracking != "duration" {
                NumberField(value: set.reps, placeholder: sug.r) { session.set(ei, si, reps: $0) }
            } else { Text("—").frame(maxWidth: .infinity).foregroundStyle(Theme.muted) }
            Button { session.toggle(ei, si, raw: store.backup.raw, settings: settings) } label: {
                Image(systemName: "checkmark").font(.system(size: 14, weight: .bold))
                    .foregroundStyle(set.done ? Theme.onAccent : Theme.muted)
                    .frame(width: 40, height: 34)
                    .background(set.done ? Theme.accent : Theme.bg3, in: RoundedRectangle(cornerRadius: 9))
            }
            .accessibilityLabel(set.done ? "Set \(si + 1) done" : "Mark set \(si + 1) done")
        }
        .padding(.vertical, 2)
        .background(set.done ? Theme.accent.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: 9))
        .contextMenu { Button("Delete set", role: .destructive) { session.removeSet(ei, si) } }
    }

    /// Weight is kg on disk and lb/kg on screen; miles and seconds are shown as stored.
    private func shown(_ v: Double, weightLike: Bool) -> Double {
        weightLike && WorkoutMath.isWT(ex) ? settings.display(v) : v
    }
    private func stored(_ v: Double, weightLike: Bool) -> Double {
        weightLike && WorkoutMath.isWT(ex) && settings.isLb ? v / 2.20462 : v
    }
}

struct NumberField: View {
    let value: Double
    let placeholder: Double
    let commit: (Double) -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField(fmt(placeholder), text: $text)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.center)
            .font(Theme.body(15, .semibold)).monospacedDigit()
            .foregroundStyle(Theme.text)
            .padding(.vertical, 7)
            .background(Theme.bg3, in: RoundedRectangle(cornerRadius: 9))
            .frame(maxWidth: .infinity)
            .focused($focused)
            .onAppear { text = value > 0 ? fmt(value) : "" }
            .onChange(of: value) { _, v in if !focused { text = v > 0 ? fmt(v) : "" } }
            .onChange(of: text) { _, t in if focused { commit(Double(t.replacingOccurrences(of: ",", with: ".")) ?? 0) } }
    }

    private func fmt(_ v: Double) -> String {
        guard v > 0 else { return "0" }
        let r = (v * 10).rounded() / 10
        return r == r.rounded() ? String(Int(r)) : String(format: "%.1f", r)
    }
}

/// #restBar: counts down, -15 / +15 / skip.
struct RestBar: View {
    @EnvironmentObject private var session: WorkoutSession

    var body: some View {
        if let end = session.active?.restEndsAt {
            TimelineView(.periodic(from: .now, by: 0.25)) { ctx in
                let left = max(0, Int(((end / 1000) - ctx.date.timeIntervalSince1970).rounded()))
                HStack(spacing: 14) {
                    Text("REST").font(Theme.body(11, .bold)).foregroundStyle(Theme.muted)
                    Text(left >= 60 ? "\(left / 60):\(String(format: "%02d", left % 60))" : "\(left)")
                        .font(Theme.heading(28, .black)).monospacedDigit().foregroundStyle(Theme.accent)
                    Spacer()
                    Button("−15") { session.adjustRest(-15) }
                    Button("+15") { session.adjustRest(15) }
                    Button("Skip") { session.skipRest() }.foregroundStyle(Theme.text2)
                }
                .font(Theme.body(14, .semibold))
                .padding(.horizontal, 18).padding(.vertical, 12)
                .background(Theme.bg2)
                .overlay(alignment: .top) { Rectangle().fill(Theme.border).frame(height: 1) }
                .onChange(of: left == 0) { _, done in if done { session.skipRest() } }
            }
        }
    }
}

/// Add an exercise (the picker over allEx()), searchable.
struct AddExerciseSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var session: WorkoutSession
    @EnvironmentObject private var catalog: ExerciseCatalog
    @State private var q = ""

    var body: some View {
        let all = catalog.all(custom: store.backup.raw)
        let words = q.lowercased().split(separator: " ")
        let shown = words.isEmpty ? all : all.filter { e in words.allSatisfy { (e.name + " " + e.muscle).lowercased().contains($0) } }
        NavigationStack {
            List(shown.prefix(200)) { e in
                Button {
                    session.add(e, raw: store.backup.raw); dismiss()
                } label: {
                    HStack(spacing: 10) {
                        LogThumb(url: e.image.map { URL(string: ExerciseImages.base + $0) } ?? nil, muscle: e.muscle)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(e.name).font(Theme.body(14, .semibold)).foregroundStyle(Theme.text)
                            Text(e.muscle.capitalized).font(Theme.body(11)).foregroundStyle(Theme.muted)
                        }
                    }
                }
                .listRowBackground(Theme.bg2)
            }
            .scrollContentBackground(.hidden)
            .background(Theme.bg)
            .searchable(text: $q, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search exercises")
            .navigationTitle("Add Exercise").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .overlay { if all.count <= PWATables.builtIns.count { ProgressView().tint(Theme.accent) } }
        }
        .task { await catalog.load() }
    }
}

/// #pcModal: plates per side for a target weight, in the user's unit.
struct PlateCalcSheet: View {
    let settings: Settings
    @State private var target = ""
    @State private var bar = ""

    var body: some View {
        let lb = settings.isLb, u = settings.unitLabel
        let t = Double(target) ?? 0, b = Double(bar) ?? (lb ? 45 : 20)
        VStack(spacing: 14) {
            Text("PLATE CALCULATOR").font(Theme.heading(22, .extraBold)).foregroundStyle(Theme.text)
            HStack {
                field("Target (\(u))", $target, "0")
                field("Bar (\(u))", $bar, lb ? "45" : "20")
            }
            if t <= 0 {
                Text("Enter a target weight.").font(Theme.body(13)).foregroundStyle(Theme.muted)
            } else if t < b {
                Text("Target is below the bar weight.").font(Theme.body(13)).foregroundStyle(Theme.orange)
            } else {
                let r = WorkoutMath.plates(target: t, bar: b, isLb: lb)
                let groups = Dictionary(grouping: r.perSide, by: { $0 }).sorted { $0.key > $1.key }
                Text("EACH SIDE").font(Theme.body(11, .bold)).foregroundStyle(Theme.muted)
                if groups.isEmpty { Text("Just the bar").font(Theme.body(13)).foregroundStyle(Theme.muted) }
                HStack { ForEach(groups, id: \.key) { p, n in
                    Text("\(n.count) × \(WorkoutMath.n(p))").font(Theme.body(14, .semibold)).padding(.horizontal, 12).padding(.vertical, 8)
                        .background(Theme.accent.opacity(0.15), in: Capsule()).foregroundStyle(Theme.accent)
                } }
                let loaded = b + r.perSide.reduce(0, +) * 2
                Text("\(WorkoutMath.n(loaded)) \(u) loaded" + (r.leftover > 0.001 ? " · \(WorkoutMath.n(r.leftover)) \(u) short" : ""))
                    .font(Theme.body(13)).foregroundStyle(Theme.text2)
            }
            Spacer()
        }
        .padding(20)
        .background(Theme.bg2.ignoresSafeArea())
    }

    private func field(_ label: String, _ v: Binding<String>, _ ph: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(Theme.body(11, .bold)).foregroundStyle(Theme.muted)
            TextField(ph, text: v).keyboardType(.decimalPad).modifier(JackedFieldStyle(focused: false))
        }
    }
}

/// #fsModal: the finish summary, plus save-as-routine / update-routine.
struct FinishSummarySheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var session: WorkoutSession
    let s: WorkoutSession.Summary
    @State private var naming = false
    @State private var routineName = ""
    @State private var done: String?

    var body: some View {
        let settings = store.backup.settings
        ScrollView {
            VStack(spacing: 12) {
                Image(systemName: s.prs.isEmpty ? "dumbbell" : "trophy.fill").font(.system(size: 38))
                    .foregroundStyle(s.prs.isEmpty ? Theme.muted : Color(hex: 0xFFD700)).padding(.top, 24)
                Text(s.name).font(Theme.heading(26, .extraBold)).foregroundStyle(Theme.text)
                Text(s.savedToServer ? "Workout complete" : "Workout complete · saved on this phone, will sync when online")
                    .font(Theme.body(12)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                HStack(spacing: 8) {
                    stat(s.duration, "Time"); stat("\(s.sets)", "Sets"); stat(HomeMath.fmtV(settings.display(s.volume)), "\(settings.unitLabel) Lifted")
                }
                stat("\(s.prs.count)", "Personal Records", gold: true)
                if !s.prs.isEmpty { BlockTitle(text: "New PRs").padding(.top, 6) }
                ForEach(Array(s.prs.enumerated()), id: \.offset) { _, p in
                    HStack {
                        Text("★ \(p.name)").font(Theme.body(13, .semibold))
                        Spacer()
                        Text(p.label ?? "\(WorkoutMath.n(settings.display(p.weight)))\(settings.unitLabel) × \(Int(p.reps))")
                            .font(Theme.heading(16, .bold)).foregroundStyle(Theme.accent)
                    }
                    .padding(12).background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
                }
                if !s.suggested.isEmpty { BlockTitle(text: "Suggested PRs").padding(.top, 6) }
                ForEach(Array(s.suggested.enumerated()), id: \.offset) { _, p in
                    let implied = WorkoutMath.e1rm(p.weight, p.reps)
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(p.name).font(Theme.body(13, .semibold)); Spacer()
                            Text("\(WorkoutMath.n((settings.display(implied) * 10).rounded() / 10))\(settings.unitLabel)")
                                .font(Theme.heading(16, .bold)).foregroundStyle(Color(hex: 0xD9B84A))
                        }
                        Text("Estimated from \(WorkoutMath.n(settings.display(p.weight)))\(settings.unitLabel) × \(Int(p.reps)).")
                            .font(Theme.body(11)).foregroundStyle(Theme.muted)
                    }
                    .padding(12).background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
                }
                if let done { Text(done).font(Theme.body(13, .semibold)).foregroundStyle(Theme.accent) }
                if let r = s.routine, done == nil {
                    Button("Update \"\(r.name)\" with these exercises") {
                        Task { await session.updateRoutine(id: r.id, ids: s.exerciseIds, store: store, auth: auth); done = "Routine updated" }
                    }.buttonStyle(GhostButtonStyle())
                }
                if done == nil {
                    Button("Save as a new routine…") { naming = true }.buttonStyle(GhostButtonStyle())
                }
                Button("Done") { dismiss() }.buttonStyle(AccentButtonStyle()).padding(.top, 4)
            }
            .padding(.horizontal, 18).padding(.bottom, 30)
        }
        .background(Theme.bg2.ignoresSafeArea())
        .alert("Name this routine:", isPresented: $naming) {
            TextField("My Routine", text: $routineName)
            Button("Save") {
                Task {
                    await session.saveAsRoutine(name: routineName, ids: s.exerciseIds, store: store, auth: auth)
                    done = "Routine \"\(routineName.isEmpty ? "My Routine" : routineName)\" saved"
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func stat(_ v: String, _ l: String, gold: Bool = false) -> some View {
        VStack(spacing: 2) {
            Text(v).font(Theme.heading(24, .black)).foregroundStyle(gold ? Color(hex: 0xFFD700) : Theme.text)
            Text(l).font(Theme.body(11)).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 12)
        .background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
    }
}

/// Exercise photo for the logging screens, the line icon when there is none.
struct LogThumb: View {
    let url: URL?
    let muscle: String
    var body: some View {
        Group {
            if let url { AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Theme.bg4 } }
            else { ZStack { Theme.bg4; Image(systemName: "dumbbell").font(.system(size: 15)).foregroundStyle(Theme.muted) } }
        }
        .frame(width: 40, height: 40).clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
