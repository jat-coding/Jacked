#if canImport(Security)
import Foundation
import Security
import Supabase

/// Where `supabase-swift` keeps the session (and where AuthAPI keeps the username next to it).
/// The SDK's own `KeychainLocalStorage` would also work, but it stores items as
/// `AfterFirstUnlock`, which lets a live refresh token ride an encrypted backup onto another
/// phone. This keeps the scaffold's `AfterFirstUnlockThisDeviceOnly`: readable after first
/// unlock so a background refresh can still reach it, never migrated off this device.
struct KeychainStore: AuthLocalStorage {
    private let service = "app.jacked.session"

    private func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: key]
    }

    func store(key: String, value: Data) throws {
        let attrs: [String: Any] = [
            kSecValueData as String: value,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var st = SecItemUpdate(query(key) as CFDictionary, attrs as CFDictionary)
        if st == errSecItemNotFound {
            var add = query(key)
            add.merge(attrs) { _, new in new }
            st = SecItemAdd(add as CFDictionary, nil)
        }
        guard st == errSecSuccess else { throw KeychainError(status: st) }
    }

    func retrieve(key: String) throws -> Data? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let st = SecItemCopyMatching(q as CFDictionary, &out)
        if st == errSecItemNotFound { return nil }
        guard st == errSecSuccess else { throw KeychainError(status: st) }
        return out as? Data
    }

    func remove(key: String) throws {
        let st = SecItemDelete(query(key) as CFDictionary)
        guard st == errSecSuccess || st == errSecItemNotFound else { throw KeychainError(status: st) }
    }

    struct KeychainError: Error { let status: OSStatus }
}
#endif
