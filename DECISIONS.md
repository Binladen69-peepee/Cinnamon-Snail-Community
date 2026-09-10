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
Posts and comments use upvote/downvote arrows with a net score. Feeds sort by Hot, New, Top, and Rising. Comments nest with reply and collapse. Reactions sit beside votes on posts: Love, Like, Celebrate, Helpful, and Curious (legacy stored Facebook-style emoji still count). One reaction per person per post.

Date:
2026-09-09

Approved by:
Product (human)

---

## DEC-014 — Phase 3 video until Cloudflare Stream keys exist

Status: ACCEPTED

Question:
How do lessons play before Cloudflare Stream credentials are in the environment?

Decision:
Lesson playback is entitlement-gated and issued as an expiring HMAC token. The player never receives a permanent paid CDN URL. When `CLOUDFLARE_STREAM_CUSTOMER_CODE` and a signing key are present, Stream is the provider. Until then, seeded demo lessons may use a short public clip through the same token route so resume, captions, and completion can be verified. Mighty course media is not imported (`DEC-003` remains blocked).

Date:
2026-09-09

Approved by:
Engineering (allowed by BUILD.md §5 / Phase 3 “or equivalent”)

---

## DEC-013 — Forest-and-cream visual identity

Status: ACCEPTED

Question:
Should Vegan University keep the Flavoriz peach/orange/Outfit system, or match the new hero + feed identity?

Decision:
The product uses the forest-and-cream system: cream `#FFF8EF` ground, warm-white cards, forest `#0F3D32` actions, green `#16A34A` accent, Poppins headings, Inter body. Marketing hero and member feed share that system. Member chrome is a light sidebar, not a dark dashboard. Live counts come from the database; do not invent member totals or online numbers.

Date:
2026-09-09

Approved by:
Product (human)

---

## DEC-015 — Dark theme is black, not green

Status: ACCEPTED

Question:
Should dark mode keep a green-tinted near-black, or go true black?

Decision:
Dark mode uses true black `#000000` with no green fills or mint type. Light text, headings, links, and accents use the light-theme cream `#FFF8EF`. Solid actions are black with cream type and a cream ring. Light mode stays forest-and-cream (DEC-013).

Date:
2026-09-09

Approved by:
Product (human)

---

## DEC-016 — What counts as a "connection" for direct messages

Status: ACCEPTED

Question:
`Profile.dmPreference = CONNECTIONS` needs a definition of "connection". The
build spec names the preference but never defines the relationship.

Decision:
A connection is someone you have already exchanged a conversation with, **or**
someone who shares a `MEMBERS`/`PRIVATE` space membership with you. Either is
sufficient. Public-space overlap alone does not count, because every signed-in
member can see public spaces.

Implemented in `lib/messages/permissions.ts` (`isConnection`) and enforced
server-side in `lib/messages/conversations.ts` on every send, not only at
thread creation — preferences and blocks change mid-conversation.

Date:
2026-09-09

Approved by:
Engineering (BUILD.md §1 rule 8 — recorded rather than silently invented)

---

## DEC-017 — DM delivery is polling until a realtime vendor is wired

Status: ACCEPTED

Question:
Phase 4A asks for realtime delivery, typing indicators, and read receipts.
`DEC-002` earmarked Ably/Pusher for 4A, but no realtime credentials exist.

Decision:
Delivery is short-interval polling against `GET /api/messages/[id]/poll`
(4s), which returns messages after a cursor plus typing state and read
receipts. Typing is a `ConversationMember.typingAt` timestamp with a 6s TTL,
pinged by the client at most every 3s. Read receipts are
`ConversationMember.lastReadAt`.

All three are real, server-enforced features — not simulated. Swapping in Ably
or Pusher later replaces the transport only; the permission gate and the data
model do not change.

Date:
2026-09-09

Approved by:
Engineering (allowed by BUILD.md §5)

---

## DEC-018 — Sales-page assets are flagged, never substituted

Status: ACCEPTED

Question:
The client copy brief forbids stock photography and AI images anywhere on the
homepage and `/membership`, and requires replacements from Adam's WordPress
media library. Those files are not accessible from this repository. What ships
in the meantime?

