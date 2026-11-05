import Foundation

/// A signed-in Supabase Auth session for one Jacked account.
/// Persisted in the Keychain; the password is never stored.
struct AuthSession: Codable, Equatable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var userId: String
    /// The account's normalized username ("@mom"): the key for every Jacked table.
    var code: String

    /// Refresh a minute early so a call never leaves with a token that dies in flight.
    var needsRefresh: Bool { expiresAt.timeIntervalSinceNow < 60 }
}

/// Wire shape of `POST /auth/v1/token` (password and refresh_token grants).
struct TokenResponse: Decodable {
    struct User: Decodable { let id: String }
    let access_token: String
    let refresh_token: String
    let expires_in: Double?
    let expires_at: Double?
    let user: User

    func session(code: String) -> AuthSession {
        let exp = expires_at.map { Date(timeIntervalSince1970: $0) }
            ?? Date().addingTimeInterval(expires_in ?? 3600)
        return AuthSession(accessToken: access_token, refreshToken: refresh_token,
                           expiresAt: exp, userId: user.id, code: code)
    }
}
