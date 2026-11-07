import Foundation

/// Owns "who is signed in" for the whole app. Views read `phase`; nothing else touches tokens.
@MainActor
final class AuthStore: ObservableObject {
    enum Phase: Equatable {
        case restoring
        case signedOut
        case signedIn(AuthSession)
    }

    @Published private(set) var phase: Phase = .restoring
    @Published var busy = false
    /// Inline message under the form (the PWA's #loginMsg / toast text).
    @Published var message: String?

    private let api = AuthAPI()

    var session: AuthSession? {
        if case .signedIn(let s) = phase { return s }
        return nil
    }

    /// App launch: reuse the Keychain session, refreshing it if it is about to expire.
    /// A network failure keeps the session (offline is not signed out, AUTH_HANDOFF.md 3d).
    func restore() async {
        if let dev = DevHooks.login {
            // Reuse a saved session that is already the test account: a fresh sign-in on every scripted
            // launch trips account_status's rate limit after a dozen runs.
            if (session ?? KeychainStore.load())?.code != Username.normalize(dev.user) {
                KeychainStore.clear()
                await logIn(identifier: dev.user, password: dev.pass)
                if session != nil { return }
            }
        }
        guard let saved = KeychainStore.load() else { phase = .signedOut; return }
        guard saved.needsRefresh else { phase = .signedIn(saved); return }
        do {
            let fresh = try await api.refresh(saved)
            KeychainStore.save(fresh)
            phase = .signedIn(fresh)
        } catch let e as SupabaseError where e.isNetwork || e.status >= 500 {
            phase = .signedIn(saved)
        } catch {
            KeychainStore.clear()
            phase = .signedOut
        }
    }

    /// Username or email + password. Mirrors cloudLogin() in index.html, minus the
    /// device-data replace step (this slice has no local workout store yet).
    func logIn(identifier raw: String, password: String) async {
        message = nil
        let ident = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let byEmail = Username.isEmailLike(ident)
        if ident.isEmpty || (!byEmail && Username.problem(ident) != nil) {
            message = "Enter a valid username or email"; return
        }
        if password.isEmpty { message = "Enter your password"; return }

        busy = true
        defer { busy = false }
        do {
            // Email login resolves email -> code, then code -> sign-in email, same two
            // throttled lookups as the PWA (weekly review #13, 2026-10-26).
            var code = Username.normalize(ident)
            if byEmail {
                switch try await api.accountStatus(email: ident.lowercased()) {
                case .claimed(_, let c?): code = c
                case .rateLimited: message = Self.rateLimited; return
                default: message = "No account found with that email"; return
                }
            }
            let signInEmail: String
            switch try await api.accountStatus(code: code) {
            case .claimed(let email?, _): signInEmail = email
            case .unclaimed:
                message = "\(code) doesn't have a password yet. Open Jacked on a device that's already signed in as \(code) and it will ask you to set one."
                return
            case .rateLimited: message = Self.rateLimited; return
            case .notFound: message = "No account found with that username"; return
            default: message = "Login failed, try again"; return
            }
            let s = try await api.signIn(email: signInEmail, password: password, code: code)
            KeychainStore.save(s)
            phase = .signedIn(s)
        } catch let e as SupabaseError {
            message = Self.describe(e, wrongPassword: "Wrong username or password.")
        } catch {
            message = "Login failed, try again"
        }
    }

    /// Mirrors obNext1() + registerAccount() in index.html.
    func signUp(username: String, name: String, email: String, password: String, confirm: String) async {
        message = nil
        if let p = Username.problem(username) { message = p; return }
        if let p = Username.emailProblem(email) { message = p; return }
        if let p = Username.passwordProblem(password, confirm: confirm) { message = p; return }
        let code = Username.normalize(username)
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        busy = true
        defer { busy = false }
        do {
            let r = try await api.register(code: code, password: password,
                                           name: trimmedName.isEmpty ? String(code.dropFirst()) : trimmedName,
                                           email: trimmedEmail.isEmpty ? nil : trimmedEmail)
            guard r.status == "ok", let signInEmail = r.email else {
                message = Self.registerMessage(r.status); return
            }
            let s = try await api.signIn(email: signInEmail, password: password, code: code)
            KeychainStore.save(s)
            phase = .signedIn(s)
        } catch let e as SupabaseError {
            message = Self.describe(e, wrongPassword: "Could not create account, try again")
        } catch {
            message = "Could not create account, try again"
        }
    }

    func logOut() async {
        if let s = session { await api.signOut(s) }
        KeychainStore.clear()
        message = nil
        phase = .signedOut
    }

    /// Hand out a usable access token, refreshing first if needed. A dead refresh token
    /// (400/401) means the session is gone: back to sign-in.
    func validSession() async -> AuthSession? {
        guard let s = session else { return nil }
        guard s.needsRefresh else { return s }
        do {
            let fresh = try await api.refresh(s)
            KeychainStore.save(fresh)
            phase = .signedIn(fresh)
            return fresh
        } catch let e as SupabaseError where e.isNetwork || e.status >= 500 {
            return s
        } catch {
            KeychainStore.clear()
            phase = .signedOut
            return nil
        }
    }

    private static let rateLimited = "Too many attempts from this connection, try again in a few minutes."

    private static func describe(_ e: SupabaseError, wrongPassword: String) -> String {
        if e.isNetwork { return "No connection, try again" }
        if e.status == 429 { return rateLimited }
        if e.status == 400 { return wrongPassword }
        return "Something went wrong (\(e.status)), try again"
    }

    /// Same wording as the PWA's sign-up toasts.
    private static func registerMessage(_ status: String) -> String {
        switch status {
        case "weak_password": return "That password is too weak or has appeared in a known data breach. Pick a different one."
        case "email_taken": return "That email is already in use on another account"
        case "invalid_email": return "Enter a valid email address"
        case "invalid_username": return "Username needs 3 to 20 letters, numbers or _"
        case "already_claimed", "taken", "proof_failed": return "That username is already taken"
        default: return "Could not create account, try again"
        }
    }
}
