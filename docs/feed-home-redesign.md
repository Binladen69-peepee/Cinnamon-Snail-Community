# Feed / Home redesign

Unique member-app chrome for `/home` and every page that uses `AppShell`.
Marketing pages stay untouched. Cream / forest / terracotta tokens stay; dark
and light both work.

## Goals

1. Fixed left sidebar (does not scroll away).
2. Three-column Home: destinations | feed | discovery.
3. Match the provided mock layout exactly in structure; keep site colours.
4. Ship step by step; each step is independently reviewable.

## Non-goals

- Landing / membership redesign.
- Invented member counts, class photos, or events.
- New product routes beyond existing nav destinations.

---

## Step 1 — App shell: fixed left sidebar

**Files:** `components/app/app-shell.tsx`, `app/globals.css`

- Left rail: `position: fixed; inset-y: 0; left: 0; width: 16rem` (lg+).
- Header spans the remaining width (`pl-64` on lg).
- Main + right rail live in a flex row offset by the sidebar width.
- Sidebar scrolls its own overflow; the page scrolls under the sticky header.

**Done when:** resizing the window keeps the sidebar pinned; Home content
never slides under it.

## Step 2 — Sidebar look (shadcn + Kitchen Table)

**Files:** `components/app/side-rail.tsx`

- Group labels: quiet uppercase tracking.
- Active row: soft forest wash pill (`sidebar-accent`).
- Unread: cream/forest badge.
- Spaces: `#` / kind icon prefix; collapsible SPACES block.
- Footer: botanical leaf art + “Better food. Kinder planet.”

**Done when:** Home is highlighted; Spaces / Messages badges render real counts.

## Step 3 — Top bar

**Files:** `components/app/app-header.tsx`, search shell CSS

- Opaque bar above the feed columns only (offset for fixed sidebar).
- Pill search, cream **+ Create**, bell / messages / theme / avatar.
- Brand mark stays in the header (mock), not duplicated in the sidebar.

**Done when:** Create and search work on Home in light and dark.

## Step 4 — Feed column

**Files:** `components/feed/composer.tsx`, `feed-toolbar.tsx`, `post-card.tsx`,
`post-media.tsx`, `post-actions.tsx`, `vote-rail.tsx`, `save-mark.tsx`

- Composer: avatar + “Share something…” + Photo / Video / Link / Poll.
- Sort pills: Hot (active = cream/forest fill) · New · Top · Rising + density.
- Compact posts by default: vote rail left, text, circular/rounded still right.
- Footer: Reply · Like · Share · Save; optional inline comment preview.

**Done when:** `/home` matches the mock’s centre column structure.

## Step 5 — Right discovery rail

**Files:** `components/feed/feed-rail.tsx`, `app/(member)/home/page.tsx`

- Cream **+ Create Post**.
- Next live class: real Event or catalog liveAt; real still only if known.
- People you should meet + Follow → profile.
- Trending spaces from real 14-day post counts.
- Footer: “Good food brings people together.”

**Done when:** empty panels hide; no invented data.

## Step 6 — Verify and ship

- `pnpm exec tsc --noEmit`
- Targeted vitest for library / feed helpers
- Commit → `git push origin HEAD` → wait Preview Ready →
  `npx vercel promote <url> --yes --scope cinnamon-snail`

---

## Checklist vs mock

| Region | Expectation |
|--------|-------------|
| Left | Fixed, grouped nav, Spaces list, botanical footer |
| Centre | Composer, sort bar, vote+media posts |
| Right | Create, live class, people, trending |
| Theme | Cream / forest / terracotta; dark Look works |
| Data | Real DB / spreadsheet only |

## Status

- [x] Step 1 shell — fixed `vu-app-sidebar`, content `lg:pl-64`
- [x] Step 2 sidebar — grouped nav, `#` spaces, botanical footer
- [x] Step 3 header — cream Create, pill search
- [x] Step 4 feed — composer, cream Hot pill, circular compact stills
- [x] Step 5 rail — Create Post, live class, people, trending
- [x] Step 6 ship
