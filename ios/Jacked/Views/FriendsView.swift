import SwiftUI

/// #page-leaderboard (index.html renderLB): the Leaderboards card (you + close buddies, This Month / All
/// Time, six categories), Close buddies and the rest of your friends with the star toggle, incoming
/// requests, and requests you sent. Numbers come from FriendsMath (parity-checked, Tests/parity/friends-run.sh).
struct FriendsView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var catalog: ExerciseCatalog
    @EnvironmentObject private var friends: FriendsStore
    @State private var cmp = "volume"
    @State private var range = "month"
    @State private var showAdd = false
    @State private var open: Person?
    @State private var crownInfo = false

    struct Cat { let k, icon: String; let col: Color; let label, how: String }
    static let cats = [
        Cat(k: "volume", icon: "dumbbell.fill", col: Color(hex: 0x5AA9FF), label: "Weight", how: "Total weight lifted since the 1st"),
        Cat(k: "prs", icon: "trophy.fill", col: Color(hex: 0xFFD700), label: "PRs", how: "PRs set since the 1st"),
        Cat(k: "workouts", icon: "calendar", col: Color(hex: 0x4B3FD6), label: "Sessions", how: "Workouts since the 1st"),
        Cat(k: "streak", icon: "flame.fill", col: Theme.orange, label: "Streak", how: "Longest run of training days this month"),
        Cat(k: "consistency", icon: "chart.bar.fill", col: Color(hex: 0xB07CFF), label: "Consistency", how: "Share of this month's days so far with a workout"),
        Cat(k: "badges", icon: "medal.fill", col: Color(hex: 0xFFCA4D), label: "Badges", how: "Monthly badges earned this month"),
    ]

    var body: some View {
        let raw = store.backup.raw
        let m = MetricsMath(raw: raw, lib: ExLib(db: catalog.db, raw: raw))
        let badges = m.computeBadges().list
        let you = m.yourStats(code: auth.session?.code ?? "", badges: badges)
        let cb = Set(raw["jk_closeBuddies"]?.array?.compactMap(\.string) ?? [])
        let accepted = friends.friends.filter { !$0.pending }, pending = friends.friends.filter(\.pending)
        let buddies = accepted.filter { cb.contains($0.code) }, others = accepted.filter { !cb.contains($0.code) }
        let crownAll = m.crownCodes([you] + accepted)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    PageHeader(title: "Friends") {
                        Button { showAdd = true } label: {
                            HStack(spacing: 4) {
                                Text("+ Friend")
                                if !pending.isEmpty {
                                    Text("\(pending.count)").font(Theme.body(10, .semibold)).foregroundStyle(.white)
                                        .padding(.horizontal, 4).frame(minWidth: 16, minHeight: 16).background(Color(hex: 0xFF453A), in: Capsule())
                                }
                            }
                        }
                        .buttonStyle(HeaderPillStyle())
                    }
                    board(m: m, you: you, buddies: buddies)
                    VStack(alignment: .leading, spacing: 0) {
                        BlockTitle(text: "Friends")
                        if !buddies.isEmpty {
                            subTitle(star: true, "Close buddies")
                            ForEach(buddies) { row($0, star: true, cb: cb, crown: crownAll) }
                        }
                        if !others.isEmpty {
                            if !buddies.isEmpty { subTitle(star: false, "Buddies").padding(.top, 10) }
                            ForEach(others) { row($0, star: false, cb: cb, crown: crownAll) }
                        } else if accepted.isEmpty {
                            muted(friends.loaded ? "No friends yet. Tap + Friend to add by username." : "Loading friends...")
                        }   // every friend starred: the web app hides the rest-of-friends block entirely
                    }
                    .padding(16).card()
                    if !pending.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            HStack(spacing: 6) { JIcon("hourglass", 16).foregroundStyle(Theme.text).padding(.bottom, 12); BlockTitle(text: "Pending") }
                            ForEach(pending) { p in
                                reqRow(p, note: nil) {
                                    Button("Accept") { Task { await friends.accept(p.code, auth: auth) } }.buttonStyle(SmallPill(fill: Theme.accent, fg: Theme.onAccent))
                                    Button("Decline") { Task { await friends.remove(p.code, auth: auth, store: store) } }.buttonStyle(SmallPill(fill: Theme.red.opacity(0.15), fg: Theme.red))
                                }
                            }
                        }
                        .padding(16).card()
                    }
                    if !friends.sent.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            BlockTitle(text: "Requests you sent")
                            ForEach(friends.sent) { p in
                                reqRow(p, note: "waiting for them to accept") {
                                    Button("Cancel") { Task { await friends.remove(p.code, auth: auth, store: store) } }.buttonStyle(SmallPill(fill: Theme.red.opacity(0.15), fg: Theme.red))
                                }
                            }
                        }
                        .padding(16).card()
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 30)
            }
            .contentMargins(.bottom, 78, for: .scrollContent)   // clears the floating tab capsule (the TabView inset never reaches these scroll views)
            .refreshable { await store.refresh(auth: auth); await friends.refresh(auth: auth) }   // same sync as Profile's Sync now, plus the friend list
            .background(Theme.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
        .overlay(alignment: .top) { ToastView(text: $friends.toast) }
        .sheet(isPresented: $showAdd) { AddFriendSheet(code: auth.session?.code ?? "", prefill: DevHooks.addFriend ?? "").popup() }
        .sheet(item: $open) { p in
            FriendProfileSheet(p: p, m: m, badges: badges, settings: store.backup.settings)
                .environmentObject(auth).environmentObject(store).environmentObject(friends)
                .popup()
        }
        .alert("Last month's winner", isPresented: $crownInfo) { Button("Got it", role: .cancel) {} } message: {
            Text("The crown goes to whoever lifted the most total weight last calendar month, among the people on that leaderboard. It only counts last month's weight lifted, and it stays all month. Nobody who lifted nothing gets it.")
        }
        .task(id: auth.session?.code) {
            await friends.refresh(auth: auth)
            #if DEBUG
            await runDev(you: you)
            #endif
        }
        .task {
            while !Task.isCancelled {   // the PWA polls every 75 s while the Friends tab is open
                try? await Task.sleep(nanoseconds: 75_000_000_000)
                await friends.refresh(auth: auth)
            }
        }
    }

    // MARK: the Leaderboards card

    @ViewBuilder private func board(m: MetricsMath, you: Person, buddies: [Person]) -> some View {
        let def = Self.cats.first { $0.k == cmp } ?? Self.cats[0]
        let s = store.backup.settings
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                BlockTitle(text: "Leaderboards")
                Button { crownInfo = true } label: {
                    HStack(spacing: 4) { JIcon("crown", 11).foregroundStyle(Color(hex: 0xFFD700)); Text("Last month's winner") }
                        .font(Theme.body(12, .semibold)).foregroundStyle(Theme.text2)
                }.buttonStyle(.plain).padding(.top, 6)
            }
            HStack(spacing: 3) {
                ForEach([("month", "This Month"), ("all", "All Time")], id: \.0) { k, l in
                    Button { range = k } label: {
                        Text(l).font(Theme.body(13, .semibold)).frame(maxWidth: .infinity).padding(.vertical, 7)
                            .foregroundStyle(range == k ? Theme.onAccent : Theme.muted)
                            .background(range == k ? Theme.accent : .clear, in: RoundedRectangle(cornerRadius: 6))
                    }.buttonStyle(.plain)
                }
            }
            .padding(3).background(Theme.bg4, in: RoundedRectangle(cornerRadius: 8)).padding(.bottom, 10)
            CmpChips(cats: Self.cats, on: $cmp)
            if range == "month" { Text(def.how).font(Theme.body(11)).foregroundStyle(Theme.muted).padding(.bottom, 8) }
            if buddies.isEmpty {
                (Text("Mark friends as ") + Text("\u{2605}").foregroundColor(Color(hex: 0xFFD700)) + Text(" close buddies below to compare them here."))
                    .font(Theme.body(13)).foregroundStyle(Theme.muted).padding(.vertical, 6)
            } else {
                let people = [you] + buddies
                let val = Dictionary(people.map { ($0.code, value(def.k, $0, m)) }, uniquingKeysWith: { a, _ in a })
                let ranked = people.sorted { a, b in
                    let va = val[a.code] ?? 0, vb = val[b.code] ?? 0
                    if va != vb { return va > vb }
                    if a.isYou != b.isYou { return a.isYou }
                    return a.name.localizedCompare(b.name) == .orderedAscending
                }
                let crowned = m.crownCodes(people)
                if range == "month" && ranked.allSatisfy({ (val[$0.code] ?? 0) == 0 }) {
                    muted("New month, fresh board. Nobody has a \(def.label.lowercased()) number yet this month.")
                }
                ForEach(Array(ranked.enumerated()), id: \.element.code) { i, p in
                    let v = val[p.code] ?? 0, z = v == 0
                    Button { open = p } label: {
                        HStack(spacing: 12) {
                            Group {
                                if z { Text("\u{2013}").foregroundStyle(Theme.muted) }
                                else if i < 3 { SFIcon("medal.fill").foregroundStyle([Color(hex: 0xFFD700), Color(hex: 0xB8B8C8), Color(hex: 0xCD7F32)][i]) }
                                else { Text("#\(i + 1)").foregroundStyle(Theme.muted) }
                            }
                            .font(Theme.heading(20, .extraBold)).frame(width: 32)
                            Avatar(p: p, size: 42)
                            nameBlock(p, sub: p.username, crown: crowned.contains(p.code))
                            HStack(spacing: 3) {
                                Text(fmt(def.k, v, s))
                                if def.k == "badges" { JIcon("medal", 14) }
                            }
                            .font(Theme.heading(20, .extraBold)).foregroundStyle(i == 0 && !z ? Theme.accent : Theme.text2)
                        }
                        .padding(12).modifier(RowBox(gilded: hasJacked(p, m: m, badges: nil), you: p.isYou))
                    }.buttonStyle(.plain)
                }
            }
        }
        .padding(16).card()
    }

    private func value(_ k: String, _ p: Person, _ m: MetricsMath) -> Double {
        if range == "all" {
            switch k { case "prs": return p.prs; case "workouts": return p.workouts; case "streak": return p.streak
            case "consistency": return p.consistency; case "badges": return p.badges; default: return p.totalVolume }
        }
        let x = m.monthOf(p)
        switch k { case "prs": return x.p; case "workouts": return x.w; case "streak": return x.st; case "consistency": return x.c; case "badges": return x.b; default: return x.v }
    }

    private func fmt(_ k: String, _ v: Double, _ s: Settings) -> String {
        switch k {
        case "volume": return HomeMath.fmtV(s.display(v)) + " " + s.unitLabel
        case "streak": return WorkoutMath.n(v) + "d"
        case "consistency": return WorkoutMath.n(v) + "%"
        default: return WorkoutMath.n(v)
        }
    }

    private func hasJacked(_ p: Person, m: MetricsMath, badges: [Badge]?) -> Bool { p.hasJacked }

    // MARK: rows

    private func row(_ p: Person, star: Bool, cb: Set<String>, crown: Set<String>) -> some View {
        Button { open = p } label: {
            HStack(spacing: 10) {
                Avatar(p: p, size: 42)
                nameBlock(p, sub: "\(p.username) \u{00B7} \(WorkoutMath.n(p.workouts)) workouts \u{00B7} \(WorkoutMath.n(p.badges))", medal: true, crown: crown.contains(p.code))
                Button { Task { await toggleCB(p.code) } } label: {
                    Text("\u{2605}").font(.system(size: 16)).foregroundStyle(cb.contains(p.code) ? Color(hex: 0xFFD700) : Theme.muted)
                        .frame(width: 34, height: 30).background(Theme.bg4, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain).accessibilityLabel("Close buddy")
            }
            .padding(.vertical, 12).contentShape(Rectangle())
            .modifier(RowBox(gilded: p.hasJacked, plain: !p.hasJacked))
        }.buttonStyle(.plain)
    }

    private func reqRow<B: View>(_ p: Person, note: String?, @ViewBuilder buttons: () -> B) -> some View {
        HStack(spacing: 10) {
            Avatar(p: p, size: 42)
            nameBlock(p, sub: p.username + (note.map { " \u{00B7} " + $0 } ?? ""))
            HStack(spacing: 6) { buttons() }
        }
        .padding(12).background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.accent.opacity(0.25), lineWidth: 1)).padding(.bottom, 8)
    }

    private func nameBlock(_ p: Person, sub: String, medal: Bool = false, crown: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 5) {
                if crown { JIcon("crown", 12).foregroundStyle(Color(hex: 0xFFD700)) }
                Text(p.name).font(Theme.body(14, .semibold)).foregroundStyle(Theme.text).lineLimit(1)
                if p.isYou { Text("(You)").font(Theme.body(10, .bold)).foregroundStyle(Theme.accent) }
            }
            HStack(spacing: 3) {
                Text(sub).lineLimit(1)
                if medal { JIcon("medal", 10) }
            }
            .font(Theme.body(11)).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func subTitle(star: Bool, _ t: String) -> some View {
        HStack(spacing: 4) {
            if star { JIcon("starfill", 11).foregroundStyle(Color(hex: 0xFFD700)) }
            Text(t.uppercased())
        }
        .font(Theme.body(11, .bold)).tracking(0.8).foregroundStyle(Theme.muted).padding(.bottom, 6)
    }

    private func muted(_ t: String) -> some View { Text(t).font(Theme.body(13)).foregroundStyle(Theme.muted).padding(.vertical, 6) }

    /// toggleCB(): the star. jk_closeBuddies rides the blob, so it goes through merge + compare-and-swap.
    @discardableResult
    private func toggleCB(_ code: String) async -> Bool {
        await store.edit(auth: auth) { raw in
            var cb = raw["jk_closeBuddies"]?.array?.compactMap(\.string) ?? []
            if let i = cb.firstIndex(of: code) { cb.remove(at: i) } else { cb.append(code) }
            raw["jk_closeBuddies"] = .array(cb.map(JSONValue.string))
        }
    }

    #if DEBUG
    private func runDev(you: Person) async {
        guard !Self.devRan else { return }
        Self.devRan = true
        if let c = DevHooks.cmp { let p = c.split(separator: "|"); cmp = String(p[0]); if p.count > 1 { range = String(p[1]) } }
        if let code = DevHooks.toggleCB { DevHooks.log("dev close buddy toggled=\(await toggleCB(code))") }
        if let code = DevHooks.acceptFriend { await friends.accept(code, auth: auth); DevHooks.log("dev accept: \(friends.toast ?? "")") }
        if let code = DevHooks.removeFriend { await friends.remove(code, auth: auth, store: store); DevHooks.log("dev remove: \(friends.toast ?? "")") }
        if DevHooks.addFriend != nil { showAdd = true }
        DevHooks.log("friends: \(friends.friends.filter { !$0.pending }.map(\.code)) pending \(friends.friends.filter(\.pending).map(\.code)) sent \(friends.sent.map(\.code))")
        if let o = DevHooks.open, o.hasPrefix("friend:") {
            let c = String(o.dropFirst(7)).split(separator: "/").first.map(String.init) ?? ""
            open = c == "me" ? you : friends.friends.first { $0.code == c }
        }
    }
    static var devRan = false
    #endif
}

