import SwiftUI

/// The PWA's bottom nav: Routines, Library, Home (centered, the default), Metrics, Friends.
struct MainTabView: View {
    @EnvironmentObject private var auth: AuthStore
    @StateObject private var store = BackupStore()
    @StateObject private var session = WorkoutSession()
    @StateObject private var catalog = ExerciseCatalog()
    @StateObject private var friends = FriendsStore()
    @State private var barH: CGFloat = 40
    @State private var tab: Tab = Tab(rawValue: DevHooks.tab ?? "") ?? .home

    enum Tab: String, Hashable { case routines, library, home, metrics, friends }

    var body: some View {
        TabView(selection: $tab) {
            RoutinesView().toolbar(.hidden, for: .tabBar).tag(Tab.routines)
            LibraryView().toolbar(.hidden, for: .tabBar).tag(Tab.library)
            HomeView().toolbar(.hidden, for: .tabBar).tag(Tab.home)
            MetricsView().toolbar(.hidden, for: .tabBar).tag(Tab.metrics)
            FriendsView().toolbar(.hidden, for: .tabBar).tag(Tab.friends)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            // The resume bar is an overlay on the capsule, not part of the inset: overlays add no layout
            // height, so the tab bar sits at the same y with or without an open workout. The bar's bottom
            // edge is lifted by its own measured height so it floats just above the capsule.
            NavCapsule(tab: $tab, requests: friends.friends.filter(\.pending).count)
                .overlay(alignment: .top) {
                    if session.active != nil && !session.presented {
                        Button { Haptics.light(); session.presented = true } label: {
                            Label("Return to workout", systemImage: "arrow.uturn.left").font(Theme.body(14, .bold))
                                .foregroundStyle(Theme.onAccent).padding(.horizontal, 18).padding(.vertical, 10)
                                .background(Theme.accent, in: Capsule())
                        }
                        .background(GeometryReader { g in Color.clear.onAppear { barH = g.size.height } })
                        .offset(y: -(barH + 8))
                    }
                }
        }
        .ignoresSafeArea(.keyboard)   // outside the inset: the keyboard never lifts the tab bar (or the screens under it)
        .onReceive(NotificationCenter.default.publisher(for: .jackedOpenTab)) { n in
            if let t = (n.object as? String).flatMap(Tab.init(rawValue:)) { tab = t }
        }
        .sheet(isPresented: $session.presented) {
            ActiveWorkoutView()
                .environmentObject(auth).environmentObject(store).environmentObject(session).environmentObject(catalog)
                .preferredColorScheme(.dark)
                .presentationDetents([.large]).popup()   // minimize = swipe down; the workout lives in WorkoutSession, nothing is lost
        }
        .confirmationDialog(busyPrompt, isPresented: Binding(get: { session.busyStart != nil }, set: { if !$0 { session.busyStart = nil } }),
                            titleVisibility: .visible) {
            Button("Discard & start", role: .destructive) { Haptics.warning(); let f = session.busyStart; session.busyStart = nil; f?() }
            Button("Keep it", role: .cancel) { session.busyStart = nil }
        }
        .sheet(item: $session.summary) { s in
            FinishSummarySheet(s: s)
                .environmentObject(auth).environmentObject(store).environmentObject(session)
                .popup()
        }
        .environmentObject(store)
        .environmentObject(session)
        .environmentObject(catalog)
        .environmentObject(friends)
        .task(id: "\(store.updatedAt ?? "")|\(catalog.db.count)|\(store.backup.history.count)") {
            // syncMe(): publish this phone's stats for friends' boards once the server copy and the
            // exercise library are in, and again after every landed save (FriendsStore skips no-ops).
            guard let code = auth.session?.code, store.loadedCode == code, store.lastSynced != nil, !catalog.db.isEmpty else { return }
            let raw = store.backup.raw, m = MetricsMath(raw: raw, lib: ExLib(db: catalog.db, raw: raw))
            let (f, a, cols) = (friends, auth, m.publishColumns(badges: m.computeBadges().list))
            Task { await f.publish(cols, auth: a) }
        }
        .task(id: auth.session?.code) {
            if let code = auth.session?.code {
                session.load(code: code)
                await store.start(for: code, auth: auth)
                await catalog.load()
                await runDevLog()
            }
        }
    }
}

