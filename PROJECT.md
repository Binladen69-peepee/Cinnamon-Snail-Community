# Vegan University — project handbook

The single working document for this repository. It replaces `README.md`,
`PROJECT-MAP.md`, `DECISIONS.md` and the eleven files that were in `docs/`.

`BUILD.md` is deliberately **not** folded in. It is the client's brief rather
than something this project wrote, it declares itself the source of truth
(§43), and thirteen code comments cite it by section number. Copying it here
would duplicate the one document that must not have two versions. Its §42
build-status section is maintained; everything else in it is input, not record.

`AGENTS.md` / `CLAUDE.md` also stay: they are agent tooling, rewritten by
`next dev` on every run.

---

## 1. What this is

A self-hosted replacement for a Mighty Networks community, for a vegan cooking
school. Three surfaces in one Next.js app:

| Surface | Who | Routes |
| --- | --- | --- |
| Marketing | public | `/`, `/membership`, `/courses`, `/events`, `/about`, `/faq`, … |
| Member app | signed in | `/home`, `/discover`, `/spaces`, `/members`, `/messages`, `/learn`, `/compose`, `/notifications`, `/settings`, `/billing` |
| Admin console | staff | `/admin` and below |

**Stack:** Next.js 16 (App Router, RSC, server actions) · React 19 ·
TypeScript · Prisma 6 / PostgreSQL (Supabase) · Auth.js 5 · Tailwind 4 ·
HeroUI · SamCart (billing) · Resend (email) · Vitest · pnpm.

Money lives in SamCart. Access lives here. When they disagree the entitlement
is what gets fixed — the storefront is never queried during a page load.

---

## 2. Build status

Measured against BUILD.md §36 **Definition of Done** (17 points: UI,
responsive, accessible, backend, database, validation, authorization, error
handling, loading states, empty states, integration, retry, audit logging,
analytics, tests, typecheck, lint).

Nothing below is marked Done on the strength of "it renders". A feature is Done
here only where the data path, the authorization, the empty and error states
and the tests all exist.

### Done

| Feature | Route | Notes |
| --- | --- | --- |
| Auth | `/login` | Magic link + password. JWT sessions with a DB-backed revocation list. Google/Facebook wired, dormant until credentials exist. |
| Feed | `/home` | Composer, sort, density, vote rail, reactions, threaded comments. |
| Post detail | `/posts/[id]` | Depth-capped threads, permalinks, comment sort. |
| Spaces | `/spaces`, `/spaces/[slug]` | Visibility enforced by `canDiscoverSpace`; join/leave/favourite. |
| Discover | `/discover` | Search across classes, rooms, people, events. URL-driven. |
| Member directory | `/members` | SQL-paginated, facets, five filters. |
| Messages | `/messages` | List-detail, polling delivery, typing, read receipts, groups, images, block/report. |
| Class library | `/learn`, `/learn/[slug]` | 52 classes with real stills and teasers. |
| Composer | `/compose` | Five post types; fields driven by one table. |
| Notifications | `/notifications` | Six filters. Reading is an action, never a render (DEC-028). |
| Admin console | `/admin/*` | Overview, members, moderation, spaces, events, courses, billing, welcome DM. |
| Billing | `/billing`, `/admin/billing` | SamCart webhooks, entitlements, reconciliation, cancellation, deletion. |

### Not Done — and why

| Feature | State | Blocker |
| --- | --- | --- |
| `/search` | not built | Results page behind the command palette. `lib/search` is complete; only the page is missing. |
| `/calendar` | not built | Events exist (6, all past). `searchHref('event')` points here. |
| `/connect` | not built | Suggestions surface. `lib/social/suggestions` is complete. |
| `/roadmap`, `/bulletin` | not built | BUILD.md §14, §19. No data model work done. |
| Lesson playback | code done, no content | **Zero lessons exist.** `lib/learn/playback`, the signed-token routes and progress tracking are built and unused. Content, not code. |
| Email + web push notifications | not built | BUILD.md §9.5 lists both unchecked. In-app only. |
| Automation, AI cohost, challenges, recipe variations, SSO | not built | BUILD.md §15–20. Tables exist in the schema; nothing reads them. |
| Mighty migration | not started | BUILD.md §21. No member export received. |
| PWA | not started | BUILD.md §22. |

### Verification gate

```
pnpm typecheck     # clean
pnpm lint          # clean
pnpm test          # 332 pass, 15 skipped
pnpm build         # prisma migrate deploy && prisma generate && next build
```

