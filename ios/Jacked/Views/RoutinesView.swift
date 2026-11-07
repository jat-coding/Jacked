import SwiftUI

/// #page-routines: your routines grouped by section (jk_routineSections, the PWA's sectioned
/// list), New Routine, and Edit / Delete behind each card's 3-dot. Saves go through merge + CAS.
/// Trusted Programs and dragging sections/routines into a custom order are not on the iPhone yet.
struct RoutinesView: View {
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var session: WorkoutSession
    @State private var editing: RoutineDraft?

    var body: some View {
        let raw = store.backup.raw
        let blocks = RoutineMath.sections(raw)
        ScrollView {
            VStack(spacing: 12) {
                PageHeader(title: "Routines") {
                    Button("+ New") { editing = RoutineDraft(id: nil, name: "", desc: "", sectionId: "", exercises: []) }
                        .font(Theme.body(14, .semibold)).padding(.horizontal, 14).padding(.vertical, 8)
                        .overlay(Capsule().stroke(Theme.border2, lineWidth: 1))
                }
                Button { session.startEmpty() } label: { Label("Empty Workout", systemImage: "plus").font(Theme.body(15, .semibold)) }
                    .buttonStyle(GhostButtonStyle())
                if blocks.isEmpty {
                    VStack(spacing: 4) {
                        Text("No routines").font(Theme.heading(22, .bold)).foregroundStyle(Theme.text2)
                        Text("Create your first routine.").font(Theme.body(13)).foregroundStyle(Theme.muted)
                    }
                    .padding(.vertical, 30)
                }
                ForEach(blocks, id: \.name) { b in
                    BlockTitle(text: b.name).padding(.top, 8)
                    if b.routines.isEmpty {
                        Text("No routines yet — edit a routine to move it here.").font(Theme.body(12)).foregroundStyle(Theme.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(Array(b.routines.enumerated()), id: \.offset) { _, r in
                        RoutineRow(r: r) { editing = RoutineDraft(r) }
                    }
                }
            }
            .padding(.horizontal, 16).padding(.bottom, 30)
        }
        .background(Theme.bg.ignoresSafeArea())
        .sheet(item: $editing) { RoutineEditorSheet(draft: $0) }
        .task {
            #if DEBUG
            if let spec = DevHooks.newRoutine {
                await catalog.load()
                let parts = spec.split(separator: "|", maxSplits: 1).map(String.init)
                let ok = await RoutineMath.save(RoutineDraft(id: nil, name: parts[0], desc: "", sectionId: "",
                                                             exercises: parts.count > 1 ? parts[1].split(separator: ",").map(String.init) : []),
                                                store: store, auth: authStore, catalog: catalog)
                DevHooks.log("dev routine saved=\(ok)")
            }
            #endif
        }
    }
    @EnvironmentObject private var authStore: AuthStore
    @EnvironmentObject private var catalog: ExerciseCatalog
}

struct RoutineRow: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var session: WorkoutSession
    @EnvironmentObject private var catalog: ExerciseCatalog
    let r: [String: JSONValue]
    var onEdit: () -> Void = {}
    @State private var confirmDelete = false

    var body: some View {
        let ids = (r["exercises"]?.array ?? []).compactMap(\.string)
        let names = ids.map { catalog.byId($0, raw: store.backup.raw).name }
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(r["name"]?.string ?? "Routine").font(Theme.heading(20, .extraBold)).foregroundStyle(Theme.text)
                    Text("\(r["desc"]?.string ?? "") · \(ids.count) exercises").font(Theme.body(12)).foregroundStyle(Theme.muted)
                }
                Spacer()
                Menu {
                    Button { onEdit() } label: { Label("Edit", systemImage: "pencil") }
                    Button(role: .destructive) { confirmDelete = true } label: { Label("Delete", systemImage: "trash") }
                } label: { Image(systemName: "ellipsis").foregroundStyle(Theme.text2).frame(width: 32, height: 32) }
                .accessibilityLabel("Routine options")
            }
            FlowChips(items: Array(names.prefix(5)) + (names.count > 5 ? ["+\(names.count - 5) more"] : []))
            Button { session.start(routine: r, catalog: catalog, raw: store.backup.raw) } label: {
                Text("Start Workout").font(Theme.body(14, .bold)).frame(maxWidth: .infinity)
            }
            .buttonStyle(AccentButtonStyle())
        }
        .padding(14).card()
        .confirmationDialog("Delete this routine?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                let id = r["id"]
                Task { _ = await store.edit(auth: auth) { raw in
                    raw["jk_routines"] = .array((raw["jk_routines"]?.array ?? []).filter { $0["id"] != id })
                } }
            }
        }
    }
}

