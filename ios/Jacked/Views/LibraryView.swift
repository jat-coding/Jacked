import SwiftUI

/// #page-exercises: search, the body-map muscle chips, and the exercise list (favourites first,
/// then what you've used, then the rest), each row with its PR. Tap a row for #exInfoModal.
struct LibraryView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var catalog: ExerciseCatalog
    @State private var q = ""
    @State private var chip: String?
    @State private var info: CatalogExercise?
    @State private var showCreate = false

    var body: some View {
        let raw = store.backup.raw
        let all = catalog.all(custom: raw)
        let shown = LibraryMath.list(all, raw: raw, query: q, chip: chip)
        let fav = Set((raw["jk_favEx"]?.array ?? []).compactMap(\.string))
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    PageHeader(title: "Library") {
                        Button("+ Custom") { showCreate = true }.font(Theme.body(14, .semibold))
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .overlay(Capsule().stroke(Theme.border2, lineWidth: 1))
                    }
                    SearchBox(text: $q).padding(.bottom, 10)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(LibraryMath.chipCats, id: \.0) { c in
                                let on = chip == c.0
                                Button { chip = on ? nil : c.0 } label: {
                                    Text(c.1).font(Theme.body(12, .semibold))
                                        .foregroundStyle(on ? Theme.onAccent : Theme.text2)
                                        .padding(.horizontal, 12).padding(.vertical, 7)
                                        .background(on ? Theme.accent : Theme.bg3, in: Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.bottom, 16)
                    HStack {
                        BlockTitle(text: "Exercises")
                        if all.count <= PWATables.builtIns.count { ProgressView().tint(Theme.accent).padding(.bottom, 12) }
                    }
                    if shown.isEmpty {
                        Text("No results").font(Theme.heading(20, .bold)).foregroundStyle(Theme.muted)
                            .frame(maxWidth: .infinity).padding(.vertical, 30)
                    }
                    ForEach(shown) { e in
                        Button { info = e } label: { LibraryRow(e: e, fav: fav.contains(e.id)) }.buttonStyle(.plain)
                        Divider().overlay(Theme.border)
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 30)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
        .sheet(item: $info) { ExerciseInfoSheet(ex: $0) }
        .sheet(isPresented: $showCreate) { CreateExerciseSheet() }
        .task { await catalog.load() }
        .task {
            #if DEBUG
            if let o = DevHooks.open, o.hasPrefix("ex:") {
                await catalog.load()
                info = catalog.byId(String(o.dropFirst(3)), raw: store.backup.raw)
            }
            if let s = DevHooks.search { q = s }
            if let n = DevHooks.createEx {
                let id = await CreateExerciseSheet.create(name: n, muscle: "Biceps", category: "strength", equip: "cable",
                                                          tracking: "weight_reps", notes: "", store: store, auth: auth)
                DevHooks.log("dev custom exercise \(id)")
            }
            if let id = DevHooks.fav {
                await catalog.load()
                await ExerciseInfoSheet.toggleFav(id, store: store, auth: auth)
                DevHooks.log("dev fav toggled \(id)")
            }
            #endif
        }
    }
}

struct SearchBox: View {
    @Binding var text: String
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(Theme.muted)
            TextField("Search exercises", text: $text).font(Theme.body(15)).foregroundStyle(Theme.text)
                .autocorrectionDisabled().textInputAutocapitalization(.never)
            if !text.isEmpty {
                Button { text = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted) }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
    }
}

/// One `.eli` row: photo, name (★ when a favourite), muscle · equipment · category · tracking, and the PR.
struct LibraryRow: View {
    @EnvironmentObject private var store: BackupStore
    let e: CatalogExercise
    let fav: Bool

    var body: some View {
        HStack(spacing: 10) {
            LogThumb(url: e.image.map { URL(string: ExerciseImages.base + $0) } ?? nil, muscle: e.muscle)
            VStack(alignment: .leading, spacing: 2) {
                (Text(fav ? "★ " : "").foregroundColor(Color(hex: 0xFFD700)) + Text(e.name))
                    .font(Theme.body(13, .semibold)).foregroundStyle(Theme.text).lineLimit(2)
                Text(meta).font(Theme.body(11)).foregroundStyle(Theme.muted).lineLimit(1)
            }
            Spacer(minLength: 6)
            pr
        }
        .padding(.vertical, 9)
        .contentShape(Rectangle())
    }

