# StaysDirect Growth Engine

Lead generation and search visibility for [StaysDirect](https://staysdirect.co.uk), which rents whole houses to construction and infrastructure crews working away from home.

| Part                       | What it does                                                                                                                                                                                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project Radar**          | Pulls newly awarded UK contracts daily from Contracts Finder and Find a Tender, uses Claude to find the site and estimate crews away from home, matches our houses with PostGIS, scores the opportunity and creates a lead with a drafted email, LinkedIn message and call script. Drafts are never sent automatically. |
| **SEO + AI search engine** | Builds a data pack per town or major project from our own data, has Claude write the page, checks every number against the pack, queues it for human review, drip-publishes, and serves JSON, standalone HTML, a sitemap and `llms.txt` to the main website.                                                            |
| **AI visibility tracker**  | Asks ChatGPT, Claude and Perplexity 40 buyer questions every week and records whether StaysDirect is mentioned, its position and citations, against competitors.                                                                                                                                                        |
| **Admin dashboard**        | Next.js app to run and review all of the above, on desktop or phone.                                                                                                                                                                                                                                                    |

The leads CRM itself is a separate Lovable app that reads the `leads_export` view ([contract](docs/LEADS_CONTRACT.md)).

## Layout

```
packages/core/            Runtime-agnostic TypeScript: OCDS, scoring, prompts, quality checks, rendering…
packages/core/test/       Vitest suites (fixtures in tests/fixtures)
apps/admin/               Next.js 16 admin app (Vercel)
supabase/migrations/      Schema, RLS, reference data, pg_cron jobs
supabase/functions/       18 edge functions (Deno); _shared/core is generated from packages/core
scripts/                  deploy, promote-user, sync-core, db tests, mock APIs
docs/                     Deploy, runbook, website integration, leads contract
```

## Quick start (local)

```bash
pnpm install
pnpm test                       # unit tests
supabase start                  # local Supabase with demo properties (supabase/seed.sql)
cp apps/admin/.env.example apps/admin/.env.local   # local URL + anon key from `supabase status`
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... \
  pnpm promote-user you@example.com admin --create --password '...'
pnpm admin:dev
```

## Docs

- [docs/DEPLOY.md](docs/DEPLOY.md): deploy Supabase and the admin app
- [docs/RUNBOOK.md](docs/RUNBOOK.md): first-run order, schedule, costs, spend cap, "no thanks" handling, troubleshooting
- [docs/WEBSITE_INTEGRATION.md](docs/WEBSITE_INTEGRATION.md) and [the paste-ready prompt](docs/WEBSITE_INTEGRATION_PROMPT.md): what the main site must do
- [docs/LEADS_CONTRACT.md](docs/LEADS_CONTRACT.md): leads columns, statuses, webhook and realtime
- [DECISIONS.md](DECISIONS.md): why things are built the way they are
- [PROGRESS.md](PROGRESS.md): status and next steps
