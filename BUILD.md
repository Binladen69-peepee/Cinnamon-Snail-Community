# Vegan University — Master Build Roadmap & Claude Code Execution Specification

**Document:** `BUILD.md`  
**Purpose:** Single source of truth for the entire Vegan University platform build  
**Primary implementation agent:** Claude Code  
**Status:** Master execution specification  
**Rule:** Claude Code must follow this file for implementation, verification, sequencing, and completion tracking.

---

# 1. NON-NEGOTIABLE MASTER RULE

Claude Code MUST treat this `BUILD.md` as the **only implementation roadmap and execution contract** for this project.

The product being built is **Vegan University**. Mighty Networks is only a reference for the categories/capabilities listed in this document. Claude Code must NOT require, read, or depend on any separate client build-spec document.

## Claude Code must

1. Read the complete `BUILD.md` before starting work.
2. Inspect the existing repository before changing architecture.
3. Build the features and phases defined in this file.
4. Follow the phase order unless a dependency/blocker is explicitly documented.
5. Never replace required functionality with fake/mock production data.
6. Never mark a feature complete because only its UI exists.
7. Build the complete vertical slice: UI + backend + database + authorization + validation + errors + loading/empty states + tests, where applicable.
8. Never silently invent a business rule that is not defined here. Record it in `DECISIONS.md`.
9. Keep billing and entitlement logic server-side.
10. Never expose secrets or private data.
11. Make webhooks idempotent.
12. Preserve working functionality while extending the application.
13. Run typecheck, lint, tests, and production build before declaring a chunk complete.
14. Update this `BUILD.md` after every meaningful implementation chunk.
15. Do not create a competing master roadmap.
16. Do not stop at analysis, planning, screenshots, or placeholder pages. Implement the actual product.
17. Do not make the product visually resemble a generic SaaS dashboard.

## Product reference rule

The client reference categories are:

- Community
- Courses
- Members
- Marketing
- Payments
- Admin
- AI Cohost

These are **feature references only**. The implementation, UX, information architecture, and visual identity must be Vegan University's own.

# 2. PRODUCT VISION

Vegan University is a self-hosted premium community + learning platform replacing Mighty Networks.

The product must combine:

- Community
- Courses
- Members
- Marketing automation
- Payments and entitlement management
- Administration
- AI-assisted community engagement

The reference feature categories are:

1. **Community**
2. **Courses**
3. **Members**
4. **Marketing**
5. **Payments**
6. **Admin**
7. **AI Cohost**

These are capability references, not a requirement to visually copy another product.

## Core product promise

A member should be able to:

> Join → discover people → learn → cook → participate → build relationships → receive personalized guidance → manage membership → cancel honestly.

The most important business requirement is billing/access correctness.

> SamCart is the source of truth for money.  
> The Vegan University app is the source of truth for access.  
> Entitlements are the only access-checking layer.

---

# 3. DESIGN DIRECTION — PREMIUM VEGAN UNIVERSITY

## 3.1 Design objective

The platform must feel like a premium food + education + human community product — specifically Vegan University, not a generic wellness or community template.

It must NOT look like:

- Generic dark SaaS
- Developer dashboard
- Cryptocurrency product
- Corporate banking dashboard
- Generic AI startup
- Template-based admin software
- Dark-green SaaS palettes
- Multi-accent “food photography” palettes (magenta + coral + gold together)

The interface should make a new member immediately feel:

- Welcome
- Hungry to explore
- Safe
- Inspired
- Connected
- Curious
- Proud to belong

## 3.2 Visual personality

Approved visual system (hero + feed, one identity):

- Warm cream page ground (`#FFF8EF`) with warm-white cards (`#FFFCF8`)
- Forest green branding (`#0F3D32`) and a single plant-green accent (`#16A34A`)
- Poppins bold headings; Inter for body and UI
- Rounded cards (20px), pill buttons, soft forest-tinted shadows
- Light sidebars that match the hero — not a dark dashboard
- Contained editorial food photography
- One deliberate motion moment on first paint (hero reveal)
- Light and dark modes via `next-themes` (`class="dark"` on `<html>`)

## 3.3 Color system (design tokens)

Define tokens in HeroUI theme CSS (`app/globals.css` `:root` / `.dark`), not as scattered hex values in components. Component library is HeroUI v3 (`@heroui/react` + `@heroui/styles`) on Tailwind v4. HeroUI v3 does **not** use the v2 `heroui()` Tailwind plugin; override CSS variables instead. Do not ship HeroUI’s default blue theme.

Use **forest + one green accent**. Do not add extra brand colors beyond the token table.

### Light mode

| Token | Hex | Use |
|---|---|---|
| `background` | `#FFF8EF` | Page base — warm cream |
| `surface` | `#FFFCF8` | Cards, panels |
| `foreground` | `#16231F` | Body text, headings |
| `foreground-muted` | `#66736D` | Secondary text |
| `primary` / `forest` | `#0F3D32` | Logo, primary buttons, header |
| `accent` | `#16A34A` | Headline accents, active rings, icons |
| `border` / `sand` | `#EDE2D2` | Hairlines |

### Dark mode

| Token | Hex | Use |
|---|---|---|
| `background` | `#161616` | Charcoal page |
| `surface` | `#1F1F1F` | Cards |
| `foreground` | `#FFF6EC` | Body text |
| `foreground-muted` | `#B5B5B5` | Secondary text |
| `accent` | `#FF9A3D` | Same jobs as light, brighter for contrast |
| `border` | `#2C2C2C` | Hairlines |

Primary buttons are **solid forest pills with white label**. Footer is inverted forest. Keyboard focus must remain visible (`--focus` / HeroUI focus rings — do not override them away).

## 3.4 Typography

Two families. **No serif.**

- **Headings:** `Poppins` bold (700). Highlight a single keyword in `accent` green.
- **Body / UI:** `Inter` regular/medium/semibold.

Rules:

- Same sans pair for the whole product (hero and feed). Hierarchy is weight and size.
- Body line length under ~75 characters.
- Maintain strong hierarchy.

## 3.5 Photography and imagery

The product should use food/community imagery prominently.

Visual direction:

