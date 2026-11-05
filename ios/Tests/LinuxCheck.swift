// Off-Mac sanity check for the Foundation-only layer (no SwiftUI, no Keychain), on supabase-swift.
// Run: ios/Tests/linux-check.sh   (needs a Swift toolchain; Mr. Roni's Mac does not need this)
// Only calls that cannot create or change anything on the live project:
// a lookup of a made-up username, a sign-in with a made-up email, two sign-ups the server
// rejects before touching any table, and an own-profile read with a fake token.
import Foundation
import Supabase
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

var fails = 0
func check(_ ok: Bool, _ msg: String) { print((ok ? "PASS " : "FAIL ") + msg); if !ok { fails += 1 } }

@main struct LinuxCheck {
    static func main() async {
        // Username rules: must match index.html normU/validU (expected values from node, see .sh)
        let cases: [(String, String)] = [("  @Mom ", "@mom"), ("@@Big_Lifter!", "@big_lifter"),
                                         ("İsmail", "@ismail"), ("", ""), ("@", ""), ("a b-c", "@abc")]
        for (input, want) in cases { check(Username.normalize(input) == want, "normalize \(input.debugDescription) -> \(want.debugDescription)") }
        check(Username.problem("@ab") != nil && Username.problem("@abc") == nil, "username length floor 3")
        check(Username.problem(String(repeating: "a", count: 21)) != nil, "username cap 20")
        check(Username.isEmailLike("a@b.co") && !Username.isEmailLike("@mom"), "email-like detection")
        check(Username.passwordProblem("1234567") != nil && Username.passwordProblem("12345678") == nil, "password floor 8")
        check(Username.passwordProblem("12345678", confirm: "x") == "Passwords don't match", "confirm mismatch")

        let api = AuthAPI()   // Backend.client on an in-memory session store (no Keychain on Linux)

        check(api.storedSession() == nil, "no stored session on a fresh store")
        await api.signOut()
        check(api.storedSession() == nil, "sign-out with no session is a quiet no-op")
        let net = SupabaseError.from(URLError(.notConnectedToInternet)) as? SupabaseError
        check(net?.isNetwork == true, "URLError maps to a network error (offline is not signed out)")

        do {
            let st = try await api.accountStatus(code: "@zz_nonexistent_ios_probe")
            check(st == .notFound || st == .rateLimited, "live rpc account_status(made-up) -> \(st)")
        } catch { check(false, "account_status threw \(error)") }

        do {
            let st = try await api.accountStatus(email: "nobody-ios-probe@example.com")
            check(st == .notFound || st == .rateLimited, "live rpc account_status_by_email(made-up) -> \(st)")
        } catch { check(false, "account_status_by_email threw \(error)") }

        do {
            _ = try await api.signIn(email: "nobody-\(UUID().uuidString.prefix(8))@users.jacked.example.com",
                                     password: "definitely-wrong", code: "@nobody")
            check(false, "sign-in with made-up email unexpectedly succeeded")
        } catch let e as SupabaseError {
            check(e.status == 400, "live auth.signIn bad credentials -> HTTP \(e.status) \(e.code ?? "")")
        } catch { check(false, "sign-in threw non-Supabase \(error)") }
        check(api.storedSession() == nil, "failed sign-in leaves no session behind")

        do {
            let r = try await api.register(code: "x", password: "whatever123", name: "", email: nil)
            check(r.status == "invalid_username", "live functions.invoke jacked-auth bad username -> \(r.status)")
            let r2 = try await api.register(code: "@zz_ios_probe", password: "short", name: "", email: nil)
            check(r2.status == "weak_password", "live functions.invoke jacked-auth short password -> \(r2.status)")
        } catch { check(false, "register threw \(error)") }

        do {
            // A second client whose "session" is a garbage JWT: PostgREST must refuse it.
            let fakeClient = Backend.makeClient(storage: MemoryStore(), accessToken: { "not-a-jwt" })
            let fake = AuthSession(accessToken: "not-a-jwt", refreshToken: "x", expiresAt: .distantFuture,
                                   userId: "00000000-0000-0000-0000-000000000000", code: "@zz_ios_probe")
            _ = try await ProfileAPI(client: fakeClient).ownProfile(fake)
            check(false, "own-profile read with fake token unexpectedly succeeded")
        } catch let e as SupabaseError {
            check(e.status == 401, "live own-profile read with fake token -> HTTP \(e.status) \(e.code ?? "")")
        } catch { check(false, "profile read threw \(error)") }

        print(fails == 0 ? "\nALL PASS" : "\n\(fails) FAILED")
        exit(fails == 0 ? 0 : 1)
    }
}
