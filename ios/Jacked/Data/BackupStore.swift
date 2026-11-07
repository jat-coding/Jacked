import Foundation

/// Read-only sync of the signed-in account's blob: `profile_backups` -> memory -> disk.
/// Writes NOTHING to the server. Writing waits for the merge + compare-and-swap layer
/// (IOS_REWRITE_PLAN.md ground rule 3, stage "safe-saving").
///
/// The disk copy is per account (one file per username) so signing in as a different
/// account never shows the previous account's workouts.
@MainActor
final class BackupStore: ObservableObject {
    enum SyncState: Equatable { case idle, syncing, failed(String) }

    @Published private(set) var backup: Backup = .empty
    /// Opaque watermark from the server (only ever handed back as-is, see syncBackup()).
    @Published private(set) var updatedAt: String?
    @Published private(set) var lastSynced: Date?
    @Published private(set) var state: SyncState = .idle
    @Published private(set) var loadedCode: String?

    private let http = SupabaseHTTP()

    private struct Row: Decodable { let backup: JSONValue?; let updated_at: String? }
    private struct DiskCopy: Codable { let code: String; let backup: [String: JSONValue]; let updatedAt: String?; let syncedAt: Date }

    /// Show the disk copy straight away (offline works), then refresh from the server.
    func start(for code: String, auth: AuthStore) async {
        if loadedCode != code { loadFromDisk(code) }
        await refresh(auth: auth)
    }

    func refresh(auth: AuthStore) async {
        guard let s = await auth.validSession() else { return }
        state = .syncing
        do {
            let data = try await http.send("GET", "rest/v1/profile_backups",
                                           query: [URLQueryItem(name: "code", value: "eq.\(s.code)"),
                                                   URLQueryItem(name: "select", value: "backup,updated_at")],
                                           bearer: s.accessToken)
            let row = try JSONDecoder().decode([Row].self, from: data).first
            let obj = row?.backup?.object ?? [:]
            backup = Backup(raw: obj)
            updatedAt = row?.updated_at
            lastSynced = Date()
            loadedCode = s.code
            saveToDisk(code: s.code)
            state = .idle
        } catch let e as SupabaseError {
            state = .failed(e.isNetwork ? "Offline, showing the copy on this phone" : "Couldn't sync (\(e.status))")
        } catch {
            state = .failed("Couldn't read your saved data")
        }
    }

    func signedOut() {
        backup = .empty; updatedAt = nil; lastSynced = nil; loadedCode = nil; state = .idle
    }

    // MARK: disk

    private static func fileURL(_ code: String) -> URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("JackedBackup", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let safe = code.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) || $0 == "_" }
        return dir.appendingPathComponent("backup-\(String(String.UnicodeScalarView(safe))).json")
    }

    private func loadFromDisk(_ code: String) {
        guard let d = try? Data(contentsOf: Self.fileURL(code)),
              let c = try? JSONDecoder().decode(DiskCopy.self, from: d), c.code == code else {
            signedOut(); return
        }
        backup = Backup(raw: c.backup); updatedAt = c.updatedAt; lastSynced = c.syncedAt; loadedCode = code
    }

    private func saveToDisk(code: String) {
        let c = DiskCopy(code: code, backup: backup.raw, updatedAt: updatedAt, syncedAt: lastSynced ?? Date())
        if let d = try? JSONEncoder().encode(c) {
            try? d.write(to: Self.fileURL(code), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }
}