extension MainTabView {
    /// DEBUG DevHooks: log a scripted workout through the same session calls the buttons use,
    /// then (JACKED_DEV_FINISH) finish it through the real save path.
    func runDevLog() async {
        guard store.loadedCode != nil else { return }
        let raw = store.backup.raw
        if DevHooks.cancel, session.active != nil { session.cancel() }
        if let script = DevHooks.logScript, session.active == nil {
            if let rid = DevHooks.routine,
               let r = (raw["jk_routines"]?.array ?? []).compactMap(\.object).first(where: { $0["name"]?.string == rid }) {
                session.start(routine: r, catalog: catalog, raw: raw)
            } else if let day = DevHooks.logDay { session.startEmpty(on: day) } else { session.startEmpty() }
            for (i, part) in script.split(separator: ";").enumerated() {
                let kv = part.split(separator: "=", maxSplits: 1)
                guard kv.count == 2 else { continue }
                let exId = String(kv[0])
                var ei = session.active?.exercises.firstIndex { $0.exId == exId } ?? -1
                if ei < 0 { session.add(catalog.byId(exId, raw: raw), raw: raw); ei = (session.active?.exercises.count ?? 1) - 1 }
                for (si, st) in kv[1].split(separator: ",").enumerated() {
                    let wr = st.split(separator: "x").map { Double($0.trimmingCharacters(in: .whitespaces)) ?? 0 }
                    while (session.active?.exercises[ei].sets.count ?? 0) <= si { session.addSet(ei) }
                    let lb = store.backup.settings.isLb && WorkoutMath.isWT(session.active!.exercises[ei])
                    session.set(ei, si, weight: (wr.first ?? 0) / (lb ? 2.20462 : 1), reps: wr.count > 1 ? wr[1] : 0)
                    session.toggle(ei, si, raw: raw, settings: store.backup.settings)
                }
                _ = i
            }
            for i in DevHooks.superset { session.tapSuperset(i) }
            if let u = DevHooks.durUnit {
                for (i, e) in (session.active?.exercises ?? []).enumerated() where e.tracking == "duration" { session.setDurUnit(i, u) }
            }
            DevHooks.log("dev workout started: \(session.active?.exercises.count ?? 0) exercises")
        }
        if let n = DevHooks.restDemo, session.active != nil { session.startRest(n); DevHooks.log("dev rest started: \(n)s, live activities \(RestLiveActivity.liveCount)") }
        if let out = DevHooks.shareCardOut {
            let card = WorkoutShareCard(name: "Push Day", dateLabel: Date().formatted(.dateTime.month(.abbreviated).day().year()),
                                        duration: "52:10", sets: 18, volume: HomeMath.fmtV(store.backup.settings.display(14230)), unit: store.backup.settings.unitLabel,
                                        prs: [("Bench Press", "185\(store.backup.settings.unitLabel) \u{00D7} 5"), ("Overhead Press", "115\(store.backup.settings.unitLabel) \u{00D7} 6")])
            if let png = card.render()?.pngData() { try? png.write(to: URL(fileURLWithPath: out)); DevHooks.log("share card written: \(out) \(png.count) bytes") }
        }
        if let n = DevHooks.note {
            let ok = await store.setExNote(n.exId, n.text, auth: auth)
            DevHooks.log("dev note saved=\(ok)")
        }
        if DevHooks.finish, session.active != nil {
            session.presented = true
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            await session.finish(store: store, auth: auth)
            DevHooks.log("dev workout finished, saved to server: \(session.summary?.savedToServer ?? false), prs \(session.summary?.prs.count ?? -1)")
        } else if session.active != nil && DevHooks.logScript != nil {
            session.presented = true
        }
    }
}

extension MainTabView {
    var busyPrompt: String {
        let n = session.busySets
        return "You have a workout in progress\(n > 0 ? " (\(n) set\(n > 1 ? "s" : "") logged)" : ""). Discard it and start a new one?"
    }
}

