import UIKit

/// haptic(kind): the PWA's one haptic entry point (index.html ~2131), through UIKit feedback generators.
/// light = tab change / set unticked / Add Set / resume bar, medium = set ticked / workout start,
/// success = rest over / workout finished / new PR, warning = discard or delete confirmed.
enum Haptics {
    static func light() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func medium() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    static func warning() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}
