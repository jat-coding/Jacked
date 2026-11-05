#!/usr/bin/env bash
# Compile-check + live smoke test of the Foundation-only layer on Linux (the desktop).
# SWIFTC overrides the compiler path. SwiftUI/Keychain files are excluded: they need Apple SDKs.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; src="$here/../Jacked"
swiftc="${SWIFTC:-swiftc}"
out="$(mktemp -d)"
"$swiftc" -parse-as-library -swift-version 5 -o "$out/check" \
  "$src/Backend/SupabaseConfig.swift" "$src/Backend/SupabaseHTTP.swift" \
  "$src/Auth/Username.swift" "$src/Auth/AuthSession.swift" "$src/Auth/AuthAPI.swift" \
  "$here/LinuxCheck.swift"
"$out/check"
