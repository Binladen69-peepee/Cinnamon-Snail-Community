# Vegan University

A community and cooking-school platform: a Reddit-shaped member app sitting on
top of a paid membership, with courses, live cook-alongs and member discovery.
Mighty Networks is a capability reference only — this product has its own
information architecture and visual identity.

**The member app is being rebuilt.** `docs/rebuild-roadmap.md` is the current
plan of record and says what is done, what is next, and what was deliberately
kept. `BUILD.md` remains the original execution contract for everything outside
that rebuild. `DECISIONS.md` records why things are the way they are — read it
before changing something that looks odd, because most of what looks odd is
load-bearing.

---

## What is where

```
app/
  (marketing)/      Public sales pages. Untouched by the rebuild, always live.
  (member)/         The signed-in app. Being rebuilt; see the roadmap.
  (auth)/           Magic-link sign in.
  admin/            Staff tools, on their own plain chrome.
  api/              Route handlers: search, media, community, messages, jobs.
components/
  app/              The member frame: header, rails, tabs.
  feed/             Posts, composer, votes, comments, uploads.
  marketing/        Sales-page components.
  ui/               Primitives shared by both.
lib/                Domain services. Business rules live here, not in pages.
prisma/             Schema, migrations, seeds.
docs/               Architecture notes, runbooks, the rebuild roadmap.
```

The rule that keeps this navigable: **pages are thin**. A route reads the
session, calls into `lib/`, and lays out the result. Anything that decides
something belongs in `lib/`.

---

## Setup

