import SwiftUI

/// #page-metrics: the hideable, reorderable cards (metricsOrdered): Overview, Body Weight, Muscle
/// Map, Workout Summary, Lifetime Stats, Monthly Recaps, Achievements. Numbers come from
/// MetricsMath (parity-checked against the PWA's own functions, Tests/parity/metrics-run.sh).
struct MetricsView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var catalog: ExerciseCatalog
    @EnvironmentObject private var friends: FriendsStore
    @EnvironmentObject private var session: WorkoutSession
    @State private var showOrder = false
    @State private var recap: MetricsMath.Recap?
    @State private var showScoring = false
    @State private var showAch = false
    @State private var devBadge: Badge?

    var body: some View {
        let raw = store.backup.raw
        let m = MetricsMath(raw: raw, lib: ExLib(db: catalog.db, raw: raw))
        let sraw = raw["jk_settings"]?.object ?? [:]
        let hidden = MetricsMath.hiddenCards(sraw)
        let cards = MetricsMath.orderedCards(sraw).filter { !hidden.contains($0) }
        NavigationStack {
          ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    PageHeader(title: "Metrics") {
                        Button("Reorder") { showOrder = true }.font(Theme.body(14, .semibold))
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .overlay(Capsule().stroke(Theme.border2, lineWidth: 1))
                    }
                    ForEach(cards, id: \.self) { id in
                        VStack(alignment: .leading, spacing: 0) {
                            HStack(alignment: .top) {
                                BlockTitle(text: MetricsMath.cardTitles[id] ?? id)
                                Button { Task { await Self.toggleCard(id, store: store, auth: auth) } } label: {
                                    Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.text2)
                                        .frame(width: 26, height: 26).background(Theme.bg3, in: RoundedRectangle(cornerRadius: 8))
                                }
                                .buttonStyle(.plain).accessibilityLabel("Hide card")
                            }
                            cardBody(id, m)
                        }
                        .padding(16).card().id(id)
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 30)
            }
            .task {
                #if DEBUG
                if let o = DevHooks.open, o.hasPrefix("card:") {
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                    proxy.scrollTo(String(o.dropFirst(5)), anchor: .top)
                }
                #endif
            }
          }
            .background(Theme.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
        .sheet(isPresented: $showOrder) { CardOrderSheet() }
        .sheet(item: $recap) { RecapSheet(r: $0, settings: store.backup.settings) }
        .sheet(isPresented: $showScoring) { MuscleScoringSheet(sex: m.sex) }
        .sheet(isPresented: $showAch) { AchievementsSheet(result: m.computeBadges(), m: m, openBadge: devBadge, onStart: badgeStart) }
        .task(id: "\(store.loadedCode ?? "")|\(catalog.db.count)|\(store.backup.history.count)") {
            guard store.loadedCode != nil, store.lastSynced != nil else { return }
            let (st, au, db) = (store, auth, catalog.db)
            Task { await Self.saveMonthBadges(store: st, auth: au, db: db) }
        }
        .task(id: store.loadedCode) {
            #if DEBUG
            guard store.loadedCode != nil, !Self.devRan else { return }
            Self.devRan = true
            for _ in 0..<40 where store.lastSynced == nil { try? await Task.sleep(nanoseconds: 250_000_000) }   // like a real tap: after the first sync
            if let o = DevHooks.open, o.hasPrefix("recap:") {
                let p = o.dropFirst(6).split(separator: "-").compactMap { Int($0) }
                let fresh = MetricsMath(raw: store.backup.raw, lib: ExLib(db: catalog.db, raw: store.backup.raw))
                if p.count == 2 { recap = fresh.recapData(p[0], p[1] - 1) }
            }
            if let o = DevHooks.open, o == "ach" || o.hasPrefix("badge:") {
                for _ in 0..<40 where catalog.db.isEmpty { try? await Task.sleep(nanoseconds: 250_000_000) }
                let fresh = MetricsMath(raw: store.backup.raw, lib: ExLib(db: catalog.db, raw: store.backup.raw))
                devBadge = o.hasPrefix("badge:") ? fresh.computeBadges().list.first { $0.name == String(o.dropFirst(6)) } : nil
                showAch = true
            }
            // Unstructured, like the buttons: a view's own .task is cancelled with the view, and its write with it.
            let (st, au) = (store, auth)
            if let kg = DevHooks.logWeight { Task { DevHooks.log("dev weight logged=\(await Self.logWeight(kg, store: st, auth: au))") } }
            if let id = DevHooks.hideCard { Task { DevHooks.log("dev card toggled=\(await Self.toggleCard(id, store: st, auth: au))") } }
            #endif
        }
    }

    @ViewBuilder private func cardBody(_ id: String, _ m: MetricsMath) -> some View {
        let s = store.backup.settings
        switch id {
        case "overview":
            let o = m.overview()
            HStack(spacing: 8) { StatTile(v: "\(o.thisMonth)", l: "This Month"); StatTile(v: "\(o.allTime)", l: "All Time"); StatTile(v: "\(o.prs)", l: "PRs Set") }
        case "weight": WeightCard(m: m)
        case "body": MuscleMapCard(m: m) { showScoring = true }
        case "summary":
            if let x = m.summary() {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible())], spacing: 8) {
                    StatTile(v: "\(x.last7)", l: "Sessions / 7d", size: 22); StatTile(v: "\(x.last30)", l: "Sessions / 30d", size: 22)
                    StatTile(v: HomeMath.fmtV(s.display(x.avgVol)), l: "Avg \(s.unitLabel)/session", size: 22); StatTile(v: "\(x.prs)", l: "Total PRs", size: 22)
                }
                if x.last7 < 3 {
                    Insight(icon: "exclamationmark.triangle", color: Theme.orange, text: Text("Only \(x.last7) session\(x.last7 != 1 ? "s" : "") in 7 days \u{2014} aim for 3\u{2013}5."))
                } else {
                    Insight(icon: "checkmark.circle", color: Theme.green, text: Text("\(x.last7) sessions this week \u{2014} great consistency!"))
                }
                if let g = x.leastTrained {
                    Insight(icon: "target", color: Theme.blue,
                            text: Text("Least-trained group: ") + Text(MetricsMath.MGNAME[g] ?? g).bold() + Text(" \u{2014} consider a dedicated session."))
                }
            } else {
                Text("Log workouts to see a summary.").font(Theme.body(13)).foregroundStyle(Theme.muted)
            }
        case "lifetime":
            let l = m.lifetime()
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible())], spacing: 8) {
                StatTile(v: "\(l.workouts)", l: "Workouts"); StatTile(v: HomeMath.fmtV(s.display(l.volume)), l: "\(s.unitLabel) Lifted")
                StatTile(v: "\(l.sets)", l: "Total Sets"); StatTile(v: "\(l.avgMin)", l: "Avg min/session")
            }
            if let t = l.top {
                HStack(spacing: 10) {
                    Image(systemName: "trophy.fill").font(.system(size: 22)).foregroundStyle(Color(hex: 0xFFD700))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("TOP PR").font(Theme.body(11, .semibold)).tracking(0.5).foregroundStyle(Theme.muted)
                        Text(t.name).font(Theme.body(14, .semibold)).foregroundStyle(Theme.text)
                        Text("\(Self.dW(t.weight, s))\(s.unitLabel) \u{00D7} \(WorkoutMath.n(t.reps)) reps").font(Theme.heading(22, .extraBold)).foregroundStyle(Theme.accent)
                    }
                    Spacer()
                }
                .padding(12).background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius)).padding(.top, 8)
            }
        case "recaps":
            let rows = m.recaps()
            // recapData's crown (cardRecaps): last month's row only, when you topped last month's weight on your board.
            let now = Calendar.current.dateComponents([.year, .month], from: Date())
            let you = m.yourStats(code: auth.session?.code ?? "", badges: m.computeBadges().list)
            let crowned = m.crownCodes([you] + friends.friends.filter { !$0.pending }).contains(you.code)
            if rows.isEmpty {
                Text("Your first recap shows up after your first full month of workouts.").font(Theme.body(13)).foregroundStyle(Theme.muted)
            }
            ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                Button { recap = r } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "calendar.badge.checkmark").font(.system(size: 20)).foregroundStyle(Theme.accent)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 5) {
                                Text("\(r.label) \(String(r.y))").font(Theme.body(14, .bold)).foregroundStyle(Theme.text)
                                if crowned && r.y * 12 + (r.m + 1) == now.year! * 12 + now.month! - 1 {
                                    Image(systemName: "crown.fill").font(.system(size: 12)).foregroundStyle(Color(hex: 0xFFD700))
                                }
                            }
                            Text(Self.recapLine(r, s)).font(Theme.body(12)).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                    }
                    .padding(.vertical, 10).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Divider().overlay(Theme.border)
            }
        case "badges":
            BadgesCardRow(badges: m.computeBadges().list) { devBadge = nil; showAch = true }
        default: EmptyView()
        }
    }

    #if DEBUG
    @MainActor static var devRan = false
    #endif
    static func dW(_ kg: Double, _ s: Settings) -> String { WorkoutMath.n(jsRound(s.display(kg) * 10) / 10) }
    static func recapLine(_ r: MetricsMath.Recap, _ s: Settings) -> String {
        "\(r.sessions) sessions \u{00B7} \(HomeMath.fmtV(s.display(r.vol))) \(s.unitLabel) \u{00B7} \(r.prs) PRs"
    }

    /// toggleCard(id): settings.hiddenCards, through the careful save layer.
    @discardableResult
    static func toggleCard(_ id: String, store: BackupStore, auth: AuthStore) async -> Bool {
        await store.edit(auth: auth) { raw in
            var s = raw["jk_settings"]?.object ?? [:]
            var h = (s["hiddenCards"]?.array ?? []).compactMap(\.string)
            if let i = h.firstIndex(of: id) { h.remove(at: i) } else { h.append(id) }
            s["hiddenCards"] = .array(h.map(JSONValue.string)); raw["jk_settings"] = .object(s)
        }
    }

    /// badgeStart(): close the badge pages first (a workout can't open over them), then go.
    private func badgeStart(_ plan: MetricsMath.BadgePlan) {
        showAch = false
        let (session, catalog, raw) = (session, catalog, store.backup.raw)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            if plan.page != nil { NotificationCenter.default.post(name: .jackedOpenTab, object: plan.page); return }
            if session.active == nil { session.start(name: plan.title, ids: plan.ids, catalog: catalog, raw: raw); return }
            let have = Set(session.active?.exercises.map(\.exId) ?? [])
            for id in plan.ids where !have.contains(id) { session.add(catalog.byId(id, raw: raw), raw: raw) }
            session.presented = true
        }
        DevHooks.log("dev badge start: \(plan.title) \(plan.ids)")
    }

    /// logWeight(kg): current body weight AND today's jk_bwlog entry, sorted by day.
    static func logWeight(_ kg: Double, store: BackupStore, auth: AuthStore) async -> Bool {
        guard kg > 0 else { return false }
        return await store.edit(auth: auth) { raw in
            raw["jk_bw"] = .number(kg)
            var log = (raw["jk_bwlog"]?.array ?? []).compactMap(\.object)
            let today = JackedDate.dayKey(Date())
            if let i = log.firstIndex(where: { $0["d"]?.string == today }) { log[i]["kg"] = .number(kg) } else { log.append(["d": .string(today), "kg": .number(kg)]) }
            log.sort { ($0["d"]?.string ?? "") < ($1["d"]?.string ?? "") }
            raw["jk_bwlog"] = .array(log.map(JSONValue.object))
        }
    }
}

