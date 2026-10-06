import { describe, expect, it } from "vitest";
import {
  analyzeRichText,
  EXTERNAL_LINK_REL,
  hasVisibleContent,
  renderRichText,
  richTextMentions,
  richTextToPlain,
  scanLenientEmphasis,
  scanLenientStrong,
} from "@/lib/content/rich-text";
import { excerptText } from "@/lib/content/excerpt";
import {
  decodeEntities,
  isInternalHref,
  safeImageSrc,
  safeLinkHref,
} from "@/lib/content/urls";

/**
 * The member-text pipeline (DEC-078, contract C2): bold renders as bold and
 * never as `**text**`, raw HTML is never passed through, and the plain text
 * that feeds excerpts, notifications and search carries no markup at all.
 */

/** Each tag the pipeline may emit, and the attributes it may carry. */
const ALLOWED: Record<string, string[]> = {
  p: [],
  br: [],
  strong: [],
  em: [],
  b: [],
  i: [],
  del: [],
  s: [],
  ul: [],
  ol: ["start"],
  li: [],
  blockquote: [],
  a: ["href", "title", "target", "rel"],
  h2: [],
  h3: [],
  h4: [],
  code: [],
  pre: [],
  img: ["src", "alt", "title", "loading", "decoding"],
  hr: [],
  table: ["style"],
  thead: [],
  tbody: [],
  tr: [],
  th: ["align"],
  td: ["align"],
};

