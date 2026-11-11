import SwiftUI

/// The badges (index.html cardBadges / achPageHtml / achRow / badgeInfo). Numbers come from
/// BadgeMath (parity-checked against the PWA's own computeBadges, Tests/parity/badges-run.sh).
enum BadgeUI {
    static let symbols = ["dumbbell": "dumbbell.fill", "trophy": "trophy.fill", "heart": "heart.fill", "target": "target", "flame": "flame.fill",
                          "calendarCheck": "calendar.badge.checkmark", "bed": "bed.double.fill", "arrowUp": "arrow.up.circle.fill", "crown": "crown.fill"]
    static func color(_ s: String) -> Color {
        switch s {
        case "blue": return Theme.blue
        case "orange": return Theme.orange
        case "green": return Theme.green
        case "muted": return Theme.muted
        case "accent": return Theme.accent
        default:
            let h = s.hasPrefix("#") ? String(s.dropFirst()) : s
            return Color(hex: UInt32(h, radix: 16) ?? 0x20D3C2)
        }
    }
    static let tierColor: [String: Color] = ["bronze": Color(hex: 0xCD7F32), "silver": Color(hex: 0xB8B8C8), "gold": Color(hex: 0xFFD700)]
    static let teal = Color(hex: 0x20D3C2), lockedGrey = Color(hex: 0x70707F)

    // MARK: earned-tier highlight (same award math: Badge.tier / Badge.ladder.reached from computeBadges)
    /// Colour for tier `i` (1 bronze ... 3 gold) when `rank` tiers are earned: unearned muted, earned in the
    /// tier's own colour, the highest earned white when more than one is earned.
    static func rungColor(_ i: Int, rank: Int) -> Color {
        if i > rank { return Theme.muted }
        if i == rank && rank > 1 { return Theme.text }
        return tierColor[["bronze", "silver", "gold"][i - 1]]!
    }
    static func rank(_ tier: String?) -> Int { TIER_RANK_UI[tier ?? ""] ?? 0 }
    static let TIER_RANK_UI = ["bronze": 1, "silver": 2, "gold": 3]
    /// desc line with the ladder numbers ("185 / 225 / 315") coloured by whether each rung is earned.
    static func ladderText(_ text: String, ladder: [Rung], base: Color) -> AttributedString {
        var a = AttributedString(text); a.foregroundColor = base
        guard ladder.count == 3 else { return a }
        let rank = ladder.filter(\.reached).count
        var from = text.startIndex
        for (i, r) in ladder.enumerated() {
            guard let rg = text.range(of: r.label, range: from..<text.endIndex),
                  let lo = AttributedString.Index(rg.lowerBound, within: a), let hi = AttributedString.Index(rg.upperBound, within: a) else { return a }
            a[lo..<hi].foregroundColor = rungColor(i + 1, rank: rank)
            a[lo..<hi].font = Theme.body(12, .heavy)
            from = rg.upperBound
        }
        return a
    }
    /// "Bronze 185 lb, Silver 225 lb, Gold 315 lb" phrases inside a how-text, earned ones highlighted.
    static func tierWordsText(_ text: String, rank: Int, base: Color) -> AttributedString {
        var a = AttributedString(text); a.foregroundColor = base
        guard let re = try? NSRegularExpression(pattern: "(Bronze|Silver|Gold) [^,]*?(?=,|\\.(?:\\s|$))") else { return a }
        for m in re.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
            guard let rg = Range(m.range, in: text), let lo = AttributedString.Index(rg.lowerBound, within: a), let hi = AttributedString.Index(rg.upperBound, within: a) else { continue }
            let w = String(text[rg].prefix(while: { $0 != " " }))
            let i = ["Bronze": 1, "Silver": 2, "Gold": 3][w] ?? 0
            if i <= rank { a[lo..<hi].foregroundColor = rungColor(i, rank: rank); a[lo..<hi].font = Theme.body(12, .heavy) }
        }
        return a
    }

    /// ACH_GROUPS: Monthly reset, 3-month reset, Permanent.
    static let groups = ["Monthly reset", "3-month reset", "Permanent"]
    static func group(_ b: Badge) -> Int {
        if !b.tiered && !b.threeMonth && (b.monthly || b.name == "Coward-Maxing" || b.name == "Jacked") { return 0 }
        if b.tiered || b.threeMonth { return 1 }
        return 2
    }
    /// achView(): Coward-Maxing stays hidden until earned.
    static func visible(_ all: [Badge]) -> [Badge] { all.filter { !($0.name == "Coward-Maxing" && !$0.earned) } }

    static func icon(_ b: Badge, size: CGFloat) -> some View {
        SFIcon(symbols[b.icon] ?? "rosette", size * 0.8)
            .foregroundStyle(b.earned ? color(b.color) : lockedGrey).frame(width: size, height: size)
    }
}

