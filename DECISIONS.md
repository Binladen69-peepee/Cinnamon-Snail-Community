# Decisions

Open product questions stay **BLOCKED** until a human approves them. Technical choices that `BUILD.md` explicitly allows are recorded here as accepted.

---

## DEC-001 — Cancellation Timing

Status: ACCEPTED

Question:
Should cancellation be immediate or end-of-period?

Options:
A. Immediate — access revoked as soon as SamCart confirms cancellation  
B. End of current billing period — access remains until `period_end`  
C. Policy depends on product (membership vs course vs bundle)

Impact:
Affects cancellation UX, entitlement expiry, Kit tags, reconciliation, and billing acceptance tests (“access remains until period end when policy requires”).

Decision:
Use whatever period SamCart reports as final. Do not add product-specific override logic. Access continues until SamCart’s `period_end` when that timestamp is in the future; if SamCart reports no remaining period, access ends immediately.

SamCart now correctly reports a 31-day period for the two 1-month free-trial membership products (`1069358`, `1069354`), so those SKUs do not need special-casing.

Date:
2026-09-09

Approved by:
Product (human)

---

## DEC-002 — Implementation stack

Status: ACCEPTED

Question:
Which allowed `BUILD.md` equivalents should this repository use?

Decision:

| Concern | Choice | Justification |
|---|---|---|
| App | Next.js App Router + TypeScript | Specified |
| Database | PostgreSQL + Prisma | Prisma has first-class Auth.js adapter and versioned migrations |
| Schema location | `prisma/` not `db/` | Native Prisma layout; documented adaptation |
| Auth | Auth.js v5 | Specified option |
| Sessions | JWT carrying a database session id | Enables optional-password login and server-side revocation |
| Email | Resend, with a development console adapter | Specified option |
| Jobs | Inngest (wired in Phase 2) | Specified option |
| Redis | Upstash, in-memory fallback in development | Specified option |
| Media | Storage adapter (local disk now, R2 later) | Avoids fake production uploads |
| Video | Cloudflare Stream in Phase 3 | Specified option |
| Search | Postgres FTS + pg_trgm | Specified |
| Realtime | Request/response + polling in Phase 1; Ably/Pusher in 4A | DMs are not in Phase 1 |

Date:
2026-09-08

Approved by:
Engineering (allowed by BUILD.md §5)

---

## DEC-003 — Mighty course extraction / progress

Status: BLOCKED

Question:
If Mighty has no bulk course export, do we extract structure, rebuild from originals, and what happens to historical lesson progress?

Options:
A. Rebuild courses from original source files; start progress at zero  
B. Authenticated extraction of structure + media references; progress unrecoverable  
C. Authenticated extraction including progress if a path exists

Impact:
Phase 3 authoring and Phase 5 migration.

Decision:
—

Date:
2026-09-08

Approved by:
—

---

## DEC-004 — Forum import vs read-only archive

Status: BLOCKED

Question:
Should Mighty forum history be a full import into the live feed, or a read-only archive?

Options:
A. Full import  
B. Read-only archive  
C. Import a subset (pinned / last N months)

Impact:
Feed quality, moderation, author matching, and crawl engineering.

Decision:
—

Date:
2026-09-08

Approved by:
—

---

## DEC-005 — Places provider for The Map

Status: BLOCKED

Question:
Is Google Places (or another provider) approved for vegan business search?

Options:
A. Google Places  
B. Another provider  
C. Locally curated places only in v1

Impact:
Phase 4F map, caching, and budget.

Decision:
—

Date:
2026-09-08

Approved by:
—

---

## DEC-006 — Mighty profile field mapping

Status: BLOCKED

Question:
Which Mighty profile fields should be imported versus dropped during member migration?

Impact:
Phase 1 profile model is VU-native. Migration mapping waits on a field inventory.

Decision:
—

Date:
2026-09-08

Approved by:
—

---

## DEC-007 — Rich text editor

Status: ACCEPTED

Question:
How should Phase 1 posts support rich text?

Decision:
Markdown stored as source, sanitized HTML for display. Mentions use `@handle`. GIF/image URLs and uploads via the storage adapter. A heavier editor (TipTap) can replace the composer later without schema changes (`body` + `bodyHtml` + `plainText`).

Date:
2026-09-08

Approved by:
Engineering

---

## DEC-008 — Phase 1 community access vs entitlements

Status: ACCEPTED

Question:
Does signed-in community access require a paid entitlement before Phase 2 billing exists?

Decision:
Community authorization in Phase 1 requires an authenticated `ACTIVE` user plus space membership/visibility rules. The entitlement module is the only function later paid surfaces will call, and seed users receive a `MANUAL` membership entitlement so the access path exists. The public membership paywall and SamCart-driven grants are Phase 2. This does not invent a cancellation or pricing policy.

Date:
2026-09-08

Approved by:
Engineering

---

## DEC-010 — Account deletion grace period

Status: ACCEPTED

Question:
How many days after a confirmed deletion request should we purge personal data?

Impact:
`User.deletionRequestedAt` and a purge job exist. Paid members still cannot be soft-deleted until SamCart confirms cancellation.

Decision:
Seven days. `ACCOUNT_DELETION_GRACE_DAYS=7`. After SamCart-confirmed cancellation (when required) and a deletion request, the account stays `PENDING_DELETION` for 7 days, then the purge job permanently removes personal data.

Date:
2026-09-09

Approved by:
Product (human)

---

## DEC-011 — Billing job runner

Status: ACCEPTED

Question:
How should Phase 2 process webhooks, retries, and nightly reconciliation before Inngest keys exist?

Decision:
The billing functions live in `lib/billing` and are invoked by Next.js `after()` on the webhook response, plus `POST /api/jobs/billing` (retry / reconcile / purge) protected by `BILLING_JOB_SECRET`. Inngest can wrap the same functions later without changing access rules.

Date:
2026-09-09

Approved by:
Engineering (allowed by BUILD.md §5)

---

## DEC-009 — Resend From address

Status: ACCEPTED

Question:
Can `ap195569@gmail.com` be used as the Resend From address?

Decision:
No. Resend rejected `gmail.com` as an unverified sending domain (HTTP 403). Transactional mail uses `EMAIL_FROM=Vegan University <onboarding@resend.dev>`, Resend's allowed test sender, until a Vegan University domain is verified. The To address remains the exact email the member typed, including Gmail inboxes.

Date:
2026-09-09

Approved by:
Engineering

---

## DEC-012 — Feed voting and sort

Status: ACCEPTED

Question:
Should community posts keep emoji reactions, or use Reddit-style voting?

Decision:
Posts and comments use upvote/downvote arrows with a net score. Feeds sort by Hot, New, Top, and Rising. Comments nest with reply and collapse. Facebook-style reactions (Like, Love, Care, Haha, Wow, Sad, Angry) sit beside votes on posts. One reaction per person per post.

Date:
2026-09-09

Approved by:
Product (human)