/// The PWA's category chips, wrapped onto as many lines as they need.
private struct CmpChips: View {
    let cats: [FriendsView.Cat]
    @Binding var on: String
    var body: some View {
        let rows = [Array(cats.prefix(3)), Array(cats.dropFirst(3))]
        VStack(alignment: .leading, spacing: 6) {
            ForEach(0..<rows.count, id: \.self) { r in
                HStack(spacing: 6) {
                    ForEach(rows[r], id: \.k) { c in
                        Button { on = c.k } label: {
                            HStack(spacing: 4) { SFIcon(c.icon, 10); Text(c.label) }
                        }.buttonStyle(ChipButtonStyle(on: on == c.k))
                    }
                }
            }
        }
        .padding(.bottom, 10)
    }
}

/// .lbi / .fc / .gilded: a bg3 box, or the gold-edged one for someone holding Jacked.
struct RowBox: ViewModifier {
    var gilded = false
    var plain = false
    var you = false
    func body(content: Content) -> some View {
        if gilded {
            content.padding(.horizontal, plain ? 0 : 0)
                .background(LinearGradient(colors: [Color(hex: 0xFFD700).opacity(0.10), Color(hex: 0xFFD700).opacity(0.02)], startPoint: .topLeading, endPoint: .bottomTrailing),
                            in: RoundedRectangle(cornerRadius: Theme.radius))
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Color(hex: 0xFFD700).opacity(0.55), lineWidth: 1)).padding(.bottom, 8)
        } else if plain {
            content.overlay(alignment: .top) { Rectangle().fill(Color(hex: 0x23232B)).frame(height: 1) }
        } else if you {   // .lbyou
            content.background(Theme.accent.opacity(0.06), in: RoundedRectangle(cornerRadius: Theme.radius))
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.accent, lineWidth: 1)).padding(.bottom, 8)
        } else {
            content.background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.border, lineWidth: 1)).padding(.bottom, 8)
        }
    }
}

