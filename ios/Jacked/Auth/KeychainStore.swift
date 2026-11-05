import Foundation
import Security

/// Stores the session in the Keychain (this device only, readable after first unlock so a
/// background refresh can still reach it).
enum KeychainStore {
    private static let service = "app.jacked.session"
    private static let account = "current"

    private static var baseQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    static func load() -> AuthSession? {
        var q = baseQuery
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return try? JSONDecoder().decode(AuthSession.self, from: data)
    }

    /// Refresh tokens rotate (AUTH_HANDOFF.md 3d): the new pair must be saved before it is used.
    @discardableResult
    static func save(_ s: AuthSession) -> Bool {
        guard let data = try? JSONEncoder().encode(s) else { return false }
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let st = SecItemUpdate(baseQuery as CFDictionary, attrs as CFDictionary)
        if st == errSecItemNotFound {
            var add = baseQuery
            add.merge(attrs) { _, new in new }
            return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
        }
        return st == errSecSuccess
    }

    static func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}
