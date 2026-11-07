import Foundation

/// DEBUG-only hooks so the simulator can be driven over SSH (no keyboard there):
///   SIMCTL_CHILD_JACKED_DEV_USER / _PASS  sign in as the throwaway TEST account on launch
///   SIMCTL_CHILD_JACKED_DEV_TAB           routines | library | home | metrics | friends
///   SIMCTL_CHILD_JACKED_DEV_OPEN          day:<YYYY-MM-DD|today> | workout:<index from newest> | profile
///   SIMCTL_CHILD_JACKED_DEV_RENAME        <index from newest>|<new name>: rename through the real
///                                         save path (merge + compare-and-swap), then open it
/// Compiled out of Release builds entirely. Never point these at a real person's account
/// (ios/REWRITE_BUILD_BRIEF.md guardrail 2).
enum DevHooks {
    #if DEBUG
    private static var env: [String: String] { ProcessInfo.processInfo.environment }
    static var login: (user: String, pass: String)? {
        guard let u = env["JACKED_DEV_USER"], let p = env["JACKED_DEV_PASS"], !u.isEmpty, !p.isEmpty else { return nil }
        return (u, p)
    }
    static var tab: String? { env["JACKED_DEV_TAB"] }
    static var open: String? { env["JACKED_DEV_OPEN"] }
    static var rename: (index: Int, name: String)? {
        guard let r = env["JACKED_DEV_RENAME"], let bar = r.firstIndex(of: "|"), let i = Int(r[..<bar]) else { return nil }
        return (i, String(r[r.index(after: bar)...]))
    }
    #else
    static var login: (user: String, pass: String)? { nil }
    static var tab: String? { nil }
    static var open: String? { nil }
    static var rename: (index: Int, name: String)? { nil }
    #endif
}
