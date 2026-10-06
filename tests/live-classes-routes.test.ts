import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { reminderBody } from "@/lib/events/jobs";

/**
 * Events became Live Classes (DEC-079), and the pieces that keep it honest:
 * the route moved, nothing links to the old one, members never read the word
 * "event", the job and the webhook are gated before they do anything, the
 * Zoom integration logs nothing, and a reminder sends people to the class
 * page rather than carrying the Zoom link itself.
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const rel = (file: string) => file.replace(root, "").replace(/\\/g, "/").slice(1);

/** Everything this feature owns. */
const OWNED = [
  ...walk(resolve(root, "app/(member)/live-classes")),
  ...walk(resolve(root, "components/events")),
  ...walk(resolve(root, "lib/events")),
  ...walk(resolve(root, "lib/zoom")),
  ...walk(resolve(root, "app/admin/events")),
  ...walk(resolve(root, "app/api/jobs/zoom-sync")),
  ...walk(resolve(root, "app/api/webhooks/zoom")),
  resolve(root, "components/admin/event-form.tsx"),
  resolve(root, "components/admin/event-recording.tsx"),
  resolve(root, "components/admin/delete-event-button.tsx"),
];

/** What members (and staff) read: markup in the pages and components. */
const SCREENS = OWNED.filter((file) => file.endsWith(".tsx"));

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the route", () => {
  it("lives at /live-classes, with a page, a class page and their loading states", () => {
    for (const path of [
      "app/(member)/live-classes/page.tsx",
      "app/(member)/live-classes/loading.tsx",
      "app/(member)/live-classes/[slug]/page.tsx",
      "app/(member)/live-classes/[slug]/loading.tsx",
      "app/(member)/live-classes/actions.ts",
    ]) {
      expect(existsSync(resolve(root, path)), path).toBe(true);
    }
  });

  it("no longer has a calendar page for the redirect to shadow", () => {
    expect(existsSync(resolve(root, "app/(member)/calendar"))).toBe(false);
  });

  it("links nowhere retired", () => {
    const offenders: string[] = [];
    for (const file of OWNED) {
      const source = withoutComments(readFileSync(file, "utf8"));
      if (/["'`]\/calendar(?:[/"'`?]|$)/m.test(source)) offenders.push(rel(file));
      if (/["'`]\/spaces\/\$\{/.test(source)) offenders.push(`${rel(file)} (space link)`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("the words", () => {
  it("never says event to anyone reading a screen", () => {
    const offenders: string[] = [];
    for (const file of SCREENS) {
      const source = withoutComments(readFileSync(file, "utf8"));
      // Text between tags, and the props that carry copy.
      const text = [...source.matchAll(/>([^<>{}]+)</g)].map((match) => match[1]!);
      const props = [
        ...source.matchAll(
          /\b(?:title|description|label|hint|placeholder|disabledReason|draftLabel|aria-label)=\{?["'`]([^"'`]*)["'`]/g,
        ),
      ].map((match) => match[1]!);
      for (const phrase of [...text, ...props]) {
        // A comparison between two tags (`a > event.b ? (<p`) is code, not copy.
        if (/\.\w|=>|[=;&|]|\?\s*\(/.test(phrase)) continue;
        if (/\bevents?\b/i.test(phrase)) offenders.push(`${rel(file)}: ${phrase.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("names the page Live Classes, and the console Live classes", () => {
    const page = read("app/(member)/live-classes/page.tsx");
    expect(page).toContain('export const metadata = { title: "Live Classes" }');
    expect(page).toContain('title="Live Classes"');
    expect(read("app/(member)/live-classes/[slug]/page.tsx")).toContain(
      'back={{ href: LIVE_CLASSES_PATH, label: "Live Classes" }}',
    );
    const admin = read("app/admin/events/page.tsx");
    expect(admin).toContain('export const metadata = { title: "Live classes" }');
    expect(admin).toContain('title="Live classes"');
  });

  it("offers Join on Zoom, and says when the link will appear", () => {
    const control = read("components/events/join-control.tsx");
    expect(control).toContain("Join on Zoom");
    expect(control).toContain("Link appears 30 minutes before");
    expect(control).toContain('case "opens-soon"');
    expect(read("components/events/recording-link.tsx")).toContain("Watch recording");
  });
});

describe("the gates", () => {
  it("runs the scheduled sync only for the job secret", () => {
    const route = read("app/api/jobs/zoom-sync/route.ts");
    expect(route).toMatch(/if \(!jobRequestAuthorized\(request\)\)/);
    expect(route).toContain("export async function GET");
  });

  it("verifies the webhook before reading a word of it", () => {
    const route = read("app/api/webhooks/zoom/route.ts");
    const verify = route.indexOf("verifyZoomWebhook(");
    const parse = route.indexOf("JSON.parse(");
    expect(verify).toBeGreaterThan(-1);
    expect(parse).toBeGreaterThan(verify);
    expect(route.indexOf("urlValidationResponse(")).toBeGreaterThan(verify);
  });

  it("re-checks staff on every admin action, including the manual sync", () => {
    const actions = read("app/admin/events/actions.ts");
    for (const name of [
      "createEventAction",
      "updateEventAction",
      "deleteEventAction",
      "attachRecordingAction",
      "syncZoomNowAction",
    ]) {
      const start = actions.indexOf(`export async function ${name}`);
      expect(start, name).toBeGreaterThan(-1);
      expect(actions.slice(start, start + 400), name).toContain("await requireStaff()");
    }
  });

  it("keeps what Zoom owns out of the admin's hands on a synced class", () => {
    const actions = read("app/admin/events/actions.ts");
    expect(actions).toMatch(/const fromZoom = existing\.source === "ZOOM"/);
    expect(actions).toMatch(/zoom \? zoom\.title :/);
    expect(read("components/admin/event-form.tsx")).toContain("disabled={locked}");
  });
});

describe("secrets", () => {
  it("are never logged by the Zoom integration", () => {
    for (const file of [
      ...walk(resolve(root, "lib/zoom")),
      resolve(root, "app/api/webhooks/zoom/route.ts"),
      resolve(root, "app/api/jobs/zoom-sync/route.ts"),
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, rel(file)).not.toMatch(/console\.(log|info|debug|warn)\(/);
      for (const call of source.match(/console\.error\([^)]*\)/g) ?? []) {
        expect(call, rel(file)).not.toMatch(/secret|token|clientSecret|authorization/i);
      }
    }
  });

  it("are read from the environment in one place", () => {
    const readers = walk(resolve(root, "lib/zoom"))
      .concat(walk(resolve(root, "app/api/webhooks/zoom")))
      .filter((file) => /process\.env\.ZOOM_|"ZOOM_CLIENT_SECRET"/.test(readFileSync(file, "utf8")));
    expect(readers.map(rel)).toEqual(["lib/zoom/config.ts"]);
  });
});

describe("a reminder", () => {
  const event = {
    startsAt: new Date("2026-10-10T18:00:00.000Z"),
    timezone: "America/New_York",
    zoomUrl: "https://us02web.zoom.us/j/81234567890?pwd=secret",
    location: null,
  };

  it("sends people to the class page, in their own time zone, without the link", () => {
    const tomorrow = reminderBody(event, "T24H", "Europe/London");
    expect(tomorrow).toContain("19:00");
    expect(tomorrow).toMatch(/GMT\+1/);
    expect(tomorrow).toContain("The Zoom link appears on the class page 30 minutes before the start.");
    expect(tomorrow).not.toContain("zoom.us");
    expect(tomorrow).not.toMatch(/\bevent\b/i);

    const soon = reminderBody(event, "T1H");
    expect(soon).toContain("14:00");
    expect(soon).toContain("Join on Zoom from the class page.");
    expect(soon).not.toContain("zoom.us");
  });

  it("names the place for a class with no link", () => {
    expect(reminderBody({ ...event, zoomUrl: null, location: "The Kitchen, Brooklyn" }, "T24H")).toContain(
      "The Kitchen, Brooklyn",
    );
  });
});