/// `.sc` / `.sv` / `.sl`: dark tile, teal condensed number, small uppercase label, left-aligned.
struct StatTile: View {
    let v: String; let l: String; var size: CGFloat = 26; var color: Color = Theme.accent
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(v).font(Theme.heading(size, .extraBold)).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.6)
            Text(l.uppercased()).font(Theme.body(10, .semibold)).tracking(0.5).foregroundStyle(Theme.muted).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(12)
        .background(Color(hex: 0x0D0D11), in: RoundedRectangle(cornerRadius: 14))
    }
}

private struct Insight: View {
    let icon: String; let color: Color; let text: Text
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).font(.system(size: 18)).foregroundStyle(color)
            text.font(Theme.body(13)).foregroundStyle(color).lineSpacing(3).frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(10).background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius)).padding(.top, 10)
    }
}

/// cardWeight(): log today's weight, current weight, the last 14 entries as a line.
private struct WeightCard: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    let m: MetricsMath
    @State private var text = ""
    @State private var msg: String?

    var body: some View {
        let s = store.backup.settings, pts = m.weightLog()
        VStack(alignment: .leading, spacing: 8) {
            Text("TODAY'S WEIGHT (\(s.unitLabel.uppercased()))").font(Theme.body(11, .semibold)).tracking(0.5).foregroundStyle(Theme.muted)
            HStack(spacing: 8) {
                TextField(m.bw > 0 ? MetricsView.dW(m.bw, s) : "175", text: $text).keyboardType(.decimalPad)
                    .padding(12).background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius)).foregroundStyle(Theme.text)
                Button("Log") {
                    let v = Double(text.replacingOccurrences(of: ",", with: ".")) ?? 0
                    guard v > 0 else { msg = "Enter your weight"; return }
                    Task {
                        let ok = await MetricsView.logWeight(s.isLb ? v / 2.20462 : v, store: store, auth: auth)
                        msg = ok ? "Weight logged" : "Saved on this phone, will sync"; text = ""
                    }
                }
                .font(Theme.body(15, .bold)).foregroundStyle(Theme.onAccent).padding(.horizontal, 20).padding(.vertical, 12)
                .background(Theme.accent, in: RoundedRectangle(cornerRadius: Theme.radius))
            }
            if let msg { Text(msg).font(Theme.body(12)).foregroundStyle(Theme.accent) }
            if m.bw > 0 {
                (Text("Current: ") + Text("\(MetricsView.dW(m.bw, s)) \(s.unitLabel)").bold().foregroundColor(Theme.text) + Text(" \u{00B7} synced with Profile"))
                    .font(Theme.body(12)).foregroundStyle(Theme.muted)
            }
            if pts.count >= 2 {
                let vals = pts.map { s.display($0.kg) }
                let mn = vals.min()!, mx = vals.max()!, rng = (mx - mn) == 0 ? 1 : mx - mn
                GeometryReader { g in
                    let W = g.size.width, H = g.size.height
                    let x: (Int) -> CGFloat = { CGFloat($0) / CGFloat(pts.count - 1) * (W - 8) + 4 }
                    let y: (Double) -> CGFloat = { H - 10 - CGFloat(($0 - mn) / rng) * (H - 20) }
                    Path { p in for (i, v) in vals.enumerated() { i == 0 ? p.move(to: CGPoint(x: x(i), y: y(v))) : p.addLine(to: CGPoint(x: x(i), y: y(v))) } }
                        .stroke(Theme.accent, lineWidth: 2)
                    ForEach(Array(vals.enumerated()), id: \.offset) { i, v in
                        Circle().fill(Theme.accent).frame(width: 5.2, height: 5.2).position(x: x(i), y: y(v))
                    }
                }
                .frame(height: 100).padding(.vertical, 6)
                HStack {
                    Text("\(JackedDate.short(JackedDate.parse(pts.first!.d))) \u{00B7} \(MetricsView.dW(pts.first!.kg, s))\(s.unitLabel)")
                    Spacer()
                    Text("\(JackedDate.short(JackedDate.parse(pts.last!.d))) \u{00B7} \(MetricsView.dW(pts.last!.kg, s))\(s.unitLabel)")
                }
                .font(Theme.body(9)).foregroundStyle(Theme.muted)
            } else {
                Text("Log your weight on a few days to see the trend.").font(Theme.body(13)).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// cardBody(): the front/back body figure, tier key + every group ranked by musclePerf().
struct MuscleMapCard: View {
    let m: MetricsMath
    let info: () -> Void
    static let TIER_COL: [String: Color] = ["Untrained": Color(hex: 0x6B6B7A), "Needs Work": Color(hex: 0xFF5D6C), "Building": Color(hex: 0x3DDC97),
                                            "Strong": Color(hex: 0x4DA3FF), "Elite": Color(hex: 0xFFD24D)]

    var body: some View {
        let r = m.ranking(), has = !m.hist.isEmpty
        VStack(alignment: .leading, spacing: 0) {
            if !has {
                Text("Log or import workouts to map your training.").font(Theme.body(13)).foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity).padding(.vertical, 20)
            } else {
                BodyFigure(score: Dictionary(r.rows.map { ($0.group, $0.score) }, uniquingKeysWith: { a, _ in a }), female: m.sex == "female")
                HStack(spacing: 10) {
                    ForEach(["Needs Work", "Building", "Strong", "Elite"], id: \.self) { n in
                        HStack(spacing: 4) { Circle().fill(Self.TIER_COL[n]!).frame(width: 8, height: 8); Text(n) }
                    }
                }
                .font(Theme.body(10)).foregroundStyle(Theme.muted).padding(.top, 8)
            }
            HStack(spacing: 10) {
                Text(r.mode == "strength" ? "Estimated strength vs. your body weight, per muscle group"
                     : "Completed sets per muscle group \u{2014} log your body weight in Profile for strength-based rankings")
                    .font(Theme.body(12)).foregroundStyle(Theme.muted)
                Spacer(minLength: 0)
                if r.mode == "strength" {
                    Button(action: info) { Image(systemName: "info.circle").font(.system(size: 16)).foregroundStyle(Theme.text2) }
                        .buttonStyle(.plain).accessibilityLabel("How the muscle rankings are scored")
                }
            }
            .padding(.top, 14).padding(.bottom, 10)
            ForEach(Array(r.rows.enumerated()), id: \.offset) { i, row in
                let label = MetricsMath.strengthLabel(row.score), col = Self.TIER_COL[label]!
                HStack(spacing: 10) {
                    Text("#\(i + 1)").font(Theme.heading(14, .bold)).foregroundStyle(i < 3 ? Theme.accent : Theme.muted).frame(width: 26, alignment: .leading)
                    Text(MetricsMath.MGNAME[row.group]!).font(Theme.body(13, .semibold)).foregroundStyle(Theme.text).frame(maxWidth: .infinity, alignment: .leading)
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.bg4)
                            Capsule().fill(Self.heat(row.score)).frame(width: g.size.width * CGFloat(min(1, max(0, row.score))))
                        }
                    }
                    .frame(width: 70, height: 6)
                    Text(label).font(Theme.body(11, .bold)).foregroundStyle(col).frame(width: 78)
                        .padding(.vertical, 4).background(col.opacity(0.14), in: Capsule())
                }
                .padding(.vertical, 7)
            }
        }
    }

    /// heatColor(p): the tier colour for a 0..1 score.
    static func heat(_ p: Double) -> Color { TIER_COL[MetricsMath.strengthLabel(p)]! }
}

