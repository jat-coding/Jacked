#!/usr/bin/env bash
# Finish/PR parity: the PWA's real buildFinishRec + commitPRs (node) vs WorkoutLog.swift, on the
# same random workouts. Swift is compiled and run on the Mac over mac-ssh (no swiftc on the desktop).
#   ios/Tests/parity/finish-run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; src="$here/../../Jacked"
export TZ="${TZ:-America/Denver}"
node "$here/finish-gen.mjs" "${PARITY_N:-600}"
files=("$src/Data/JSONValue.swift" "$src/Data/HomeMath.swift" "$src/Data/Backup.swift" "$src/Data/PWATables.swift" "$src/Data/WorkoutLog.swift" "$here/FinishMain.swift" "$here/FinishStubs.swift")
mac="${MAC_SSH:-/home/roni/agent/scripts/broker/mac-ssh}"; host=sire@jacostas-macbook-pro.tail2df36b.ts.net
ssh_="ssh -i $HOME/.ssh/id_ed25519_mac -o BatchMode=yes -o ConnectTimeout=10 -o IdentitiesOnly=yes"
"$mac" "rm -rf /tmp/agent-jacked-fparity && mkdir -p /tmp/agent-jacked-fparity"
tar -C / -czf - "${files[@]#/}" "${here#/}/finish-fixtures.json" --transform 's,.*/,,' | $ssh_ "$host" -- "tar -C /tmp/agent-jacked-fparity -xzf -"
"$mac" "export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; cd /tmp/agent-jacked-fparity && xcrun swiftc -parse-as-library -O -o fparity *.swift 2>&1 | grep -v warning: | head -30; TZ=$TZ ./fparity ."
scp -q -i "$HOME/.ssh/id_ed25519_mac" -o BatchMode=yes -o IdentitiesOnly=yes "$host:/tmp/agent-jacked-fparity/finish-swift-out.json" "$here/finish-swift-out.json"
python3 "$here/finish-compare.py" "$here"