Decision:
Every image and video slot is declared in `lib/marketing/assets.ts` with a
description of the photo needed. A slot with no real asset renders a branded
panel naming what is required (`data-asset-needed="<slot-id>"` in the DOM);
it never renders a stock or AI image, and never a bare grey box pretending to
be a design choice. Filling a slot means setting `src` on the manifest entry —
no page edits.

All previous Unsplash imagery has been removed from both sales pages. A test
asserts no manifest entry points at a stock host.

Date:
2026-09-10

Approved by:
Engineering (brief: "flag it for Adam rather than dropping in a stock placeholder")

---

## DEC-019 — Course catalog and community heatmap read real data only

Status: ACCEPTED

Question:
The brief requires the Netflix-style catalog to pull from live class data
rather than a hardcoded list, and the heatmap to be drawn from real Mighty
Networks member geography rather than local test accounts.

Decision:
**Catalog.** `Course` gained `category`, `categoryOrder`, `catalogOrder`,
`teaserVideoUrl`, and `liveAt`. The homepage calls `getCatalogRows()`, which
groups published courses by category at request time, so newly scheduled live
cook-alongs appear without a deploy. The 52 classes and 6 categories from the
brief are seeded via `prisma/seed-catalog.ts` as starting data, not as the
source of truth. If Adam's Mighty course portal uses different category names,
re-seeding with those names re-groups the rows.

**Heatmap.** A dedicated `MemberGeoPoint` table is populated only by
`scripts/import-member-geo.ts` from a real Mighty CSV export, aggregated to
country/region/city so no individual member is stored. `Profile` rows are
deliberately *not* a source. Until the export is imported, the map renders an
explicit "member geography needed" state rather than fake pins. Density drives
glow intensity only; no member count is ever displayed.

**Urgency.** The only urgency permitted on the sales pages is the next
scheduled live cook-along date (`getNextLiveClass()`), because it is true and
specific. No countdowns, no "spots left", no member counts.

Date:
2026-09-10

Approved by:
Engineering (brief: "Do not hardcode this list as static text")

---

## DEC-020 — Sales-page video placement and the premium design pass

Status: ACCEPTED

Question:
Two videos were supplied from Vercel Blob. Which goes where, and what does the
"more modern, attention-grabbing" design direction actually change?

Decision:

**Video placement is driven by aspect ratio, not filename.** Both files were
inspected frame-by-frame before assigning them:

| File | Shape | Content | Role |
|---|---|---|---|
| `Vegan Cooking Classes - Adam Sobel` | 1920x1080, 107s | Adam to camera | Homepage hero background, muted + looping |
| `Video-11882` | 720x1280, 78s | Adam in his kitchen | `/membership` founder video, with controls |

The landscape file has to be the hero: a wide full-bleed band crops a 9:16
portrait to almost nothing. The portrait file is framed as a story-shaped card
rather than letterboxed into a 16:9 player. Swapping them is a one-line `src`
change in `lib/marketing/assets.ts`.

**Design pass.** A cinematic video hero replaces the two-column photo box; a
"featured in" marquee of verifiable press credits sits directly beneath it;
Learn/Cook/Belong became a staggered editorial trio with numbered eyebrows and
hover-zoom photography; Kitchen Table became an inverted forest panel so the
page has light/dark contrast rhythm rather than uniform cream; the catalog rails
gained edge-fade masks, per-shelf class counts, and cover zoom; and a fluid
`clamp()` display scale, cursor-following card spotlights, a scroll-progress
bar, and the previously-unused Caveat face as a handwritten accent were added.
All motion is disabled under `prefers-reduced-motion`.

**Theme-independent surfaces use literal colours, not tokens.** The Senja card
and the on-dark CTA both sit on permanently dark backgrounds, and the
`forest` / `warm-white` tokens invert between light and dark. Using tokens
there rendered cream-on-cream in dark mode. `--paper` is cream in both themes
and remains safe to use on the dark panels.

Date:
2026-09-10

Approved by:
Engineering (design direction requested by the client)
