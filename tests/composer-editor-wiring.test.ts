import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * How the two composers use the writing surface (F1).
 *
 * The editor is replaced by a recorder so the props each composer hands it can
 * be read: the markdown still goes out under `body`, GIFs uploaded from the
 * GIF panel (and photos pasted into the text) reach the same upload tray as
 * the photo button, and the inline composer's resting line is the editor
 * itself, so focusing it never loses the caret.
 */

const received: Record<string, unknown>[] = [];

vi.mock("@/components/feed/rich-editor", () => ({
  RichEditor: (props: Record<string, unknown>) => {
    received.push(props);
    return null;
  },
}));
vi.mock("@/app/(member)/community-actions", () => ({ createPostAction: vi.fn() }));
vi.mock("@/app/(member)/upload-actions", () => ({ requestUploadAction: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), danger: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { Composer } = await import("@/components/feed/composer");
const { ComposeForm } = await import("@/components/feed/compose-form");
const { POST_BODY_MAX } = await import("@/lib/community/post-types");

beforeEach(() => {
  received.length = 0;
});

function lastProps() {
  expect(received.length).toBeGreaterThan(0);
  return received[received.length - 1]!;
}

describe("the inline composer", () => {
  it("rests as the editor itself, collapsed, labelled, posting markdown as body", () => {
    renderToStaticMarkup(createElement(Composer, { name: "Sam", avatar: null, uploadsEnabled: true }));
    const props = lastProps();
    expect(props.name).toBe("body");
    expect(props.value).toBe("");
    expect(props.collapsed).toBe(true);
    expect(props.label).toBe("Write a post");
    expect(props.maxLength).toBe(POST_BODY_MAX);
    expect(typeof props.onFocus).toBe("function");
    expect(typeof props.onChange).toBe("function");
  });

  it("sends uploaded GIFs and pasted photos to its upload tray", () => {
    renderToStaticMarkup(createElement(Composer, { name: "Sam", avatar: null, uploadsEnabled: true }));
    const props = lastProps();
    expect(typeof props.onGifFiles).toBe("function");
    expect(props.onFiles).toBe(props.onGifFiles);
  });

  it("offers no upload where uploads are not configured", () => {
    renderToStaticMarkup(createElement(Composer, { name: "Sam", avatar: null, uploadsEnabled: false }));
    const props = lastProps();
    expect(props.onGifFiles).toBeUndefined();
    expect(props.onFiles).toBeUndefined();
  });
});

describe("the full composer", () => {
  it("labels the editor with its visible label and posts markdown as body", () => {
    const html = renderToStaticMarkup(createElement(ComposeForm, { type: "SIMPLE", uploadsEnabled: true }));
    const props = lastProps();
    expect(props.id).toBe("compose-body");
    expect(props.labelledBy).toBe("compose-body-label");
    expect(html).toMatch(/<label id="compose-body-label" for="compose-body"[^>]*>Post<\/label>/);
    expect(props.name).toBe("body");
    expect(props.maxLength).toBe(POST_BODY_MAX);
    expect(props.invalid).toBe(false);
  });

  it("wires the GIF panel's upload into the upload tray where the type takes photos", () => {
    renderToStaticMarkup(createElement(ComposeForm, { type: "SIMPLE", uploadsEnabled: true }));
    const props = lastProps();
    expect(typeof props.onGifFiles).toBe("function");
    expect(typeof props.onFiles).toBe("function");
  });

  it("offers no upload for a type without photos, or without uploads", () => {
    renderToStaticMarkup(createElement(ComposeForm, { type: "POLL", uploadsEnabled: true }));
    expect(lastProps().onGifFiles).toBeUndefined();
    renderToStaticMarkup(createElement(ComposeForm, { type: "SIMPLE", uploadsEnabled: false }));
    expect(lastProps().onGifFiles).toBeUndefined();
    expect(lastProps().onFiles).toBeUndefined();
  });
});
