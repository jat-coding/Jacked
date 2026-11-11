import SwiftUI

/// #page-routines: your routines grouped by section (jk_routineSections, the PWA's sectioned
/// list), New Routine, and Edit / Delete behind each card's 3-dot. Saves go through merge + CAS.
/// Dragging sections/routines into a custom order is not on the iPhone yet.
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
                        .buttonStyle(HeaderPillStyle())
                }
                TrustedPrograms()
                VStack(spacing: 12) {
                HStack {
                    BlockTitle(text: "My Routines")
                    Spacer()
                    if !blocks.isEmpty {
                        Button("Reorder") { showOrder = true }.buttonStyle(HeaderPillStyle())
                    }
                }
                if blocks.isEmpty {
                    VStack(spacing: 4) {
                        Text("No routines").font(Theme.heading(22, .bold)).foregroundStyle(Theme.text2)
                        Text("Create your first routine.").font(Theme.body(13)).foregroundStyle(Theme.muted)
                    }
                    .padding(.vertical, 30)
                }
                let collapsed = Set((raw["jk_collapsedSections"]?.array ?? []).compactMap(\.string))
                ForEach(blocks, id: \.id) { b in
                    // sectionBlockHtml: the whole header toggles collapse (saved, like the web app); the name is
                    // renamed from a long press here instead of the web app's inline edit. "Unfiled" is read-only.
                    let isCollapsed = collapsed.contains(b.id)
                    Button { toggleCollapsed(b.id) } label: {
                        HStack {
                            Text(b.name.uppercased()).font(Theme.heading(16, .bold)).tracking(0.6).foregroundStyle(Theme.text)
                            Spacer()
                            JIcon("chevron", 13).foregroundStyle(Theme.muted)
                                .rotationEffect(.degrees(isCollapsed ? -90 : 0))
                        }
                        .padding(.bottom, 8)
                        .overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 1) }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain).padding(.top, 4)
                    .contextMenu {
                        if !b.id.isEmpty {
                            Button { renameDraft = b.name; renaming = b } label: { Label("Rename section", image: "ic-pencil") }
                        }
                    }
                    if isCollapsed { EmptyView() } else {
                    if b.routines.isEmpty {
                        Text("No routines yet — edit a routine to move it here.").font(Theme.body(12)).foregroundStyle(Theme.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(Array(b.routines.enumerated()), id: \.offset) { _, r in
                        RoutineRow(r: r) { editing = RoutineDraft(r) }
                    }
                    }
                }
                }
                .padding(18).background(Theme.bg2, in: RoundedRectangle(cornerRadius: Theme.radiusLarge))
            }
            .padding(.horizontal, 16).padding(.bottom, 30)
        }
        .contentMargins(.bottom, 78, for: .scrollContent)   // clears the floating tab capsule (the TabView inset never reaches these scroll views)
        .background(Theme.bg.ignoresSafeArea())
        .sheet(item: $editing) { RoutineEditorSheet(draft: $0) }
        .alert("Rename section", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Section name", text: $renameDraft)
            Button("Save") { if let b = renaming { rename(b.id, renameDraft) }; renaming = nil }
            Button("Cancel", role: .cancel) { renaming = nil }
        }
        .overlay(alignment: .top) { ToastView(text: $toast) }
        .sheet(isPresented: $showOrder) { RoutineOrderSheet().popup() }
        .task {
            #if DEBUG
            if let spec = DevHooks.section {
                // collapse:<name> | rename:<name>|<new name>
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                let secs = RoutineMath.sections(store.backup.raw)
                if spec.hasPrefix("collapse:"), let b = secs.first(where: { $0.name == String(spec.dropFirst(9)) }) { toggleCollapsed(b.id) }
                if spec == "order" { showOrder = true }
                if spec.hasPrefix("move:") {   // move:<section name>|<from>|<to>, or move:|<from>|<to> for the sections themselves
                    let p = spec.dropFirst(5).split(separator: "|", omittingEmptySubsequences: false).map(String.init)
                    if p.count == 3, let f = Int(p[1]), let t = Int(p[2]) {
                        if p[0].isEmpty { await RoutineMath.moveSection(from: IndexSet(integer: f), to: t, store: store, auth: authStore) }
                        else if let b = secs.first(where: { $0.name == p[0] }) { await RoutineMath.moveRoutine(in: b, from: IndexSet(integer: f), to: t, store: store, auth: authStore) }
                    }
                }
                if spec.hasPrefix("rename:") {
                    let parts = spec.dropFirst(7).split(separator: "|", maxSplits: 1).map(String.init)
                    if parts.count == 2, let b = secs.first(where: { $0.name == parts[0] }) { rename(b.id, parts[1]) }
                }
                DevHooks.log("dev section \(spec) toast=\(toast ?? "-")")
            }
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
    @State private var renaming: RoutineMath.Block?
    @State private var renameDraft = ""
    @State private var showOrder = false
    @State private var toast: String?

    /// toggleSectionCollapsed: jk_collapsedSections, saved through merge + CAS.
    private func toggleCollapsed(_ id: String) {
        Task { await store.edit(auth: authStore) { r in
            var cs = (r["jk_collapsedSections"]?.array ?? []).compactMap(\.string)
            if let i = cs.firstIndex(of: id) { cs.remove(at: i) } else { cs.append(id) }
            r["jk_collapsedSections"] = .array(cs.map(JSONValue.string))
        } }
    }

    /// renameSection: trimmed, unchanged or empty is a no-op, a name another section already has (any case) is refused.
    private func rename(_ id: String, _ raw: String) {
        let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let secs = (store.backup.raw["jk_routineSections"]?.array ?? []).compactMap(\.object)
        guard let idx = secs.firstIndex(where: { $0["id"]?.string == id }), !name.isEmpty, secs[idx]["name"]?.string != name else { return }
        if secs.enumerated().contains(where: { $0.offset != idx && ($0.element["name"]?.string ?? "").lowercased() == name.lowercased() }) {
            toast = "A section named \"\(name)\" already exists"; return
        }
        Task { await store.edit(auth: authStore) { r in
            var a = (r["jk_routineSections"]?.array ?? [])
            if let i = a.firstIndex(where: { $0.object?["id"]?.string == id }), var o = a[i].object { o["name"] = .string(name); a[i] = .object(o) }
            r["jk_routineSections"] = .array(a)
        } }
    }
}

