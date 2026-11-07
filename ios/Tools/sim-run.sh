#!/usr/bin/env bash
# sim-run.sh -- like scripts/jacked-sim-shot.sh, plus extra DEBUG DevHooks env and the app's
# stdout ([jacked-sync] lines) copied back. Signs in as the THROWAWAY test account only.
#   Tools/sim-run.sh <out-prefix> <wait-seconds> [KEY=VALUE ...]   (keys without JACKED_DEV_)
#   e.g. Tools/sim-run.sh /tmp/x 12 'RENAME=0|New name' CAS_DELAY=10
set -euo pipefail
OUT="$1"; WAIT="$2"; shift 2
ACCT=/home/roni/agent/config/jacked-ios-dev-test-account.json
U=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["username"])' "$ACCT")
P=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["password"])' "$ACCT")
case "$U" in ios_dev_test_*) ;; *) echo "refusing: not the test account" >&2; exit 2;; esac
ENVS="SIMCTL_CHILD_JACKED_DEV_USER='$U' SIMCTL_CHILD_JACKED_DEV_PASS='$P'"
for kv in "$@"; do ENVS="$ENVS SIMCTL_CHILD_JACKED_DEV_${kv%%=*}='${kv#*=}'"; done
APP=/tmp/agent-jacked-build/Build/Products/Debug-iphonesimulator/Jacked.app
/home/roni/agent/scripts/broker/mac-ssh "set -e; export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
UDID=\$(xcrun simctl list devices booted | grep -m1 iPhone | grep -oE '[0-9A-F-]{36}')
if [ -z \"\$UDID\" ]; then UDID=\$(xcrun simctl list devices available | grep -m1 iPhone | grep -oE '[0-9A-F-]{36}'); xcrun simctl boot \$UDID; xcrun simctl bootstatus \$UDID -b >/dev/null; fi
B=\$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' $APP/Info.plist)
xcrun simctl install \$UDID $APP
xcrun simctl terminate \$UDID \$B >/dev/null 2>&1 || true
xcrun simctl status_bar \$UDID override --time 9:41 --batteryState charged --batteryLevel 100 >/dev/null 2>&1 || true
rm -f \$HOME/jacked-sim-stdout.txt
$ENVS xcrun simctl launch --stdout=\$HOME/jacked-sim-stdout.txt \$UDID \$B >/dev/null
sleep $WAIT
xcrun simctl io \$UDID screenshot /tmp/jacked-sim-shot.png >/dev/null 2>&1"
S="scp -q -i $HOME/.ssh/id_ed25519_mac -o BatchMode=yes -o IdentitiesOnly=yes sire@jacostas-macbook-pro.tail2df36b.ts.net"
$S:/tmp/jacked-sim-shot.png "$OUT.png"; $S:jacked-sim-stdout.txt "$OUT.log" 2>/dev/null || touch "$OUT.log"
echo "$OUT.png"; cat "$OUT.log"
