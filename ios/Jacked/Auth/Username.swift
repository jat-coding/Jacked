import Foundation

/// Username / password rules, ported 1:1 from the PWA (index.html normU/validU/isEmailLike/
/// pwProblem) and the server (supabase/functions/jacked-auth/logic.ts). Keep them identical:
/// the server rejects anything these let through.
enum Username {
    /// "  @Mom! " -> "@mom". Empty string when nothing usable is left.
    static func normalize(_ s: String) -> String {
        var h = s.trimmingCharacters(in: .whitespacesAndNewlines)
        while h.hasPrefix("@") { h.removeFirst() }
        // Per Unicode scalar, like the JS regex /[^a-z0-9_]/g (which works on code units).
        let kept = h.lowercased().unicodeScalars.filter {
            ("a"..."z").contains($0) || ("0"..."9").contains($0) || $0 == "_"
        }
        h = String(String.UnicodeScalarView(kept))
        return h.isEmpty ? "" : "@" + h
    }

    /// nil when valid, else the message the PWA shows.
    static func problem(_ s: String) -> String? {
        let h = normalize(s).dropFirst()
        if h.count < 3 { return "Username needs at least 3 letters/numbers" }
        if h.count > 20 { return "Username too long (max 20)" }
        return nil
    }

    static func isEmailLike(_ s: String) -> Bool {
        s.trimmingCharacters(in: .whitespacesAndNewlines)
            .range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil
    }

    static func emailProblem(_ s: String) -> String? {
        let v = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if v.isEmpty { return nil }
        if v.count > 255 { return "Email too long" }
        if !isEmailLike(v) { return "Enter a valid email address, or leave it blank" }
        return nil
    }

    static func passwordProblem(_ pw: String, confirm: String? = nil) -> String? {
        // JS .length counts UTF-16 units; the server (logic.ts) checks the same way.
        if pw.utf16.count < 8 { return "Password needs at least 8 characters" }
        if pw.utf16.count > 72 { return "Password too long (max 72)" }
        if let confirm, confirm != pw { return "Passwords don't match" }
        return nil
    }
}
