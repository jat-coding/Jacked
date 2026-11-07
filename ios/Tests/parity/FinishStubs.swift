// Stand-ins for app-only types the Data files reference, so they compile alone for the parity run.
import Foundation
enum SupabaseConfig { static let url = URL(string: "https://example.invalid")! }
