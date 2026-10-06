import Link from "next/link";
import { ChefHat, Play } from "lucide-react";
import { classHref, type ClassSummary } from "@/lib/learn/classes";
import { cardClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * One class, as a card.
 *
 * A link to the class page — one destination for a class, reached the same way
 * from every shelf, the category grid and search.
 *
 * Fixed aspect on the still and a clamped title keep a row or a grid of these
 * the same height whatever a class is called. The play disc, the running time
 * and the progress strip sit on the photo, so they keep their literal scrims: a
 * photo is the same photo in light and dark.
 *
 * Under the title is one quiet line: how far the member is, once they have
 * started; otherwise whatever the page passes as `meta` (where else the class
 * sits, or its category in a search result); otherwise nothing at all.
 */
export function ClassTile({
  cls,
  percent = null,
  eager = false,
  href,
  meta = null,
}: {
  cls: ClassSummary;
  /** Progress, when this member has started it. */
  percent?: number | null;
  /** True for tiles above the fold. */
  eager?: boolean;
  /**
   * Where the card goes. Defaults to the class page; the "continue where you
   * left off" row passes the lesson itself, because a card that says
   * "62% complete" and then lands on an overview has made the member navigate
   * twice to do the thing they asked for.
   */
  href?: string;
  /** The line under the title when the member has not started the class. */
  meta?: string | null;
}) {
  const line = percent !== null ? `${percent}% complete` : meta;

  return (
    <Link
      href={href ?? classHref(cls.slug)}
      className={cardClass({
        padding: "none",
        interactive: true,
        className: "group flex h-full flex-col overflow-hidden no-underline",
      })}
    >
      <span className="relative block aspect-4/3 w-full overflow-hidden bg-surface-muted">
        {cls.photo ? (
          // Class stills come from the client's own media host, not the optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cls.photo}
            alt=""
            loading={eager ? undefined : "lazy"}
            decoding="async"
            className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="grid size-full place-items-center text-foreground-muted/50">
            <ChefHat className="size-8" aria-hidden />
          </span>
        )}

        {cls.teaserEmbed ? (
          <span className="absolute inset-0 grid place-items-center transition group-hover:bg-black/25">
            <span className="grid size-10 place-items-center rounded-full bg-white/90 text-black opacity-0 shadow-e2 transition group-hover:opacity-100">
              <Play
                className="size-4 translate-x-px fill-current"
                aria-hidden
              />
            </span>
          </span>
        ) : null}

        {cls.length ? (
          <span className="absolute bottom-2 right-2 rounded-chip bg-black/65 px-1.5 py-0.5 text-micro font-semibold tabular-nums text-white">
            {cls.length}
          </span>
        ) : null}

        {percent !== null ? (
          <span
            className="absolute inset-x-0 bottom-0 h-1 bg-black/35"
            aria-hidden
          >
            <span
              className="block h-full bg-brand"
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </span>
        ) : null}
      </span>

      <span className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        <span className="line-clamp-2 text-body font-semibold text-foreground sm:text-title">
          {cls.title}
        </span>
        {line ? (
          <span
            className={cn(
              "mt-auto truncate pt-0.5 text-caption",
              percent !== null
                ? "font-medium text-brand-strong"
                : "text-foreground-muted",
            )}
          >
            {line}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
