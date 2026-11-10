import Foundation
import HealthKit

/// Apple Health, write only. A finished workout is saved as a strength-training workout; nothing is
/// ever read (toRead is nil and there is no read usage anywhere). The permission sheet appears the
/// first time a workout finishes, and a denial or any error is swallowed: finishing never waits on
/// Health and never fails because of it.
enum HealthLog {
    static let enabledKey = "jacked.health.enabled"
    /// Default ON: the choice is made in the system sheet the first time, and in My Profile any time after.
    static var enabled: Bool {
        get { UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }
    static var available: Bool { HKHealthStore.isHealthDataAvailable() }

    private static let store = HKHealthStore()
    private static let type = HKObjectType.workoutType()

    /// Asks for write access to workouts. Safe to call repeatedly: the system only shows the sheet once.
    @discardableResult
    static func requestAccess() async -> Bool {
        guard available else { return false }
        do { try await store.requestAuthorization(toShare: [type], read: []) } catch { return false }
        return store.authorizationStatus(for: type) == .sharingAuthorized
    }

    /// Fire and forget from finish(): the caller does not await this.
    static func record(id: String, start: Date, end: Date) {
        guard enabled, available, end.timeIntervalSince(start) >= 1 else { return }
        Task.detached(priority: .utility) {
            guard await requestAccess() else { return }
            let cfg = HKWorkoutConfiguration()
            cfg.activityType = .traditionalStrengthTraining
            cfg.locationType = .indoor
            let b = HKWorkoutBuilder(healthStore: store, configuration: cfg, device: .local())
            do {
                try await b.beginCollection(at: start)
                try await b.addMetadata([HKMetadataKeyExternalUUID: id, HKMetadataKeyWorkoutBrandName: "Jacked"])
                try await b.endCollection(at: end)
                _ = try await b.finishWorkout()
            } catch {
                // Denied, locked device, anything: the workout is already saved in Jacked.
            }
        }
    }
}