/// muscleMapInfo(): how the rankings are scored.
private struct MuscleScoringSheet: View {
    let sex: String
    static let LIFT = ["chest": "Bench press", "shoulders": "Overhead press", "legs": "Squat", "back": "Barbell row", "glutes": "Hip thrust",
                       "biceps": "Barbell curl", "triceps": "Close-grip bench", "core": "Cable crunch"]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("MUSCLE MAP").font(Theme.body(11, .bold)).tracking(2.5).foregroundStyle(Color(hex: 0x4DA3FF))
                Text("How it's scored").font(Theme.heading(30, .extraBold)).foregroundStyle(Theme.text)
                Text("How strong each muscle group is for your size, measured against real lifters.").font(Theme.body(14)).foregroundStyle(Theme.text2)
                section("What it measures", "Your heaviest lift for each muscle group, divided by your body weight. Benching 1.25 times your body weight scores the same whether you weigh 150 lb or 220 lb. You never have to test a true max: it's estimated from the weight and reps you logged.")
                section("Your best, not your average", "Each group looks at your best few exercises for that muscle (your top 3, using the best set of each), not every set you've done. Warm-ups and light days never drag it down. Triceps and core use your single strongest exercise, and a big compound lift also gives credit to the other muscles it works.")
                section("Last 90 days only", "Only workouts from the last 90 days count. Stop training a group and its rank slides back down; train it again and it comes back.")
                section("Adjusted for you", "Men and women have separate standards, and the targets get easier for lifters under 18 and 40 or older. Set your sex, birthday and body weight in Profile to get yours.")
                section("Where the numbers come from", "The cutoffs are the published strength standards from Strength Level (strengthlevel.com), built from millions of lifts logged by real lifters.")
                Text("Strong starts at (\(sex == "female" ? "women" : "men")'s standard)").font(Theme.body(14, .bold)).foregroundStyle(Theme.text).padding(.top, 6)
                ForEach(MetricsMath.MGROUPS, id: \.self) { g in
                    HStack {
                        Text(MetricsMath.MGNAME[g]!).font(Theme.body(14, .bold))
                        Text(Self.LIFT[g] ?? "").font(Theme.body(13)).foregroundStyle(Theme.muted)
                        Spacer()
                        Text(WorkoutMath.n(MetricsMath.STRENGTH_STD[g]![sex]![2]) + "\u{00D7}").font(Theme.body(14, .heavy))
                    }
                    .foregroundStyle(Theme.text).padding(.vertical, 6)
                    Divider().overlay(Theme.border)
                }
            }
            .padding(20)
        }
        .background(Theme.bg2.ignoresSafeArea())
        .presentationDragIndicator(.visible)
    }
    private func section(_ h: String, _ b: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(h).font(Theme.body(14, .bold)).foregroundStyle(Theme.text)
            Text(b).font(Theme.body(13)).foregroundStyle(Theme.text2).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 6)
    }
}

