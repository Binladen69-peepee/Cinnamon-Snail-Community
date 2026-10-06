import { renderRichText } from "@/lib/content/rich-text";
import { cn } from "@/lib/utils";

/**
 * Member-written text, rendered safely (DEC-078, contract C2).
 *
 * CONTRACT: `<RichText body={post.body} />`. Always renders from the stored
 * markdown `body` through `renderRichText`, which escapes raw HTML, checks
 * every link and image, and sanitizes, so nothing a member typed can reach the
 * page as markup. Server-safe and usable from client components too: it is a
 * pure function of its props, and the renderer's output is identical in both
 * places, so it hydrates without a mismatch.
 *
 * Renders nothing for an empty body, so callers need no guard of their own.
 *
 * The spacing classes give paragraphs the gap a blank line has in the
 * composer (preflight zeroes `<p>` margins, and `.prose-vu` sets none), so a
 * post reads the way it was written. The gap is a bottom margin on every
 * paragraph but the last — the same property callers use for their own
 * rhythm — so a caller's spacing replaces it rather than adding to it (inside
 * a `line-clamp` box margins do not collapse, and two would stack).
 */
export function RichText({
  body,
  className,
}: {
  body: string | null | undefined;
  className?: string;
}) {
  const html = renderRichText(body);
  if (!html) return null;
  return (
    <div
      className={cn(
        "prose-vu [&_p:not(:last-child)]:mb-[0.6em] [&_table]:my-[0.6em] [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_img]:my-1",
        className,
      )}
      // Sanitized in renderRichText: markdown subset only, no raw HTML.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
