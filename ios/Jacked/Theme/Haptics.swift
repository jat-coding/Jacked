import UIKit

/// haptic(kind): the PWA's one haptic entry point (index.html ~2131), through UIKit feedback generators.
/// light = tab change / sheet open, medium = set ticked, success = rest over.
enum Haptics {
    static func light() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func medium() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}
