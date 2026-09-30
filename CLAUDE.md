# StaysDirect Growth Engine - Session Conventions

## Repository Structure

This is a pnpm monorepo with:

- `packages/core/` - Shared TypeScript utilities (OCDS parsing, scoring, quality checks, AI integration)
- `apps/admin/` - Next.js (App Router) admin dashboard with Tailwind + shadcn/ui
- `supabase/migrations/` - SQL migrations (applied via `supabase db push`)
- `tests/fixtures/` - Sample API responses and test data

## Key Files

- `.env.example` - Environment variables template (never commit actual secrets)
- `DECISIONS.md` - Architectural decisions and trade-offs
- `PROGRESS.md` - Build status and phase completion tracking
- `docs/DEPLOY.md` - Deployment and production runbook

## Development Practices

### TypeScript & Testing

- All code is strict TypeScript (`strict: true`)
- Unit tests in Vitest cover:
  - OCDS parsing (both Contracts Finder and Find a Tender sources)
  - Filtering logic (by CPV and value)
  - Deduplication across sources
  - Project scoring
  - Content quality checking
- Mock all external API calls in tests (use fixtures for real data)
- Test files colocated with source (`*.test.ts`)

### Database

- All schema changes go in `supabase/migrations/` as SQL files
- Row-Level Security (RLS) enabled on every table
- Admin users table controls role-based access (admin, sales, editor)
- Settings is a single-row configuration table
- Leads and leads_export view have stable column names for external APIs

### Secrets Management

- Environment variables in `.env.local` (not committed)
- Use `.env.example` as template
- Never print secret values in logs or commits
- Supabase secrets for functions set via `supabase secrets set`

### Code Style

- Format with Prettier (100 char line width)
- Lint with ESLint + TypeScript plugin
- No comments unless WHY is non-obvious
- Keep abstractions minimal - three similar lines better than premature abstraction

## Phases

1. **Foundation** (in progress) - Monorepo, CI, schemas, admin shell
2. **Project Radar** - Contract ingestion, enrichment, matching, lead generation
3. **SEO + AI Search Engine** - Content generation with quality checks
4. **AI Visibility Tracker** - Weekly monitoring across AI engines
5. **Website Integration** - Public endpoints, sitemap, llms.txt

## External APIs

### Government Contracts

- Contracts Finder: `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search`
- Find a Tender: `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages`
- Rate limit: ≤1 req/sec, exponential backoff on 429/5xx, max 5 retries

### Enrichment

- Companies House: Basic auth, key as username
- postcodes.io: No key required

### AI Services

- Anthropic: `https://api.anthropic.com/v1/messages` (Claude)
- OpenAI: Responses API with web search
- Perplexity: sonar model with web search

## Deployment

- Supabase Edge Functions: TypeScript/Deno, deployed via `supabase functions deploy`
- Admin app: Next.js on Vercel (from `apps/admin`)
- Environment variables and secrets set before first deploy
- First run includes 90-day backfill of contracts and manual review

## Resuming Work

Check `PROGRESS.md` for:

- Current phase and what's completed
- Known issues and blockers
- Exact next steps
- Any manual setup required (e.g., adding properties, backfilling)

When interrupted, always:

1. Run tests
2. Commit with clear message
3. Push to main
4. Update PROGRESS.md with status
