# StaysDirect Growth Engine - Build Progress

## Phase 1: Foundation ✓ COMPLETE

### Completed
- ✅ Monorepo scaffold with pnpm workspace
- ✅ Root `package.json` with typecheck, lint, test, format scripts
- ✅ GitHub Actions CI pipeline (`typecheck`, `lint`, `test`)
- ✅ TypeScript configuration (root + package-specific, strict mode)
- ✅ ESLint + Prettier setup with shared config
- ✅ `.env.example` with all required secrets (never commit values)
- ✅ `.gitignore` excluding node_modules, builds, env files
- ✅ `packages/core/` with full TypeScript modules:
  - `ai.ts` - Claude integration with spend cap enforcement, retry logic
  - `ocds.ts` - OCDS parsing and filtering (Contracts Finder, Find a Tender)
  - `scoring.ts` - Lead scoring algorithm (25+25+25+15+10 = 100 points)
  - `quality.ts` - Content quality checker (word count, data pack verification, banned phrases, FAQ count)
- ✅ Unit tests for all core modules with OCDS fixtures
  - OCDS parsing (valid releases, missing awards, CPV filtering)
  - Scoring (high-value projects, sourcing opportunities, future dates)
  - Quality checks (word count, banned phrases, FAQ count, number verification)
  - All tests passing with realistic data
- ✅ Supabase database schema v1:
  - `admin_users(user_id, role)` - Role-based access control (admin, sales, editor)
  - `settings` - Single-row configuration with 15 parameters
  - `properties` - Rental stock with PostGIS location, 8 columns
  - `towns` - UK contractor hotspots, ready for ~150 seed records
  - `leads` + `leads_export` view - Stable contract for external APIs
  - `api_usage` - Per-call cost tracking
  - `job_runs` - Batch execution logging
  - All tables have RLS policies enabled, indexes on common filters
- ✅ Initial migration: `20240115000001_initial_schema.sql`
- ✅ Documentation: README.md, CLAUDE.md, DECISIONS.md
- ✅ Commits:
  - 5e50f16: Phase 1 Foundation scaffold
  - e7764da: Fix TypeScript types and test data
  - 479fba1: Add .gitignore and remove node_modules

### TODO (Next Session)
- ⏳ Create Next.js admin app shell (layout, auth context, sidebar navigation)
- ⏳ Implement auth pages (login with Supabase)
- ⏳ Implement Properties admin page (CSV import, list, edit)
- ⏳ Implement Towns admin page (seed data, list)
- ⏳ Implement Settings admin page (single form)
- ⏳ Create seed script for ~150 UK towns with PostGIS locations
- ⏳ Create user promotion script (email → admin role via CLI)
- ⏳ Test with `supabase db push` against a Supabase project
- ⏳ Set up GitHub repository and push main branch

### Known Issues
None currently.

### Next Steps for Phase 2: Project Radar
1. Implement edge functions for contract ingestion
2. Create Claude enrichment logic
3. Build PostGIS matching
4. Implement lead scoring and generation

---

## Phase 2: Project Radar
Not started. Will implement:
- Contract ingestion from Contracts Finder and Find a Tender
- Claude enrichment (location, worker count, relevance)
- PostGIS matching against properties
- Lead scoring and generation
- Cron orchestration

## Phase 3: SEO + AI Search Engine
Not started. Will implement:
- Location and project page generation
- Blog post generation
- Quality checking with drip-publishing
- Public content API and HTML renderer

## Phase 4: AI Visibility Tracker
Not started. Will implement:
- Weekly searches across ChatGPT, Claude, Perplexity
- Mention and citation detection
- Competitor tracking

## Phase 5: Website Integration
Not started. Will produce:
- WEBSITE_INTEGRATION.md
- DEPLOY.md and RUNBOOK.md
- Deployment to Supabase + Vercel

---

## Build Notes
- Environment: Cloud session, outbound internet allowed
- All code follows TypeScript strict mode
- Tests use Vitest with fixture-based mocking
- Database uses Postgres 15+ (PostGIS, pg_trgm, pg_cron via Supabase)
- All external API calls have retry logic and spend caps
