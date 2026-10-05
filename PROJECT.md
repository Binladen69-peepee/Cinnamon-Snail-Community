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
| AI cohost | `/admin/cohost`, `/api/jobs/ai-prompts` | BUILD.md §16. Claude writes community prompts from real context — the voice profile, what the room posted, what nobody answered, upcoming events, lessons, the season — in seven types. Six guardrails run before a draft is ever shown. A reviewer approves, edits and approves, regenerates, rejects, snoozes or bulk approves; **nothing publishes without one** (DEC-072). Schedules carry days, per-day time, draft count, lead time, blackout dates and a timezone, and pause themselves when drafts go unreviewed. Published prompts show their replies and reactions. **Idle until `ANTHROPIC_API_KEY` is set** — the queue, approvals and publishing work without it. |
| Automation engine | `/admin/automation`, `/api/jobs/automation` | BUILD.md §15. Fifteen triggers with a real data source, typed conditions, eight actions, and the required controls: dry run with an affected-member preview, pause all, retry, execution history, error state. The fourteen initial rules ship **disabled** — nothing sends until somebody turns one on. Idempotent per member per state (DEC-071). Challenge and recipe-variation triggers are deliberately absent until Phase 4E builds those features. |
| Billing → Kit tags | `lib/billing/kit-tags.ts`, `lib/billing/apply.ts` | The client's confirmed mapping: a **monthly** SamCart subscription gets "Vegan University Monthly", an **annual** one gets "Vegan University Annual". The tag follows the billing interval, not the product, because monthly and annual are separate SamCart products but one membership here. SamCart stays the source of truth — the interval comes from its webhook, falling back to the subscription row and then to the SamCart product's declared interval. A grant adds one plan tag and removes the other, so a switch never leaves a member on both; a cancellation removes both. An unknown interval adds no plan tag rather than guessing (DEC-073). The old `vu-member` / `vu-course` / `vu-bundle` placeholders are retired; the course and bundle have no Kit tag until the client maps one. |
| Kit roadmap sync | `lib/roadmap/kit-sync.ts`, `/api/jobs/kit-roadmap` | BUILD.md Phase 4B. Each member's roadmap goes to Kit as five custom fields (`VU roadmap track`, `status`, `step`, `completed`, `cadence`) plus the track's optional Kit tag (removed on switch or leave) and its completion tag (kept). Only existing *active* Kit subscribers are touched — nobody is created or resubscribed. State-based and idempotent: one `KitRoadmapSync` row per member records what Kit confirmed, and a sync sends only the difference. Runs after the roadmap action; failures retry with backoff from the daily sweep and never affect the roadmap (DEC-070). **Idle until `KIT_API_KEY` and `KIT_API_SECRET` are set** — then run the backfill once. |
| Bulletin extras | not built | BUILD.md §19 items the schema and approvals do not yet allow: a drawn map and Google Places lookup (no approved provider), place photos, place reports, closure checks. |
| Lesson playback | code done, no content | **Zero lessons exist.** `lib/learn/playback`, the signed-token routes and progress tracking are built and unused. Content, not code. |
| Events content | code done, no content | `/calendar` (month + list), RSVP with capacity and waitlist, recurrence, `.ics` and Google Calendar, 24h/1h reminders and recording publishing are all built. The six events in the database are seeded placeholders, all in the past. Real dates are content, not engineering. |
| Email + web push notifications | code done, setup-limited | Built and tested. Email reaches only the Resend account owner until a sending domain is verified (known limit 5). Push needs the VAPID keys in the environment; iPhone/iPad need the site installed to the Home Screen, which waits on the PWA work. The retry sweep cron is refused in production until `CRON_SECRET` is set; until then retries ride on ordinary traffic. Weekly digests are a category with a switch but nothing sends one yet. |
| SSO | not built | BUILD.md §20. Tables exist in the schema; nothing reads them. |
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
3. **Finish the scale list**, items 2–4. `lib/learn/library.ts` is the one
   that will hurt first.
4. **Rate limiting on the real paths** — magic link, password, webhook, upload.
   Requires the Upstash credentials.
5. **A published roadmap track.** The authoring screen is built (`/admin/roadmap`) and the member side has been ready for a while; what is missing is now editorial, not code. Every member-navigation route resolves.
6. **Look at it.** Six pages have shipped without anyone confirming how they
   render signed in, in either theme, at phone width.
