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
 * It takes the same props it always did, so no call site changed.
 */
export function AppShell({
  children,
  rail,
  wide = false,
  flush = false,
}: {
  children: React.ReactNode;
  rail?: React.ReactNode;
  /** Profile and other multi-column pages need more than the feed column. */
  wide?: boolean;
  /** Edge-to-edge content (profile cover sits flush under the header). */
  flush?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full",
        wide || flush ? "max-w-none" : rail ? "max-w-350" : "max-w-275",
      )}
    >
      <main
        className={cn(
          "min-w-0 flex-1 pb-24 md:pb-6",
          flush ? "px-0 pt-0" : "px-3 py-4 sm:px-5",
        )}
      >
        <div
          className={cn("mx-auto w-full", wide || flush ? "max-w-none" : "max-w-170")}
        >
          {children}
        </div>
      </main>

      {rail && !wide && !flush ? (
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-72 shrink-0 overflow-y-auto py-4 pr-4 xl:block">
          {rail}
        </aside>
      ) : null}
    </div>
  );
}
