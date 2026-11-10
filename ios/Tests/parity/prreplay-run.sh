#!/usr/bin/env bash
# PR replay parity: the PWA's real prReplay (node) vs PRReplay.swift, on the same random histories.
# Swift is compiled and run on the Mac over mac-ssh (no swiftc on the desktop).
#   ios/Tests/parity/prreplay-run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; src="$here/../../Jacked"
export TZ="${TZ:-America/Denver}"
node "$here/prreplay-gen.mjs" "${PARITY_N:-300}"
files=("$src/Data/JSONValue.swift" "$src/Data/HomeMath.swift" "$src/Data/Backup.swift" "$src/Data/PWATables.swift" "$src/Data/WorkoutLog.swift" "$src/Data/PRReplay.swift" "$src/Data/FriendsMath.swift" "$src/Data/LibraryMath.swift" "$src/Data/ExerciseCatalog.swift" "$src/Data/MetricsMath.swift" "$src/Data/BadgeMath.swift" "$src/Data/BadgeTables.swift" "$here/PRReplayMain.swift" "$here/FinishStubs.swift")
mac="${MAC_SSH:-/home/roni/agent/scripts/broker/mac-ssh}"; host=sire@jacostas-macbook-pro.tail2df36b.ts.net
ssh_="ssh -i $HOME/.ssh/id_ed25519_mac -o BatchMode=yes -o ConnectTimeout=10 -o IdentitiesOnly=yes"
"$mac" "rm -rf /tmp/agent-jacked-rparity && mkdir -p /tmp/agent-jacked-rparity"
tar -C / -czf - "${files[@]#/}" "${here#/}/prreplay-fixtures.json" --transform 's,.*/,,' | $ssh_ "$host" -- "tar -C /tmp/agent-jacked-rparity -xzf -"
"$mac" "export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; cd /tmp/agent-jacked-rparity && xcrun swiftc -parse-as-library -O -o rparity *.swift 2>&1 | grep -v warning: | head -30; TZ=$TZ ./rparity ."
scp -q -i "$HOME/.ssh/id_ed25519_mac" -o BatchMode=yes -o IdentitiesOnly=yes "$host:/tmp/agent-jacked-rparity/prreplay-swift-out.json" "$here/prreplay-swift-out.json"
python3 "$here/prreplay-compare.py" "$here"