- Real vegan food
- Natural lighting
- Human hands cooking
- Members cooking together
- Finished dishes
- Warm kitchens
- Community gatherings
- Photos **contained** in rounded rectangles inside white cards — not full-bleed edge-to-edge heroes

Avoid:

- Generic stock-photo business people
- Fake corporate smiling teams
- Excessive gradients
- Random abstract AI illustrations
- Neon UI

## 3.6 UI principles

- Generous whitespace
- White rounded cards (~24px) on peach
- Soft card shadows
- Fully rounded pill buttons
- Contained photography
- Clear typography
- Strong visual hierarchy
- Motion used sparingly (one hero reveal; honor `prefers-reduced-motion`)
- Micro-interactions for meaningful feedback
- Mobile-first interaction design
- Visible sun/moon theme toggle in marketing and member nav

Homepage must explain the product in distinct beats (hero, live momentum, Learn/Cook/Belong, Kitchen Table spotlight, courses, member stories, honest membership, FAQ) — not a single hero with no supporting content.

## 3.7 Navigation concept

Desktop:

- Brand/logo
- Home
- Community
- Courses
- Members
- Roadmap
- Events
- Bulletin Board
- Messages
- Search
- Notifications
- Profile

Admin has a separate administration area.

Mobile:

- Home
- Community
- Courses
- Roadmap
- Profile
- Floating/accessible compose action where appropriate

Do not overload mobile navigation.

---

# 4. EXPERIENCE PRINCIPLES

## 4.1 Community first

The feed is not a data table.

It should feel alive:

- Member avatars
- Food photography
- Questions
- Recipes
- Polls
- Celebrations
- Course discussions
- Events
- Recognition

## 4.2 Learning should feel achievable

Avoid intimidating LMS layouts.

Show:

- Current lesson
- Progress
- Continue learning
- Estimated time
- What you will learn
- Community discussion
- Related recipe

## 4.3 Membership should feel valuable

Members should constantly discover:

- People
- Courses
- Recipes
- Events
- Challenges
- Roadmap milestones
- Community recognition

## 4.4 Billing should feel trustworthy

Never use dark patterns.

Cancellation must be:

- Clear
- Honest
- Branded
- Confirmed
- Auditable

## 4.5 Admin should be powerful but understandable

Admin UI can be more data-dense than member UI, but should still use the same design system.

---

# 5. TECHNICAL FOUNDATION

The project architecture should support the following capabilities:

- Next.js App Router
- TypeScript
- Postgres
- Prisma or Drizzle
- Auth.js or Supabase Auth
- Inngest or Trigger.dev
- Upstash Redis
- Cloudflare Stream or Bunny Stream
- Cloudflare R2 or S3
- Postmark or Resend
- Supabase Realtime / Ably / Pusher
- Postgres FTS initially
- Sentry
- PostHog
- Anthropic API

Claude Code may choose equivalents only when documented and justified.

## Required architecture properties

- Relational database
- Version-controlled migrations
- Background job system
- Retry + dead-letter handling
- Idempotent webhooks
- Staging and production separation
- Daily backups
- Tested restore
- Server-side authorization
- Environment-based secrets
- Reusable design system
- Integration adapters
- Testable services
- Auditable admin actions

---

# 6. PROJECT STRUCTURE

Use a maintainable architecture similar to:

```text
/
├── app/
│   ├── (marketing)/
│   ├── (auth)/
│   ├── (member)/
│   ├── admin/
│   └── api/
├── components/
│   ├── ui/
│   ├── layout/
│   ├── community/
│   ├── courses/
│   ├── members/
│   ├── events/
│   ├── roadmap/
│   ├── bulletin/
│   ├── billing/
│   └── admin/
├── lib/
│   ├── auth/
│   ├── db/
│   ├── permissions/
│   ├── billing/
│   ├── entitlements/
│   ├── integrations/
│   ├── notifications/
│   ├── search/
│   ├── jobs/
│   ├── ai/
│   └── analytics/
├── db/
│   ├── schema/
│   └── migrations/
├── jobs/
├── tests/
├── public/
├── docs/
├── DECISIONS.md
├── BUILD.md
└── README.md
```

Adapt to the actual repository rather than blindly replacing an existing good architecture.

---

# 7. DATA / ACCESS ARCHITECTURE

## 7.1 Access model

The app checks:

```text
entitlements
```

It must NOT check SamCart or Kit directly during normal authorization.

Conceptually:

```text
SamCart
   ↓
Webhook
   ↓
billing_events
   ↓
Background Job
   ↓
subscriptions
   ↓
entitlements
   ↓
Application Authorization
```

Kit is synchronized from entitlement state.

## 7.2 Core entities

At minimum model:

- users
- user_emails
- profiles
- roles
- spaces
- space_memberships
- posts
- comments
- reactions
- bookmarks
- reports
- notifications
- courses
- course_sections
- lessons
- lesson_progress
- course_progress
- resources
- events
- event_rsvps
- conversations
- conversation_members
- messages
- products
- samcart_product_map
- subscriptions
- entitlements
- billing_events
- kit_sync_log
- automation_rules
- rule_executions
- ai_prompt_schedules
- ai_prompt_drafts
- roadmap_tracks
- roadmap_milestones
- member_roadmaps
- member_milestone_progress
- badges
- member_badges
- challenges
- challenge_participants
- recipes
- recipe_variations
- member_cards
- happenings
- happening_rsvps
- places
- place_testimonials
- audit_logs

Use normalized relational structures where appropriate and JSONB only for genuinely flexible data.

---

# 8. PHASE 0 — DISCOVERY & REPOSITORY AUDIT

## Goal

Understand the existing repository and client environment before implementation.

### Claude tasks

- [x] Read BUILD.md completely.
- [x] Inspect repository structure.
- [x] Identify current framework.
- [x] Identify current database.
- [x] Identify authentication.
- [x] Identify existing UI system.
- [x] Identify existing dependencies.
- [x] Identify environment variables.
- [x] Identify existing integrations.
- [x] Identify existing routes.
- [x] Identify existing schema.
- [x] Identify deployment configuration.
- [x] Identify existing tests.
- [x] Identify technical debt.
- [x] Identify reusable components.
- [x] Identify conflicting architecture.

### Mighty parity audit

Audit the actual client reference platform where access is available.

Document:

