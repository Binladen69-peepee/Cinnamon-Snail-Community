# Project Map

Index of every source file in this repo with a one-line description of what it
holds. Read this first when a change is needed, to find the files to open
instead of searching the tree.

**Stack:** Next.js 16 (App Router, RSC + server actions) · React 19 · TypeScript ·
Prisma 6 / PostgreSQL · NextAuth 5 (beta) · Tailwind 4 + HeroUI · Supabase Storage ·
SamCart billing · Vitest · pnpm.

**Product:** "Vegan University" — a self-hosted replacement for a Mighty Networks
community: a public marketing/sales site, a signed-in member app (feed, spaces,
profiles, messages, courses), and an admin area for billing and moderation.

---

## Root config & docs

| Path | What it is |
| --- | --- |
| [package.json](package.json) | Scripts (`dev`, `build`, `test`, `db:*`), dependencies, pnpm version. |
| [tsconfig.json](tsconfig.json) | TypeScript config; `@/*` path alias maps to the repo root. |
| [next.config.ts](next.config.ts) | Next.js config. |
| [postcss.config.mjs](postcss.config.mjs) | PostCSS wiring for Tailwind 4. |
| [eslint.config.mjs](eslint.config.mjs) | ESLint flat config (`eslint-config-next`). |
| [vitest.config.ts](vitest.config.ts) | Vitest config — alias, `setup-env`, `server-only` stub. |
| [vercel.json](vercel.json) | Vercel deployment settings (cron/jobs, regions). |
| [.vercelignore](.vercelignore) | Files excluded from the Vercel upload. |
| [docker-compose.yml](docker-compose.yml) | Local Postgres for development. |
| [.env.example](.env.example) | Every environment variable the app reads, with notes. |
| [pnpm-workspace.yaml](pnpm-workspace.yaml) | pnpm workspace definition. |
| [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) | Agent instructions (CLAUDE.md just imports AGENTS.md). |
| [README.md](README.md) | Setup, local dev, deployment overview. |
| [BUILD.md](BUILD.md) | The full product/build specification — the source of truth for features. |
| [DECISIONS.md](DECISIONS.md) | Numbered decision log (DEC-xxx) referenced from code comments. |
| [proxy.ts](proxy.ts) | Edge middleware: redirects unauthenticated visitors away from member routes. |
| [auth.ts](auth.ts) | NextAuth setup — credentials + magic-link providers, session callbacks, `revokeSession`. |
| [types/next-auth.d.ts](types/next-auth.d.ts) | Module augmentation adding `id`, `handle`, `roles` to the session user. |

## `app/` — routes

### Shell

| Path | What it is |
| --- | --- |
| [app/layout.tsx](app/layout.tsx) | Root layout: fonts, global metadata, `Providers`. |
| [app/providers.tsx](app/providers.tsx) | Client providers — `next-themes` and HeroUI. |
| [app/globals.css](app/globals.css) | Tailwind entry, brand CSS variables, animation keyframes. |
| [app/robots.ts](app/robots.ts) | robots.txt generation. |
| [app/favicon.ico](app/favicon.ico) | Site favicon. |

### `app/(auth)` — sign-in

| Path | What it is |
| --- | --- |
| [app/(auth)/layout.tsx](app/(auth)/layout.tsx) | Bare layout with the marketing nav. |
| [app/(auth)/login/page.tsx](app/(auth)/login/page.tsx) | Login page shell with a Suspense skeleton. |
| [app/(auth)/login/login-form.tsx](app/(auth)/login/login-form.tsx) | Client form — email magic link and password sign-in. |
| [app/(auth)/login/actions.ts](app/(auth)/login/actions.ts) | Server actions: `sendMagicLinkAction`, `passwordSignInAction`, `completeMagicSignIn`. |
| [app/(auth)/login/verify/page.tsx](app/(auth)/login/verify/page.tsx) | Magic-link landing page; maps token errors to readable copy. |
| [app/(auth)/login/verify/auto-submit.tsx](app/(auth)/login/verify/auto-submit.tsx) | Auto-submits the verify form once on mount. |

### `app/(marketing)` — public site

| Path | What it is |
| --- | --- |
| [app/(marketing)/layout.tsx](app/(marketing)/layout.tsx) | Public layout — nav + footer. |
| [app/(marketing)/page.tsx](app/(marketing)/page.tsx) | Homepage: hero, pillars, class library, globe, testimonials, plans, FAQ. |
| [app/(marketing)/membership/page.tsx](app/(marketing)/membership/page.tsx) | Sales/pricing page with sticky checkout and gallery. |
| [app/(marketing)/courses/page.tsx](app/(marketing)/courses/page.tsx) | Public course preview list. |
| [app/(marketing)/events/page.tsx](app/(marketing)/events/page.tsx) | Public upcoming-events list read from Prisma. |
| [app/(marketing)/community/page.tsx](app/(marketing)/community/page.tsx) | Editorial page about the community. |
| [app/(marketing)/about/page.tsx](app/(marketing)/about/page.tsx) | About page. |
| [app/(marketing)/faq/page.tsx](app/(marketing)/faq/page.tsx) | FAQ page (uses `FaqAccordion`). |
| [app/(marketing)/privacy/page.tsx](app/(marketing)/privacy/page.tsx) | Privacy policy. |
| [app/(marketing)/terms/page.tsx](app/(marketing)/terms/page.tsx) | Terms of service. |
| [app/(marketing)/newsletter-action.ts](app/(marketing)/newsletter-action.ts) | Server action recording newsletter intent. |

