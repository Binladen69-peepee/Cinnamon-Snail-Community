# Mighty Networks Parity Checklist

**Source:** `BUILD.md` capability references  
**Live audit:** Not performed — no Mighty Networks access in this environment  
**Rule:** Every referenced capability is marked Built, Deferred, Intentionally dropped, or Decision needed.

Legend:

- **Built** — implemented and verified in Vegan University
- **Deferred** — planned for a later BUILD.md phase
- **Intentionally dropped** — will not be copied
- **Decision needed** — cannot proceed without a product decision

## Navigation

| Capability | Status | Notes |
|---|---|---|
| Desktop member nav (Home, Community, Courses, Members, Roadmap, Events, Bulletin, Messages, Search, Notifications, Profile) | Deferred | Shell in Phase 1; later items remain honest empty/later-phase states |
| Separate admin area | Deferred | Admin shell in Phase 1 |
| Mobile tab bar (Home, Community, Courses, Roadmap, Profile) + compose | Deferred | Phase 1 |
| Do not copy Mighty visual IA | Intentionally dropped | Vegan University editorial IA |

## Spaces

| Capability | Status | Notes |
|---|---|---|
| Named spaces with cover, description, icon | Deferred | Phase 1 |
| Access rules, visibility, posting permissions | Deferred | Phase 1 |
| Space hosts | Deferred | Phase 1 |
| Feed / Course / Events / Chat / Members space kinds | Deferred | Phase 1 kinds; course/chat depth later |

## Feed

| Capability | Status | Notes |
|---|---|---|
| Post types (simple, article, question, poll, event, link, image, video, recipe-aware) | Deferred | Phase 1 |
| Rich text, mentions, emoji, GIFs, attachments, embeds | Deferred | Phase 1 markdown + URL/GIF; full TipTap editor later if needed |
| Comments + threaded replies | Deferred | Phase 1 |
| Reactions, save, share, report, pin | Deferred | Phase 1 |
| Draft + scheduling | Deferred | Phase 1 |
| Cursor pagination | Deferred | Phase 1 |

## Courses

| Capability | Status | Notes |
|---|---|---|
| Course → section → lesson | Deferred | Phase 3 |
| Signed video, captions, resume, progress | Deferred | Phase 3 |
| Lesson discussion | Deferred | Phase 3 |
| Mighty course export | Decision needed | See `DEC-003` — originals preferred |

## Members

| Capability | Status | Notes |
|---|---|---|
| Profiles, directory, privacy, DM prefs | Deferred | Phase 1 |
| Matching / people you should meet / cohorts | Deferred | Phase 4 |
| Mighty profile field mapping | Decision needed | Which Mighty fields to import vs drop |

## Events

| Capability | Status | Notes |
|---|---|---|
| Calendar, RSVP, timezone, reminders | Deferred | Phase 3 |
| Zoom links in v1 | Deferred | Phase 3 |

## Notifications

| Capability | Status | Notes |
|---|---|---|
| In-app / email / web push | Deferred | In-app Phase 1; email Phase 1 where Resend configured; web push Phase 6 |
| Replies, mentions, DMs, space activity, events, announcements, digests | Deferred | Categories modeled in Phase 1 |

## Search

| Capability | Status | Notes |
|---|---|---|
| Postgres FTS + trigram fallback | Deferred | Phase 1 |
| Posts, comments, courses, lessons, events, members | Deferred | Phase 1 indexes available types |

## Messaging

| Capability | Status | Notes |
|---|---|---|
| 1:1 and small groups, realtime, receipts | Deferred | Phase 4A |

## Admin

| Capability | Status | Notes |
|---|---|---|
| Members, billing, moderation, automations, AI, roadmap | Deferred | Shell Phase 1; modules by phase |

## Billing behavior

| Capability | Status | Notes |
|---|---|---|
| SamCart as money source of truth | Deferred | Phase 2 |
| App entitlements as access source of truth | Deferred | Phase 2 |
| Cancellation UX without dark patterns | Deferred | Phase 2; timing is `DEC-001` |
| Nightly reconciliation | Deferred | Phase 2 |

## Member profile behavior

| Capability | Status | Notes |
|---|---|---|
| City-level location only (no home address) | Deferred | Phase 1 |
| Cooking interests, skill, dietary, links | Deferred | Phase 1 |
| Directory visibility | Deferred | Phase 1 |

## Mobile behavior

| Capability | Status | Notes |
|---|---|---|
| Mobile-first layouts, 44px targets, safe areas | Deferred | Phase 1 + Phase 6 polish |
| PWA install + push | Deferred | Phase 6 |

## Intentionally dropped (Mighty-specific, not VU)

| Item | Reason |
|---|---|
| Mighty visual design / chrome | Product must not look like Mighty or generic SaaS |
| Points, competitive leaderboards, login badges | `BUILD.md` forbids them |
| Client-side permission checks as source of truth | Security rule |
| Checking SamCart/Kit during normal authorization | Entitlements only |

## Decision needed (cannot silently choose)

| ID | Topic |
|---|---|
| DEC-001 | Cancellation immediate vs end-of-period |
| DEC-003 | Course progress recoverability / Mighty course extraction |
| DEC-004 | Forum full import vs read-only archive |
| DEC-005 | Google Places (or equivalent) approval for The Map |
| DEC-006 | Which Mighty profile fields to migrate |