/// `.badge.bm` chips that wrap onto new lines.
struct FlowChips: View {
    let items: [String]
    var body: some View {
        FlowLayout(spacing: 5) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, t in
                Text(t).font(Theme.body(11, .semibold)).foregroundStyle(Theme.text2)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Theme.bg3, in: RoundedRectangle(cornerRadius: 6))
            }
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 5
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > w { x = 0; y += row + spacing; row = 0 }
            x += s.width + spacing; row = max(row, s.height)
        }
        return CGSize(width: w.isFinite ? w : x, height: y + row)
    }
    func placeSubviews(in b: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = b.minX, y = b.minY, row: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > b.minX && x + s.width > b.maxX { x = b.minX; y += row + spacing; row = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing; row = max(row, s.height)
        }
    }
}

struct RoutineDraft: Identifiable {
    let uid = UUID()
    var id: String?
    var name: String
    var desc: String
    /// "" = auto-suggest from the exercises (suggestSectionId).
    var sectionId: String
    var exercises: [String]
    var identifiable: UUID { uid }
}
extension RoutineDraft {
    init(_ r: [String: JSONValue]) {
        self.init(id: r["id"]?.string, name: r["name"]?.string ?? "", desc: r["desc"]?.string ?? "",
                  sectionId: r["sectionId"]?.string ?? "", exercises: (r["exercises"]?.array ?? []).compactMap(\.string))
    }
}

/// Sections, filing and saveR() (index.html routinesInSection / suggestSectionId / findOrCreateSection).
enum RoutineMath {
    struct Block { let name: String; let routines: [[String: JSONValue]] }
    static let sectionLabel = ["chest": "Chest", "back": "Back", "shoulders": "Shoulders", "biceps": "Biceps",
                               "triceps": "Triceps", "legs": "Legs", "glutes": "Glutes", "core": "Core"]
    static let mgroups = ["chest", "back", "shoulders", "biceps", "triceps", "legs", "glutes", "core"]

    static func sections(_ raw: [String: JSONValue]) -> [Block] {
        let rs = (raw["jk_routines"]?.array ?? []).compactMap(\.object)
        guard !rs.isEmpty else { return [] }
        let secs = (raw["jk_routineSections"]?.array ?? []).compactMap(\.object)
        var grouped = Set<String>()
        let byName: ([String: JSONValue], [String: JSONValue]) -> Bool = {
            ($0["name"]?.string ?? "").localizedStandardCompare($1["name"]?.string ?? "") == .orderedAscending
        }
        var out: [Block] = secs.map { s in
            let sid = s["id"]?.string ?? ""
            var list = rs.filter { $0["sectionId"]?.string == sid }
            if let manual = s["order"]?.array?.compactMap(\.string) {
                let ordered = manual.compactMap { id in list.first { $0["id"]?.string == id } }
                list = ordered + list.filter { !manual.contains($0["id"]?.string ?? "") }.sorted(by: byName)
            } else { list.sort(by: byName) }
            list.forEach { if let id = $0["id"]?.string { grouped.insert(id) } }
            return Block(name: s["name"]?.string ?? "Section", routines: list)
        }
        let orphans = rs.filter { !grouped.contains($0["id"]?.string ?? "") }.sorted(by: byName)
        if !orphans.isEmpty { out.append(Block(name: "Unfiled", routines: orphans)) }
        return out
    }

    /// majorityGroupForRoutine: the group most exercises train; nil on a tie or none.
    static func majorityGroup(_ ids: [String], catalog: (String) -> CatalogExercise) -> String? {
        var counts: [String: Int] = [:]
        for id in ids { let g = LibraryMath.muscleGroup(catalog(id).muscle); if mgroups.contains(g) { counts[g, default: 0] += 1 } }
        let e = counts.sorted { $0.value > $1.value }
        guard let top = e.first else { return nil }
        if e.count > 1 && e[0].value == e[1].value { return nil }
        return top.key
    }

    /// saveR(): new routine "r<ms>" or merged into the existing one; section picked or auto-filed.
    @MainActor
    static func save(_ d: RoutineDraft, store: BackupStore, auth: AuthStore, catalog: ExerciseCatalog? = nil) async -> Bool {
        let n = d.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else { return false }
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        return await store.edit(auth: auth) { raw in
            var secId = d.sectionId
            if secId.isEmpty {
                let g = majorityGroup(d.exercises) { id in catalog?.byId(id, raw: raw)
                    ?? CatalogExercise(id: id, name: id, muscle: "", equip: "", tracking: "weight_reps", assist: false, image: nil, custom: false) }
                let label = g.flatMap { sectionLabel[$0] } ?? "Unsorted"
                var secs = raw["jk_routineSections"]?.array ?? []
                if let hit = secs.first(where: { ($0["name"]?.string ?? "").lowercased() == label.lowercased() }), let id = hit["id"]?.string {
                    secId = id
                } else {
                    secId = "sec\(now)" + String(UUID().uuidString.lowercased().prefix(5))
                    secs.append(.object(["id": .string(secId), "name": .string(label), "order": .null]))
                    raw["jk_routineSections"] = .array(secs)
                }
            }
            var rs = raw["jk_routines"]?.array ?? []
            let obj: [String: JSONValue] = ["name": .string(n), "desc": .string(d.desc.trimmingCharacters(in: .whitespacesAndNewlines)),
                                            "exercises": .array(d.exercises.map(JSONValue.string)), "sectionId": .string(secId)]
            if let id = d.id, let i = rs.firstIndex(where: { $0["id"]?.string == id }), var o = rs[i].object {
                for (k, v) in obj { o[k] = v }; rs[i] = .object(o)
            } else {
                rs.append(.object(obj.merging(["id": .string("r\(now)")]) { a, _ in a }))
            }
            raw["jk_routines"] = .array(rs)
        }
    }
}

