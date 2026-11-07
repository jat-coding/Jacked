#!/usr/bin/env bash
# Import parity: the PWA's real importWorkoutCsv / importJsonBackup (node) vs ImportMath.swift.
# Swift is compiled and run on the Mac over mac-ssh (no swiftc on the desktop).
#   ios/Tests/parity/import-run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; src="$here/../../Jacked"
export TZ="${TZ:-America/Denver}"
db="${EXERCISES_JSON:-/tmp/exercises.json}"
[ -s "$db" ] || curl -fsS -o "$db" https://qehlrwnumrjktujidabz.supabase.co/storage/v1/object/public/exercise-images/exercises.json
node "$here/import-gen.mjs" "${PARITY_N:-300}" "$db"
files=("$src/Data/JSONValue.swift" "$src/Data/HomeMath.swift" "$src/Data/Backup.swift" "$src/Data/PWATables.swift" "$src/Data/WorkoutLog.swift"
  "$src/Data/LibraryMath.swift" "$src/Data/ExerciseCatalog.swift" "$src/Data/MetricsMath.swift" "$src/Data/PRReplay.swift" "$src/Data/BackupMerge.swift"
  "$src/Data/HistRepair.swift" "$src/Data/BadgeMath.swift" "$src/Data/BadgeTables.swift" "$src/Data/FriendsMath.swift" "$src/Data/ImportMath.swift" "$src/Backend/SupabaseConfig.swift" "$here/ImportMain.swift")
mac="${MAC_SSH:-/home/roni/agent/scripts/broker/mac-ssh}"; host=sire@jacostas-macbook-pro.tail2df36b.ts.net
ssh_="ssh -i $HOME/.ssh/id_ed25519_mac -o BatchMode=yes -o ConnectTimeout=10 -o IdentitiesOnly=yes"
"$mac" "rm -rf /tmp/agent-jacked-iparity && mkdir -p /tmp/agent-jacked-iparity"
tar -C / -czf - "${files[@]#/}" "${here#/}/import-fixtures.json" "${db#/}" --transform 's,.*/,,' | $ssh_ "$host" -- "tar -C /tmp/agent-jacked-iparity -xzf -"
"$mac" "export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; cd /tmp/agent-jacked-iparity && xcrun swiftc -parse-as-library -O -o iparity *.swift 2>&1 | grep -v warning: | head -30; TZ=$TZ ./iparity ."
scp -q -i "$HOME/.ssh/id_ed25519_mac" -o BatchMode=yes -o IdentitiesOnly=yes "$host:/tmp/agent-jacked-iparity/import-swift-out.json" "$here/import-swift-out.json"
python3 "$here/import-compare.py" "$here"
