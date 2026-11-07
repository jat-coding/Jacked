#!/usr/bin/env bash
# jacked-ios-mac-build.sh -- copy a local Jacked ios/ tree to the Mac and build it for the
# simulator with xcodebuild, into /tmp/agent-jacked-build (the path jacked-sim-*.sh install from).
#   scripts/jacked-ios-mac-build.sh <path-to-ios-dir>
# DEVELOPER_DIR override: see memory/lessons/mac-ssh-xcrun-needs-developer-dir-override.md.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${1:?usage: jacked-ios-mac-build.sh <ios dir>}"
[ -f "$SRC/Jacked.xcodeproj/project.pbxproj" ] || { echo "not an ios dir: $SRC" >&2; exit 2; }
KEY="$HOME/.ssh/id_ed25519_mac"; HOST=sire@jacostas-macbook-pro.tail2df36b.ts.net
SSH="ssh -i $KEY -o BatchMode=yes -o ConnectTimeout=10 -o IdentitiesOnly=yes"
"$HERE/broker/mac-ssh" "rm -rf /tmp/agent-jacked-src && mkdir -p /tmp/agent-jacked-src"
tar -C "$SRC" --exclude=xcuserdata -czf - . | $SSH "$HOST" -- "tar -C /tmp/agent-jacked-src -xzf -"
"$HERE/broker/mac-ssh" "export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; cd /tmp/agent-jacked-src && xcodebuild -project Jacked.xcodeproj -scheme Jacked -sdk iphonesimulator -configuration Debug -derivedDataPath /tmp/agent-jacked-build CODE_SIGNING_ALLOWED=NO build 2>&1 | grep -E 'error:|warning: unre|BUILD SUCCEEDED|BUILD FAILED' | head -60"
