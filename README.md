# Vegan University

Premium community + cooking school platform. Mighty Networks is a capability reference only — this product has its own information architecture and visual identity.

`BUILD.md` is the master execution contract. Do not add a competing roadmap.

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

4. Start Postgres (Docker maps to **5433** so it does not collide with a local install on 5432) and run migrations:

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

Magic links are emailed through Resend when `RESEND_API_KEY` is set. The server console is only a development fallback if delivery is unavailable.

## Environment variables

See `.env.example`. Never commit secrets. Never expose SamCart or Kit keys to the client.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `DIRECT_URL` | Session-mode connection, for migrations only |
| `AUTH_SECRET` | Auth.js cookie signing |
| `AUTH_URL` | Public origin |
| `EMAIL_FROM` | From-address for magic links |
| `RESEND_API_KEY` | Resend API key for transactional email |
| `RESEND_API_KEY` | Transactional email (optional in development) |
| `SUPABASE_URL` | Supabase project URL, for member uploads |
| `SUPABASE_SERVICE_ROLE_KEY` | Mints signed upload URLs (server only, Sensitive) |
| `SUPABASE_UPLOAD_BUCKET` | Upload bucket, defaults to `community-uploads` |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | Rate limit (optional; in-memory fallback in development) |
| `SAMCART_WEBHOOK_SECRET` | Verify Notify URL `api_key` or HMAC signature |
| `SAMCART_API_KEY` | Passed as the `sc-api` header for cancel / list / refund |
| `ACCOUNT_DELETION_GRACE_DAYS` | Days before purge after a deletion request (default 7, DEC-010) |
| `KIT_API_KEY` / `KIT_API_SECRET` | Tag sync after entitlement changes |
| `BILLING_JOB_SECRET` | Protects `POST /api/jobs/billing` |
| `BILLING_ALERT_EMAIL` | Daily reconciliation email, including clean days |

## Database

### Migrations are applied by the build

`pnpm build` runs `prisma migrate deploy` before `next build`, so a deployment
cannot ship code whose migrations were never applied. That failure mode is not
hypothetical: two migrations were hand-applied locally and never run against
production, the build passed because it only generated the client, and every
request touching the new tables returned 500 while the build was green.

`prisma migrate deploy` uses `DIRECT_URL`, not `DATABASE_URL`. In production
`DATABASE_URL` is the Supabase pooler in **transaction** mode, which is what
serverless needs and which Prisma Migrate cannot run DDL through — it hangs
indefinitely rather than failing, so a build using it would time out rather than
report anything useful. `DIRECT_URL` is the same pooler in **session** mode
(port 5432). Locally the two are identical, because there is no pooler.


PostgreSQL 16 + Prisma. Schema: `prisma/schema.prisma`. Migrations: `prisma/migrations`.

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:studio
```

## Local development

```bash
pnpm dev
```

Member app: `/home`  
Public membership: `/membership`  
Signed-in billing: `/billing`  
Admin: `/admin` and `/admin/billing` (admin role required)  
Health: `/api/health`  
SamCart webhook: `POST /api/webhooks/samcart`

## Testing

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Deployment

Node-compatible host (Vercel or equivalent), managed Postgres, environment-based secrets. Cloudflare R2/Stream remain later adapters.

## Jobs

Webhook processing runs after the SamCart response via Next.js `after()`. Retry failed events and nightly reconciliation with:

```bash
POST /api/jobs/billing?job=retry
POST /api/jobs/billing?job=reconcile
```

Send `Authorization: Bearer $BILLING_JOB_SECRET` in production. The same functions can be wrapped by Inngest later (`DEC-011`).

## Integrations

| System | Role | Status |
|---|---|---|
| Auth.js | Sessions, magic link, optional password | Phase 1 |
| Resend | Email | Adapter ready |
| SamCart | Money source of truth | Webhook + cancel API adapter |
| Kit | Tags from entitlements | Attempted after entitlement changes |
| Cloudflare R2 / Stream | Media / video | Phase 1 adapter / Phase 3 video |

Access checks never query SamCart or Kit. They read entitlements.

## Troubleshooting

- **Magic link not arriving:** check the server console in development.
- **Prisma client missing:** `pnpm db:generate`.
- **Postgres connection refused:** `docker compose up -d` and confirm port **5433** (mapped away from any local Postgres on 5432).
- **Signed-in but bounced to login:** cookie blocked, or `AUTH_URL`/`AUTH_SECRET` mismatch.