### `app/(member)` — signed-in app

| Path | What it is |
| --- | --- |
| [app/(member)/layout.tsx](app/(member)/layout.tsx) | Member layout — `force-dynamic`, noindex. |
| [app/(member)/home/page.tsx](app/(member)/home/page.tsx) | The feed: composer, sorted post list, discovery rail. |
| [app/(member)/posts/[id]/page.tsx](app/(member)/posts/[id]/page.tsx) | Single post page with the full conversation. |
| [app/(member)/spaces/page.tsx](app/(member)/spaces/page.tsx) | Space directory — favourites and discovery. |
| [app/(member)/spaces/[slug]/page.tsx](app/(member)/spaces/[slug]/page.tsx) | One space: header, rail, scoped feed, access gating. |
| [app/(member)/spaces/actions.ts](app/(member)/spaces/actions.ts) | Join / leave / favourite server actions. |
| [app/(member)/members/[handle]/page.tsx](app/(member)/members/[handle]/page.tsx) | Member profile page. |
| [app/(member)/settings/page.tsx](app/(member)/settings/page.tsx) | Profile, password, emails, notification prefs, sessions. |
| [app/(member)/settings/actions.ts](app/(member)/settings/actions.ts) | Settings server actions incl. session revocation. |
| [app/(member)/billing/page.tsx](app/(member)/billing/page.tsx) | Member subscription + entitlement overview. |
| [app/(member)/billing/actions.ts](app/(member)/billing/actions.ts) | Cancel-flow and account-deletion server actions. |
| [app/(member)/billing/cancel/[id]/page.tsx](app/(member)/billing/cancel/[id]/page.tsx) | Cancellation confirmation / save-offer step. |
| [app/(member)/billing/delete/page.tsx](app/(member)/billing/delete/page.tsx) | Account-deletion request page (grace period). |
| [app/(member)/community-actions.ts](app/(member)/community-actions.ts) | **Feed write path** — create post, comment, vote, react, save, poll, pin, report. |
| [app/(member)/follow-actions.ts](app/(member)/follow-actions.ts) | `toggleFollowAction` for member follows. |
| [app/(member)/upload-actions.ts](app/(member)/upload-actions.ts) | `requestUploadAction` — validates and signs a Supabase upload. |
| [app/(member)/look-actions.ts](app/(member)/look-actions.ts) | Stores the chosen visual "look" in a cookie. |

### `app/admin`

| Path | What it is |
| --- | --- |
| [app/admin/layout.tsx](app/admin/layout.tsx) | Admin chrome; redirects non-staff. |
| [app/admin/page.tsx](app/admin/page.tsx) | Dashboard counts (members, posts, failed webhooks). |
| [app/admin/actions.ts](app/admin/actions.ts) | Grant access, run reconciliation, retry webhooks, welcome-message settings/sweep. |
| [app/admin/billing/page.tsx](app/admin/billing/page.tsx) | Billing metrics and manual grant form. |
| [app/admin/billing/webhooks/page.tsx](app/admin/billing/webhooks/page.tsx) | SamCart webhook event log. |
| [app/admin/billing/reconciliation/page.tsx](app/admin/billing/reconciliation/page.tsx) | Nightly reconciliation runs and findings. |
| [app/admin/members/[id]/page.tsx](app/admin/members/[id]/page.tsx) | One member's billing/entitlement detail. |
| [app/admin/welcome/page.tsx](app/admin/welcome/page.tsx) | Welcome-DM settings page. |
| [app/admin/welcome/welcome-form.tsx](app/admin/welcome/welcome-form.tsx) | Client form for the welcome message. |

### `app/api` — route handlers

| Path | What it is |
| --- | --- |
| [app/api/auth/[...nextauth]/route.ts](app/api/auth/[...nextauth]/route.ts) | Re-exports the NextAuth handlers. |
| [app/api/auth/magic/route.ts](app/api/auth/magic/route.ts) | Magic-link GET entry point; consumes the token and signs in. |
| [app/api/community/posts/[id]/comments/route.ts](app/api/community/posts/[id]/comments/route.ts) | JSON list/create for post comments (used by the inline panel). |
| [app/api/search/route.ts](app/api/search/route.ts) | Command-palette search; returns grouped hits. |
| [app/api/media/[...path]/route.ts](app/api/media/[...path]/route.ts) | Auth-gated redirect to a signed Supabase read URL. |
| [app/api/messages/[id]/poll/route.ts](app/api/messages/[id]/poll/route.ts) | DM long-poll: new messages, typing, read receipts. |
| [app/api/learn/playback/[lessonId]/route.ts](app/api/learn/playback/[lessonId]/route.ts) | Issues a short-lived signed playback token. |
| [app/api/learn/media/[token]/route.ts](app/api/learn/media/[token]/route.ts) | Verifies a playback token and serves the lesson video. |
| [app/api/learn/events/[id]/ics/route.ts](app/api/learn/events/[id]/ics/route.ts) | Calendar `.ics` download for an event. |
| [app/api/webhooks/samcart/route.ts](app/api/webhooks/samcart/route.ts) | SamCart webhook: verify signature, ingest, process after response. |
| [app/api/jobs/billing/route.ts](app/api/jobs/billing/route.ts) | Cron job — retry failed events, reconcile, purge due deletions. |
| [app/api/jobs/welcome/route.ts](app/api/jobs/welcome/route.ts) | Cron job — send due welcome DMs. |
| [app/api/health/route.ts](app/api/health/route.ts) | Health check incl. dead-lettered billing events. |