    private var meta: String {
        let track = ["weight_reps": "Weight+Reps", "bodyweight_reps": "BW+Reps", "duration": "Duration",
                     "distance": "Distance", "reps_only": "Reps"][e.tracking] ?? ""
        return [e.muscle, e.equip, e.category].filter { !$0.isEmpty }.map(LibraryMath.capW).joined(separator: " · ")
            + (track.isEmpty ? "" : " · " + track)
    }

    @ViewBuilder private var pr: some View {
        let raw = store.backup.raw, settings = store.backup.settings
        if e.tracking == "distance" {
            if let c = raw["jk_cardioPR"]?[e.id]?.object, jsNum(c["dist"]) > 0, jsNum(c["time"]) > 0 {
                prBox(WorkoutMath.fmtPace(WorkoutMath.pacePerMile(jsNum(c["dist"]), jsNum(c["time"]))), "pace PR")
            }
        } else if e.tracking == "duration" {
            if let h = raw["jk_holdPR"]?[e.id]?.object { prBox(WorkoutMath.fmtHold(jsNum(h["sec"])), "hold PR") }
        } else if let p = raw["jk_prs"]?[e.id]?.object {
            let sug = raw["jk_prSug"]?[e.id]?.object
            VStack(alignment: .trailing, spacing: 0) {
                Text("\(WorkoutMath.n((settings.display(jsNum(p["weight"])) * 10).rounded() / 10))\(settings.unitLabel)")
                    .font(Theme.heading(15, .bold)).foregroundStyle(Theme.accent)
                Text("\(WorkoutMath.n(jsNum(p["reps"])))r PR").font(Theme.body(9)).foregroundStyle(Theme.muted)
                if let sug, WorkoutMath.prE1rm(sug) > jsNum(p["weight"]) + WorkoutMath.sugEps {
                    Text("\(WorkoutMath.n((settings.display(WorkoutMath.prE1rm(sug)) * 10).rounded() / 10))\(settings.unitLabel) suggested")
                        .font(Theme.body(9, .semibold)).foregroundStyle(Color(hex: 0xD9B84A))
                }
            }
        }
    }

    private func prBox(_ v: String, _ l: String) -> some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text(v).font(Theme.heading(15, .bold)).foregroundStyle(Theme.accent)
            Text(l).font(Theme.body(9)).foregroundStyle(Theme.muted)
        }
    }
}

