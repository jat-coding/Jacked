import SwiftUI
import UIKit

/// #profModal (openProf / saveProf): name, the Profile and Body Metrics tabs (units, default rest,
/// progress rep range, auto rest timer, your username; body, body weight, birthday), Save Profile
/// through the careful save layer, Data & Backup (Export, Sync now), the email on file
/// (my_email / set_my_email), Sign Out and, new for the App Store, Delete Account.
/// Not here yet: changing the photo or the username (both need their own server steps).
struct ProfileSheet: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @Environment(\.dismiss) private var dismiss

    @State private var loaded = false
    @State private var tab = "main"
    @State private var name = ""
    @State private var unit = "lb"
    @State private var rest = ""
    @State private var repMin = ""
    @State private var repMax = ""
    @State private var autoRest = true
    @State private var sex = "male"
    @State private var bw = ""
    @State private var bwShown = 0.0
    @State private var hasBirthday = false
    @State private var birthday = Date()
    @State private var message: (text: String, ok: Bool)?
    @State private var saving = false
    @State private var email: String?
    @State private var emailNote: String? = "Loading\u{2026}"
    @State private var editingEmail = false
    @State private var emailIn = ""
    @State private var showDelete = false
    @State private var exportURL: URL?

    var body: some View {
        SheetScaffold(title: "My Profile") {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 14) {
                    // renderAvPrev: the photo, else initials on the name's colour (avHTML), like the web app.
                    ZStack {
                        Circle().fill(Color(hex: FriendsMath.avc(name)))
                        Text(FriendsMath.avi(name)).font(.system(size: 23, weight: .bold)).foregroundStyle(Theme.onAccent)
                        if let u = store.backup.avatarURL {
                            AsyncImage(url: u) { $0.resizable().scaledToFill() } placeholder: { Color.clear }.clipShape(Circle())
                        }
                    }
                    .frame(width: 58, height: 58)
                    Text("Friends can see this.").font(Theme.body(11)).foregroundStyle(Theme.muted)
                }
                field("Display Name") { TextField("", text: $name).textInputAutocapitalization(.words) }
                field("Username (unique handle)") {
                    Text(auth.session?.code ?? "\u{2014}").foregroundStyle(Theme.text2)
                }
                note("This is your friend handle and the key for all your data.")

                Seg(options: [("main", "Profile"), ("body", "Body Metrics")], selection: $tab).padding(.top, 6)
                VStack(alignment: .leading, spacing: 12) {
                    if tab == "main" { mainTab } else { bodyTab }
                    if let m = message {
                        Text(m.text).font(Theme.body(13, .semibold)).foregroundStyle(m.ok ? Theme.green : Theme.red)
                    }
                    Button(saving ? "Saving\u{2026}" : "Save Profile") { Task { await save() } }
                        .buttonStyle(AccentButtonStyle()).disabled(saving)
                }
                .padding(14).card(fill: Theme.bg3, radius: Theme.radius)

                sep(); BlockTitle(text: "Data & Backup")
                note("Changes sync to the cloud automatically, and your watch picks them up from there. Export any time for an offline copy.")
                HStack(spacing: 10) {
                    if let u = exportURL { ShareLink(item: u) { Text("Export") }.buttonStyle(GhostButtonStyle()) }
                    Button("Sync now") { Task { await store.refresh(auth: auth) } }.buttonStyle(GhostButtonStyle())
                }
                Text(store.dirty ? "Some changes are only on this phone so far. They go out on the next sync."
                                 : "Last synced " + (store.lastSynced.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? "never") + ".")
                    .font(Theme.body(12)).foregroundStyle(Theme.muted)

                sep(); BlockTitle(text: "Account")
                emailBlock
                note("Signing out removes this account's copy from this phone. Your workouts stay saved in your account.")
                Button("Sign Out") { Task { dismiss(); store.signedOut(); await auth.logOut() } }
                    .buttonStyle(GhostButtonStyle())
                Button { showDelete = true } label: {
                    Text("Delete Account").font(Theme.body(14, .semibold)).foregroundStyle(Theme.red).frame(maxWidth: .infinity).padding(.vertical, 11)
                }
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.red.opacity(0.5), lineWidth: 1))

                sep()
                Text("Jacked for iPhone " + (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""))
                    .font(Theme.body(11)).foregroundStyle(Theme.muted).frame(maxWidth: .infinity)
            }
        }
        .presentationDetents([.large])
        .sheet(isPresented: $showDelete) { DeleteAccountSheet() }
        .onAppear(perform: load)
        .task { await loadEmail() }
        .task(id: store.updatedAt) { exportURL = Self.writeExport(store.backup.raw) }
        .task {
            #if DEBUG
            if let p = DevHooks.profile { await devApply(p) }
            if DevHooks.deleteAccount != nil { try? await Task.sleep(nanoseconds: 800_000_000); showDelete = true }
            #endif
        }
    }

    // MARK: Tabs

    @ViewBuilder private var mainTab: some View {
        BlockTitle(text: "Preferences")
        label("Units")
        Seg(options: [("lb", "lb / in"), ("kg", "kg / cm")], selection: $unit)
        field("Default Rest (sec)") { TextField("90", text: $rest).keyboardType(.numberPad) }
        label("Progress badge rep range")
        HStack(spacing: 10) {
            field("Min") { TextField("5", text: $repMin).keyboardType(.numberPad) }
            field("Max") { TextField("12", text: $repMax).keyboardType(.numberPad) }
        }
        note("Every set at or above Max for 3 workouts in a row shows \"Ready to go up\"; a workout where no set reaches Min shows \"Consider lighter\" right away. Default 5 to 12.")
        Toggle(isOn: $autoRest) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Auto rest timer").font(Theme.body(14, .semibold)).foregroundStyle(Theme.text)
                Text("Start a rest countdown after each completed set").font(Theme.body(12)).foregroundStyle(Theme.muted)
            }
        }
        .tint(Theme.accent)
        sep(); BlockTitle(text: "Your Username")
        VStack(spacing: 6) {
            Text("Share this so friends can add you").font(Theme.body(11)).foregroundStyle(Theme.muted)
            Text(auth.session?.code ?? "\u{2014}").font(Theme.heading(26, .extraBold)).foregroundStyle(Theme.accent).textSelection(.enabled)
            Button("Copy Username") { UIPasteboard.general.string = auth.session?.code; message = ("Username copied", true) }
                .buttonStyle(GhostButtonStyle())
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private var bodyTab: some View {
        BlockTitle(text: "Body Metrics")
        note("Used for strength-based rankings on the Metrics tab and your achievement badges.")
        label("Body")
        Seg(options: [("male", "Male"), ("female", "Female")], selection: $sex)
        field("Body Weight (\(unit == "kg" ? "kg" : "lb"))") { TextField(unit == "kg" ? "80" : "175", text: $bw).keyboardType(.decimalPad) }
        label("Birthday")
        if hasBirthday {
            HStack {
                DatePicker("", selection: $birthday, in: ...Date(), displayedComponents: .date).labelsHidden().tint(Theme.accent)
                Spacer()
                Button("Clear") { hasBirthday = false }.font(Theme.body(13, .semibold)).foregroundStyle(Theme.text2)
            }
            if let a = Self.age(birthday) { note("Age \(a)") }
        } else {
            Button("Set birthday") { hasBirthday = true }.buttonStyle(GhostButtonStyle())
        }
    }

    @ViewBuilder private var emailBlock: some View {
        label("Email")
        if editingEmail {
            TextField("you@example.com", text: $emailIn).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(12).background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius)).foregroundStyle(Theme.text)
            HStack(spacing: 10) {
                Button("Cancel") { editingEmail = false }.buttonStyle(GhostButtonStyle())
                Button("Save email") { Task { await saveEmail() } }.buttonStyle(AccentButtonStyle())
            }
        } else {
            HStack(spacing: 10) {
                Text(emailNote ?? email ?? "No email on file").font(Theme.body(14)).foregroundStyle(email == nil || emailNote != nil ? Theme.muted : Theme.text)
                Spacer()
                if emailNote == nil {
                    Button(email == nil ? "Add email" : "Change") { emailIn = email ?? ""; editingEmail = true }
                        .font(Theme.body(14, .semibold)).foregroundStyle(Theme.text2).padding(.horizontal, 14).padding(.vertical, 8)
                        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.border2, lineWidth: 1))
                }
            }
        }
        note("Lets you log in with your email as well as your username.")
    }

    // MARK: Load / save

    private func load() {
        guard !loaded else { return }
        loaded = true
        let raw = store.backup.raw, s = store.backup.settings, p = raw["jk_prof"]?.object ?? [:]
        name = p["name"]?.string ?? ""
        unit = s.wUnit == "kg" ? "kg" : "lb"
        rest = String(s.restDefault); repMin = String(s.repMin); repMax = String(s.repMax); autoRest = s.autoRest
        sex = p["sex"]?.string == "female" ? "female" : "male"
        let kg = jsNum(raw["jk_bw"])
        bwShown = kg > 0 ? Self.shown(kg, unit) : 0
        bw = kg > 0 ? WorkoutMath.jsNumberString(bwShown) : ""
        if let b = p["birthday"]?.string, let d = Self.dayFmt.date(from: b) { hasBirthday = true; birthday = d }
    }

    /// saveProf(): same checks and the same keys as the web app, one careful save.
    private func save() async {
        let n = name.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty else { message = ("Enter a display name", false); return }
        let restV = min(600, max(5, Int(rest.trimmingCharacters(in: .whitespaces)) ?? 90))
        let mn = Int(repMin) ?? 5, mx = Int(repMax) ?? 12
        guard mn >= 1, mn <= 30, mx <= 50, mx > mn else { message = ("Rep range: Min must be lower than Max (Min 1-30, Max up to 50)", false); return }
        // The weight box is in the unit it was shown in; only a changed box is a new weigh-in.
        let shownUnit = store.backup.settings.wUnit == "kg" ? "kg" : "lb"
        let bwv = Double(bw.replacingOccurrences(of: ",", with: ".")) ?? 0
        let newKg: Double? = bwv > 0 && bwv != bwShown ? (shownUnit == "lb" ? bwv / 2.20462 : bwv) : nil
        let bday = hasBirthday ? Self.dayFmt.string(from: birthday) : ""
        let (u, a, sx) = (unit, autoRest, sex)
        saving = true; defer { saving = false }
        let ok = await store.edit(auth: auth) { raw in
            var st = raw["jk_settings"]?.object ?? [:]
            st["wUnit"] = .string(u); st["restDefault"] = .number(Double(restV)); st["autoRest"] = .bool(a)
            st["repMin"] = .number(Double(mn)); st["repMax"] = .number(Double(mx))
            raw["jk_settings"] = .object(st)
            var p = raw["jk_prof"]?.object ?? [:]
            let code = p["code"]?.string ?? p["username"]?.string ?? ""
            p["name"] = .string(n); p["username"] = .string(code); p["code"] = .string(code); p["sex"] = .string(sx); p["birthday"] = .string(bday)
            raw["jk_prof"] = .object(p)
            if let kg = newKg {
                raw["jk_bw"] = .number(kg)
                var log = (raw["jk_bwlog"]?.array ?? []).compactMap(\.object)
                let today = JackedDate.dayKey(Date())
                if let i = log.firstIndex(where: { $0["d"]?.string == today }) { log[i]["kg"] = .number(kg) } else { log.append(["d": .string(today), "kg": .number(kg)]) }
                log.sort { ($0["d"]?.string ?? "") < ($1["d"]?.string ?? "") }
                raw["jk_bwlog"] = .array(log.map(JSONValue.object))
            }
        }
        message = ok ? ("Profile saved \u{2713}", true) : ("Saved on this phone. It goes out on the next sync.", true)
        DevHooks.log("dev profile saved=\(ok)")
        if let kg = newKg { bwShown = Self.shown(kg, unit); bw = WorkoutMath.jsNumberString(bwShown) }
    }

    private func loadEmail() async {
        do {
            let o = try await Self.rpc("my_email", [:], auth: auth)
            guard o["status"]?.string == "ok" else { emailNote = "Couldn't load your email, reopen Profile to retry"; return }
            email = o["email"]?.string; emailNote = nil
        } catch let e as SupabaseError where e.code == "PGRST202" {
            emailNote = "Adding an email isn't switched on yet"
        } catch {
            emailNote = auth.session == nil ? "Sign in to add an email" : "Couldn't load your email, reopen Profile to retry"
        }
    }

    private func saveEmail() async {
        let v = emailIn.trimmingCharacters(in: .whitespaces)
        guard !v.isEmpty else { message = ("Enter an email address", false); return }
        if let bad = Username.emailProblem(v) { message = (bad == "Email too long" ? bad : "Enter a valid email address", false); return }
        if let e = email, v.lowercased() == e { editingEmail = false; return }
        do {
            let o = try await Self.rpc("set_my_email", ["p_email": .string(v)], auth: auth)
            switch o["status"]?.string {
            case "ok": let first = email == nil; email = o["email"]?.string ?? v.lowercased(); editingEmail = false
                message = (first ? "Email added \u{2713}" : "Email updated \u{2713}", true)
            case "email_taken": message = ("That email is already in use on another account", false)
            case "invalid_email": message = ("Enter a valid email address", false)
            case "not_authenticated": message = ("Sign in again to change your email", false)
            default: message = ("Could not save email \u{2014} try again", false)
            }
        } catch {
            message = ("Could not save email \u{2014} try again", false)
        }
    }

    static func rpc(_ fn: String, _ args: [String: JSONValue], auth: AuthStore) async throws -> [String: JSONValue] {
        guard let s = await auth.validSession() else { throw SupabaseError(status: 401, code: nil, message: "Signed out") }
        let d = try await SupabaseHTTP().send("POST", "rest/v1/rpc/\(fn)", body: JSONValue.object(args), bearer: s.accessToken)
        return (try? JSONDecoder().decode(JSONValue.self, from: d))?.object ?? [:]
    }

    /// exportData(): {_app, _version, _exported, data} as jacked-backup-YYYY-MM-DD.json, shared from a temp file.
    static func writeExport(_ raw: [String: JSONValue]) -> URL? {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let doc: JSONValue = .object(["_app": .string("jacked"), "_version": .string("ios"), "_exported": .string(f.string(from: Date())), "data": .object(raw)])
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("jacked-backup-\(JackedDate.dayKey(Date())).json")
        let enc = JSONEncoder(); enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let d = try? enc.encode(doc), (try? d.write(to: url)) != nil else { return nil }
        return url
    }

    #if DEBUG
    /// PROFILE=<field>=<value>,...: set those fields (name, unit, rest, repMin, repMax, autoRest, sex, bw, birthday) and Save.
    private func devApply(_ spec: String) async {
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        load()
        for kv in spec.split(separator: ",") {
            let parts = kv.split(separator: "=", maxSplits: 1).map(String.init); guard parts.count == 2 else { continue }
            switch parts[0] {
            case "name": name = parts[1]
            case "unit": unit = parts[1]
            case "rest": rest = parts[1]
            case "repMin": repMin = parts[1]
            case "repMax": repMax = parts[1]
            case "autoRest": autoRest = parts[1] == "1"
            case "sex": sex = parts[1]
            case "bw": bw = parts[1]
            case "birthday": if let d = Self.dayFmt.date(from: parts[1]) { birthday = d; hasBirthday = true } else { hasBirthday = false }
            case "tab": tab = parts[1]
            default: break
            }
        }
        if !spec.hasPrefix("tab=") { await save() }
    }
    #endif

    // MARK: Helpers

    static let dayFmt: DateFormatter = { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f }()
    static func shown(_ kg: Double, _ unit: String) -> Double { unit == "kg" ? (kg * 10).rounded() / 10 : (kg * 2.20462 * 10).rounded() / 10 }
    /// ageFromBirthday
    static func age(_ b: Date) -> Int? {
        let c = Calendar.current, t = c.dateComponents([.year, .month, .day], from: Date()), d = c.dateComponents([.year, .month, .day], from: b)
        var a = t.year! - d.year!
        if t.month! < d.month! || (t.month! == d.month! && t.day! < d.day!) { a -= 1 }
        return a >= 0 && a < 130 ? a : nil
    }
    private func sep() -> some View { Rectangle().fill(Theme.border).frame(height: 1).padding(.vertical, 6) }
    /// The PWA's <label>: small, bold, uppercase, muted.
    private func label(_ t: String) -> some View { Text(t.uppercased()).font(Theme.body(11, .bold)).tracking(0.6).foregroundStyle(Theme.text2) }
    private func note(_ t: String) -> some View { Text(t).font(Theme.body(12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true) }
    private func field<C: View>(_ l: String, @ViewBuilder _ c: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            label(l)
            c().font(Theme.body(15)).foregroundStyle(Theme.text).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.border2, lineWidth: 1))
        }
    }
}

