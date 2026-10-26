#!/usr/bin/env bash
# Regenerates jacked-pwa/SUPABASE_SETUP.sql from supabase/setup_header.txt +
# supabase/setup_base.sql + every file under supabase/migrations/, concatenated in
# filename order (the migration naming convention, YYYYMMDD_name.sql, already sorts
# chronologically). See setup_header.txt for why this has to stay generated rather than
# hand-maintained (weekly review #15, 2026-10-26).
#
# Run this every time a new file is added under supabase/migrations/, or setup_base.sql
# changes.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/../jacked-pwa/SUPABASE_SETUP.sql"

{
  cat "$HERE/setup_header.txt"
  echo
  cat "$HERE/setup_base.sql"
  for f in "$HERE"/migrations/*.sql; do
    echo
    echo "-- ============================================================"
    echo "-- $(basename "$f")"
    echo "-- ============================================================"
    cat "$f"
  done
} > "$OUT"

n_mig=$(ls "$HERE"/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
echo "wrote $OUT ($(wc -l < "$OUT" | tr -d ' ') lines) from setup_base.sql + $n_mig migrations"
