import SwiftUI
import UIKit
import CryptoKit

/// Remote images (exercise photos, avatars) with a memory cache in front of a disk cache, so photos
/// that were loaded once keep working offline (the PWA gets this from its service worker).
/// Disk copies live in Library/Caches/jacked-img, one file per URL; iOS may purge them when space is
/// tight, they are simply fetched again.
enum ImageCache {
    private static let mem: NSCache<NSString, UIImage> = { let c = NSCache<NSString, UIImage>(); c.countLimit = 400; return c }()
    private static var dir: URL = {
        let d = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("jacked-img", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()
    static func file(for url: URL) -> URL {
        let h = SHA256.hash(data: Data(url.absoluteString.utf8)).map { String(format: "%02x", $0) }.joined()
        return dir.appendingPathComponent(h)
    }
    static func cached(_ url: URL) -> UIImage? {
        if url.isFileURL { return UIImage(contentsOfFile: url.path) }
        if let i = mem.object(forKey: url.absoluteString as NSString) { return i }
        if let d = try? Data(contentsOf: file(for: url)), let i = UIImage(data: d) { mem.setObject(i, forKey: url.absoluteString as NSString); return i }
        return nil
    }
    static func load(_ url: URL) async -> UIImage? {
        if let i = cached(url) { return i }
        guard let (d, r) = try? await URLSession.shared.data(from: url), (r as? HTTPURLResponse)?.statusCode == 200,
              let i = UIImage(data: d) else { return nil }
        try? d.write(to: file(for: url), options: .atomic)
        mem.setObject(i, forKey: url.absoluteString as NSString)
        return i
    }
    /// Total size of the disk cache in bytes (for the check script / debugging).
    static var diskBytes: Int {
        ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.fileSizeKey])) ?? [])
            .reduce(0) { $0 + ((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
    }
}

/// AsyncImage with the disk cache; `placeholder` shows while loading and when the image is absent or fails.
struct CachedImage<P: View>: View {
    let url: URL?
    @ViewBuilder var placeholder: () -> P
    @State private var img: UIImage?
    var body: some View {
        Group {
            if let img { Image(uiImage: img).resizable().scaledToFill() } else { placeholder() }
        }
        .task(id: url) {
            guard let url else { img = nil; return }
            if let c = ImageCache.cached(url) { img = c; return }
            img = await ImageCache.load(url)
        }
    }
}

/// thumbH() / exIcon(): the exercise photo, or the dumbbell (heart for cardio) line icon tinted by muscle colour on bg4.
struct ExPhoto: View {
    let url: URL?
    let muscle: String
    let size: CGFloat
    var radius: CGFloat = 8
    var body: some View {
        CachedImage(url: url) { ExPhoto.fallback(muscle: muscle, size: size) }
            .frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: radius))
    }
    /// MCOL (index.html:1384), the PWA's full muscle colour table.
    static let mcol = ["chest": "#5aa9ff", "back": "#3ddc97", "shoulders": "#ff9f4d", "biceps": "#b07cff", "triceps": "#ff5d6c",
        "legs": "#20d3c2", "quadriceps": "#20d3c2", "hamstrings": "#5ce9da", "glutes": "#ffca4d", "core": "#4ad9d9", "abdominals": "#4ad9d9",
        "cardio": "#ff5d6c", "full body": "#20d3c2", "lats": "#3ddc97", "traps": "#ff9f4d", "forearms": "#b07cff", "lower back": "#5aa9ff"]
    static func fallback(muscle: String, size: CGFloat) -> some View {
        let m = muscle.lowercased()
        let hex = mcol[m] ?? "#a0a0b0"
        let col = Color(hex: UInt32(hex.dropFirst(), radix: 16) ?? 0xA0A0B0)
        return ZStack { Theme.bg4; JIcon(m == "cardio" ? "heart" : "dumbbell", (size * 0.46).rounded()).foregroundStyle(col) }
    }
}
