import UIKit

/// Custom exercise photos (index.html getExPhoto / setExPhoto / resizeExPhoto): a 256x256 centre-cropped JPEG
/// per exercise, kept on THIS device only. Never synced and never in a backup, same as the web app
/// (Mr. Roni, 2026-09-30), so another device shows the placeholder until photographed there too.
enum ExPhotoStore {
    private static var dir: URL {
        let d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("exPhotos", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }
    private static func file(_ id: String) -> URL { dir.appendingPathComponent(id.replacingOccurrences(of: "/", with: "_") + ".jpg") }

    /// The stored photo as a file URL (AsyncImage reads it like a web one), nil when none.
    static func url(_ id: String) -> URL? { let f = file(id); return FileManager.default.fileExists(atPath: f.path) ? f : nil }

    /// resizeExPhoto: centre square, 256 px, JPEG 0.82.
    static func save(_ id: String, image: UIImage) {
        let side = min(image.size.width, image.size.height), s = CGSize(width: 256, height: 256)
        let out = UIGraphicsImageRenderer(size: s, format: { let f = UIGraphicsImageRendererFormat(); f.scale = 1; return f }()).image { _ in
            let scale = 256 / side
            image.draw(in: CGRect(x: -(image.size.width - side) / 2 * scale, y: -(image.size.height - side) / 2 * scale,
                                  width: image.size.width * scale, height: image.size.height * scale))
        }
        try? out.jpegData(compressionQuality: 0.82)?.write(to: file(id), options: .atomic)
    }

    static func remove(_ id: String) { try? FileManager.default.removeItem(at: file(id)) }
}