- Navigation
- Spaces
- Feed
- Courses
- Members
- Events
- Notifications
- Search
- Messaging
- Admin
- Billing behavior
- Member profile behavior
- Mobile behavior

Create:

```text
docs/mighty-parity-checklist.md
```

Every feature must be marked:

- Built
- Deferred
- Intentionally dropped
- Decision needed

### Deliverable

```text
docs/discovery-report.md
```

### Gate

Do not begin Phase 1 until:

- Architecture is understood
- Schema direction is documented
- Major integrations are identified
- Mighty parity checklist exists
- Blockers are documented

---

# 9. PHASE 1 — FOUNDATION + COMMUNITY

## Goal

Build the platform foundation and core community experience.

## 9.1 Authentication

- [x] Magic-link login
- [x] Optional password
- [x] Secure HTTP-only sessions
- [x] Session revocation
- [x] Rate limiting
- [x] Login/loading/error states
- [x] Multiple verified emails
- [x] Email identity matching

## 9.2 Users and profiles

- [x] User model
- [x] Profile model
- [x] Avatar
- [x] Bio
- [x] City-level location
- [x] Cooking interests
- [x] Skill level
- [x] Dietary interests
- [x] Links
- [x] Privacy settings
- [x] DM preferences
- [x] Directory visibility

## 9.3 Spaces

Support:

- Feed
- Course
- Events
- Chat
- Members

Each space:

- Name
- Cover
- Description
- Icon
- Access rules
- Visibility
- Sort order
- Posting permissions
- Approval requirements
- Notification defaults
- Space host

## 9.4 Feed

Post types:

- Simple
- Article
- Question
- Poll
- Event
- Link
- Image
- Video
- Recipe-aware post

Support:

- Rich text
- Mentions
- Emoji
- GIFs
- Attachments
- Video embeds
- Comments
- Threaded replies
- Reactions
- Save
- Share
- Report
- Pin
- Draft
- Scheduling

Use cursor pagination.

## 9.5 Notifications

Channels:

- [x] In-app
- [ ] Email
- [ ] Web push

Categories:

- Replies
- Mentions
- DMs
- Space activity
- Events
- Host announcements
- Digests

## 9.6 Search

Initial implementation:

- Postgres FTS
- `tsvector`
- Trigram typo fallback
- Search posts
- Comments
- Courses
- Lessons
- Events
- Members
- Type filters
- Space filters

## Phase 1 UI

Create:

- Premium dashboard
- Community feed
- Space page
- Post detail
- Create post
- Member directory
- Member profile
- Notifications
- Search
- Responsive mobile navigation

### Gate

Adam/test user must be able to:

- Sign in
- Complete profile
- Enter a space
- Create a post
- Comment
- React
- Search
- Receive notifications

And the UI must feel premium and correct.

---

# 10. PHASE 2 — BILLING, PAYMENTS & ENTITLEMENTS

**Priority: Highest business priority.**

Do this BEFORE full course implementation.

## 10.1 Products

Support:

- Membership
- Course
- Bundle
- Manual grant

Map SamCart products to app products.

## 10.2 Subscriptions

Support:

- active
- past_due
- delinquent
- canceling
- canceled
- refunded
- comped

Track:

- SamCart subscription ID
- Order ID
- Customer ID
- Amount
- Gateway
- Billing interval
- Period end
- Cancel date

## 10.3 Webhooks

Every webhook:

1. Verify signature/secret.
2. Store raw payload.
3. Store provider event ID.
4. Return quickly.
5. Process asynchronously.
6. Guarantee idempotency.
7. Retry failures.
8. Send failed events to dead-letter handling.

Events:

- Purchase
- Charge
- Charge failed
- Delinquent
- Recovered
- Canceled
- Restarted
- Completed
- Refund

## 10.4 Entitlements

Access checks ONLY use entitlement state.

Support:

- Subscription access
- One-time access
- Manual grants
- Migration grants
- Expiration
- Revocation

## 10.5 Cancellation

Build:

1. Membership status
2. Save attempt
3. Confirmation
4. SamCart cancellation
5. Local entitlement update
6. Kit sync
7. Confirmation email
8. Audit record

Never claim cancellation succeeded unless SamCart confirms it.

## 10.6 Account deletion

Active paid member:

```text
Deletion request
↓
Cancel billing
↓
Confirm cancellation
↓
Soft delete
↓
Grace period
↓
Purge
```

## 10.7 Nightly reconciliation

Compare:

- SamCart subscriptions
- App subscriptions
- Entitlements
- Kit tags

Detect:

- Paying/no access
- Access/not paying
- Orphaned subscription
- Duplicate subscription

Auto-fix safe drift and alert for unsafe drift.

## 10.8 Billing admin

Build:

- Billing health
- MRR
- Churn
- Failed payments
- Cancellation reasons
- Subscription timeline
- Entitlement timeline
- Manual grants
- Reconciliation report
- Webhook failures

### Gate

All billing acceptance tests from this BUILD.md must pass.

---

# 11. PHASE 3 — COURSES & LEARNING

**Status:** Vertical slice in app. Original `weeknight-plants` course, entitlement-gated player, progress, lesson threads, and campus calendar. Cloudflare Stream keys optional (`DEC-014`). Mighty extraction still blocked (`DEC-003`).

## Course model

```text
Course
 └── Section
      └── Lesson
```

Lesson types:

- Video
- Text
- Audio
- Download
- Quiz/reflection
- Live session

## Video

Use Cloudflare Stream or equivalent.

Requirements:

- Signed expiring URLs
- Entitlement check
- Adaptive playback
- Resume
- Speed control
- Captions
- Chapters
- Mobile support
- Keyboard support

Never expose permanent paid video URLs.

## Progress

Track:

- Lesson progress
- Course progress
- Last watched position
- Completion
- Continue learning

## Course experience

Dashboard:

- Continue learning
- Progress
- Current course
- Recommended next lesson

Course page:

- Hero
- Overview
- Instructor
- Sections
- Progress
- Lessons
- Resources
- Community discussion

## Course comments

Each lesson has a community discussion thread.

## Events

- Calendar
- List view
- Timezone aware
- RSVP
- Capacity
- Recurring events
- Zoom links in v1
- Add to calendar
- Reminders
- Recordings

### Gate