## `components/`

### `components/app` — member app chrome

| Path | What it is |
| --- | --- |
| [components/app/app-shell.tsx](components/app/app-shell.tsx) | Member frame: side rail, content column, optional right rail. |
| [components/app/app-header.tsx](components/app/app-header.tsx) | Member app bar — brand, search, create, account. |
| [components/app/side-rail.tsx](components/app/side-rail.tsx) | Fixed left navigation with unread badges. |
| [components/app/mobile-tabs.tsx](components/app/mobile-tabs.tsx) | Phone tab bar with a raised centre create action. |
| [components/app/account-menu.tsx](components/app/account-menu.tsx) | Avatar menu — billing, settings, theme, sign out. |
| [components/app/look-switcher.tsx](components/app/look-switcher.tsx) | Switches the candidate visual identity (cookie-backed). |
| [components/app/theme-fab.tsx](components/app/theme-fab.tsx) | Floating light/dark control. |

### `components/feed`

| Path | What it is |
| --- | --- |
| [components/feed/post-card.tsx](components/feed/post-card.tsx) | LinkedIn-style post card — header, body, media, actions. |
| [components/feed/post-media.tsx](components/feed/post-media.tsx) | Image/video thumbnail and grid; opens the lightbox. |
| [components/feed/post-gallery-modal.tsx](components/feed/post-gallery-modal.tsx) | Instagram-style lightbox with media left, comments right. |
| [components/feed/post-actions.tsx](components/feed/post-actions.tsx) | Reaction summary row plus the four action buttons. |
| [components/feed/post-footer.tsx](components/feed/post-footer.tsx) | Engagement footer, comment previews, inline composer. |
| [components/feed/post-menu.tsx](components/feed/post-menu.tsx) | Overflow menu (pin, report, copy link). |
| [components/feed/post-follow-button.tsx](components/feed/post-follow-button.tsx) | Compact follow control in post headers. |
| [components/feed/reaction-icon.tsx](components/feed/reaction-icon.tsx) | One Lucide glyph per reaction; badge and picker circles. |
| [components/feed/vote-rail.tsx](components/feed/vote-rail.tsx) | Up/down arrows with the net score. |
| [components/feed/save-mark.tsx](components/feed/save-mark.tsx) | Bookmark toggle in the vote column. |
| [components/feed/composer.tsx](components/feed/composer.tsx) | The post composer — collapsed one-liner that expands. |
| [components/feed/upload-tray.tsx](components/feed/upload-tray.tsx) | Attachment tiles with live previews and progress. |
| [components/feed/use-uploads.ts](components/feed/use-uploads.ts) | Hook driving prepare → sign → PUT → verify for attachments. |
| [components/feed/comment-panel.tsx](components/feed/comment-panel.tsx) | Inline comment panel for a feed post. |
| [components/feed/comment-composer.tsx](components/feed/comment-composer.tsx) | Top-level reply box on a post page. |
| [components/feed/comment-thread.tsx](components/feed/comment-thread.tsx) | Reddit-style nested thread with curved branches. |
| [components/feed/comment-sort.tsx](components/feed/comment-sort.tsx) | Conversation ordering control. |
| [components/feed/conversation.tsx](components/feed/conversation.tsx) | Full post-page conversation wrapper. |
| [components/feed/feed-toolbar.tsx](components/feed/feed-toolbar.tsx) | Sort pills and density toggle. |
| [components/feed/feed-rail.tsx](components/feed/feed-rail.tsx) | Right discovery column for Home. |
| [components/feed/feed-empty.tsx](components/feed/feed-empty.tsx) | Empty-feed states (no posts vs. no memberships). |

### `components/layout` — public chrome

| Path | What it is |
| --- | --- |
| [components/layout/app-nav.tsx](components/layout/app-nav.tsx) | The public app bar — brand, centre pill, actions. |
| [components/layout/nav-shell.tsx](components/layout/nav-shell.tsx) | Sticky transparent shell behind the nav. |
| [components/layout/nav-search.tsx](components/layout/nav-search.tsx) | Server wrapper feeding live suggestions to the palette. |
| [components/layout/command-palette.tsx](components/layout/command-palette.tsx) | ⌘K search field and results. |
| [components/layout/nav-icon.tsx](components/layout/nav-icon.tsx) | Round nav icon links, profile link, submit button. |
| [components/layout/nav-mobile-sheet.tsx](components/layout/nav-mobile-sheet.tsx) | Mobile slide-down navigation sheet. |
| [components/layout/marketing-footer.tsx](components/layout/marketing-footer.tsx) | Public site footer. |

