import Foundation

/// The live Jacked backend. Same project, same publishable key as the PWA
/// (`jacked-pwa/index.html`, SUPABASE_URL / SUPABASE_ANON_KEY) and both watch apps.
/// The publishable key is public by design: every table is locked down by RLS and
/// only a signed-in user's access token can read or write their own rows.
enum SupabaseConfig {
    static let url = URL(string: "https://qehlrwnumrjktujidabz.supabase.co")!
    static let publishableKey = "sb_publishable_vmf9BELfVFZpKrdMN3Z34g_R9l056gJ"
}