/// .unit-tog: two buttons in a dark track, the picked one solid teal.
struct Seg: View {
    let options: [(String, String)]
    @Binding var selection: String
    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.0) { v, t in
                Button { selection = v } label: {
                    Text(t).font(Theme.body(14, .semibold)).foregroundStyle(selection == v ? Theme.onAccent : Theme.text2)
                        .frame(maxWidth: .infinity).padding(.vertical, 9)
                        .background(selection == v ? Theme.accent : .clear, in: RoundedRectangle(cornerRadius: 9))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4).background(Theme.bg4, in: RoundedRectangle(cornerRadius: Theme.radius))
    }
}

/// Delete Account (App Store rule 5.1.1(v)). The screen and the confirm step are real; the server
/// call that actually deletes is not switched on yet (AccountDeletion.serverLive), so tapping the
/// final button deletes nothing and says so.
struct DeleteAccountSheet: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @Environment(\.dismiss) private var dismiss
    @State private var typed = ""
    @State private var busy = false
    @State private var result: String?

    var body: some View {
        let code = auth.session?.code ?? ""
        let matches = !code.isEmpty && Username.normalize(typed) == code
        SheetScaffold(title: "Delete Account") {
            VStack(alignment: .leading, spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 34)).foregroundStyle(Theme.red).frame(maxWidth: .infinity)
                Text("This permanently deletes your Jacked account and everything in it: every workout, routine, personal record, body weight entry, badge and photo. You leave your friends' leaderboards and they can no longer see you. It can't be undone.")
                    .font(Theme.body(14)).foregroundStyle(Theme.text2).fixedSize(horizontal: false, vertical: true)
                Text("Want to keep your history? Use Export on your Profile first.").font(Theme.body(13)).foregroundStyle(Theme.muted)
                Text("Type your username to confirm").font(Theme.body(13, .semibold)).foregroundStyle(Theme.text2).padding(.top, 4)
                TextField(code, text: $typed).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .font(Theme.body(15)).foregroundStyle(Theme.text).padding(12)
                    .background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(matches ? Theme.red : Theme.border2, lineWidth: 1))
                if let r = result { Text(r).font(Theme.body(13, .semibold)).foregroundStyle(Theme.orange).fixedSize(horizontal: false, vertical: true) }
                Button { Task { await delete() } } label: {
                    Text(busy ? "Deleting\u{2026}" : "Delete my account").font(Theme.body(15, .semibold)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity).padding(.vertical, 13)
                        .background(Theme.red.opacity(matches && !busy ? 1 : 0.35), in: RoundedRectangle(cornerRadius: Theme.radius))
                }
                .disabled(!matches || busy)
                Button("Cancel") { dismiss() }.buttonStyle(GhostButtonStyle())
            }
        }
        .presentationDetents([.large])
        .task {
            #if DEBUG
            if let d = DevHooks.deleteAccount {
                try? await Task.sleep(nanoseconds: 600_000_000)
                typed = d == "confirm" ? (auth.session?.code ?? "") : d
                if d == "confirm" { await delete() }
            }
            #endif
        }
    }

    private func delete() async {
        busy = true; defer { busy = false }
        switch await AccountDeletion.delete(auth: auth) {
        case .deleted:
            dismiss(); store.signedOut(); await auth.logOut()
        case .notLive:
            result = "Account deletion isn't switched on yet. Nothing was deleted."
        case .failed(let m):
            result = "Could not delete your account: \(m). Nothing was deleted."
        }
        DevHooks.log("dev delete account result=\(result ?? "deleted")")
    }
}

/// The client half of account deletion. The server half (an Edge Function that removes the
/// profile, backups, friendships and the auth user) waits for Mr. Roni's go before it exists or
/// runs live, so serverLive stays false and delete() never sends anything until it's flipped.
enum AccountDeletion {
    static let serverLive = false
    static let functionPath = "functions/v1/jacked-delete-account"
    enum Outcome { case deleted, notLive, failed(String) }

    static func delete(auth: AuthStore) async -> Outcome {
        guard serverLive else { return .notLive }
        guard let s = await auth.validSession() else { return .failed("you're signed out") }
        do {
            _ = try await SupabaseHTTP().send("POST", functionPath, body: JSONValue.object(["confirm": .string(s.code)]), bearer: s.accessToken)
            return .deleted
        } catch let e as SupabaseError {
            return .failed(e.isNetwork ? "no connection" : e.message)
        } catch {
            return .failed(error.localizedDescription)
        }
    }
}
