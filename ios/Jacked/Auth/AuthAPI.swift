import Foundation

/// The Jacked sign-in contract, exactly as the PWA and the watches use it
/// (watch-client/AUTH_HANDOFF.md section 3, index.html registerAccount/cloudLogin):
///
///   sign up : POST /functions/v1/jacked-auth  {code, password, name, email?}
///   look up : POST /rest/v1/rpc/account_status {p_code}  -> the account's sign-in email
///             POST /rest/v1/rpc/account_status_by_email {p_email} -> the account's code
///   sign in : POST /auth/v1/token?grant_type=password
///   refresh : POST /auth/v1/token?grant_type=refresh_token
///   sign out: POST /auth/v1/logout
///
/// The Supabase Auth email is a synthetic, never-mailed id that only account_status hands
/// back. Never show it and never derive it from the username.
struct AuthAPI {
    var http = SupabaseHTTP()

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

    private func decodeStatus(_ data: Data) throws -> Status {
        let r = try JSONDecoder().decode(StatusResponse.self, from: data)
        switch r.status {
        case "claimed": return .claimed(email: r.email, code: r.code)
        case "unclaimed": return .unclaimed
        case "rate_limited": return .rateLimited
        default: return .notFound
        }
    }

    func accountStatus(code: String) async throws -> Status {
        let data = try await http.send("POST", "rest/v1/rpc/account_status", body: ["p_code": code])
        return try decodeStatus(data)
    }

    func accountStatus(email: String) async throws -> Status {
        let data = try await http.send("POST", "rest/v1/rpc/account_status_by_email", body: ["p_email": email])
        return try decodeStatus(data)
    }

    func signIn(email: String, password: String, code: String) async throws -> AuthSession {
        let data = try await http.send("POST", "auth/v1/token",
                                       query: [URLQueryItem(name: "grant_type", value: "password")],
                                       body: ["email": email, "password": password])
        return try JSONDecoder().decode(TokenResponse.self, from: data).session(code: code)
    }

    func refresh(_ s: AuthSession) async throws -> AuthSession {
        let data = try await http.send("POST", "auth/v1/token",
                                       query: [URLQueryItem(name: "grant_type", value: "refresh_token")],
                                       body: ["refresh_token": s.refreshToken])
        return try JSONDecoder().decode(TokenResponse.self, from: data).session(code: s.code)
    }

    func signOut(_ s: AuthSession) async {
        _ = try? await http.send("POST", "auth/v1/logout", bearer: s.accessToken)
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
        let data = try await http.send("POST", "functions/v1/jacked-auth",
                                       body: RegisterBody(code: code, password: password, name: name, email: email))
        return try JSONDecoder().decode(RegisterResult.self, from: data)
    }
}

/// Read-only proof that the session works against RLS: the signed-in user's own
/// leaderboard row. No writes anywhere in this first slice.
struct ProfileAPI {
    var http = SupabaseHTTP()

    struct OwnProfile: Decodable {
        let code: String
        let name: String?
        let workouts: Int?
        let streak: Int?
    }

    func ownProfile(_ s: AuthSession) async throws -> OwnProfile? {
        let data = try await http.send("GET", "rest/v1/profiles",
                                       query: [URLQueryItem(name: "code", value: "eq.\(s.code)"),
                                               URLQueryItem(name: "select", value: "code,name,workouts,streak")],
                                       bearer: s.accessToken)
        return try JSONDecoder().decode([OwnProfile].self, from: data).first
    }
}
