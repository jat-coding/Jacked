import SwiftUI

/// index.html #suggestCard (renderSuggest): "Suggested today" under Start Workout, or "Let's get started"
/// with no history yet, plus the trusted pick of the day. ✕ hides it until tomorrow (jk_suggestDismiss).
struct SuggestCard: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var session: WorkoutSession
    @EnvironmentObject private var catalog: ExerciseCatalog

    var body: some View {
        let raw = store.backup.raw, today = JackedDate.dayKey(Date())
        let m = MetricsMath(raw: raw, lib: ExLib(db: catalog.db, raw: raw))
        if raw["jk_suggestDismiss"]?.string != today {
            let sug = m.suggestions(today: today), pick = m.todaysCuratedPick(today: today)
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text((sug == nil ? "Let's get started" : "Suggested today").uppercased())
                        .font(Theme.heading(24, .extraBold)).tracking(0.6).foregroundStyle(Theme.text)
                    Spacer()
                    Button { dismiss(today) } label: {
                        Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.text2)
                            .frame(width: 26, height: 26).background(Theme.bg3, in: Circle())
                    }
                    .buttonStyle(.plain).accessibilityLabel("Dismiss")
                }
                .padding(.bottom, 8)
                Text(sug == nil ? "Pick a routine, or start an empty workout." : "A few good options \u{2014} mix it up.")
                    .font(Theme.body(12)).foregroundStyle(Theme.text2).padding(.bottom, 2)
                ForEach(sug ?? []) { s in
                    row(divider: true) {
                        (Text(s.label.capitalized).font(Theme.body(14, .bold)).foregroundStyle(Theme.text)
                         + Text(" \u{00B7} " + s.sub).font(Theme.body(11)).foregroundStyle(Theme.muted))
                    } button: {
                        startButton(s.routine.map { "Start " + ($0["name"]?.string ?? "") } ?? "Start") { start(s, m, raw: raw) }
                    }
                }
                if let p = pick.pick {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("TRUSTED PICK OF THE DAY").font(Theme.body(10, .bold)).tracking(0.5).foregroundStyle(Theme.muted)
                        row(divider: false) {
                            (Text(p.name).font(Theme.body(14, .bold)).foregroundStyle(Theme.text)
                             + Text(" \u{00B7} \(p.program) (\(p.source))").font(Theme.body(11)).foregroundStyle(Theme.muted))
                        } button: { startButton("Start") { startCurated(p, raw: raw) } }
                    }
                    .padding(.top, 8).padding(.top, 2)
                    .overlay(alignment: .top) { Rectangle().fill(Theme.border).frame(height: 1) }
                    .padding(.top, 10)
                }
            }
            .padding(18)
            .background(Theme.bg2, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color(red: 77 / 255, green: 158 / 255, blue: 1).opacity(0.3), lineWidth: 1))
            .padding(.bottom, 22)
            .task(id: "\(today)|\(store.loadedCode ?? "")|\(store.lastSynced != nil)") {
                // todaysCuratedPick caches the pick per day in the synced blob, like the web app.
                guard store.lastSynced != nil else { return }
                #if DEBUG
                DevHooks.log("suggest: " + (sug ?? []).map { "\($0.label) \($0.sub) [\($0.routine?["name"]?.string ?? "-")]" }.joined(separator: " | ") + " pick=\(pick.pick?.name ?? "-") write=\(pick.write != nil)")
                if let hook = DevHooks.suggest, sug != nil, !Self.hookDone {
                    Self.hookDone = true
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                    if hook == "dismiss" { dismiss(today) }
                    else if hook == "pick", let p = pick.pick { startCurated(p, raw: raw) }
                    else if let s = (sug ?? []).first(where: { $0.label == hook.lowercased() }) { start(s, m, raw: raw) }
                }
                #endif
                // Recomputed against the merged server copy inside the save, so a pick made from a stale
                // local copy can never overwrite one another device already cached for today.
                if pick.write != nil {
                    let db = catalog.db
                    await store.edit(auth: auth) { r in MetricsMath(raw: r, lib: ExLib(db: db, raw: r)).todaysCuratedPick(today: today).write?(&r) }
                }
            }
        }
    }

    #if DEBUG
    private static var hookDone = false
    #endif

    private func row<L: View, B: View>(divider: Bool, @ViewBuilder label: () -> L, @ViewBuilder button: () -> B) -> some View {
        HStack(spacing: 8) { label().lineLimit(2); Spacer(minLength: 4); button() }
            .padding(.vertical, 6)
            .overlay(alignment: .top) { if divider { Rectangle().fill(Theme.border).frame(height: 1) } }
    }

    private func startButton(_ title: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(Theme.body(13, .semibold)).foregroundStyle(Theme.bg).lineLimit(1)
                .padding(.horizontal, 12).padding(.vertical, 7).background(Theme.accent, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    /// dismissSuggest(): hidden until tomorrow, saved through the careful save layer.
    private func dismiss(_ today: String) {
        Task { await store.edit(auth: auth) { $0["jk_suggestDismiss"] = .string(today) } }
    }

    /// The row's Start: startRW on the matching routine, else startGroupWorkout(lbl).
    private func start(_ s: MetricsMath.Suggestion, _ m: MetricsMath, raw: [String: JSONValue]) {
        if let r = s.routine { session.start(routine: r, catalog: catalog, raw: raw); return }
        let ids = m.groupWorkoutIds(s.label)
        if ids.isEmpty { session.startEmpty() } else { session.start(name: s.label.prefix(1).uppercased() + s.label.dropFirst(), ids: ids, catalog: catalog, raw: raw) }
    }

    /// startCuratedRoutine: your saved copy if you added the program, else the routine ad hoc (nothing saved).
    private func startCurated(_ p: MetricsMath.CuratedPick, raw: [String: JSONValue]) {
        guard Curated.programs.indices.contains(p.pi), Curated.programs[p.pi].routines.indices.contains(p.ri) else { return }
        let prog = Curated.programs[p.pi], rt = prog.routines[p.ri], tag = prog.name + " \u{00B7} " + prog.source
        if let existing = (raw["jk_routines"]?.array ?? []).compactMap(\.object).first(where: { $0["name"]?.string == rt.name && $0["desc"]?.string == tag }) {
            session.start(routine: existing, catalog: catalog, raw: raw)
        } else {
            session.start(name: rt.name, ids: rt.ids, catalog: catalog, raw: raw)
        }
    }
}
