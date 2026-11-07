import SwiftUI

/// bodySimSVG(score, sex): the Muscle Map's front and back figure, each region tinted with
/// heatColor(score[group]) and every unmapped region (head, hands, knees...) in BODY_NEUTRAL,
/// the outline stroked on top. Artwork is the PWA's own BODY_ART (Data/BodyArt.swift, generated).
struct BodyFigure: View {
    let score: [String: Double]
    let female: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            side(front: true)
            side(front: false)
        }
        .frame(maxWidth: .infinity)
    }

    private func side(front: Bool) -> some View {
        let fig = (front ? "front" : "back") + (female ? "Female" : "Male")
        let ol = (female ? "female" : "male") + (front ? "" : "_back")
        let map = front ? BodyArt.frontSlugToGroup : BodyArt.backSlugToGroup
        let o = BodyArt.outlines[ol]!
        let regions = BodyFigurePaths.regions(fig)
        return VStack(spacing: 2) {
            Canvas { ctx, size in
                // preserveAspectRatio xMidYMid meet, like the SVG's default.
                let vx = CGFloat(o.0), vy = CGFloat(o.1), vw = CGFloat(o.2), vh = CGFloat(o.3)
                let k = min(size.width / vw, size.height / vh)
                let dx = (size.width - vw * k) / 2 - vx * k, dy = (size.height - vh * k) / 2 - vy * k
                ctx.translateBy(x: dx, y: dy); ctx.scaleBy(x: k, y: k)
                for (slug, path) in regions {
                    let col = map[slug].map { MuscleMapCard.heat(score[$0] ?? 0) } ?? Color(hex: 0x2A2A33)
                    ctx.fill(path, with: .color(col))
                }
                ctx.stroke(BodyFigurePaths.outline(ol), with: .color(Color(hex: 0x55555F)), lineWidth: 2)
            }
            .frame(maxWidth: 140).frame(height: 220)
            Text(front ? "FRONT" : "BACK").font(Theme.body(10)).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity)
    }
}

/// Parsed once per figure: BodyArt's strings are absolute M / L / C / Z only.
enum BodyFigurePaths {
    private static var cache: [String: [(String, Path)]] = [:]
    private static var outlineCache: [String: Path] = [:]

    static func regions(_ fig: String) -> [(String, Path)] {
        if let c = cache[fig] { return c }
        let r = (BodyArt.regions[fig] ?? []).map { slug, ds -> (String, Path) in
            var p = Path(); ds.forEach { add($0, to: &p) }; return (slug, p)
        }
        cache[fig] = r
        return r
    }
    static func outline(_ key: String) -> Path {
        if let c = outlineCache[key] { return c }
        var p = Path(); if let o = BodyArt.outlines[key] { add(o.4, to: &p) }
        outlineCache[key] = p
        return p
    }

    static func add(_ d: String, to p: inout Path) {
        var cmd: Character = "M", nums: [CGFloat] = [], cur = ""
        func flushNum() { if !cur.isEmpty, let v = Double(cur) { nums.append(CGFloat(v)) }; cur = "" }
        func emit() {
            switch cmd {
            case "M" where nums.count >= 2: p.move(to: CGPoint(x: nums[0], y: nums[1]))
            case "L" where nums.count >= 2: p.addLine(to: CGPoint(x: nums[0], y: nums[1]))
            case "C" where nums.count >= 6:
                p.addCurve(to: CGPoint(x: nums[4], y: nums[5]), control1: CGPoint(x: nums[0], y: nums[1]), control2: CGPoint(x: nums[2], y: nums[3]))
            case "Z": p.closeSubpath()
            default: break
            }
            nums.removeAll(keepingCapacity: true)
        }
        for ch in d {
            if ch == "M" || ch == "L" || ch == "C" || ch == "Z" {
                flushNum(); emit(); cmd = ch
            } else if ch == " " {
                flushNum()
            } else if ch == "-" && !cur.isEmpty && cur.last != "e" {
                flushNum(); cur.append(ch)
            } else {
                cur.append(ch)
            }
        }
        flushNum(); emit()
    }
}
