import SwiftUI

/// #fpModal (index.html openFriend / openFriendWorkout / showFriendBadges): a friend's (or your own)
/// Jacked box, stats, this month's calendar, their last 30 days of shared workouts down to every set,
/// their badges, and Remove Friend at the bottom.
struct FriendProfileSheet: View {
    let p: Person
    let m: MetricsMath
    let badges: [Badge]
    let settings: Settings
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var friends: FriendsStore
    @EnvironmentObject private var session: WorkoutSession
    @EnvironmentObject private var catalog: ExerciseCatalog
    @Environment(\.dismiss) private var dismiss
    @State private var workout: Int?
    @State private var showBadges = false
    @State private var showGymYears = false
    @State private var confirmRemove = false
    @State private var lightbox = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 12) {
                    Avatar(p: p, size: 48)
                        .onTapGesture { if URL(string: p.avatarUrl) != nil, !p.avatarUrl.isEmpty { Haptics.light(); lightbox = true } }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(p.name + (p.isYou ? " (You)" : "")).font(Theme.heading(24, .extraBold)).foregroundStyle(Theme.text).lineLimit(1)
                        Text(p.username).font(Theme.body(12)).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Button { dismiss() } label: { JIcon("close", 14).foregroundStyle(Theme.text2)
                        .frame(width: 32, height: 32).background(Theme.bg3, in: Circle()) }.buttonStyle(.plain)
                }
                .padding(.bottom, 16)
                if let i = workout, p.wd.indices.contains(i) { workoutDetail(p.wd[i]) } else { overview }
            }
            .padding(20)
        }
        .background(Theme.bg2.ignoresSafeArea())
        .sheet(isPresented: $lightbox) { AvatarLightbox(url: URL(string: p.avatarUrl)).popup() }
        .overlay(alignment: .top) { ToastView(text: $friends.toast) }
        .sheet(isPresented: $showBadges) { FriendBadgesSheet(p: p, m: m).popup() }
        .sheet(isPresented: $showGymYears) { GymYearsView(who: p.isYou ? "You" : p.name, days: Set(p.days)).popup() }
        .confirmationDialog("Remove this friend?", isPresented: $confirmRemove, titleVisibility: .visible) {
            Button("Remove", role: .destructive) { let c = p.code; dismiss(); Task { await friends.remove(c, auth: auth, store: store) } }
        }
        .task {
            #if DEBUG
            if let o = DevHooks.open, o.hasPrefix("friend:"), let r = o.split(separator: "/").dropFirst().first {
                if r == "badges" { showBadges = true } else if r == "gymyears" { showGymYears = true } else if let i = Int(r) {
                    workout = i
                    if DevHooks.copyFriend, p.wd.indices.contains(i) { try? await Task.sleep(nanoseconds: 1_500_000_000); copy(p.wd[i]) }
                }
            }
            #endif
        }
    }

    @ViewBuilder private var overview: some View {
        if p.hasJacked {
            HStack(spacing: 12) {
                JIcon("crown", 26).foregroundStyle(Color(hex: 0xFFD700)).shadow(color: Color(hex: 0xFFD700).opacity(0.6), radius: 6)
                VStack(alignment: .leading, spacing: 2) {
                    Text("JACKED").font(Theme.heading(17, .extraBold)).tracking(1).foregroundStyle(Color(hex: 0xFFD700))
                    Text("\(p.isYou ? "You hold" : "Holds") every monthly and 3-month badge, with every tiered badge earned.").font(Theme.body(12)).foregroundStyle(Theme.muted)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
            .background(LinearGradient(colors: [Color(hex: 0xFFD700).opacity(0.12), Color(hex: 0xFFD700).opacity(0.03)], startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: RoundedRectangle(cornerRadius: Theme.radius))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Color(hex: 0xFFD700).opacity(0.55), lineWidth: 1)).padding(.bottom, 12)
        }
        HStack(spacing: 8) {
            StatTile(v: WorkoutMath.n(p.workouts), l: "Workouts")
            StatTile(v: HomeMath.fmtV(settings.display(p.totalVolume)), l: "\(settings.unitLabel) Vol")
            StatTile(v: WorkoutMath.n(p.prs), l: "PRs")
        }
        .padding(.bottom, 10)
        HStack(spacing: 8) {
            StatTile(v: WorkoutMath.n(p.streak), l: "Day Streak", size: 20, color: Theme.orange)
                .overlay(alignment: .topTrailing) { SFIcon("flame.fill").foregroundStyle(Theme.orange).padding(12) }
            Button { showBadges = true } label: {
                StatTile(v: WorkoutMath.n(p.badges), l: "Badges \u{203A}", size: 20, color: Color(hex: 0xFFCA4D))
                    .overlay(alignment: .topTrailing) { SFIcon("medal.fill").foregroundStyle(Color(hex: 0xFFCA4D)).padding(12) }
            }.buttonStyle(.plain)
        }
        .padding(.bottom, 14)
        MiniCalendar(days: Set(p.days), now: m.now) { ds in
            if let i = p.wd.firstIndex(where: { dayOf($0.date) == ds }) { workout = i }
            else { friends.toast = p.wd.isEmpty && p.workouts > 0 ? "Their app needs an update to share workout details" : "Only the last 30 days of workout detail are shared" }
        }
        .padding(.bottom, 12)
        Button { showGymYears = true } label: {
            HStack(spacing: 6) {
                JIcon("calendar", 15).foregroundStyle(Theme.accent)
                Text("Gym years \u{203A}").font(Theme.body(14, .semibold)).foregroundStyle(Theme.text)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 12)
            .background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
        }
        .buttonStyle(.plain).padding(.bottom, 20)
        if !p.wd.isEmpty {
            BlockTitle(text: "Workouts \u{00B7} last 30 days")
            ForEach(Array(p.wd.enumerated()), id: \.offset) { i, w in
                Button { workout = i } label: { wRow(name: w.name, date: w.date, vol: w.vol, sets: w.sets, dist: w.dist, pace: w.pace, chevron: true) }.buttonStyle(.plain)
            }
        } else {
            BlockTitle(text: "Recent Workouts")
            if p.recent.isEmpty { Text("No recent workouts shared yet.").font(Theme.body(13)).foregroundStyle(Theme.muted) }
            ForEach(Array(p.recent.enumerated()), id: \.offset) { _, w in wRow(name: w.name, date: w.date, vol: w.vol, sets: w.sets, dist: w.dist, pace: w.pace, chevron: false) }
        }
        if !p.isYou {
            Divider().overlay(Theme.border).padding(.vertical, 18)
            Button("Remove Friend") { confirmRemove = true }
                .font(Theme.body(15, .semibold)).foregroundStyle(Theme.red).frame(maxWidth: .infinity).padding(.vertical, 13)
                .background(Theme.red.opacity(0.12), in: RoundedRectangle(cornerRadius: Theme.radius)).buttonStyle(.plain)
        }
    }

    private func dayOf(_ s: String) -> String { JackedDate.isDayKey(s) ? s : JackedDate.parse(s).map { JackedDate.dayKey($0) } ?? "" }
    private func isRun(_ vol: Double, _ dist: Double?) -> Bool { !(vol > 0) && (dist ?? 0) > 0 }
    private func dateText(_ s: String) -> String { JackedDate.short(JackedDate.parse(s)) }

    private func wRow(name: String, date: String, vol: Double, sets: Double, dist: Double?, pace: Double?, chevron: Bool) -> some View {
        let run = isRun(vol, dist)
        let metric = run ? "\(WorkoutMath.n(dist ?? 0)) mi" : "\(HomeMath.fmtV(settings.display(vol))) \(settings.unitLabel)"
        let meta = run && (pace ?? 0) > 0 ? "\(dateText(date)) \u{00B7} \(HomeMath.fmtPace(pace ?? 0))" : "\(dateText(date)) \u{00B7} \(WorkoutMath.n(sets)) sets"
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(Theme.body(14, .semibold)).foregroundStyle(Theme.text).lineLimit(1)
                Text(meta).font(Theme.body(11)).foregroundStyle(Theme.muted)
            }
            Spacer()
            Text(metric + (chevron ? " \u{203A}" : "")).font(Theme.heading(16, .bold)).foregroundStyle(Theme.text2)
        }
        .padding(.vertical, 12).overlay(alignment: .top) { Rectangle().fill(Color(hex: 0x23232B)).frame(height: 1) }.contentShape(Rectangle())
    }

    private func copy(_ w: SharedWorkout) {
        let all = catalog.all(custom: store.backup.raw)
        guard w.ex.contains(where: { e in all.contains { $0.id == e.id || (!e.n.isEmpty && $0.name.lowercased() == e.n.lowercased()) } }) else {
            friends.toast = "None of these exercises are in your library"; return
        }
        dismiss()
        let raw = store.backup.raw, s = session, c = catalog, f = friends
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 450_000_000)   // let the sheet close before the workout screen opens
            f.toast = s.start(copying: w, catalog: c, raw: raw)
            #if DEBUG
            DevHooks.log("dev copy: \(f.toast ?? "nil") active=\(s.active?.name ?? "none") ex=\(s.active?.exercises.map(\.exId) ?? []) pw=\(s.active?.exercises.first?.sets.map { $0.pw ?? -1 } ?? [])")
            #endif
        }
    }

    /// openFriendWorkout(): every exercise and every set, weights in YOUR unit.
    @ViewBuilder private func workoutDetail(_ w: SharedWorkout) -> some View {
        let run = isRun(w.vol, w.dist)
        Button("\u{2039} Back") { workout = nil }.buttonStyle(HeaderPillStyle())
        Text(w.name).font(Theme.heading(22, .extraBold)).foregroundStyle(Theme.text).padding(.top, 14)
        Text(dateText(w.date) + (run && (w.pace ?? 0) > 0 ? " \u{00B7} " + HomeMath.fmtPace(w.pace ?? 0) : "")).font(Theme.body(12)).foregroundStyle(Theme.muted).padding(.bottom, 12)
        HStack(spacing: 8) {
            StatTile(v: run ? WorkoutMath.n(w.dist ?? 0) : HomeMath.fmtV(settings.display(w.vol)), l: run ? "Miles" : "\(settings.unitLabel) Vol")
            StatTile(v: WorkoutMath.n(w.sets), l: "Sets")
            StatTile(v: "\(w.ex.count)", l: "Exercises")
        }
        .padding(.bottom, 14)
        Button { copy(w) } label: { HStack(spacing: 6) { JIcon("clipboard", 16); Text("Copy to my workout") }.frame(maxWidth: .infinity) }
            .buttonStyle(AccentButtonStyle()).padding(.bottom, 14)
        BlockTitle(text: "Exercises & sets")
        if w.ex.isEmpty { Text("No exercise detail shared.").font(Theme.body(13)).foregroundStyle(Theme.muted) }
        ForEach(Array(w.ex.enumerated()), id: \.offset) { _, e in
            VStack(alignment: .leading, spacing: 0) {
                Text(e.n).font(Theme.body(14, .semibold)).foregroundStyle(Theme.text).padding(.bottom, 4)
                if e.sets.isEmpty { Text("No sets logged").font(Theme.body(12)).foregroundStyle(Theme.muted) }
                ForEach(Array(e.sets.enumerated()), id: \.offset) { i, s in
                    HStack {
                        Text("Set \(i + 1)").foregroundStyle(Theme.muted)
                        Spacer()
                        Text(setLabel(s)).font(Theme.heading(14, .bold)).foregroundStyle(Theme.text)
                    }
                    .font(Theme.body(12)).padding(.vertical, 3)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 10).frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius)).padding(.bottom, 8)
        }
    }

    /// sharedSetLabel()
    private func setLabel(_ s: SharedSet) -> String {
        if let mi = s.mi { return "\(WorkoutMath.n(mi)) mi" + ((s.min ?? 0) != 0 ? " \u{00B7} \(WorkoutMath.n(s.min!)) min" : "") }
        if let w = s.w { return "\(WorkoutMath.n((settings.display(w) * 10).rounded() / 10)) \(settings.unitLabel) \u{00D7} \(WorkoutMath.n(s.r ?? 0))" }
        if let sec = s.sec { return "\(WorkoutMath.n(sec))s" }
        if let r = s.r { return "\(WorkoutMath.n(r)) reps" }
        return ""
    }
}

