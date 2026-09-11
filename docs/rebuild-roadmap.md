# Member app rebuild — roadmap

The signed-in app was removed and is being rebuilt. This is the order of work,
what each step delivers, and how we know it is done.

The marketing site (`app/(marketing)`) is **untouched** and stays live
throughout. So do Billing and Settings, which are account surfaces reached from
the avatar menu rather than the rail, and the whole of `lib/` — billing and
entitlements, permissions, search, uploads, notification delivery, feed ranking.
None of those are pages, and several are load-bearing for a paid product.

Work happens on `rebuild/member-app`. `master` stays deployable, so production
is never serving a half-rebuilt app.

## What was removed

59 files, 7,894 lines: every route in the rail (`/home`, `/discover`, `/spaces`,
`/members`, `/connect`, `/messages`, `/learn`, `/bulletin`, `/roadmap`,
`/calendar`, `/compose`, `/posts`, `/search`, `/notifications`), the member
shell and rails, and all 25 community/messages/learn components.

Restore point: `01f07cc`.

## Design direction: Reddit, in Vegan University's clothes

Reddit is the reference for **structure and density**, not for colour. The brand
stays: forest green, cream, Poppins and Inter.

What that means concretely, and why:

| Reddit trait | Why it applies here |
| --- | --- |
| Cards on a tinted ground | Cream ground with white cards already does this. It is the single most Reddit-identifying structural choice, and we had it by accident — now it is deliberate. |
| Tight radii (8px) | The old app used 16px cards, which reads soft and consumer-app. Reddit is 8px and reads like a tool. |
| High density | Reddit fits roughly twice as much on a screen. The old feed was generous to the point of sparse. |
| Vote rail on the left | Kept from the previous build at your explicit request. This is old-Reddit rather than new-Reddit's action-row pill. |
| Density toggle | Card / Compact, as Reddit has. Compact turns media into a right-hand thumbnail and doubles what fits on screen. |
| Sort as a bar above the feed | Hot / New / Top / Rising, in its own strip rather than floating. |
| Left rail of communities | Spaces with favourites, groups and unread — already proven in Phase 3, restyled. |
| Right rail "About" card | Community description, counts, rules, and the create button. |

Two things deliberately **not** copied: Reddit's orange (the brand accent stays
green) and Reddit's karma economy (no karma, no awards — this is a paid cooking
school, not an attention market).

## Phases

Each phase is shippable on its own and ends with a check you can run.

### 0 — Foundation — **done**

Tokens retuned for density (radii 16px → 8px, `--hairline-firm` added for hover
borders), the three-column shell with a fixed bar, the left rail, the phone tab
bar, and the account menu. Admin moved off the member shell onto its own plain
chrome.

*Verified:* shell renders, `/home` reachable, typecheck/lint/build clean.

### 1 — Feed (`/home`) — **done**

Post card in both densities, vote rail, action row, inline composer with the
upload pipeline, sort bar, Card/Compact toggle, threaded comments, discovery
rail.

*Verified:* both densities rendered and compared — compact fits five posts where
card fits one, with media collapsed to a thumbnail. Optimistic votes, reactions
and saves. Composer posts without navigating.

### 2 — Spaces (`/spaces`, `/spaces/[slug]`) — **done**

Directory grouped from the same `listNavSpaces` call the rail uses, so the two
cannot disagree. Space detail with a thin cover band, kind/visibility/host
metadata, kind-driven tabs, join/leave/favourite, pinned resources, and an About
rail. `lib/spaces` was preserved whole and reused.

*Verified:*

| Flow | How |
| --- | --- |
| Typed tabs | FEED → Posts/Members/About. COURSE adds Lessons. EVENTS adds Events. CHAT adds neither. Read from the rendered tab nav, not assumed. |
| Groups | Favourites, The Kitchen, Learning, Gatherings render as headings in both rail and directory. |
| Visibility | A private room is absent from a non-member's listing, and `canDiscover` 404s the page. Asserted in `tests/spaces-flow.integration.test.ts`. |
| Access | Self-serve join into a private room refuses; a host cannot leave their own room. |
| Unread | A post by someone else raises the count; the author never sees their own; visiting clears it. |
| Join/leave | Round-trips join → favourite → unfavourite → leave against the database, including the favourite being moved rather than duplicated. |
| Pinned resources | Returned in sort order; every row has a label and URL. |
| Responsive | Zero horizontal overflow at 485px and 749px on both pages, measured rather than eyeballed. |