A complete course must play from start to finish with correct entitlement gating and progress tracking.

---

# 12. PHASE 4 — SOCIAL CONNECTION

This is a key differentiator.

## 12.1 Member matching

Weekly matching based on:

- Interests
- Skill
- Timezone
- Prior interaction

Generate:

- Match
- Reason
- Conversation starter

Opt-in and pausable.

## 12.2 People you should meet

Dashboard/directory:

- 3–5 suggestions
- Explicit reason
- Shared interests
- Shared spaces
- Similar progress
- Activity recency
- Prior interaction penalty

## 12.3 Cohorts

Automatically group:

- New members
- Course starters

Provide:

- Intro prompt
- First cook
- Goal
- Private cohort space

## 12.4 Recognition

Badges:

- First Cook
- Ten Plates
- Kitchen Helper
- Question Answered
- Milestone Streak
- Track Complete
- Gluten-Free Wizard
- Recipe Remixer
- Challenge Finisher
- Connector
- Local Guide
- One Year In

No points.
No competitive leaderboard.
No meaningless login badges.

Recognition should appear in the feed.

---

# 13. PHASE 4A — DIRECT MESSAGES

Support:

- 1:1 DMs
- Small groups
- Realtime delivery
- Typing indicators
- Read receipts
- Image sharing
- Link sharing
- Block
- Report
- Unread counts

Server-side permission checks are mandatory.

---

# 14. PHASE 4B — PERSONALIZED LEARNING ROADMAP

## Four member answers

- Cook Vibe
- Suckiest Thing
- Gluten Free
- Primary Benefit

## Personalization architecture

Do NOT create 128 separate roadmaps.

Use:

```text
Cook Vibe = Track
Gluten Free = Filter
Suckiest Thing = Constraint
Primary Benefit = Framing
```

Tracks:

- New
- Busy
- Family
- Advanced

## Roadmap milestone

Exactly four core slots:

1. Topic
2. Lesson
3. Recipe
4. Learning goal

Optional:

5. Community action

## Cadence

- Weekly
- Biweekly
- Monthly
- Self-paced

Support:

- Pause
- Skip
- Recipe swap
- Track switch
- Restart

## Completion

Milestone completes when:

- Learning goal marked done
- AND lesson watched to 80% OR cooked-it post created

Then:

- Update streak
- Unlock next milestone
- Trigger automation
- Celebrate capability gained

## Admin authoring

Admin must be able to:

- Create tracks
- Reorder milestones
- Pick lessons
- Pick recipes
- Create variants
- Edit framing
- Preview combinations
- Draft/publish
- Version tracks
- View analytics

---

# 15. PHASE 4C — AUTOMATION ENGINE / MARKETING

## Rule model

```text
IF trigger
AND conditions
THEN actions
```

Triggers:

- Inactivity
- Re-engagement
- Join date
- Course progress
- Course completion
- Posts
- Anniversary
- Subscription changes
- Cancellation
- Badge
- Space membership
- Roadmap events
- Challenge events
- Recipe variation
- Gathering
- Testimonials

Actions:

- Kit tag
- Kit field
- In-app notification
- Web push
- Transactional email
- Add/remove space
- Badge
- Admin task
- AI draft queue

## Required controls

- Dry run
- Preview affected members
- Pause all automations
- Retry
- Execution history
- Error state
- Idempotency
- Audit trail

## Initial rules

Implement:

- 14-day inactive
- 30-day at risk
- 60-day ghost
- Reactivated
- New member
- Never posted
- First post
- Course stalled
- Course completed
- Payment trouble
- Anniversary
- Roadmap milestone due
- Roadmap missed
- Roadmap stalled
- Local host nudge
- Nearby happening

---

# 16. PHASE 4D — AI COHOST

AI is an assistant, not an autonomous publisher.

## Generation

Generate community prompts from:

- Adam's voice profile
- Recent engagement
- Community themes
- Unanswered questions
- Events
- Courses
- Season
- Target space
- Prompt configuration

## Prompt types

- Experience
- Opinion
- Problem-solving
- Show-and-tell
- Poll
- Seasonal
- Member spotlight

## Guardrails

Reject/regenerate if:

- Health claim
- Banned term
- Positive reference to non-vegan content
- Too similar to recent prompt
- Too long
- Multiple questions stacked together

## Approval queue

Admin actions:

- Approve
- Edit + approve
- Regenerate
- Reject
- Snooze
- Bulk approve

**There is NO auto-publish mode in v1.**

## Schedule

Support:

- Multiple spaces
- Day-of-week controls
- Per-day publish time
- Draft count
- Timezone
- Lead time
- Blackout dates
- Pause
- Backpressure

If stale drafts exceed threshold, generation pauses automatically.

---

# 17. PHASE 4E — CHALLENGES

Build seasonal low-pressure challenges.

Support:

- Theme
- Cover
- Start/end
- Daily prompts
- Total prompts
- Target
- Dedicated space/thread
- Cohort scope
- Opt-in
- Progress
- Completion
- Badge
- Kit tag

No ranking.

---

# 18. PHASE 4F — RECIPE VARIATIONS

Members can publish:

- Changes
- Reason
- Photo
- Optional adjusted ingredients

Support:

- Parent recipe
- Moderation
- Reactions
- Featured variations
- Vegan validation
- Tested-by-N proof
- Recipe Remixer badge

---

# 19. PHASE 4G — MEMBER BULLETIN BOARD

Tabs:

1. Happenings
2. Member Services
3. The Map

## Privacy

Never store member home address in profile.

Store:

- City
- Region
- Country
- City centroid

Exact event address:

- Encrypted
- Event-specific
- Revealed only to approved attendees

Never put private address in:

- URL
- Query string
- Email subject
- Public export

## Happenings

Support:

- Potluck
- Meal
- Tea
- Class
- Market
- Art
- Volunteer
- Other

Support RSVP approval for home gatherings.

## Member Services

One card per member.

Moderate:

- Accuracy
- Vegan compliance
- No medical claims
- No MLM
- No animal products

## Map

Members can submit vegan businesses.

Use a places provider such as Google Places if approved.

Store local place records and cache aggressively.

Support:

- Search
- Map
- List
- Categories
- Vegan status
- Testimonials
- Photos
- Reports
- Closure checks

