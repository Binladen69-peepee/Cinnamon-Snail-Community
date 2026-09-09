# Schema Plan

PostgreSQL is the system of record. Prisma owns the relational schema. Full-text search uses Postgres `tsvector` + `pg_trgm`, applied in a follow-up SQL migration after the Prisma baseline.

JSONB is used only for genuinely flexible payloads (poll options, rich mention metadata, provider webhook bodies, dietary/interest lists).

## Identity and access

- `User` — Auth.js-compatible identity, optional password hash, status, deletion timestamps
- `UserEmail` — multiple emails per user; verified emails participate in identity matching
- `Account` / `Session` / `VerificationToken` — Auth.js adapter tables
- `Profile` — public member card; city/region/country + centroid only (never home address)
- `Role` / `UserRole` — `MEMBER`, `HOST`, `ADMIN`, `SUPER_ADMIN`

Authorization for application features reads **entitlements** (Phase 2) plus role/space membership. Phase 1 community authorization uses space membership + roles until billing is live. A development entitlement grant is seeded so the access-checking function exists and is the only API other modules call.

## Community

- `Space`, `SpaceMembership`
- `Post`, `PostAttachment`, `PostMention`, `PollOption`, `PollVote`
- `Comment` (self-relation for threads)
- `Reaction`, `Bookmark`, `Report`
- `Notification`

## Search

- `SearchIndex` — denormalized title/body per entity
- Generated `tsvector` column + GIN + trigram indexes (SQL migration)

## Learning (tables in Phase 1; player in Phase 3)

- `Course`, `CourseSection`, `Lesson`, `LessonProgress`, `CourseProgress`, `Resource`

## Events

- `Event`, `EventRsvp`

## Messaging (tables in Phase 1; product in Phase 4A)

- `Conversation`, `ConversationMember`, `Message`

## Billing

- `Product`, `SamcartProductMap`
- `Subscription`, `Entitlement`, `BillingEvent`
- `PendingGrant`, `CancellationRequest`, `ReconciliationRun`, `ReconciliationFinding`

Kit is never queried at request time. `KitSyncLog` records outbound sync.

## Later-phase tables (created now to avoid painful migrations)

- Automation: `AutomationRule`, `RuleExecution`
- AI: `AiPromptSchedule`, `AiPromptDraft`
- Roadmap: `RoadmapTrack`, `RoadmapMilestone`, `MemberRoadmap`, `MemberMilestoneProgress`
- Recognition: `Badge`, `MemberBadge`
- Challenges: `Challenge`, `ChallengeParticipant`
- Recipes: `Recipe`, `RecipeVariation`
- Bulletin: `MemberCard`, `Happening`, `HappeningRsvp`, `Place`, `PlaceTestimonial`
- `AuditLog`

## Access path (must not change)

```text
SamCart → webhook → billing_events → job → subscriptions → entitlements → authorization
```

Kit is a side effect of entitlement changes.
