#!/usr/bin/env bash
# Metrics parity: the PWA's real stats functions (node) vs MetricsMath.swift, on the same random
# accounts and the real exercise-db. Swift is compiled and run on the Mac over mac-ssh.
#   ios/Tests/parity/metrics-run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; src="$here/../../Jacked"
export TZ="${TZ:-America/Denver}"
db="$here/exercises.json"
[ -s "$db" ] || curl -fsS -o "$db" "https://$(grep -o '[a-z0-9]*\.supabase\.co' "$src/Backend/SupabaseConfig.swift" | head -1)/storage/v1/object/public/exercise-images/exercises.json"
node "$here/metrics-gen.mjs" "$db" "${PARITY_N:-300}"
files=("$src/Data/JSONValue.swift" "$src/Data/HomeMath.swift" "$src/Data/Backup.swift" "$src/Data/PWATables.swift" "$src/Data/WorkoutLog.swift"
  "$src/Data/LibraryMath.swift" "$src/Data/ExerciseCatalog.swift" "$src/Data/MetricsMath.swift" "$here/MetricsMain.swift" "$here/FinishStubs.swift")
mac="${MAC_SSH:-/home/roni/agent/scripts/broker/mac-ssh}"; host=sire@jacostas-macbook-pro.tail2df36b.ts.net
ssh_="ssh -i $HOME/.ssh/id_ed25519_mac -o BatchMode=yes -o ConnectTimeout=10 -o IdentitiesOnly=yes"
"$mac" "rm -rf /tmp/agent-jacked-mparity && mkdir -p /tmp/agent-jacked-mparity"
tar -C / -czf - "${files[@]#/}" "${here#/}/metrics-fixtures.json" "${db#/}" --transform 's,.*/,,' | $ssh_ "$host" -- "tar -C /tmp/agent-jacked-mparity -xzf -"
"$mac" "export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; cd /tmp/agent-jacked-mparity && xcrun swiftc -parse-as-library -O -o mparity *.swift 2>&1 | grep -v warning: | head -40; TZ=$TZ ./mparity ."
scp -q -i "$HOME/.ssh/id_ed25519_mac" -o BatchMode=yes -o IdentitiesOnly=yes "$host:/tmp/agent-jacked-mparity/metrics-swift-out.json" "$here/metrics-swift-out.json"
python3 "$here/metrics-compare.py" "$here"
