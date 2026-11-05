import Foundation
import Supabase
#if canImport(FoundationNetworking)
import FoundationNetworking   // Linux only: lets ios/Tests/linux-check.sh compile this layer off a Mac
#endif

/// The one `supabase-swift` client for the whole app. Auth, PostgREST and Edge Functions all go
/// through it, and it attaches the signed-in user's access token to every call by itself.
/// Session storage, refresh and refresh-token rotation are the SDK's; where the session is
/// stored is ours (`KeychainStore`, this device only).
enum Backend {
    #if canImport(Security)
    static let storage: any AuthLocalStorage = KeychainStore()
    #else
    static let storage: any AuthLocalStorage = MemoryStore()   // Linux check only, no Keychain there
    #endif

    static let client = makeClient(storage: storage)

    static func makeClient(storage: any AuthLocalStorage,
                           accessToken: (@Sendable () async throws -> String?)? = nil) -> SupabaseClient {
        SupabaseClient(
            supabaseURL: SupabaseConfig.url,
            supabaseKey: SupabaseConfig.publishableKey,
            options: SupabaseClientOptions(
                auth: .init(storage: storage,
                            autoRefreshToken: true,
                            emitLocalSessionAsInitialSession: true,
                            accessToken: accessToken)))
    }
}

#if !canImport(Security)
final class MemoryStore: AuthLocalStorage, @unchecked Sendable {
    private var items: [String: Data] = [:]
    private let lock = NSLock()
    func store(key: String, value: Data) throws { lock.lock(); items[key] = value; lock.unlock() }
    func retrieve(key: String) throws -> Data? { lock.lock(); defer { lock.unlock() }; return items[key] }
    func remove(key: String) throws { lock.lock(); items[key] = nil; lock.unlock() }
}
#endif

/// Error from a Supabase call, in one shape for the UI whichever sub-client threw it.
/// `status` is the HTTP status (0 = never reached the server).
struct SupabaseError: Error, LocalizedError {
    let status: Int
    let code: String?
    let message: String

    var isNetwork: Bool { status == 0 }
    var errorDescription: String? { message }

    /// Runs one SDK call and turns whatever it throws into a `SupabaseError`.
    static func wrap<T>(_ op: () async throws -> T) async throws -> T {
        do { return try await op() } catch { throw from(error) }
    }

    static func from(_ error: Error) -> Error {
        switch error {
        case let e as SupabaseError:
            return e
        case let e as URLError:
            return SupabaseError(status: 0, code: "\(e.code.rawValue)", message: "No connection")
        case let e as AuthError:
            switch e {
            case .api(let message, let code, _, let response):
                return SupabaseError(status: response.statusCode, code: code.rawValue, message: message)
            case .weakPassword(let message, _):
                return SupabaseError(status: 422, code: "weak_password", message: message)
            case .sessionMissing:
                return SupabaseError(status: 401, code: "session_not_found", message: e.message)
            default:
                return SupabaseError(status: 401, code: e.errorCode.rawValue, message: e.message)
            }
        case let e as PostgrestError:
            // PostgrestError carries PostgREST's code but not the HTTP status. PGRST3xx are the
            // JWT errors PostgREST sends as 401; 42501 is an RLS/permission refusal (403).
            let status = e.code?.hasPrefix("PGRST3") == true ? 401 : e.code == "42501" ? 403 : 400
            return SupabaseError(status: status, code: e.code, message: e.message)
        case let e as HTTPError:
            return SupabaseError(status: e.response.statusCode, code: nil, message: "HTTP \(e.response.statusCode)")
        case let e as FunctionsError:
            switch e {
            case .httpError(let code, _): return SupabaseError(status: code, code: nil, message: "HTTP \(code)")
            case .relayError: return SupabaseError(status: 502, code: "relay_error", message: "Relay error")
            }
        default:
            return error
        }
    }
}
