import { describe, expect, it } from "vitest";
import { htmlToMarkdown, htmlToMarkdownReport } from "@/lib/content/html-to-markdown";
import { markdownToEditorHtml } from "@/lib/content/editor-html";
import { parseRichHtml, type EditorNode } from "@/lib/content/editor-tree";
import { EXTERNAL_LINK_REL, renderRichText, richTextMentions, richTextToPlain } from "@/lib/content/rich-text";

/**
 * The composer writes formatted text and saves markdown (F1).
 *
 * The client's report: "When you make a text bold in the edit it should show
 * as bold rather than making the text go from 'text' to '**text**'". The
 * editor now shows formatting as formatting; this is the serializer that turns
 * what it shows back into the markdown every post is stored in, and these are
 * its promises:
 *
 * - formatting comes back as formatting (`renderRichText(save(html))` shows
 *   what the editor showed);
 * - typed characters come back as the same characters, never as syntax;
 * - a stored post opened in the editor and saved untouched renders the same;
 * - nothing outside the editor's structure — least of all script — survives.
 */

/** The text a reader sees in a render, with block and line breaks as newlines. */
function shownText(html: string): string {
  const lines: string[] = [""];
  const walk = (nodes: EditorNode[]) => {
    for (const node of nodes) {
      if (node.type === "text") lines[lines.length - 1] += node.text;
      else if (node.tag === "br") lines.push("");
      else if (["p", "li", "h2", "h3", "h4", "blockquote", "pre", "tr"].includes(node.tag)) {
        lines.push("");
        walk(node.children);
        lines.push("");
      } else walk(node.children);
    }
  };
  walk(parseRichHtml(html));
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** The tags a render uses, in order. */
function tagsIn(html: string): string[] {
  return [...html.matchAll(/<([a-z0-9]+)[\s>/]/gi)].map((match) => match[1]!.toLowerCase());
}

const save = htmlToMarkdown;
/** The canonical editor form of a body: what the editor opens on. */
const opened = markdownToEditorHtml;
/**
 * Two renders a reader cannot tell apart. The renderer wraps HTML-looking
 * text in a list item in a paragraph of its own; a sole paragraph in an item
 * has no margin, so `<li><p>x</p></li>` reads exactly as `<li>x</li>`.
 */
const equivalent = (html: string) =>
  html.replace(/<li><p>((?:(?!<\/?p>).)*)<\/p><\/li>/g, "<li>$1</li>");

describe("the client's report: bold shows as bold, and saves as bold", () => {
  it("saves bold the renderer shows as bold, never as asterisks", () => {
    const markdown = save("<p>When you make a text <b>bold</b> in the editor</p>");
    expect(markdown).toBe("When you make a text **bold** in the editor");
    const html = renderRichText(markdown);
    expect(html).toBe("<p>When you make a text <strong>bold</strong> in the editor</p>");
    expect(html).not.toContain("**");
    expect(richTextToPlain(markdown)).toBe("When you make a text bold in the editor");
  });

  it("opens a stored post formatted, so editing never shows **text**", () => {
    const editor = opened("When you make a text **bold** in the editor");
    expect(editor).toBe("<p>When you make a text <strong>bold</strong> in the editor</p>");
    expect(editor).not.toContain("**");
  });
});

describe("formatting becomes markdown the renderer reads as formatting", () => {
  const cases: [string, string, string][] = [
    ["strong", "<p>make <strong>this</strong> loud</p>", "make **this** loud"],
    ["b", "<p>make <b>this</b> loud</p>", "make **this** loud"],
    ["em and i", "<p>an <em>italic</em> and <i>another</i></p>", "an *italic* and *another*"],
    ["a selected trailing space stays outside", "<p>a <b>word </b>here</p>", "a **word** here"],
    ["a selected leading space stays outside", "<p>a<b> word</b> here</p>", "a **word** here"],
    ["adjacent bold runs are one run", "<p><b>a</b><b>b</b></p>", "**ab**"],
    ["bold then italic", "<p><b>a</b><i>b</i></p>", "**a***b*"],
    ["italic inside bold", "<p><b>a <i>b</i></b> c</p>", "**a *b*** c"],
    ["bold inside a word", "<p>un<b>believ</b>able</p>", "un**believ**able"],
    ["formatting with nothing in it is nothing", "<p><strong> </strong>x<em></em></p>", "x"],
    ["strikethrough", "<p>was <del>wrong</del> <s>out</s></p>", "was ~~wrong~~ ~~out~~"],
    [
      "bold and italic carried in a style (a pasted document)",
      '<p><span style="font-weight:700">bold</span> <span style="font-style:italic">ital</span> <b style="font-weight:normal">plain</b></p>',
      "**bold** *ital* plain",
    ],
    ["emoji keep their bold", "<p><b>🎉party</b>🎉</p>", "**🎉party**🎉"],
    ["bold that ends in punctuation before a word", "<p><strong>Note:</strong>text</p>", "**Note:**text"],
  ];
  for (const [name, html, markdown] of cases) {
    it(name, () => {
      expect(save(html)).toBe(markdown);
    });
  }

  it("renders each of those as the editor showed it", () => {
    for (const [, html] of cases) {
      // The editor's own reading of the input and of the saved post agree.
      expect(opened(save(html))).toBe(opened(save(opened(save(html)))));
      expect(renderRichText(save(html))).not.toMatch(/\*\*|~~/);
    }
    expect(renderRichText(save("<p><b>a <i>b</i></b> c</p>"))).toBe(
      "<p><strong>a <em>b</em></strong> c</p>",
    );
    expect(renderRichText(save("<p>un<b>believ</b>able</p>"))).toBe(
      "<p>un<strong>believ</strong>able</p>",
    );
  });

  it("moves edge punctuation out of italic only where the renderer would refuse it", () => {
    // `x*"y"*z` is not italic to any markdown reader; `x"*y*"z` is.
    const markdown = save('<p>x<em>"y"</em>z</p>');
    expect(markdown).toBe('x"*y*"z');
    expect(renderRichText(markdown)).toBe('<p>x"<em>y</em>"z</p>');
    // With room around it, the punctuation keeps its italic.
    expect(save('<p>say <em>"hi"</em> now</p>')).toBe('say *"hi"* now');
  });
});

describe("blocks: paragraphs, lines, lists, quotes, headings, code", () => {
  it("keeps line breaks and paragraphs", () => {
    expect(save("<p>line one<br>line two</p><p>para two</p>")).toBe("line one\nline two\n\npara two");
    expect(renderRichText(save("<p>line one<br>line two</p>"))).toBe("<p>line one<br />line two</p>");
  });

  it("reads the lines browsers write as divs and bare text", () => {
    expect(save("first<div>second</div><div><br></div><div>third</div>")).toBe("first\n\nsecond\n\nthird");
  });

  it("drops empty paragraphs, stray breaks and edge spaces", () => {
    expect(save("<p><br></p><p>  text&nbsp;&nbsp;more  <br></p><p><br></p>")).toBe("text more");
    expect(save("<p><br></p>")).toBe("");
    expect(save("")).toBe("");
  });

  it("writes lists the renderer reads back as the same lists", () => {
    expect(save("<ul><li>one</li><li>two <b>bold</b></li></ul><ol><li>first</li><li>second</li></ol>")).toBe(
      "- one\n- two **bold**\n\n1. first\n2. second",
    );
    expect(save('<ol start="3"><li>c</li><li>d</li></ol>')).toBe("3. c\n4. d");
    expect(save("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>")).toBe("- a\n  - b\n- c");
    // Browsers indent by putting a list straight inside a list.
    expect(save("<ul><li>a</li><ul><li>b</li></ul><li>c</li></ul>")).toBe("- a\n  - b\n- c");
    expect(save("<ul><li>a<br>more</li></ul>")).toBe("- a\n  more");
    expect(renderRichText(save("<ul><li>a<br>more</li></ul>"))).toBe("<ul>\n<li>a<br />more</li>\n</ul>");
  });

  it("keeps two lists in a row as two lists", () => {
    const markdown = save("<ul><li>a</li></ul><ul><li>b</li></ul>");
    expect(markdown).toBe("- a\n\n* b");
    expect(renderRichText(markdown).match(/<ul>/g)).toHaveLength(2);
  });

  it("writes quotes, headings, rules and code", () => {
    expect(save("<blockquote><p>quoted <b>text</b></p><p>second</p></blockquote>")).toBe(
      "> quoted **text**\n>\n> second",
    );
    expect(save("<h1>Big</h1><h3>Small <em>one</em></h3><h4>Item #</h4>")).toBe(
      "## Big\n\n### Small *one*\n\n#### Item \\#",
    );
    expect(renderRichText(save("<h4>Item #</h4>"))).toBe("<h4>Item #</h4>");
    expect(save("<p>a</p><hr><p>b</p>")).toBe("a\n\n---\n\nb");
    expect(save("<p>use <code>a_b*c</code> here</p>")).toBe("use `a_b*c` here");
    expect(save("<pre><code>line **1**\n  line 2\n</code></pre>")).toBe("```\nline **1**\n  line 2\n```");
    expect(save("<pre><code>```fence```</code></pre>")).toBe("````\n```fence```\n````");
  });

  it("writes tables", () => {
    const markdown = save(
      '<table><thead><tr><th>a</th><th align="right">b</th></tr></thead><tbody><tr><td>1|2</td><td><code>c|d</code></td></tr></tbody></table>',
    );
    expect(markdown).toBe("| a | b |\n| --- | ---: |\n| 1\\|2 | `c\\|d` |");
    expect(renderRichText(markdown)).toContain("<td>1|2</td>");
  });
});

describe("typed characters stay characters", () => {
  const typed = [
    "*not italic*",
    "**not bold**",
    "_under_ and __dunder__",
    "snake_case_name and file_name_",
    "~~not struck~~ and ~tilde~",
    "`not code` and ```",
    "[not](a link) and ![not](an image)",
    "<b>not html</b> and <script>alert(1)</script>",
    "&copy; &amp; &#169; a&b",
    "a | b | c",
    "C:\\Users\\path\\ and \\*",
    "100% *done* and 5 * 3 = 15",
    "x_1 + x_2 = 3",
    "#hashtag #vegan",
    "I <3 lentils > meat",
    "trailing backslash \\",
    "!excited [bracket] (paren)",
  ];
  for (const text of typed) {
    it(`keeps ${JSON.stringify(text)}`, () => {
      const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const html = renderRichText(save(`<p>${escaped}</p>`));
      expect(shownText(html)).toBe(text);
      expect(tagsIn(html)).toEqual(["p"]);
    });
  }

  it("never lets a line's first characters become a list, heading, quote or rule", () => {
    const lines = ["- dash", "+ plus", "* star", "1. one", "2) two", "# hash", "## two", "> quote", "---", "===", "***", "    indented"];
    const html = renderRichText(save(`<p>${lines.map((line) => line.replace(/>/g, "&gt;")).join("<br>")}</p>`));
    expect(tagsIn(html).filter((tag) => tag !== "br")).toEqual(["p"]);
    expect(shownText(html)).toBe(lines.map((line) => line.trim()).join("\n"));
  });

  it("does the same at the start of a list item or a heading", () => {
    const html = renderRichText(save("<ul><li>1. not a nested list</li><li># not a heading</li></ul><h2>- not a list</h2>"));
    expect(tagsIn(html)).toEqual(["ul", "li", "li", "h2"]);
  });
});

describe("mentions and links", () => {
  it("writes a mention as the handle, which the renderer links and counts", () => {
    const markdown = save('<p>hi <a href="/members/sam">@sam</a>!</p>');
    expect(markdown).toBe("hi @sam!");
    expect(richTextMentions(markdown)).toEqual(["sam"]);
  });

  it("keeps a mention linked where a bare handle would not be", () => {
    const markdown = save('<p>hi<a href="/members/sam">@sam</a></p>');
    expect(markdown).toBe("hi[@sam](/members/sam)");
    expect(renderRichText(markdown)).toBe('<p>hi<a href="/members/sam">@sam</a></p>');
    expect(richTextMentions(markdown)).toEqual(["sam"]);
  });

  it("keeps handles with underscores whole", () => {
    expect(save('<p><a href="/members/sam_x">@sam_x</a> and @bo_jo</p>')).toBe("@sam_x and @bo_jo");
    const leading = save('<p>hi <a href="/members/_sam">@_sam</a></p>');
    expect(richTextMentions(leading)).toEqual(["_sam"]);
    expect(renderRichText(leading)).toBe('<p>hi <a href="/members/_sam">@_sam</a></p>');
  });

  it("links a typed handle as the renderer always has, and leaves an email alone", () => {
    expect(richTextMentions(save("<p>thanks @sam and @bo</p>"))).toEqual(["sam", "bo"]);
    expect(richTextMentions(save("<p>write to a@bcd.com</p>"))).toEqual([]);
    // Not a mention to the renderer (a letter before it), so not one here.
    expect(richTextMentions(save("<p>x@sam</p>"))).toEqual([]);
  });

  it("writes links with checked addresses", () => {
    expect(save('<p>see <a href="https://example.com">the site</a> now</p>')).toBe(
      "see [the site](https://example.com/) now",
    );
    expect(save('<p><a href="/learn">recipes</a></p>')).toBe("[recipes](/learn)");
    expect(save('<p><a href="https://example.com" title="A &quot;title&quot;">x</a></p>')).toBe(
      '[x](https://example.com/ "A \\"title\\"")',
    );
    const parens = save('<p><a href="https://en.wikipedia.org/wiki/Tofu_(food)">tofu</a></p>');
    expect(parens).toBe("[tofu](<https://en.wikipedia.org/wiki/Tofu_(food)>)");
    expect(renderRichText(parens)).toContain('href="https://en.wikipedia.org/wiki/Tofu_(food)"');
    expect(renderRichText(save('<p><a href="https://example.com/x">out</a></p>'))).toContain(
      `rel="${EXTERNAL_LINK_REL}"`,
    );
  });

  it("keeps web addresses typed as text whole, underscores and all", () => {
    const markdown = save("<p>see https://example.com/a_b_c. and www.example.com/x or mail a_b@x.com</p>");
    const html = renderRichText(markdown);
    expect(html).toContain('href="https://example.com/a_b_c"');
    expect(html).toContain('href="http://www.example.com/x"');
    expect(html).toContain('href="mailto:a_b@x.com"');
    expect(shownText(html)).toBe("see https://example.com/a_b_c. and www.example.com/x or mail a_b@x.com");
  });

  it("keeps formatting around and inside links", () => {
    expect(renderRichText(save('<p><b>see <a href="https://e.com/">this</a></b></p>'))).toBe(
      `<p><strong>see</strong> <a href="https://e.com/" target="_blank" rel="${EXTERNAL_LINK_REL}"><strong>this</strong></a></p>`,
    );
    expect(save('<p>x<a href="/a"><b>bold link</b></a></p>')).toBe("x[**bold link**](/a)");
  });

  it("never turns a typed ! before a link into an image", () => {
    const html = renderRichText(save('<p>wow!<a href="https://e.com/">x</a></p>'));
    expect(html).not.toContain("<img");
    expect(shownText(html)).toBe("wow!x");
  });

  it("keeps a link whose words look like a link", () => {
    const html = renderRichText(save('<p><a href="https://e.com/">[a](c) and [b]</a></p>'));
    expect(html).toContain('<a href="https://e.com/"');
    expect(shownText(html)).toBe("[a](c) and [b]");
  });
});

describe("images", () => {
  it("keeps GIF-search results and uploads", () => {
    expect(save('<p><img src="https://media.tenor.com/abc/cat.gif" alt="cat"></p>')).toBe(
      "![cat](https://media.tenor.com/abc/cat.gif)",
    );
    expect(save('<p><img src="/api/media/u1/k-1.gif" alt="GIF"></p>')).toBe("![GIF](/api/media/u1/k-1.gif)");
  });

  it("drops images from anywhere else rather than saving them", () => {
    expect(save('<p><img src="https://evil.example/pixel.png" alt="x"></p>')).toBe("");
    expect(save('<p><img src="data:image/svg+xml;base64,PHN2Zz4=" alt="x"></p>')).toBe("");
    expect(save('<p><img src="http://media.tenor.com/a.gif"></p>')).toBe("");
  });
});

describe("raw HTML never survives", () => {
  it("drops script, style and their kin with their contents", () => {
    expect(save("<script>alert(1)</script>")).toBe("");
    expect(save("<p>hi<script>alert(1)</script></p>")).toBe("hi");
    expect(save("<style>p{color:red}</style><p>text</p>")).toBe("text");
    expect(save('<svg onload="alert(1)"><text>svg</text><script>alert(1)</script></svg>')).toBe("");
    expect(save('<iframe src="https://evil.example">frame</iframe>')).toBe("");
    expect(save("<noscript><p title=\"</noscript><img src=x onerror=alert(1)>\"></noscript>")).toBe("");
    expect(save("<template><p>hidden</p></template>")).toBe("");
  });

  it("keeps the words of everything else and none of its attributes", () => {
    expect(save('<p onclick="alert(1)" style="color:red" class="x" id="y">hi</p>')).toBe("hi");
    expect(save('<a href="javascript:alert(1)">click</a>')).toBe("click");
    expect(save('<a href=" JaVaScRiPt:alert(1)">click</a>')).toBe("click");
    expect(save('<a href="&#106;avascript:alert(1)">click</a>')).toBe("click");
    expect(save('<a href="data:text/html;base64,PHNjcmlwdD4=">click</a>')).toBe("click");
    expect(save('<a href="//evil.example">click</a>')).toBe("click");
    expect(save('<img src=x onerror="alert(1)">')).toBe("");
    expect(save('<details open ontoggle="alert(1)"><summary>sum</summary>body</details>')).toBe("sum\n\nbody");
    expect(save('<font color="red">old</font> <marquee>news</marquee>')).toBe("old news");
  });

  const payloads = [
    "<script>alert(1)</script>",
    "<SCRIPT SRC=https://evil.example/x.js></SCRIPT>",
    "<img src=x onerror=alert(1)>",
    "<svg/onload=alert(1)>",
    '<iframe src="javascript:alert(1)"></iframe>',
    '<a href="javascript:alert(1)">click</a>',
    '<a href="https://ok.example" onclick="alert(1)">x</a>',
    "<body onload=alert(1)>body text",
    '<div style="background:url(javascript:alert(1))">x</div>',
    "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
    '"><script>alert(1)</script>',
    "<!--<script>alert(1)</script>-->",
    "<![CDATA[<script>alert(1)</script>]]>",
    "<scr<script>ipt>alert(1)</scr</script>ipt>",
    '<object data="javascript:alert(1)"></object><embed src="javascript:alert(1)">',
    '<form action="javascript:alert(1)"><input value="x"><button>go</button></form>',
    '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
    '<a href="https://example.com/" target="_self" rel="opener">ok</a>',
    "&lt;script&gt;alert(1)&lt;/script&gt;",
    '<p title="<img src=x onerror=alert(1)>">t</p>',
    '<img src="https://media.tenor.com/a.gif" onerror="alert(1)" onload="alert(2)">',
  ];
  for (const payload of payloads) {
    it(`renders ${JSON.stringify(payload).slice(0, 70)} safely`, () => {
      const html = renderRichText(save(payload));
      expect(html).not.toMatch(/<script|<iframe|<svg|<object|<embed|<form|<input|<meta|<style/i);
      expect(html).not.toMatch(/\son[a-z]+=/i);
      expect(html).not.toMatch(/javascript:|data:/i);
      for (const tag of tagsIn(html)) {
        expect(["p", "br", "strong", "em", "a", "img", "ul", "ol", "li"]).toContain(tag);
      }
    });
  }

  it("shows HTML that was typed as text, as text", () => {
    const html = renderRichText(save("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"));
    expect(html).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });
});

describe("a stored post opens formatted and saves back unchanged", () => {
  const bodies = [
    "**Ingredients**\n- 1 cup red lentils\n- Onion, garlic, lemon\n- Salt\n\n**Method**\nSimmer until they collapse.",
    "With **butter**.",
    "make **this** loud, *gently*, and ~~never~~ always",
    "**word **next and **Note:**text and _old italic _next",
    "***both*** and **bold *italic* bold**",
    "line one\nline two\n\nsecond paragraph",
    "- a\n- b\n  - nested\n- c\n\n1. one\n2. two",
    "3. starts at three\n4. four",
    "- a\n\n  loose item\n- b",
    "- [ ] todo\n- [x] done",
    "> quoted **text**\n>\n> more",
    "# Big\n\n## Middle\n\n###### Small",
    "`a < b` and ``a`b``\n\n```\n<b>x</b>\n  indented\n```",
    "a\n\n---\n\nb",
    "| a | b |\n|---|---|\n| 1 | 2 |",
    "[hello](https://example.com) and [recipes](/learn) and <https://example.com/x>",
    "see https://example.com/a_b and www.example.com and write to a@b.com",
    "hey @sam and @Sam_x, [@bo](/members/bo)",
    "![cat](https://media.tenor.com/abc/cat.gif)\n\nA GIF: ![](/api/media/user1/k-1.gif)",
    "![pic](https://evil.example/pixel.png)",
    "I <3 lentils and <b>bold</b> typed as HTML",
    "snake_case_name and 5 * 3 and \\*escaped\\*",
    "#hashtag and 100% and C:\\path",
    "<script>alert(1)</script>",
    "[click](javascript:alert(1)) and ![x](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)",
    "**<img src=x onerror=alert(1)>**",
    "- <img src=x onerror=alert(1)>",
    "| <script>alert(1)</script> | x |\n|---|---|\n| <img src=x onerror=1> | y |",
    "@<script>alert(1)</script>",
    "&lt;script&gt;alert(1)&lt;/script&gt;",
    "Our **weeknight lentil soup** has *three* secrets:\n\n- smoked paprika\n- a squeeze of lemon\n- patience\n\nThanks @sam, recipe at [the blog](https://cinnamonsnail.com/soup).",
  ];

  for (const body of bodies) {
    it(`round-trips ${JSON.stringify(body).slice(0, 60)}`, () => {
      const editor = opened(body);
      const saved = save(editor);
      // Saving without edits renders what the stored body rendered.
      expect(equivalent(opened(saved))).toBe(equivalent(editor));
      expect(richTextToPlain(saved)).toBe(richTextToPlain(body));
      expect(richTextMentions(saved)).toEqual(richTextMentions(body));
      // And a second round trip changes nothing more.
      expect(save(opened(saved))).toBe(saved);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Random content                                                              */
/* -------------------------------------------------------------------------- */

function prng(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Ch = { ch: string; bold: boolean; italic: boolean; link: boolean };

/** Every visible character of some HTML with its formatting, spaces collapsed. */
function characters(html: string): Ch[] {
  const out: Ch[] = [];
  const push = (ch: string, style: Omit<Ch, "ch">) => {
    const last = out[out.length - 1];
    if (/\s/.test(ch)) {
      if (!last || last.ch === " " || last.ch === "\n") {
        if (ch === "\n" && last) last.ch = "\n";
        return;
      }
      out.push({ ch: ch === "\n" ? "\n" : " ", bold: false, italic: false, link: false });
      return;
    }
    out.push({ ch, ...style });
  };
  const walk = (nodes: EditorNode[], style: Omit<Ch, "ch">) => {
    for (const node of nodes) {
      if (node.type === "text") for (const ch of node.text) push(ch, style);
      else if (node.tag === "br") push("\n", style);
      else {
        if (["p", "li", "ul", "ol", "blockquote", "h2"].includes(node.tag)) push("\n", style);
        walk(node.children, {
          bold: style.bold || node.tag === "strong",
          italic: style.italic || node.tag === "em",
          link: style.link || node.tag === "a",
        });
      }
    }
  };
  walk(parseRichHtml(html), { bold: false, italic: false, link: false });
  while (out.length && /\s/.test(out[out.length - 1]!.ch)) out.pop();
  while (out.length && /\s/.test(out[0]!.ch)) out.shift();
  return out;
}

const WORDS = [
  "lentils", "soak", "overnight", "tofu", "the", "with", "and", "smoked", "paprika", "lemon",
  "cashew", "3", "cups", "1/2", "tsp", "don't", "it's", "Note", "(optional)", "350°F", "20-25",
  "e.g.", "#tip", "50%", "C++", "jalapeño", "crème", "🌱", "$5", "a&b", "snake_case", "5*3", "~10", "<3",
];

/** Sentences of real-looking words, with bold, italic and links on word ranges. */
function realisticDocument(random: () => number): string {
  const sentence = () => {
    const words = Array.from({ length: 3 + Math.floor(random() * 9) }, () => {
      let word = WORDS[Math.floor(random() * WORDS.length)]!;
      if (random() < 0.15) word = `"${word}`;
      if (random() < 0.2) word += [".", ",", "!", "?", ":", ")"][Math.floor(random() * 6)]!;
      return escapeHtml(word);
    });
    const parts: string[] = [];
    for (let i = 0; i < words.length; ) {
      const roll = random();
      if (roll < 0.25) {
        const take = words.slice(i, i + 1 + Math.floor(random() * 3)).join(" ");
        const tag = ["strong", "em", "a"][Math.floor(random() * 3)]!;
        const inner = random() < 0.2 ? `<${tag === "em" ? "strong" : "em"}>${take}</${tag === "em" ? "strong" : "em"}>` : take;
        const space = random() < 0.3 ? " " : "";
        parts.push(tag === "a" ? `<a href="https://example.com/${i}">${inner}</a>` : `<${tag}>${inner}${space}</${tag}>`);
        i += 1 + Math.floor(random() * 3);
      } else {
        parts.push(words[i]!);
        i += 1;
      }
    }
    return parts.join(" ");
  };
  const blocks: string[] = [];
  for (let b = 0; b < 1 + Math.floor(random() * 3); b += 1) {
    const roll = random();
    if (roll < 0.2) blocks.push(`<ul>${Array.from({ length: 2 }, () => `<li>${sentence()}</li>`).join("")}</ul>`);
    else if (roll < 0.3) blocks.push(`<blockquote><p>${sentence()}</p></blockquote>`);
    else blocks.push(`<p>${sentence()}<br>${sentence()}</p>`);
  }
  return blocks.join("");
}

/** Short runs of punctuation-heavy text inside arbitrary nesting. */
function hostileInline(random: () => number, depth: number): string {
  const alphabet = "abcxyz12 *_~`[]<>&#-+.!()|\\\"':";
  let out = "";
  for (let i = 0; i < 1 + Math.floor(random() * 4); i += 1) {
    if (depth > 0 && random() < 0.45) {
      const tag = ["strong", "em", "a", "br"][Math.floor(random() * 4)]!;
      if (tag === "br") out += "<br>";
      else if (tag === "a") out += `<a href="https://example.com/${i}">${hostileInline(random, depth - 1)}</a>`;
      else out += `<${tag}>${hostileInline(random, depth - 1)}</${tag}>`;
    } else {
      let text = "";
      for (let k = 0; k < 1 + Math.floor(random() * 6); k += 1) text += alphabet[Math.floor(random() * alphabet.length)];
      out += escapeHtml(text);
    }
  }
  return out;
}

describe("random content (seeded, so a failure reproduces)", () => {
  it("keeps realistic posts exactly: words, bold, italic and links", () => {
    for (let seed = 1; seed <= 250; seed += 1) {
      const html = realisticDocument(prng(seed * 104729));
      const report = htmlToMarkdownReport(html);
      const want = characters(html);
      const got = characters(renderRichText(report.markdown));
      expect(got.map((c) => c.ch).join(""), html).toBe(want.map((c) => c.ch).join(""));
      expect(report.degraded, html).toBe(0);
      // Edge punctuation may move outside a marker; letters keep their formatting.
      want.forEach((char, index) => {
        if (!/[\p{L}\p{N}]/u.test(char.ch)) return;
        const other = got[index]!;
        expect({ ch: other.ch, bold: other.bold, italic: other.italic, link: other.link }, html).toEqual(char);
      });
    }
  });

  it("never changes a single typed character, whatever the nesting", () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const html = `<p>${hostileInline(prng(seed * 7919), 3)}</p>`;
      const markdown = save(html);
      expect(characters(renderRichText(markdown)).map((c) => c.ch).join(""), html).toBe(
        characters(html).map((c) => c.ch).join(""),
      );
    }
  });
});
