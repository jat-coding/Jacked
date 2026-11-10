import Combine
import LocalAuthentication
import SwiftUI

/// "Require login every time I open the app" (My Profile, default OFF). Sign-in happens once (email or
/// username + password, saved in the Keychain session); after that the app opens straight in. Only when
/// this switch is on does each open (cold start, or back from the background for 15s+) ask for Face ID. LocalAuthentication's deviceOwnerAuthentication policy
/// is Face ID with the device passcode as the fallback. The lock screen lives in its own UIWindow so
/// it also covers any sheet that was open.
@MainActor
final class AppLock: ObservableObject {
    static let enabledKey = "jacked.faceid.enabled"   // key kept: the old Face ID lock switch becomes this one
    static let graceSeconds: TimeInterval = 15
    static var enabled: Bool {
        get { DevHooks.lockDemo || UserDefaults.standard.bool(forKey: enabledKey) }
        set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }

    @Published private(set) var locked: Bool
    @Published private(set) var failed = false
    private var backgroundedAt: Date?
    private var window: UIWindow?
    private var busy = false
    weak var auth: AuthStore?   // set by JackedApp; the lock window is separate so it has no environment

    init() { locked = Self.enabled }   // cold start

    func scenePhase(_ p: ScenePhase) {
        switch p {
        case .background:
            if backgroundedAt == nil { backgroundedAt = Date() }
        case .active:
            if Self.enabled, let t = backgroundedAt, Date().timeIntervalSince(t) >= Self.graceSeconds { locked = true }
            backgroundedAt = nil
            refreshWindow()
            if locked { Task { await unlock(auto: true) } }
        default: break
        }
    }

    /// Show / hide the lock window to match `locked`. Also called on first appear for the cold-start lock.
    func refreshWindow() {
        if locked, window == nil,
           let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first {
            let w = UIWindow(windowScene: scene)
            w.windowLevel = .alert + 1
            let host = UIHostingController(rootView: LockScreen(lock: self).preferredColorScheme(.dark))
            host.view.backgroundColor = .clear
            w.rootViewController = host
            w.makeKeyAndVisible()
            window = w
        } else if !locked, let w = window {
            w.isHidden = true; window = nil
        }
    }

    func unlock(auto: Bool = false) async {
        guard locked, !busy else { return }
        if DevHooks.lockDemo { return }   // screenshots: stay on the lock screen
        busy = true; defer { busy = false }
        let ctx = LAContext()
        ctx.localizedCancelTitle = "Cancel"
        var err: NSError?
        // No passcode set on this phone: there is nothing to unlock with, and locking the owner out
        // of their own workouts is worse than no lock.
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else { open(); return }
        do {
            if try await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Unlock Jacked") { open() }
        } catch { failed = true }
    }

    /// Escape hatch for a phone whose Face ID is not working: sign out so the normal login screen shows.
    func passwordInstead() async { await auth?.logOut(); open() }

    private func open() { locked = false; failed = false; refreshWindow() }

    /// Used by the My Profile switch: only turns the lock on once the phone can actually unlock it.
    static func canEnable() async -> Bool {
        let ctx = LAContext(); var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else { return false }
        return (try? await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Require login every time you open Jacked")) ?? false
    }
}

/// The lock screen, in the app's shared style: page-title wordmark, card, accent button.
struct LockScreen: View {
    @ObservedObject var lock: AppLock

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 18) {
                Spacer()
                (Text("JACKED") + Text(".").foregroundColor(Theme.accent))
                    .font(Theme.heading(44, .black)).tracking(1).foregroundStyle(Theme.text)
                VStack(spacing: 10) {
                    SFIcon("lock.fill", 30).foregroundStyle(Theme.accent)
                    Text("Locked").font(Theme.heading(24, .extraBold)).foregroundStyle(Theme.text)
                    Text(lock.failed ? "Could not unlock. Try again." : "Use Face ID or your passcode to open Jacked.")
                        .font(Theme.body(13)).foregroundStyle(lock.failed ? Theme.red : Theme.muted).multilineTextAlignment(.center)
                    Button("Unlock") { Haptics.light(); Task { await lock.unlock() } }
                        .buttonStyle(AccentButtonStyle()).padding(.top, 6)
                    Button("Sign in with password instead") { Haptics.light(); Task { await lock.passwordInstead() } }
                        .font(Theme.body(13, .semibold)).foregroundStyle(Theme.muted)
                }
                .padding(20).frame(maxWidth: 320).card(fill: Theme.bg2, radius: Theme.radiusLarge)
                Spacer(); Spacer()
            }
            .padding(.horizontal, 24)
        }
        .task { await lock.unlock(auto: true) }
    }
}
