import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const allowedTags = [
  "p",
  "br",
  "strong",
  "em",
  "b",
  "i",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "h2",
  "h3",
  "h4",
  "code",
  "pre",
  "img",
];

/**
 * Turns `@handle` into a link to that member.
 *
 * Done on the markdown before it is parsed rather than on the HTML after,
 * because rewriting HTML with a regex is how injection bugs are written. The
 * result still goes through the same sanitiser as everything else.
 *
 * Fenced and inline code are left alone: an `@` inside a code sample is part
 * of the sample. A handle already inside a link is skipped too, so a mention
 * written by hand as markdown is not wrapped twice.
 */
export function linkMentions(source: string): string {
  const segments = source.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return segments
    .map((segment, index) => {
      // Odd indexes are the code captures from the split above.
      if (index % 2 === 1) return segment;
      return segment.replace(
        /(^|[^\w`\]\/\[])@([a-z0-9_]{2,32})(?![a-z0-9_])/gi,
        (_match, prefix: string, handle: string) =>
          `${prefix}[@${handle}](/members/${handle.toLowerCase()})`,
      );
    })
    .join("");
}

export function renderMarkdown(source: string): string {
  const html = marked.parse(linkMentions(source), { async: false }) as string;
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {
      a: ["href", "rel", "target"],
      img: ["src", "alt"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
  });
}

export function toPlainText(source: string): string {
  return sanitizeHtml(source, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}