Seven integration tests cover the flows, and the suite was mutation-checked —
inverting an assertion fails it — so the green is not vacuous.

Two fixes found while building: `border-hairline-firm` was a token I had used in
five places without ever defining, so those hover states were silently no-ops;
and pinned resources moved from above the feed into the rail, because above the
feed they pushed the first post down on every visit.

### 3 — Post detail and comments (`/posts/[id]`) — next

Full post view, threaded conversation, comment sort, permalinks.

*Done when:* a four-deep thread reads clearly on a phone.

### 4 — Discover and search (`/discover`, `/search`)

People / Spaces / Courses / Events, plus the full search results page behind the
command palette.

*Done when:* every entity type is reachable from search, and the palette's
"search everything" fallback lands somewhere useful.

### 5 — People (`/members`, `/members/[handle]`, `/connect`)

Directory, profile, and suggestions with a reason attached.

*Done when:* a member can find someone and start a conversation in under a
minute.

### 6 — Messages (`/messages`)

Conversation list, thread, composer, unread, attachments.

*Done when:* two members can hold a conversation with read state that is
correct on both sides.

### 7 — Learning (`/learn`, `/roadmap`, `/calendar`)

Course library, lesson player, progress, roadmap, and the event calendar with
RSVP.

*Done when:* resuming a half-finished lesson is one click from `/home`.

### 8 — Local and notifications (`/bulletin`, `/notifications`)

Bulletin board, and the notification inbox with preferences.

*Done when:* a notification's preference is honoured by the delivery path, not
just stored.

### 9 — Hardening

Loading, empty and error states on every route. Accessibility pass. Phone
layouts. Performance: `content-visibility` on long lists, cursor pagination,
optimistic interactions everywhere something is written.

*Done when:* no route shows a browser default state, and the feed scrolls
smoothly with a hundred posts.

## Status

| Phase | State |
| --- | --- |
| 0 Foundation | done |
| 1 Feed | done |
| 2 Spaces | done, verified |
| 3 Post detail | next |
| 4 Discover and search | not started |
| 5 People | not started |
| 6 Messages | not started |
| 7 Learning | not started |
| 8 Local and notifications | not started |
| 9 Hardening | not started |

Routes still missing, and therefore 404 until their phase lands: `/posts/[id]`,
`/discover`, `/search`, `/members`, `/connect`, `/messages`, `/learn`,
`/calendar`, `/roadmap`, `/bulletin`, `/notifications`, `/compose`. Links to
them exist in the rail and the cards, because building the navigation twice
would be waste — but they are dead until rebuilt.

## Standing rules for this rebuild

Carried from what the previous build got wrong, so the same mistakes do not
recur:

- **No page marks state read by rendering.** The notifications inbox and the
  space page both did this; opening them destroyed the unread state they
  existed to show.
- **No swallowed errors.** A `.catch(() => {})` turned a five-minute
  `markSpaceRead` bug into a hunt.
- **Every colour comes from a role token**, never a literal name. The old app
  used `forest` and `mint` directly 400+ times, and those names invert in dark
  mode, which is where every contrast bug came from.
- **Elevation derives from ink, not from the brand hue.** Every shadow used to
  be `rgba(15,61,50,…)`, which painted a green glow around cards in dark mode.
- **Media stores its dimensions**, so the feed reserves space and never jumps.
- **Writes are optimistic**, or they show determinate progress. Never a spinner
  over the whole page.

## Known hazards

Two Prisma traps that will bite anyone running a migration here:

1. `prisma migrate dev` demands a database reset, because an early migration's
   checksum changed when its raw-SQL FTS statements were stripped. Migrations
   must be hand-applied: `prisma migrate diff` → strip → `prisma db execute` →
   `prisma migrate resolve --applied`.
2. `prisma migrate diff` emits drops for `SearchIndex.search_tsv` and its three
   FTS indexes every time, because they live in raw SQL and Prisma reads them as
   drift. They must be stripped from every generated migration or full-text
   search dies.

Both are worth a dedicated cleanup — representing the FTS objects in the schema
would end the recurrence.