/// Metrics > Achievements: one tappable bar, badges earned / total (Coward-Maxing left out).
struct BadgesCardRow: View {
    let badges: [Badge]
    let open: () -> Void
    var body: some View {
        let list = BadgeUI.visible(badges).filter { $0.name != "Coward-Maxing" }
        Button(action: open) {
            HStack(spacing: 10) {
                SFIcon("medal.fill").foregroundStyle(Color(hex: 0xFFCA4D))
                Text("Badges earned").font(Theme.body(14, .semibold)).foregroundStyle(Theme.text)
                Spacer()
                Text("\(list.filter(\.earned).count) / \(list.count)").font(Theme.heading(18, .extraBold)).foregroundStyle(Theme.accent)
                SFIcon("chevron.right").foregroundStyle(Theme.muted)
            }
            .padding(.vertical, 4).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// #achFull: the Jacked box on top, then the badges in their reset groups, earned first.
struct AchievementsSheet: View {
    let result: MetricsMath.BadgeResult
    let m: MetricsMath
    @State var openBadge: Badge?
    var onStart: ((MetricsMath.BadgePlan) -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let vis = BadgeUI.visible(result.list)
        let jk = vis.first { $0.name == "Jacked" }
        let rest = vis.filter { $0.name != "Jacked" }.enumerated().sorted { a, b in
            (a.element.earned ? 1 : 0) != (b.element.earned ? 1 : 0) ? a.element.earned : a.offset < b.offset
        }.map(\.element)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Achievements").font(Theme.heading(30, .extraBold)).foregroundStyle(Theme.text)
                    Spacer()
                    Button { dismiss() } label: { JIcon("close", 14).foregroundStyle(Theme.text2)
                        .frame(width: 32, height: 32).background(Theme.bg3, in: Circle()) }.buttonStyle(.plain)
                }
                .padding(.bottom, 14)
                if let jk {
                    Button { openBadge = jk } label: {
                        HStack(spacing: 10) {
                            JIcon("crown", 24).foregroundStyle(jk.earned ? Color(hex: 0xFFD700) : BadgeUI.lockedGrey)
                            Text("Jacked").font(Theme.heading(26, .extraBold)).foregroundStyle(jk.earned ? Color(hex: 0xFFD700) : Theme.muted)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
                        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Color(hex: 0xFFD700).opacity(jk.earned ? 0.8 : 0.25), lineWidth: 1.5))
                        .opacity(jk.earned ? 1 : 0.6)
                    }
                    .buttonStyle(.plain).padding(.bottom, 6)
                }
                ForEach(0..<BadgeUI.groups.count, id: \.self) { gi in
                    let rows = rest.filter { BadgeUI.group($0) == gi }
                    if !rows.isEmpty {
                        Text(BadgeUI.groups[gi].uppercased()).font(Theme.body(11, .bold)).tracking(1.5).foregroundStyle(Theme.muted)
                            .padding(.top, 18).padding(.bottom, 4)
                        ForEach(rows) { b in
                            Button { openBadge = b } label: { row(b) }.buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(20)
        }
        .background(Theme.bg2.ignoresSafeArea())
        .sheet(item: $openBadge) { BadgeDetailSheet(b: $0, m: m, T: result.ladders, onStart: onStart).popup() }
    }

    private func row(_ b: Badge) -> some View {
        HStack(spacing: 12) {
            BadgeUI.icon(b, size: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(b.name).font(Theme.body(14, .bold)).foregroundStyle(Theme.text)
                Text(BadgeUI.ladderText(b.desc, ladder: b.ladder, base: Theme.muted)).font(Theme.body(12)).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 6)
            status(b)
        }
        .padding(.vertical, 10).opacity(b.earned ? 1 : 0.45).contentShape(Rectangle())
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 1) }
    }

    @ViewBuilder private func status(_ b: Badge) -> some View {
        if let t = b.tier, let c = BadgeUI.tierColor[t] {
            pill(t.capitalized, c, c.opacity(0.13), c.opacity(0.4))
        } else if b.earned && b.name != "Coward-Maxing" {
            pill("Earned", Theme.accent, Theme.accent.opacity(0.13), .clear)
        } else if b.earned {
            pill("Earned", Theme.green, Theme.green.opacity(0.13), .clear)
        } else {
            pill("Locked", Theme.muted, Theme.bg3, .clear)
        }
    }
    private func pill(_ t: String, _ fg: Color, _ bg: Color, _ stroke: Color) -> some View {
        Text(t).font(Theme.body(11, .bold)).foregroundStyle(fg).padding(.horizontal, 8).padding(.vertical, 4)
            .background(bg, in: Capsule()).overlay(Capsule().stroke(stroke, lineWidth: 1))
    }
}

extension Badge: Equatable { static func == (a: Badge, b: Badge) -> Bool { a.name == b.name } }

/// #badgeFull (badgeInfo): icon, status, title, stat line, how to earn it, the tier ladder with
/// "You" on the reached tier and each lift on the tier it reached, sections, highest ever, resets.
struct BadgeDetailSheet: View {
    let b: Badge
    let m: MetricsMath
    let T: MetricsMath.BadgeLadders
    /// badgeStart: close the badge pages, then start (or add to) the workout / open the library.
    var onStart: ((MetricsMath.BadgePlan) -> Void)? = nil
    @State private var open: Set<String> = []
    @EnvironmentObject private var session: WorkoutSession
    @EnvironmentObject private var catalog: ExerciseCatalog
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let how = m.badgeHow(b.name, T)
        // Tap a tier you've reached (or Highest ever) for the exact logged set that earned it (toggleTierXp).
        let xKey = MetricsMath.BADGE_KEY[b.name]
        let cross = xKey.map { m.tierCrossingDetail($0, m.last3mo(), T) } ?? [:]
        let teal = b.earned && b.tier == nil && b.name != "Coward-Maxing" && b.name != "Jacked"
        let col: Color = b.tier.flatMap { BadgeUI.tierColor[$0] } ?? (b.name == "Jacked" && b.earned ? Color(hex: 0xFFD700) : teal ? BadgeUI.teal : b.earned ? Theme.green : BadgeUI.lockedGrey)
        let status = b.tier ?? (b.earned ? "earned" : "locked")
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                HStack { Spacer()
                    BadgeUI.icon(b, size: 84).padding(22)
                        .background((teal ? BadgeUI.teal.opacity(0.14) : Theme.bg3), in: Circle())
                        .overlay(Circle().stroke(col.opacity(0.35), lineWidth: 1))
                        .shadow(color: col.opacity(0.4), radius: 30)
                    Spacer() }
                    .padding(.top, 10)
                Text(status.uppercased()).font(Theme.body(12, .heavy)).tracking(2).foregroundStyle(col).frame(maxWidth: .infinity)
                Text(b.name).font(Theme.heading(30, .extraBold)).foregroundStyle(Theme.text).frame(maxWidth: .infinity)
                Text(BadgeUI.ladderText(b.detail ?? b.desc, ladder: b.ladder, base: Theme.text2)).font(Theme.body(14)).multilineTextAlignment(.center).frame(maxWidth: .infinity)
                Rectangle().fill(Theme.border).frame(height: 1).padding(.vertical, 8)
                h("How to earn it"); para(how.how)
                ForEach(m.badgeExHow(b.name), id: \.t) { x in h(x.t); para(x.body) }
                if !how.tiers.isEmpty {
                    h("Tiers")
                    ForEach(how.tiers, id: \.0) { t, v in
                        let k = t.lowercased(), on = b.tier == k, c = BadgeUI.tierColor[k]!, rank = BadgeUI.rank(b.tier)
                        let reached = xKey != nil && (MetricsMath.TIER_RANK[k] ?? 0) <= (MetricsMath.TIER_RANK[b.tier ?? ""] ?? 0)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(t).font(Theme.body(14, .heavy)).foregroundStyle(c)
                                if on { Text("You").font(Theme.body(11, .bold)).foregroundStyle(Theme.bg).padding(.horizontal, 6).padding(.vertical, 2).background(c, in: Capsule()) }
                                Spacer()
                                Text(v).font(Theme.body(14, rank >= (MetricsMath.TIER_RANK[k] ?? 0) ? .heavy : .semibold)).foregroundStyle(BadgeUI.rungColor(MetricsMath.TIER_RANK[k] ?? 0, rank: rank))
                                if reached { SFIcon("chevron.right", 12).foregroundStyle(Theme.muted)
                                    .rotationEffect(.degrees(open.contains(k) ? 90 : 0)) }
                            }
                            ForEach(b.lifts.filter { $0.tier == k }, id: \.key) { l in liftRow(l) }
                        }
                        .padding(12).background(on ? c.opacity(0.08) : Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
                        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(on ? c.opacity(0.55) : .clear, lineWidth: 1))
                        .contentShape(Rectangle())
                        .onTapGesture { if reached { toggle(k) } }
                        if reached && open.contains(k) {
                            xp(cross[k].map { (MetricsMath.fmtD($0.ms), $0.ex, m.tierCrossStat(xKey!, $0)) },
                               none: "No logged set found for this tier -- it may predate your history.")
                        }
                    }
                    let below = b.lifts.filter { $0.tier == nil }
                    if !below.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Below Bronze").font(Theme.body(14, .heavy)).foregroundStyle(Theme.muted)
                            ForEach(below, id: \.key) { l in liftRow(l) }
                        }
                        .padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius)).opacity(0.7)
                    }
                }
                ForEach(b.sections, id: \.t) { s in
                    HStack(spacing: 8) { h(s.t); if s.met { Text("\u{2713} met").font(Theme.body(13, .semibold)).foregroundStyle(Theme.green).padding(.top, 10) } }
                    ForEach(s.rows, id: \.0) { l, v in
                        HStack { Text(l).font(Theme.body(14, .semibold)).foregroundStyle(Theme.text2); Spacer(); Text(v).font(Theme.body(14, .heavy)).foregroundStyle(Theme.text) }
                            .padding(12).background(s.met ? Theme.green.opacity(0.07) : Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
                            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(s.met ? Theme.green.opacity(0.45) : .clear, lineWidth: 1))
                    }
                }
                if let a = b.all {
                    h("Highest ever")
                    HStack {
                        Text(a.v).font(Theme.body(14, .heavy)).foregroundStyle(Theme.text)
                        Spacer()
                        if a.hasTier { Text(a.tier?.capitalized ?? "No tier").font(Theme.body(13, .bold)).foregroundStyle(Theme.muted) }
                    }
                    .overlay(alignment: .trailing) { if xKey != nil { SFIcon("chevron.right", 12).foregroundStyle(Theme.muted).padding(.trailing, -18)
                        .rotationEffect(.degrees(open.contains("all") ? 90 : 0)) } }
                    .padding(12).padding(.trailing, xKey != nil ? 18 : 0).background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius)).opacity(0.55)
                    .contentShape(Rectangle())
                    .onTapGesture { if xKey != nil { toggle("all") } }
                    if let k = xKey, open.contains("all") {
                        xp(m.allTimeBestDetail(k, m.hist).map { (MetricsMath.fmtD($0.ms), $0.ex, m.tierCrossStat(k, $0)) },
                           none: "No logged set found for this -- it may predate your history.")
                    }
                    Text("Your best in all of history. It never resets. The badge above only counts the last 3 months.").font(Theme.body(12)).foregroundStyle(Theme.muted)
                }
                if b.name == "Jacked", let ym = b.everYM, let mo = Int(ym.suffix(2)) {
                    h("Best in history"); para("Last held \(MetricsMath.MONTHS[mo - 1]) \(ym.prefix(4)). Held in \(b.months) month\(b.months != 1 ? "s" : "") so far.")
                }
                if b.name == "Jacked" && !b.earned {
                    h("Reward"); para("Something special happens the moment you unlock this. You will know it when you see it.")
                }
                if let n = how.note { h("Resets"); para(n) }
            }
            .padding(20)
        }
        .background(Theme.bg2.ignoresSafeArea())
        .presentationDragIndicator(.visible)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                if let plan = m.badgePlan(b, db: catalog.db), let onStart {
                    let label = session.active != nil && plan.page == nil ? (plan.ids.isEmpty ? "Back to my workout" : "Add to my current workout") : plan.label
                    Button(label) { onStart(plan) }.buttonStyle(AccentButtonStyle())
                }
                Button("Close") { dismiss() }.buttonStyle(GhostButtonStyle())
            }
            .padding(.horizontal, 20).padding(.top, 10).padding(.bottom, 6).background(Theme.bg2)
        }
        .onAppear { open.formUnion(DevHooks.tierXp) }
        .task {
            #if DEBUG
            if DevHooks.badgeStart, let plan = m.badgePlan(b, db: catalog.db) { try? await Task.sleep(nanoseconds: 1_200_000_000); onStart?(plan) }
            #endif
        }
    }

    private func toggle(_ k: String) { withAnimation(.easeOut(duration: 0.15)) { if open.contains(k) { open.remove(k) } else { open.insert(k) } } }
    /// .bf-tier-xp: "Nov 7, 2026 — **Bench Press (barbell)**: 185lb × 3 reps".
    private func xp(_ e: (String, String, String)?, none: String) -> some View {
        Group {
            if let e { Text("\(e.0) \u{2014} ") + Text(e.1).bold() + Text(": \(e.2)") } else { Text(none).foregroundStyle(Theme.muted) }
        }
        .font(Theme.body(13)).foregroundStyle(Theme.text2).padding(.horizontal, 12).padding(.bottom, 4).frame(maxWidth: .infinity, alignment: .leading)
    }
    private func h(_ t: String) -> some View {
        Text(t.uppercased()).font(Theme.body(11, .bold)).tracking(1.5).foregroundStyle(Theme.muted).padding(.top, 10)
    }
    private func para(_ t: String) -> some View {
        Text(t).font(Theme.body(14)).foregroundStyle(Theme.text2).fixedSize(horizontal: false, vertical: true)
    }
    private func liftRow(_ l: BadgeLift) -> some View {
        HStack { Text(l.label).font(Theme.body(13)).foregroundStyle(Theme.text2); Spacer(); Text(l.disp).font(Theme.body(13, .semibold)).foregroundStyle(Theme.text2) }
    }
}

extension MetricsView {
    /// computeBadges' own write: this month's Challenge group and the done / comeback / Jacked-month
    /// flags into jk_monthBadges, recomputed on the freshest copy inside the careful save layer.
    /// Skipped until the exercise library has loaded, since the Challenge pick reads muscle groups.
    @discardableResult
    static func saveMonthBadges(store: BackupStore, auth: AuthStore, db: [CatalogExercise]) async -> Bool {
        guard !db.isEmpty else { return false }
        let pre = MetricsMath(raw: store.backup.raw, lib: ExLib(db: db, raw: store.backup.raw)).computeBadges()
        guard pre.dirty else { return true }
        return await store.edit(auth: auth) { raw in
            let r = MetricsMath(raw: raw, lib: ExLib(db: db, raw: raw)).computeBadges()
            if r.dirty { raw["jk_monthBadges"] = .object(r.monthBadges) }
        }
    }
}