Two integration test files (`billing-flow`, `welcome-dm`) fail without a local
Postgres on `127.0.0.1:5433`. They target the local Docker database, never
production. `docker compose up -d` fixes them.

---

## 3. Running it

```bash
pnpm install
cp .env.example .env          # fill DATABASE_URL, DIRECT_URL, AUTH_SECRET
docker compose up -d          # local Postgres on 5433
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Seeded accounts use password `vegan-local-dev`;
`adam@veganuniversity.test` is the administrator.

| Command | Does |
| --- | --- |
| `pnpm db:reseed` | Replaces members and posts. Keeps courses, spaces, products and the admin account. |
| `pnpm db:seed` | Full seed from empty. |
| `npx tsx prisma/reindex-search.ts` | Rebuilds `SearchIndex` after a reseed. |

**Deploys are CLI-driven**: `npx vercel deploy --prod --yes`. There is no
GitHub auto-deploy, so a `git push` alone does not ship.

**`DIRECT_URL` is required.** Prisma 6 errors without it; the schema comment
claiming it falls back to `DATABASE_URL` is wrong.

---

## 4. Code map

```
app/(marketing)     public sales site
app/(auth)          login, magic-link verify
app/(member)        the signed-in app
app/admin           staff console (own chrome, own scope)
app/api             route handlers: auth, search, media, polling, webhooks, cron

components/ui       shared primitives (wrap HeroUI where it has one)
components/app      member shell: header, rails, tabs
components/feed     posts, composer, comments, uploads
components/admin    console primitives + forms
components/marketing  sales-page pieces

lib/community       feed, directory, discover, privacy, reactions
lib/messages        DMs: permissions, conversations, welcome DM
lib/learn           classes, playback, progress, events
lib/billing         SamCart: verify, normalize, policy, apply, reconcile
lib/admin           console data layers
lib/uploads         signed upload/read through Supabase Storage
lib/search          FTS with trigram fallback

