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

---

## DEC-021 — Production database connects through the Supabase pooler, not the direct host

Status: ACCEPTED

Question:
The supplied production connection string used Supabase's direct database host
(`db.<ref>.supabase.co:5432`). It worked locally but every request on Vercel
failed with `PrismaClientInitializationError`.

Cause:
`db.<ref>.supabase.co` resolves to **IPv6 only** — it publishes an AAAA record
and no A record. Vercel's serverless functions have no outbound IPv6, so that
host is unreachable from the deployed app no matter what the credentials are.
Confirmed by DNS lookup: AAAA present, A absent.

Decision:
Production `DATABASE_URL` uses the Supavisor pooler instead, which is
IPv4-reachable:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

- The username takes the `postgres.<project-ref>` form the pooler requires.
- Port 6543 is transaction mode, which is the right choice for serverless:
  each invocation borrows a short-lived connection instead of holding a session.
- `pgbouncer=true` disables prepared statements, which transaction mode cannot
  support; `connection_limit=1` keeps a single lambda from opening a pool of
  its own.
- The region was found empirically. The pooler distinguishes "tenant/user not
  found" (wrong region) from an auth failure, so scanning regions identifies
  the right one; this project is in `ap-southeast-1`.

Port 5432 on the pooler (session mode) also works and is the one to use for
migrations, which need prepared statements.

The credential itself lives only in Vercel's environment variables, stored as a
Sensitive variable. It is in no file in this repository. Note that Sensitive
variables cannot be read back — `vercel env pull` returns them empty, which is
not evidence that they are unset.

Date:
2026-09-10

Approved by:
Engineering (the supplied host cannot work from Vercel; the pooler is the
documented Supabase remedy)

---

## DEC-022 — Auth stopped querying the database on every request

Status: ACCEPTED

Question:
Members were being logged out unexpectedly, and every signed-in page was slow.

Cause:
The `jwt` callback re-read the user row and the session row on every
invocation, and `auth()` runs three times per member page (the page, the member
shell, and the nav). That is six database round trips per page load purely for
auth. Worse, any one of them failing or returning nothing cleared
`token.sessionId`, and `MemberShell` redirects to `/login` when `sessionId` is
empty — so a single dropped connection logged the member out, permanently,
because the cleared token was then re-signed without it.

Decision:

- The database is touched on sign-in, and after that only when the token is
  older than `REVALIDATE_MS` (5 minutes) or the session is explicitly updated.
  Handle, roles, email, name and avatar are carried on the token.
- Revalidation **fails open**. A timeout or a dropped connection is not
  evidence that a session is invalid; the token keeps working and the next
  revalidation tries again. `sessionId` is cleared only when the database
  gives a definitive answer: the account is missing or not `ACTIVE`, or the
  session row is missing, revoked, or expired.
- `lastLoginAt` and the audit row are written after the response.

The trade: revoking a session takes effect within five minutes rather than
instantly. That is the right trade for not querying on every request, and
`revokeAllSessions` still works — it just is not instantaneous.

Date:
2026-09-10

Approved by:
Engineering (bug fix)

---

## DEC-023 — Functions run in the same region as the database

Status: ACCEPTED

Question:
Why was every request slow even after the auth queries were removed?

Cause:
`X-Vercel-Id` showed functions executing in `iad1` (Washington DC) while the
Supabase project is in `ap-southeast-1` (Singapore). Every query crossed the
Pacific. Measured on production: `/api/health`, which runs a single `count()`,
took **1.44s warm**; the homepage took **4.1s warm**.

Decision:
`vercel.json` pins `regions: ["sin1"]` so functions execute next to the
database. Compute belongs beside its data when a request makes more than one
query, which every page here does.

Note this makes the network hop longer for US visitors while making each query
roughly free. If the audience is predominantly US-based, the better long-term
fix is a US-region Supabase project, at which point this should be changed to
`iad1` to match.

Date:
2026-09-10

Approved by:
Engineering (measured)

---

## DEC-024 — The globe *is* the community section

Status: ACCEPTED

Question:
Where does the member globe live, and does it duplicate the heatmap?