### `components/marketing`

| Path | What it is |
| --- | --- |
| [components/marketing/checkout-button.tsx](components/marketing/checkout-button.tsx) | The single CTA — plain anchor to SamCart. |
| [components/marketing/sticky-checkout.tsx](components/marketing/sticky-checkout.tsx) | Mobile sticky CTA bar shown after scroll. |
| [components/marketing/membership-plans.tsx](components/marketing/membership-plans.tsx) | Plan/pricing cards. |
| [components/marketing/membership-gallery.tsx](components/marketing/membership-gallery.tsx) | Class-still gallery on the membership page. |
| [components/marketing/class-library.tsx](components/marketing/class-library.tsx) | Searchable/shelved class library browser. |
| [components/marketing/course-catalog.tsx](components/marketing/course-catalog.tsx) | Netflix-style horizontally scrolling catalog rows. |
| [components/marketing/community-globe.tsx](components/marketing/community-globe.tsx) | Server wrapper: globe plus member postcards. |
| [components/marketing/member-globe.tsx](components/marketing/member-globe.tsx) | Canvas globe of member geography (drawn coastlines). |
| [components/marketing/hero-image.tsx](components/marketing/hero-image.tsx) | Hero photograph and its dark scrim. |
| [components/marketing/hero-decor.tsx](components/marketing/hero-decor.tsx) | Botanical SVG decorations. |
| [components/marketing/ambient-embers.tsx](components/marketing/ambient-embers.tsx) | Canvas ember particles in brand colours. |
| [components/marketing/photo-slot.tsx](components/marketing/photo-slot.tsx) | `PhotoSlot` / `VideoSlot` — named asset placeholders. |
| [components/marketing/sales-video.tsx](components/marketing/sales-video.tsx) | Tap-to-play sales video player. |
| [components/marketing/reel.tsx](components/marketing/reel.tsx) | 9:16 vertical reel card. |
| [components/marketing/reveal.tsx](components/marketing/reveal.tsx) | Scroll-triggered fade/slide wrapper. |
| [components/marketing/spotlight.tsx](components/marketing/spotlight.tsx) | Cursor spotlight on cards; `ScrollProgress` bar. |
| [components/marketing/press-marquee.tsx](components/marketing/press-marquee.tsx) | "Featured in" ticker. |
| [components/marketing/senja-embed.tsx](components/marketing/senja-embed.tsx) | Senja testimonial widget loader + widget ids. |
| [components/marketing/faq-accordion.tsx](components/marketing/faq-accordion.tsx) | FAQ accordion. |
| [components/marketing/newsletter-form.tsx](components/marketing/newsletter-form.tsx) | Newsletter sign-up form. |
| [components/marketing/what-you-get.tsx](components/marketing/what-you-get.tsx) | Learn / Cook / Belong editorial block. |
| [components/marketing/social-links.tsx](components/marketing/social-links.tsx) | Social icon row. |
| [components/marketing/social-icons.tsx](components/marketing/social-icons.tsx) | Inlined brand glyphs. |

### `components/spaces`, `profile`, `brand`

| Path | What it is |
| --- | --- |
| [components/spaces/space-card.tsx](components/spaces/space-card.tsx) | A space in the directory. |
| [components/spaces/space-header.tsx](components/spaces/space-header.tsx) | Space title, kind, visibility, membership state. |
| [components/spaces/space-rail.tsx](components/spaces/space-rail.tsx) | Space sidebar and `PinnedResources`. |
| [components/spaces/space-buttons.tsx](components/spaces/space-buttons.tsx) | Join / leave / favourite client buttons. |
| [components/profile/profile-view.tsx](components/profile/profile-view.tsx) | Profile header, tabs, and the post grid. |
| [components/brand/brand-mark.tsx](components/brand/brand-mark.tsx) | `BrandLogo` and `BrandMark`. |

### `components/ui` — primitives

| Path | What it is |
| --- | --- |
| [components/ui/button.tsx](components/ui/button.tsx) | `Button` and `ButtonLink` with variants. |
| [components/ui/input.tsx](components/ui/input.tsx) | Text input. |
| [components/ui/textarea.tsx](components/ui/textarea.tsx) | Textarea. |
| [components/ui/card.tsx](components/ui/card.tsx) | Card surface. |
| [components/ui/avatar.tsx](components/ui/avatar.tsx) | Avatar with fallback initials. |
| [components/ui/badge.tsx](components/ui/badge.tsx) | Small label pill. |
| [components/ui/skeleton.tsx](components/ui/skeleton.tsx) | Loading placeholder. |
| [components/ui/empty-state.tsx](components/ui/empty-state.tsx) | Shared empty state. |
| [components/ui/error-state.tsx](components/ui/error-state.tsx) | Shared error state. |
| [components/ui/later-phase.tsx](components/ui/later-phase.tsx) | "Coming in a later phase" page stub. |
| [components/ui/media-frame.tsx](components/ui/media-frame.tsx) | The single frame/motion treatment for content images. |
| [components/ui/media-reveal-runtime.tsx](components/ui/media-reveal-runtime.tsx) | One IntersectionObserver serving every `MediaFrame`. |
| [components/ui/heroui.ts](components/ui/heroui.ts) | HeroUI client re-exports. |
| [components/theme-toggle.tsx](components/theme-toggle.tsx) | Light/dark toggle used outside the navbar. |

