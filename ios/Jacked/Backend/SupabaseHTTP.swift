import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking   // Linux only: lets ios/Tests/linux-check.sh compile this layer off a Mac
#endif

/// Error from a Supabase HTTP call. `status` is the HTTP status. 0 = the phone has no connection;
/// -1 = the request was cancelled (not a failure); -2 = the phone tried but got no usable answer
/// (timeout, TLS, DNS, anything else).
struct SupabaseError: Error, LocalizedError {
    let status: Int
    let code: String?
    let message: String

    static let cancelledStatus = -1, unreachableStatus = -2
    var isNetwork: Bool { status == 0 }
    var isCancelled: Bool { status == Self.cancelledStatus }
    /// No usable answer from the server for any transport reason: keep local data and the session.
    var isTransient: Bool { status == 0 || status == Self.unreachableStatus }
    var errorDescription: String? { message }
}

/// Thin JSON-over-HTTP layer for the Supabase REST, Auth and Functions APIs.
/// No SDK: see IOS_REWRITE_PLAN.md, "Decision: raw REST vs supabase-swift".
struct SupabaseHTTP {
    var baseURL = SupabaseConfig.url
    var key = SupabaseConfig.publishableKey
    var session: URLSession = .shared

    /// `bearer` is the user's access token for signed-in calls; signed-out calls send the
    /// publishable key there, exactly like the PWA's supabase-js client does.
    func send<Body: Encodable>(_ method: String, _ path: String,
                               query: [URLQueryItem] = [],
                               body: Body?,
                               bearer: String? = nil,
                               headers: [String: String] = [:]) async throws -> Data {
        var comps = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            comps.queryItems = query
            // URLComponents leaves "+" and "@" bare. PostgREST reads "+" as a space, and the
            // contract says "@" travels as %40 (watch-client/AUTH_HANDOFF.md sections 2 and 4).
            comps.percentEncodedQuery = comps.percentEncodedQuery?
                .replacingOccurrences(of: "+", with: "%2B")
                .replacingOccurrences(of: "@", with: "%40")
        }
        var req = URLRequest(url: comps.url!)
        req.httpMethod = method
        req.timeoutInterval = 20
        req.setValue(key, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(bearer ?? key)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        return try await perform(req)
    }

    /// A non-JSON body (Storage uploads): the bytes as they are, with their own content type.
    func upload(_ method: String, _ path: String, data body: Data, contentType: String,
                bearer: String, headers: [String: String] = [:]) async throws -> Data {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.timeoutInterval = 30
        req.setValue(key, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        req.setValue(contentType, forHTTPHeaderField: "Content-Type")
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        req.httpBody = body
        return try await perform(req)
    }

    private func perform(_ req: URLRequest) async throws -> Data {
        let data: Data
        let resp: URLResponse
        do {
            (data, resp) = try await session.data(for: req)
        } catch {
            throw Self.transportError(error)
        }
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw Self.decodeError(status: status, data: data)
        }
        return data
    }

    /// Only genuine connectivity failures are "No connection"; a cancelled request is not a failure.
    static func transportError(_ error: Error) -> SupabaseError {
        if error is CancellationError || (error as? URLError)?.code == .cancelled {
            return SupabaseError(status: SupabaseError.cancelledStatus, code: nil, message: "Cancelled")
        }
        switch (error as? URLError)?.code {
        case .notConnectedToInternet?, .networkConnectionLost?, .dataNotAllowed?, .internationalRoamingOff?:
            return SupabaseError(status: 0, code: nil, message: "No connection")
        default:
            return SupabaseError(status: SupabaseError.unreachableStatus, code: nil,
                                 message: "Couldn't reach the server")
        }
    }

    func send(_ method: String, _ path: String,
              query: [URLQueryItem] = [],
              bearer: String? = nil,
              headers: [String: String] = [:]) async throws -> Data {
        try await send(method, path, query: query, body: Optional<Empty>.none, bearer: bearer, headers: headers)
    }

    private struct Empty: Encodable {}

    /// Auth returns `{error_code, msg}` (or `{error, error_description}` on older paths);
    /// PostgREST returns `{code, message}`.
    private static func decodeError(status: Int, data: Data) -> SupabaseError {
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let code = (obj["error_code"] ?? obj["code"] ?? obj["error"]) as? String
        let msg = (obj["msg"] ?? obj["message"] ?? obj["error_description"]) as? String
        return SupabaseError(status: status, code: code, message: msg ?? "HTTP \(status)")
    }
}