struct PlaceholderTab: View {
    let title: String
    let note: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PageHeader(title: title, accentDot: false)
            Spacer()
            Text(note)
                .font(Theme.body(14))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
            Spacer()
        }
        .padding(.horizontal, 16)
        .background(Theme.bg.ignoresSafeArea())
    }
}

/// `.ph` / `.pt`: the big condensed page title at the top of every tab.
struct PageHeader<Trailing: View>: View {
    let title: String
    var accentDot = true
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack {
            (Text(title) + Text(accentDot ? "." : "").foregroundColor(Theme.accent))
                .font(Theme.heading(36, .black))
                .tracking(1)
                .foregroundStyle(Theme.text)
            Spacer()
            trailing()
        }
        .frame(height: 62)
    }
}

extension PageHeader where Trailing == EmptyView {
    init(title: String, accentDot: Bool = true) {
        self.init(title: title, accentDot: accentDot, trailing: { EmptyView() })
    }
}

/// `.blk-t`: uppercase condensed section title.
struct BlockTitle: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(Theme.heading(24, .extraBold))
            .tracking(0.6)
            .foregroundStyle(Theme.text)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 12)
    }
}

/// `.cw`-style card: bg2, 1px border, large radius.
struct CardBackground: ViewModifier {
    var fill: Color = Theme.bg2
    var radius: CGFloat = Theme.radiusLarge
    func body(content: Content) -> some View {
        content
            .background(fill, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).stroke(Theme.border, lineWidth: 1))
    }
}

extension View {
    func card(fill: Color = Theme.bg2, radius: CGFloat = Theme.radiusLarge) -> some View {
        modifier(CardBackground(fill: fill, radius: radius))
    }
}

/// The PWA's floating bottom nav: a frosted capsule (nav, index.html:99/535), five buttons, and a teal pill
/// (#navInd) that glides to the selected one. Icons 20pt, labels 9pt semibold uppercase.
struct NavCapsule: View {
    @Binding var tab: MainTabView.Tab
    let requests: Int
    @Namespace private var ind
    private let items: [(MainTabView.Tab, String, String)] = [
        (.routines, "tab-routines", "Routines"), (.library, "tab-library", "Library"), (.home, "tab-home", "Home"),
        (.metrics, "tab-metrics", "Metrics"), (.friends, "tab-friends", "Friends")]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items, id: \.0) { it in
                let on = tab == it.0
                Button { Haptics.light(); withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) { tab = it.0 } } label: {
                    VStack(spacing: 3) {
                        JIcon(it.1, 20).shadow(color: on ? Theme.accent.opacity(0.7) : .clear, radius: 5)
                        Text(it.2.uppercased()).font(Theme.body(9, .semibold)).tracking(0.3).lineLimit(1)
                    }
                    .foregroundStyle(on ? Theme.accent : Theme.muted)
                    .padding(.top, 8).padding(.bottom, 7).frame(maxWidth: .infinity)
                    .background {
                        // iPhone-style selection: a smaller, softer pill that slides on a spring. It is inset from the
                        // button on every side so it reads as a highlight behind the icon, not a second capsule.
                        if on {
                            Capsule().fill(Theme.accent.opacity(0.12))
                                .padding(.horizontal, 7).padding(.vertical, 3)
                                .matchedGeometryEffect(id: "ind", in: ind)
                        }
                    }
                    .overlay(alignment: .top) {
                        if it.0 == .friends && requests > 0 {
                            Circle().fill(Color(hex: 0xFF453A)).frame(width: 8, height: 8)
                                .overlay(Circle().stroke(Theme.bg, lineWidth: 2)).offset(x: 12, y: 5)
                        }
                    }
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(it.2).accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(5)
        .background(.ultraThinMaterial, in: Capsule())
        .background(Color(red: 22 / 255, green: 22 / 255, blue: 30 / 255).opacity(0.62), in: Capsule())
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
        .shadow(color: .black.opacity(0.6), radius: 15, x: 0, y: 10)
        .padding(.horizontal, 12).padding(.bottom, 4)
    }
}
