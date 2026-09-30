# StaysDirect Growth Engine

A production system for contractor accommodation lead generation, SEO content automation, and AI visibility tracking.

## Features

- **Project Radar**: Automatically discovers UK construction/infrastructure contracts from government APIs and generates qualified leads
- **SEO + AI Search Engine**: Generates location and project pages with quality verification and drip-publishing
- **AI Visibility Tracker**: Monitors StaysDirect mentions across ChatGPT, Claude, and Perplexity
- **Admin Dashboard**: Complete management interface for properties, leads, content, and analytics

## Stack

- **Backend**: Supabase (Postgres with PostGIS, pg_trgm, pg_cron, pg_net) with Edge Functions (Deno/TypeScript)
- **Frontend**: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- **Core**: Shared TypeScript utilities in `packages/core`
- **Tests**: Vitest with fixtures for API responses

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Supabase project
- API keys for Anthropic, OpenAI, Perplexity, Companies House

### Installation

```bash
pnpm install
```

### Configuration

```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

### Development

```bash
# Typecheck
pnpm typecheck

# Lint
pnpm lint

# Test
pnpm test

# Dev server (admin app)
cd apps/admin
pnpm dev
```

### Database

Migrations are in `supabase/migrations/`. Apply with:

```bash
supabase db push
```

## Project Structure

- `packages/core/` - Shared utilities (OCDS parsing, scoring, quality checks, AI integration)
- `apps/admin/` - Next.js admin dashboard
- `supabase/migrations/` - Database schema migrations
- `tests/fixtures/` - Sample API responses for testing
- `docs/` - Documentation

## Documentation

- `DECISIONS.md` - Architectural decisions and trade-offs
- `PROGRESS.md` - Build progress and current status
- `docs/WEBSITE_INTEGRATION.md` - Integration guide for main website
- `docs/DEPLOY.md` - Deployment and runbook

## License

Proprietary - StaysDirect
