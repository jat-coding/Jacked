import SwiftUI
import UIKit
import PhotosUI
import UniformTypeIdentifiers

/// #profModal (openProf / saveProf): name, the Profile and Body Metrics tabs (units, default rest,
/// progress rep range, auto rest timer, your username; body, body weight, birthday), Save Profile
/// through the careful save layer, Data & Backup (Export, Import, Sync now), the email on file
/// (my_email / set_my_email), Sign Out and, new for the App Store, Delete Account. The photo
/// (uploadAvatar / removeAvatar) and a username change (rename_profile) work like the web app's.
struct ProfileSheet: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var catalog: ExerciseCatalog
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
    @State private var username = ""
    @State private var photoItem: PhotosPickerItem?
    @State private var pickingPhoto = false
    @State private var photoMenu = false
    @State private var photoBusy = false
    @State private var importing = false
    @State private var feedbackText = ""
    @State private var feedbackBusy = false
    @State private var importBusy = false
    /// importJsonBackup's "REPLACE all current data" confirm, holding the file's jk_ keys.
    @State private var pendingBundle: [String: JSONValue]?
    /// askImportUnit: a CSV whose weights don't say lb or kg waits here for the answer.
    @State private var pendingCSV: ImportMath.CSVPlan?
    @State private var confirmReplace = false
    @State private var askUnit = false

    var body: some View {
        ScrollViewReader { proxy in
        SheetScaffold(title: "My Profile") {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 14) {
                    // renderAvPrev: the photo, else initials on the name's colour (avHTML), like the web app.
                    ZStack {
                        Circle().fill(Color(hex: FriendsMath.avc(name)))
                        Text(FriendsMath.avi(name)).font(Theme.body(23, .semibold)).foregroundStyle(Theme.onAccent)
                        if let u = store.backup.avatarURL {
                            CachedImage(url: u) { Color.clear }.clipShape(Circle())
                        }
                    }
                    .frame(width: 58, height: 58)
                    VStack(alignment: .leading, spacing: 6) {
                        // One "Edit Photo" button with a photo (Edit / Delete behind it), the plain picker without.
                        Button(photoBusy ? "Uploading\u{2026}" : store.backup.avatarURL == nil ? "Add Photo" : "Edit Photo") {
                            if store.backup.avatarURL == nil { pickingPhoto = true } else { photoMenu = true }
                        }
                        .font(Theme.body(13, .semibold)).foregroundStyle(Theme.text2).padding(.horizontal, 14).padding(.vertical, 7)
                        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.border2, lineWidth: 1))
                        .disabled(photoBusy)
                        Text("Friends can see this.").font(Theme.body(11)).foregroundStyle(Theme.muted)
                    }
                }
                field("Display Name") { TextField("", text: $name).textInputAutocapitalization(.words) }
                field("Username (unique handle)") {
                    TextField("@username", text: $username).textInputAutocapitalization(.never).autocorrectionDisabled()
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
                note("Changes sync to the cloud automatically, and your watch picks them up from there. Export any time for an offline copy. Import a Jacked backup, or a Hevy CSV export (.csv/.txt) to bring in your history.")
                HStack(spacing: 10) {
                    if let u = exportURL { ShareLink(item: u) { Text("Export") }.buttonStyle(GhostButtonStyle()) }
                    Button(importBusy ? "Importing\u{2026}" : "Import") { importing = true }.buttonStyle(GhostButtonStyle()).disabled(importBusy)
                    Button("Sync now") { Task { await store.refresh(auth: auth) } }.buttonStyle(GhostButtonStyle())
                }
                Text(store.dirty ? "Some changes are only on this phone so far. They go out on the next sync."
                                 : "Last synced " + (store.lastSynced.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? "never") + ".")
                    .font(Theme.body(12)).foregroundStyle(Theme.muted)

                sep(); BlockTitle(text: "Feedback").id("feedback")
                note("Found a bug or want a change? Send it our way.")
                TextField("What should we fix or add?", text: $feedbackText, axis: .vertical).lineLimit(3...6)
                    .onChange(of: feedbackText) { _, v in if v.count > 2000 { feedbackText = String(v.prefix(2000)) } }
                    .modifier(JackedFieldStyle(focused: false))
                Button(feedbackBusy ? "Sending\u{2026}" : "Send Feedback") { Task { await sendFeedback() } }
                    .buttonStyle(AccentButtonStyle()).disabled(feedbackBusy)

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
        .sheet(isPresented: $showDelete) { DeleteAccountSheet().popup() }
        .photosPicker(isPresented: $pickingPhoto, selection: $photoItem, matching: .images)
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            photoItem = nil
            Task { if let d = try? await item.loadTransferable(type: Data.self) { await uploadAvatar(d) } else { message = ("Pick an image file", false) } }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json, .commaSeparatedText, .plainText, .text, .data]) { r in
            guard case .success(let url) = r else { return }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let d = try? Data(contentsOf: url) else { message = ("Could not read that file", false); return }
            Task { await importText(String(decoding: d, as: UTF8.self)) }
        }
        .alert("Import will REPLACE all current data on this device. Continue?", isPresented: $confirmReplace) {
            Button("Cancel", role: .cancel) { pendingBundle = nil }
            Button("OK") { if let b = pendingBundle { pendingBundle = nil; Task { await applyBackup(b) } } }
        }
        .alert("This file doesn't say whether its weights are in pounds or kilograms. Which are they?", isPresented: $askUnit) {
            Button("Pounds (lb)") { if let p = pendingCSV { pendingCSV = nil; Task { await importCSV(p, unit: .lb) } } }
            Button("Kilograms (kg)") { if let p = pendingCSV { pendingCSV = nil; Task { await importCSV(p, unit: .kg) } } }
            Button("Cancel", role: .cancel) { pendingCSV = nil; message = ("Import cancelled", false) }
        }
        .confirmationDialog("Profile photo", isPresented: $photoMenu, titleVisibility: .visible) {
            Button("Edit") { pickingPhoto = true }
            Button("Delete", role: .destructive) { Task { await removeAvatar() } }
            Button("Cancel", role: .cancel) {}
        }
        .onAppear(perform: load)
        .task { await loadEmail() }
        .task(id: store.updatedAt) { exportURL = Self.writeExport(store.backup.raw) }
        .task {
            #if DEBUG
            if let p = DevHooks.profile, p == "scroll=feedback" { try? await Task.sleep(nanoseconds: 2_000_000_000); proxy.scrollTo("feedback", anchor: .top) }
            else if let p = DevHooks.profile { await devApply(p) }
            if DevHooks.deleteAccount != nil { try? await Task.sleep(nanoseconds: 800_000_000); showDelete = true }
            if let path = DevHooks.importFile { await devImport(path) }
            #endif
        }
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
        username = auth.session?.code ?? p["code"]?.string ?? ""
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
        let oldU = auth.session?.code ?? "", newU = FriendsMath.normU(username)
        if let e = FriendsMath.validU(newU) { message = (e, false); return }
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
        if newU != oldU {
            guard await changeUsername(from: oldU, to: newU) else { return }
            username = newU
        }
        let ok = await store.edit(auth: auth) { raw in
            var st = raw["jk_settings"]?.object ?? [:]
            st["wUnit"] = .string(u); st["restDefault"] = .number(Double(restV)); st["autoRest"] = .bool(a)
            st["repMin"] = .number(Double(mn)); st["repMax"] = .number(Double(mx))
            raw["jk_settings"] = .object(st)
            var p = raw["jk_prof"]?.object ?? [:]
            let code = newU
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

    /// saveProf()'s username branch: refuse one someone else has (public_profiles), then
    /// rename_profile re-keys the profile, backups, friend links and history on the server in one
    /// step. Sign-in keeps working: the login email belongs to the auth user, not the username.
    private func changeUsername(from old: String, to new: String) async -> Bool {
        guard let s = await auth.validSession() else { message = ("Sign in first to change your username", false); return false }
        if let d = try? await SupabaseHTTP().send("POST", "rest/v1/rpc/public_profiles", body: ["p_codes": [new]], bearer: s.accessToken),
           let row = (try? JSONDecoder().decode(JSONValue.self, from: d))?.array?.first?.object, row["code"]?.string != old {
            message = ("That username is already taken", false); return false
        }
        do {
            let o = try await Self.rpc("rename_profile", ["p_new": .string(new)], auth: auth)
            guard o["status"]?.string == "ok" else {
                message = (o["status"]?.string == "taken" ? "That username is already taken" : "Could not change username \u{2014} try again", false)
                DevHooks.log("dev rename_profile status=\(o["status"]?.string ?? "?")")
                return false
            }
        } catch {
            message = ("Could not change username \u{2014} try again", false); return false
        }
        // Follow the server: the phone's copies and the session move to the new name, then the
        // profile's own code/username are saved by the caller through the careful save layer.
        WorkoutSession.moveFile(from: old, to: new)
        store.rekey(to: new)
        auth.renamed(to: new)
        DevHooks.log("dev username changed \(old) -> \(new)")
        return true
    }

    /// uploadAvatar(): centre-cropped 256px JPEG at <code>.jpg in the avatars bucket (same path every
    /// time, so the profile gets a fresh ?v= stamp), then saved and published like the web app.
    private func uploadAvatar(_ data: Data) async {
        guard let jpeg = Self.squareJPEG(data) else { message = ("Pick an image file", false); return }
        guard let s = await auth.validSession() else { message = ("No connection \u{2014} try again later", false); return }
        photoBusy = true; defer { photoBusy = false }
        do {
            _ = try await SupabaseHTTP().upload("POST", "storage/v1/object/avatars/\(s.code).jpg", data: jpeg, contentType: "image/jpeg",
                                                bearer: s.accessToken, headers: ["x-upsert": "true", "cache-control": "max-age=3600"])
        } catch {
            DevHooks.log("dev avatar upload failed: \(error.localizedDescription)")
            message = ("Upload failed \u{2014} try again", false); return
        }
        let url = SupabaseConfig.url.absoluteString + "/storage/v1/object/public/avatars/\(s.code).jpg?v=\(Int64(Date().timeIntervalSince1970 * 1000))"
        let ok = await store.edit(auth: auth) { raw in
            var p = raw["jk_prof"]?.object ?? [:]; p["avatarUrl"] = .string(url); raw["jk_prof"] = .object(p)
        }
        DevHooks.log("dev avatar uploaded saved=\(ok)")
        message = ("Photo updated \u{2713}", true)
    }

    /// removeAvatar(): clear it on the profile first, then delete the file.
    private func removeAvatar() async {
        guard store.backup.avatarURL != nil else { return }
        let ok = await store.edit(auth: auth) { raw in
            var p = raw["jk_prof"]?.object ?? [:]; p["avatarUrl"] = .string(""); raw["jk_prof"] = .object(p)
        }
        if let s = await auth.validSession() {
            _ = try? await SupabaseHTTP().send("DELETE", "storage/v1/object/avatars", body: ["prefixes": ["\(s.code).jpg"]], bearer: s.accessToken)
        }
        DevHooks.log("dev avatar removed saved=\(ok)")
        message = ("Photo removed", true)
    }

    /// resizeAvatar(): centre square, 256 x 256, JPEG quality 0.82.
    static func squareJPEG(_ data: Data) -> Data? {
        guard let img = UIImage(data: data), img.size.width > 0, img.size.height > 0 else { return nil }
        let side = min(img.size.width, img.size.height), out = CGSize(width: 256, height: 256)
        let fmt = UIGraphicsImageRendererFormat(); fmt.scale = 1
        let scaled = UIGraphicsImageRenderer(size: out, format: fmt).image { _ in
            let k = 256 / side
            img.draw(in: CGRect(x: -(img.size.width - side) / 2 * k, y: -(img.size.height - side) / 2 * k,
                                width: img.size.width * k, height: img.size.height * k))
        }
        return scaled.jpegData(compressionQuality: 0.82)
    }

    /// submitFeedback(): one row into the `feedback` table (username + text), same as the web app.
    private func sendFeedback() async {
        let t = feedbackText.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { message = ("Type your feedback first", false); return }
        guard let s = auth.session else { message = ("Feedback needs a connection", false); return }
        feedbackBusy = true; defer { feedbackBusy = false }
        do {
            _ = try await SupabaseHTTP().send("POST", "rest/v1/feedback", body: ["username": s.code, "text": t], bearer: s.accessToken)
            feedbackText = ""; message = ("Thanks! Feedback sent", true)
        } catch let e as SupabaseError {
            message = (e.code == "53400" ? "Too much feedback in the last hour, try again later"
                       : e.isNetwork ? "Network error, try again" : "Could not send, try again", false)
        } catch { message = ("Network error, try again", false) }
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

    // MARK: Import (importData / importJsonBackup / importWorkoutCsv)

    /// importData(): a Jacked backup or a workout-log CSV, told apart by the text, not the file name.
    private func importText(_ text: String) async {
        message = nil
        if ImportMath.isJSON(text) {
            switch ImportMath.parseBackup(text) {
            case .invalid: message = ("Invalid backup file", false)
            case .noData: message = ("No Jacked data found in file", false)
            case .bundle(let b): pendingBundle = b; confirmReplace = !DevHooks.headless
            }
            return
        }
        switch ImportMath.plan(text) {
        case .failure(let e): message = (e.message, false)
        case .success(let p):
            if p.needsUnit { pendingCSV = p; askUnit = !DevHooks.headless } else { await importCSV(p, unit: nil) }
        }
    }

    /// The file's keys laid over this account's copy, then saved through merge + CAS like the web app's next sync.
    private func applyBackup(_ bundle: [String: JSONValue]) async {
        importBusy = true; defer { importBusy = false }
        var res: (written: [String], rejected: [String]) = ([], [])
        let sent = await store.edit(auth: auth) { raw in res = ImportMath.applyBundle(&raw, bundle) }
        if res.written.isEmpty { message = ("Nothing importable in that file \u{2014} nothing was changed.", false); return }
        load()
        let base = res.rejected.isEmpty ? "Data imported" : "Imported \u{2014} skipped \(res.rejected.count) malformed section(s)"
        message = (base + (sent ? "" : ". Saved on this phone, it goes out on the next sync."), res.rejected.isEmpty)
    }

    private func importCSV(_ p: ImportMath.CSVPlan, unit: ImportMath.CSVPlan.Unit?) async {
        importBusy = true; defer { importBusy = false }
        message = ("Reading workouts\u{2026}", true)
        if catalog.db.isEmpty { await catalog.load() }   // loadDB(): the matcher needs the exercise library
        guard !catalog.db.isEmpty else { message = ("The exercise library hasn't loaded yet. Try again when you're online.", false); return }
        var result: Result<ImportMath.CSVResult, ImportMath.CSVError> = .failure(.noNew)
        let sent = await store.edit(auth: auth) { raw in
            result = ImportMath.importCSV(p, unit: unit, raw: raw, lib: catalog.all(custom: raw))
            if case .success(let r) = result { raw = r.raw }
        }
        switch result {
        case .failure(let e): message = (e.message, false)
        case .success(let r):
            message = (ImportMath.doneMessage(r) + (sent ? "" : ". Saved on this phone, it goes out on the next sync."), r.badDate == 0)
            DevHooks.log("import: \(r.imported) workouts, \(r.badDate) bad dates, saved=\(sent)")
        }
    }

    #if DEBUG
    /// IMPORT=<file path>: read it and import it through the same path as the picker; the replace confirm is
    /// answered OK and the pounds/kilograms question with IMPORT_UNIT (lb | kg, unset = cancel).
    private func devImport(_ path: String) async {
        try? await Task.sleep(nanoseconds: 1_500_000_000)
        guard let d = FileManager.default.contents(atPath: path) else { DevHooks.log("import: can't read \(path)"); return }
        await importText(String(decoding: d, as: UTF8.self))
        if let b = pendingBundle { pendingBundle = nil; await applyBackup(b) }
        if let p = pendingCSV {
            pendingCSV = nil
            if let u = DevHooks.importUnit.flatMap(ImportMath.CSVPlan.Unit.init(rawValue:)) { await importCSV(p, unit: u) } else { message = ("Import cancelled", false) }
        }
        DevHooks.log("import done: \(message?.text ?? "")")
    }

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
            case "username": username = parts[1]
            case "photo":
                if parts[1] == "remove" { await removeAvatar() }
                else if let d = Self.devPhoto(parts[1]) { await uploadAvatar(d) }
                return
            default: break
            }
        }
        if !spec.hasPrefix("tab=") { await save() }
    }

    /// A generated test picture (the simulator's photo picker can't be driven over SSH): a teal
    /// square with these letters, sent through the same upload path as a picked photo.
    static func devPhoto(_ text: String) -> Data? {
        let size = CGSize(width: 600, height: 400)   // not square, so the centre crop is exercised too
        let img = UIGraphicsImageRenderer(size: size).image { ctx in
            UIColor(red: 0.1, green: 0.1, blue: 0.12, alpha: 1).setFill(); ctx.fill(CGRect(origin: .zero, size: size))
            UIColor(red: 0.13, green: 0.83, blue: 0.76, alpha: 1).setFill(); ctx.fill(CGRect(x: 100, y: 0, width: 400, height: 400))
            let a: [NSAttributedString.Key: Any] = [.font: UIFont.boldSystemFont(ofSize: 150), .foregroundColor: UIColor.black]
            let t = NSString(string: text), ts = t.size(withAttributes: a)
            t.draw(at: CGPoint(x: (size.width - ts.width) / 2, y: (size.height - ts.height) / 2), withAttributes: a)
        }
        return img.pngData()
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

/// Delete Account (App Store rule 5.1.1(v)). Type your username to confirm, then the server
/// function deletes the account for real and the app signs out.
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
                JIcon("warning", 34).foregroundStyle(Theme.red).frame(maxWidth: .infinity)
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

/// The client half of account deletion. The server half is the jacked-delete-account Edge Function
/// (supabase/functions/jacked-delete-account): it checks the typed username against the caller's
/// own session and removes the backup, history, friendships, photo, profile and the auth user.
/// Live since 2026-11-08 (supabase/tests/delete_account_live_test.mjs). serverLive = false turns
/// the button back into a no-op that sends nothing.
enum AccountDeletion {
    static let serverLive = true
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