/// #exInfoModal: photos, muscle/equipment, Favorite, the suggested PR, recent top weights, how-to.
/// "Hide from Library" (built-ins) sits behind the 3-dot, like the PWA. Saves go through merge + CAS.
struct ExerciseInfoSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    let ex: CatalogExercise
    @State private var confirmHide = false
    @State private var resetText: String?
    @State private var toast: String?

    var body: some View {
        let raw = store.backup.raw, settings = store.backup.settings
        let fav = (raw["jk_favEx"]?.array ?? []).contains(.string(ex.id))
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    photos
                    Text([ex.muscle, ex.equip, ex.category].filter { !$0.isEmpty }.map(LibraryMath.capW).joined(separator: " · "))
                        .font(Theme.body(12)).foregroundStyle(Theme.muted)
                    Button { Task { await toggleFav() } } label: {
                        Text(fav ? "★ Favorited" : "☆ Favorite").font(Theme.body(13, .semibold)).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(GhostButtonStyle())
                    sugBlock(raw: raw, settings: settings)
                    if let txt = Self.storedPRText(ex.id, raw: raw, settings: settings) {
                        Button { resetText = txt } label: { Text("Reset PR (\(txt))").font(Theme.body(13, .semibold)).frame(maxWidth: .infinity) }
                            .buttonStyle(GhostButtonStyle())
                    }
                    chart(raw: raw, settings: settings)
                    if ex.instructions.isEmpty {
                        Text("No instructions available.").font(Theme.body(13)).foregroundStyle(Theme.muted).padding(.top, 6)
                    } else {
                        BlockTitle(text: "How to perform").padding(.top, 6)
                        ForEach(Array(ex.instructions.enumerated()), id: \.offset) { i, s in
                            HStack(alignment: .top, spacing: 8) {
                                Text("\(i + 1).").font(Theme.body(13, .semibold)).foregroundStyle(Theme.text2)
                                Text(s).font(Theme.body(13)).foregroundStyle(Theme.text2).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
                .padding(16)
            }
            .background(Theme.bg2.ignoresSafeArea())
            .navigationTitle(ex.name).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                if !ex.custom {
                    ToolbarItem(placement: .primaryAction) {
                        Menu {
                            Button("Hide from Library", role: .destructive) { confirmHide = true }
                        } label: { Image(systemName: "ellipsis") }
                    }
                }
            }
            .alert("Reset PR", isPresented: Binding(get: { resetText != nil }, set: { if !$0 { resetText = nil } })) {
                Button("Reset PR", role: .destructive) { Task { await Self.resetPR(ex.id, store: store, auth: auth); toast = "PR reset" } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Reset your PR for \(ex.name) (\(resetText ?? ""))? The next set you log becomes your new PR, whatever the weight. Your logged sets and workouts stay as they are. This can't be undone.")
            }
            .overlay(alignment: .top) { ToastView(text: $toast) }
            .task {
                #if DEBUG
                if DevHooks.resetPR == ex.id {
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                    await Self.resetPR(ex.id, store: store, auth: auth); toast = "PR reset"
                    DevHooks.log("dev reset PR \(ex.id)")
                }
                #endif
            }
            .confirmationDialog("Hide this exercise from your library? Built-in exercises can't be deleted, but this removes it from all lists.",
                                isPresented: $confirmHide, titleVisibility: .visible) {
                Button("Hide", role: .destructive) { Task { await hide(); dismiss() } }
            }
        }
    }

    @ViewBuilder private var photos: some View {
        let urls = ex.images.prefix(2).compactMap { URL(string: ExerciseImages.base + $0) }
        if urls.isEmpty {
            ZStack { Theme.bg3; Image(systemName: "dumbbell").font(.system(size: 50)).foregroundStyle(Theme.muted) }
                .frame(height: 120).clipShape(RoundedRectangle(cornerRadius: 12))
        } else {
            HStack(spacing: 8) {
                ForEach(urls, id: \.self) { u in
                    Color.clear.aspectRatio(1, contentMode: .fit)
                        .overlay { AsyncImage(url: u) { $0.resizable().scaledToFill() } placeholder: { Theme.bg4 } }
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    @ViewBuilder private func sugBlock(raw: [String: JSONValue], settings: Settings) -> some View {
        let g = raw["jk_prSug"]?[ex.id]?.object, p = raw["jk_prs"]?[ex.id]?.object
        if let g, WorkoutMath.prE1rm(g) > jsNum(p?["weight"]) + WorkoutMath.sugEps {
            let w = { (kg: Double) in "\(WorkoutMath.n((settings.display(kg) * 10).rounded() / 10))\(settings.unitLabel)" }
            let s = w(WorkoutMath.prE1rm(g))
            VStack(alignment: .leading, spacing: 3) {
                HStack { Text("Suggested PR").font(Theme.body(13, .semibold)); Spacer(); Text(s).font(Theme.heading(16, .bold)).foregroundStyle(Color(hex: 0xD9B84A)) }
                Text("Estimated from \(w(jsNum(g["weight"]))) × \(WorkoutMath.n(jsNum(g["reps"])))"
                     + (p.map { ". Your PR is \(w(jsNum($0["weight"]))) × \(WorkoutMath.n(jsNum($0["reps"])))" } ?? "")
                     + ". Lift \(s) and it becomes your PR.")
                    .font(Theme.body(11)).foregroundStyle(Theme.muted)
            }
            .padding(12).background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
        }
    }

    /// Recent top weight (or longest hold) per workout, the last 8.
    @ViewBuilder private func chart(raw: [String: JSONValue], settings: Settings) -> some View {
        let hold = ex.tracking == "duration"
        let pts: [(d: String, v: Double)] = (raw["jk_hist"]?.array ?? []).flatMap { w -> [(d: String, v: Double)] in
            (w["exercises"]?.array ?? []).compactMap { e -> (d: String, v: Double)? in
                guard e["exId"]?.string == ex.id, !hold || e["tracking"]?.string == "duration" else { return nil }
                let top = (e["sets"]?.array ?? []).reduce(0.0) { max($0, jsNum($1["weight"])) }
                return top > 0 ? (w["date"]?.string ?? "", top) : nil
            }
        }.suffix(8)
        if pts.isEmpty {
            Text("No logged sets for this exercise yet.").font(Theme.body(13)).foregroundStyle(Theme.muted).padding(.vertical, 6)
        } else {
            let mx = pts.map(\.v).max() ?? 1
            BlockTitle(text: hold ? "Recent longest hold" : "Recent top weight (\(settings.unitLabel))").padding(.top, 6)
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(Array(pts.enumerated()), id: \.offset) { _, p in
                    VStack(spacing: 3) {
                        Text(hold ? WorkoutMath.fmtHold(p.v) : WorkoutMath.n((settings.display(p.v) * 10).rounded() / 10))
                            .font(Theme.body(9)).foregroundStyle(Theme.muted)
                        UnevenRoundedRectangle(topLeadingRadius: 4, topTrailingRadius: 4).fill(Theme.accent)
                            .frame(maxWidth: 26).frame(height: max(6, 90 * p.v / mx))
                        Text(JackedDate.shortMD(p.d)).font(Theme.body(8)).foregroundStyle(Theme.muted)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 120, alignment: .bottom)
        }
    }

    /// storedPRText: the record Reset PR would clear (hold, else cardio pace, else weight x reps), nil when none.
    static func storedPRText(_ id: String, raw: [String: JSONValue], settings: Settings) -> String? {
        if let h = raw["jk_holdPR"]?[id]?.object, jsNum(h["sec"]) > 0 { return WorkoutMath.fmtHold(jsNum(h["sec"])) }
        if let c = raw["jk_cardioPR"]?[id]?.object, jsNum(c["dist"]) > 0, jsNum(c["time"]) > 0 {
            return "\(WorkoutMath.fmtPace(WorkoutMath.pacePerMile(jsNum(c["dist"]), jsNum(c["time"])))) \u{00B7} \(WorkoutMath.jsNumberString(jsNum(c["dist"]))) mi"
        }
        if let p = raw["jk_prs"]?[id]?.object, jsNum(p["weight"]) > 0 || jsNum(p["reps"]) > 0 {
            return "\(WorkoutMath.n((settings.display(jsNum(p["weight"])) * 10).rounded() / 10))\(settings.unitLabel) \u{00D7} \(WorkoutMath.jsNumberString(jsNum(p["reps"])))"
        }
        return nil
    }

    /// resetPR: stamp jk_prReset[id] = now and clear that exercise's stored records (clearPRsBefore). History and
    /// everything computed from it stay. The merge keeps the latest reset and drops any record dated before it.
    static func resetPR(_ id: String, store: BackupStore, auth: AuthStore) async {
        let at = WorkoutSession.isoNow()
        _ = await store.edit(auth: auth) { r in
            var cut = r["jk_prReset"]?.object ?? [:]; cut[id] = .string(at); r["jk_prReset"] = .object(cut)
            for k in ["jk_prs", "jk_cardioPR", "jk_holdPR", "jk_prSug"] {
                if var m = r[k]?.object, m[id] != nil { m[id] = nil; r[k] = .object(m) }
            }
        }
    }

    private func toggleFav() async { await Self.toggleFav(ex.id, store: store, auth: auth) }

    /// toggleFav: add or remove the id in jk_favEx.
    static func toggleFav(_ id: String, store: BackupStore, auth: AuthStore) async {
        _ = await store.edit(auth: auth) { raw in
            var f = (raw["jk_favEx"]?.array ?? []).compactMap(\.string)
            if let i = f.firstIndex(of: id) { f.remove(at: i) } else { f.append(id) }
            raw["jk_favEx"] = .array(f.map(JSONValue.string))
        }
    }

    private func hide() async {
        _ = await store.edit(auth: auth) { raw in
            var h = (raw["jk_hiddenEx"]?.array ?? []).compactMap(\.string)
            if !h.contains(ex.id) { h.append(ex.id) }
            raw["jk_hiddenEx"] = .array(h.map(JSONValue.string))
            raw["jk_favEx"] = .array((raw["jk_favEx"]?.array ?? []).filter { $0.string != ex.id })
            if var rn = raw["jk_exRename"]?.object, rn[ex.id] != nil { rn[ex.id] = nil; raw["jk_exRename"] = .object(rn) }
            if var ov = raw["jk_exOverride"]?.object, ov[ex.id] != nil { ov[ex.id] = nil; raw["jk_exOverride"] = .object(ov) }
        }
    }
}

/// #ceModal, create only: a custom exercise in jk_cex (id "cex<ms>"), saved through merge + CAS.
/// Photo, grip and editing an existing exercise are not on the iPhone yet.
struct CreateExerciseSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @State private var name = ""
    @State private var muscle = "Chest"
    @State private var category = "strength"
    @State private var equip = "barbell"
    @State private var bodyweight = false
    @State private var tracking = "weight_reps"
    @State private var notes = ""
    @State private var saving = false

    static let muscles = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Glutes", "Core", "Forearms", "Cardio", "Full Body"]
    static let categories = [("strength", "Strength"), ("hypertrophy", "Hypertrophy"), ("cardio", "Cardio"), ("power", "Power"), ("warmup", "Warm-up")]
    static let equips = [("barbell", "Barbell"), ("dumbbell", "Dumbbell"), ("cable", "Cable"), ("machine", "Machine"), ("bodyweight", "Bodyweight"),
                         ("kettlebell", "Kettlebell"), ("resistance_band", "Resistance Band"), ("ez_bar", "EZ Bar"), ("trap_bar", "Trap Bar"), ("other", "Other")]
    static let trackings = [("weight_reps", "Weight + Reps"), ("bodyweight_reps", "Bodyweight + Reps"), ("duration", "Duration"),
                            ("distance", "Distance + Time"), ("reps_only", "Reps only (no weight)")]

    var body: some View {
        NavigationStack {
            Form {
                Section { TextField("Exercise name", text: $name) }
                Section {
                    Picker("Muscle", selection: $muscle) { ForEach(Self.muscles, id: \.self) { Text($0) } }
                    Picker("Category", selection: $category) { ForEach(Self.categories, id: \.0) { Text($0.1).tag($0.0) } }
                    Toggle("Bodyweight exercise", isOn: $bodyweight).tint(Theme.accent)
                    if !bodyweight { Picker("Equipment", selection: $equip) { ForEach(Self.equips, id: \.0) { Text($0.1).tag($0.0) } } }
                    Picker("Tracking", selection: $tracking) { ForEach(Self.trackings, id: \.0) { Text($0.1).tag($0.0) } }
                }
                Section { TextField("Notes (optional)", text: $notes, axis: .vertical) }
            }
            .scrollContentBackground(.hidden).background(Theme.bg2)
            .navigationTitle("Create Exercise").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { Task { saving = true; await save(); dismiss() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        await Self.create(name: name, muscle: muscle, category: category, equip: bodyweight ? "body only" : equip,
                          tracking: tracking, notes: notes, store: store, auth: auth)
    }

    /// saveCE() for a new exercise: the same object shape the PWA writes.
    @discardableResult
    static func create(name: String, muscle: String, category: String, equip: String, tracking: String, notes: String,
                       store: BackupStore, auth: AuthStore) async -> String {
        let id = "cex\(Int64(Date().timeIntervalSince1970 * 1000))"
        _ = await store.edit(auth: auth) { raw in
            var c = raw["jk_cex"]?.array ?? []
            c.append(.object(["id": .string(id), "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)),
                              "muscle": .string(muscle), "equip": .string(equip), "tracking": .string(tracking),
                              "category": .string(category), "notes": .string(notes.trimmingCharacters(in: .whitespacesAndNewlines)),
                              "assist": .bool(false), "durUnit": .string("sec"), "images": .array([]), "_c": .bool(true)]))
            raw["jk_cex"] = .array(c)
        }
        return id
    }
}
