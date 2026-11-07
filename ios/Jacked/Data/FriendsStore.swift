import Foundation

/// The Friends tab's server side (index.html refreshFriends, acceptFr, rmFr, doAF, syncMe): the
/// friend_requests rows, the friend_profiles() RPC for accepted friends and requests, the stranger-safe
/// public_profiles() lookup, and this phone's own published stats on its `profiles` row. Close buddies
/// are a blob key (jk_closeBuddies) and go through BackupStore's merge + compare-and-swap like any edit.
@MainActor
final class FriendsStore: ObservableObject {
    @Published private(set) var friends: [Person] = []      // accepted + incoming requests (pending = true)
    @Published private(set) var sent: [Person] = []
    @Published private(set) var loaded = false
    @Published var toast: String?

    private let http = SupabaseHTTP()
    private var gen = 0
    private var acceptBusy = Set<String>()
    private var lastPublished: [String: JSONValue]?

    private struct Req: Decodable { let id: JSONValue?; let from_code: String; let to_code: String; let status: String }
    private static func q(_ k: String, _ v: String) -> URLQueryItem { URLQueryItem(name: k, value: v) }
    private static func pair(_ a: String, _ b: String) -> URLQueryItem {
        q("or", "(and(from_code.eq.\(a),to_code.eq.\(b)),and(from_code.eq.\(b),to_code.eq.\(a)))")
    }

    func signedOut() { friends = []; sent = []; loaded = false; lastPublished = nil }

    /// refreshFriends(): only the newest refresh may write the list; a failed one keeps what's shown.
    func refresh(auth: AuthStore) async {
        guard let s = await auth.validSession() else { return }
        gen += 1; let g = gen, my = s.code
        do {
            let data = try await http.send("GET", "rest/v1/friend_requests", query: [Self.q("select", "*"), Self.q("or", "(from_code.eq.\(my),to_code.eq.\(my))")],
                                           bearer: s.accessToken)
            let reqs = try JSONDecoder().decode([Req].self, from: data)
            var accepted: [String] = [], pendingIn: [String] = [], sentOut: [String] = []
            for r in reqs {
                let other = r.from_code == my ? r.to_code : r.from_code
                if r.status == "accepted" { if !accepted.contains(other) { accepted.append(other) } }
                else if r.status == "pending" && r.to_code == my { pendingIn.append(other) }
                else if r.status == "pending" && r.from_code == my { sentOut.append(other) }
            }
            var codes: [String] = []
            for c in accepted + pendingIn + sentOut where FriendsMath.cleanCode(c) && !codes.contains(c) { codes.append(c) }
            var rows: [String: [String: JSONValue]] = [:]
            if !codes.isEmpty {
                let d = try await http.send("POST", "rest/v1/rpc/friend_profiles", body: ["p_codes": codes], bearer: s.accessToken)
                for o in ((try? JSONDecoder().decode(JSONValue.self, from: d))?.array ?? []).compactMap(\.object) {
                    if let c = o["code"]?.string { rows[c] = o }
                }
            }
            guard g == gen else { return }
            let mk: (String, Bool) -> Person? = { c, p in Person(row: rows[c] ?? ["code": .string(c)], pending: p) }
            friends = accepted.compactMap { mk($0, false) } + pendingIn.compactMap { mk($0, true) }
            sent = sentOut.compactMap { mk($0, false) }
            loaded = true
        } catch {
            DevHooks.log("friends refresh failed: \(error.localizedDescription)")
        }
    }

    /// acceptFr(): only a still-pending request from them to me; a repeat tap updates 0 rows and says nothing.
    func accept(_ code: String, auth: AuthStore) async {
        guard let s = await auth.validSession(), !acceptBusy.contains(code) else { return }
        acceptBusy.insert(code); defer { acceptBusy.remove(code) }
        var ok = false, failed = false
        do {
            let d = try await http.send("PATCH", "rest/v1/friend_requests",
                                        query: [Self.q("from_code", "eq.\(code)"), Self.q("to_code", "eq.\(s.code)"), Self.q("status", "eq.pending"), Self.q("select", "id")],
                                        body: ["status": "accepted"], bearer: s.accessToken, headers: ["Prefer": "return=representation"])
            ok = !(((try? JSONDecoder().decode(JSONValue.self, from: d))?.array ?? []).isEmpty)
        } catch { failed = true }
        await refresh(auth: auth)
        if ok { toast = "Friend added!" } else if failed { toast = "Could not accept, try again" }
    }

