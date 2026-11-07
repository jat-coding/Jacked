#!/usr/bin/env bash
# Badge parity: the PWA's real computeBadges (node) vs BadgeMath.swift, on the same random
# accounts and the real exercise-db. Swift is compiled and run on the Mac over mac-ssh.
#   ios/Tests/parity/badges-run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; src="$here/../../Jacked"
export TZ="${TZ:-America/Denver}"
db="$here/exercises.json"
[ -s "$db" ] || curl -fsS -o "$db" "https://$(grep -o '[a-z0-9]*\.supabase\.co' "$src/Backend/SupabaseConfig.swift" | head -1)/storage/v1/object/public/exercise-images/exercises.json"
node "$here/badges-gen.mjs" "$db" "${PARITY_N:-300}"
files=("$src/Data/JSONValue.swift" "$src/Data/HomeMath.swift" "$src/Data/Backup.swift" "$src/Data/PWATables.swift" "$src/Data/WorkoutLog.swift"
  "$src/Data/LibraryMath.swift" "$src/Data/ExerciseCatalog.swift" "$src/Data/MetricsMath.swift" "$src/Data/BadgeMath.swift" "$src/Data/BadgeTables.swift" "$here/BadgesMain.swift" "$here/FinishStubs.swift")
mac="${MAC_SSH:-/home/roni/agent/scripts/broker/mac-ssh}"; host=sire@jacostas-macbook-pro.tail2df36b.ts.net
ssh_="ssh -i $HOME/.ssh/id_ed25519_mac -o BatchMode=yes -o ConnectTimeout=10 -o IdentitiesOnly=yes"
"$mac" "rm -rf /tmp/agent-jacked-bparity && mkdir -p /tmp/agent-jacked-bparity"
tar -C / -czf - "${files[@]#/}" "${here#/}/badges-fixtures.json" "${db#/}" --transform 's,.*/,,' | $ssh_ "$host" -- "tar -C /tmp/agent-jacked-bparity -xzf -"
"$mac" "export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; cd /tmp/agent-jacked-bparity && xcrun swiftc -parse-as-library -O -o bparity *.swift 2>&1 | grep -v warning: | head -40; TZ=$TZ ./bparity ."
scp -q -i "$HOME/.ssh/id_ed25519_mac" -o BatchMode=yes -o IdentitiesOnly=yes "$host:/tmp/agent-jacked-bparity/badges-swift-out.json" "$here/badges-swift-out.json"
python3 "$here/badges-compare.py" "$here"