/// avHTML(): the photo if there is one, else the initials on the name's colour.
struct Avatar: View {
    let p: Person; let size: CGFloat
    var body: some View {
        ZStack {
            Circle().fill(Color(hex: FriendsMath.avc(p.name)))
            Text(FriendsMath.avi(p.name)).font(Theme.body(size * 0.4, .semibold)).foregroundStyle(Theme.onAccent)
            if let u = URL(string: p.avatarUrl), !p.avatarUrl.isEmpty {
                CachedImage(url: u) { Color.clear }.clipShape(Circle())
            }
        }
        .frame(width: size, height: size)
    }
}

struct ToastView: View {
    @Binding var text: String?
    var body: some View {
        if let t = text {
            Text(t).font(Theme.body(13, .semibold)).foregroundStyle(Theme.text).padding(.horizontal, 16).padding(.vertical, 10)
                .background(Theme.bg4, in: Capsule()).overlay(Capsule().stroke(Theme.border2, lineWidth: 1)).padding(.top, 8)
                .transition(.move(edge: .top).combined(with: .opacity))
                .task(id: t) { try? await Task.sleep(nanoseconds: 2_600_000_000); if text == t { withAnimation { text = nil } } }
        }
    }
}

/// #afModal: your username and invite link (share or copy), or add someone by username.
struct AddFriendSheet: View {
    let code: String
    @State var prefill: String
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @EnvironmentObject private var catalog: ExerciseCatalog
    @EnvironmentObject private var friends: FriendsStore
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var copied = false

