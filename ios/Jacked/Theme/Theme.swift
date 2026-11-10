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
    static let blue = Color(hex: 0x5AA9FF)        // --blue
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
        case regular, semibold, bold, extraBold, black
        var postScriptName: String {
            switch self {
            case .regular: return "BarlowCondensed-Regular"
            case .semibold: return "BarlowCondensed-SemiBold"
            case .bold: return "BarlowCondensed-Bold"
            case .extraBold: return "BarlowCondensed-ExtraBold"
            case .black: return "BarlowCondensed-Black"
            }
        }
    }

    /// --fb: DM Sans (bundled, OFL), weights 300/400/500/600 like the PWA's Google Fonts link.
    static func body(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let name: String
        switch weight {
        case .ultraLight, .thin, .light: name = "DMSans-Light"
        case .medium: name = "DMSans-Medium"
        case .semibold, .bold, .heavy, .black: name = "DMSans-SemiBold"
        default: name = "DMSans-Regular"
        }
        return .custom(name, size: size)
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
            .accentFill(RoundedRectangle(cornerRadius: Theme.radius), pressed: configuration.isPressed)
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

extension View {
    /// .ba / .rsb: vertical accent-bright to accent gradient with a soft teal glow; flat accent2 and no glow while pressed.
    func accentFill<S: Shape>(_ shape: S, pressed: Bool = false) -> some View {
        background(shape.fill(pressed ? AnyShapeStyle(Theme.accent2)
                                      : AnyShapeStyle(LinearGradient(colors: [Theme.accentBright, Theme.accent], startPoint: .top, endPoint: .bottom)))
            .shadow(color: pressed ? .clear : Theme.accent.opacity(0.4), radius: 9, x: 0, y: 8))
    }
}
