#!/usr/bin/env bash
# Merge parity: the PWA's real mergeBackup (node) vs the Swift port, on the same fixtures.
#   ios/Tests/parity/run.sh            fixtures on this machine, Swift compiled here (needs swiftc)
#   ios/Tests/parity/run.sh --mac      fixtures here, Swift compiled + run on the Mac over mac-ssh
# Both sides run with the same TZ so local-time date strings mean the same instant.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; src="$here/../../Jacked"
export TZ="${TZ:-America/Denver}"
node "$here/gen.mjs" "${PARITY_N:-400}"
files=("$src/Data/JSONValue.swift" "$src/Data/BackupMerge.swift" "$here/ParityMain.swift")
if [ "${1:-}" = "--mac" ]; then
  mac="${MAC_SSH:-/home/roni/agent/scripts/broker/mac-ssh}"; host=sire@jacostas-macbook-pro.tail2df36b.ts.net
  ssh_="ssh -i $HOME/.ssh/id_ed25519_mac -o BatchMode=yes -o ConnectTimeout=10 -o IdentitiesOnly=yes"
  "$mac" "rm -rf /tmp/agent-jacked-parity && mkdir -p /tmp/agent-jacked-parity"
  tar -C / -czf - "${files[@]#/}" "${here#/}/fixtures.json" --transform 's,.*/,,' | $ssh_ "$host" -- "tar -C /tmp/agent-jacked-parity -xzf -"
  "$mac" "export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; cd /tmp/agent-jacked-parity && xcrun swiftc -parse-as-library -O -o parity JSONValue.swift BackupMerge.swift ParityMain.swift 2>&1 | grep -v warning: | head -30; TZ=$TZ ./parity ."
  scp -q -i "$HOME/.ssh/id_ed25519_mac" -o BatchMode=yes -o IdentitiesOnly=yes "$host:/tmp/agent-jacked-parity/swift-out.json" "$here/swift-out.json"
else
  out="$(mktemp -d)"; "${SWIFTC:-swiftc}" -parse-as-library -O -o "$out/parity" "${files[@]}"; "$out/parity" "$here"
fi
python3 "$here/compare.py" "$here"
