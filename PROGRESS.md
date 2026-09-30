# Progress

_Last updated: 30 September 2026, end of the build session._

## Summary

All five phases are built, tested and pushed to `main`, and CI is green on GitHub (typecheck, lint, format, unit tests, Deno check and lint, migrations + RLS on real Postgres, admin production build).

**Not deployed yet:** no Supabase or AI credentials were available in the build environment, so nothing has run against the live government APIs, Anthropic, OpenAI or Perplexity. Everything was instead verified end to end on a local Supabase stack with fixture-backed mock APIs (details below). Deployment is one command once secrets exist: see "Next steps".

## Phase status

| Phase                       | Status                                | Where                                                                                                                                     |
| --------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Foundation               | Done                                  | `packages/core`, `supabase/migrations/…100_foundation.sql`, `…500_reference_data.sql`, `apps/admin` shell, `scripts/promote-user.mjs`, CI |
| 2. Project Radar            | Done                                  | `supabase/functions/radar-*`, `_shared/radar.ts`, `…200_radar.sql`, admin Radar pages                                                     |
| 3. SEO + AI search engine   | Done                                  | `supabase/functions/seo-*`, `public-*`, `_shared/seo.ts`, `…300_seo.sql`, admin SEO pages                                                 |
| 4. AI visibility tracker    | Done                                  | `supabase/functions/ai-visibility-run`, `…400_visibility.sql`, admin AI Visibility page                                                   |
| 5. Integration kit + deploy | Docs done; deploy pending credentials | `docs/`, `scripts/deploy.sh`                                                                                                              |

## Definition of done: evidence

| Requirement                                                                                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations apply cleanly; RLS on every table                                                                                    | Applied on Supabase Postgres 17 (`supabase start` / `db reset`) and plain Postgres 16 in CI. `scripts/db-test/assertions.sql` fails if any table lacks RLS and checks access per role (anon, non-staff, sales, editor, admin).                                                                                                                                                                                                                                                                                         |
| CI green                                                                                                                        | GitHub Actions run for `2a1fdbc` and later: all four jobs pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Unit tests: OCDS parsing (both sources), filtering, dedupe, scoring, data pack, number verification, brand/competitor detection | 124 Vitest tests in `packages/core/test` (also: geocode fallback, retries/timeouts, rate limiter, Claude wrapper incl. spend cap, JSON retry, refusal and web-search citations, outreach validation, markdown XSS, renderer, sitemap, llms.txt, lead-form validation, Companies House lookup).                                                                                                                                                                                                                         |
| Radar produces qualified projects and leads with drafts from real API data **or fixtures if network is blocked**                | **Fixtures:** the government APIs, postcodes.io and staysdirect.co.uk were blocked by the build environment's network policy. On the local stack, `radar-run` (7-day backfill) paged through 3 Contracts Finder pages and 1 Find a Tender page, dropped 2 cross-source duplicates, enriched 7 projects, matched them to demo houses and created 7 leads with drafts (scores 92/92/77/74/59/51/40; Barrow flagged `sourcing_opportunity`; an invented postcode was discarded; Companies House filled a missing number). |
| One location page, one project page and one blog post that pass the quality checker, viewable in the admin preview              | Unit tests: Bridgwater page, Hinkley Point C page and a 1,248-word blog post all pass with fixture AI output. End to end (`pnpm e2e:local`): Bridgwater 96, Hinkley Point C 77 (flagged 0.61 similar to Bridgwater, which shares its houses), blog 100. All three were approved, drip-published and viewed in the admin editor preview (screenshots taken with Playwright).                                                                                                                                            |
| Public endpoints return valid JSON, HTML, XML and llms.txt                                                                      | `public-content` (index + item, 404 for unknown), `public-render` (full standalone HTML with title, canonical, OG, JSON-LD, 8 `<h2>`s; checked with a GPTBot user agent), `public-sitemap` (valid XML with lastmod), `public-llms-txt`, `public-lead` (valid → stored with UTM and landing page; invalid → 400; honeypot → accepted, not stored; 6th request/hour → 429). All send `Cache-Control: public, max-age=3600`.                                                                                              |
| All docs written                                                                                                                | `docs/DEPLOY.md`, `docs/RUNBOOK.md`, `docs/WEBSITE_INTEGRATION.md`, `docs/WEBSITE_INTEGRATION_PROMPT.md`, `docs/LEADS_CONTRACT.md`, `DECISIONS.md`, `README.md`, `CLAUDE.md`.                                                                                                                                                                                                                                                                                                                                          |
| Deploy + `radar-run backfill_days=7` smoke test, counts reported here                                                           | **Not done: no `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF`.** `scripts/deploy.sh` does the whole deploy and ends with that smoke test. The local-stack equivalent is above.                                                                                                                                                                                                                                                                                                                                       |

