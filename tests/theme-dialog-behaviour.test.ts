import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isDismissKey,
  isTabbable,
  lockBodyScroll,
  trapFocusTarget,
} from "@/components/aceternity/dialog-focus";
import { rovingTarget } from "@/components/aceternity/roving";
import { angleFrom, shortestTurn } from "@/components/aceternity/glowing-effect";

/**
 * The behaviour behind the Theme dialog's keyboard and pointer handling,
 * held as rules: where the arrow keys go in a radio group and an accordion,
 * where Tab goes at the dialog's edges, which key closes it, how the page's
 * scroll is locked and handed back (including under the phone drawer), and
 * how the glow follows the pointer from one shared listener.
 */

describe("arrow keys in a radio group", () => {
  it("move to the next and previous option, wrapping at both ends", () => {
    expect(rovingTarget("ArrowRight", 0, 5)).toBe(1);
    expect(rovingTarget("ArrowDown", 4, 5)).toBe(0);
    expect(rovingTarget("ArrowLeft", 0, 5)).toBe(4);
    expect(rovingTarget("ArrowUp", 3, 5)).toBe(2);
  });

  it("jump to the ends with Home and End", () => {
    expect(rovingTarget("Home", 3, 5)).toBe(0);
    expect(rovingTarget("End", 1, 5)).toBe(4);
  });

  it("ignore every other key, and an empty group", () => {
    for (const key of ["Tab", "a", "PageDown", "Escape", " "]) {
      expect(rovingTarget(key, 1, 5), key).toBeNull();
    }
    expect(rovingTarget("ArrowDown", 0, 0)).toBeNull();
  });

  it("start from the first option when none has focus yet", () => {
    expect(rovingTarget("ArrowRight", -1, 3)).toBe(1);
  });
});

describe("arrow keys between accordion headers", () => {
  it("use Up, Down, Home and End only, leaving Left and Right alone", () => {
    expect(rovingTarget("ArrowDown", 1, 2, "vertical")).toBe(0);
    expect(rovingTarget("ArrowUp", 0, 2, "vertical")).toBe(1);
    expect(rovingTarget("End", 0, 2, "vertical")).toBe(1);
    expect(rovingTarget("ArrowRight", 0, 2, "vertical")).toBeNull();
    expect(rovingTarget("ArrowLeft", 1, 2, "vertical")).toBeNull();
  });
});

describe("Tab inside the dialog", () => {
  const panel = "panel";
  const items = ["close", "light", "palette", "done"];

  it("wraps from the last control to the first, and back", () => {
    expect(trapFocusTarget(items, "done", panel, false, true)).toBe("close");
    expect(trapFocusTarget(items, "close", panel, true, true)).toBe("done");
  });

  it("lets the browser move between controls in the middle", () => {
    expect(trapFocusTarget(items, "light", panel, false, true)).toBeNull();
    expect(trapFocusTarget(items, "palette", panel, true, true)).toBeNull();
  });

  it("goes to the first or last control from the dialog itself", () => {
    expect(trapFocusTarget(items, panel, panel, false, true)).toBe("close");
    expect(trapFocusTarget(items, panel, panel, true, true)).toBe("done");
  });

  it("pulls focus back in from outside", () => {
    expect(trapFocusTarget(items, "page link", panel, false, false)).toBe("close");
    expect(trapFocusTarget(items, null, panel, true, false)).toBe("done");
  });

  it("keeps focus on the dialog when nothing in it can take focus", () => {
    expect(trapFocusTarget([], panel, panel, false, true)).toBe(panel);
  });

  it("leaves an element that is inside but out of the tab order to the browser", () => {
    expect(trapFocusTarget(items, "preview button", panel, false, true)).toBeNull();
  });
});

describe("what can take focus", () => {
  const candidate = (overrides: Partial<Parameters<typeof isTabbable>[0]> = {}) => ({
    tabIndex: 0,
    disabled: false,
    getClientRects: () => ({ length: 1 }),
    closest: () => null,
    ...overrides,
  });

  it("is a rendered, enabled element in the tab order", () => {
    expect(isTabbable(candidate())).toBe(true);
  });

  it("excludes roving radios that are not the stop, disabled controls, inert and collapsed content", () => {
    expect(isTabbable(candidate({ tabIndex: -1 }))).toBe(false);
    expect(isTabbable(candidate({ disabled: true }))).toBe(false);
    expect(isTabbable(candidate({ closest: (selector) => (selector === "[inert]" ? {} : null) }))).toBe(false);
    expect(isTabbable(candidate({ getClientRects: () => ({ length: 0 }) }))).toBe(false);
  });
});

describe("closing with the keyboard", () => {
  it("is Escape, unless Escape is ending an IME composition", () => {
    expect(isDismissKey({ key: "Escape" })).toBe(true);
    expect(isDismissKey({ key: "Escape", isComposing: true })).toBe(false);
    expect(isDismissKey({ key: "Enter" })).toBe(false);
  });
});

