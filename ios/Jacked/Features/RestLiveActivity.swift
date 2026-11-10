import ActivityKit
import Foundation

/// Starts, retimes and ends the rest-timer Live Activity. WorkoutSession calls sync() whenever the
/// workout changes, so every path that starts, nudges (+/-15), skips, expires or cancels a rest goes
/// through here. Everything is best effort: no Live Activities permission means no-op.
@MainActor
enum RestLiveActivity {
    private static var current: Activity<RestActivityAttributes>?
    private static var shownEnd: Double?
    private static var expiry: Task<Void, Never>?

    /// endsAtMs is the PWA's restEndsAt (ms since 1970), nil when no rest is running.
    static func sync(endsAtMs: Double?, workoutName: String) {
        guard endsAtMs != shownEnd else { return }
        shownEnd = endsAtMs
        expiry?.cancel(); expiry = nil
        guard let ms = endsAtMs, ms / 1000 > Date().timeIntervalSince1970 else { end(); return }
        let endsAt = Date(timeIntervalSince1970: ms / 1000)
        let content = ActivityContent(state: RestActivityAttributes.ContentState(endsAt: endsAt), staleDate: endsAt.addingTimeInterval(1))
        if let a = current, a.activityState == .active {
            Task { await a.update(content) }
        } else if ActivityAuthorizationInfo().areActivitiesEnabled {
            current = try? Activity.request(attributes: RestActivityAttributes(workoutName: workoutName), content: content, pushType: nil)
        }
        // The rest ending on its own while the app is in the background: take the card down on time.
        expiry = Task { [endsAt] in
            try? await Task.sleep(nanoseconds: UInt64(max(0, endsAt.timeIntervalSinceNow) * 1_000_000_000) + 500_000_000)
            guard !Task.isCancelled else { return }
            end()
        }
    }

    private static func end() {
        let a = current; current = nil
        Task { await a?.end(nil, dismissalPolicy: .immediate) }
        // Anything left over from a previous launch (app killed mid-rest).
        for stale in Activity<RestActivityAttributes>.activities where stale.id != a?.id {
            Task { await stale.end(nil, dismissalPolicy: .immediate) }
        }
    }

    /// Debug / test: how many rest activities the system currently holds.
    static var liveCount: Int { Activity<RestActivityAttributes>.activities.count }
}