## Not completed / known risks

1. **Live API shapes checked; live AI calls not yet.**
   - The `Live API samples` GitHub Actions workflow (`.github/workflows/live-samples.yml`, run it from the Actions tab) fetched real Contracts Finder, Find a Tender, postcodes.io and staysdirect.co.uk sitemap responses into `tests/fixtures/live/`. `packages/core/test/live-samples.test.ts` maps every award release in them.
   - Fixes from the real data:
     - Contracts Finder notice links now use the release id (the ocid holds a different GUID) or the published award-notice URL.
     - Find a Tender lot-only award titles are combined with the tender title ("SBC Minor Works Framework: Lot 1: Mechanical Services").
     - " - AWARD" suffixes are stripped.
     - NUTS/ITL delivery codes are named by region ("UKD33 (North West England)").
     - The bare `/blog` URL is ignored when reading existing blog titles.
   - Known gaps in the source data (not bugs):
     - Find a Tender gives no delivery postcodes at all, only region codes, so enrichment relies on the notice text and buyer.
     - Contracts Finder suppliers mostly have no Companies House number (28% in the sample), so the Companies House name lookup fills most of them.
   - Visibility: OpenAI uses the Responses API with `tools: [{type: "web_search"}]` and model `gpt-5`, and Perplexity uses `sonar`. Both are editable in Settings if names have changed. Confirm the first run shows answers, not errors (the heatmap shows "Error" cells with the message).
2. **Town hotel rates and populations are empty by design** (they appear in public copy). Location pages omit the hotel-vs-house table until an editor enters real hotel rates in Towns.
3. **Similarity check is coarse.** pg_trgm on whole pages flags pages about the same area (0.61 for Bridgwater vs Hinkley Point C). It's a -25 penalty, not a block, below 0.8. Watch real scores and tune `SIMILARITY_THRESHOLD` in `packages/core/src/quality.ts` if good pages are being held back.
4. **Webhook delivery is best-effort** (pg_net, one attempt). The leads app should also poll `updated_at` (see LEADS_CONTRACT).
5. **Admin UI has no automated browser tests in CI.** It was exercised by hand with Playwright (login, all 13 pages as admin, lead editing and save, project drawer and map, approve + publish, CSV import incl. duplicate skip, editor blocked from leads, phone layout with no horizontal overflow).
6. **Blog URL assumption:** engine posts are served at `/blog/{slug}`, matching the existing blog sitemap. If the site uses another path, change `publicPath` in `packages/core/src/schema.ts`.

## Next steps (for a person)

1. **Create a Supabase project** (Pro plan recommended) and gather the secrets listed in `.env.example`.
2. **Deploy:** `bash scripts/deploy.sh` with those env vars (docs/DEPLOY.md §2). It applies migrations, deploys 18 functions, sets secrets and Vault entries, and runs the 7-day Radar smoke test. Record the smoke-test counts from Admin → Job Runs here.
3. **Deploy the admin app to Vercel** (root `apps/admin`, two env vars) and set Supabase Auth redirect URLs (docs/DEPLOY.md §3).
4. **Create the first admin** with `pnpm promote-user`, set the Supabase email templates (docs/DEPLOY.md §2), then invite everyone else from Admin → Team.
5. **Follow the first-run checklist** in docs/RUNBOOK.md: import properties → fill hotel rates → 90-day backfill → review 50 projects → generate and review 5 pages → visibility baseline → enable crons.
6. **Hand `docs/WEBSITE_INTEGRATION_PROMPT.md` to whoever builds staysdirect.co.uk**, then verify with `curl -A GPTBot https://staysdirect.co.uk/contractor-accommodation/<town>`. Fix the 404 `sitemap-static.xml` at the same time.
7. **Point the Lovable leads app at `leads_export`** per docs/LEADS_CONTRACT.md, and set `LEADS_WEBHOOK_URL` (with a secret token) if it wants push updates.

## How to resume development

`CLAUDE.md` has the conventions. Before committing, run `pnpm check:core-sync && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm check:functions`, plus `pnpm test:db` for schema changes. `pnpm e2e:local` re-runs the full local pipeline against the mock APIs.

## Commit history (this build)

- `971b643` initial scaffold (earlier session)
- `0ecf307` runtime-agnostic core, schema, fixtures, tests, migration harness
- `d9ab01a` edge functions for Radar, SEO engine, AI visibility, public endpoints
- `5cc4dc6` admin dashboard, CI, lint, formatting
- `2a1fdbc` CI database job fix, deploy script, DEPLOY and RUNBOOK
- final commit: website integration docs, leads contract, decisions, progress, e2e script
