#!/usr/bin/env bash
# Compile-check + live smoke test of the Foundation-only layer on Linux (the desktop), now on
# supabase-swift: builds a throwaway SwiftPM package around the app's Backend/ and Auth/ files.
# SWIFT overrides the toolchain's `swift` path. SwiftUI files and AuthStore (Combine) are
# excluded: they need Apple SDKs. KeychainStore is included but compiles to nothing off Apple.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; src="$here/../Jacked"
swift="${SWIFT:-swift}"
work="${JACKED_IOS_CHECK_DIR:-${TMPDIR:-/tmp}/jacked-ios-linux-check}"   # kept between runs: SPM cache
mkdir -p "$work/Sources/JackedLinuxCheck"
rm -f "$work/Sources/JackedLinuxCheck/"*.swift
cp "$src/Backend/"*.swift "$src/Auth/Username.swift" "$src/Auth/AuthSession.swift" \
   "$src/Auth/AuthAPI.swift" "$src/Auth/KeychainStore.swift" "$here/LinuxCheck.swift" \
   "$work/Sources/JackedLinuxCheck/"
cat > "$work/Package.swift" <<'PKG'
// swift-tools-version:5.10
// Tools 5.10 = Swift 5 language mode, same as the Xcode target.
import PackageDescription
let package = Package(
  name: "JackedLinuxCheck",
  dependencies: [.package(url: "https://github.com/supabase/supabase-swift.git", from: "2.0.0")],
  targets: [.executableTarget(
    name: "JackedLinuxCheck",
    dependencies: [.product(name: "Supabase", package: "supabase-swift")])]
)
PKG
cd "$work"
"$swift" build
"$work/.build/debug/JackedLinuxCheck"