---

# 20. PHASE 4H — CLEAN PLATE CLUB SSO

Community platform is the identity provider.

Support:

- Signed token
- Verified email matching
- Entitlement-aware access
- Cross-navigation
- Minimal shared dietary data

Do not merge unrelated progress systems in v1.

---

# 21. PHASE 5 — MIGRATION FROM MIGHTY

## Reality

Mighty member lists are exportable.

Courses/posts do not have a standard bulk export.

Therefore migration must be engineered deliberately.

## Members

Reconcile:

```text
Mighty
Kit
SamCart
```

Match by email.

SamCart is authoritative for billing.

Preserve join dates.

Flag discrepancies.

Use magic-link invitations.

## Courses

Prefer originals.

If extraction is necessary:

- Extract structure
- Preserve order
- Preserve metadata
- Preserve media references
- Validate manually

Course progress may be unrecoverable and must be treated as a decision.

## Forum

Potential authenticated crawl.

Requirements:

- Rate limit
- Raw response storage
- Author matching
- Pagination
- Validation

Decision:

- Full import
- Read-only archive

Do not silently choose.

## Cutover

1. Staging
2. 5–10 volunteer users
3. Parallel test
4. Member announcement
5. Magic-link migration
6. Daily reminders
7. Mighty read-only
8. 30-day safety period
9. Verification gate
10. Final export
11. Cancel Mighty

Verification gate:

- >=80% active members signed in
- All courses playable
- Reconciliation clean for 7 consecutive days
- Zero unresolved billing discrepancies

---

# 22. PHASE 6 — PWA / MOBILE

PWA is required for v1.

## Manifest

- App name
- Icons
- Theme color
- Standalone display
- Correct metadata

## Service worker

- Offline shell
- Cached assets
- Offline messaging

## Push

- Web push
- iOS installed-PWA support

## Install prompt

Show after second mobile visit.

## Mobile quality

- Touch targets >=44px
- Safe-area support
- No hover-dependent interactions
- Responsive layouts
- Mobile-friendly video
- Mobile-friendly editor
- Mobile-friendly navigation

## Performance

Target:

- Lighthouse mobile >=85
- FCP <1.5s on 4G
- Feed server response <500ms
- Video start <2s

---

# 23. PHASE 7 — SECURITY

Mandatory:

- Server-side authorization
- Secure cookies
- CSRF protection
- Rate limiting
- Parameterized queries
- Input validation
- Output escaping
- Webhook verification
- Signed video URLs
- Expiring download URLs
- Audit logs
- Secret management
- Dependency scanning
- Admin action logging
- Abuse prevention
- DM blocking/reporting
- Content moderation

Never trust client-side permission state.

---

# 24. PHASE 8 — PRIVACY & ACCESSIBILITY

## Privacy

- Privacy policy
- Terms
- Data export
- Account deletion
- Email opt-out
- Kit commercial opt-out preservation
- Location privacy
- Exact-address protection

## Accessibility

Target WCAG 2.1 AA.

Required:

- Keyboard navigation
- Visible focus
- Contrast
- Semantic headings
- Alt text
- Captions
- Accessible forms
- Screen-reader primary flows
- Reduced motion support
- No color-only meaning

---

# 25. PHASE 9 — ADMIN EXPERIENCE

Admin modules:

## Overview

- Member growth
- Active members
- Revenue
- MRR
- Churn
- Engagement
- Course progress
- Billing health
- Alerts

## Members

- Search
- Filter
- Profile
- Subscription
- Entitlements
- Activity
- Kit tags
- Support notes
- Manual access
- Impersonation with logging/time limit

## Billing

- Reconciliation
- Failed payments
- Cancellations
- Refunds
- Subscription status
- Entitlement drift

## Content

- Moderation
- Reports
- Scheduled posts
- Pinned posts

## Engagement

- DAU
- WAU
- MAU
- Posts
- Comments
- Course completion
- Space activity
- At-risk members

## Automation

- Rules
- Dry run
- Execution logs
- Failures

## AI

- Prompt queue
- Voice profile
- Banned words
- Schedule
- Analytics

## Roadmap

- Tracks
- Milestones
- Variants
- Preview
- Publishing
- Versioning
- Analytics

---

# 25A. CLIENT SALES-PAGE BUILD (homepage + /membership)

Built to the client copy brief (`vumembershipcopy`). That document is the
authority on wording; do not paraphrase its copy. It lives in code at
`lib/marketing/copy.ts`.

Enforced rules, each covered by a test in `tests/marketing.test.ts`:

- **One CTA, repeated.** Every button on both pages reads "Become a member" and
  points at the SamCart checkout with `#samcart-slide-open-right`. No
  "peek at the community", no "see the catalog", no newsletter.
- **No member counts**, exact or otherwise, on either page.
- **No stock or AI photography.** Unfilled slots are flagged (`DEC-018`).
- **No invented urgency.** Only the real next live cook-along date.
- **No newsletter signup** anywhere in the marketing footer.

Structure:

| Piece | Where |
|---|---|
| Copy (verbatim client text) | `lib/marketing/copy.ts` |
| Checkout URL / label / pricing | `lib/marketing/checkout.ts` |
| Photo + video manifest | `lib/marketing/assets.ts` |
| Catalog rows from live data | `lib/marketing/catalog.ts` |
| Heatmap from real geo import | `lib/marketing/heatmap.ts` |
| Senja widgets | `components/marketing/senja-embed.tsx` |
| Motion (embers, reveals, sticky CTA) | `components/marketing/` |

SamCart's slide script loads with `strategy="afterInteractive"`. It rewrites
checkout hrefs and injects `<sc-slide>`; loading it in `<head>` made it mutate
the DOM before hydration and React reported a mismatch.

## Waiting on the client

- Real photography for 6 homepage slots and dish photos for 52 catalog cards
  (WordPress media library on cinnamonsnail.com)
- Teaser videos per class (Drive folder or YouTube access)
- Sales video "Vegan University Sale2" — hosted URL or embed
- Mighty Networks member export for the heatmap
- The extra FAQs on `shop.cinnamonsnail.com/products/monthly-subscription`
  (the page is JS-rendered and could not be read; the four FAQs in the brief
  are live)
