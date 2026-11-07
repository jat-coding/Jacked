import SwiftUI

/// The PWA's bottom nav: Routines, Library, Home (centered, the default), Metrics, Friends.
struct MainTabView: View {
    @EnvironmentObject private var auth: AuthStore
    @StateObject private var store = BackupStore()
    @State private var tab: Tab = Tab(rawValue: DevHooks.tab ?? "") ?? .home

    enum Tab: String, Hashable { case routines, library, home, metrics, friends }

    var body: some View {
        TabView(selection: $tab) {
            PlaceholderTab(title: "Routines", note: "Your routines and the trusted programs come with workout logging.")
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
        .environmentObject(store)
        .task(id: auth.session?.code) {
            if let code = auth.session?.code { await store.start(for: code, auth: auth) }
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