/// #cardOrderModal: drag to reorder the visible sections; hidden ones come back from here.
private struct CardOrderSheet: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @Environment(\.dismiss) private var dismiss
    @State private var ids: [String] = []

    var body: some View {
        let sraw = store.backup.raw["jk_settings"]?.object ?? [:]
        let hidden = MetricsMath.orderedCards(sraw).filter { MetricsMath.hiddenCards(sraw).contains($0) }
        NavigationStack {
            List {
                Section {
                    ForEach(ids, id: \.self) { Text(MetricsMath.cardTitles[$0] ?? $0).font(Theme.body(14, .semibold)) }
                        .onMove { ids.move(fromOffsets: $0, toOffset: $1); save() }
                        .listRowBackground(Theme.bg3)
                }
                if !hidden.isEmpty {
                    Section("Hidden sections") {
                        ForEach(hidden, id: \.self) { id in
                            Button("+ " + (MetricsMath.cardTitles[id] ?? id)) {
                                Task { await MetricsView.toggleCard(id, store: store, auth: auth); reload() }
                            }
                            .foregroundStyle(Theme.accent)
                        }
                        .listRowBackground(Theme.bg3)
                    }
                }
            }
            .environment(\.editMode, .constant(.active))
            .scrollContentBackground(.hidden).background(Theme.bg2)
            .navigationTitle("Reorder Sections").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .onAppear(perform: reload)
    }
    private func reload() {
        let sraw = store.backup.raw["jk_settings"]?.object ?? [:]
        let h = MetricsMath.hiddenCards(sraw)
        ids = MetricsMath.orderedCards(sraw).filter { !h.contains($0) }
    }
    /// cardDragEnd: the visible order first, then any older saved ids not in it.
    private func save() {
        let order = ids
        Task {
            await store.edit(auth: auth) { raw in
                var s = raw["jk_settings"]?.object ?? [:]
                let old = (s["cardOrder"]?.array ?? []).compactMap(\.string).filter { !order.contains($0) }
                s["cardOrder"] = .array((order + old).map(JSONValue.string)); raw["jk_settings"] = .object(s)
            }
        }
    }
}