## `lib/` — domain logic

### Core

| Path | What it is |
| --- | --- |
| [lib/db.ts](lib/db.ts) | The Prisma client singleton. |
| [lib/utils.ts](lib/utils.ts) | `cn`, `formatRelativeTime`, `displayNameFromEmail`. |
| [lib/markdown.ts](lib/markdown.ts) | `renderMarkdown` (marked + sanitize-html) and `toPlainText`. |
| [lib/csv.ts](lib/csv.ts) | CSV parse/serialise helpers used by import scripts. |
| [lib/audit.ts](lib/audit.ts) | `writeAuditLog`. |
| [lib/navigation.ts](lib/navigation.ts) | Member nav groups, mobile tabs, the create link. |
| [lib/looks.ts](lib/looks.ts) | The candidate "looks", cookie name, `parseLook`. |
| [lib/theme/tokens.ts](lib/theme/tokens.ts) | Light/dark brand tokens mirrored in `globals.css`. |

### `lib/auth`

| Path | What it is |
| --- | --- |
| [lib/auth/magic-link.ts](lib/auth/magic-link.ts) | Request/inspect/consume magic links; rate-limit error. |
| [lib/auth/tokens.ts](lib/auth/tokens.ts) | Token hashing, status inspection, email masking. |
| [lib/auth/password.ts](lib/auth/password.ts) | bcrypt hash/verify and strength check. |
| [lib/auth/identity.ts](lib/auth/identity.ts) | Resolves the canonical email across alternate addresses. |
| [lib/auth/provision.ts](lib/auth/provision.ts) | Unique handles and first-login member setup. |
| [lib/auth/rate-limit.ts](lib/auth/rate-limit.ts) | In-memory sliding-window rate limiter. |

### `lib/community` — feed domain

| Path | What it is |
| --- | --- |
| [lib/community/posts.ts](lib/community/posts.ts) | **Core feed data layer** — list, create, comment, react, bookmark, pin, report, poll. |
| [lib/community/post-detail.ts](lib/community/post-detail.ts) | Post page queries: detail, conversation, more-from-space. |
| [lib/community/sort.ts](lib/community/sort.ts) | Feed sorts (hot/new/top/rising) and comment nesting. |
| [lib/community/votes.ts](lib/community/votes.ts) | Vote toggling and score delta maths. |
| [lib/community/reactions.ts](lib/community/reactions.ts) | Reaction catalog, legacy values, summary building. |
| [lib/community/media.ts](lib/community/media.ts) | Video embed URLs and poster/thumbnail resolution. |
| [lib/community/format.ts](lib/community/format.ts) | Handle slugs, mention parsing, feed cursors, email normalising. |
| [lib/community/format-count.ts](lib/community/format-count.ts) | Compact counts and short relative times. |
| [lib/community/profile.ts](lib/community/profile.ts) | `getMemberProfile` with activity. |
| [lib/community/privacy.ts](lib/community/privacy.ts) | Profile privacy shape and field visibility. |
| [lib/community/member-avatars.ts](lib/community/member-avatars.ts) | Seeded avatars and hero faces. |
| [lib/community/trending.ts](lib/community/trending.ts) | Trending spaces for the rail. |

### `lib/spaces`, `lib/permissions`

| Path | What it is |
| --- | --- |
| [lib/spaces/index.ts](lib/spaces/index.ts) | Nav spaces, join/leave/favourite, read marks, space detail. |
| [lib/spaces/kinds.ts](lib/spaces/kinds.ts) | Icons, labels, blurbs and tabs per space kind. |
| [lib/permissions/index.ts](lib/permissions/index.ts) | `canEnterSpace` / `canPost` / `canModerate` / `canEditPost` etc. |

### `lib/billing` — SamCart