/// The Trusted Programs strip (renderCurated): each program's workouts and "+ Add to Routines" (addCurated).
struct TrustedPrograms: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var catalog: ExerciseCatalog
    @State private var added: String?

    var body: some View {
        let raw = store.backup.raw
        let pick = MetricsMath(raw: raw, lib: ExLib(db: catalog.db, raw: raw)).todaysCuratedPick(today: JackedDate.dayKey(Date())).pick
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                SFIcon("star.fill").foregroundStyle(Color(hex: 0xFFD700))
                Text("TRUSTED PROGRAMS").font(Theme.heading(24, .extraBold)).foregroundStyle(Theme.text)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 10) {
                    ForEach(Array(Curated.programs.enumerated()), id: \.offset) { i, p in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(p.name).font(Theme.heading(18, .extraBold)).foregroundStyle(Theme.text)
                            Text(p.desc).font(Theme.body(11)).foregroundStyle(Theme.muted)
                            ForEach(Array(p.routines.enumerated()), id: \.offset) { ri, r in
                                // The Suggested today card's trusted pick, marked here too (renderCurated isPick).
                                let isPick = pick?.pi == i && pick?.ri == ri
                                Text((isPick ? "Today's pick \u{00B7} " : "") + r.name)
                                    .font(Theme.body(12, isPick ? .bold : .regular)).foregroundStyle(isPick ? Theme.blue : Theme.text2).padding(.top, 2)
                            }
                            Text("\(p.routines.count) workout\(p.routines.count == 1 ? "" : "s") · \(p.source)")
                                .font(Theme.body(10)).foregroundStyle(Theme.muted).padding(.top, 4)
                            Spacer(minLength: 6)
                            Button(added == p.name ? "Added ✓" : "+ Add to Routines") { Task { await add(i) } }
                                .buttonStyle(SmallAccentButtonStyle())
                                .disabled(added == p.name)
                        }
                        .frame(width: 210, alignment: .leading).frame(minHeight: 150)
                        .padding(14).overlay(RoundedRectangle(cornerRadius: Theme.radiusLarge).stroke(Theme.border2, lineWidth: 1))
                    }
                }
            }
        }
        .padding(14).card()
        .task {
            #if DEBUG
            if let i = DevHooks.addProgram, Curated.programs.indices.contains(i) { await add(i); DevHooks.log("dev program added \(i)") }
            #endif
        }
    }

    /// addCurated: every workout of the program becomes one of your routines, desc "<program> · <source>".
    private func add(_ i: Int) async {
        let p = Curated.programs[i]
        await catalog.load()
        let base = Int64(Date().timeIntervalSince1970 * 1000)
        _ = await store.edit(auth: auth) { raw in
            var rs = raw["jk_routines"]?.array ?? []
            for (n, r) in p.routines.enumerated() {
                let secId = RoutineMath.sectionId(for: r.ids, raw: &raw, catalog: catalog)
                rs.append(.object(["id": .string("r\(base)_\(n)"), "name": .string(r.name), "desc": .string("\(p.name) · \(p.source)"),
                                   "exercises": .array(r.ids.map(JSONValue.string)), "sectionId": .string(secId)]))
            }
            raw["jk_routines"] = .array(rs)
        }
        added = p.name
    }
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
                    Button { onEdit() } label: { Label("Edit", image: "ic-pencil") }
                    Button(role: .destructive) { confirmDelete = true } label: { Label("Delete", image: "ic-trash") }
                } label: { SFIcon("ellipsis").foregroundStyle(Theme.text2).frame(width: 32, height: 32) }
                .accessibilityLabel("Routine options")
            }
            FlowChips(items: Array(names.prefix(5)) + (names.count > 5 ? ["+\(names.count - 5) more"] : []))
            Button { session.start(routine: r, catalog: catalog, raw: store.backup.raw) } label: {
                Text("Start Workout").font(Theme.body(14, .semibold)).padding(.horizontal, 24)
            }
            .buttonStyle(AccentButtonStyle(vertical: 9)).fixedSize()
        }
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(Theme.border).frame(height: 1) }
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

