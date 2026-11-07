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
///   SIMCTL_CHILD_JACKED_DEV_CMP           <volume|prs|workouts|streak|consistency|badges>|<month|all>: the Leaderboards filter
///   SIMCTL_CHILD_JACKED_DEV_CB            <code>: toggle that friend's close-buddy star through the real save path
///   SIMCTL_CHILD_JACKED_DEV_ACCEPT        <code>: accept that person's friend request (real call)
///   SIMCTL_CHILD_JACKED_DEV_RMFRIEND      <code>: remove / decline / cancel with that person (real call)
///   SIMCTL_CHILD_JACKED_DEV_ADDFRIEND     <username>: open Add Friend prefilled; with ADDFRIEND_SEND=1 also tap Add Friend
///   SIMCTL_CHILD_JACKED_DEV_COPY          1: with OPEN=friend:<code>/<i>, tap Copy to my workout
///   (OPEN also takes friend:<code|me>, friend:<code>/<workout index> and friend:<code>/badges on the Friends tab)
///   SIMCTL_CHILD_JACKED_DEV_SUGGEST       <label>|pick|dismiss: tap that row's Start on Home's Suggested today
///                                         card (pick = the trusted pick), or its dismiss button
///   SIMCTL_CHILD_JACKED_DEV_SECTION       collapse:<name> | rename:<name>|<new name>: on the Routines tab, through the real save path
///   SIMCTL_CHILD_JACKED_DEV_RESETPR       <exId>: with OPEN=ex:<exId>, Reset PR through the real save path
///   SIMCTL_CHILD_JACKED_DEV_EDITEX        <exId>|<name>|<equip>|<notes>: with OPEN=ex:<exId>, save an exercise edit through the real save path
///   SIMCTL_CHILD_JACKED_DEV_EXPHOTO       <exId>: with OPEN=ex:<exId>, store a generated photo for that custom exercise (local only)
///   SIMCTL_CHILD_JACKED_DEV_PROFILE       with OPEN=profile: <field>=<value>,... (name, unit, rest, repMin, repMax, autoRest,
///                                         sex, bw, birthday) then Save Profile through the real save path; tab=body only switches tab
///                                         username=<new> also changes the username (rename_profile, real call);
///                                         photo=<letters> uploads a generated picture, photo=remove deletes it (no Save)
///   SIMCTL_CHILD_JACKED_DEV_DELETEACCT    with OPEN=profile: open Delete Account and type this; "confirm" types the right
///                                         username and taps Delete (the server call is not live: nothing is deleted)
///   SIMCTL_CHILD_JACKED_DEV_TIERXP        with OPEN=badge:<name>: open these rows' logged-set lines (bronze,silver,gold,all)
///   SIMCTL_CHILD_JACKED_DEV_BADGESTART    1: with OPEN=badge:<name>, tap the badge page's start button (never finished, never saved)
///   SIMCTL_CHILD_JACKED_DEV_SAVEROUTINE   <name>: with OPEN=workout:<i>, Save as Routine through the real save path
///   SIMCTL_CHILD_JACKED_DEV_EDITW         with OPEN=workout:<i>: open Edit Workout, apply <ei>,<si>,<weight kg>[,<reps>] edits
///                                         (';' between several, name=<x> renames, day=<YYYY-MM-DD> moves it,
///                                         add=<exId> adds an exercise) and Save
///   SIMCTL_CHILD_JACKED_DEV_DELW          1: with OPEN=workout:<i>, Delete Workout through the real save path
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
    static var cmp: String? { env["JACKED_DEV_CMP"].flatMap { $0.isEmpty ? nil : $0 } }
    static var toggleCB: String? { env["JACKED_DEV_CB"].flatMap { $0.isEmpty ? nil : $0 } }
    static var acceptFriend: String? { env["JACKED_DEV_ACCEPT"].flatMap { $0.isEmpty ? nil : $0 } }
    static var removeFriend: String? { env["JACKED_DEV_RMFRIEND"].flatMap { $0.isEmpty ? nil : $0 } }
    static var addFriend: String? { env["JACKED_DEV_ADDFRIEND"].flatMap { $0.isEmpty ? nil : $0 } }
    static var addFriendSend: Bool { env["JACKED_DEV_ADDFRIEND_SEND"] == "1" }
    static var copyFriend: Bool { env["JACKED_DEV_COPY"] == "1" }
    static var suggest: String? { env["JACKED_DEV_SUGGEST"].flatMap { $0.isEmpty ? nil : $0 } }
    static var section: String? { env["JACKED_DEV_SECTION"].flatMap { $0.isEmpty ? nil : $0 } }
    static var resetPR: String? { env["JACKED_DEV_RESETPR"].flatMap { $0.isEmpty ? nil : $0 } }
    static var editEx: String? { env["JACKED_DEV_EDITEX"].flatMap { $0.isEmpty ? nil : $0 } }
    static var exPhoto: String? { env["JACKED_DEV_EXPHOTO"].flatMap { $0.isEmpty ? nil : $0 } }
    static var saveRoutine: String? { env["JACKED_DEV_SAVEROUTINE"].flatMap { $0.isEmpty ? nil : $0 } }
    static var editW: String? { env["JACKED_DEV_EDITW"].flatMap { $0.isEmpty ? nil : $0 } }
    static var delW: Bool { env["JACKED_DEV_DELW"] == "1" }
    static var badgeStart: Bool { env["JACKED_DEV_BADGESTART"] == "1" }
    static var tierXp: [String] { (env["JACKED_DEV_TIERXP"] ?? "").split(separator: ",").map(String.init) }
    static var profile: String? { env["JACKED_DEV_PROFILE"].flatMap { $0.isEmpty ? nil : $0 } }
    static var deleteAccount: String? { env["JACKED_DEV_DELETEACCT"].flatMap { $0.isEmpty ? nil : $0 } }
    static func log(_ s: String) { print("[jacked-sync] " + s); fflush(stdout) }
    #else
    static var saveRoutine: String? { nil }
    static var editW: String? { nil }
    static var delW: Bool { false }
    static var badgeStart: Bool { false }
    static var tierXp: [String] { [] }
    static var profile: String? { nil }
    static var deleteAccount: String? { nil }
    static var suggest: String? { nil }
    static var section: String? { nil }
    static var resetPR: String? { nil }
    static var editEx: String? { nil }
    static var exPhoto: String? { nil }
    static var cmp: String? { nil }
    static var toggleCB: String? { nil }
    static var acceptFriend: String? { nil }
    static var removeFriend: String? { nil }
    static var addFriend: String? { nil }
    static var addFriendSend: Bool { false }
    static var copyFriend: Bool { false }
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