| Path | What it is |
| --- | --- |
| [lib/billing/types.ts](lib/billing/types.ts) | Canonical event types, entitlement effects, paying statuses. |
| [lib/billing/config.ts](lib/billing/config.ts) | Membership product ids, deletion grace period. |
| [lib/billing/verify.ts](lib/billing/verify.ts) | Webhook signature verification and API-key reading. |
| [lib/billing/normalize.ts](lib/billing/normalize.ts) | Maps a SamCart payload to a canonical event. |
| [lib/billing/policy.ts](lib/billing/policy.ts) | Pure state machine: next status and entitlement effect. |
| [lib/billing/process-event.ts](lib/billing/process-event.ts) | Ingest, process and retry billing events. |
| [lib/billing/apply.ts](lib/billing/apply.ts) | Applies effects: entitlements, pending grants, manual grants. |
| [lib/billing/cancel.ts](lib/billing/cancel.ts) | Cancellation request → save offer → confirm. |
| [lib/billing/samcart-api.ts](lib/billing/samcart-api.ts) | SamCart REST client (subscriptions, products, cancel, refund). |
| [lib/billing/reconcile.ts](lib/billing/reconcile.ts) | Nightly drift detection and reconciliation runs. |
| [lib/billing/metrics.ts](lib/billing/metrics.ts) | Numbers for the admin billing dashboard. |
| [lib/billing/deletion.ts](lib/billing/deletion.ts) | Account-deletion request and grace-period purge. |
| [lib/billing/kit.ts](lib/billing/kit.ts) | Syncs entitlement changes to Kit (ConvertKit) tags. |

### `lib/entitlements`, `lib/learn`

| Path | What it is |
| --- | --- |
| [lib/entitlements/check.ts](lib/entitlements/check.ts) | Pure `isEntitlementActive` / `canAccessPaidContent`. |
| [lib/entitlements/server.ts](lib/entitlements/server.ts) | DB-backed entitlement lookups. |
| [lib/learn/catalog.ts](lib/learn/catalog.ts) | Published courses, lesson flattening, continue-learning. |
| [lib/learn/access.ts](lib/learn/access.ts) | Whether a member may play lessons. |
| [lib/learn/playback.ts](lib/learn/playback.ts) | Signed playback tokens and Cloudflare Stream URLs. |
| [lib/learn/progress.ts](lib/learn/progress.ts) | Lesson progress saving and course percentage. |
| [lib/learn/events.ts](lib/learn/events.ts) | Event listing, RSVP, `.ics` generation, reminders. |

### `lib/messages`, `lib/notifications`, `lib/search`, `lib/social`

| Path | What it is |
| --- | --- |
| [lib/messages/conversations.ts](lib/messages/conversations.ts) | DM data layer — create, send, list, read, unread counts. |
| [lib/messages/permissions.ts](lib/messages/permissions.ts) | Who may DM whom, group limits, typing TTL. |
| [lib/messages/format.ts](lib/messages/format.ts) | Auto-linking message bodies. |
| [lib/messages/welcome.ts](lib/messages/welcome.ts) | Welcome-DM settings, validation, queue and sweep. |
| [lib/notifications/create.ts](lib/notifications/create.ts) | Create notifications and mark them read. |
| [lib/notifications/preferences.ts](lib/notifications/preferences.ts) | Preference shape, rows, parsing, `wants()`. |
| [lib/search/index.ts](lib/search/index.ts) | `upsertSearchIndex` and `searchEntities`. |
| [lib/search/links.ts](lib/search/links.ts) | Result grouping, labels and hrefs per entity type. |
| [lib/search/suggest.ts](lib/search/suggest.ts) | Static nav suggestions and client-side filtering. |
| [lib/search/nav-suggestions.ts](lib/search/nav-suggestions.ts) | Server-only live catalog suggestions. |
| [lib/social/scoring.ts](lib/social/scoring.ts) | Suggestion weights, overlap, ranking, week boundaries. |
| [lib/social/signals.ts](lib/social/signals.ts) | Loads a member's matching signals. |
| [lib/social/suggestions.ts](lib/social/suggestions.ts) | "People you should meet", weekly matches, preferences. |
| [lib/social/badge-rules.ts](lib/social/badge-rules.ts) | Badge rule definitions and earning logic. |
| [lib/social/badges.ts](lib/social/badges.ts) | Badge catalog sync, awarding, recent recognition. |
| [lib/social/cohorts.ts](lib/social/cohorts.ts) | New-member and course cohorts. |

### `lib/uploads`, `lib/email`, `lib/jobs`

| Path | What it is |
| --- | --- |
| [lib/uploads/policy.ts](lib/uploads/policy.ts) | Allowed types, size caps, accept strings, validation. |
| [lib/uploads/storage.ts](lib/uploads/storage.ts) | Supabase signed uploads/reads, media route paths, verification. |
| [lib/uploads/client.ts](lib/uploads/client.ts) | Browser-side resize/prepare and `putWithProgress`. |
| [lib/email/send.ts](lib/email/send.ts) | Transactional + magic-link sending, dev inbox. |
| [lib/email/templates/magic-link.ts](lib/email/templates/magic-link.ts) | Magic-link subject/text/HTML. |
| [lib/email/templates/billing.ts](lib/email/templates/billing.ts) | Cancellation, reconciliation and deletion emails. |
| [lib/jobs/auth.ts](lib/jobs/auth.ts) | Shared secret check for cron job routes. |

### `lib/marketing`

