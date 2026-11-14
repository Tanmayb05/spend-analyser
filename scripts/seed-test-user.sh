#!/usr/bin/env bash
# Creates (or resets) a local-only demo user and loads sample data from seed-test-data.sql.
# Credentials are appended to .env.local as SEED_DEMO_USER_EMAIL / SEED_DEMO_USER_PASSWORD.
# Safe to re-run: it wipes and re-seeds that one user's data only.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.local ] || { echo ".env.local not found" >&2; exit 1; }
set -a; . ./.env.local; set +a

case "${NEXT_PUBLIC_SUPABASE_URL:-}" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Refusing: NEXT_PUBLIC_SUPABASE_URL is not local." >&2; exit 1 ;;
esac

DB_CONTAINER="${SEED_DB_CONTAINER:-supabase_db_spend-analyser}"
psql_db() { docker exec -i "$DB_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 "$@"; }

# credentials: reuse if already saved, otherwise generate and append to the bottom of .env.local
if ! grep -q '^SEED_DEMO_USER_EMAIL=' .env.local; then
  pw="Demo-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-14)"
  [ -n "$(tail -c1 .env.local)" ] && echo >> .env.local
  {
    echo ""
    echo "# Local-only demo user created by scripts/seed-test-user.sh (never used on hosted Supabase)"
    echo "SEED_DEMO_USER_EMAIL=demo.user@spend.test"
    echo "SEED_DEMO_USER_PASSWORD=$pw"
  } >> .env.local
  set -a; . ./.env.local; set +a
fi

existing=$(psql_db -Atc "select id from auth.users where email = '$SEED_DEMO_USER_EMAIL'")
body=$(jq -n --arg e "$SEED_DEMO_USER_EMAIL" --arg p "$SEED_DEMO_USER_PASSWORD" \
  '{email:$e, password:$p, email_confirm:true, user_metadata:{display_name:"Demo User"}}')
auth=(-H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" -H "Content-Type: application/json")

if [ -z "$existing" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users" "${auth[@]}" -d "$body")
  [ "$code" = "200" ] || { echo "create user failed (HTTP $code)" >&2; exit 1; }
  echo "created user $SEED_DEMO_USER_EMAIL"
else
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users/$existing" "${auth[@]}" -d "$body")
  [ "$code" = "200" ] || { echo "reset password failed (HTTP $code)" >&2; exit 1; }
  echo "user exists, password reset to saved value"
fi

psql_db -v email="$SEED_DEMO_USER_EMAIL" < scripts/seed-test-data.sql
echo "done. Login: see SEED_DEMO_USER_EMAIL / SEED_DEMO_USER_PASSWORD at the bottom of .env.local"
