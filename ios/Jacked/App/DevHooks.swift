import Foundation

/// DEBUG-only hooks so the simulator can be driven over SSH (no keyboard there):
///   SIMCTL_CHILD_JACKED_DEV_USER / _PASS  sign in as the throwaway TEST account on launch
///   SIMCTL_CHILD_JACKED_DEV_TAB           routines | library | home | metrics | friends
///   SIMCTL_CHILD_JACKED_DEV_OPEN          day:<YYYY-MM-DD|today> | workout:<index from newest> | profile | ex:<exId>
///   SIMCTL_CHILD_JACKED_DEV_SEARCH        text typed into the Library search
///   SIMCTL_CHILD_JACKED_DEV_RENAME        <index from newest>|<new name>: rename through the real
///                                         save path (merge + compare-and-swap), then open it
///   SIMCTL_CHILD_JACKED_DEV_CAS_DELAY     seconds to wait between the pre-write read and the
///                                         conditional write, so a test can land a write from
///                                         "another device" in that gap and prove the retry
///   SIMCTL_CHILD_JACKED_DEV_LOG           <exId>=<lb>x<reps>,<lb>x<reps>;<exId>=...: start a workout and
///                                         log those sets through the same calls the buttons make
///   SIMCTL_CHILD_JACKED_DEV_ROUTINE       start the LOG workout from the routine with this name
///   SIMCTL_CHILD_JACKED_DEV_LOGDAY        YYYY-MM-DD: start the LOG workout dated to that past day
///   SIMCTL_CHILD_JACKED_DEV_SUPERSET      <i>,<j>: pair those two exercises of the LOG workout
///   SIMCTL_CHILD_JACKED_DEV_NOTE          <exId>|<text>: save an exercise note through the real save path
///   SIMCTL_CHILD_JACKED_DEV_DURUNIT       sec|min|hr for every hold in the LOG workout
///   SIMCTL_CHILD_JACKED_DEV_FAV           <exId>: toggle that exercise's favourite through the real save path
///   SIMCTL_CHILD_JACKED_DEV_CREATEEX      <name>: create a custom exercise (Biceps, cable) through the real save path
///   SIMCTL_CHILD_JACKED_DEV_NEWROUTINE    <name>|<exId>,<exId>: save a new routine through saveR's path
///   SIMCTL_CHILD_JACKED_DEV_ADDPROGRAM    <index>: "+ Add to Routines" on that Trusted Program
///   SIMCTL_CHILD_JACKED_DEV_WEIGHT        <kg>: log today's body weight from Metrics through the real save path
///   SIMCTL_CHILD_JACKED_DEV_HIDECARD      <card id>: hide / show that Metrics card through the real save path
///   (OPEN also takes recap:<YYYY-MM>, card:<card id>, ach and badge:<badge name> on the Metrics tab)
///   SIMCTL_CHILD_JACKED_DEV_CANCEL        1: drop any workout left open by an earlier run first
///   SIMCTL_CHILD_JACKED_DEV_FINISH        1: finish the open workout through the real save path
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
    static var casDelay: Double { Double(env["JACKED_DEV_CAS_DELAY"] ?? "") ?? 0 }
    static var logScript: String? { env["JACKED_DEV_LOG"].flatMap { $0.isEmpty ? nil : $0 } }
    static var routine: String? { env["JACKED_DEV_ROUTINE"].flatMap { $0.isEmpty ? nil : $0 } }
    static var finish: Bool { env["JACKED_DEV_FINISH"] == "1" }
    static var cancel: Bool { env["JACKED_DEV_CANCEL"] == "1" }
    static var search: String? { env["JACKED_DEV_SEARCH"].flatMap { $0.isEmpty ? nil : $0 } }
    static var fav: String? { env["JACKED_DEV_FAV"].flatMap { $0.isEmpty ? nil : $0 } }
    static var createEx: String? { env["JACKED_DEV_CREATEEX"].flatMap { $0.isEmpty ? nil : $0 } }
    static var newRoutine: String? { env["JACKED_DEV_NEWROUTINE"].flatMap { $0.isEmpty ? nil : $0 } }
    static var addProgram: Int? { env["JACKED_DEV_ADDPROGRAM"].flatMap { Int($0) } }
    static var logDay: String? { env["JACKED_DEV_LOGDAY"].flatMap { $0.isEmpty ? nil : $0 } }
    static var note: (exId: String, text: String)? {
        guard let r = env["JACKED_DEV_NOTE"], let bar = r.firstIndex(of: "|") else { return nil }
        return (String(r[..<bar]), String(r[r.index(after: bar)...]))
    }
    static var durUnit: String? { env["JACKED_DEV_DURUNIT"].flatMap { $0.isEmpty ? nil : $0 } }
    static var superset: [Int] { (env["JACKED_DEV_SUPERSET"] ?? "").split(separator: ",").compactMap { Int($0) } }
    static var logWeight: Double? { env["JACKED_DEV_WEIGHT"].flatMap { Double($0) } }
    static var hideCard: String? { env["JACKED_DEV_HIDECARD"].flatMap { $0.isEmpty ? nil : $0 } }
    static func log(_ s: String) { print("[jacked-sync] " + s); fflush(stdout) }
    #else
    static var casDelay: Double { 0 }
    static func log(_ s: String) {}
    static var login: (user: String, pass: String)? { nil }
    static var tab: String? { nil }
    static var open: String? { nil }
    static var rename: (index: Int, name: String)? { nil }
    static var logScript: String? { nil }
    static var routine: String? { nil }
    static var finish: Bool { false }
    static var cancel: Bool { false }
    static var search: String? { nil }
    static var fav: String? { nil }
    static var createEx: String? { nil }
    static var newRoutine: String? { nil }
    static var addProgram: Int? { nil }
    static var logDay: String? { nil }
    static var superset: [Int] { [] }
    static var note: (exId: String, text: String)? { nil }
    static var durUnit: String? { nil }
    static var logWeight: Double? { nil }
    static var hideCard: String? { nil }
    #endif
}