| Path | What it is |
| --- | --- |
| [lib/marketing/copy.ts](lib/marketing/copy.ts) | Homepage/membership copy blocks and FAQs. |
| [lib/marketing/checkout.ts](lib/marketing/checkout.ts) | Checkout URL, labels, pricing, the two plans. |
| [lib/marketing/assets.ts](lib/marketing/assets.ts) | Named asset slots, press credits, reel quote. |
| [lib/marketing/catalog.ts](lib/marketing/catalog.ts) | Catalog rows/cards and the next live class. |
| [lib/marketing/class-library.ts](lib/marketing/class-library.ts) | Shelves, slugs, search and filtering over the class list. |
| [lib/marketing/class-media.ts](lib/marketing/class-media.ts) | Fuzzy-matches the client's media spreadsheet to courses. |
| [lib/marketing/teasers.ts](lib/marketing/teasers.ts) | YouTube id / embed / thumbnail helpers. |
| [lib/marketing/stock-hosts.ts](lib/marketing/stock-hosts.ts) | Detects and rejects stock imagery. |
| [lib/marketing/stats.ts](lib/marketing/stats.ts) | Homepage momentum numbers and course preview. |
| [lib/marketing/globe-markers.ts](lib/marketing/globe-markers.ts) | Member geo markers for the globe. |
| [lib/marketing/land-rings.ts](lib/marketing/land-rings.ts) | Generated coastline rings (see `scripts/build-land-rings.mjs`). |
| [lib/marketing/community-stories.ts](lib/marketing/community-stories.ts) | Member postcards spread across the map. |
| [lib/marketing/social.ts](lib/marketing/social.ts) | Social link list. |
| [lib/marketing/video-reveal.ts](lib/marketing/video-reveal.ts) | Reveal-and-play behaviour for hero video. |

## `prisma/`

| Path | What it is |
| --- | --- |
| [prisma/schema.prisma](prisma/schema.prisma) | **The data model** — users/roles/profiles, spaces, posts/comments/reactions/votes, courses/lessons/events, messages, follows/blocks, billing (products, subscriptions, entitlements, events, reconciliation), badges, cohorts, matches, geo, audit log. |
| [prisma/migrations/](prisma/migrations/) | Ordered SQL migrations, from the phase-1 baseline through billing, feed votes, social/DMs, marketing geo, notification prefs, space groups, welcome DMs, member follows and post-attachment thumbnails. |
| [prisma/seed.ts](prisma/seed.ts) | Main seed entry — users, roles, spaces, then the sub-seeds below. |
| [prisma/seed-test-feed.ts](prisma/seed-test-feed.ts) | ~54 marked test feed posts with real food imagery. |
| [prisma/seed-feed-demo.ts](prisma/seed-feed-demo.ts) | Dev-only demo content exercising votes, reactions, threads, grids. |
| [prisma/seed-class-posts.ts](prisma/seed-class-posts.ts) | One VIDEO post per class from `data/class-library.json`, with engagement. |
| [prisma/seed-catalog.ts](prisma/seed-catalog.ts) | The real class catalog (courses + categories) from the client brief. |
| [prisma/seed-learn.ts](prisma/seed-learn.ts) | Course hall, lessons, resources for the learning surfaces. |
| [prisma/seed-social.ts](prisma/seed-social.ts) | Badge catalog, interests and starter conversations. |
| [prisma/reindex-search.ts](prisma/reindex-search.ts) | Backfills `SearchIndex` for content written by seeds. |

## `scripts/`

| Path | What it is |
| --- | --- |
| [scripts/import-class-media.ts](scripts/import-class-media.ts) | Applies the class media spreadsheet to the course catalog. |
| [scripts/import-member-geo.ts](scripts/import-member-geo.ts) | Imports member geography from a Mighty Networks CSV export. |
| [scripts/build-land-rings.mjs](scripts/build-land-rings.mjs) | Regenerates `lib/marketing/land-rings.ts` from Natural Earth data. |
| [scripts/verify-phase1-gate.ts](scripts/verify-phase1-gate.ts) | End-to-end check of posting, commenting, reacting, search. |
| [scripts/verify-phase2-billing.ts](scripts/verify-phase2-billing.ts) | End-to-end billing gate check against a running app. |
| [scripts/samcart-live-acceptance.ts](scripts/samcart-live-acceptance.ts) | Live SamCart acceptance run against real products. |

## `tests/` (Vitest)