Decision:
It is the community section, not a hero ornament and not a second feature. The
globe sits at the centre of a full-width dark panel on both sales pages, at a
size that carries the section, and it replaced the flat SVG world map that used
to sit in an empty card. `getCommunityHeatmap()`, `lib/marketing/heatmap.ts`
and the hand-drawn `WORLD_LANDMASS_PATH` are all deleted; `getGlobeMarkers()`
is now the single source for member geography and reads the same
`MemberGeoPoint` table, so importing the Mighty Networks export lights it up
with no code change. Until then it returns clearly-labelled placeholder pins
and the caption says they are stand-ins.

The globe is `cobe` — one WebGL canvas, no scene graph — rather than
react-globe.gl, which brings three.js for control this does not need. cobe's
own markers are disabled: they are projected by its shader and sat a few pixels
off the pins overlaid on top, which read as duplicate markers.

Markers are teardrop map pins drawn as SVG, with the member's photo clipped
into a circle at the head. SVG rather than the usual rotated-square CSS
teardrop, because that approach needs the photo counter-rotated inside it and
never gives a genuinely pointed tip. Each pin is positioned
`translate(-50%, -100%)` so its point — not its centre — lands on the
coordinate, which is how a map pin is meant to read.

The country count shown beneath the globe is a count of places, not of people,
which is why it does not breach the no-member-counts rule.

Date:
2026-09-10

Approved by:
Engineering

## DEC-025 — Videos open from a point, and every ambient loop is gated on visibility

Status: ACCEPTED

Question:
The two sales-page videos were not playing at all. What was actually wrong,
what should playback look like, and what were the looping decorations costing?

Decision:
The playback failure was not in this codebase. Every file in the Vercel Blob
store `AdamSobleClips` (`store_YQCFew9epTIFGESZ`) answers `403 Forbidden` with
the body `Your store is blocked`, because the store's billing state is
Inactive and Vercel has suspended it. No frontend change can make a suspended
store serve bytes; reactivating Blob billing on the account is the fix, and
the URLs then work untouched. Verified by pointing the manifest at a local
file, where the full load-reveal-play path ran correctly end to end.

Playback now opens the frame from a dot at the centre out to full size, then
starts, rather than fading the video in. It is `clip-path: inset()` rather than
a transform scale: scaling makes the browser interpolate the footage up from a
few pixels, which is visibly soft for the first half-second, whereas clipping
leaves every visible pixel at native size. The keyframes hold the dot for the
first 11% of the animation — without that hold an ease-out curve is already
three-quarters open by 160ms and the dot is never actually perceived, so the
effect reads as a pop rather than an expansion. `revealAndPlay()` in
`lib/marketing/video-reveal.ts` is the single implementation, used by the hero,
the reel and the membership sales video, and it starts playback on
`animationend` so the expansion always completes first.

Both server-rendered players catch up on state that predates hydration
(`video.error`, `video.readyState`). Their `<video>` elements ship in the HTML,
so the browser begins fetching before React attaches any listener — an
unreachable file failed before the listener existed, and the card went on
offering a play button that did nothing. This is exactly how the blocked store
managed to look like a silent frontend bug.

The hero serves the compressed encode again (8.6 MB against 35 MB), reversing
DEC-020's preference for the original. That call was made for image quality;
start-up speed now outranks it, and this footage sits behind a heavy scrim at
background scale where the difference does not show.

Ambient loops are all gated on visibility, not just on tab focus:
  - the globe builds nothing until it is within 400px of the viewport. Creating
    the WebGL context and generating the sample map used to happen during page
    load for a section far below the fold. Its sample count is 13k, not 18k.
  - the globe's and the embers' render loops stop when they scroll out of view
    and resume where they left off. Both previously ran for the whole visit.
  - embers are pre-rendered sprites blitted with `drawImage`, not a radial
    gradient built per particle per frame — that was allocating upwards of a
    thousand gradient objects a second — and they paint at 30fps, since a
    particle moving a third of a pixel per frame renders the same picture twice
    at 60.
  - the backdrop is 10 animated leaves rather than 16, and `will-change` is
    gone from them: it promoted every leaf to its own compositor layer for the
    whole visit, and an animating element is promoted while it animates anyway.

The "featured in" marquee is left alone. It animates only `translate3d`, so it
runs on the compositor and costs no main-thread work.

Date:
2026-09-11

Approved by:
Engineering