- Confirmation on the Senja homepage widget, which renders its own avatar row
  and a "JOIN THOUSANDS OF VEGAN COOKS!" headline — close to the avatar strip
  and member count the brief asked to remove. Editable in Senja.

---

# 26. MARKETING / PUBLIC WEBSITE

Public pages should be separate from member application experience.

Build premium public pages for:

- Home
- Membership
- Courses
- Community
- About
- Public events where appropriate
- FAQ
- Terms
- Privacy

SEO:

- SSR
- Metadata
- OG images
- Structured headings
- Canonicals where needed

Member-only pages must be `noindex`.

The marketing site should sell the experience rather than look like a technical SaaS product.

---

# 27. UX STATES — REQUIRED EVERYWHERE

Every meaningful feature must implement:

### Loading

- Skeleton where appropriate
- No layout jump
- Clear loading feedback

### Empty

Explain:

- What is empty
- Why
- What the user can do next

### Error

Explain:

- What happened
- Whether retry is possible
- What action to take

### Success

Use concise feedback.

### Permission denied

Never expose data the user should not see.

### Offline

PWA should provide graceful messaging.

---

# 28. PERFORMANCE ENGINEERING

Required:

- Server rendering where appropriate
- Streaming where useful
- Cursor pagination
- Lazy loading
- Responsive images
- WebP/AVIF
- CDN
- Cached queries
- Background processing
- Avoid N+1 queries
- Database indexes
- Query profiling
- Optimistic UI only when safe

Do not sacrifice correctness for superficial speed.

---

# 29. TESTING STRATEGY

Every feature requires:

## Unit tests

Business logic.

## Integration tests

- Database
- Auth
- Billing
- Entitlements
- Webhooks
- Jobs
- Kit sync

## E2E tests

Critical user journeys:

1. Sign up
2. Magic link
3. Complete profile
4. Join space
5. Create post
6. Comment
7. React
8. Search
9. Buy membership
10. Entitlement granted
11. Course access
12. Video playback
13. Progress
14. Cancellation
15. Refund
16. Failed payment
17. Recovered payment
18. Account deletion
19. Admin moderation
20. AI approval
21. Roadmap activation
22. Roadmap completion
23. Event RSVP
24. Bulletin board privacy

## Required final checks

```bash
typecheck
lint
test
build
```

Use the repository's actual package manager/scripts.

---

# 30. ACCEPTANCE TESTS — BILLING

These are release blockers.

- [x] Purchase creates access.
- [ ] Purchase applies Kit tag within target window.
- [ ] Cancellation propagates to SamCart.
- [x] Cancellation updates access correctly.
- [ ] Kit state updates.
- [x] Access remains until period end when policy requires.
- [x] SamCart-side cancellation propagates.
- [x] Failed payment sets past_due and keeps access.
- [x] Recovery restores access.
- [x] Delinquency revokes access.
- [x] Refund revokes immediately.
- [x] Failed cancellation API does not falsely show cancellation.
- [x] Duplicate webhooks are idempotent.
- [x] Nightly reconciliation detects/fixes drift.
- [x] Paying/no access is auto-fixed.
- [x] Access/not paying is flagged safely.
- [x] Orphaned subscriptions alert.
- [x] Duplicate subscriptions alert.
- [x] Account deletion routes through cancellation.
- [x] Different sign-in/billing email can be reconciled.
- [ ] Daily reconciliation email is sent even when clean.

---

# 31. OBSERVABILITY

Use Sentry or equivalent.

Track:

- Exceptions
- API failures
- Job failures
- Webhook failures
- Billing failures
- Video failures
- Authentication failures

High-priority billing failures must alert the responsible admin.

Health endpoint required.

Daily backup restore must be demonstrated.

---

# 32. ANALYTICS

Track product behavior without exposing sensitive internal scores to members.

Core:

- Sign-ins
- Active users
- Posts
- Comments
- Reactions
- Course starts
- Course completions
- Video completion
- Events
- RSVP
- DM usage
- Roadmap activation
- Roadmap completion
- Challenge participation
- Recipe variations
- Gatherings
- Retention
- Churn

Member health score may exist internally for admin use but must never be exposed to members.

---

# 33. REPOSITORY DOCUMENTATION

Must maintain:

```text
README.md
BUILD.md
DECISIONS.md
docs/mighty-parity-checklist.md
docs/discovery-report.md
docs/billing-architecture.md
docs/migration-reconciliation-report.md
docs/admin-user-guide.md
docs/incident-runbook.md
```

README must cover:

- Setup
- Environment variables
- Database
- Migrations
- Local development
- Testing
- Deployment
- Jobs
- Integrations
- Troubleshooting

---

# 34. DECISION MANAGEMENT

Any item in this BUILD.md marked:

```text
[DECISION NEEDED]
```

must not be silently resolved.

Create:

```text
DECISIONS.md
```

Format:

```md
## DEC-001 — Cancellation Timing

Status: BLOCKED

Question:
Should cancellation be immediate or end-of-period?

Options:
A. Immediate
B. End of current billing period

Impact:
...

Decision:
...

Date:
...

Approved by:
...
```

If a decision blocks a phase, continue only with independent work.

---

# 35. CLAUDE CODE EXECUTION LOOP

For EVERY implementation chunk:

### Step 1 — Read

Read:

- BUILD.md
- Relevant original specification section
- Existing code

### Step 2 — Inspect

Inspect:

- Architecture
- Routes
- Components
- Schema
- Services
- Tests
- Environment

### Step 3 — Plan

Before coding, create a short implementation plan.

### Step 4 — Implement

Build complete vertical functionality.

Not:

```text
UI only
```

Instead:

```text
UI
+
API
+
DB
+
Validation
+
Authorization
+
Errors
+
Loading
+
Tests
+
Analytics
+
Admin
```

where applicable.

### Step 5 — Verify

Run:

- Typecheck
- Lint
- Tests
- Build

### Step 6 — Review

Check:

- Mobile
- Accessibility
- Security
- Performance
- Edge cases
- Empty states
- Error states
- Permission boundaries

### Step 7 — Update BUILD.md

Mark completed items only when verified.

### Step 8 — Report

End every chunk with:

```text
Implemented:
Changed:
Database:
Integrations:
Tests:
Verification:
Known issues:
Decisions needed:
Next chunk:
```

