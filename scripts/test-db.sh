#!/usr/bin/env bash
# Run the pgTAP tests in supabase/tests against the LOCAL Supabase database.
#
# Why not `supabase test db`: once the repo is linked to the hosted project, the CLI applies
# [remotes.production] from config.toml and looks for containers/networks named after the hosted
# project ref, which don't exist locally. This runs each file with psql inside the local DB container.
# Every file wraps itself in begin/rollback, so no test data is left behind.
set -uo pipefail

cd "$(dirname "$0")/.."
project_id=$(sed -n 's/^project_id *= *"\(.*\)"/\1/p' supabase/config.toml | head -1)
container="supabase_db_${project_id}"

if ! docker inspect "$container" >/dev/null 2>&1; then
  echo "Local database container '$container' isn't running. Start it with: npx supabase start" >&2
  exit 1
fi

files=("$@")
[ ${#files[@]} -eq 0 ] && files=(supabase/tests/*.sql)

failed=0
total_ok=0
for f in "${files[@]}"; do
  out=$(docker exec -i "$container" psql -U postgres -q -tA -v ON_ERROR_STOP=1 <"$f" 2>&1)
  status=$?
  plan=$(grep -m1 -E '^1\.\.[0-9]+$' <<<"$out" | cut -d. -f3)
  ok=$(grep -cE '^ok ' <<<"$out")
  bad=$(grep -E '^not ok ' <<<"$out")
  total_ok=$((total_ok + ok))
  if [ $status -ne 0 ] || [ -n "$bad" ] || [ -z "$plan" ] || [ "$ok" != "$plan" ]; then
    failed=1
    echo "FAIL $f ($ok/${plan:-?} passed)"
    # failing assertions, pgTAP diagnostics and SQL errors only
    grep -E '^not ok |^# |ERROR|error' <<<"$out" | sed 's/^/    /'
  else
    echo "ok   $f ($ok/$plan)"
  fi
done

if [ $failed -ne 0 ]; then
  echo "Database tests failed."
  exit 1
fi
echo "All database tests passed ($total_ok assertions)."
