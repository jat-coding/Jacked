import SwiftUI

/// The PWA's bottom nav: Routines, Library, Home (centered, the default), Metrics, Friends.
struct MainTabView: View {
    @EnvironmentObject private var auth: AuthStore
    @StateObject private var store = BackupStore()
    @StateObject private var session = WorkoutSession()
    @StateObject private var catalog = ExerciseCatalog()
    @State private var tab: Tab = Tab(rawValue: DevHooks.tab ?? "") ?? .home

    enum Tab: String, Hashable { case routines, library, home, metrics, friends }

    var body: some View {
        TabView(selection: $tab) {
            RoutinesView()
                .tabItem { Label("Routines", systemImage: "square.grid.2x2") }.tag(Tab.routines)
            PlaceholderTab(title: "Library", note: "The exercise library is a later build step.")
                .tabItem { Label("Library", systemImage: "books.vertical") }.tag(Tab.library)
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }.tag(Tab.home)
            PlaceholderTab(title: "Metrics", note: "Muscle map, stats and badges are a later build step.")
                .tabItem { Label("Metrics", systemImage: "waveform.path.ecg") }.tag(Tab.metrics)
            PlaceholderTab(title: "Friends", note: "Friends and the leaderboard are a later build step.")
                .tabItem { Label("Friends", systemImage: "person.2") }.tag(Tab.friends)
        }
        .safeAreaInset(edge: .bottom) {
            if session.active != nil && !session.presented {
                Button { session.presented = true } label: {
                    Label("Return to workout", systemImage: "arrow.uturn.left").font(Theme.body(14, .bold))
                        .foregroundStyle(Theme.onAccent).padding(.horizontal, 18).padding(.vertical, 10)
                        .background(Theme.accent, in: Capsule())
                }
                .padding(.bottom, 56)
            }
        }
        .fullScreenCover(isPresented: $session.presented) {
            ActiveWorkoutView()
                .environmentObject(auth).environmentObject(store).environmentObject(session).environmentObject(catalog)
                .preferredColorScheme(.dark)
        }
        .confirmationDialog(busyPrompt, isPresented: Binding(get: { session.busyStart != nil }, set: { if !$0 { session.busyStart = nil } }),
                            titleVisibility: .visible) {
            Button("Discard & start", role: .destructive) { let f = session.busyStart; session.busyStart = nil; f?() }
            Button("Keep it", role: .cancel) { session.busyStart = nil }
        }
        .sheet(item: $session.summary) { s in
            FinishSummarySheet(s: s)
                .environmentObject(auth).environmentObject(store).environmentObject(session)
        }
        .environmentObject(store)
        .environmentObject(session)
        .environmentObject(catalog)
        .task(id: auth.session?.code) {
            if let code = auth.session?.code {
                session.load(code: code)
                await store.start(for: code, auth: auth)
                await catalog.load()
                await runDevLog()
            }
        }
        .onAppear {
            let a = UITabBarAppearance()
            a.configureWithOpaqueBackground()
            a.backgroundColor = UIColor(Theme.bg2)
            a.shadowColor = UIColor(Theme.border)
            UITabBar.appearance().standardAppearance = a
            UITabBar.appearance().scrollEdgeAppearance = a
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
            DevHooks.log("dev workout started: \(session.active?.exercises.count ?? 0) exercises")
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
