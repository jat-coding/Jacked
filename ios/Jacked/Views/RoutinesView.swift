import SwiftUI

/// #page-routines, first cut: your saved routines (`jk_routines`), tap Start to log one.
/// Trusted Programs, sections, reorder and the routine editor come with the rest of the app.
struct RoutinesView: View {
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var session: WorkoutSession
    @EnvironmentObject private var catalog: ExerciseCatalog

    var body: some View {
        let rs = (store.backup.raw["jk_routines"]?.array ?? []).compactMap(\.object)
        ScrollView {
            VStack(spacing: 12) {
                PageHeader(title: "Routines")
                Button { session.startEmpty() } label: { Label("Empty Workout", systemImage: "plus").font(Theme.body(15, .semibold)) }
                    .buttonStyle(GhostButtonStyle())
                BlockTitle(text: "My Routines").padding(.top, 8)
                if rs.isEmpty {
                    Text("No routines yet. Finish a workout and tap Save as a new routine.")
                        .font(Theme.body(13)).foregroundStyle(Theme.muted).frame(maxWidth: .infinity, alignment: .leading)
                }
                ForEach(Array(rs.enumerated()), id: \.offset) { _, r in RoutineRow(r: r) }
            }
            .padding(.horizontal, 16).padding(.bottom, 30)
        }
        .background(Theme.bg.ignoresSafeArea())
    }
}

struct RoutineRow: View {
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var session: WorkoutSession
    @EnvironmentObject private var catalog: ExerciseCatalog
    let r: [String: JSONValue]

    var body: some View {
        let ids = (r["exercises"]?.array ?? []).compactMap(\.string)
        let names = ids.map { catalog.byId($0, raw: store.backup.raw).name }
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(r["name"]?.string ?? "Routine").font(Theme.heading(20, .extraBold)).foregroundStyle(Theme.text)
                Text("\(ids.count) exercise\(ids.count == 1 ? "" : "s")").font(Theme.body(11, .semibold)).foregroundStyle(Theme.accent)
                Text(names.prefix(4).joined(separator: ", ") + (names.count > 4 ? "…" : ""))
                    .font(Theme.body(12)).foregroundStyle(Theme.muted).lineLimit(2)
            }
            Spacer()
            Button("Start") { session.start(routine: r, catalog: catalog, raw: store.backup.raw) }
                .font(Theme.body(14, .bold)).foregroundStyle(Theme.onAccent)
                .padding(.horizontal, 16).padding(.vertical, 9)
                .background(Theme.accent, in: Capsule())
        }
        .padding(14).card()
    }
}

/// #qsModal: empty workout or one of your routines.
struct StartWorkoutSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var session: WorkoutSession
    @EnvironmentObject private var catalog: ExerciseCatalog

    var body: some View {
        let rs = (store.backup.raw["jk_routines"]?.array ?? []).compactMap(\.object)
        ScrollView {
            VStack(spacing: 12) {
                Text("START WORKOUT").font(Theme.heading(24, .extraBold)).foregroundStyle(Theme.text).padding(.top, 22)
                Button { dismiss(); session.startEmpty() } label: { Label("Empty Workout", systemImage: "plus").font(Theme.body(15, .semibold)) }
                    .buttonStyle(AccentButtonStyle())
                if !rs.isEmpty { BlockTitle(text: "From a routine").padding(.top, 8) }
                ForEach(Array(rs.enumerated()), id: \.offset) { _, r in
                    Button {
                        dismiss(); session.start(routine: r, catalog: catalog, raw: store.backup.raw)
                    } label: {
                        HStack {
                            Text(r["name"]?.string ?? "Routine").font(Theme.body(15, .semibold)).foregroundStyle(Theme.text)
                            Spacer()
                            Image(systemName: "play.fill").foregroundStyle(Theme.accent)
                        }
                        .padding(14).card(fill: Theme.bg3)
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .background(Theme.bg2.ignoresSafeArea())
    }
}
