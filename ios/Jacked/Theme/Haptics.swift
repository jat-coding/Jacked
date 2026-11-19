import UIKit

/// haptic(kind): the PWA's one haptic entry point (index.html ~2131), through UIKit feedback generators.
/// light = tab change / set unticked / Add Set / resume bar, medium = set ticked / workout start,
/// success = rest over / workout finished / new PR, warning = discard or delete confirmed.
enum Haptics {
    // Shared, kept warm: a generator built fresh on every tap pays the Taptic engine spin-up on the main
    // thread right in the tap handler (the set check-mark lag). prepare() re-arms it for the next tap.
    nonisolated(unsafe) private static let lightGen = UIImpactFeedbackGenerator(style: .light)
    nonisolated(unsafe) private static let mediumGen = UIImpactFeedbackGenerator(style: .medium)
    static func light() { lightGen.impactOccurred(); lightGen.prepare() }
    static func medium() { mediumGen.impactOccurred(); mediumGen.prepare() }
    static func warning() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}
