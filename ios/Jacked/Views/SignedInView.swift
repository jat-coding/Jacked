import SwiftUI

/// Placeholder home for the first slice. Proves the session works end to end: it reads
/// the user's own `profiles` row with the access token (RLS only returns it to its owner).
/// Read-only; the real tab bar replaces this in the next slice (IOS_REWRITE_PLAN.md).
struct SignedInView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var profile: ProfileAPI.OwnProfile?
    @State private var loadError: String?

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Text("JACKED.")
                .font(Theme.heading(48, .black))
                .tracking(2)
                .foregroundStyle(Theme.accent)

            VStack(spacing: 6) {
                Text("Signed in as")
                    .font(Theme.body(13))
                    .foregroundStyle(Theme.muted)
                Text(auth.session?.code ?? "")
                    .font(Theme.heading(28, .extraBold))
                    .foregroundStyle(Theme.text)
                    .textSelection(.enabled)
            }

            card
            Spacer()

            Button("Sign Out") { Task { await auth.logOut() } }
                .buttonStyle(GhostButtonStyle())
        }
        .padding(24)
        .frame(maxWidth: 420)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
        .task { await load() }
    }

    @ViewBuilder private var card: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("CONNECTION CHECK")
                .font(Theme.body(12, .semibold))
                .tracking(0.4)
                .foregroundStyle(Theme.text2)
            if let p = profile {
                row("Display name", p.name ?? "-")
                row("Workouts", p.workouts.map(String.init) ?? "-")
                row("Streak", p.streak.map(String.init) ?? "-")
            } else if let e = loadError {
                Text(e).font(Theme.body(13)).foregroundStyle(Theme.orange)
                Button("Retry") { Task { await load() } }
                    .font(Theme.body(13, .semibold))
                    .foregroundStyle(Theme.accent)
            } else {
                ProgressView().tint(Theme.accent)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Theme.bg2, in: RoundedRectangle(cornerRadius: Theme.radiusLarge))
        .overlay(RoundedRectangle(cornerRadius: Theme.radiusLarge).stroke(Theme.border, lineWidth: 1))
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack {
            Text(k).foregroundStyle(Theme.text2)
            Spacer()
            Text(v).foregroundStyle(Theme.text).fontWeight(.semibold)
        }
        .font(Theme.body(14))
    }

    private func load() async {
        loadError = nil
        guard let s = await auth.validSession() else { return }
        do {
            if let p = try await ProfileAPI().ownProfile(s) {
                profile = p
            } else {
                loadError = "Signed in, but your profile row came back empty."
            }
        } catch let e as SupabaseError {
            loadError = e.isNetwork ? "No connection" : "Couldn't load your profile (\(e.status))"
        } catch {
            loadError = "Couldn't load your profile"
        }
    }
}