describe("the page's scroll while the dialog is open", () => {
  const body = () => ({ style: { overflow: "", paddingRight: "" } });

  it("is locked, and the scrollbar's width kept as padding so nothing shifts", () => {
    const page = body();
    const release = lockBodyScroll(page, { scrollbarWidth: 15, paddingRight: 0 });
    expect(page.style).toEqual({ overflow: "hidden", paddingRight: "15px" });
    release();
    expect(page.style).toEqual({ overflow: "", paddingRight: "" });
  });

  it("adds to padding the body already has, and restores the previous values exactly", () => {
    const page = { style: { overflow: "clip", paddingRight: "4px" } };
    const release = lockBodyScroll(page, { scrollbarWidth: 12, paddingRight: 4 });
    expect(page.style.paddingRight).toBe("16px");
    release();
    expect(page.style).toEqual({ overflow: "clip", paddingRight: "4px" });
  });

  it("adds no padding where scrollbars take no room", () => {
    const page = body();
    lockBodyScroll(page, { scrollbarWidth: 0, paddingRight: 0 });
    expect(page.style.paddingRight).toBe("");
  });

  it("stays locked for the phone drawer underneath when the dialog closes first", () => {
    const page = body();
    // The drawer locks the way the app's drawers do: save, set, restore.
    const drawerPrevious = page.style.overflow;
    page.style.overflow = "hidden";
    const release = lockBodyScroll(page, { scrollbarWidth: 0, paddingRight: 0 });
    release();
    expect(page.style.overflow).toBe("hidden");
    page.style.overflow = drawerPrevious;
    expect(page.style.overflow).toBe("");
  });

  it("does not lock the page again when the drawer let go first", () => {
    const page = body();
    page.style.overflow = "hidden";
    const release = lockBodyScroll(page, { scrollbarWidth: 0, paddingRight: 0 });
    // A route change closes the drawer, whose cleanup runs before the dialog's.
    page.style.overflow = "";
    release();
    expect(page.style.overflow).toBe("");
  });
});

describe("the glow's angle", () => {
  it("is measured clockwise from the top", () => {
    expect(angleFrom(0, 0, 0, -10)).toBeCloseTo(0);
    expect(angleFrom(0, 0, 10, 0)).toBeCloseTo(90);
    expect(angleFrom(0, 0, 0, 10)).toBeCloseTo(180);
    expect(angleFrom(0, 0, -10, 0)).toBeCloseTo(270);
  });

  it("swings the short way round", () => {
    expect(shortestTurn(0, 90)).toBe(90);
    expect(shortestTurn(0, 270)).toBe(-90);
    expect(shortestTurn(350, 10)).toBe(20);
    expect(shortestTurn(10, 350)).toBe(-20);
    // From an angle that has already wound past a full turn.
    expect(shortestTurn(-400, 10)).toBe(50);
    for (let i = 0; i < 50; i += 1) {
      const turn = shortestTurn(Math.random() * 2000 - 1000, Math.random() * 360);
      expect(turn).toBeGreaterThanOrEqual(-180);
      expect(turn).toBeLessThan(180);
    }
  });
});

describe("following the pointer", () => {
  type Listener = (event: { pointerType: string; clientX: number; clientY: number }) => void;
  let added: { type: string; listener: Listener; options: unknown }[];
  let removed: string[];
  let frames: (() => void)[];
  let cancelled: number[];

  beforeEach(() => {
    added = [];
    removed = [];
    frames = [];
    cancelled = [];
    vi.stubGlobal("document", {
      addEventListener: (type: string, listener: Listener, options: unknown) =>
        added.push({ type, listener, options }),
      removeEventListener: (type: string) => removed.push(type),
    });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => cancelled.push(id));
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const load = () => import("@/components/aceternity/pointer");
  const move = (x: number, y: number, pointerType = "mouse") =>
    added[0]!.listener({ pointerType, clientX: x, clientY: y });

  it("uses one passive listener on the document, however many follow it", async () => {
    const { subscribePointer } = await load();
    subscribePointer(() => {});
    subscribePointer(() => {});
    subscribePointer(() => {});
    expect(added).toHaveLength(1);
    expect(added[0]!.type).toBe("pointermove");
    expect(added[0]!.options).toEqual({ passive: true });
  });

  it("reports at most once a frame, with the latest position, to everyone at once", async () => {
    const { subscribePointer } = await load();
    const a = vi.fn();
    const b = vi.fn();
    subscribePointer(a);
    subscribePointer(b);
    move(10, 10);
    move(20, 30);
    move(40, 50);
    expect(frames).toHaveLength(1);
    expect(a).not.toHaveBeenCalled();
    frames[0]!();
    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith({ x: 40, y: 50 });
    expect(b).toHaveBeenCalledWith({ x: 40, y: 50 });
  });

  it("ignores touch, so a finger scrolling the list lights nothing", async () => {
    const { subscribePointer } = await load();
    subscribePointer(() => {});
    move(10, 10, "touch");
    expect(frames).toHaveLength(0);
  });

  it("removes the listener, and any pending frame, when the last one leaves", async () => {
    const { subscribePointer } = await load();
    const first = subscribePointer(() => {});
    const second = subscribePointer(() => {});
    move(1, 1);
    first();
    expect(removed).toEqual([]);
    second();
    expect(removed).toEqual(["pointermove"]);
    expect(cancelled).toHaveLength(1);
    // Unsubscribing twice does no harm.
    second();
    expect(removed).toEqual(["pointermove"]);
  });
});
