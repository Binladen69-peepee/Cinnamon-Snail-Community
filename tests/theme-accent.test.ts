import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The palette store (lib/theme/accent.ts), against a stand-in page.
 *
 * There is no browser here, so <html>, localStorage and the window's events
 * are small fakes; the store only touches what they provide. The rules held:
 * a palette applies to <html> and is remembered, Mulberry is "no attribute,
 * nothing saved", anything else is refused, other tabs are followed, and a
 * browser that blocks storage still gets its palette for the visit.
 */

type Store = typeof import("@/lib/theme/accent");

class FakeHtml {
  attributes = new Map<string, string>();
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
}

function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, String(value)),
    removeItem: (key: string) => void items.delete(key),
  };
}

const throwingStorage = {
  getItem() {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
  setItem() {
    throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
  },
  removeItem() {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
};

/** A storage event as another tab's write delivers it. */
function storageEvent(key: string | null, newValue: string | null) {
  return Object.assign(new Event("storage"), { key, newValue });
}

let html: FakeHtml;
let storage: ReturnType<typeof fakeStorage>;
let win: EventTarget;
let store: Store;

beforeEach(async () => {
  html = new FakeHtml();
  storage = fakeStorage();
  win = new EventTarget();
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { documentElement: html });
  vi.stubGlobal("localStorage", storage);
  // A fresh module each time: it remembers an unsaved choice between calls.
  vi.resetModules();
  store = await import("@/lib/theme/accent");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("choosing a palette", () => {
  it("applies it to <html> and remembers it in this browser", () => {
    expect(store.setAccent("slate")).toBe(true);
    expect(html.getAttribute("data-accent")).toBe("slate");
    expect(storage.items.get("vu-accent")).toBe("slate");
    expect(store.getAccent()).toBe("slate");
  });

  it("clears both for Mulberry, the default", () => {
    store.setAccent("midnight");
    expect(store.setAccent("mulberry")).toBe(true);
    expect(html.attributes.has("data-accent")).toBe(false);
    expect(storage.items.has("vu-accent")).toBe(false);
    expect(store.getAccent()).toBe("mulberry");
  });

  it("refuses anything that is not a palette, and changes nothing", () => {
    store.setAccent("dusk");
    const heard = vi.fn();
    store.subscribeAccent(heard);
    for (const bad of ["", "teal", "Slate", "MULBERRY", " dusk", "__proto__", null, undefined, 3, {}]) {
      expect(store.setAccent(bad), String(bad)).toBe(false);
    }
    expect(html.getAttribute("data-accent")).toBe("dusk");
    expect(storage.items.get("vu-accent")).toBe("dusk");
    expect(heard).not.toHaveBeenCalled();
  });

  it("reads Mulberry from a page with no attribute, or a stray one", () => {
    expect(store.getAccent()).toBe("mulberry");
    html.setAttribute("data-accent", "teal");
    expect(store.getAccent()).toBe("mulberry");
  });

  it("announces the change on the window, naming the palette", () => {
    const details: unknown[] = [];
    win.addEventListener(store.ACCENT_CHANGE_EVENT, (event) =>
      details.push((event as CustomEvent).detail),
    );
    store.setAccent("dusk");
    store.setAccent("mulberry");
    expect(details).toEqual([{ accent: "dusk" }, { accent: "mulberry" }]);
  });

  it("tells this tab's subscribers, until they unsubscribe", () => {
    const heard = vi.fn();
    const unsubscribe = store.subscribeAccent(heard);
    store.setAccent("charcoal");
    expect(heard).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.setAccent("slate");
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe("another tab", () => {
  it("is followed: its palette is applied here and subscribers hear of it", () => {
    const heard = vi.fn();
    store.subscribeAccent(heard);
    win.dispatchEvent(storageEvent("vu-accent", "midnight"));
    expect(html.getAttribute("data-accent")).toBe("midnight");
    expect(heard).toHaveBeenCalledTimes(1);
    // The other tab wrote storage; this one does not write it again.
    expect(storage.items.has("vu-accent")).toBe(false);
  });

  it("falls back to Mulberry when the other tab removes, garbles or clears it", () => {
    store.subscribeAccent(() => {});
    for (const [key, value] of [
      ["vu-accent", null],
      ["vu-accent", "teal"],
      [null, null],
    ] as const) {
      html.setAttribute("data-accent", "slate");
      win.dispatchEvent(storageEvent(key, value));
      expect(html.attributes.has("data-accent"), `${key} → ${value}`).toBe(false);
    }
  });

  it("ignores every other key, the mode included", () => {
    const heard = vi.fn();
    store.subscribeAccent(heard);
    store.setAccent("dusk");
    heard.mockClear();
    win.dispatchEvent(storageEvent("vu-theme", "dark"));
    expect(heard).not.toHaveBeenCalled();
    expect(html.getAttribute("data-accent")).toBe("dusk");
  });

  it("stops being followed after unsubscribing", () => {
    const unsubscribe = store.subscribeAccent(() => {});
    unsubscribe();
    win.dispatchEvent(storageEvent("vu-accent", "slate"));
    expect(html.attributes.has("data-accent")).toBe(false);
  });
});

describe("when storage is blocked", () => {
  it("still applies the palette for the visit when every call throws", () => {
    vi.stubGlobal("localStorage", throwingStorage);
    expect(store.setAccent("charcoal")).toBe(true);
    expect(html.getAttribute("data-accent")).toBe("charcoal");
    expect(store.readStoredAccent()).toBeNull();
    // The rail remounting must not undo a choice that could not be saved.
    store.syncAccentFromStorage();
    expect(html.getAttribute("data-accent")).toBe("charcoal");
  });

  it("keeps an unsaved choice even when reading still works", () => {
    // Full storage: reads succeed, writes throw.
    vi.stubGlobal("localStorage", { ...storage, setItem: throwingStorage.setItem });
    store.setAccent("dusk");
    store.syncAccentFromStorage();
    expect(html.getAttribute("data-accent")).toBe("dusk");
  });

  it("does not throw when even reaching localStorage throws", () => {
    // Cookies blocked: the property itself throws. Restored by
    // unstubAllGlobals, which put the stub there in the first place.
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    expect(() => store.setAccent("slate")).not.toThrow();
    expect(html.getAttribute("data-accent")).toBe("slate");
    expect(store.readStoredAccent()).toBeNull();
    expect(() => store.syncAccentFromStorage()).not.toThrow();
  });
});

describe("putting the saved palette back", () => {
  it("re-applies it when the attribute has gone (React's development remount)", () => {
    storage.items.set("vu-accent", "slate");
    const heard = vi.fn();
    store.subscribeAccent(heard);
    store.syncAccentFromStorage();
    expect(html.getAttribute("data-accent")).toBe("slate");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("removes a stale attribute when nothing is saved", () => {
    html.setAttribute("data-accent", "dusk");
    store.syncAccentFromStorage();
    expect(html.attributes.has("data-accent")).toBe(false);
  });

  it("does nothing when the page and storage already agree", () => {
    storage.items.set("vu-accent", "midnight");
    html.setAttribute("data-accent", "midnight");
    const heard = vi.fn();
    store.subscribeAccent(heard);
    store.syncAccentFromStorage();
    expect(heard).not.toHaveBeenCalled();
  });

  it("treats a garbled saved value as Mulberry", () => {
    storage.items.set("vu-accent", "<script>");
    expect(store.readStoredAccent()).toBe("mulberry");
  });
});

describe("on the server", () => {
  it("is always Mulberry, and the hook renders that for hydration", () => {
    expect(store.getServerAccent()).toBe("mulberry");
    // Even with a palette on the page, the server snapshot is what a first
    // render uses, so server and browser markup agree.
    html.setAttribute("data-accent", "slate");
    function Probe() {
      return store.useAccent();
    }
    expect(renderToStaticMarkup(createElement(Probe))).toBe("mulberry");
  });

  it("does not touch a page or a window that is not there", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("window", undefined);
    expect(store.getAccent()).toBe("mulberry");
    const unsubscribe = store.subscribeAccent(() => {});
    expect(unsubscribe).toBeTypeOf("function");
    expect(() => unsubscribe()).not.toThrow();
    expect(() => store.setAccent("slate")).not.toThrow();
  });
});
