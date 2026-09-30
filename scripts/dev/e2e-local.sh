#!/usr/bin/env bash
# End-to-end run on the local Supabase stack against fixture-backed mock APIs.
# Prereqs: `supabase start` running, `pnpm dev:mock-apis` running, and the edge runtime started with
# DEV_EXTERNAL_API_PROXY=http://host.docker.internal:8787, CRON_SECRET=local-cron-secret and dummy
# ANTHROPIC/OPENAI/PERPLEXITY/COMPANIES_HOUSE keys (e.g. in supabase/functions/.env, which is gitignored).
set -euo pipefail
cd "$(dirname "$0")/../.."
F=http://127.0.0.1:54321/functions/v1
H=(-H "x-cron-secret: ${CRON_SECRET:-local-cron-secret}" -H "content-type: application/json")
export PGPASSWORD=postgres
PSQL=(psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
wait_for() { # $1 = SQL returning a count, $2 = target, $3 = label
  for _ in $(seq 1 60); do
    n=$("${PSQL[@]}" -tAc "$1")
    [ "$n" -ge "$2" ] && { echo "  $3: $n"; return 0; }
    sleep 3
  done
  echo "  timed out waiting for $3 (got $n)" >&2
  return 1
}

echo "==> Reset database and vault"
supabase db reset >/dev/null 2>&1
"${PSQL[@]}" -c "select vault.create_secret('http://kong:8000','project_url'); select vault.create_secret('${CRON_SECRET:-local-cron-secret}','cron_secret');" >/dev/null
PROJECT_ID=$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml)
docker restart "supabase_kong_${PROJECT_ID}" >/dev/null 2>&1 || true
for _ in $(seq 1 40); do
  curl -sf -o /dev/null "$F/public-content?type=index" && break
  sleep 3
done

echo "==> Radar (7-day backfill)"
curl -sf "${H[@]}" -d '{"backfill_days":7}' $F/radar-run >/dev/null
wait_for "select count(*) from leads where source='radar'" 7 "radar leads"
"${PSQL[@]}" -c "select left(title,50) title, status, site_town, score from radar_projects order by score desc nulls last"

echo "==> Location page (Bridgwater), project page (Hinkley Point C), blog post"
BR=$("${PSQL[@]}" -tAc "insert into seo_pages (page_type, town_id, slug, status) select 'location', id, slug, 'queued' from towns where slug='bridgwater' returning id")
HK=$("${PSQL[@]}" -tAc "select id from seo_pages where slug='projects/hinkley-point-c'")
curl -sf "${H[@]}" -d "{\"page_ids\":[\"$BR\",\"$HK\"]}" $F/seo-generate-page >/dev/null
TP=$("${PSQL[@]}" -tAc "insert into blog_topics (keyword, working_title, status) values ('house a crew of 6','How to house a construction crew of 6','queued') returning id")
curl -sf "${H[@]}" -d "{\"topic_ids\":[\"$TP\"]}" $F/seo-generate-blog >/dev/null
wait_for "select count(*) from seo_pages where generated_at is not null" 2 "pages generated"
wait_for "select count(*) from blog_posts" 1 "blog posts"
"${PSQL[@]}" -c "select slug, status, quality_score, word_count, quality_notes from seo_pages where generated_at is not null union all select slug, status, quality_score, word_count, quality_notes from blog_posts"

echo "==> Approve and drip-publish"
"${PSQL[@]}" -c "update seo_pages set status='approved' where status='in_review'; update blog_posts set status='approved' where status='in_review';"
curl -sf "${H[@]}" -d '{"task":"pages"}' $F/seo-run
echo

echo "==> AI visibility"
curl -sf "${H[@]}" -d '{}' $F/ai-visibility-run >/dev/null
wait_for "select count(*) from ai_visibility_checks" 120 "visibility checks"

echo "==> Public endpoints"
curl -sf "$F/public-content?type=index" | head -c 300; echo
curl -sf -A GPTBot "$F/public-render?path=/contractor-accommodation/bridgwater" | grep -o "<h1>[^<]*</h1>"
curl -sf "$F/public-render?path=/blog/how-to-house-a-construction-crew-of-6-a-practical-guide" | grep -o "<h1>[^<]*</h1>"
curl -sf "$F/public-sitemap" | grep -c "<url>"
curl -sf "$F/public-llms-txt" | grep -A3 "## Location guides"
curl -s -o /dev/null -w "unknown slug -> %{http_code}\n" "$F/public-content?type=location&slug=nowhere"
curl -sf -X POST -H "content-type: application/json" -d '{"contact_email":"e2e@example.com","landing_page":"/contractor-accommodation/bridgwater"}' $F/public-lead; echo
echo "==> Done"
