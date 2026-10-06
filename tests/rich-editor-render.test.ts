import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The composer's writing surface, rendered to markup (F1).
 *
 * Not a typing test (there is no browser here), but it holds what a screen
 * reader, a keyboard and a server action depend on: a labelled multi-line
 * textbox, a labelled toolbar of toggle buttons that say whether they are
 * pressed, one tab stop into the toolbar, the stored body shown formatted
 * rather than as markdown, and the markdown posted under the same field name
 * as before.
 */

const { RichEditor } = await import("@/components/feed/rich-editor");

type Props = Parameters<typeof RichEditor>[0];

function render(props: Partial<Props> = {}) {
  return renderToStaticMarkup(
    createElement(RichEditor, {
      name: "body",
      value: "",
      onChange: vi.fn(),
      id: "compose-body",
      placeholder: "Share something…",
      ...props,
    }),
  );
}

/** The editable region's opening tag and its contents. */
function region(html: string) {
  const match = /<div([^>]*role="textbox"[^>]*)>([\s\S]*?)<\/div><div aria-hidden|<div([^>]*role="textbox"[^>]*)>([\s\S]*?)<\/div><\/div>/.exec(html);
  expect(match, html).not.toBeNull();
  return { tag: match![1] ?? match![3]!, content: match![2] ?? match![4]! };
}

describe("the writing surface", () => {
  it("is a labelled, multi-line, editable textbox", () => {
    const html = render({ label: "Write a post" });
    const { tag } = region(html);
    expect(tag).toContain('id="compose-body"');
    expect(tag).toContain('aria-multiline="true"');
    expect(tag).toMatch(/contenteditable="true"/i);
    expect(tag).toContain('aria-label="Write a post"');
    expect(tag).toContain('aria-placeholder="Share something…"');
    expect(tag).toMatch(/spellcheck="true"/i);
    // The field look and its focus ring come from the shared field style.
    expect(tag).toContain("vu-field");
  });

  it("can be named by a visible label instead", () => {
    expect(region(render({ labelledBy: "compose-body-label" })).tag).toContain(
      'aria-labelledby="compose-body-label"',
    );
  });

  it("has a labelled toolbar of toggle buttons with one tab stop", () => {
    const html = render();
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Formatting"');
    expect(html).toContain('aria-controls="compose-body"');
    for (const label of ["Bold", "Italic", "Heading", "Bulleted list", "Numbered list", "Quote", "Link"]) {
      expect(html).toMatch(new RegExp(`aria-label="${label}" aria-pressed="false"`));
    }
    for (const label of ["Emoji", "GIF"]) {
      expect(html).toMatch(new RegExp(`aria-label="${label}" aria-expanded="false"`));
    }
    expect(html).toContain('aria-keyshortcuts="Control+B Meta+B"');
    expect(html).toContain('aria-keyshortcuts="Control+K Meta+K"');
    const toolbar = /role="toolbar"[\s\S]*?<\/div>/.exec(html)![0];
    expect(toolbar.match(/tabindex="0"/g)).toHaveLength(1);
    expect(toolbar.match(/tabindex="-1"/g)).toHaveLength(8);
    // The old markdown-only tools are gone: no Preview, no Code button.
    expect(html).not.toContain(">Preview<");
    expect(html).not.toContain('aria-label="Code"');
  });

  it("opens a stored body formatted, never as markdown", () => {
    const { content } = region(render({ value: "With **butter** and *salt*.\n\n- one\n- two" }));
    expect(content).toBe("<p>With <strong>butter</strong> and <em>salt</em>.</p><ul><li>one</li><li>two</li></ul>");
    expect(content).not.toContain("**");
  });

  it("starts an empty body on an empty paragraph, with the placeholder showing", () => {
    const html = render();
    expect(region(html).content).toBe("<p><br></p>");
    expect(html).toMatch(/<div aria-hidden="true"[^>]*>Share something…<\/div>/);
    expect(render({ value: "Hello" })).not.toMatch(/aria-hidden="true"[^>]*>Share something…/);
  });

  it("posts the markdown under the same field name as before", () => {
    const html = render({ value: "With **butter**." });
    expect(html).toContain('<input type="hidden" name="body" value="With **butter**."/>');
  });

  it("shows HTML in a stored body as text, never as markup", () => {
    const { content } = region(render({ value: '<img src=x onerror="alert(1)"> and <script>alert(1)</script>' }));
    expect(content).not.toMatch(/<img|<script/);
    expect(content).toBe('<p>&lt;img src=x onerror="alert(1)"&gt; and &lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it("goes read-only and says so while a post is sending", () => {
    const html = render({ value: "Posting", disabled: true });
    const { tag } = region(html);
    expect(tag).toMatch(/contenteditable="false"/i);
    expect(tag).toContain('aria-disabled="true"');
    const toolbar = /role="toolbar"[\s\S]*?<\/div>/.exec(html)![0];
    expect(toolbar.match(/<button/g)).toHaveLength(toolbar.match(/disabled=""/g)!.length);
  });

  it("rests as one quiet line with no toolbar when collapsed", () => {
    const html = render({ collapsed: true, label: "Write a post" });
    expect(html).not.toContain('role="toolbar"');
    expect(region(html).tag).not.toContain("vu-field");
  });

  it("marks an over-long body as invalid for the field's error styling", () => {
    expect(region(render({ value: "x".repeat(12), maxLength: 10, invalid: true })).tag).toContain(
      'aria-invalid="true"',
    );
    expect(region(render({ value: "fine" })).tag).not.toContain("aria-invalid");
  });

  it("offers a GIF upload only where it can attach one", () => {
    expect(render()).not.toContain('accept="image/gif"');
    expect(render({ onGifFiles: vi.fn() })).toContain('accept="image/gif"');
  });
});
