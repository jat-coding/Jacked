#!/usr/bin/env bash
# Friends parity: the PWA's real yourStats/myActivity/monthOf/crownCodes (node) vs FriendsMath.swift, on the same random
# accounts and the real exercise-db. Swift is compiled and run on the Mac over mac-ssh.
#   ios/Tests/parity/friends-run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; src="$here/../../Jacked"
export TZ="${TZ:-America/Denver}"
db="$here/exercises.json"
[ -s "$db" ] || curl -fsS -o "$db" "https://$(grep -o '[a-z0-9]*\.supabase\.co' | head -1)/storage/v1/object/public/exercise-images/exercises.json"
node "$here/friends-gen.mjs" "$db" "${PARITY_N:-300}"
files=("$src/Data/JSONValue.swift" "$src/Data/HomeMath.swift" "$src/Data/Backup.swift" "$src/Data/PWATables.swift" "$src/Data/WorkoutLog.swift"
  "$src/Data/LibraryMath.swift" "$src/Data/ExerciseCatalog.swift" "$src/Data/MetricsMath.swift" "$src/Data/BadgeMath.swift" "$src/Data/BadgeTables.swift" "$src/Data/FriendsMath.swift" "$here/FriendsMain.swift" "$here/FinishStubs.swift")
mac="${MAC_SSH:-/home/roni/agent/scripts/broker/mac-ssh}"; host=sire@jacostas-macbook-pro.tail2df36b.ts.net
ssh_="ssh -i $HOME/.ssh/id_ed25519_mac -o BatchMode=yes -o ConnectTimeout=10 -o IdentitiesOnly=yes"
"$mac" "rm -rf /tmp/agent-jacked-fparity && mkdir -p /tmp/agent-jacked-fparity"
tar -C / -czf - "${files[@]#/}" "${here#/}/friends-fixtures.json" "${db#/}" --transform 's,.*/,,' | $ssh_ "$host" -- "tar -C /tmp/agent-jacked-fparity -xzf -"
"$mac" "export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; cd /tmp/agent-jacked-fparity && xcrun swiftc -parse-as-library -O -o fparity *.swift 2>&1 | grep -v warning: | head -40; TZ=$TZ ./fparity ."
scp -q -i "$HOME/.ssh/id_ed25519_mac" -o BatchMode=yes -o IdentitiesOnly=yes "$host:/tmp/agent-jacked-fparity/friends-swift-out.json" "$here/friends-swift-out.json"
python3 "$here/friends-compare.py" "$here"