| Path | What it covers |
| --- | --- |
| [tests/setup-env.ts](tests/setup-env.ts) | Loads env for the test run. |
| [tests/stubs/server-only.ts](tests/stubs/server-only.ts) | Stub so `server-only` imports work under Vitest. |
| [tests/billing.test.ts](tests/billing.test.ts) | Webhook signature verification and API-key reading. |
| [tests/billing-flow.integration.test.ts](tests/billing-flow.integration.test.ts) | Ingest → process → entitlement, against a real DB. |
| [tests/entitlements.test.ts](tests/entitlements.test.ts) | Entitlement/paid-content rules. |
| [tests/permissions.test.ts](tests/permissions.test.ts) | Space permission matrix. |
| [tests/spaces-flow.integration.test.ts](tests/spaces-flow.integration.test.ts) | Join/leave/favourite against a real DB. |
| [tests/feed-sort.test.ts](tests/feed-sort.test.ts) | Hot/rising ranking, comment nesting, vote deltas. |
| [tests/community-format.test.ts](tests/community-format.test.ts) | Cursors, mentions, handles, email normalising. |
| [tests/media-privacy.test.ts](tests/media-privacy.test.ts) | Video embeds and profile field visibility. |
| [tests/uploads.test.ts](tests/uploads.test.ts) | Upload policy — types, sizes, accept strings. |
| [tests/markdown.test.ts](tests/markdown.test.ts) | Markdown rendering and sanitising. |
| [tests/identity.test.ts](tests/identity.test.ts) | Alternate-email identity resolution. |
| [tests/tokens.test.ts](tests/tokens.test.ts) | Magic-token hashing and status. |
| [tests/rate-limit.test.ts](tests/rate-limit.test.ts) | Sliding-window limiter. |
| [tests/messages.test.ts](tests/messages.test.ts) | DM permissions, group size, unread counts. |
| [tests/welcome-dm.integration.test.ts](tests/welcome-dm.integration.test.ts) | Welcome-DM queueing and sending. |
| [tests/social.test.ts](tests/social.test.ts) | Matching weights and suggestion ranking. |
| [tests/social-links.test.ts](tests/social-links.test.ts) | Social link list integrity. |
| [tests/search-suggest.test.ts](tests/search-suggest.test.ts) | Suggestion filtering. |
| [tests/learn.test.ts](tests/learn.test.ts) | Playback tokens and course percentage. |
| [tests/marketing.test.ts](tests/marketing.test.ts) | Marketing copy/asset invariants. |
| [tests/class-library.test.ts](tests/class-library.test.ts) | Class library shelves, stock-image and YouTube rules. |
| [tests/class-media.test.ts](tests/class-media.test.ts) | Spreadsheet parsing and course matching. |
| [tests/globe.test.ts](tests/globe.test.ts) | Globe markers and postcards. |
| [tests/video-reveal.test.ts](tests/video-reveal.test.ts) | Reveal-and-play behaviour. |

## `data/`, `public/`, `docs/`

| Path | What it is |
| --- | --- |
| [data/class-library.json](data/class-library.json) | The 51-class library powering the homepage and class seeds. |
| [data/class-media.csv](data/class-media.csv) | Client export: dish photos and teaser videos per class. |
| [data/class-media-aliases.csv](data/class-media-aliases.csv) | Manual title aliases for spreadsheet matching. |
| [data/class_thumbnails_and_teasers.xlsx](data/class_thumbnails_and_teasers.xlsx) | The original spreadsheet the CSVs are exported from. |
| [public/images/](public/images/) | Static imagery served by the marketing pages. |
| [docs/rebuild-roadmap.md](docs/rebuild-roadmap.md) | Order of work for the member-app rebuild. |
| [docs/schema-plan.md](docs/schema-plan.md) | Data-model plan incl. Postgres full-text search. |
| [docs/billing-architecture.md](docs/billing-architecture.md) | How SamCart, entitlements and reconciliation fit together. |
| [docs/member-uploads.md](docs/member-uploads.md) | Supabase Storage upload design. |
| [docs/feed-home-redesign.md](docs/feed-home-redesign.md) | Member-app chrome and feed redesign notes. |
| [docs/membership-access-review.md](docs/membership-access-review.md) | Review of who can access what. |
| [docs/mighty-parity-checklist.md](docs/mighty-parity-checklist.md) | Feature parity against Mighty Networks. |
| [docs/migration-reconciliation-report.md](docs/migration-reconciliation-report.md) | Status of member-data migration. |
| [docs/discovery-report.md](docs/discovery-report.md) | Initial discovery findings. |
| [docs/admin-user-guide.md](docs/admin-user-guide.md) | How staff use the admin area. |
| [docs/incident-runbook.md](docs/incident-runbook.md) | Health checks and incident response. |

---

## Where to change what

| Task | Start here |
| --- | --- |
| Feed appearance | `components/feed/post-card.tsx`, `post-media.tsx`, `post-actions.tsx` |
| Feed behaviour / data | `lib/community/posts.ts`, `app/(member)/community-actions.ts` |
| Post attachments / uploads | `components/feed/use-uploads.ts`, `lib/uploads/*`, `app/(member)/upload-actions.ts` |
| Sorting / ranking | `lib/community/sort.ts` |
| Permissions | `lib/permissions/index.ts`, `lib/spaces/index.ts` |
| Sign-in | `auth.ts`, `lib/auth/*`, `app/(auth)/login/*` |
| Billing | `lib/billing/*`, `app/api/webhooks/samcart/route.ts`, `app/admin/billing/*` |
| Marketing copy / pricing | `lib/marketing/copy.ts`, `lib/marketing/checkout.ts` |
| Schema change | `prisma/schema.prisma` → `pnpm db:migrate` → touch the matching `lib/` module |
| Navigation | `lib/navigation.ts`, `components/app/side-rail.tsx`, `components/layout/app-nav.tsx` |
| Colours / theme | `lib/theme/tokens.ts`, `app/globals.css` |
