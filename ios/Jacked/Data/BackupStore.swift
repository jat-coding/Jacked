import Foundation

/// Sync of the signed-in account's blob: `profile_backups` <-> memory <-> disk.
///
/// Every write is the PWA's syncBackup(), ported (watch-client/SYNC_PLAYBOOK.md sections 1-3):
/// read the row fresh, merge with BackupMerge (the PWA's mergeBackup, parity-tested in
/// ios/Tests/parity), then a conditional PATCH that only lands if `updated_at` still matches
/// what was read. A failed read means no write. Edits are kept on disk first (`dirty`) so a
/// save that can't reach the server goes out on the next sync instead of being lost.
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
    /// True while this phone has edits the server hasn't accepted yet (kept on disk).
    @Published private(set) var dirty = false

    /// Exercise ids whose note this phone edited since its last landed write (the PWA's
    /// jacked_exNotesPending), set by setExNote.
    private var pendingNotes: [String] = []
    private var pushing = false
    private var pushAgain = false

    private let http = SupabaseHTTP()

    private struct Row: Decodable { let backup: JSONValue?; let updated_at: String? }
    private struct Landed: Decodable { let updated_at: String? }
    private struct Write: Encodable { var code: String?; let backup: JSONValue; let updated_at: String }
    private struct DiskCopy: Codable {
        let code: String; let backup: [String: JSONValue]; let updatedAt: String?; let syncedAt: Date
        var dirty: Bool?; var pendingNotes: [String]?   // optional: older disk copies have neither
    }

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
            let cloud = row?.backup?.object
            if dirty && loadedCode == s.code {
                // Unsent edits on this phone: fold the cloud in (never drop them), then send.
                backup = Backup(raw: cloud.map { BackupMerge.merge(cloud: $0, local: backup.raw, pendingNotes: pendingNotes) } ?? backup.raw)
            } else {
                backup = Backup(raw: cloud ?? [:])
                dirty = false
            }
            updatedAt = row?.updated_at
            lastSynced = Date()
            loadedCode = s.code
            saveToDisk(code: s.code)
            state = .idle
            if dirty { await push(auth: auth) }
        } catch let e as SupabaseError {
            state = .failed(e.isNetwork ? "Offline, showing the copy on this phone" : "Couldn't sync (\(e.status))")
        } catch {
            state = .failed("Couldn't read your saved data")
        }
    }

    func signedOut() {
        backup = .empty; updatedAt = nil; lastSynced = nil; loadedCode = nil; state = .idle
        dirty = false; pendingNotes = []
    }

    // MARK: edits

    /// Change the local blob, keep it on disk, then send it (merge + compare-and-swap).
    /// Returns whether the server has it; false means it is saved on this phone and will go
    /// out on the next sync.
    @discardableResult
    func edit(auth: AuthStore, _ change: (inout [String: JSONValue]) -> Void) async -> Bool {
        guard let code = loadedCode else { return false }
        var raw = backup.raw
        change(&raw)
        guard raw != backup.raw else { return true }
        backup = Backup(raw: raw)
        dirty = true
        saveToDisk(code: code)
        return await push(auth: auth)
    }

    /// setExNote: the per-exercise note ("remembered next time"), blank removes it. Marked pending
    /// so the merge keeps this phone's version over the cloud's until the write lands.
    @discardableResult
    func setExNote(_ exId: String, _ text: String, auth: AuthStore) async -> Bool {
        let v = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !pendingNotes.contains(exId) { pendingNotes.append(exId) }
        return await edit(auth: auth) { raw in
            var n = raw["jk_exNotes"]?.object ?? [:]
            n[exId] = v.isEmpty ? nil : .string(v)
            raw["jk_exNotes"] = .object(n)
        }
    }

    /// saveWE() for a name-only edit: trimmed, blank keeps the old name. Every other field of
    /// the stored workout is left exactly as it was.
    @discardableResult
    func renameWorkout(id: JSONValue, to name: String, auth: AuthStore) async -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return true }
        return await edit(auth: auth) { raw in
            guard var hist = raw["jk_hist"]?.array else { return }
            for i in hist.indices {
                guard var o = hist[i].object, o["id"] == id else { continue }
                o["name"] = .string(trimmed)
                hist[i] = .object(o)
            }
            raw["jk_hist"] = .array(hist)
        }
    }

    // MARK: the write (index.html syncBackup)

    /// Non-reentrant: an edit made while a write is in flight is sent by one more round of the
    /// same loop instead of a second concurrent writer (playbook section 4, the double-drain race).
    @discardableResult
    func push(auth: AuthStore) async -> Bool {
        if pushing { pushAgain = true; return false }
        pushing = true
        defer { pushing = false }
        var ok = false
        repeat {
            pushAgain = false
            ok = await pushOnce(auth: auth)
        } while ok && pushAgain && dirty
        return ok
    }

    private func pushOnce(auth: AuthStore) async -> Bool {
        guard let s = await auth.validSession(), s.code == loadedCode else { return false }
        let notes = pendingNotes   // snapshot: only these ids are cleared once the write lands
        state = .syncing
        for _ in 0..<4 {
            let local = backup.raw   // re-read per attempt, local may have moved on
            // 1) Fresh read of the row and its watermark. ANY failure here = no write.
            let row: Row?
            do {
                let data = try await http.send("GET", "rest/v1/profile_backups",
                                               query: [URLQueryItem(name: "code", value: "eq.\(s.code)"),
                                                       URLQueryItem(name: "select", value: "backup,updated_at")],
                                               bearer: s.accessToken,
                                               headers: ["Cache-Control": "no-cache"])
                row = try JSONDecoder().decode([Row].self, from: data).first
            } catch {
                state = .failed("Saved on this phone, will sync when online"); return false
            }
            let cloud = row?.backup?.object
            let ts0 = row?.updated_at
            // 2) Merge, or the local blob as is when the cloud has none yet.
            let merged = cloud.map { BackupMerge.merge(cloud: $0, local: local, pendingNotes: notes) } ?? local
            // 3) Nothing new: no write, no watermark churn for the other devices.
            if let cloud, BackupMerge.canonical(.object(merged)) == BackupMerge.canonical(.object(cloud)) {
                landed(local: local, merged: merged, watermark: ts0, notes: notes, code: s.code); return true
            }
            DevHooks.log("read ok, watermark \(ts0 ?? "none"), \(merged["jk_hist"]?.array?.count ?? 0) workouts after merge")
            if DevHooks.casDelay > 0 { try? await Task.sleep(nanoseconds: UInt64(DevHooks.casDelay * 1e9)) }
            let now = Self.isoNow()
            do {
                if row != nil, let ts0 {
                    // 4) Conditional write: lands only if nobody wrote since our read.
                    let data = try await http.send("PATCH", "rest/v1/profile_backups",
                                                   query: [URLQueryItem(name: "code", value: "eq.\(s.code)"),
                                                           URLQueryItem(name: "updated_at", value: "eq.\(ts0)"),
                                                           URLQueryItem(name: "select", value: "updated_at")],
                                                   body: Write(code: nil, backup: .object(merged), updated_at: now),
                                                   bearer: s.accessToken,
                                                   headers: ["Prefer": "return=representation"])
                    let rows = try JSONDecoder().decode([Landed].self, from: data)
                    guard let r = rows.first else {   // watermark moved: re-read, re-merge, retry
                        DevHooks.log("write refused, watermark moved: re-reading"); continue
                    }
                    DevHooks.log("write landed, new watermark \(r.updated_at ?? "?")")
                    landed(local: local, merged: merged, watermark: r.updated_at, notes: notes, code: s.code); return true
                }
                // 5) First write for this account (no row yet): plain upsert, like the PWA.
                let data = try await http.send("POST", "rest/v1/profile_backups",
                                               query: [URLQueryItem(name: "on_conflict", value: "code"),
                                                       URLQueryItem(name: "select", value: "updated_at")],
                                               body: Write(code: s.code, backup: .object(merged), updated_at: now),
                                               bearer: s.accessToken,
                                               headers: ["Prefer": "resolution=merge-duplicates,return=representation"])
                let r = try JSONDecoder().decode([Landed].self, from: data).first
                landed(local: local, merged: merged, watermark: r?.updated_at, notes: notes, code: s.code); return true
            } catch {
                state = .failed("Saved on this phone, will sync when online"); return false
            }
        }
        state = .failed("Saved on this phone, will sync when online")   // contention, gave up after 4
        return false
    }

    /// The server has `merged`. Adopt it, unless the user edited again while it was in flight:
    /// then keep that newer edit on top and stay dirty so the loop sends it too.
    private func landed(local: [String: JSONValue], merged: [String: JSONValue], watermark: String?, notes: [String], code: String) {
        if backup.raw == local {
            backup = Backup(raw: merged); dirty = false
        } else {
            backup = Backup(raw: BackupMerge.merge(cloud: merged, local: backup.raw, pendingNotes: pendingNotes))
            pushAgain = true
        }
        let drop = Set(notes); pendingNotes.removeAll { drop.contains($0) }
        updatedAt = watermark; lastSynced = Date(); state = .idle
        saveToDisk(code: code)
    }

    private static func isoNow() -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: Date())
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
        dirty = c.dirty ?? false; pendingNotes = c.pendingNotes ?? []
    }

    private func saveToDisk(code: String) {
        let c = DiskCopy(code: code, backup: backup.raw, updatedAt: updatedAt, syncedAt: lastSynced ?? Date(),
                         dirty: dirty, pendingNotes: pendingNotes)
        if let d = try? JSONEncoder().encode(c) {
            try? d.write(to: Self.fileURL(code), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }
}