/** A tag as the pipeline writes them: double-quoted values, no raw quotes inside. */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s="'/>]+(?:="[^"]*")?)*)\s*\/?>/g;
const ATTRIBUTE = /\s+([^\s="'/>]+)(?:="([^"]*)")?/g;

function decodeAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * What a browser would build from this HTML, checked structurally: every `<`
 * opens a well-formed tag, every tag and attribute is on the allowlist, and
 * every URL is one we allow. Text that merely looks like an attribute (an
 * escaped title, a typed `<a onclick=…>` shown as text) is text, and passes.
 */
function expectSafe(html: string) {
  const tags = [...html.matchAll(TAG)];
  expect(tags.length, `a "<" that does not open a well-formed tag in ${html}`).toBe(
    (html.match(/</g) ?? []).length,
  );
  for (const tag of tags) {
    const name = tag[2]!.toLowerCase();
    expect(Object.hasOwn(ALLOWED, name), `tag <${name}> in ${html}`).toBe(true);
    if (tag[1]) continue;
    const attributes = new Map<string, string>();
    for (const attribute of (tag[3] ?? "").matchAll(ATTRIBUTE)) {
      const key = attribute[1]!.toLowerCase();
      expect(ALLOWED[name]!.includes(key), `attribute ${key} on <${name}> in ${html}`).toBe(true);
      attributes.set(key, decodeAttribute(attribute[2] ?? ""));
    }
    const url = attributes.get("href") ?? attributes.get("src");
    if (url !== undefined) {
      const sameSite = /^\/(?![/\\])/.test(url) || url.startsWith("#");
      expect(sameSite || /^(https?:|mailto:)/i.test(url), `url ${url}`).toBe(true);
      if (name === "img") {
        expect(url.startsWith("/api/media/") || url.startsWith("https://"), url).toBe(true);
      }
      if (name === "a") {
        if (sameSite) {
          expect(attributes.has("target")).toBe(false);
        } else {
          expect(attributes.get("rel")).toBe(EXTERNAL_LINK_REL);
          expect(attributes.get("target")).toBe("_blank");
        }
      }
    }
    if (name === "table" && attributes.has("style")) {
      expect(attributes.get("style")).toBe("display:block;max-width:100%;overflow-x:auto");
    }
  }
}

describe("formatting renders as formatting", () => {
  it("renders bold, italic and strikethrough", () => {
    expect(renderRichText("**ok**")).toBe("<p><strong>ok</strong></p>");
    expect(renderRichText("*ok*")).toBe("<p><em>ok</em></p>");
    expect(renderRichText("_ok_")).toBe("<p><em>ok</em></p>");
    expect(renderRichText("~~gone~~")).toBe("<p><del>gone</del></p>");
    expect(renderRichText("***both***")).toContain("<strong>both</strong>");
  });

  it("makes bold out of markers that CommonMark refuses", () => {
    // A selection's trailing space wrapped inside the markers, and punctuation
    // before the closing pair: both showed members literal asterisks.
    expect(renderRichText("**word **next")).toBe("<p><strong>word</strong> next</p>");
    expect(renderRichText("** spaced **")).toBe("<p> <strong>spaced</strong> </p>");
    expect(renderRichText("**Note:**text")).toBe("<p><strong>Note:</strong>text</p>");
    expect(renderRichText("say **hi** to **everyone**")).toBe(
      "<p>say <strong>hi</strong> to <strong>everyone</strong></p>",
    );
  });

  it("fixes the old toolbar's italics without touching ordinary underscores", () => {
    expect(renderRichText("_old italic _next")).toBe("<p><em>old italic</em> next</p>");
    expect(renderRichText("snake_case_name")).toBe("<p>snake_case_name</p>");
    expect(renderRichText("file_name _v2_")).not.toContain("<em>name");
  });

  it("never shows `**` around words that were meant to be bold", () => {
    const reported =
      "**Ingredients**\n- 1 cup red lentils\n- Onion, garlic, lemon\n- Salt\n\n**Method**\nSimmer until they collapse.";
    const html = renderRichText(reported);
    expect(html).toContain("<strong>Ingredients</strong>");
    expect(html).toContain("<strong>Method</strong>");
    expect(html).not.toContain("**");
    expect(html).toContain("<li>1 cup red lentils</li>");
  });

  it("keeps the lines the member typed", () => {
    expect(renderRichText("line one\nline two")).toBe("<p>line one<br />line two</p>");
    expect(renderRichText("first\n\nsecond")).toBe("<p>first</p>\n<p>second</p>");
  });

  it("renders lists, quotes, code, headings and rules", () => {
    expect(renderRichText("- a\n- b")).toBe("<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
    expect(renderRichText("1. a\n2. b")).toBe("<ol>\n<li>a</li>\n<li>b</li>\n</ol>");
    expect(renderRichText("> quoted")).toBe("<blockquote>\n<p>quoted</p>\n</blockquote>");
    expect(renderRichText("`a < b`")).toBe("<p><code>a &lt; b</code></p>");
    expect(renderRichText("```\n<b>x</b>\n```")).toBe(
      "<pre><code>&lt;b&gt;x&lt;/b&gt;\n</code></pre>",
    );
    // A post has its own title: headings start a level down and stop at h4.
    expect(renderRichText("# Big")).toBe("<h2>Big</h2>");
    expect(renderRichText("###### Small")).toBe("<h4>Small</h4>");
    expect(renderRichText("a\n\n---\n\nb")).toContain("<hr />");
  });

  it("renders task lists as characters and tables that scroll", () => {
    expect(renderRichText("- [ ] todo\n- [x] done")).toBe(
      "<ul>\n<li>☐ todo</li>\n<li>☑ done</li>\n</ul>",
    );
    const table = renderRichText("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(table).toContain('<table style="display:block;max-width:100%;overflow-x:auto">');
    expect(table).toContain("<td>1</td>");
  });

  it("returns nothing for nothing", () => {
    expect(renderRichText("")).toBe("");
    expect(renderRichText("   \n  ")).toBe("");
    expect(renderRichText(null)).toBe("");
    expect(renderRichText(undefined)).toBe("");
  });
});

describe("raw HTML is never passed through", () => {
  it("shows typed HTML as text", () => {
    expect(renderRichText("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
    expect(renderRichText("a <b>bold</b> c")).toBe("<p>a &lt;b&gt;bold&lt;/b&gt; c</p>");
    expect(renderRichText("I <3 lentils")).toBe("<p>I &lt;3 lentils</p>");
  });

  const payloads = [
    "<script>alert(1)</script>",
    "<SCRIPT SRC=https://evil.example/x.js></SCRIPT>",
    "<img src=x onerror=alert(1)>",
    '<img src="x" onerror="alert(1)">',
    "<svg/onload=alert(1)>",
    '<iframe src="javascript:alert(1)"></iframe>',
    '<a href="javascript:alert(1)">click</a>',
    '<a href="https://ok.example" onclick="alert(1)">x</a>',
    "<body onload=alert(1)>",
    '<div style="background:url(javascript:alert(1))">x</div>',
    "<style>body{display:none}</style>",
    "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
    '"><script>alert(1)</script>',
    "<!--<script>alert(1)</script>-->",
    "<![CDATA[<script>alert(1)</script>]]>",
    "[click](javascript:alert(1))",
    "[click](JaVaScRiPt:alert(1))",
    "[click](&#106;avascript:alert(1))",
    "[click](&#x6A;avascript:alert(1))",
    "[click](javascript&colon;alert(1))",
    "[click](<javascript:alert(1)>)",
    "[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "[click](vbscript:msgbox(1))",
    "[click](file:///etc/passwd)",
    "[click](//evil.example)",
    "[click](/\\evil.example)",
    "[click](https://bank.example@evil.example)",
    '[click](https://example.com "x\\" onmouseover=\\"alert(1)")',
    "[x][1]\n\n[1]: javascript:alert(1)",
    "![x](javascript:alert(1))",
    "![x](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)",
    '![x" onerror="alert(1)](https://media.tenor.com/a.gif)',
    '![x](https://media.tenor.com/a.gif "t\\" onload=\\"alert(1)")',
    "**<img src=x onerror=alert(1)>**",
    "_<script>alert(1)</script>_",
    "`<script>alert(1)</script>`",
    "```\n<script>alert(1)</script>\n```",
    "> <script>alert(1)</script>",
    "- <img src=x onerror=alert(1)>",
    "| <script>alert(1)</script> | x |\n|---|---|\n| <img src=x onerror=1> | y |",
    "[<img src=x onerror=alert(1)>](https://example.com)",
    '<https://example.com/"><script>alert(1)</script>>',
    'www.example.com/"onmouseover="alert(1)',
    "https://example.com/<script>alert(1)</script>",
    "@<script>alert(1)</script>",
    "&lt;script&gt;alert(1)&lt;/script&gt;",
    "<div>\n**markdown inside html**\n</div>",
    "<details open ontoggle=alert(1)>",
    "<a href=\"&#0000106&#0000097&#0000118&#0000097&#0000115&#0000099&#0000114&#0000105&#0000112&#0000116&#0000058&#0000097&#0000108&#0000101&#0000114&#0000116&#0000040&#0000039&#0000088&#0000083&#0000083&#0000039&#0000041\">x</a>",
  ];

  for (const payload of payloads) {
    it(`neutralises ${JSON.stringify(payload).slice(0, 70)}`, () => {
      const html = renderRichText(payload);
      expectSafe(html);
      // And the plain text never carries a tag.
      expect(richTextToPlain(payload)).not.toMatch(/<[a-zA-Z!/?]/);
    });
  }

  it("keeps the words of a link it refuses to follow", () => {
    expect(renderRichText("[click](javascript:alert(1))")).toBe("<p>click</p>");
    expect(renderRichText("[x][1]\n\n[1]: javascript:alert(1)")).toBe("<p>x</p>");
  });
});

describe("links", () => {
  it("opens external links in a new tab without passing on the page", () => {
    expect(renderRichText("[hello](https://example.com)")).toBe(
      `<p><a href="https://example.com/" target="_blank" rel="${EXTERNAL_LINK_REL}">hello</a></p>`,
    );
  });

  it("links bare URLs and email addresses", () => {
    expect(renderRichText("see https://example.com/a_b")).toContain(
      'href="https://example.com/a_b"',
    );
    expect(renderRichText("write to a@b.com")).toContain('href="mailto:a@b.com"');
  });

  it("keeps same-site links in the same tab", () => {
    expect(renderRichText("[recipes](/learn)")).toBe('<p><a href="/learn">recipes</a></p>');
  });

  it("escapes a title instead of letting it out of its attribute", () => {
    const html = renderRichText('[x](https://example.com "a\\" onmouseover=\\"b")');
    expect(html).toContain('title="a&quot; onmouseover=&quot;b"');
    expectSafe(html);
  });
});

describe("images", () => {
  it("shows uploads and GIF-search results inline", () => {
    expect(renderRichText("![cat](https://media.tenor.com/abc/cat.gif)")).toBe(
      '<p><img src="https://media.tenor.com/abc/cat.gif" alt="cat" loading="lazy" decoding="async" /></p>',
    );
    expect(renderRichText("![](/api/media/user1/k-1.gif)")).toContain(
      '<img src="/api/media/user1/k-1.gif" alt="GIF"',
    );
    expect(renderRichText("![](/api/media/user1/k-1.webp)")).toContain('alt="Image"');
  });

  it("turns an image from anywhere else into a link to it", () => {
    // A tracking pixel and an image that can be swapped after moderation.
    expect(renderRichText("![pic](https://evil.example/pixel.png)")).toBe(
      `<p><a href="https://evil.example/pixel.png" target="_blank" rel="${EXTERNAL_LINK_REL}">pic</a></p>`,
    );
    // Plain http from an allowed host is still mixed content.
    expect(renderRichText("![g](http://media.tenor.com/a.gif)")).not.toContain("<img");
    expect(renderRichText("![g](/elsewhere/a.gif)")).not.toContain("<img");
  });
});

describe("mentions", () => {
  it("turns a handle into a link to that member", () => {
    expect(renderRichText("hey @sam")).toBe('<p>hey <a href="/members/sam">@sam</a></p>');
    expect(richTextMentions("hey @sam")).toEqual(["sam"]);
  });

  it("lowercases the target but keeps what was typed", () => {
    expect(renderRichText("hi @Sam")).toBe('<p>hi <a href="/members/sam">@Sam</a></p>');
    expect(richTextMentions("hi @Sam and @sam")).toEqual(["sam"]);
  });

  it("leaves an email address alone", () => {
    expect(richTextMentions("write to a@bcd.com")).toEqual([]);
    expect(renderRichText("write to a@bcd.com")).not.toContain("/members/");
  });

  it("leaves code alone", () => {
    expect(renderRichText("`@sam`")).toBe("<p><code>@sam</code></p>");
    expect(richTextMentions("```\n@sam\n```")).toEqual([]);
  });

  it("does not link a handle inside a link, and counts a link written by hand", () => {
    expect(renderRichText("[hi @ann](https://example.com)")).not.toContain("/members/ann");
    expect(richTextMentions("[hi @ann](https://example.com)")).toEqual([]);
    expect(renderRichText("[@sam](/members/sam)")).toBe('<p><a href="/members/sam">@sam</a></p>');
    expect(richTextMentions("[@sam](/members/sam)")).toEqual(["sam"]);
  });

  it("lets a backslash opt out, and finds mentions inside formatting", () => {
    expect(richTextMentions("not \\@sam")).toEqual([]);
    expect(richTextMentions("**thanks @ann** and _@bo_")).toEqual(["ann", "bo"]);
  });

  it("stops linking past a sensible number", () => {
    const wall = Array.from({ length: 80 }, (_, i) => `@member${i}`).join(" ");
    expect(richTextMentions(wall)).toHaveLength(50);
  });
});

describe("plain text", () => {
  it("has no markup at all, ever", () => {
    const body =
      "## Title\n\n**Bold** and *italic* and ~~gone~~ and `code`\n\n- one\n- two\n\n> quote\n\n[link](https://example.com) ![cat](https://media.tenor.com/a.gif)";
    const plain = richTextToPlain(body);
    expect(plain).toBe("Title Bold and italic and gone and code one two quote link cat");
    expect(plain).not.toMatch(/\*\*|!\[|\]\(|^#|<[a-z]/);
  });

  it("is the reported excerpt without asterisks", () => {
    expect(
      richTextToPlain(
        "**Ingredients**\n- 1 cup red lentils\n- Onion, garlic, lemon\n- Salt\n\n**Method**\nSimmer until they collapse.",
      ),
    ).toBe("Ingredients 1 cup red lentils Onion, garlic, lemon Salt Method Simmer until they collapse.");
  });

  it("decodes characters instead of showing their codes", () => {
    expect(richTextToPlain("Tom & Jerry")).toBe("Tom & Jerry");
    expect(richTextToPlain("Tom &amp; Jerry &eacute; &#x27;q&#x27; 3 &lt; 4")).toBe(
      "Tom & Jerry é 'q' 3 < 4",
    );
    expect(richTextToPlain('say "hi"')).toBe('say "hi"');
  });

  it("separates blocks and line breaks with a space", () => {
    expect(richTextToPlain("one\ntwo\n\nthree")).toBe("one two three");
    expect(richTextToPlain("| a | b |\n|---|---|\n| 1 | 2 |")).toBe("a b 1 2");
  });

  it("names an image by its description", () => {
    expect(richTextToPlain("![dancing cat](https://media.tenor.com/a.gif)")).toBe("dancing cat");
    expect(richTextToPlain("![](https://media.tenor.com/a.gif)")).toBe("GIF");
  });

  it("never carries stray markers or tags typed as text", () => {
    expect(richTextToPlain("5 ** 2")).not.toContain("**");
    expect(richTextToPlain("**unclosed bold")).toBe("unclosed bold");
    expect(richTextToPlain("a <b>tag</b> here")).toBe("a tag here");
    expect(richTextToPlain("x<y and I <3 it")).toBe("x< y and I <3 it");
  });
});

describe("the pipeline as a whole", () => {
  it("returns html, plain text and mentions from one parse", () => {
    const analysis = analyzeRichText("**Hi** @sam, see [this](https://example.com)");
    expect(analysis.html).toContain("<strong>Hi</strong>");
    expect(analysis.plain).toBe("Hi @sam, see this");
    expect(analysis.mentions).toEqual(["sam"]);
  });

  it("is deterministic, cached or not", () => {
    const body = "Same **body** @sam";
    const first = renderRichText(body);
    expect(renderRichText(body)).toBe(first);
    expect(renderRichText(`${body}`)).toBe(first);
  });

  it("knows when a body shows nothing", () => {
    expect(hasVisibleContent(analyzeRichText("![](javascript:alert(1))"))).toBe(false);
    expect(hasVisibleContent(analyzeRichText("[](https://example.com)"))).toBe(false);
    expect(hasVisibleContent(analyzeRichText("![](https://media.tenor.com/a.gif)"))).toBe(true);
    expect(hasVisibleContent(analyzeRichText("hello"))).toBe(true);
  });

  it("renders hostile input in bounded time, as typed", () => {
    // Each of these took marked from half a second to a stack overflow.
    const inputs = [
      `x${" ".repeat(20000)}y`,
      "a*".repeat(10000),
      "_".repeat(20000),
      "*".repeat(20000),
      "[a](".repeat(5000),
      ">".repeat(20000),
      "<".repeat(20000),
      "@ab ".repeat(5000),
    ];
    for (const input of inputs) {
      const started = performance.now();
      const html = renderRichText(input);
      const elapsed = performance.now() - started;
      expect(elapsed, `${input.slice(0, 12)}… took ${elapsed.toFixed(0)}ms`).toBeLessThan(750);
      expectSafe(html);
    }
  });

  it("caps quote nesting rather than recursing without end", () => {
    const html = renderRichText(`${">".repeat(30)} deep`);
    expect(html.match(/<blockquote>/g)?.length).toBe(8);
  });
});

describe("lenient emphasis scanners", () => {
  it("find a bold pair on one line and nothing else", () => {
    expect(scanLenientStrong("**a**")).toEqual({ raw: "**a**", lead: "", inner: "a", trail: "" });
    expect(scanLenientStrong("**a **b")?.trail).toBe(" ");
    expect(scanLenientStrong("**a\nb**")).toBeNull();
    expect(scanLenientStrong("**a *b* c**")).toBeNull();
    expect(scanLenientStrong("**`a`**")).toBeNull();
    expect(scanLenientStrong("***a***")).toBeNull();
    expect(scanLenientStrong("** **")).toBeNull();
  });

  it("find only the old toolbar's italic shape", () => {
    expect(scanLenientEmphasis("_a _b")).toEqual({ raw: "_a _", inner: "a", trail: " " });
    expect(scanLenientEmphasis("_a_")).toBeNull();
    expect(scanLenientEmphasis("_ a _")).toBeNull();
    expect(scanLenientEmphasis("__a __")).toBeNull();
  });
});

describe("URL policy", () => {
  it("allows web, mail and same-site links", () => {
    expect(safeLinkHref("https://example.com/a?b=1&c=2")).toBe("https://example.com/a?b=1&c=2");
    expect(safeLinkHref("http://example.com")).toBe("http://example.com/");
    expect(safeLinkHref("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(safeLinkHref("/members/sam")).toBe("/members/sam");
    expect(safeLinkHref("/posts/1#comment-2")).toBe("/posts/1#comment-2");
  });

  it("refuses everything else", () => {
    for (const href of [
      "javascript:alert(1)",
      " JAVASCRIPT:alert(1)",
      "&#106;avascript:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,x",
      "vbscript:x",
      "file:///etc/passwd",
      "//evil.example",
      "/\\evil.example",
      "https://user:pass@example.com",
      "https://bank.example@evil.example",
      "mailto:nobody",
      "relative/path",
      "",
      null,
      undefined,
    ]) {
      expect(safeLinkHref(href as string), String(href)).toBeNull();
    }
  });

  it("tells same-site links from external ones", () => {
    expect(isInternalHref("/members/sam")).toBe(true);
    expect(isInternalHref("#top")).toBe(true);
    expect(isInternalHref("https://example.com")).toBe(false);
  });

  it("allows images only from uploads and the listed https hosts", () => {
    expect(safeImageSrc("/api/media/u1/k.gif")).toBe("/api/media/u1/k.gif");
    expect(safeImageSrc("https://media.tenor.com/x/y.gif")).toBe("https://media.tenor.com/x/y.gif");
    expect(safeImageSrc("https://media2.giphy.com/media/x/giphy.gif")).not.toBeNull();
    for (const src of [
      "http://media.tenor.com/x.gif",
      "https://evil.example/x.gif",
      "/api/other/x.gif",
      "/api/media/../secret",
      "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
      "javascript:alert(1)",
      "//media.tenor.com/x.gif",
    ]) {
      expect(safeImageSrc(src), src).toBeNull();
    }
  });

  it("decodes the references a browser would decode", () => {
    expect(decodeEntities("&#106;&#x61;va&amp;&lt;&colon;&Tab;")).toBe("java&<:\t");
    expect(decodeEntities("&unknown; stays")).toBe("&unknown; stays");
    expect(decodeEntities("&#0;")).toBe("�");
  });
});

describe("excerpts", () => {
  it("cuts on a word and marks the cut", () => {
    expect(excerptText("short", 90)).toBe("short");
    expect(excerptText("one two three four five six", 15)).toBe("one two three…");
    expect(excerptText("   spaced   out   ", 90)).toBe("spaced out");
  });

  it("never splits an emoji in half", () => {
    const text = `${"a".repeat(8)}🥑🥑🥑`;
    const cut = excerptText(text, 10);
    expect(cut).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(cut.endsWith("…")).toBe(true);
  });
});