    /// inviteLink(): the web app's address + ?add=<username without the @>.
    var link: String { code.isEmpty ? "" : "https://jacked-trainer.netlify.app/?add=" + (String(code.drop { $0 == "@" }).addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "") }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Add Friend").font(Theme.heading(26, .extraBold)).foregroundStyle(Theme.text)
                Spacer()
                Button { dismiss() } label: { JIcon("close", 14).foregroundStyle(Theme.text2)
                    .frame(width: 32, height: 32).background(Theme.bg3, in: Circle()) }.buttonStyle(.plain)
            }
            VStack(spacing: 6) {
                Text("Invite a friend \u{2014} send your link").font(Theme.body(11)).foregroundStyle(Theme.muted)
                Text(code.isEmpty ? "\u{2014}" : code).font(Theme.heading(24, .extraBold)).tracking(1).foregroundStyle(Theme.accent)
                Text(link).font(Theme.body(11)).foregroundStyle(Theme.muted).multilineTextAlignment(.center).padding(.bottom, 4)
                HStack(spacing: 8) {
                    if let u = URL(string: link) {
                        ShareLink(item: u, message: Text("Add me on Jacked: \(link)")) { Text("Text / Share").frame(maxWidth: .infinity) }
                            .buttonStyle(SmallPill(fill: Theme.accent, fg: Theme.onAccent))
                    }
                    Button { UIPasteboard.general.string = link; friends.toast = "Invite link copied" } label: { Text("Copy link").frame(maxWidth: .infinity) }
                        .buttonStyle(SmallPill(fill: Theme.bg4, fg: Theme.text))
                }
            }
            .padding(14).frame(maxWidth: .infinity).background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
            Text("Or add by username").font(Theme.body(12, .semibold)).foregroundStyle(Theme.text2)
            TextField("@username", text: $prefill)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .font(Theme.heading(18, .bold)).tracking(1).foregroundStyle(Theme.text)
                .padding(12).background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
                .onChange(of: prefill) { _, v in if v.count > 21 { prefill = String(v.prefix(21)) } }
            Button {
                guard !busy else { return }
                busy = true
                Task {
                    let raw = store.backup.raw, m = MetricsMath(raw: raw, lib: ExLib(db: catalog.db, raw: raw))
                    let close = await friends.add(prefill, auth: auth) { await friends.publish(m.publishColumns(badges: m.computeBadges().list), auth: auth) }
                    busy = false
                    if close { prefill = ""; dismiss() }
                }
            } label: { Text(busy ? "Adding..." : "Add Friend").frame(maxWidth: .infinity) }
                .buttonStyle(AccentButtonStyle()).disabled(busy)
            Spacer()
        }
        .padding(20).background(Theme.bg2.ignoresSafeArea())
        .overlay(alignment: .top) { ToastView(text: $friends.toast) }
        .presentationDetents([.medium, .large])
        .task {
            #if DEBUG
            if DevHooks.addFriendSend, !prefill.isEmpty {
                try? await Task.sleep(nanoseconds: 800_000_000)
                let raw = store.backup.raw, m = MetricsMath(raw: raw, lib: ExLib(db: catalog.db, raw: raw))
                let close = await friends.add(prefill, auth: auth) { await friends.publish(m.publishColumns(badges: m.computeBadges().list), auth: auth) }
                DevHooks.log("dev add friend: \(friends.toast ?? "") close=\(close)")
            }
            #endif
        }
    }
}
