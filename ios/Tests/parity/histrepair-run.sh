#!/usr/bin/env bash
# Edit / Delete Workout parity: the PWA's real saveWE / commitHistRepair (node) vs HistRepair.swift.
# Swift is compiled and run on the Mac over mac-ssh (no swiftc on the desktop).
#   ios/Tests/parity/histrepair-run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; src="$here/../../Jacked"
export TZ="${TZ:-America/Denver}"
node "$here/histrepair-gen.mjs" "${PARITY_N:-300}"
files=("$src/Data/JSONValue.swift" "$src/Data/HomeMath.swift" "$src/Data/Backup.swift" "$src/Data/PWATables.swift" "$src/Data/WorkoutLog.swift" "$src/Data/PRReplay.swift" "$src/Data/BackupMerge.swift" "$src/Data/HistRepair.swift" "$here/HistRepairMain.swift" "$here/FinishStubs.swift")
mac="${MAC_SSH:-/home/roni/agent/scripts/broker/mac-ssh}"; host=sire@jacostas-macbook-pro.tail2df36b.ts.net
ssh_="ssh -i $HOME/.ssh/id_ed25519_mac -o BatchMode=yes -o ConnectTimeout=10 -o IdentitiesOnly=yes"
"$mac" "rm -rf /tmp/agent-jacked-hparity && mkdir -p /tmp/agent-jacked-hparity"
tar -C / -czf - "${files[@]#/}" "${here#/}/histrepair-fixtures.json" --transform 's,.*/,,' | $ssh_ "$host" -- "tar -C /tmp/agent-jacked-hparity -xzf -"
"$mac" "export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; cd /tmp/agent-jacked-hparity && xcrun swiftc -parse-as-library -O -o hparity *.swift 2>&1 | grep -v warning: | head -30; TZ=$TZ ./hparity ."
scp -q -i "$HOME/.ssh/id_ed25519_mac" -o BatchMode=yes -o IdentitiesOnly=yes "$host:/tmp/agent-jacked-hparity/histrepair-swift-out.json" "$here/histrepair-swift-out.json"
python3 "$here/histrepair-compare.py" "$here"
