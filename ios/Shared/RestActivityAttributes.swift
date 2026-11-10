import ActivityKit
import Foundation

/// The rest countdown shown on the Lock Screen and in the Dynamic Island. Compiled into both the
/// app (which starts / updates / ends it) and the JackedWidgets extension (which draws it).
struct RestActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// When the rest ends. The extension counts down to it with Text(timerInterval:), so the app
        /// does not have to wake up every second to keep the number moving.
        var endsAt: Date
    }
    var workoutName: String
}
