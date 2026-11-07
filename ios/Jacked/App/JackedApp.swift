import SwiftUI

@main
struct JackedApp: App {
    @StateObject private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
                .task { await auth.restore() }
        }
    }
}

/// Routes on auth state, like the PWA's onAuthStateChange -> onboarding / app.
struct RootView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            switch auth.phase {
            case .restoring:
                ProgressView().tint(Theme.accent)
            case .signedOut:
                AuthView().transition(.opacity)
            case .signedIn:
                MainTabView().transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.25), value: auth.phase)
    }
}
