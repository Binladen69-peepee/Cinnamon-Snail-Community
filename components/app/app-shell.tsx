import { cn } from "@/lib/utils";

/**
 * A member page's content column, and its optional right rail.
 *
 * This used to be the whole frame — header, sidebar, mobile tabs, auth guard
 * and two queries — rendered fresh by every page. That is now
 * `app/(member)/layout.tsx`, which keeps it mounted across navigations. What is
 * left here is the part that genuinely differs per page: how wide the column
 * is, whether it sits flush, and what goes in the rail beside it.
 *
 * The rail stays a real slot rather than a layout concern, for the reason it
 * always was: the feed shows what to do next, a space shows its About card,
 * and Settings wants nothing there at all. A layout cannot know that without
 * every page pushing data upward.
 *
 * Widths come from one scale, so pages stop choosing their own:
 * - default: the 680px reading column (feed, a post, a thread, settings)
 * - `size="page"`: 960px, for pages with a little more to show side by side
 * - `size="wide"`: 1200px, for grids and directories
 * - `wide`: no limit, for pages that lay out their own columns (profile)
 */
const COLUMN = {
  default: "max-w-170",
  page: "max-w-240",
  wide: "max-w-300",
} as const;

export function AppShell({
  children,
  rail,
  wide = false,
  flush = false,
  size = "default",
}: {
  children: React.ReactNode;
  rail?: React.ReactNode;
  /** Profile and other multi-column pages need more than the feed column. */
  wide?: boolean;
  /** Edge-to-edge content (profile cover sits flush under the header). */
  flush?: boolean;
  /** The content column's width, from the scale above. */
  size?: keyof typeof COLUMN;
}) {
  const unbounded = wide || flush;
  return (
    <div
      className={cn(
        "mx-auto flex w-full",
        unbounded || size !== "default" ? "max-w-none" : rail ? "max-w-350" : "max-w-275",
      )}
    >
      <main
        className={cn(
          "min-w-0 flex-1 pb-24 md:pb-10",
          flush ? "px-0 pt-0" : "px-4 pt-5 sm:px-6 sm:pt-7",
        )}
      >
        <div className={cn("mx-auto w-full", unbounded ? "max-w-none" : COLUMN[size])}>
          {children}
        </div>
      </main>

      {rail && !unbounded && size === "default" ? (
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-80 shrink-0 overflow-y-auto py-7 pr-6 xl:block">
          {rail}
        </aside>
      ) : null}
    </div>
  );
}