prisma/             schema, migrations, seeds
tests/              Vitest; *.integration.test.ts need a database
```

**Theme.** Every surface paints from role tokens in `app/globals.css`
(`--background`, `--surface`, `--foreground`, `--brand-fill`, …). Light is pure
white, dark is pure black, and the only hue anywhere is the amber and red that
carry warning and danger. A hex or `rgba` in a component is almost always a
bug; `tests/monochrome-theme.test.ts` computes the hue of every colour literal
and fails on green.

---

## 5. Decisions

Every ruling, by id. Code comments cite these, so the ids are load-bearing.

| Id | Ruling |
| --- | --- |
| DEC-001 | Cancellation follows SamCart's reported period, not a local clock. |
| DEC-002 | Implementation stack. |
| DEC-003 | Mighty course extraction and progress — blocked, no export. |
| DEC-004 | Forum: read-only archive rather than full import. |
| DEC-005 | Places provider for the map. |
| DEC-006 | Mighty profile field mapping. |
| DEC-007 | Rich text editor choice. |
| DEC-008 | Phase 1 community access is separate from entitlements. |
| DEC-009 | Resend From address stays `onboarding@resend.dev` until a VU domain verifies. |
| DEC-010 | Account deletion has a 7-day grace period, then purge. |
| DEC-011 | Billing jobs run on a cron route guarded by a shared secret. |
| DEC-012 | Feed voting and sort: Reddit-style hot/new/top/rising. |
| DEC-013 | Forest-and-cream identity. **Superseded** — see DEC-037. |
| DEC-014 | Phase 3 video runs without Cloudflare Stream keys. |
| DEC-015 | Dark theme is black, not green. |
| DEC-016 | A "connection" for DMs is a prior thread or a shared private space. |
| DEC-017 | DM delivery is polling until a realtime vendor is wired. |
| DEC-018 | Sales-page assets are flagged when missing, never substituted with stock. |
| DEC-019 | Course catalog and heatmap read real data only. |
| DEC-020 | Sales-page video placement. |
| DEC-021 | Production connects through the Supabase pooler; migrations use the direct host. |
| DEC-022 | Auth stopped querying the database on every request — 5-minute revalidation, fail open. |
| DEC-023 | Functions run in the database's region. |
| DEC-024 | The globe *is* the community section. |
| DEC-025 | Videos open from a point; ambient loops gate on visibility. |
| DEC-026 | Video hosting is Supabase Storage. |
| DEC-027 | The blueprint is applied in phases, starting with the shell. |
| DEC-028 | One notification inbox with filters. **Reading is an action, never a render.** |
| DEC-029 | Uploads: private bucket, signed reads, 50 MB video cap. |
| DEC-030 | Spaces are places, not categories. |
| DEC-031 | The hero is a photograph; photo motion lives in one place. |
| DEC-032 | The globe is drawn from coastlines, not plotted dots. |
| DEC-033 | Welcome DM settings live in a table, not the environment. |
| DEC-034 | The SamCart webhook secret arrives in the query string. |
| DEC-035 | Magic-link email is capped at one recipient until the domain verifies. |
| DEC-036 | Membership access source: SamCart or Kit tags. |
| DEC-037 | **The product is monochrome.** Green and the headline texture are gone from admin, member app and marketing. Amber and red survive because they carry meaning. Supersedes DEC-013. |
| DEC-038 | **Polaris cannot be used.** The React package is deprecated and peer-locked to React 18; the web components require App Bridge inside Shopify Admin. Its button *construction* is reproduced from the shipped stylesheet; colour comes from our tokens. |
| DEC-039 | **The admin console follows the theme.** It keeps its own denser scope but is no longer pinned to dark. |

---

## 6. Production readiness

The brief is millions of users. This is where the code stands against that.

### Fixed

- **Member directory** loaded every visible profile, then filtered, sorted and
  paginated in memory. Now counted and sliced in SQL; only the rows on the page
  resolve follow state, shared rooms and matcher reasons. Cost is a function of
  page size, not community size.
- **Inbox N+1**: `listConversations` issued one `COUNT` per thread, so sixty
  threads meant sixty round trips. One `groupBy` now.

### Known limits, in priority order

1. **`totalUnreadForUser` is still N+1.** It runs on every member page via
   `AppShell`. Same fix as the inbox; not yet applied.
2. **In-memory filtering remains in `lib/community/discover.ts`,
   `lib/learn/library.ts` and `lib/messages/start.ts`.** Each loads a whole
   table before filtering. Fine at 52 classes and 14 members; not at scale.
   `discover.ts` is the worst — it loads courses, spaces, profiles and follows
   on every keystroke.
3. **Interests are a JSON column.** They cannot be indexed, aggregated or
   filtered in SQL, so the directory's interest filter runs over the page and
   its facet list is empty. A tag table is the fix.
4. **The feed has no cursor pagination.** `listFeed` has a cursor helper
   (`encodeCursor`) that the page does not use.
5. **No rate limiting in production.** `lib/auth/rate-limit.ts` is an in-memory
   limiter — per-instance, so it does not hold across serverless invocations.
   `UPSTASH_REDIS_REST_URL` is in `.env.example` and unset.
6. **No caching anywhere.** Every member page is `force-dynamic` and hits the
   database. No `unstable_cache`, no ISR, no Redis.
7. **Images bypass the optimizer.** `next.config.ts` allows only
   `images.unsplash.com`; every class still is a raw WordPress original
   (~130 KB average, 353 KB peak, ~6.8 MB across `/learn`).
8. **No observability.** `SENTRY_DSN` and the PostHog keys are empty. There is
   no error reporting and no analytics, both of which BUILD.md §31–32 require.
9. **`.env` carries two `DATABASE_URL` lines.** Last wins for Next and Prisma
   (production), first wins for the test runner (local Docker). It works by
   accident, not design.

---

## 7. Next steps

In the order I would take them.

1. **Seed lessons.** Everything in `lib/learn` — playback tokens, signed media
   routes, progress, the lesson list on the class page — is built and idle
   because zero lessons exist. This unblocks Phase 7's own definition of done
   ("resuming a half-finished lesson is one click from `/home`") and is content
   work, not engineering.
2. **Observability before more features.** Sentry and PostHog are two
   environment variables and an hour. Without them nothing above is measurable
   and BUILD.md §31–32 stay unchecked.
3. **Finish the scale list**, items 1–4. The `totalUnreadForUser` N+1 and
   `discover.ts` are the two that will hurt first.
4. **Rate limiting on the real paths** — magic link, password, webhook, upload.
   Requires the Upstash credentials.
5. **The four remaining 404s**: `/search`, `/calendar`, `/connect`, then
   `/bulletin`. `/search` is closest to done — the library is complete.
6. **Look at it.** Six pages have shipped without anyone confirming how they
   render signed in, in either theme, at phone width.
