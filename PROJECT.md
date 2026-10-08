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
| Member app | signed in | `/home`, `/spaces`, `/members`, `/messages`, `/learn`, `/compose`, `/notifications`, `/settings`, `/billing` |
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
| Auth | `/login`, `/register`, `/forgot-password`, `/reset-password` | Magic link, password, registration with a strength meter and terms, password reset. JWT sessions with a DB-backed revocation list; signing out, resetting and changing a password all revoke. Rate limits are counted in Postgres. Google/Facebook wired, dormant until credentials exist. |
| Feed | `/home` | Cursor-paginated in SQL across three orders: recent activity, new, top this week. Pinned head, rich composer, drafts and scheduling, reactions with kept tallies, one-level replies. |
| Post detail | `/posts/[id]` | Depth-capped threads, permalinks, comment sort. |
| Spaces | `/spaces`, `/spaces/[slug]` | Five kinds, three visibilities, product-gated access, grouped nav with unread counts. Host settings and an approval queue per space, notification level per member. |
| Explorer | `/home` | The feed, with a Feed / Reels toggle at the top (`?view=reels`). Reels is the feed narrowed to posts carrying a video, one per screen, playing on scroll; still images never appear there. Compact view is a dense list row. Discover was removed; `/search` does its job across everything. |
| Member directory | `/members` | SQL-paginated, facets, five filters. |
| Messages | `/messages` | List-detail, polling delivery, typing, read receipts, groups, images, block/report. |
| Class library | `/learn`, `/learn/[slug]` | 52 classes with real stills and teasers. |
| Composer | `/compose`, `/drafts` | Seven post types, including events and recipes that write a row of their own. Formatting toolbar, mention autocomplete, emoji, GIF search, drafts, scheduling. |
| Search | `/search` | Results behind the command palette, narrowable by kind, URL-driven. Every hit is checked against the live record: posts and comments only from rooms the viewer may enter, hidden members dropped, removed rows skipped. The palette reads through the same loader. |
| Connect | `/connect` | BUILD.md §12: the weekly match (drawn once a week, save / pass / say hello, pause and opt-out), cohorts and recognition. Hidden and blocking members drop out of the match and the recognition list. People suggestions stay on Explorer and the directory. |
| Roadmap | `/roadmap` | BUILD.md §14, member side: answer the four questions, choose a published track (the cook-vibe answer marks the matching one), pace, pause, **skip**, **recipe swap**, restart, switch, leave. Milestones unlock in order; ticking one needs the goal marked done **and** the lesson watched to 80% or a cook post since it opened. A skip settles a milestone without completing it, so it never counts towards anything earned. Gluten free swaps the recipe; primary benefit and suckiest thing supply the framing and the constraint line. |
| Bulletin board | `/bulletin`, `/admin/bulletin` | BUILD.md §19. Happenings: host a gathering, the exact address stored encrypted (AES-GCM) and shown only to the host and approved guests, RSVP requests, approval, capacity, call-off. Member services: one card per member, listed only after staff review, every edit re-reviewed. Places: member-submitted, staff-reviewed, searchable by city, one testimonial per member. Blocks hold across all three. |
| Notifications | `/notifications`, `/settings#notifications`, `/unsubscribe` | In-app inbox with six filters and paging, plus email (Resend) and web push (VAPID, `public/sw.js`). Per-category, per-channel preferences; one-click email unsubscribe. Every trigger goes through `lib/notifications/dispatch.ts`: idempotent per source (`dedupeKey`), skips self and blocked senders, email/push only to active members. Sending is an outbox (`NotificationDelivery`) with claims, backoff retries and a sweep at `/api/jobs/notifications` (DEC-069). Reading is an action, never a render (DEC-028). |
| Admin console | `/admin/*` | Overview, members, moderation, spaces, events, courses, billing, welcome DM. |
| Billing | `/billing`, `/admin/billing` | SamCart webhooks, entitlements, reconciliation, cancellation, deletion. |

### Not Done — and why

