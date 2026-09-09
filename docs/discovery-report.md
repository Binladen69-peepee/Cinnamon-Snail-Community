# Discovery Report

**Date:** 2026-09-08  
**Repository:** Vegan University (workspace: `migthty Network`)  
**Phase:** 0 complete — greenfield start

## Repository inspection

The workspace was **empty** before this build. There was no existing application, schema, auth, UI kit, tests, or deployment config to preserve.

A Next.js App Router project was scaffolded in the repository root as the implementation base.

## Current framework

| Item | Choice |
|---|---|
| Framework | Next.js 16 App Router |
| Language | TypeScript (strict) |
| UI | React 19 + Tailwind CSS 4 |
| Package manager | pnpm |

## Current database

None existed. Target: **PostgreSQL 16** via Docker Compose, **Prisma** ORM, version-controlled migrations.

## Authentication

None existed. Target: **Auth.js (NextAuth v5)** with:

- Magic-link email as the primary sign-in
- Optional password
- HTTP-only session cookies
- Database-backed session records so sessions can be revoked

## Existing UI system

None. A Vegan University design system is being created from `BUILD.md` §3 (warm natural palette, editorial serif + sans, food/community photography).

## Existing dependencies (scaffold)

- `next`, `react`, `react-dom`
- `tailwindcss`, `eslint`, `typescript`

Production dependencies for auth, database, validation, and jobs are added as part of Phase 1.

## Environment variables

None existed. Canonical list lives in `.env.example` and README.

Required for local Phase 1:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `EMAIL_FROM`

Optional:

- `RESEND_API_KEY` (transactional email; without it, magic links log to the server console in development)
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (rate limit; in-memory fallback in development)
- `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY` (observability/analytics)

## Existing integrations

None. Planned adapters (not live until their phase):

| Integration | Role | Phase |
|---|---|---|
| SamCart | Billing source of truth | 2 |
| Kit | Tag/field sync from entitlements | 2 |
| Resend | Transactional email | 1 |
| Cloudflare R2 | Media storage | 1 adapter / 3 media |
| Cloudflare Stream | Signed video | 3 |
| Inngest | Background jobs | 2 |
| Upstash Redis | Rate limits, caches | 1 |
| Sentry | Errors | 6/7 |
| PostHog | Product analytics | 6 |
| Anthropic | AI Cohost | 4D |

## Existing routes

None before scaffold. See `docs/schema-plan.md` and the App Router groups in `/app`.

## Existing schema

None. Schema direction is documented in `docs/schema-plan.md` and implemented in `prisma/schema.prisma`.

## Deployment configuration

None. Intended later: Node-compatible host (Vercel or equivalent) + managed Postgres + Redis + R2/Stream. Not a launch blocker for Phase 1.

## Existing tests

None. Vitest is the unit/integration runner. Playwright E2E is deferred until auth + community journeys are stable enough to automate.

## Technical debt

- Scaffold leftover Next.js starter page (replaced in Phase 1).
- Default `.gitignore` ignored all `.env*` files; `.env.example` is now tracked.
- Directory name `migthty Network` is not npm-safe; package name is `vegan-university`.

## Reusable components

None. Design-system primitives will live in `components/ui`.

## Conflicting architecture

None. Greenfield. Prisma's native `prisma/` directory is used instead of `db/` from the suggested tree; this is documented in `DECISIONS.md`.

## Blockers

1. **Mighty Networks live audit** — no client credentials/access in this environment. Parity checklist was produced from `BUILD.md` capability references, not a live crawl.
2. **SamCart / Kit credentials** — not available; Phase 2 integrations cannot be marked complete until they exist.
3. **Cancellation timing** — business decision still open (`DEC-001`).
4. **Forum import vs archive** — business decision still open (`DEC-004`).
5. **Google Places for the Map** — approval still open (`DEC-005`).

Independent work (Phase 1 foundation + community) is not blocked.

## Gate status

| Gate item | Status |
|---|---|
| Architecture understood | Yes — greenfield Next.js + Postgres + Auth.js |
| Schema direction documented | `docs/schema-plan.md` |
| Major integrations identified | This document |
| Mighty parity checklist exists | `docs/mighty-parity-checklist.md` |
| Blockers documented | This section + `DECISIONS.md` |