---

# 36. DEFINITION OF DONE

A feature is DONE only when all applicable conditions are true:

- [ ] UI complete
- [ ] Responsive
- [ ] Accessible
- [ ] Backend complete
- [ ] Database complete
- [ ] Validation complete
- [ ] Authorization complete
- [ ] Error handling complete
- [ ] Loading states complete
- [ ] Empty states complete
- [ ] Integration complete
- [ ] Retry handling complete
- [ ] Audit logging complete where required
- [ ] Analytics complete where required
- [ ] Tests complete
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Build passes
- [ ] Manual verification passes
- [ ] Documentation updated

---

# 37. RELEASE GATES

## Alpha

- Foundation works
- Auth works
- Community works
- No critical security issues

## Billing-ready

All billing acceptance tests pass.

## Course-ready

Complete course works with entitlement gating.

## Migration-ready

Migration scripts and reconciliation validated.

## Beta

- 5–10 real test members
- Core flows stable
- Billing validated
- Mobile validated
- PWA validated

## Launch-ready

- 80%+ active members signed in
- Courses verified
- Billing clean
- Reconciliation clean for 7 days
- No critical bugs
- Backups verified
- Monitoring active
- Support runbook ready

---

# 38. PHASE ORDER — DO NOT RANDOMIZE

The official execution order is:

```text
PHASE 0
Discovery + Architecture
        ↓
PHASE 1
Foundation + Community
        ↓
PHASE 2
Billing + Entitlements
        ↓
PHASE 3
Courses + Learning
        ↓
PHASE 4
Social + Messaging
        ↓
PHASE 4B
Personalized Roadmap
        ↓
PHASE 4C
Automation + Marketing
        ↓
PHASE 4D
AI Cohost
        ↓
PHASE 4E
Challenges + Recipe Variations
        ↓
PHASE 4F
Bulletin Board + Map
        ↓
PHASE 4G
Clean Plate Club SSO
        ↓
PHASE 5
Migration
        ↓
PHASE 6
PWA + Performance + Security
        ↓
PHASE 7
Production Launch
        ↓
PHASE 8
Optional Native Apps
```

Billing intentionally comes before full course implementation because access architecture must be correct before protected learning content is built.

---

# 39. MASTER FEATURE MATRIX

| Reference Capability | Vegan University Implementation |
|---|---|
| Community | Spaces, feeds, posts, comments, reactions, polls, events, DMs |
| Courses | Courses, lessons, video, resources, progress, comments |
| Members | Profiles, directory, search, matching, cohorts |
| Marketing | Kit sync, automation rules, lifecycle events |
| Payments | SamCart integration, subscriptions, entitlements, reconciliation |
| Admin | Members, billing, moderation, analytics, automations, AI |
| AI Cohost | Prompt generation, approval queue, scheduling, analytics |

---

# 40. PREMIUM UI QUALITY BAR

Claude Code must reject its own UI if it looks like a generic SaaS template.

Before accepting a page ask:

### Does it feel like Vegan University?

- Is there a human/content focus?
- Does food imagery have a role where appropriate?
- Is the hierarchy editorial?
- Are colors peach + near-black + one orange accent (not a multi-color or dark-green system)?
- Is the experience inviting?
- Does it feel premium?
- Does it feel community-oriented?
- Is the design consistent?
- Does mobile feel intentional?
- Are cards used for meaningful content rather than everything?

### Avoid

- Dark dashboard everywhere
- Neon green
- Excessive glassmorphism
- Huge gradients
- Generic stat cards
- Excessive rounded rectangles
- Tiny typography
- Dense tables in member experience
- AI-generated-looking visual clutter

---

# 41. FINAL CLAUDE CODE SYSTEM INSTRUCTION

Claude Code must operate under the following instruction while building this project:

> You are the senior staff engineer and product designer responsible for delivering Vegan University's production platform.
>
> Treat `BUILD.md` as the sole execution contract and implementation source of truth.
>
> Do not merely analyze the requirements. Implement them.
>
> Do not stop at UI mockups. Build the complete vertical slice including database, server logic, authorization, integrations, jobs, validation, errors, loading states, tests, and admin controls where applicable.
>
> Preserve working code.
>
> Never invent missing business decisions. Record `[DECISION NEEDED]` items and do not silently choose.
>
> Never use fake production data to hide an incomplete integration.
>
> Keep billing and entitlement logic server-side and authoritative.
>
> Make all webhooks idempotent.
>
> Use background jobs for long-running/retryable work.
>
> Keep secrets out of source control.
>
> Build mobile-first and PWA-ready.
>
> Target WCAG 2.1 AA.
>
> Target the documented performance budgets.
>
> The member-facing UI must feel like a premium vegan cooking school + community, not a generic SaaS dashboard.
>
> Use the defined visual system: peach/cream page ground, white rounded cards, near-black type, one vivid orange accent (headline words, tags, stats), solid black pill buttons, Outfit sans (no serif), contained photography, generous whitespace, and one restrained motion moment. Support light and dark modes.
>
> Use the listed Mighty Networks capabilities as product references. Do not copy their UI. Build a better, differentiated Vegan University experience, especially around social connection, billing clarity, personalization, and automation.
>
> After each chunk:
>
> 1. Verify the implementation.
> 2. Run relevant tests.
> 3. Run typecheck/lint/build where applicable.
> 4. Update `BUILD.md`.
> 5. Document changed files and database changes.
> 6. Document known issues.
> 7. Document decisions needed.
> 8. State the exact next chunk.
>
> Never claim completion without verification.

---

# 42. CURRENT BUILD STATUS

Update this section continuously.

**Last updated:** 2026-09-10  
**Currently building:** Phase 4 social connection and 4A direct messages are in. Client sales-page copy build (homepage + `/membership`) is in. Blocked on client-supplied media, the Mighty member-geography export, and live SamCart keys.  
**Auth:** Resend magic-link e2e verified. Password login and logout verified.  
**Community gate:** Signed-in Adam completed the Phase 1 community loop.  
**Billing policy:** Cancellation access follows SamCart’s reported period (31-day window on trial products `1069358` and `1069354`). Account deletion grace is 7 days.  
**From address:** `EMAIL_FROM` is `Vegan University <onboarding@resend.dev>` until a VU domain is verified (`DEC-009`).  
**Courses:** Original `weeknight-plants` campus course with entitlement-gated playback, captions, progress, lesson threads, and calendar RSVP. Cloudflare Stream keys are not required for the demo path (`DEC-014`). Mighty extraction remains blocked (`DEC-003`).