| Feature | State | Blocker |
| --- | --- | --- |
| GIF search | code done, no key | `TENOR_API_KEY` is unset, so the picker hides itself rather than offering a search that can never answer. |
| Scheduled posts, to the minute | code done, plan-limited | Vercel Hobby allows one cron run a day, so `vercel.json` asks for 09:00 and a post scheduled for 14:00 waits until the next run. The endpoint is correct and idempotent; a five-minute cadence needs Vercel Pro or any external scheduler calling `/api/jobs/publish-scheduled` with `BILLING_JOB_SECRET`. |
| Roadmap track authoring | `/admin/roadmap` | BUILD.md §14 "Admin authoring", all ten: create tracks, reorder milestones, pick lessons and recipes, a gluten-free variant per milestone, framing and constraint text keyed by the member answers, preview a combination, draft/publish, version, and the per-track numbers. Publishing an empty track is refused and a track members are on cannot be deleted. **No track is published yet** — until one is, members still see the empty state. |
| Recipe variations | `/posts/[id]` (under a recipe), `/admin/variations` | BUILD.md §18. A member's take on someone else's recipe: what changed, why, a photo and optional adjusted ingredients. **Nothing is listed until staff approve it**, and editing an approved one sends it back for review. Vegan validation refuses ingredients with no vegan version before a reviewer ever sees them, and only queries the ones that do have a vegan version rather than blocking the community's own vocabulary (DEC-075). Reactions, staff "featured", and tested-by-N proof — one per member, never your own. Approved variations count toward the Recipe Remixer badge. |
| Challenges | `/challenges`, `/admin/challenges` | BUILD.md §17. Seasonal, opt-in challenges: theme, cover, dates, daily prompts that unlock on their day, an optional dedicated space, cohort scope, a badge and a Kit tag on finishing. **No ranking anywhere** — a member sees their own progress and how many joined, never a position or anyone else's progress (DEC-074). The target sits below the prompt count so missing days is normal; publishing refuses the reverse. Marking a day is idempotent and completion fires once. |
| AI cohost | `/admin/cohost`, `/api/jobs/ai-prompts` | BUILD.md §16. The model (Groq `openai/gpt-oss-120b` when `GROQ_API_KEY` is set, Claude otherwise; DEC-096) writes community prompts from real context — the voice profile, what the room posted, what nobody answered, upcoming events, lessons, the season — in seven types. Six guardrails run before a draft is ever shown. A reviewer approves, edits and approves, regenerates, rejects, snoozes or bulk approves; **nothing publishes without one** (DEC-072). Schedules carry days, per-day time, draft count, lead time, blackout dates and a timezone, and pause themselves when drafts go unreviewed. Published prompts show their replies and reactions. Live since 2026-10-08 with `GROQ_API_KEY` in production; with no model key at all the queue, approvals and publishing still work. |
| Automation engine | `/admin/automation`, `/api/jobs/automation` | BUILD.md §15. Fifteen triggers with a real data source, typed conditions, eight actions, and the required controls: dry run with an affected-member preview, pause all, retry, execution history, error state. The fourteen initial rules ship **disabled** — nothing sends until somebody turns one on. Idempotent per member per state (DEC-071). Challenge and recipe-variation triggers are deliberately absent until Phase 4E builds those features. |
| Billing → Kit tags | `lib/billing/kit-tags.ts`, `lib/billing/apply.ts` | The client's confirmed mapping: a **monthly** SamCart subscription gets "Vegan University Monthly", an **annual** one gets "Vegan University Annual". The tag follows the billing interval, not the product, because monthly and annual are separate SamCart products but one membership here. SamCart stays the source of truth — the interval comes from its webhook, falling back to the subscription row and then to the SamCart product's declared interval. A grant adds one plan tag and removes the other, so a switch never leaves a member on both; a cancellation removes both. An unknown interval adds no plan tag rather than guessing (DEC-073). The old `vu-member` / `vu-course` / `vu-bundle` placeholders are retired; the course and bundle have no Kit tag until the client maps one. |
| Kit roadmap sync | `lib/roadmap/kit-sync.ts`, `/api/jobs/kit-roadmap` | BUILD.md Phase 4B. Each member's roadmap goes to Kit as five custom fields (`VU roadmap track`, `status`, `step`, `completed`, `cadence`) plus the track's optional Kit tag (removed on switch or leave) and its completion tag (kept). Only existing *active* Kit subscribers are touched — nobody is created or resubscribed. State-based and idempotent: one `KitRoadmapSync` row per member records what Kit confirmed, and a sync sends only the difference. Runs after the roadmap action; failures retry with backoff from the daily sweep and never affect the roadmap (DEC-070). **Idle until `KIT_API_KEY` and `KIT_API_SECRET` are set** — then run the backfill once. |
| Bulletin extras | not built | BUILD.md §19 items the schema and approvals do not yet allow: a drawn map and Google Places lookup (no approved provider), place photos, place reports, closure checks. |
| Lesson playback | code done, migration in progress | Production's 52 classes have no lessons yet (read-only check, 2026-10-08). The recordings are moving Drive → Bunny and each class gets its lesson by migration (DEC-090); lessons stay hidden until `BUNNY_STREAM_TOKEN_KEY` is in production (DEC-093). |
| Live classes | code done, plan-limited | `/live-classes` (was `/calendar`): RSVP with capacity and waitlist, recurrence (series edits carry to future dates, DEC-095), `.ics` and Google Calendar, Zoom sync (DEC-079), reminders and recordings. The 1-hour reminder only catches classes starting 08:00–10:00 UTC, because Vercel Hobby runs the job once a day. |
| Email + web push notifications | code done, setup-limited | Built and tested. Email reaches only the Resend account owner until a sending domain is verified (known limit 5). Push needs the VAPID keys in the environment; iPhone/iPad need the site installed to the Home Screen, which waits on the PWA work. Retry sweeps run daily (`CRON_SECRET` is set). The weekly-digest switch is hidden until a job sends digests. |
| SSO | not built | BUILD.md §20. No tables or routes exist; it needs Clean Plate Club's side of the integration. |
| Mighty migration | not started | BUILD.md §21. No member export received. |
| PWA | not started | BUILD.md §22. |

### Verification gate

```
pnpm typecheck     # clean
pnpm lint          # clean
pnpm test          # 465 pass
pnpm build         # prisma migrate deploy && prisma generate && next build
```

Four integration test files (`billing-flow`, `welcome-dm`, `spaces-flow`,
`community-flow`) need the local Postgres on `127.0.0.1:5433`. They target the
local Docker database, never production. `docker compose up -d && pnpm db:seed`
gives them the data they expect; without it they skip rather than fail.

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
app/(auth)          login, register, forgot/reset password, magic-link verify
app/(member)        the signed-in app
app/admin           staff console (own chrome, own scope)
app/api             route handlers: auth, search, media, polling, webhooks, cron

components/ui       shared primitives (wrap HeroUI where it has one)
components/app      member shell: header, rails, tabs
components/feed     posts, composer, comments, uploads
components/admin    console primitives + forms
components/marketing  sales-page pieces

