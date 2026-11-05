import Foundation
import Supabase

/// The Jacked sign-in contract, exactly as the PWA and the watches use it
/// (watch-client/AUTH_HANDOFF.md section 3, index.html registerAccount/cloudLogin),
/// on `supabase-swift`:
///
///   sign up : functions.invoke("jacked-auth") {code, password, name, email?}
///   look up : rpc("account_status") {p_code}  -> the account's sign-in email
///             rpc("account_status_by_email") {p_email} -> the account's code
///   sign in : auth.signIn(email:password:)
///   refresh : auth.refreshSession()  (the SDK also refreshes on its own while the app is open)
///   sign out: auth.signOut()
///
/// Sign-up deliberately does NOT use `auth.signUp`: the edge function creates the auth user
/// AND its `profiles` row with the synthetic sign-in email, which a plain auth sign-up can't.
/// That email is a never-mailed id that only account_status hands back. Never show it and
/// never derive it from the username.
struct AuthAPI {
    var client = Backend.client
    var storage = Backend.storage

    /// Supabase's session has no Jacked username, so it is kept next to it in the same store.
    private static let codeKey = "jacked.code"

    enum Status: Equatable {
        case claimed(email: String?, code: String?)
        case unclaimed
        case notFound
        case rateLimited
    }

    private struct StatusResponse: Decodable {
        let status: String
        let email: String?
        let code: String?
    }

    private func decodeStatus(_ r: StatusResponse) -> Status {
        switch r.status {
        case "claimed": return .claimed(email: r.email, code: r.code)
        case "unclaimed": return .unclaimed
        case "rate_limited": return .rateLimited
        default: return .notFound
        }
    }

    func accountStatus(code: String) async throws -> Status {
        let r: StatusResponse = try await SupabaseError.wrap {
            try await client.rpc("account_status", params: ["p_code": code]).execute().value
        }
        return decodeStatus(r)
    }

    func accountStatus(email: String) async throws -> Status {
        let r: StatusResponse = try await SupabaseError.wrap {
            try await client.rpc("account_status_by_email", params: ["p_email": email]).execute().value
        }
        return decodeStatus(r)
    }

    /// The SDK persists the session itself; the username is saved right after it.
    func signIn(email: String, password: String, code: String) async throws -> AuthSession {
        let s = try await SupabaseError.wrap { try await client.auth.signIn(email: email, password: password) }
        try? storage.store(key: Self.codeKey, value: Data(code.utf8))
        return AuthSession(s, code: code)
    }

    /// The last saved session, possibly expired. nil when signed out (or the username is
    /// missing, which only a half-finished sign-in could leave behind).
    func storedSession() -> AuthSession? {
        guard let s = client.auth.currentSession,
              let data = try? storage.retrieve(key: Self.codeKey),
              let code = String(data: data, encoding: .utf8), !code.isEmpty else { return nil }
        return AuthSession(s, code: code)
    }

    /// Refresh tokens rotate (AUTH_HANDOFF.md 3d); the SDK saves the new pair before returning it.
    func refresh(_ s: AuthSession) async throws -> AuthSession {
        let fresh = try await SupabaseError.wrap { try await client.auth.refreshSession(refreshToken: s.refreshToken) }
        return AuthSession(fresh, code: s.code)
    }

    /// Global sign-out on the server, like the PWA. The SDK clears the local session first,
    /// so a failed network call still leaves this device signed out.
    func signOut() async {
        try? await client.auth.signOut()
        try? storage.remove(key: Self.codeKey)
    }

    /// Drops the local session without asking the server (a dead refresh token).
    func forgetLocal() async {
        try? await client.auth.signOut(scope: .local)
        try? storage.remove(key: Self.codeKey)
    }

    /// Server statuses from logic.ts register(): ok, invalid_username, weak_password,
    /// invalid_email, already_claimed, email_taken, proof_failed, taken, error.
    struct RegisterResult: Decodable {
        let status: String
        let email: String?
    }

    private struct RegisterBody: Encodable {
        let code: String
        let password: String
        let name: String
        let email: String?
    }

    /// Creates the auth user and its `profiles` row server-side (service role, inside the
    /// edge function). The app itself never inserts into `profiles`.
    /// No `proofIds`: a fresh iPhone install holds no workouts, so it can only create new
    /// accounts, never claim an old password-less one (that stays a PWA-only path).
    func register(code: String, password: String, name: String, email: String?) async throws -> RegisterResult {
        let body = RegisterBody(code: code, password: password, name: name, email: email)
        do {
            return try await client.functions.invoke("jacked-auth", options: FunctionInvokeOptions(body: body))
        } catch FunctionsError.httpError(_, let data) where (try? JSONDecoder().decode(RegisterResult.self, from: data)) != nil {
            // A refusal that still carries a {status} body is an answer, not a failure.
            return try JSONDecoder().decode(RegisterResult.self, from: data)
        } catch {
            throw SupabaseError.from(error)
        }
    }
}

/// Read-only proof that the session works against RLS: the signed-in user's own
/// leaderboard row. No writes anywhere in this first slice.
struct ProfileAPI {
    var client = Backend.client

    struct OwnProfile: Decodable {
        let code: String
        let name: String?
        let workouts: Int?
        let streak: Int?
    }

    /// The client sends the SDK's current access token; `s` supplies the username.
    func ownProfile(_ s: AuthSession) async throws -> OwnProfile? {
        let rows: [OwnProfile] = try await SupabaseError.wrap {
            try await client.from("profiles")
                .select("code,name,workouts,streak")
                .eq("code", value: s.code)
                .execute()
                .value
        }
        return rows.first
    }
}
