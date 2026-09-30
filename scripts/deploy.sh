#!/usr/bin/env bash
# Deploys the database, edge functions, function secrets and Vault secrets to a Supabase project.
# Required env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, CRON_SECRET, ANTHROPIC_API_KEY.
# Optional env: OPENAI_API_KEY, PERPLEXITY_API_KEY, COMPANIES_HOUSE_API_KEY, LEADS_WEBHOOK_URL,
#               SUPABASE_DB_PASSWORD (skips the interactive prompt in `supabase link`).
# Secret values are never echoed.
set -euo pipefail
cd "$(dirname "$0")/.."

for v in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF CRON_SECRET ANTHROPIC_API_KEY; do
  if [ -z "${!v:-}" ]; then
    echo "Missing $v. See docs/DEPLOY.md." >&2
    exit 1
  fi
done
REF="$SUPABASE_PROJECT_REF"
SB="npx --yes supabase@2"

echo "==> Linking project $REF"
$SB link --project-ref "$REF" ${SUPABASE_DB_PASSWORD:+--password "$SUPABASE_DB_PASSWORD"}

echo "==> Checking the edge functions use the current core"
node scripts/sync-core.mjs --check

echo "==> Applying migrations"
$SB db push --linked

echo "==> Setting function secrets"
SECRETS_FILE="$(mktemp)"
trap 'rm -f "$SECRETS_FILE"' EXIT
{
  echo "CRON_SECRET=$CRON_SECRET"
  echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
  [ -n "${OPENAI_API_KEY:-}" ] && echo "OPENAI_API_KEY=$OPENAI_API_KEY"
  [ -n "${PERPLEXITY_API_KEY:-}" ] && echo "PERPLEXITY_API_KEY=$PERPLEXITY_API_KEY"
  [ -n "${COMPANIES_HOUSE_API_KEY:-}" ] && echo "COMPANIES_HOUSE_API_KEY=$COMPANIES_HOUSE_API_KEY"
  true
} > "$SECRETS_FILE"
$SB secrets set --project-ref "$REF" --env-file "$SECRETS_FILE" >/dev/null

echo "==> Deploying edge functions"
$SB functions deploy --project-ref "$REF" --use-api

echo "==> Storing Vault secrets used by pg_cron, triggers and the leads webhook"
sql_escape() { printf "%s" "$1" | sed "s/'/''/g"; }
vault_upsert() {
  local name="$1" value="$2"
  local sql="do \$\$ begin
    if exists (select 1 from vault.secrets where name = '$name') then
      perform vault.update_secret((select id from vault.secrets where name = '$name'), '$(sql_escape "$value")');
    else
      perform vault.create_secret('$(sql_escape "$value")', '$name');
    end if;
  end \$\$;"
  local body
  body=$(node -e 'process.stdout.write(JSON.stringify({ query: process.argv[1] }))' "$sql")
  curl -sS -f -o /dev/null -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data "$body"
  echo "    vault: $name set"
}
vault_upsert project_url "https://$REF.supabase.co"
vault_upsert cron_secret "$CRON_SECRET"
if [ -n "${LEADS_WEBHOOK_URL:-}" ]; then vault_upsert leads_webhook_url "$LEADS_WEBHOOK_URL"; fi

echo "==> Smoke test: radar-run with a 7-day backfill"
curl -sS -X POST "https://$REF.supabase.co/functions/v1/radar-run" \
  -H "Content-Type: application/json" -H "x-cron-secret: $CRON_SECRET" -d '{"backfill_days":7}'
echo
echo "Done. Watch progress in the admin app under Job Runs. Scheduled jobs stay off until you enable them in Settings."