lib/community       feed, directory, match, privacy, reactions
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
| DEC-073 | **The Kit membership tag follows the billing interval, not the product.** Monthly and annual are separate SamCart products but one `Product` row here, so a single `kitTag` could not express the client's mapping; `kitTagMonthly` / `kitTagAnnual` can. Three consequences: a grant removes the opposite plan's tag in the same pass, so an upgrade never leaves somebody tagged both monthly and annual; removals are sent before additions, so there is no window where a member holds both and a sequence meant for the other could catch them; and an interval SamCart did not state applies **no** plan tag, because a member in no sequence is recoverable while a member in the wrong one has already been emailed. The retry job derives what a member should hold from their current entitlements and each one's interval, rather than replaying the request that failed. |
| DEC-037 | **The product is monochrome.** Green and the headline texture are gone from admin, member app and marketing. Amber and red survive because they carry meaning. Supersedes DEC-013. Briefly reversed and then reinstated — see DEC-068. |
| DEC-038 | **Polaris cannot be used.** The React package is deprecated and peer-locked to React 18; the web components require App Bridge inside Shopify Admin. Its button *construction* is reproduced from the shipped stylesheet; colour comes from our tokens. |
| DEC-039 | **The admin console follows the theme.** It keeps its own denser scope but is no longer pinned to dark. |
| DEC-040 | **Rate limits are counted in Postgres**, in one `ON CONFLICT` upsert per check, not in an in-process Map. Serverless gives every instance its own memory, so the old limiter granted its allowance once per instance. It falls back to the in-process window if the database is unreachable: a limiter outage should cost an attacker time, not cost members their sign-in. |
| DEC-041 | **Reset tokens live in their own identifier namespace** (`reset:<email>`) inside the same table as magic-link tokens. A link that proves an address can never be spent as a link that changes the password guarding it. |
| DEC-042 | **Signing out revokes the Session row**, not just the cookie. Resetting a password and setting one from settings revoke every session. A JWT is only as revokable as the row it points at, and dropping the cookie left that row live. |
| DEC-043 | **A taken email is reported plainly at registration** rather than hidden behind a generic "check your inbox". Hiding it would defend against address enumeration, but it also leaves someone who mistypes their address with an email that never arrives and no way to know why. The rate limit is the control that bounds probing. |
| DEC-068 | **The product is monochrome, and the forest was tried and taken back out.** For one day the brand carried a hue (`#1f6b46` light, then a pale `#bfead3` on black). On the dark ground the green had to be pale enough to stay legible, and at that lightness it read as a tint laid over every photograph in the feed. Nothing the hue was doing was not already being done by contrast and type. Reinstates DEC-037 in full: ink on cream in light, white on pure black in dark, amber and red reserved for warning and danger, headline texture still gone. The palette is now guarded in `tests/theme-palette.test.ts` and measured by `npm run check:theme`, neither of which existed when DEC-037 was first written. |
| DEC-044 | **Password rules are one pure module** (`lib/auth/password-policy.ts`), imported by the register form in the browser and by the server before hashing. `password.ts` keeps bcrypt, so no client bundle pulls it in. |
| DEC-045 | **The feed pages in SQL, not in memory.** Visibility is a WHERE clause and the order is an index, so a page costs the same whether the community holds a hundred posts or ten million. The previous shape fetched eighty rows, filtered them for permission and ranked them in JavaScript, which capped the feed at eighty with no way to reach the eighty-first. |
| DEC-046 | **Counts are columns kept in step at write time**, not counted on read. `Post.commentCount`, `Post.reactionCount` and `PostReactionTally` move inside the same transaction as the rows they count. Loading every reaction of every post to draw the reaction bar is fine at four hundred reactions and ruinous at four hundred thousand. |
| DEC-047 | **`Post.lastActivityAt` exists so "recent activity" can be an index.** Deriving it from the newest comment per post is a correlated subquery per row, which cannot be paged with a cursor. |
| DEC-048 | **Replies stop at one level.** `Comment.depth` is 0 or 1, and a reply to a reply attaches to the same parent. Arbitrary nesting is unreadable on a phone and unbounded to render; it was previously capped only in the interface, and inconsistently — four on the detail page, five in the panel. |
| DEC-049 | **Every engagement write checks the space.** Reacting, voting, saving, reporting and poll-voting all go through `requirePostAccess`. Before, only posting and commenting did, so knowing a post id was enough to act on something in a private room. |
| DEC-050 | **A space can be sold with a product.** `Space.productId` plus live entitlements decide entry, above visibility and above membership, so a lapsed payment closes the room without a sweep. Only staff may attach or detach a product: a host must not be able to put their own room behind a paywall. |
| DEC-051 | **Approval is a post status, not a filter.** `PostStatus.PENDING` plus a host queue per space. The `approvalRequired` column existed with nothing reading it, which made the setting a trap: posts would have gone nowhere and been unreachable by anyone. |
| DEC-052 | **Scheduled posts need a runner**, so `/api/jobs/publish-scheduled` claims each due post with a conditional update and Vercel Cron calls it every five minutes. Scheduling without a publisher is a post that never appears. |
| DEC-053 | **Community mutations are rate limited per member** (`lib/community/rate-limits.ts`), on the durable Postgres limiter. The numbers sit far above what a person does by hand: the point is to bound one account's damage in a minute, not to police behaviour. |
| DEC-056 | **`--paper` inverts.** It was `#ffffff` in both modes, which is why four components rendered white on white and three of them carried hand-written `dark:` patches. `text-paper` means "ink on a dark fill", and in dark mode the dark fill is white. |
| DEC-057 | **`surface-muted` and the field colours are generated.** Thirty-seven call sites asked for utilities that `@theme inline` never emitted, so hover states did nothing and every input fell back to the browser's own field colour. |
| DEC-058 | **`.prose-vu` exists and wraps.** Four components render member markdown through it and it had never been defined: no styling at all, and nothing to stop a pasted URL widening a card past the phone reading it. |
| DEC-059 | **Every responsive grid declares a base column.** A grid with no `grid-template-columns` gets one implicit `auto` column, and `auto` is content-sized — one long member name and the page scrolled sideways. |
| DEC-060 | **The theme control lives in the navbar.** As a floating button it sat on top of the post action bar at 320px and was the only chrome that moved with the page. |
| DEC-061 | **A phone shows media in place, never in a lightbox.** An overlay covers the post it belongs to and costs a second gesture to leave. One image is an image, several are a swipeable strip, and video plays inline at every width. |
| DEC-062 | **The hero headline is set in a brush script** (Oleo Script Swash Caps, loaded as `--font-brush` at its bold cut) and arrives one word at a time. The words are the client's and stay verbatim; the h1 carries the whole sentence as its label so assistive technology reads one sentence, not forty fragments. |
| DEC-063 | **The landing page draws no decorative SVG.** The site-wide leaf backdrop, the section leaves and the painted globe are gone. The globe alone was four hundred lines of SVG whose postcards overlapped at phone widths; four real class stills say the same thing. Interface icons stay. |
| DEC-064 | **Permanently dark surfaces are built from literals.** The Kitchen Table panel is dark in both themes, so its ink is `#ffffff` in both; the Senja chip is white in both because the widget draws dark type we do not control. Built from tokens, both inverted out of existence in one mode. |
| DEC-065 | **The sticky checkout bar watches the hero itself**, not a sentinel below it. A sentinel below the fold is "not intersecting" at the top of the page, so the bar showed immediately, on top of the button it duplicates. |
| DEC-066 | **The marketing bar carries the theme control and not the messages icon.** Light and dark is a visitor's choice and belongs where the other controls are; messages belongs to the member app, which reaches it from the sidebar and the tab bar. |
| DEC-096 | **The AI cohost writes through Groq when its key is set, Claude otherwise.** `lib/ai/generate.ts` picks the provider from the environment (`GROQ_API_KEY` first, then `ANTHROPIC_API_KEY`; `cohostProvider()`), so the cohost runs on the key the client has. Groq is called on its OpenAI-compatible chat API with `openai/gpt-oss-120b` (override with `GROQ_MODEL`) in strict JSON-schema mode, the schema generated from the same zod definition the answer is then parsed against, so both providers return the same three fields and go through the same six guardrails into the same review queue; nothing publishes without approval (DEC-072). A rejected key is reported as not retryable, a rate limit or a 5xx as retryable, and the key is never echoed. Verified live on 2026-10-08: two drafts through the real path (context, Groq, guardrails, queue) in under six seconds. |
| DEC-095 | **Editing a class series carries onto the dates already on the calendar.** `materialiseRecurringEvents` writes each date of a series as a real row up to 120 days ahead, so an edit to the head used to reach none of them: a canceled series kept its dates and their reminders. Now only a PUBLISHED head grows (a canceled or draft one makes no new dates), and saving a head runs `carrySeriesEdit` (`lib/events/series.ts`): canceling it, or turning off its repeat, cancels every future published date and tells their RSVPs; an earlier end date cancels the dates past it; and a changed title, description, link, location, capacity, cover, host or room reaches each future date that still had the old value, so a date staff changed on its own keeps its change. A change of time is not carried: dates keep the time they were announced with. |
| DEC-094 | **Response headers: no sniffing, a quiet referrer, no device permissions, and no framing outside the public pages.** `next.config.ts` sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `Permissions-Policy: camera=(), microphone=(), geolocation=()` everywhere, and `X-Frame-Options: SAMEORIGIN` plus `frame-ancestors 'self'` on everything except `/` and the public marketing pages (which the client's own site may embed). A signed-in page in a stranger's frame is how a cancel or delete button gets clicked by trickery. There is deliberately no full Content-Security-Policy yet: the Bunny player, PostHog, Sentry and the video embeds each need their sources listed and tested before one can be enforced. |
| DEC-093 | **What a class gives a member stays with members.** A class's downloads (many are plain Google Drive links) render only for an entitled viewer; others see how many come with membership. A recording that is a raw link (a Zoom share page, a Drive file) follows the rule the live link does: members, staff and the host; a recording that became a lesson or a post is gated where it lives. A lesson whose only video is on Bunny counts as playable only while a Bunny link can actually be signed (`bunnyPlaybackReady`), so lessons attached before `BUNNY_STREAM_TOKEN_KEY` reaches production show "on its way" rather than "Start the class" and a player with nothing in it. Staff open every lesson on a class page, as the player already let them. |
| DEC-092 | **Deleting an account purges the person, daily.** `?job=purge` was never scheduled, so accounts past their grace period were never purged although the deletion email promises it. It now runs at 06:30 UTC, and a purge removes what identifies or locates the person in one transaction: the account's addresses (which also frees them to register again), password, sessions, push devices, linked sign-ins, and the profile's own words, place, links and survey answers; the profile reads "Deleted member" and leaves the directory. The account row stays so posts keep an author. |
| DEC-091 | **An email address joins an account only once its owner proves it.** A purchase made before the buyer has an account waits on their address (PendingGrant), and a verified address signs in by magic link, so an address is the key to whatever was bought under it. Two paths handed that key to whoever typed the address first: "Add email" in settings marked an address verified whenever a purchase was waiting on it, and a password registration claimed purchases on its unproven sign-in address. Now adding an address stores it unverified and mails it a one-time link (`lib/auth/email-confirmation.ts`, tokens under their own `email-confirm:` identifier so they can never be spent as magic links); the link confirms only for the account that asked, signed in, by a button press, and only then is the address verified and its purchase claimed. Account setup claims purchases only for proven addresses (a magic link, Google, or a confirmed link), and a magic link marks its address proven before setup runs so a buyer's first sign-in still collects their purchase. Registering, or opening a magic link, releases other accounts' unproven claims on the address so a stranger cannot lock its owner out. |
| DEC-090 | **The class recordings move from Google Drive to Bunny Stream, and each class gets its video lesson through a migration.** The masters are in Adam's Drive (`Cooking Classes`), mapped one recommended file per class in `docs/migration/class-video-mapping.mjs` (the edited Final, else the compressed copy of an oversized master, else the live recording), with the client's choices for the ambiguous ones in `approved-selections.json`; #22 Southern BBQ Class Pack and #29 Christmas Bundle get one video and one lesson per recording. `scripts/drive-to-bunny.mjs` asks Bunny's fetch API to download each file from the Drive API with a read-only Google token (the token comes from an rclone remote authorised once in the browser with scope `drive.readonly`; no Google Cloud client is needed), so nothing passes through our machines, Drive is never written, and `docs/migration/bunny-ledger.json` keeps class → Drive file id → Bunny video id with Drive's size and duration and Bunny's length, resolution and a signed-playback result. Production had the 52 class courses with no sections or lessons (read-only check, 2026-10-08), so `scripts/bunny-lessons-migration.mjs` turns verified videos into a Prisma migration that adds a "Class recording" section and a published VIDEO lesson per video, or sets only `bunnyVideoId` on a video lesson staff made by hand; course rows are never touched and re-running it is a no-op. Lessons reach production with the next deploy, not by writing to the production database. "The Perfect Vegan Brunch Cooking Class" has no course in production, so its video waits in Bunny unattached. |
| DEC-089 | **The landing page says what the membership is, in order, and moves.** After the hero it now runs: what's inside, how it works, the Kitchen Table, Adam, the classes, the community, the price, the questions. "What's inside" is a bento of the five parts with their signed-off descriptions (it replaces a row of chips that only named them): live cook-alongs on a class photo with a breathing Live light, the library with its count and the classes' own stills drifting past, Kitchen Table with two of its own lines as chat bubbles, the 1000+ recipe testers counted up, and the done-for-you menus with the class for each occasion the copy names. "How it works" sets Learn, Cook, Belong as three numbered steps joined by a line that draws itself, replacing three full-width photo spreads (about 1,400px down to 900). The Kitchen Table panel is tighter, with three phrases from its own copy floating over the photograph, and the community section loses its generic values row and counts its figures up. Motion lives in `components/marketing/motion.tsx` (rise out of a blur, staggered groups, count-ups, drawn lines; each plays once) and a few CSS effects; nothing moves with reduced motion. Copy stays verbatim; only the section labels and one line under the bento heading are new. |
| DEC-088 | **The admin console follows the client's reference (the "FlowMail" dashboard), in the palette's colours.** The rail is light: it sits on the page's own ground, the brand on a filled tile with a collapse control beside it, sections as icon rows where the open one is a raised white pill with a brand icon, and the signed-in person at the foot with a menu (account settings, sign out). It collapses to its icons; the state is the `vu-admin-rail` cookie, so the server renders the right width, and CSS keyed on `data-rail` hides the labels, so the toggled and rendered rails are the same markup. The top bar carries the section's name, a pill search (still a GET to `/admin/members?q=`), the moderation bell and a gradient AI button that opens the AI cohost; its gradient runs from the palette's wash into a quarter of its brand, so the label clears 4.5:1 in every palette and mode (Mulberry dark is the tightest, at 4.9:1). The dashboard keeps its rule that every figure is counted from real rows and is laid out like the reference: a welcome line with Schedule a class and Create a post; four headline cards (total, new, active and paying members) with trend pills; community activity over the window (one measure at a time, picked from pills where the reference has its legend, because several palettes' brand colours are too quiet to tell three lines apart and the measures differ in size; the tooltip reads all three by name), how live memberships were granted as a ring, and the top classes with completion bars; member growth by month with the current month highlighted, the live classes table with status pills, and insights worked out from the page's own figures (the next class, memberships set not to renew, the busiest posting day, the most-loved post) with a button to the AI cohost; then new members, most-loved posts and system health. Anything needing a person sits in a strip above the figures. |
| DEC-087 | **The client's WordPress photos are served from this site.** `cinnamonsnail.com/wp-content/uploads` answers every request from another site with `Cross-Origin-Resource-Policy: same-origin` behind a Cloudflare challenge, so browsers blocked each class still and sales-page photo (`ERR_BLOCKED_BY_RESPONSE`) and the class library rendered as empty frames. WordPress's image CDN (`i0.wp.com`) can fetch the files, but a browser asking it for a page's worth at once lost about half of them (`ERR_BLOCKED_BY_ORB`, every time, on a warm cache too), so it cannot serve pages either. `scripts/mirror-wp-images.mjs` copies every upload the site references (the class sheet, the sales-page slots, the seeded course covers and demo posts: 67 photos) through that CDN, one at a time, into `public/media/wp` as WebP with camera metadata stripped, in two sizes (800px for tiles, cards and thumbnails; 1600px, 2000px for the hero), and lists them in `lib/media/wp-mirror.json`. `servableImageUrl()` (`lib/media/servable-image.ts`) maps an upload URL to its copy, by the width it is drawn at; an upload not in the mirror (a cover typed into admin, an old post) goes to `/api/wp-media/…`, which fetches that one file server-side from the CDN (fixed host, checked path), retries, and answers with long cache headers. Data keeps the original URLs; the mapping happens where an image is drawn: the shared photo frame, the hero, class tiles and players, admin course cards, feed media and posters, event and challenge covers, avatars, search and link previews. A new photo on the sales pages or in the class sheet needs the script run once and the copies committed. |
| DEC-086 | **The site sells the live membership checkout.** The "Become a member" button opens SamCart product 849150, the paid monthly membership, whose checkout also offers 849151, the annual one. While the membership was being tested it opened 1069354, a "1 Month FREE" version. Migration `20261007130000_live_membership_products` maps 849150 (month) and 849151 (year) to the membership product, alongside the free-month pair, so a purchase through either checkout grants access and the Kit tag; the free-month mappings stay so members who joined through them keep theirs. |
| DEC-085 | **A member's cancellation stops the renewal, not the membership.** Cancelling from the billing page asks SamCart to cancel at the end of the current billing period (`POST /subscriptions/{id}/scheduleCancel`, `cancel_when: "end"`), never the immediate cancel. The subscription becomes CANCELING with SamCart's `cancel_schedule.cancel_date` as its end, and the entitlement carries that end date, so the member keeps everything they paid for, Kit tag included, and access stops at that moment on its own. If SamCart already had a cancellation scheduled, that date stands; a delinquent or paused subscription, with no paid period left, is canceled outright; a scheduled cancellation with no date SamCart would give keeps access rather than cutting it short. Once the date has passed, the nightly sweep (`expireEndedAccess`, run at the start of the billing reconciliation and by hand at `/api/jobs/billing?job=expire`) marks the entitlement EXPIRED, the subscription CANCELED, and removes the membership's Kit tags unless another membership the member still holds carries them; for a cancellation whose date is unknown or passed with access still open it asks SamCart and records what SamCart says. SamCart's own cancellation webhook at the period end closes the same things. An end date can no longer reopen access a refund or delinquency closed, setting an end date no longer touches Kit (the tags come off when access actually ends), and the reconciliation no longer re-grants access to a cancellation whose period is over. Closing the account still cancels at once. |
| DEC-084 | **Royal Blue, from the client's reference, is the default palette, and the chosen palette applies to the whole site.** The landing and marketing pages, the sign-in pages, the member app and the admin console all paint from one palette at a time: the default (Royal Blue: navy `#0b1544`, royal blue `#1d63f0`, soft blue `#7ea4f4`, pale blue `#e8f0fe`, read off the client's reference) with no attribute, or the member's choice from the Theme dialog via `data-accent` on `<html>`, which the boot script sets before first paint on every page. Mulberry (DEC-082's default) is now one of the choices, with its hand-tuned values kept exactly in `palettes.json`. `scripts/theme-accents.mjs` writes the default's roles into marked `theme-default:*` regions inside the base blocks (site and app, light and dark, and the bands) and every other palette under its `data-accent`, the site's in the theme layer so the app's unlayered blocks still win inside the app. The marketing site takes the app's grounds: a cool off-white (`#f5f7fa` page, `#fcfdfe` cards, never pure white) in light and black in dark. Light-mode fills are derived so a white label clears 4.5:1 even under the primary button's sheen (Royal Blue's fill is `#1b5de3`, a shade under the reference's). `npm run check:theme` holds 780 pairs: every palette, both modes, the site, the app and the bands. |
| DEC-083 | **Every table has row-level security, and Supabase's API roles have no access to the app's data.** Supabase serves the `public` schema through its Data API (REST and GraphQL) to anyone holding the project's anon key, which is public by design, and grants `anon` and `authenticated` every privilege on each table a migration creates. Until 2026-10-07 all 96 tables had RLS off and were readable and writable that way (members, sessions, OAuth accounts, messages, billing). The app never uses the Data API for tables; it reads and writes through Prisma as `postgres`, the tables' owner, which also has BYPASSRLS. So migration `20261007120000_enable_rls_public` enables RLS on all 96 tables with no policies (nothing in `public` is meant to be read through the API; public pages are rendered by the app), revokes the two API roles' table and sequence privileges, and revokes them by default for future tables. `service_role` (secret, server-side) and Storage (its own schema; the public video bucket stays public) are unchanged. `tests/rls.test.ts` fails if a migration creates a table without `ENABLE ROW LEVEL SECURITY`, and checks the migrated database has no table without it. If a table ever must be served through the Data API, it gets explicit grants and a policy in its own migration. |
| DEC-082 | **Members choose the app's palette; light is off-white, dark is black, and the parts are Aceternity's.** Mulberry (the plum the app and the public site share since 2026-10-06, replacing DEC-077's teal) is the default. A Theme button at the foot of the member and console rails opens a centred dialog where a member picks a palette (Mulberry, Charcoal Rose, Dusk Lavender, Slate Blue, Midnight Cream: four colours each, darkest to lightest, in `lib/theme/palettes.json`) and a mode (light / dark / system, through next-themes). The choice applies at once, is kept in this browser (`localStorage` `vu-accent`, `data-accent` on `<html>`), and an inline script sets it before first paint so the default never flashes. `scripts/theme-accents.mjs` derives each palette's brand roles, rail and band tokens for both modes from its four colours (darkest is the rail, a middle colour carries action, the lightest is the tint chips and the active row sit on), nudges anything below WCAG until it clears, and writes them between the `theme-accents` markers in `globals.css`; `npm run check:theme` holds every pair in every palette and mode, and a test fails if the CSS drifts from the JSON. The grounds carry no hue: light is `#f7f7f5` with `#fdfdfc` cards (white, never pure white) and dark is `#000000` with each surface a step lighter. The public site and the sign-in pages are unaffected; the attribute only has effect inside the app. The dialog and the app's shared parts are adapted from Aceternity UI on the app's tokens: the animated modal (with a focus trap, Escape and focus return added), animated accordions and radio pills, the glowing effect, the pointer-following input glow, the animated dropdown menus, and primary buttons in the style of the client's "Get Started" sample (a gradient fill, a darker edge, a soft halo). |
| DEC-081 | **Course video plays from Bunny Stream through a player link minted per member, and nowhere else.** A lesson stores its Bunny video GUID (`Lesson.bunnyVideoId`, plus a cache of Bunny's status and length for staff screens); when set it takes precedence over the older `videoUid`, which is kept so lessons move one at a time and can move back. `/api/learn/playback/[lessonId]` is the only place a Bunny link is produced, and only after the same sign-in, rate limit and lesson gate as before; it returns the Bunny embed URL signed with the library's token key (`sha256(tokenKey + videoId + expires)`, four hours), never an MP4 or HLS address. Without `BUNNY_STREAM_TOKEN_KEY` production mints nothing (fail closed); `BUNNY_STREAM_ALLOW_UNSIGNED=1` exists for local testing only and is ignored on Vercel production. Progress and resume work through Bunny's Player.js postMessage interface (messages believed only from `iframe.mediadelivery.net` and only from that iframe) feeding the existing progress route. Staff upload straight from the browser to Bunny over TUS with a one-video signature, so the API key never leaves the server; saving a lesson re-checks the id against the library. Downloads and PDFs stay on Google Drive. Existing videos move with `scripts/bunny-migrate.mts` (dry run by default, upload, then attach only once encoded). |
| DEC-080 | **Roadmap pacing is the member's, in weeks per topic, and progress is never reset by it.** The roadmap page explains its personalisation in one sentence built from the member's existing onboarding answers (skill, gluten-free, primary benefit), with a plain fallback when they never answered, and replaces the question/checkbox form with a 1–4 weeks-per-topic control. One topic is current at a time: the first milestone not completed or skipped. `MemberRoadmap.weeksPerTopic` sets how long it is planned to stay current, and `topicStartedAt` is when it became current (reset on completing or skipping a topic, untouched by a pace change). The current topic is what the platform features (the Kitchen Table rail). `lib/roadmap/pacing.ts` also maps pace to the future weekly-email cadence and Kit sequence key; nothing sends it yet. The Kit roadmap sync (DEC-070) keeps working on track, milestone and status. |
| DEC-079 | **Live classes come from Zoom, and Zoom owns only what it knows.** Events are renamed Live Classes everywhere members see them (`/live-classes`; `/calendar` redirects). A daily job (`/api/jobs/zoom-sync`; the Hobby plan refuses crons that run more often), a refresh after the response when a member opens Live Classes and the last full run is over an hour old (one per hour across instances, claimed in the database), the admin's "Sync from Zoom now", and an optional signed webhook read the configured Zoom users' upcoming meetings, keep those whose topic contains "LIVE CLASS", and upsert one Event per meeting occurrence keyed by `zoomKey`. Zoom owns title, start, duration, timezone, join link and agenda on those rows; staff-written fields (cover, host member, recording, capacity) are never overwritten. A meeting that disappears is canceled only after Zoom confirms it is gone (404), never deleted, so RSVPs survive. Credentials are server-side env vars; the join link is shown only to members entitled to the class. Without credentials the sync records that Zoom is not configured and staff add classes by hand as before. |
| DEC-078 | **Kitchen Table is the community; generic spaces are retired from the interface, not from the database.** `Space` stays as the container posts live in (moderation, notifications and search hang off it), but members no longer see a list of spaces. The Kitchen Table feed reads every general room (FEED/MEMBERS/CHAT kinds, not private, not product-locked), so posts in retired rooms stay visible rather than vanishing, and new posts are written to the Kitchen Table. Course rooms, event rooms and private rooms are excluded: courses are a library, not a forum, and are organised by many-to-many `CourseCategory` (backfilled from each class's old single category). Ideas & Requests is a second space holding IDEA posts (votes through `Vote`, one per member, status on `IdeaDetails`). A Bulletin Board item is backed by one BULLETIN post in the Kitchen Table, so its reactions and comments exist once and show in both places. "Save" became "Pin this post": the same `Bookmark` rows, so every earlier save is now a pin, pinned posts lead the member's own Kitchen Table, and post sharing is gone. Cohorts became **Crews**: automatic crews are only the SamCart-start-season cohort ("Fall 2025 cohort", from the original SamCart start date, never the migration date), the member's roadmap track, and the three RightMessage traits read from Kit (Gluten-Free Gang, Advanced Cooking Crew, Nooch Newbies); WFPB Posse, Animal Rights Activists and On The Road to Vegan are opt-in only. Each crew has a group chat. The traits come from the client's own Kit fields: `gluten_free` answered yes → Gluten-Free Gang; `rm_audience_segment` (else `audience_segment`) "advanced" / "new" → Advanced Cooking Crew / Nooch Newbies; `KIT_SURVEY_FIELDS` overrides a trait if the fields change. The daily job reads about 45 members a run (Kit allows 120 requests a minute), so a member whose answers were never read gets them read when they arrive, after the response: at most once an hour per member and 30 a minute overall, and the recompute is scoped to that member. Old `Cohort` rows are kept and no longer shown. Moderation stands across all of it: IDEA and BULLETIN posts are edited and removed only through `lib/ideas` and `lib/bulletin` (the generic post paths refuse them), a Bulletin Board post is only ever marked REMOVED (never deleted, which would unlink and relist its item), and a post a host removed or hid can be neither republished nor destroyed by its author. |
| DEC-077 | **Teal replaces the forest palette in the app, and there is no yellow.** The client's reference set the signed-in identity: teal `#0F746F` for action and for the major areas, an off-white `#FAFAF7` page, white cards and `#171717` ink. A yellow accent was tried and taken back out at the client's request, and forest, sage and terracotta are gone from the app entirely; a test fails if any of them comes back. Teal carries the areas, not just the buttons: both rails are teal bands, the profile has a teal cover, and a section's front page (the console overview, the class catalogue) opens on a teal hero. Inside a band the roles are re-pointed (`.vu-band`, `.vu-app-sidebar`, `.vu-admin-rail`), so ordinary utilities read on teal, and white becomes the accent there (the primary button and the counts are white with teal text); no component needs to know it sits on colour. Counts and "new" marks are teal elsewhere. Dark mode keeps the identity: a teal-black ground, deep-teal rails, and a true teal fill with a white label. Brand text lifts to `#5FD0C7` there, because `#0F746F` is too dim as text on a dark ground. Cards are soft (20px corners, a faint edge, a wide soft shadow) and page titles are bold. The marketing and sign-in pages are untouched, as DEC-076 set out. |
| DEC-076 | **Signed-in pages have their own palette and their own parts; the public site does not change.** The member app and the admin console take the client's forest palette (warm `#F7F5EF` ground and white surfaces in light, forest-black `#0D1512` and `#14201B` in dark; forest action, sage tint, terracotta highlight), declared once in the "App design system" section at the end of `globals.css` on `:root:has([data-app-shell], .vu-admin)`. The marketing and sign-in pages keep the monochrome tokens above it, byte for byte. The roles sit on `<html>` rather than on the app roots because HeroUI derives its hover and field tones there and toasts portal to `<body>`. Dark mode is designed, not inverted: forest is 2.3:1 on the dark ground, so dark fills with a lifted forest `#2E7A5D` and writes brand text in sage. Two briefed values were adjusted for contrast and nothing else: muted text is `#646E68` (the briefed `#6B756F` is 4.38:1 on the ground), and terracotta text uses `#A9502F` (the briefed `#D47755` is 3.2:1 on white, so it stays a fill and a mark). The parts live in `components/app/ui.tsx`; `components/admin/ui.tsx` is a thin set of names over them, so member and console change together. `npm run check:theme` holds every pair. |
| DEC-075 | **Vegan validation blocks only what has no vegan version.** A variation naming parmesan, fish sauce or gelatin is refused before a moderator sees it, because there is no vegan version to have meant. A variation naming butter, cheese or milk is *not* refused: those are the community's everyday words for the vegan article, and blocking them would reject the normal vocabulary. Those get a non-blocking note asking the member to write "vegan butter", shown to the reviewer rather than to nobody. The check never approves — a human still reads every variation — it only decides what is worth sending back immediately. Same two-list reasoning as the cohost guardrails (DEC-072). |
| DEC-074 | **Challenges have no ranking, and the target is deliberately below the number of prompts.** BUILD.md §17 asks for "no ranking", which is a property of the code rather than a missing screen: nothing computes a standing, and `loadChallenge` returns only the asking member's own progress alongside a join count. The low-pressure part is the target — eight of fourteen prompts finishes it — so missing days is the expected case rather than failure, and publishing refuses a target above the prompt count because that would be a challenge nobody could finish. Marking a day is idempotent (a unique entry per member per prompt), and completion is claimed with a guarded update so the badge and Kit tag fire exactly once. Undoing a day lowers progress but never revokes a finish already earned. |
| DEC-072 | **The cohost cannot publish; only a reviewer can.** Generation writes a draft, and the publish job reads `status: "approved"`, which only `approveDraft` sets — so there is no path from the model to a member's feed that does not pass a person, which is BUILD.md §16's "no auto-publish mode in v1". Two consequences worth keeping: a reviewer's own edit is re-checked against the guardrails, because a health claim reaching members is the same harm whoever typed it; and the guardrails treat words with a vegan version (cheese, butter) differently from those without (parmesan, fish sauce) — flagging the first group's bare mention would fire on the community's ordinary vocabulary, so only approving framing counts there. |
| DEC-071 | **Automation rules act on state, not events.** Each trigger asks who matches *now* and hands back a dedupe key derived from the state that made them match; `RuleExecution` is unique on `(ruleId, dedupeKey)`, and the row is claimed **before** any action runs. So the job is safe to re-run, has no event backlog to replay, nudges a quiet member once rather than nightly, and nudges them again if they return and lapse — because the key contains their last-activity date. The key is composed with the member id in one place (`executionKey`), since a state like "quiet since the 12th" is shared by many members and an un-namespaced key silently skips all but the first. A crash mid-action leaves the key spent: for something that emails members, "possibly not sent" beats "possibly sent twice", and retry is explicit. |
| DEC-070 | **Roadmap state reaches Kit as state, never as events.** A member's Kit fields and tags are derived from the database at sync time and diffed against what Kit last confirmed (`KitRoadmapSync.applied`), each part recorded as Kit accepts it. Retries therefore resend nothing that landed, and a missed or reordered event cannot leave Kit wrong. Only active subscribers are synced (a tag call can subscribe an address, which would override an opt-out), SamCart stays the sole access authority, and the sync runs after the response so Kit can never fail a roadmap action. |
| DEC-069 | **Notifications are an outbox, not a send.** The request writes the notification and one `NotificationDelivery` row per channel in one transaction; sending happens after the response and again from a sweep. Each row is claimed (PENDING→SENDING) before it is sent, so overlapping workers cannot double-send; transient failures back off up to five attempts, permanent ones stop at once, and preferences are re-read at send time. A unique `(userId, dedupeKey)` makes every trigger idempotent. DM text never leaves the inbox: email and push say who wrote, not what. |
| DEC-067 | **The hero is exactly one screen on a phone.** Its top margin cancels the bar's height in flow, so the section starts at zero and its height is the height you see; adding the bar's height back on top pushed the last card 72px under the fold. The testimonial chip is hidden below `sm` by a wrapper, because `.vu-hero-proof` sets its own `display` later in the stylesheet and beats a `hidden` utility at equal specificity. |
| DEC-055 | **An event post writes an Event and a recipe post writes a Recipe**, and the post points at it. Both enum values existed with no authoring path, so a RECIPE post would have been a plain post wearing a label. The event joins its space's calendar as well as the feed, which is why it is created with a `spaceId` rather than standing alone. |
| DEC-054 | **Notifications are written in one place** (`lib/notifications/community.ts`) and in bulk. Fan-out to a space reads preferences in one query, inserts in one statement and is capped, so a space that becomes popular does not turn one post into a thousand round trips. |

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

1. ~~**`totalUnreadForUser` is N+1.**~~ Fixed: one SQL join, memoised per
   request, so the layout and the header no longer each pay for it.
2. **In-memory filtering remains in `lib/learn/library.ts` and
   `lib/messages/start.ts`.** Each loads a whole table before filtering. Fine
   at 52 classes and 14 members; not at scale. (`discover.ts`, which was the
   worst of them — it loaded courses, spaces, profiles and follows
   on every keystroke — is gone.) The feed, the member directory and the space rail no
   longer do this.
3. **Interests are a JSON column.** They cannot be indexed, aggregated or
   filtered in SQL, so the directory's interest filter runs over the page and
   its facet list is empty. A tag table is the fix.
4. **Comment pages are capped rather than endless.** A post's roots page with a
   cursor and each root carries up to twenty replies. Past that, the
   twenty-first reply to a single comment is not reachable. Rare enough to
   leave, real enough to write down.
5. **Email delivery is capped.** Resend still sends from `onboarding@resend.dev`,
   which only delivers to the account owner until a domain is verified (DEC-035).
   Sign-in links, reset links and confirmations all ride on it, so nobody else
   can complete an email-based flow until that domain exists.
6. **No caching anywhere.** Every member page is `force-dynamic` and hits the
   database. No `unstable_cache`, no ISR, no Redis.
7. ~~**Images bypass the optimizer.**~~ Class photos are mirrored as WebP in
   `public/media/wp` with an 800px variant (DEC-087).
8. **Observability is thin.** Sentry and PostHog are live in production, but
   most caught errors in billing, webhooks, jobs and auth only `console.error`,
   so they never become Sentry issues; `SENTRY_AUTH_TOKEN` is not set, so stack
   traces stay minified; and PostHog captures 8 events where BUILD.md §32 asks
   for about 18 kinds of activity.
9. **`.env` carries two `DATABASE_URL` lines.** Last wins for Next and Prisma
   (production), first wins for the test runner (local Docker). It works by
   accident, not design.

---

## 7. Next steps

In the order I would take them (audit of 2026-10-08).

1. **Finish the class migration** (DEC-090): Bunny token key into `.env` and
   Vercel, the Drive sign-in as adam@cinnamonsnail.com, then the batches and
   the lessons migration. The Perfect Vegan Brunch has no course in production.
2. **Decide who the community is for.** Any registered account, paid or not,
   can use the Kitchen Table, messages, the directory, the Bulletin Board and
   Crews, and can read lesson discussion threads; only classes and live-class
   links check membership. That may be intended (a free tier) or not: it is
   the client's call, and gating it is a small change once decided.
   Also where **Challenges** belongs: it has no place in the member menu (the
   menu is the client's list), so a member reaches it only from the
   "you finished" notification.
3. **Counsel-reviewed Terms and Privacy.** Both pages are placeholders on a
   site that takes payment, and Privacy names none of the processors (SamCart,
   Kit, Resend, PostHog, Sentry, Bunny, Supabase).
4. **A five-minute scheduler** (Vercel Pro or an external cron hitting
   `/api/jobs/*` with the secret): scheduled posts, the 1-hour class reminder
   and the welcome DM all depend on it.
5. **Member controls that exist only as server actions**: editing a post or
   draft, deleting, reacting to and reporting a comment.
6. **Admin gaps** (BUILD.md §25): automation admin tasks are written but never
   shown; manual access can be granted but not revoked; cancellation reasons,
   failed payments and reconciliation findings are counts, not lists; AI
   cohost voice and schedules cannot be edited; the member list filters in
   memory.
7. **PWA and SEO** (BUILD.md §22, §26): no manifest, install prompt or offline
   shell; no sitemap or OpenGraph images.
8. **A published roadmap track** — editorial, not code.
