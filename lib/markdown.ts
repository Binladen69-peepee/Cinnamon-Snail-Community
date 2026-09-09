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

export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false }) as string;
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
