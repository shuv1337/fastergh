# FasterGH

A fast GitHub mirror UI backed by Convex as a real-time cache/sync layer. GitHub is the source of truth; Convex is the low-latency read model.

## What It Does

- Streams GitHub webhook events into Convex for real-time updates
- Backfills historical data from GitHub REST API on repo onboarding
- Maintains normalized domain tables and denormalized projection views for fast reads
- Provides a read-optimized UI that never hits the GitHub API on page load
- Supports write operations (create issues, comments, merge PRs) via optimistic mutations backed by GitHub API

## Architecture

```
GitHub Webhooks/API  ->  Convex Ingestion  ->  Normalized Tables  ->  Projection Views  ->  Next.js UI
```

### Sync Modes

1. **Bootstrap Backfill** - Initial hydration when a repo is connected
2. **Realtime Webhooks** - Ongoing incremental updates via repo-level webhooks
3. **Periodic Reconciliation** - Drift and gap repair on a schedule
4. **Async Processing** - Queued webhook processing with retry/backoff and dead-letter handling

### Data Pipeline

- **Raw ingestion layer** - Webhook events stored verbatim for audit and replay
- **Normalized domain tables** - Canonical entities (repos, PRs, issues, users, branches, commits, check runs, reviews, comments, PR files)
- **Projection views** - Pre-computed read views for UI (repo overview, PR list, issue list, activity feed)

## Tech Stack

- **[Effect](https://effect.website)** - Type-safe functional programming with services, tagged errors, and structured concurrency
- **[Convex](https://convex.dev)** - Real-time backend with automatic reactivity
- **[Confect](packages/confect/)** - Effect + Convex integration (first-party package in this monorepo)
- **[Next.js](https://nextjs.org)** - React framework with App Router
- **[nuqs](https://nuqs.47ng.com)** - Type-safe URL query state management
- **[Tailwind CSS](https://tailwindcss.com)** + **[Radix UI](https://radix-ui.com)** - Styling and UI primitives
- **[Turbo](https://turbo.build)** - Monorepo build system
- **[Biome](https://biomejs.dev)** - Linter and formatter

## Project Structure

```
apps/
  main-site/              # Next.js frontend
packages/
  confect/                # Effect + Convex typed RPC layer
  convex-test/            # Convex testing utilities
  database/               # Convex backend (schema, RPC modules, sync pipeline)
    convex/
      rpc/                # RPC endpoint modules
        projectionQueries.ts   # Read queries (list repos, PRs, issues, activity)
        webhookProcessor.ts    # Webhook event dispatch + retry pipeline
        githubWrite.ts         # Write operations (create issue/comment, merge PR)
        githubActions.ts       # GitHub API actions (PR file sync, etc.)
        admin.ts               # Operational queries (health, status, table counts)
      shared/
        projections.ts         # Projection rebuild logic
        githubApi.ts           # GitHub API client (Effect service)
      schema.ts                # Full Convex schema (18 tables)
      http.ts                  # Webhook HTTP endpoint
      crons.ts                 # Scheduled jobs (process pending, promote retries, repair)
  observability/           # OpenTelemetry integration for Effect
  ui/                      # Shared React components (shadcn/ui based)
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- A [Convex](https://convex.dev) account
- A GitHub PAT with `repo` scope (or `gh auth login`)

### Setup

1. Install dependencies:

```bash
bun install
```

2. Configure environment:

```bash
cp .env.example .env
# Set GITHUB_WEBHOOK_SECRET (generate with: openssl rand -hex 32)
# Set CONVEX_DEPLOYMENT and NEXT_PUBLIC_CONVEX_URL
```

3. Set Convex environment variables:

```bash
cd packages/database
bunx convex env set GITHUB_PAT "$(gh auth token)"
bunx convex env set GITHUB_WEBHOOK_SECRET "<your-webhook-secret>"
```

4. Start development:

```bash
bun dev
```

### Connect a Repository

Use the `connectRepo` mutation to onboard a GitHub repository:

```bash
bunx convex run rpc/repoConnect:connectRepo '{
  "ownerLogin": "your-username",
  "name": "your-repo",
  "githubRepoId": 123456789,
  "installationId": 0
}'
```

Then create a repo-level webhook pointing to your Convex deployment:

```bash
gh api --method POST /repos/<owner>/<repo>/hooks \
  -f name=web -f active=true \
  -f 'events[]=push' -f 'events[]=pull_request' -f 'events[]=issues' \
  -f 'events[]=issue_comment' -f 'events[]=check_run' \
  -f 'events[]=pull_request_review' -f 'events[]=create' -f 'events[]=delete' \
  -f "config[url]=${CONVEX_SITE_URL}/api/github/webhook" \
  -f 'config[content_type]=json' \
  -f "config[secret]=${GITHUB_WEBHOOK_SECRET}"
```

## Testing

Tests use `@packages/convex-test` with `@effect/vitest`:

```bash
# Run all tests
cd packages/database && bunx vitest run --no-watch --pool=forks

# Run specific test suites
bunx vitest run --no-watch --pool=forks githubMirror    # 52 integration tests
bunx vitest run --no-watch --pool=forks smokeOnboarding # Full onboarding smoke test
```

### Test Coverage

- **52 integration tests** covering webhook processing, idempotency, out-of-order handling, projections, pagination, write operations, and all event types
- **1 smoke test** validating the full onboarding pipeline (repo setup, diverse event processing, projection verification, queue health)
- Event types tested: issues, pull_request, push, create/delete (branches), check_run, issue_comment (create/edit/delete), pull_request_review (submit/dismiss)

## Scripts

```bash
bun dev          # Start all apps in development
bun build        # Build all packages
bun typecheck    # Type check all packages (uses TypeScript Go)
bun lint         # Lint with Biome
bun lint:fix     # Fix lint issues
```

## Local systemd service

For local production hosting via systemd user units, see:

- [`guides/systemd-service.md`](guides/systemd-service.md)

## License

[FSL-1.1-MIT](LICENSE.md) - Functional Source License with MIT future license.