/// openRecap(y, m): one month's tiles, best lift, best week and challenge / comeback chips.
struct RecapSheet: View {
    static let md: DateFormatter = { let f = DateFormatter(); f.locale = Locale(identifier: "en_US"); f.dateFormat = "MMM d"; return f }()
    let r: MetricsMath.Recap
    let settings: Settings
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var catalog: ExerciseCatalog
    @EnvironmentObject private var friends: FriendsStore
    static let tierShort = ["Bench-Maxing": "Bench", "Shoulder-Maxing": "Shoulder", "Leg-Maxing": "Leg", "Pull-up-Maxing": "Pull-up",
                            "Push-up-Maxing": "Push-up", "Cardio-Maxing": "Cardio"]

    var body: some View {
        let s = settings
        let raw = store.backup.raw, m = MetricsMath(raw: raw, lib: ExLib(db: catalog.db, raw: raw))
        let badges = m.computeBadges().list
        let tiered = badges.filter(\.tiered)
        // recapData's crown: only on last month's recap, when you topped last month's weight on your board.
        let now = Calendar.current.dateComponents([.year, .month], from: Date())
        let isPrev = r.y * 12 + (r.m + 1) == now.year! * 12 + now.month! - 1
        let you = m.yourStats(code: auth.session?.code ?? "", badges: badges)
        let crown = isPrev && m.crownCodes([you] + friends.friends.filter { !$0.pending }).contains(you.code)
        ScrollView {
            content(crown: crown, tiered: tiered).padding(20)
            // shareRecap: the recap as a picture plus a one-line caption, through the share sheet.
            if let img = ImageRenderer(content: content(crown: crown, tiered: tiered).padding(24).frame(width: 400).background(Theme.bg)
                                        .environment(\.colorScheme, .dark)).uiImage.map(Image.init(uiImage:)) {
                ShareLink(item: img, message: Text(shareText), preview: SharePreview("\(r.label) recap", image: img)) {
                    Text("Share").font(Theme.body(15, .semibold)).foregroundStyle(Theme.bg).frame(maxWidth: 220).padding(.vertical, 12)
                        .background(Color(hex: 0xEDEDED), in: RoundedRectangle(cornerRadius: 12))
                }
                .padding(.bottom, 24)
            }
        }
        .background(Theme.bg2.ignoresSafeArea())
        .presentationDragIndicator(.visible)
    }