1. Install [Docker](https://www.docker.com/) and [pnpm](https://pnpm.io/).
2. Copy environment variables:

```bash
cp .env.example .env
```

3. Generate `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

4. Start Postgres (Docker maps to **5433** so it does not collide with a local
   install on 5432) and run migrations:

```bash
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Seeded local accounts (password `vegan-local-dev`):

- `adam@veganuniversity.test` (admin)
- `member@veganuniversity.test` (member)

Magic links are emailed through Resend when `RESEND_API_KEY` is set. The server
console is only a development fallback if delivery is unavailable.

### Optional: demo content

The default seed produces a thin feed. To exercise the real thing — scores,
reactions, threaded replies, and Adam's own photography at real dimensions:

```bash
npx tsx prisma/seed-feed-demo.ts   # local only; refuses a non-local DATABASE_URL
npx tsx prisma/reindex-search.ts   # backfills the search index
```

The reindex matters more than it sounds: indexing only happens for content
created through the app, so anything written by a seed script is invisible to
search until this runs.

---

## Environment variables

See `.env.example`. Never commit secrets. Never expose SamCart, Kit or Supabase
service keys to the client.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (pooled, transaction mode in production) |
| `DIRECT_URL` | Session-mode connection, for migrations only |
| `AUTH_SECRET` | Auth.js signing secret |
| `AUTH_URL` | Canonical app URL |
| `RESEND_API_KEY` | Transactional email (optional in development) |
| `EMAIL_FROM` | Sender address for magic links |
| `SAMCART_WEBHOOK_SECRET` | Verifies billing webhooks |
| `KIT_API_KEY` | Kit (ConvertKit) list sync |
| `SUPABASE_URL` | Supabase **project API** base, for member uploads |
| `SUPABASE_SERVICE_ROLE_KEY` | Mints signed upload URLs. Server only, Sensitive. |
| `SUPABASE_UPLOAD_BUCKET` | Upload bucket, defaults to `community-uploads` |

> `SUPABASE_URL` is **not** `DATABASE_URL`. They point at the same Supabase
> project, but storage needs the `https://<ref>.supabase.co` API base, and a
> `postgresql://` value there fails every upload silently. This has caught us
> once already.

Uploads stay disabled until `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` both
exist; the composer's Photo control is disabled with a reason rather than
failing after someone has picked a file. See `docs/member-uploads.md` for the
bucket policy.

---

## Database

```bash
pnpm db:generate     # regenerate the Prisma client
pnpm db:migrate      # apply migrations
pnpm db:seed         # baseline seed
pnpm db:studio       # browse the data
```

### Migrations are applied by the build

`pnpm build` runs `prisma migrate deploy` before `next build`, so a deployment
cannot ship code whose migrations were never applied. That failure mode is not
hypothetical: two migrations were hand-applied locally and never run against
production, the build passed because it only generated the client, and every
member page returned 500 while CI stayed green.

**`migrate deploy` uses `DIRECT_URL`, not `DATABASE_URL`.** In production
`DATABASE_URL` is the Supabase pooler in *transaction* mode, which is what
serverless needs and which Prisma Migrate cannot run DDL through — and it does
not error, it hangs. `prisma migrate status` against it ran for seven minutes
and returned nothing, so a build using it would time out rather than report
anything useful. `DIRECT_URL` is the same pooler in *session* mode, port 5432.
Locally the two are identical, because there is no pooler.

### Migrations still need care here

Two traps, both real, both will bite when writing a new migration:

**`prisma migrate dev` demands a database reset.** An early migration's
checksum changed when its raw-SQL full-text statements were stripped, so Prisma
sees the history as tampered. Do not accept the reset — it destroys local data.
Create the migration by hand instead, locally:

`migrate deploy` is unaffected by this and applies cleanly, which is why the
build can rely on it. The dance below is only for authoring a new migration.

```bash
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/<timestamp>_<name>/migration.sql

# STRIP the destructive statements — see below — then:
npx prisma db execute --file prisma/migrations/<timestamp>_<name>/migration.sql \
  --schema prisma/schema.prisma
npx prisma migrate resolve --applied <timestamp>_<name>
```

**Every generated diff tries to delete full-text search.** `SearchIndex.search_tsv`
and its three FTS/trigram indexes are created by raw SQL and are absent from
`schema.prisma`, so Prisma reads them as drift and emits:

```sql
DROP INDEX "search_index_trgm_body_idx";
DROP INDEX "search_index_trgm_title_idx";
DROP INDEX "search_index_tsv_idx";
ALTER TABLE "SearchIndex" DROP COLUMN "search_tsv";
```

Strip all four from every migration before applying, and note in the migration
header that you did. Then verify:

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'SearchIndex';
```

Representing those objects in the schema would end both problems and is worth
doing.

---

## Local development

```bash
pnpm dev             # Next dev server (Turbopack)
pnpm build           # production build
pnpm start           # serve the production build
pnpm lint            # ESLint
pnpm typecheck       # tsc --noEmit
```

If the dev server serves a stale or 404 page after moving routes around, clear
the Turbopack cache — `rm -rf .next`. Generated route types linger and produce
dozens of phantom type errors that vanish on a clean build.

---

## Testing

```bash
pnpm test            # Vitest
pnpm test -- --watch
```

Integration tests under `tests/*.integration.test.ts` need the Docker Postgres
running; they fail with `Can't reach database server at 127.0.0.1:5433` if it is
not, which is expected rather than a regression.

What is covered on purpose: access control (space visibility, posting,
editing), the upload policy (MIME allowlist, size caps, object-key scoping),
billing and entitlement transitions, feed ranking and comment nesting, and the
video-reveal behaviour. Those are the places where a silent mistake would be
expensive.

---

## Architecture notes

**Auth** is Auth.js v5 with a JWT strategy plus session rows. The JWT callback
does database work on sign-in only and then revalidates at most every five
minutes, and it **fails open** — an early version cleared the session id on any
error, which logged people out at random.

**Billing** is SamCart as the source of truth, with entitlements as the access
source of truth. Webhooks are idempotent and the raw provider event is stored
before processing. See `docs/billing-architecture.md`.

**Uploads** go browser → Supabase directly via a signed URL minted server-side.
The object key is built from the session's user id, never from the request, and
the stored object's own metadata is re-checked before an attachment row is
written. Reads go through `/api/media/...`, which checks the session and
redirects to a short-lived signed URL — the bucket is private, and the bytes
still come from the CDN. See `docs/member-uploads.md`.

**Search** is Postgres full-text with a trigram fallback, over a `SearchIndex`
table populated on write. `prisma/reindex-search.ts` backfills it.

**Regions** — `vercel.json` pins functions to `sin1` to sit beside the Supabase
database. Cross-region was costing roughly ten times the latency: the homepage
went 4.1s → 0.39s when this was fixed.

---

## Deployment

Vercel, from `master`. Production environment variables are set in the Vercel
project, not in any file.

The member-app rebuild happens on `rebuild/member-app` so `master` stays
deployable throughout.

---

## Jobs

Background work runs through route handlers under `app/api/jobs/`, invoked by
schedule. Every job is idempotent and retry-safe; failures are observable
rather than silent. Reconciliation exists for billing state so a missed webhook
is eventually corrected.

---

## Integrations

| Service | Role |
| --- | --- |
| SamCart | Checkout and billing source of truth |
| Supabase | Postgres and member upload storage |
| Resend | Transactional email |
| Kit | Newsletter and audience sync |
| Senja | Testimonial widgets on the sales pages |
| Zoom | Live cook-along hosting |

---

## Troubleshooting

**Everyone is being logged out.** Check the JWT callback in `auth.ts`. It must
fail open; clearing `sessionId` on a transient database error signs people out.

**The catalog or feed is empty in production.** Almost always unapplied
migrations rather than a missing `DATABASE_URL`. Vercel marks Sensitive
variables unreadable, so `vercel env pull` returning an empty value proves
nothing.

**Search finds nothing.** Run `prisma/reindex-search.ts`. Content created by
seed scripts is never indexed.

**Uploads fail immediately.** Check that `SUPABASE_URL` is the API base and not
the Postgres connection string, and that the bucket's MIME allowlist includes
the type being sent.

**`vercel env add` appears to succeed but stores nothing.** Piping without a
trailing newline silently stores an empty value and prints no warning. Feed it
from a file; a real success prints `✓ Added`.

**Phantom type errors after moving routes.** `rm -rf .next`.
