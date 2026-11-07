#!/usr/bin/env bash
# jacked-sim-shot.sh -- install the built Jacked.app (jacked-ios-mac-build.sh output) in the
# booted simulator, launch it signed in as the THROWAWAY test account
# (config/jacked-ios-dev-test-account.json, DEBUG DevHooks), screenshot, copy back. No send.
#   scripts/jacked-sim-shot.sh <out.png> [--tab home] [--open day:today|workout:0|profile] [--wait 6]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; ROOT="$(dirname "$HERE")"
OUT="${1:?out.png}"; shift; TAB="home"; OPEN=""; WAIT=6
while [ $# -gt 0 ]; do case "$1" in --tab) TAB="$2"; shift 2;; --open) OPEN="$2"; shift 2;; --wait) WAIT="$2"; shift 2;; *) echo "bad arg $1" >&2; exit 2;; esac; done
ACCT="$ROOT/config/jacked-ios-dev-test-account.json"
U=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["username"])' "$ACCT")
P=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["password"])' "$ACCT")
APP=/tmp/agent-jacked-build/Build/Products/Debug-iphonesimulator/Jacked.app
"$HERE/broker/mac-ssh" "set -e; export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
UDID=\$(xcrun simctl list devices booted | grep -m1 iPhone | grep -oE '[0-9A-F-]{36}')
if [ -z \"\$UDID\" ]; then UDID=\$(xcrun simctl list devices available | grep -m1 iPhone | grep -oE '[0-9A-F-]{36}'); xcrun simctl boot \$UDID; xcrun simctl bootstatus \$UDID -b >/dev/null; fi
B=\$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' $APP/Info.plist)
xcrun simctl install \$UDID $APP
xcrun simctl terminate \$UDID \$B >/dev/null 2>&1 || true
xcrun simctl status_bar \$UDID override --time 9:41 --batteryState charged --batteryLevel 100 >/dev/null 2>&1 || true
SIMCTL_CHILD_JACKED_DEV_USER='$U' SIMCTL_CHILD_JACKED_DEV_PASS='$P' SIMCTL_CHILD_JACKED_DEV_TAB='$TAB' SIMCTL_CHILD_JACKED_DEV_OPEN='$OPEN' xcrun simctl launch \$UDID \$B >/dev/null
sleep $WAIT
xcrun simctl io \$UDID screenshot /tmp/jacked-sim-shot.png >/dev/null 2>&1"
scp -q -i "$HOME/.ssh/id_ed25519_mac" -o BatchMode=yes -o IdentitiesOnly=yes sire@jacostas-macbook-pro.tail2df36b.ts.net:/tmp/jacked-sim-shot.png "$OUT"
[ -s "$OUT" ] && echo "$OUT"