    /// shareRecap's caption.
    private var shareText: String {
        let s = settings
        var t = "My \(r.label) on Jacked: \(r.sessions) sessions, \(HomeMath.fmtV(s.display(r.vol))) \(s.unitLabel) lifted, \(r.prs) PRs."
        if let b = r.best { t += " Best lift: \(b.name) \(MetricsView.dW(b.w, s)) \(s.unitLabel) x \(WorkoutMath.n(b.r))." }
        return t
    }

    private func content(crown: Bool, tiered: [Badge]) -> some View {
        let s = settings
        return VStack(alignment: .leading, spacing: 10) {
                VStack(spacing: 2) {
                    Text("MONTHLY RECAP").font(Theme.body(11, .bold)).tracking(2.5).foregroundStyle(Theme.accent)
                    Text("\(r.label) \(String(r.y))").font(Theme.heading(30, .extraBold)).foregroundStyle(Theme.text)
                }
                .frame(maxWidth: .infinity)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible())], spacing: 8) {
                    StatTile(v: "\(r.sessions)", l: "Sessions", color: Theme.text); StatTile(v: "\(HomeMath.fmtV(s.display(r.vol))) \(s.unitLabel)", l: "Weight lifted", color: Theme.text)
                    StatTile(v: "\(r.prs)", l: "PRs", color: Theme.text); StatTile(v: "\(r.days)", l: "Days trained", color: Theme.text)
                }
                if let b = r.best {
                    row("trophy.fill", Color(hex: 0xFFD700), "Best lift", "\(b.name) \u{2014} \(MetricsView.dW(b.w, s)) \(s.unitLabel) \u{00D7} \(WorkoutMath.n(b.r))")
                }
                if let w = r.bestWeek {
                    row("calendar", Theme.accent, "Best week", "Week of \(Self.md.string(from: w.start)) \u{2014} \(HomeMath.fmtV(s.display(w.vol))) \(s.unitLabel) in \(w.n) session\(w.n != 1 ? "s" : "")")
                }
                let chips: [(String, String)] = [crown ? ("crown.fill", "Leaderboard crown") : nil,
                    r.challenge.flatMap { $0.done ? ("dumbbell.fill", "Challenge: " + (MetricsMath.MGNAME[$0.group] ?? $0.group)) : nil },
                    r.comeback ? ("arrow.up.circle.fill", "Comeback") : nil].compactMap { $0 }
                if !chips.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(chips, id: \.1) { c in
                            HStack(spacing: 5) { Image(systemName: c.0).font(.system(size: 12)); Text(c.1.uppercased()).font(Theme.body(11, .heavy)).tracking(0.5) }
                                .foregroundStyle(Color(hex: 0xFFD700)).padding(.horizontal, 10).padding(.vertical, 4)
                                .background(Color(hex: 0xFFD700).opacity(0.08), in: Capsule())
                                .overlay(Capsule().stroke(Color(hex: 0xFFD700).opacity(0.4), lineWidth: 1))
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                // .rc-grid: the tiered badges as they stand now, three across.
                Text("TIERED BADGES").font(Theme.heading(13, .extraBold)).tracking(1.5).foregroundStyle(Theme.muted).padding(.top, 6)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    ForEach(tiered) { b in
                        let tc = b.tier.flatMap { BadgeUI.tierColor[$0] }
                        VStack(spacing: 2) {
                            // The recap colours every tiered badge's icon (uic(b.icon, b.color)), earned or not.
                            Image(systemName: BadgeUI.symbols[b.icon] ?? "rosette").font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(BadgeUI.color(b.color)).frame(width: 22, height: 22)
                            Text(Self.tierShort[b.name] ?? b.name).font(Theme.body(13, .heavy)).foregroundStyle(Theme.text).lineLimit(1).padding(.top, 2)
                            Text((b.tier ?? "\u{2014}").uppercased()).font(Theme.body(10, .heavy)).tracking(0.8).foregroundStyle(tc ?? Theme.muted)
                            Text(b.curV ?? " ").font(Theme.body(11)).foregroundStyle(Theme.muted).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 8).padding(.horizontal, 4)
                        .background(Theme.bg3, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(tc.map { $0.opacity(0.4) } ?? Theme.border2, lineWidth: 1))
                    }
                }
            }
    }
    private func row(_ icon: String, _ c: Color, _ t: String, _ sub: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 20)).foregroundStyle(c)
            VStack(alignment: .leading, spacing: 1) {
                Text(t).font(Theme.body(13, .bold)).foregroundStyle(Theme.text)
                Text(sub).font(Theme.body(12)).foregroundStyle(Theme.muted).lineLimit(1)
            }
            Spacer()
        }
        .padding(12).background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
    }
}