/// miniCal(): this month with the trained days lit; tapping one opens that day's shared workout.
struct MiniCalendar: View {
    let days: Set<String>
    let now: Date
    let tap: (String) -> Void
    var body: some View {
        let cal = Calendar.current, c = cal.dateComponents([.year, .month], from: now)
        let first = cal.date(from: DateComponents(year: c.year, month: c.month, day: 1))!
        let lead = cal.component(.weekday, from: first) - 1, dim = cal.range(of: .day, in: .month, for: first)!.count
        let today = JackedDate.dayKey(now)
        let f: DateFormatter = { let f = DateFormatter(); f.locale = Locale(identifier: "en_US"); f.dateFormat = "MMMM yyyy"; return f }()
        VStack(alignment: .leading, spacing: 8) {
            Text(f.string(from: first)).font(Theme.heading(16, .bold)).foregroundStyle(Theme.text)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                // One ForEach with unique ids: separate ForEach blocks keyed by bare Ints collided
                // (blank cells 0..5 vs days 1..6) and SwiftUI dropped the first days of the month.
                let cells: [(id: String, day: Int)] = ["S", "M", "T", "W", "T", "F", "S"].enumerated().map { ("h\($0.offset)", -1 - $0.offset) }
                    + (0..<lead).map { ("b\($0)", 0) } + (1...dim).map { ("d\($0)", $0) }
                ForEach(cells, id: \.id) { cell in
                    if cell.day < 0 {
                        Text(["S", "M", "T", "W", "T", "F", "S"][-1 - cell.day]).font(Theme.body(10, .bold)).foregroundStyle(Theme.muted)
                    } else if cell.day == 0 {
                        Color.clear.frame(height: 30)
                    } else {
                        let d = cell.day, ds = String(format: "%04d-%02d-%02d", c.year!, c.month!, d), worked = days.contains(ds)
                        Text("\(d)").font(Theme.body(12, worked ? .bold : .regular))
                            .foregroundStyle(worked ? Theme.onAccent : Theme.text2)
                            .frame(maxWidth: .infinity, minHeight: 30)
                            .background(worked ? Theme.accent : Color.clear, in: RoundedRectangle(cornerRadius: 8))
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(ds == today ? Theme.accent : .clear, lineWidth: 1))
                            .onTapGesture { if worked { tap(ds) } }
                    }
                }
            }
        }
        .padding(14).card()
    }
}