struct RoutineDraft: Identifiable, Equatable {
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
    struct Block { let id: String; let name: String; let routines: [[String: JSONValue]] }
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
            return Block(id: sid, name: s["name"]?.string ?? "Section", routines: list)
        }
        let orphans = rs.filter { !grouped.contains($0["id"]?.string ?? "") }.sorted(by: byName)
        if !orphans.isEmpty { out.append(Block(id: "", name: "Unfiled", routines: orphans)) }
        return out
    }

    /// Reorder Sections (routineOrderList drop): the new section order, saved through merge + CAS. Sections
    /// that arrived from another device in the meantime keep their place at the end.
    @MainActor static func moveSection(from: IndexSet, to: Int, store: BackupStore, auth: AuthStore) async {
        var ids = (store.backup.raw["jk_routineSections"]?.array ?? []).compactMap { $0.object?["id"]?.string }
        ids.move(fromOffsets: from, toOffset: to)
        _ = await store.edit(auth: auth) { r in
            let old = (r["jk_routineSections"]?.array ?? [])
            let byId = Dictionary(old.compactMap { v in v.object?["id"]?.string.map { ($0, v) } }, uniquingKeysWith: { a, _ in a })
            r["jk_routineSections"] = .array(ids.compactMap { byId[$0] } + old.filter { !ids.contains($0.object?["id"]?.string ?? "") })
        }
    }

    /// Reorder routines within one section (secROList drop): that section's manual `order`.
    @MainActor static func moveRoutine(in b: Block, from: IndexSet, to: Int, store: BackupStore, auth: AuthStore) async {
        var ids = b.routines.compactMap { $0["id"]?.string }
        ids.move(fromOffsets: from, toOffset: to)
        _ = await store.edit(auth: auth) { r in
            var a = r["jk_routineSections"]?.array ?? []
            if let i = a.firstIndex(where: { $0.object?["id"]?.string == b.id }), var o = a[i].object {
                o["order"] = .array(ids.map(JSONValue.string)); a[i] = .object(o)
            }
            r["jk_routineSections"] = .array(a)
        }
    }

    /// addSectionPrompt -> findOrCreateSection(name): an existing section with that name (any case) is reused.
    @MainActor static func addSection(_ name: String, store: BackupStore, auth: AuthStore) async {
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines); guard !n.isEmpty else { return }
        _ = await store.edit(auth: auth) { r in
            var a = r["jk_routineSections"]?.array ?? []
            if a.contains(where: { ($0.object?["name"]?.string ?? "").lowercased() == n.lowercased() }) { return }
            let rnd = String(UUID().uuidString.lowercased().filter(\.isLetter).prefix(5))
            a.append(.object(["id": .string("sec\(Int64(Date().timeIntervalSince1970 * 1000))\(rnd)"), "name": .string(n), "order": .null]))
            r["jk_routineSections"] = .array(a)
        }
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

    /// suggestSectionId + findOrCreateSection: the majority group's section, else "Unsorted", made if missing.
    @MainActor
    static func sectionId(for ids: [String], raw: inout [String: JSONValue], catalog: ExerciseCatalog?) -> String {
        let r = raw
        let g = majorityGroup(ids) { id in catalog?.byId(id, raw: r)
            ?? CatalogExercise(id: id, name: id, muscle: "", equip: "", tracking: "weight_reps", assist: false, image: nil, custom: false) }
        let label = g.flatMap { sectionLabel[$0] } ?? "Unsorted"
        var secs = raw["jk_routineSections"]?.array ?? []
        if let hit = secs.first(where: { ($0["name"]?.string ?? "").lowercased() == label.lowercased() }), let id = hit["id"]?.string { return id }
        let id = "sec\(Int64(Date().timeIntervalSince1970 * 1000))" + String(UUID().uuidString.lowercased().prefix(5))
        secs.append(.object(["id": .string(id), "name": .string(label), "order": .null]))
        raw["jk_routineSections"] = .array(secs)
        return id
    }

    /// saveR(): new routine "r<ms>" or merged into the existing one; section picked or auto-filed.
    @MainActor
    static func save(_ d: RoutineDraft, store: BackupStore, auth: AuthStore, catalog: ExerciseCatalog? = nil) async -> Bool {
        let n = d.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else { return false }
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        return await store.edit(auth: auth) { raw in
            let secId = d.sectionId.isEmpty ? sectionId(for: d.exercises, raw: &raw, catalog: catalog) : d.sectionId
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
    @State private var initial: RoutineDraft? = nil

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
                            } label: { SFIcon("ellipsis.circle").foregroundStyle(Theme.text2) }
                        }
                    }
                    Button { picking = -1 } label: { Label("Add Exercises", systemImage: "plus") }
                }
            }
            .scrollContentBackground(.hidden).background(Theme.bg2)
            .navigationTitle(draft.id == nil ? "New Routine" : "Edit Routine").navigationBarTitleDisplayMode(.inline)
            .onAppear { if initial == nil { initial = draft } }
            .popup(dirty: initial != nil && initial != draft && !saving)
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
                }.popup()
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
    /// Hands the chosen start to the presenter, which runs it in the sheet's onDismiss (presenting the
    /// workout sheet while this one is still closing leaves it unshown or untouchable).
    var onPick: (@escaping () -> Void) -> Void = { $0() }

    var body: some View {
        let rs = (store.backup.raw["jk_routines"]?.array ?? []).compactMap(\.object)
        ScrollView {
            VStack(spacing: 12) {
                Text("START WORKOUT").font(Theme.heading(24, .extraBold)).foregroundStyle(Theme.text).padding(.top, 22)
                Button { onPick { session.startEmpty() }; dismiss() } label: { Label("Empty Workout", systemImage: "plus").font(Theme.body(15, .semibold)) }
                    .buttonStyle(AccentButtonStyle())
                if !rs.isEmpty { BlockTitle(text: "From a routine").padding(.top, 8) }
                ForEach(Array(rs.enumerated()), id: \.offset) { _, r in
                    Button {
                        onPick { session.start(routine: r, catalog: catalog, raw: store.backup.raw) }; dismiss()
                    } label: {
                        HStack {
                            Text(r["name"]?.string ?? "Routine").font(Theme.body(15, .semibold)).foregroundStyle(Theme.text)
                            Spacer()
                            SFIcon("play.fill").foregroundStyle(Theme.accent)
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

/// #routineOrderModal: drag a section to reorder sections, drag a routine to reorder it within its section,
/// "+ Section" adds an empty one. Every move saves straight away, like the web app's drop.
struct RoutineOrderSheet: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @Environment(\.dismiss) private var dismiss
    @State private var adding = false
    @State private var newName = ""

    var body: some View {
        let blocks = RoutineMath.sections(store.backup.raw).filter { !$0.id.isEmpty }
        NavigationStack {
            List {
                Section {
                    ForEach(blocks, id: \.id) { b in
                        Text(b.name.uppercased()).font(Theme.body(13, .bold)).tracking(0.4).foregroundStyle(Theme.text)
                    }
                    .onMove { f, t in Task { await RoutineMath.moveSection(from: f, to: t, store: store, auth: auth) } }
                } header: {
                    Text("Drag a section's grip to reorder sections. Drag a routine's grip to reorder it within its section.")
                        .font(Theme.body(12)).foregroundStyle(Theme.muted).textCase(nil)
                }
                ForEach(blocks, id: \.id) { b in
                    Section(b.name.uppercased()) {
                        if b.routines.isEmpty { Text("No routines yet").font(Theme.body(13)).foregroundStyle(Theme.muted) }
                        ForEach(Array(b.routines.enumerated()), id: \.offset) { _, r in
                            Text(r["name"]?.string ?? "").font(Theme.body(14, .semibold)).foregroundStyle(Theme.text)
                        }
                        .onMove { f, t in Task { await RoutineMath.moveRoutine(in: b, from: f, to: t, store: store, auth: auth) } }
                    }
                }
            }
            .environment(\.editMode, .constant(.active))
            .scrollContentBackground(.hidden)
            .background(Theme.bg2)
            .navigationTitle("Reorder Sections & Routines")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("+ Section") { newName = ""; adding = true } }
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() }.bold() }
            }
            .alert("New section name:", isPresented: $adding) {
                TextField("Section name", text: $newName)
                Button("Add") { let n = newName; Task { await RoutineMath.addSection(n, store: store, auth: auth) } }
                Button("Cancel", role: .cancel) {}
            }
        }
        .tint(Theme.accent)
        .preferredColorScheme(.dark)
    }
}
