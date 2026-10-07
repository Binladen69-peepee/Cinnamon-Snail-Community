import { describe, expect, it } from "vitest";
import { ACCENT_ATTRIBUTE, ACCENT_BOOT_SCRIPT } from "@/lib/theme/boot-script";
import { ACCENT_STORAGE_KEY, DEFAULT_PALETTE, PALETTE_IDS } from "@/lib/theme/palettes";

/**
 * The inline script that puts the saved palette on <html> before the first
 * paint (lib/theme/boot-script.ts).
 *
 * It is a string the browser runs while parsing, so it is run here the same
 * way: compiled with `new Function` and handed a stand-in document and
 * localStorage as the only names it can see.
 */

function run(read: (key: string) => string | null) {
  const attributes = new Map<string, string>();
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) => void attributes.set(name, value),
    },
  };
  const localStorage = { getItem: read };
  new Function("document", "localStorage", ACCENT_BOOT_SCRIPT)(document, localStorage);
  return attributes;
}

const saved = (value: string | null) => (key: string) => (key === ACCENT_STORAGE_KEY ? value : null);

const attributed = PALETTE_IDS.filter((id) => id !== DEFAULT_PALETTE);

describe("the boot script", () => {
  it("puts each saved palette on <html>", () => {
    expect(attributed.length).toBeGreaterThan(0);
    for (const id of attributed) {
      expect(run(saved(id)).get(ACCENT_ATTRIBUTE), id).toBe(id);
    }
  });

  it("leaves <html> alone for Mulberry, for nothing saved, and for anything unknown", () => {
    for (const value of [DEFAULT_PALETTE, null, "", "teal", "Slate", "slate ", "__proto__", "constructor", '"><img>']) {
      expect(run(saved(value)).size, String(value)).toBe(0);
    }
  });

  it("reads only its own key", () => {
    const keys: string[] = [];
    run((key) => {
      keys.push(key);
      return null;
    });
    expect(keys).toEqual(["vu-accent"]);
  });

  it("does not throw when storage throws", () => {
    expect(() =>
      run(() => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      }),
    ).not.toThrow();
  });

  it("does not throw when even reaching localStorage throws", () => {
    // Cookies blocked: the global itself throws. A `with` scope lets the
    // script look the name up through a getter, as it would on `window`.
    const scope = {
      document: { documentElement: { setAttribute: () => {} } },
      get localStorage(): Storage {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    };
    const sloppy = new Function("scope", `with (scope) { ${ACCENT_BOOT_SCRIPT} }`);
    expect(() => sloppy(scope)).not.toThrow();
  });

  it("is a small, self-contained statement that cannot close its own tag", () => {
    expect(ACCENT_BOOT_SCRIPT.length).toBeLessThan(300);
    expect(ACCENT_BOOT_SCRIPT).toMatch(/^\(function\(\)\{try\{[\s\S]*\}catch\(e\)\{\}\}\)\(\)$/);
    expect(ACCENT_BOOT_SCRIPT).not.toContain("<");
    expect(ACCENT_BOOT_SCRIPT).not.toMatch(/\bimport\b|\brequire\b|\bwindow\.__/);
  });

  it("knows exactly the palettes that need the attribute", () => {
    const list = /(\[[^\]]*\])\.indexOf/.exec(ACCENT_BOOT_SCRIPT);
    expect(list).not.toBeNull();
    expect(JSON.parse(list![1]!)).toEqual(attributed);
    expect(JSON.parse(list![1]!)).not.toContain(DEFAULT_PALETTE);
  });
});