/// #fbModal: which badges a person has earned (yours live, a friend's from what their app published).
struct FriendBadgesSheet: View {
    let p: Person
    let m: MetricsMath
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        let ladders = m.computeBadges().ladders
        let list = p.badgeList.enumerated().sorted { a, b in
            (a.element.n == "Jacked") != (b.element.n == "Jacked") ? a.element.n == "Jacked" : a.offset < b.offset
        }.map(\.element)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Badges").font(Theme.heading(26, .extraBold)).foregroundStyle(Theme.text)
                        Text(p.name + (p.isYou ? " (You)" : "")).font(Theme.body(12)).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Button { dismiss() } label: { JIcon("close", 14).foregroundStyle(Theme.text2)
                        .frame(width: 32, height: 32).background(Theme.bg3, in: Circle()) }.buttonStyle(.plain)
                }
                .padding(.bottom, 10)
                if list.isEmpty {
                    Text("No badges earned yet" + (p.isYou ? "." : " \u{2014} or they haven't synced on this version of the app."))
                        .font(Theme.body(13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(.vertical, 18)
                }
                ForEach(Array(list.enumerated()), id: \.offset) { _, b in
                    let shown = b.n == "1000lb Club-Maxing" ? "1000lb Club" : b.n
                    let parts = b.e.split(separator: "|").map(String.init)
                    let icon = parts.first ?? "medal", col = parts.count > 1 ? parts[1] : "var(--muted)"
                    HStack(spacing: 12) {
                        SFIcon(BadgeUI.symbols[icon] ?? "medal.fill", 22).foregroundStyle(BadgeUI.color(col.hasPrefix("var(--") ? String(col.dropFirst(6).dropLast()) : col))
                            .frame(width: 28)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(shown).font(Theme.body(14, .bold)).foregroundStyle(Theme.text)
                            Text(BadgeUI.tierWordsText(m.badgeShortHow(shown, ladders), rank: BadgeUI.rank(b.t), base: Theme.muted)).font(Theme.body(12))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        let tc = BadgeUI.tierColor[b.t] ?? (b.n == "Jacked" ? Color(hex: 0xFFD700) : Theme.green)
                        Text(b.t.isEmpty ? "Earned" : b.t.capitalized).font(Theme.body(11, .bold)).foregroundStyle(tc)
                            .padding(.horizontal, 8).padding(.vertical, 3).background(tc.opacity(0.13), in: Capsule()).overlay(Capsule().stroke(tc.opacity(0.4), lineWidth: 1))
                    }
                    .padding(.vertical, 10).overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 1) }
                }
            }
            .padding(20)
        }
        .background(Theme.bg2.ignoresSafeArea())
    }
}

/// #avLightbox: a friend's profile photo, enlarged on a 90% black backdrop. Tap anywhere or the close button.
struct AvatarLightbox: View {
    let url: URL?
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.opacity(0.9).ignoresSafeArea().onTapGesture { dismiss() }
            CachedImage(url: url) { Color.clear }
                .aspectRatio(1, contentMode: .fit).frame(maxWidth: 480)
                .clipShape(RoundedRectangle(cornerRadius: 20)).padding(.horizontal, 16).frame(maxWidth: .infinity, maxHeight: .infinity)
                .allowsHitTesting(false)
            Button { dismiss() } label: {
                JIcon("close", 16).foregroundStyle(.white).frame(width: 36, height: 36).background(Color.black.opacity(0.55), in: Circle())
            }.padding(.top, 12).padding(.trailing, 18)
        }
        .presentationBackground(.clear)
    }
}
