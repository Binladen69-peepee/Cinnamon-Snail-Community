import { describe, expect, it } from "vitest";
import {
  htmlToPlainLines,
  literalTextToHtml,
  markdownToEditorHtml,
  pastedTextToHtml,
  sanitizePastedHtml,
} from "@/lib/content/editor-html";
import {
  formatState,
  linkFromInput,
  mentionQuery,
  nextToolIndex,
  NO_FORMAT,
  roomLeft,
  sameFormat,
} from "@/lib/content/editor-input";
import { parseRichHtml, styleMarks, textOf, writeHtml } from "@/lib/content/editor-tree";
import { htmlToMarkdown } from "@/lib/content/html-to-markdown";

/**
 * HTML going into the composer (F1): a stored post opened for editing, and
 * whatever someone pastes or drops. Plus the composer's small decisions —
 * mentions, link addresses, toolbar state — as the pure functions they are.
 */

/** Tags and attributes a paste may bring, and nothing else. */
const PASTE_ALLOWED: Record<string, string[]> = {
  p: [],
  br: [],
  strong: [],
  em: [],
  ul: [],
  ol: ["start"],
  li: [],
  a: ["href"],
};

function expectPasteSafe(html: string) {
  const tags = [...html.matchAll(/<(\/?)([a-z0-9]+)((?:\s+[a-z-]+="[^"]*")*)\s*\/?>/gi)];
  expect(tags.length, `stray "<" in ${html}`).toBe((html.match(/</g) ?? []).length);
  for (const tag of tags) {
    const name = tag[2]!.toLowerCase();
    expect(Object.hasOwn(PASTE_ALLOWED, name), `<${name}> in ${html}`).toBe(true);
    for (const attribute of (tag[3] ?? "").matchAll(/\s+([a-z-]+)="([^"]*)"/gi)) {
      expect(PASTE_ALLOWED[name], `${attribute[1]} on <${name}>`).toContain(attribute[1]!.toLowerCase());
      if (attribute[1] === "href") expect(attribute[2]).toMatch(/^(https?:|mailto:|\/(?!\/)|#)/);
    }
  }
}

describe("a stored body opens formatted", () => {
  it("shows bold, italic, lists and links as themselves", () => {
    expect(markdownToEditorHtml("With **butter** and *salt*.")).toBe(
      "<p>With <strong>butter</strong> and <em>salt</em>.</p>",
    );
    expect(markdownToEditorHtml("- a\n- b\n\n1. one")).toBe("<ul><li>a</li><li>b</li></ul><ol><li>one</li></ol>");
    expect(markdownToEditorHtml("first\nsecond\n\nnext")).toBe("<p>first<br>second</p><p>next</p>");
  });

  it("drops the newlines the renderer writes between blocks, so no caret lands on them", () => {
    const html = markdownToEditorHtml("> quoted\n\n- a\n\n  b\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).not.toMatch(/>\s+</);
    expect(html).toBe(
      "<blockquote><p>quoted</p></blockquote><ul><li><p>a</p><p>b</p></li></ul><table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
    );
  });

  it("keeps a code block's own lines", () => {
    expect(markdownToEditorHtml("```\nline 1\n  line 2\n```")).toBe("<pre><code>line 1\n  line 2\n</code></pre>");
  });

  it("links mentions and addresses the way the post will, without new-tab plumbing", () => {
    expect(markdownToEditorHtml("hey @sam")).toBe('<p>hey <a href="/members/sam">@sam</a></p>');
    expect(markdownToEditorHtml("[site](https://example.com)")).toBe('<p><a href="https://example.com/">site</a></p>');
  });

  it("shows typed HTML as text and drops unsafe links and images", () => {
    expect(markdownToEditorHtml("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    expect(markdownToEditorHtml("[click](javascript:alert(1))")).toBe("<p>click</p>");
    expect(markdownToEditorHtml("![x](https://media.tenor.com/a.gif)")).toBe(
      '<p><img src="https://media.tenor.com/a.gif" alt="x"></p>',
    );
    expect(markdownToEditorHtml("![x](https://evil.example/p.png)")).toBe(
      '<p><a href="https://evil.example/p.png">x</a></p>',
    );
  });

  it("is empty for an empty body", () => {
    expect(markdownToEditorHtml("")).toBe("");
    expect(markdownToEditorHtml("   \n ")).toBe("");
    expect(markdownToEditorHtml(null)).toBe("");
  });
});

describe("pasting rich content keeps bold, italic, lists and links only", () => {
  it("reads a Google Doc's styled spans as formatting", () => {
    const html = sanitizePastedHtml(
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-weight:700;">Bold</span><span style="font-weight:400;"> and </span><span style="font-style:italic;">italic</span></p><ul><li dir="ltr"><p>one</p></li><li><p>two</p></li></ul></b>',
    );
    expect(html).toBe("<p><strong>Bold</strong> and <em>italic</em></p><ul><li>one</li><li>two</li></ul>");
  });

  it("strips scripts, styles, images, classes, handlers and unsafe links", () => {
    const html = sanitizePastedHtml(
      '<div class="x" style="color:red" onclick="alert(1)"><h1>Title</h1><p>Hello <a href="javascript:alert(1)">bad</a> <a href="https://ok.example/" target="_blank" rel="opener">ok</a> <img src="https://media.tenor.com/a.gif" onerror="alert(1)"></p><script>alert(1)</script><style>*{}</style></div>',
    );
    expect(html).toBe('<p>Title</p><p>Hello bad <a href="https://ok.example/">ok</a> </p>');
    expectPasteSafe(html);
  });

  it("goes in as words when it is one paragraph, so it joins the line", () => {
    expect(sanitizePastedHtml("<span>just <b>bold</b></span>")).toBe("just <strong>bold</strong>");
    expect(sanitizePastedHtml("<p>one <i>line</i></p>")).toBe("one <em>line</em>");
  });

  it("turns headings, quotes, code and table rows into paragraphs", () => {
    expect(sanitizePastedHtml("<h2>Head</h2><blockquote>said</blockquote><pre>a\nb</pre>")).toBe(
      "<p>Head</p><p>said</p><p>a<br>b</p>",
    );
    expect(sanitizePastedHtml("<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>")).toBe(
      "<p>a b </p><p>c </p>",
    );
  });

  it("never leaves a block inside bold or a paragraph", () => {
    expect(sanitizePastedHtml("<b><p>one</p><p>two</p></b>")).toBe("<p><strong>one</strong></p><p><strong>two</strong></p>");
    expect(sanitizePastedHtml("<p>a<ul><li>b</li></ul>c</p>")).toBe("<p>a</p><ul><li>b</li></ul><p>c</p>");
  });

  it("keeps an item's paragraphs as its lines, and nested lists inside it", () => {
    expect(sanitizePastedHtml("<ul><li><p>a</p><p>b</p></li><ul><li>c</li></ul></ul>")).toBe(
      "<ul><li>a<br>b<ul><li>c</li></ul></li></ul>",
    );
  });

  const hostile = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    '<svg onload="alert(1)"><a xlink:href="javascript:alert(1)">x</a></svg>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<a href="javascript:alert(1)" onmouseover="alert(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<p style="background:url(javascript:alert(1))" class="evil">x</p>',
    '<form><input onfocus="alert(1)" autofocus></form>',
    "<math><mi xlink:href=\"javascript:alert(1)\">x</mi></math>",
    "<noscript><p title=\"</noscript><img src=x onerror=alert(1)>\"></noscript>",
    '<object data="javascript:alert(1)"></object>',
    "<base href=\"javascript:alert(1)//\">",
    '<a href="https://ok.example" style="position:fixed;inset:0">overlay</a>',
  ];
  for (const payload of hostile) {
    it(`reduces ${JSON.stringify(payload).slice(0, 60)} to allowed structure`, () => {
      expectPasteSafe(sanitizePastedHtml(payload));
    });
  }
});

describe("pasting plain text", () => {
  it("reads it as markdown, the format posts are written in", () => {
    expect(pastedTextToHtml("Soak **overnight**\n\n- beans\n- salt")).toBe(
      "<p>Soak <strong>overnight</strong></p><ul><li>beans</li><li>salt</li></ul>",
    );
    expect(pastedTextToHtml("see https://example.com")).toBe(
      'see <a href="https://example.com/">https://example.com</a>',
    );
  });

  it("keeps HTML in it as text", () => {
    const html = pastedTextToHtml("<script>alert(1)</script> <b>x</b>");
    expect(html).toBe("&lt;script&gt;alert(1)&lt;/script&gt; &lt;b&gt;x&lt;/b&gt;");
    expectPasteSafe(html);
  });

  it("can be taken literally (Ctrl/⌘+Shift+V)", () => {
    expect(literalTextToHtml("a **b** <x>")).toBe("a **b** &lt;x&gt;");
    expect(literalTextToHtml("one\ntwo\n\nthree")).toBe("<p>one<br>two</p><p>three</p>");
    // And it saves as the characters, not as formatting.
    expect(htmlToMarkdown(literalTextToHtml("a **b**"))).toBe("a \\*\\*b\\*\\*");
  });

  it("gives the words of a paste for when only part of it fits", () => {
    expect(htmlToPlainLines("<p>one <b>two</b></p><ul><li>three</li></ul>")).toBe("one two\nthree");
  });
});

describe("the editor's reading of HTML", () => {
  it("keeps only the editor's structure and decodes characters", () => {
    const nodes = parseRichHtml('<p class="x" data-a="1">a &amp; b &lt;c&gt; &quot;d&quot;</p><b>bold</b><u>under</u>');
    expect(writeHtml(nodes)).toBe("<p>a &amp; b &lt;c&gt; \"d\"</p><strong>bold</strong>under");
    expect(textOf(nodes)).toBe('a & b <c> "d"boldunder');
  });

  it("reads bold, italic and strikethrough from a style, including switching them off", () => {
    expect(styleMarks("font-weight: 700; font-style: italic")).toEqual({ bold: true, italic: true });
    expect(styleMarks("font-weight:normal")).toEqual({ bold: false });
    expect(styleMarks("font-weight: bold; text-decoration: line-through")).toEqual({ bold: true, strike: true });
    expect(styleMarks("color: red")).toEqual({});
    expect(styleMarks(null)).toEqual({});
  });
});

describe("composer decisions", () => {
  it("finds the handle being typed after an @", () => {
    expect(mentionQuery("thanks @sa")).toEqual({ query: "sa", length: 3 });
    expect(mentionQuery("@")).toEqual({ query: "", length: 1 });
    expect(mentionQuery("mail me@sa")).toBeNull();
    expect(mentionQuery("thanks @sa ")).toBeNull();
    expect(mentionQuery("thanks\u00a0@bo")).toEqual({ query: "bo", length: 3 });
  });

  it("reads a typed link address the way the post will", () => {
    expect(linkFromInput("https://example.com/a")).toBe("https://example.com/a");
    expect(linkFromInput("example.com/guide")).toBe("https://example.com/guide");
    expect(linkFromInput("example.com:8080/x")).toBe("https://example.com:8080/x");
    expect(linkFromInput("sam@example.com")).toBe("mailto:sam@example.com");
    expect(linkFromInput("/learn")).toBe("/learn");
    expect(linkFromInput("javascript:alert(1)")).toBeNull();
    expect(linkFromInput("data:text/html,x")).toBeNull();
    expect(linkFromInput("//evil.example")).toBeNull();
    expect(linkFromInput("not a link")).toBeNull();
    expect(linkFromInput("   ")).toBeNull();
  });

  it("knows which toolbar buttons are pressed from where the caret is", () => {
    expect(formatState([])).toEqual(NO_FORMAT);
    const inBoldLink = formatState([
      { tag: "A", href: "https://example.com/" },
      { tag: "B" },
      { tag: "LI" },
      { tag: "UL" },
    ]);
    expect(inBoldLink).toEqual({ ...NO_FORMAT, bold: true, link: true, bulleted: true });
    // An inner style can switch bold back off.
    expect(formatState([{ tag: "SPAN", style: "font-weight:400" }, { tag: "STRONG" }]).bold).toBe(false);
    expect(formatState([{ tag: "LI" }, { tag: "OL" }, { tag: "LI" }, { tag: "UL" }])).toMatchObject({
      numbered: true,
      bulleted: false,
    });
    expect(formatState([{ tag: "H2" }]).heading).toBe(true);
    expect(formatState([{ tag: "P" }, { tag: "BLOCKQUOTE" }]).quote).toBe(true);
    expect(formatState([{ tag: "A", href: "javascript:alert(1)" }]).link).toBe(false);
    expect(sameFormat(NO_FORMAT, { ...NO_FORMAT })).toBe(true);
    expect(sameFormat(NO_FORMAT, { ...NO_FORMAT, bold: true })).toBe(false);
  });

  it("moves through the toolbar with the arrow keys, skipping what is disabled", () => {
    const enabled = [true, false, true, true];
    expect(nextToolIndex(0, "ArrowRight", enabled)).toBe(2);
    expect(nextToolIndex(3, "ArrowRight", enabled)).toBe(0);
    expect(nextToolIndex(0, "ArrowLeft", enabled)).toBe(3);
    expect(nextToolIndex(2, "Home", enabled)).toBe(0);
    expect(nextToolIndex(0, "End", enabled)).toBe(3);
    expect(nextToolIndex(0, "a", enabled)).toBeNull();
    expect(nextToolIndex(0, "ArrowRight", [false, false])).toBeNull();
  });

  it("counts the room left in stored characters", () => {
    expect(roomLeft(4990, 5000)).toBe(10);
    expect(roomLeft(5010, 5000)).toBe(0);
    expect(roomLeft(10, undefined)).toBe(Number.POSITIVE_INFINITY);
  });
});