Seeded local accounts (password `vegan-local-dev`):
- `adam@veganuniversity.test` (admin)
- `member@veganuniversity.test` (member)

## Phase 0
- [x] Discovery
- [x] Repository audit
- [x] Architecture decision
- [x] Mighty parity checklist
- [x] Integration inventory
- [x] Schema plan
- [x] Decisions list

## Phase 1
- [x] Auth
- [x] Profiles
- [x] Spaces
- [x] Feed
- [x] Posts
- [x] Comments
- [x] Reactions
- [x] Notifications — in-app; email/web push later
- [x] Search — FTS + trigram/ilike fallback, type and space filters
- [x] Admin shell

## Phase 2
- [x] Products
- [x] SamCart integration — webhook + `sc-api` client; live keys not in local `.env` yet
- [x] Webhooks
- [x] Entitlements
- [x] Kit sync — attempted and logged; does not pretend success without keys
- [x] Cancellation — local update only after SamCart confirms; access follows SamCart `period_end` (`DEC-001`)
- [x] Reconciliation
- [x] Billing admin
- [x] Billing tests — unit + local DB integration; live SamCart/Kit acceptance still open

## Phase 3
- [x] Courses — original VU catalog; Mighty import blocked (`DEC-003`)
- [x] Sections
- [x] Lessons — video, text, reflection
- [x] Video — entitlement-gated expiring tokens; Stream when keys exist (`DEC-014`)
- [x] Captions — VTT on demo video lessons
- [x] Resources
- [x] Progress — resume position, percent, continue learning
- [x] Course comments — lesson threads in Course Hall
- [x] Events — timezone list, RSVP/capacity, ICS, 24h reminder job; Zoom field unused until a real session exists

## Phase 4
- [x] DMs — 1:1 + small groups, unread counts, read receipts, typing indicators, image/link sharing, block, report, leave. Polling transport (`DEC-017`); every read and write behind a server-side membership gate.
- [x] Matching — weekly, idempotent per week, opt-in and pausable, 8-week repeat cooldown
- [x] People suggestions — 3–5 with an explicit reason; shared interests/spaces, similar progress, activity recency, prior-interaction penalty
- [x] Cohorts — automatic new-member and course-starter cohorts, each with intro prompt, first cook, goal, and a private space
- [x] Badges — 12 recognition badges, criteria-driven, awarded off the request path; no points, no leaderboard
- [ ] Spotlights — not started
- [x] Recognition — badge awards surface in the home feed rail and at `/connect/recognition`

## Phase 4B
- [ ] Survey answers
- [ ] Roadmap tracks
- [ ] Milestones
- [ ] Personalization
- [ ] Cadence
- [ ] Progress
- [ ] Admin authoring
- [ ] Kit roadmap sync

## Phase 4C
- [ ] Automation engine
- [ ] Rules
- [ ] Conditions
- [ ] Actions
- [ ] Dry run
- [ ] Execution logs
- [ ] Initial rules

## Phase 4D
- [ ] AI voice profile
- [ ] Prompt schedules
- [ ] Prompt generation
- [ ] Guardrails
- [ ] Similarity detection
- [ ] Approval queue
- [ ] Publishing
- [ ] Analytics

## Phase 4E
- [ ] Challenges
- [ ] Recipe variations
- [ ] Moderation
- [ ] Badges

## Phase 4F
- [ ] Happenings
- [ ] Member Services
- [ ] Map
- [ ] Places
- [ ] Testimonials
- [ ] Privacy controls

## Phase 4G
- [ ] Clean Plate Club SSO
- [ ] Entitlement-aware access

## Phase 5
- [ ] Member migration
- [ ] Course migration
- [ ] Forum migration/archive
- [ ] Reconciliation
- [ ] Parallel run
- [ ] Cutover

## Phase 6
- [ ] PWA
- [ ] Offline shell
- [ ] Push
- [ ] Install prompt
- [ ] Performance
- [ ] Accessibility
- [ ] Security audit
- [ ] SEO

## Phase 7
- [ ] Production deployment
- [ ] Monitoring
- [ ] Backups
- [ ] Restore verification
- [ ] Launch
- [ ] Support runbook

## Phase 8
- [ ] Native decision review
- [ ] Native shell if metrics justify it

---

# 43. IMPORTANT SOURCE-OF-TRUTH RULE

This file should be committed to the repository.

Claude Code must not create a competing roadmap such as:

- `ROADMAP.md`
- `PLAN.md`
- `TODO.md`

unless explicitly requested.

If additional planning documents are necessary, they must link back to `BUILD.md` and never override it.

`BUILD.md` remains the master execution state.

---

# 44. END-OF-SESSION REQUIREMENT

Before ending any Claude Code session, update:

```text
BUILD.md
DECISIONS.md
```

where applicable.

The next developer/agent must be able to open the repository and immediately understand:

- What has been built
- What is currently being built
- What is blocked
- What remains
- Which decisions are pending
- Which tests pass
- Which tests fail
- What should happen next

The project must never depend on hidden conversation context.

---

# 45. FINAL SUCCESS DEFINITION

The project is successful when Vegan University can operate as a real independent membership business without depending on Mighty Networks for its core community/course experience.

A member can:

- Join
- Sign in
- Build a profile
- Discover community
- Meet people
- Post
- Comment
- Message
- Attend events
- Learn through courses
- Track progress
- Follow a personalized roadmap
- Participate in challenges
- Share recipes
- Discover vegan businesses
- Attend local gatherings
- Receive useful notifications
- Manage billing
- Cancel correctly
- Delete their account safely

And administrators can:

- Manage members
- Manage access
- Monitor billing
- Moderate content
- Author courses
- Author roadmaps
- Run automations
- Review AI content
- Analyze engagement
- Manage community events
- Manage migration
- Operate the platform without developer intervention for normal operations.

The final product should feel less like a replacement for a SaaS platform and more like a **premium digital home for the Vegan University community**.