/// #crModal: name, description, section, and the exercise list (up / down / replace / delete, add).
struct RoutineEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var catalog: ExerciseCatalog
    @State var draft: RoutineDraft
    @State private var picking: Int? = nil   // -1 = add, else replace that index
    @State private var saving = false

    var body: some View {
        let raw = store.backup.raw
        let secs = (raw["jk_routineSections"]?.array ?? []).compactMap(\.object)
        NavigationStack {
            Form {
                Section {
                    TextField("Routine name", text: $draft.name)
                    TextField("Description (optional)", text: $draft.desc)
                    Picker("Section", selection: $draft.sectionId) {
                        Text("Auto-suggest from exercises").tag("")
                        ForEach(Array(secs.enumerated()), id: \.offset) { _, s in Text(s["name"]?.string ?? "").tag(s["id"]?.string ?? "") }
                    }
                }
                Section("Exercises") {
                    if draft.exercises.isEmpty { Text("No exercises yet. Tap Add Exercises.").font(Theme.body(12)).foregroundStyle(Theme.muted) }
                    ForEach(Array(draft.exercises.enumerated()), id: \.offset) { i, id in
                        let ex = catalog.byId(id, raw: raw)
                        HStack(spacing: 8) {
                            LogThumb(url: ex.image.map { URL(string: ExerciseImages.base + $0) } ?? nil, muscle: ex.muscle)
                            Text(ex.name).font(Theme.body(13, .semibold)).lineLimit(2)
                            Spacer()
                            Menu {
                                Button("Move up") { move(i, -1) }.disabled(i == 0)
                                Button("Move down") { move(i, 1) }.disabled(i == draft.exercises.count - 1)
                                Button("Replace") { picking = i }
                                Button("Delete", role: .destructive) { draft.exercises.remove(at: i) }
                            } label: { Image(systemName: "ellipsis.circle").foregroundStyle(Theme.text2) }
                        }
                    }
                    Button { picking = -1 } label: { Label("Add Exercises", systemImage: "plus") }
                }
            }
            .scrollContentBackground(.hidden).background(Theme.bg2)
            .navigationTitle(draft.id == nil ? "New Routine" : "Edit Routine").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { saving = true; _ = await RoutineMath.save(draft, store: store, auth: auth, catalog: catalog); dismiss() } }
                        .disabled(draft.name.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                }
            }
            .sheet(item: Binding(get: { picking.map { PickSlot(i: $0) } }, set: { picking = $0?.i })) { slot in
                ExercisePickerSheet { id in
                    if slot.i < 0 { draft.exercises.append(id) } else if draft.exercises.indices.contains(slot.i) { draft.exercises[slot.i] = id }
                }
            }
        }
        .task { await catalog.load() }
    }

    private struct PickSlot: Identifiable { let i: Int; var id: Int { i } }
    private func move(_ i: Int, _ d: Int) {
        let j = i + d; guard draft.exercises.indices.contains(j) else { return }
        draft.exercises.swapAt(i, j)
    }
}

/// The exercise picker for routines: tap one to pick it.
struct ExercisePickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var catalog: ExerciseCatalog
    let pick: (String) -> Void
    @State private var q = ""
    @State private var chip: String?
    var body: some View {
        let shown = LibraryMath.list(catalog.all(custom: store.backup.raw), raw: store.backup.raw, query: q, chip: chip)
        NavigationStack {
            List(shown) { e in
                Button { pick(e.id); dismiss() } label: {
                    HStack(spacing: 10) {
                        LogThumb(url: e.image.map { URL(string: ExerciseImages.base + $0) } ?? nil, muscle: e.muscle)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(e.name).font(Theme.body(14, .semibold)).foregroundStyle(Theme.text)
                            Text(LibraryMath.capW(e.muscle)).font(Theme.body(11)).foregroundStyle(Theme.muted)
                        }
                    }
                }
                .listRowBackground(Theme.bg2)
            }
            .scrollContentBackground(.hidden).background(Theme.bg)
            .searchable(text: $q, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search exercises")
            .navigationTitle("Add Exercise").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
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
