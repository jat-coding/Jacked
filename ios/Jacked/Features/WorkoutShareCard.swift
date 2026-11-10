import SwiftUI

/// The finished-workout share card, drawn like the web app's recap image (recapImage in index.html):
/// 1080 px wide, dark gradient, teal rounded frame, JACKED. wordmark top left, big title, stat tiles,
/// gold best-lift lines, "Tracked with Jacked" footer. Rendered to a PNG with ImageRenderer and shared
/// through the system share sheet.
struct WorkoutShareCard: View {
    let name: String, dateLabel: String, duration: String, sets: Int, volume: String, unit: String
    let prs: [(name: String, detail: String)]

    static let width: CGFloat = 1080
    static var height: CGFloat { 1350 }
    private let gold = Color(hex: 0xFFD700), line = Color(hex: 0x2C2C38), tile = Color(hex: 0x0D0D11), sub = Color(hex: 0x8A8A98)

    var body: some View {
        ZStack(alignment: .topLeading) {
            LinearGradient(colors: [Color(hex: 0x17171E), Color(hex: 0x0A0A0D)], startPoint: .top, endPoint: .bottom)
            RoundedRectangle(cornerRadius: 44).strokeBorder(Theme.accent, lineWidth: 4).padding(26)
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text("JACKED.").font(Theme.heading(60, .black)).tracking(1).foregroundStyle(Theme.accent)
                    Spacer()
                    Text("WORKOUT COMPLETE").font(Theme.body(26, .semibold)).tracking(1).foregroundStyle(sub)
                }
                Text(name).font(Theme.heading(112, .black)).foregroundStyle(Theme.text).lineLimit(2).minimumScaleFactor(0.5)
                    .padding(.top, 38)
                Text(dateLabel.uppercased()).font(Theme.body(30, .semibold)).tracking(2).foregroundStyle(sub).padding(.top, 6)
                HStack(spacing: 24) {
                    statTile(duration, "TIME"); statTile("\(sets)", "SETS")
                }.padding(.top, 48)
                HStack(spacing: 24) {
                    statTile(volume, "\(unit.uppercased()) LIFTED"); statTile("\(prs.count)", "PERSONAL RECORDS", gold: !prs.isEmpty)
                }.padding(.top, 24)
                if !prs.isEmpty {
                    Text("NEW PRS").font(Theme.body(26, .semibold)).tracking(2).foregroundStyle(sub).padding(.top, 48).padding(.bottom, 14)
                    ForEach(Array(prs.prefix(4).enumerated()), id: \.offset) { _, p in
                        HStack {
                            Text(p.name).font(Theme.body(34, .semibold)).foregroundStyle(Theme.text).lineLimit(1)
                            Spacer(minLength: 16)
                            Text(p.detail).font(Theme.heading(46, .bold)).foregroundStyle(gold)
                        }
                        .padding(.horizontal, 30).frame(height: 100)
                        .background(tile, in: RoundedRectangle(cornerRadius: 26))
                        .overlay(RoundedRectangle(cornerRadius: 26).strokeBorder(line, lineWidth: 2))
                        .padding(.bottom, 14)
                    }
                    if prs.count > 4 { Text("+ \(prs.count - 4) more").font(Theme.body(26)).foregroundStyle(sub) }
                }
                Spacer(minLength: 0)
                Text("Tracked with Jacked").font(Theme.body(26, .semibold)).foregroundStyle(Color(hex: 0x6A6A78))
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 72).padding(.top, 74).padding(.bottom, 64)
        }
        .frame(width: Self.width, height: Self.height)
    }

    private func statTile(_ v: String, _ l: String, gold g: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(v).font(Theme.heading(92, .black)).foregroundStyle(g ? gold : Theme.text).lineLimit(1).minimumScaleFactor(0.5)
            Text(l).font(Theme.body(24, .semibold)).tracking(1).foregroundStyle(sub)
        }
        .padding(.horizontal, 30).padding(.vertical, 26).frame(maxWidth: .infinity, alignment: .leading)
        .background(tile, in: RoundedRectangle(cornerRadius: 26))
        .overlay(RoundedRectangle(cornerRadius: 26).strokeBorder(line, lineWidth: 2))
    }

    /// The card for a finished workout's summary.
    init(summary s: WorkoutSession.Summary, settings: Settings, date: Date = Date()) {
        name = s.name
        dateLabel = date.formatted(.dateTime.month(.abbreviated).day().year())
        duration = s.duration; sets = s.sets
        volume = HomeMath.fmtV(settings.display(s.volume)); unit = settings.unitLabel
        prs = s.prs.map { p in (p.name, p.label ?? "\(WorkoutMath.n(settings.display(p.weight)))\(settings.unitLabel) × \(Int(p.reps))") }
    }

    init(name: String, dateLabel: String, duration: String, sets: Int, volume: String, unit: String, prs: [(name: String, detail: String)]) {
        self.name = name; self.dateLabel = dateLabel; self.duration = duration; self.sets = sets
        self.volume = volume; self.unit = unit; self.prs = prs
    }

    /// 1080 x 1350 px PNG-ready image (scale 1, so the pixel size is exact on any phone).
    @MainActor
    func render() -> UIImage? {
        let r = ImageRenderer(content: self.environment(\.colorScheme, .dark))
        r.scale = 1
        return r.uiImage
    }
}
