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

### 0 — Foundation

Design tokens retuned for density, the app shell, and the primitives every page
needs: button, input, card, avatar, badge, skeleton, empty state, menu, modal,
toast.

*Done when:* the shell renders, `/home` is reachable, and every primitive exists
in all its states.

### 1 — Feed (`/home`)

The page members see most. Post card, vote rail, engagement row, inline
composer with upload, sort bar, density toggle, threaded comments, and the
right rail.

*Done when:* a member can read, vote, react, comment, and post with a photo
without leaving the page.

### 2 — Spaces (`/spaces`, `/spaces/[slug]`)

Typed spaces, groups, visibility, unread, favourites, pinned resources, and the
space header with kind-driven tabs. The Phase 3 domain layer in `lib/spaces`
survives and is reused.

*Done when:* rail navigation still scales past five spaces, and a private space
is invisible to a non-member.

### 3 — Post detail and comments (`/posts/[id]`)

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
