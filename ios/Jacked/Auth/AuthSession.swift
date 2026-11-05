import Foundation
import Supabase

/// A signed-in Supabase Auth session for one Jacked account, as the views see it.
/// The SDK owns and persists the real session; this is a snapshot plus the Jacked username.
/// The password is never stored.
struct AuthSession: Equatable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var userId: String
    /// The account's normalized username ("@mom"): the key for every Jacked table.
    var code: String

    /// Refresh a minute early so a call never leaves with a token that dies in flight.
    var needsRefresh: Bool { expiresAt.timeIntervalSinceNow < 60 }

    init(accessToken: String, refreshToken: String, expiresAt: Date, userId: String, code: String) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
        self.userId = userId
        self.code = code
    }

    init(_ s: Session, code: String) {
        self.init(accessToken: s.accessToken, refreshToken: s.refreshToken,
                  expiresAt: Date(timeIntervalSince1970: s.expiresAt),
                  userId: s.user.id.uuidString.lowercased(), code: code)
    }
}
