#!/usr/bin/env bash
# Creates the demo user on the HOSTED Supabase project (via SQL) and loads scripts/seed-test-data.sql.
# Counterpart of seed-test-user.sh (which is local-only).
#
# Needs: psql, a linked project (`npx supabase link`), and in .env.local:
#   SUPABASE_DB_PASSWORD, SEED_DEMO_USER_EMAIL, SEED_DEMO_USER_PASSWORD
# Secrets are read from .env.local and never printed.
#
# Safe to re-run: user is only created if missing; seed SQL wipes/re-seeds that one user's rows only.
# Usage: scripts/seed-hosted-user.sh --yes     (the flag is required; this writes to PRODUCTION)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" != "--yes" ]; then
  echo "This writes to HOSTED Supabase. Re-run with --yes to confirm." >&2
  exit 1
fi

[ -f .env.local ] || { echo ".env.local not found" >&2; exit 1; }
set -a; . ./.env.local; set +a
for v in SUPABASE_DB_PASSWORD SEED_DEMO_USER_EMAIL SEED_DEMO_USER_PASSWORD; do
  [ -n "${!v:-}" ] || { echo "$v missing in .env.local" >&2; exit 1; }
done
command -v psql >/dev/null || { echo "psql not installed" >&2; exit 1; }
[ -f supabase/.temp/pooler-url ] || { echo "Project not linked. Run: npx supabase link --project-ref <ref>" >&2; exit 1; }

# pooler URL (IPv4) from the linked project; password comes from env, not the URL
URL="$(cat supabase/.temp/pooler-url)?sslmode=require"
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
psql_db() { psql "$URL" -v ON_ERROR_STOP=1 "$@"; }

# Create user only if missing. handle_new_user trigger creates the profile + default lookups.
psql_db -v email="$SEED_DEMO_USER_EMAIL" -v pw="$SEED_DEMO_USER_PASSWORD" <<'SQL'
begin;
select set_config('seed.email', :'email', true), set_config('seed.pw', :'pw', true) \gset
do $$
declare uid uuid := gen_random_uuid(); em text := current_setting('seed.email'); pw text := current_setting('seed.pw');
begin
  if exists (select 1 from auth.users where email = em) then
    raise notice 'user already exists, skipping create';
    return;
  end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
    crypt(pw, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Demo User","email_verified":true}', now(), now(),
    '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, 'email', uid::text,
    jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true, 'phone_verified', false),
    now(), now(), now());
end $$;
commit;
SQL
echo "user step done"

psql_db -v email="$SEED_DEMO_USER_EMAIL" < scripts/seed-test-data.sql
echo "done. Hosted demo user: $SEED_DEMO_USER_EMAIL"