extension MetricsMath.Recap: Identifiable { var id: String { "\(y)-\(m)" } }

/// #recapCard on Home: the month just ended, shown on the 1st to the 7th until dismissed
/// (recapMonthToShow); tap opens the full recap.
struct HomeRecapCard: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @State private var open: MetricsMath.Recap?

    var body: some View {
        let raw = store.backup.raw, s = store.backup.settings
        let cal = Calendar.current, now = Date()
        let p = cal.date(byAdding: .month, value: -1, to: cal.date(from: cal.dateComponents([.year, .month], from: now))!)!
        let pc = cal.dateComponents([.year, .month], from: p)
        let key = String(format: "%d-%02d", pc.year!, pc.month!)
        let show = cal.component(.day, from: now) <= 7 && raw["jk_recapDismissed"]?.string != key
        if show, let d = MetricsMath(raw: raw, lib: ExLib(db: [], raw: raw)).recapData(pc.year!, pc.month! - 1) {
            HStack(spacing: 11) {
                Image(systemName: "calendar.badge.checkmark").font(.system(size: 24)).foregroundStyle(Theme.accent)
                VStack(alignment: .leading, spacing: 5) {
                    Text("\(d.label) recap".uppercased()).font(Theme.heading(21.6, .extraBold)).tracking(0.6).foregroundStyle(Theme.text)
                    Text(MetricsView.recapLine(d, s).uppercased()).font(Theme.body(10, .semibold)).tracking(0.5).foregroundStyle(Theme.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                Button {
                    Task { await store.edit(auth: auth) { $0["jk_recapDismissed"] = .string(key) } }
                } label: {
                    Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.text2)
                        .frame(width: 26, height: 26).background(Theme.bg3, in: Circle())
                }
                .buttonStyle(.plain).accessibilityLabel("Dismiss")
            }
            .padding(16).card().contentShape(Rectangle())
            .onTapGesture { open = d }
            .padding(.bottom, 20)
            .sheet(item: $open) { RecapSheet(r: $0, settings: s) }
        }
    }
}

extension Notification.Name {
    /// Asks MainTabView to switch tabs (object: the tab's raw value), e.g. Variety-Maxing's Browse the library.
    static let jackedOpenTab = Notification.Name("jackedOpenTab")
}
