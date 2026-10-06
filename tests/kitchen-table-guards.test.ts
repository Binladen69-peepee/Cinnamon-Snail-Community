import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What the Kitchen Table change removed must stay removed (DEC-078).
 *
 * Each of these was asked for by the client in so many words — no post
 * sharing, "Pin this post" instead of "Save", bold that renders as bold and
 * never raw HTML, no "# Kitchen Table" on every post, no Explorer — and each
 * is the kind of thing a later edit puts back without noticing. Read from the
 * source, because the rule is about what the code says.
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

/** Every .ts/.tsx file under a directory, as absolute paths. */
function walk(dir: string): string[] {
  const out: string[] = [];
  const visit = (full: string) => {
    if (!existsSync(full)) return;
    for (const entry of readdirSync(full)) {
      const path = join(full, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.tsx?$/.test(entry)) out.push(path);
    }
  };
  visit(resolve(root, dir));
  return out;
}

const rel = (file: string) => file.replace(root, "").replace(/\\/g, "/").slice(1);

const FEED_UI = walk("components/feed");
const OWNED_UI = [
  ...FEED_UI,
  ...walk("components/spaces"),
  ...walk("app/(member)/kitchen-table"),
  ...walk("app/(member)/posts"),
  ...walk("app/(member)/compose"),
  ...walk("app/(member)/drafts"),
  ...walk("app/(member)/search"),
];

describe("post sharing is gone from the interface", () => {
  it("offers no share dialog, re-share or copy-link share", () => {
    const offenders: string[] = [];
    for (const file of OWNED_UI) {
      const source = readFileSync(file, "utf8");
      for (const pattern of [
        /navigator\.share/,
        /sharePostAction/,
        /Share to a space/,
        /\bShare2\b/,
        /clipboard\.writeText/,
      ]) {
        if (pattern.test(source)) offenders.push(`${rel(file)}: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no share action left to call", () => {
    const actions = read("app/(member)/community-actions.ts");
    expect(actions).not.toMatch(/export async function sharePostAction/);
  });
});

describe("Save became Pin this post", () => {
  it("has no save control anywhere in the feed", () => {
    const offenders: string[] = [];
    for (const file of FEED_UI) {
      const source = readFileSync(file, "utf8");
      for (const pattern of [
        /saveAction/,
        /"Unsave"/,
        /"Save"/,
        /Remove from saved/,
        /label="Saved"/,
      ]) {
        if (pattern.test(source)) offenders.push(`${rel(file)}: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("writes pins through an explicit pinned/unpinned action, not a toggle", () => {
    const actions = read("app/(member)/community-actions.ts");
    expect(actions).toMatch(/export async function setPinAction/);
    expect(actions).not.toMatch(/export async function saveAction/);
    expect(actions).not.toMatch(/toggleBookmark/);
    const hook = read("components/feed/use-engagement.ts");
    expect(hook).toMatch(/data\.set\("pinned", String\(next\)\)/);
  });

  it("labels the control Pin this post and Unpin", () => {
    const actions = read("components/feed/post-actions.tsx");
    expect(actions).toContain("Pin this post");
    expect(actions).toContain("Unpin this post");
  });
});

describe("member-written text renders through RichText (C2)", () => {
  it("never injects a stored body as HTML", () => {
    for (const file of [
      "components/feed/post-card.tsx",
      "components/feed/comment-thread.tsx",
      "components/feed/conversation.tsx",
      "components/feed/post-gallery-modal.tsx",
    ]) {
      const source = read(file);
      expect(source, file).toContain("<RichText");
      expect(source, file).not.toContain("dangerouslySetInnerHTML");
    }
  });
});

describe("posts carry no room label", () => {
  it("drops the generic # label and links to retired room pages", () => {
    for (const file of [
      "components/feed/post-card.tsx",
      "components/feed/post-gallery-modal.tsx",
      "components/feed/reels.tsx",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/spaceLabel/);
      expect(source, file).not.toMatch(/`# \$\{/);
      expect(source, file).not.toMatch(/\/spaces\/\$\{/);
    }
  });
});

describe("comments can be linked to (C4)", () => {
  it("renders every comment with its anchor id", () => {
    for (const file of ["components/feed/conversation.tsx", "components/feed/comment-thread.tsx"]) {
      expect(read(file), file).toMatch(/id=\{?[^}]*commentAnchorId\(comment\.id\)/);
    }
  });

  it("asks the server for a linked comment's thread", () => {
    const page = read("app/(member)/posts/[id]/page.tsx");
    expect(page).toContain("focusRequested={focusId}");
    expect(page).toContain("getPostConversation(userId, post.id, sort, { focusId, roots })");
  });
});

describe("the Kitchen Table replaced Explorer and the space pages", () => {
  it("lives at /kitchen-table, and /home is gone", () => {
    expect(existsSync(resolve(root, "app/(member)/kitchen-table/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "app/(member)/kitchen-table/loading.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "app/(member)/home/page.tsx"))).toBe(false);
  });

  it("puts the roadmap focus in the rail (C5)", () => {
    expect(read("app/(member)/kitchen-table/page.tsx")).toContain("<RoadmapFocusCard userId={userId} />");
  });

  it("sends the retired room pages to the Kitchen Table", () => {
    expect(read("app/(member)/spaces/page.tsx")).toMatch(/redirect\(KITCHEN_TABLE_PATH\)/);
    expect(read("app/(member)/spaces/[slug]/page.tsx")).toMatch(/KITCHEN_TABLE_PATH/);
    // The pages the people who run a room still need are kept.
    expect(existsSync(resolve(root, "app/(member)/spaces/[slug]/settings/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "app/(member)/spaces/[slug]/review/page.tsx"))).toBe(true);
  });

  it("links nowhere retired", () => {
    const offenders: string[] = [];
    for (const file of OWNED_UI) {
      const source = readFileSync(file, "utf8");
      for (const pattern of [/["'`]\/home["'`?]/, /["'`]\/calendar[/"'`]/, /href="\/spaces"/]) {
        if (pattern.test(source)) offenders.push(`${rel(file)}: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no decorative tagline in the rail", () => {
    expect(read("components/feed/feed-rail.tsx")).not.toContain("Good food brings people together");
  });
});
