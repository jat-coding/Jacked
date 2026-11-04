import SwiftUI

/// The PWA's palette and type, from the :root block at the top of jacked-pwa/index.html.
/// Change colors there and here together.
enum Theme {
    static let bg = Color(hex: 0x000000)          // --bg
    static let bg2 = Color(hex: 0x16161C)         // --bg2
    static let bg3 = Color(hex: 0x1E1E26)         // --bg3  (inputs)
    static let bg4 = Color(hex: 0x292932)         // --bg4
    static let border = Color(hex: 0x26262F)      // --border
    static let border2 = Color(hex: 0x363642)     // --border2
    static let accent = Color(hex: 0x20D3C2)      // --accent (teal)
    static let accent2 = Color(hex: 0x14A99B)     // --accent2 (pressed)
    static let accentBright = Color(hex: 0x5CE9DA) // --accent-bright
    static let onAccent = Color(hex: 0x04140A)    // --on-accent
    static let red = Color(hex: 0xFF5D6C)         // --red
    static let green = Color(hex: 0x3DDC97)       // --green
    static let orange = Color(hex: 0xFF9F4D)      // --orange
    static let muted = Color(hex: 0x70707F)       // --muted
    static let text = Color(hex: 0xF3F3F8)        // --text
    static let text2 = Color(hex: 0xA4A4B4)       // --text2

    static let radius: CGFloat = 12               // --r
    static let radiusLarge: CGFloat = 18          // --rl

    /// --fh: Barlow Condensed (bundled, OFL). Falls back to the system font if missing.
    static func heading(_ size: CGFloat, _ weight: HeadingWeight = .bold) -> Font {
        .custom(weight.postScriptName, size: size)
    }

    enum HeadingWeight {
        case bold, extraBold, black
        var postScriptName: String {
            switch self {
            case .bold: return "BarlowCondensed-Bold"
            case .extraBold: return "BarlowCondensed-ExtraBold"
            case .black: return "BarlowCondensed-Black"
            }
        }
    }

    /// --fb is DM Sans on the web. The system font stands in for now (see ios/README.md).
    static func body(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: 1)
    }
}

/// .btn.ba: solid teal, dark text, darker teal and a slight shrink while pressed.
struct AccentButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.body(15, .semibold))
            .foregroundStyle(Theme.onAccent)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(configuration.isPressed ? Theme.accent2 : Theme.accent,
                        in: RoundedRectangle(cornerRadius: Theme.radius))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.18), value: configuration.isPressed)
    }
}

/// .btn.bg: outlined, secondary text.
struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.body(14, .semibold))
            .foregroundStyle(Theme.text2)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .background(configuration.isPressed ? Theme.bg3 : Color.clear,
                        in: RoundedRectangle(cornerRadius: Theme.radius))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.border2, lineWidth: 1))
    }
}

/// The PWA's input: bg3 fill, 1px border that turns teal on focus.
struct JackedFieldStyle: ViewModifier {
    var focused: Bool
    func body(content: Content) -> some View {
        content
            .font(Theme.body(15))
            .foregroundStyle(Theme.text)
            .tint(Theme.accent)
            .padding(.horizontal, 13)
            .padding(.vertical, 12)
            .background(Theme.bg3, in: RoundedRectangle(cornerRadius: Theme.radius))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius)
                .stroke(focused ? Theme.accent : Theme.border, lineWidth: 1))
            .animation(.easeOut(duration: 0.2), value: focused)
    }
}