    /// rmFr(): remove a friend, decline a request or cancel one I sent. Drops them from close buddies too.
    func remove(_ code: String, auth: AuthStore, store: BackupStore) async {
        guard let s = await auth.validSession() else { return }
        do {
            _ = try await http.send("DELETE", "rest/v1/friend_requests", query: [Self.pair(s.code, code)], bearer: s.accessToken)
        } catch {
            toast = "Could not remove, check your connection and try again"; return
        }
        let cb = store.backup.raw["jk_closeBuddies"]?.array?.compactMap(\.string) ?? []
        if cb.contains(code) { await store.edit(auth: auth) { $0["jk_closeBuddies"] = .array(cb.filter { $0 != code }.map(JSONValue.string)) } }
        await refresh(auth: auth)
        toast = "Removed"
    }

    /// doAF(): look the username up (public_profiles), then accept theirs, say it's already sent, or send one.
    /// Returns true when the sheet should close.
    func add(_ input: String, auth: AuthStore, publish: () async -> Void) async -> Bool {
        let code = FriendsMath.normU(input)
        if code.isEmpty || FriendsMath.validU(code) != nil { toast = "Enter a valid username"; return false }
        guard let s = await auth.validSession() else { toast = "Network error, try again"; return false }
        if code == s.code { toast = "That's your own username!"; return false }
        await publish()   // make sure my profile row exists
        do {
            let p = try await http.send("POST", "rest/v1/rpc/public_profiles", body: ["p_codes": [code]], bearer: s.accessToken)
            if ((try? JSONDecoder().decode(JSONValue.self, from: p))?.array ?? []).isEmpty { toast = "No user with that username yet"; return false }
            let d = try await http.send("GET", "rest/v1/friend_requests", query: [Self.q("select", "id,from_code,to_code,status"), Self.pair(s.code, code)], bearer: s.accessToken)
            let rows = try JSONDecoder().decode([Req].self, from: d)
            let mine = rows.first { $0.from_code == s.code }, theirs = rows.first { $0.from_code == code }
            if mine?.status == "accepted" || theirs?.status == "accepted" { toast = "Already friends!"; return false }
            if let t = theirs, t.status == "pending", let id = t.id {
                let up = try await http.send("PATCH", "rest/v1/friend_requests", query: [Self.q("id", "eq.\(Self.idString(id))"), Self.q("status", "eq.pending"), Self.q("select", "id")],
                                             body: ["status": "accepted"], bearer: s.accessToken, headers: ["Prefer": "return=representation"])
                if !(((try? JSONDecoder().decode(JSONValue.self, from: up))?.array ?? []).isEmpty) { toast = "\(code) had already asked you, you're friends now" }
                await refresh(auth: auth); return true
            }
            if mine?.status == "pending" { toast = "You already sent a request, waiting for them to accept"; await refresh(auth: auth); return true }
            if let m = mine, let id = m.id {   // stale (declined) row: clear it so a fresh request can go out
                _ = try? await http.send("DELETE", "rest/v1/friend_requests", query: [Self.q("id", "eq.\(Self.idString(id))")], bearer: s.accessToken)
            }
            do {
                _ = try await http.send("POST", "rest/v1/friend_requests", body: ["from_code": s.code, "to_code": code, "status": "pending"], bearer: s.accessToken)
            } catch let e as SupabaseError where e.code == "23505" {
                toast = "You already sent a request, waiting for them to accept"; await refresh(auth: auth); return true
            }
            toast = "Request sent to \(code), they'll need to accept it"
            await refresh(auth: auth); return true
        } catch {
            toast = "Network error, try again"; return false
        }
    }

    private static func idString(_ v: JSONValue) -> String { v.string ?? v.double.map { String(Int($0)) } ?? "" }

    /// syncMe(): this phone's stats onto its own profiles row, so friends' boards show them. Skipped when
    /// nothing changed since the last publish from this phone. Never touches anyone else's row.
    func publish(_ cols: [String: JSONValue], auth: AuthStore) async {
        guard cols != lastPublished, let s = await auth.validSession() else { return }
        var body = cols
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        body["updated_at"] = .string(f.string(from: Date()))
        do {
            _ = try await http.send("PATCH", "rest/v1/profiles", query: [Self.q("code", "eq.\(s.code)")], body: JSONValue.object(body), bearer: s.accessToken)
            lastPublished = cols
            DevHooks.log("published stats: \(cols["workouts"]?.double.map { Int($0) } ?? -1) workouts")
        } catch {
            DevHooks.log("publish failed: \(error.localizedDescription)")   // keep the existing row rather than blanking it
        }
    }
}
