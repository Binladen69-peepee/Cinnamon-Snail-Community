import Link from "next/link";
import { Bell, Search, Sparkles } from "lucide-react";
import { CountBadge } from "@/components/app/ui";
import { AdminPageTitle } from "@/components/admin/admin-page-title";

/**
 * The console's top bar (DEC-088), after the client's reference: the section's
 * name on the left; search, the bell and the gradient AI button on the right.
 * The signed-in person moved to the foot of the rail, as in the reference.
 *
 * The search is a plain GET form, not a client-side box: submitting it lands
 * on the members list with `?q=` in the URL, so the result is linkable, the
 * back button works, and it runs before any JavaScript does.
 *
 * The bell is a link to moderation rather than a menu, because the console has
 * exactly one queue a human has to clear. Its count is the one the rail shows;
 * both read it from the layout, so they cannot disagree. The AI button opens
 * the AI cohost, where Claude's drafted prompts wait for approval.
 */
export function AdminTopbar({ openReports }: { openReports: number }) {
  return (
    // Sticky only from `lg`: below that the phone bar owns `top-0`, and two
    // sticky headers at the same offset overlap each other.
    <header className="z-30 bg-background/85 backdrop-blur-md lg:sticky lg:top-0">
      <div className="mx-auto flex h-16 w-full max-w-360 items-center gap-2.5 px-4 sm:px-6 lg:px-8">
        <AdminPageTitle className="hidden min-w-0 flex-1 truncate text-title font-semibold tracking-[-0.01em] text-foreground lg:block" />

        <form
          action="/admin/members"
          method="get"
          role="search"
          className="vu-admin-search relative flex h-10 min-w-0 flex-1 items-center lg:w-80 lg:flex-none"
        >
          <Search
            className="pointer-events-none absolute left-3.5 size-4 text-foreground-muted"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            placeholder="Search members…"
            aria-label="Search members"
            className="size-full rounded-full bg-transparent pl-10 pr-4 text-label text-foreground outline-none placeholder:text-field-placeholder"
          />
        </form>

        <Link
          href="/admin/moderation"
          aria-label={
            openReports > 0
              ? `Moderation — ${openReports} waiting`
              : "Moderation — nothing waiting"
          }
          className="vu-admin-icon-btn relative grid size-10 shrink-0 place-items-center rounded-ctl no-underline transition"
        >
          <Bell className="size-4.5" aria-hidden />
          {/* The count is spelled out in the label above, so the dot is not the
              only thing carrying it. */}
          <CountBadge
            count={openReports}
            max={9}
            className="absolute -right-1 -top-1 ring-2 ring-background"
          />
        </Link>

        <Link
          href="/admin/cohost"
          aria-label="AI cohost"
          className="vu-ai-btn inline-flex h-10 shrink-0 items-center gap-2 rounded-ctl px-3 text-label font-semibold no-underline sm:px-4"
        >
          <Sparkles className="size-4" aria-hidden />
          <span className="hidden sm:inline">AI cohost</span>
        </Link>
      </div>
    </header>
  );
}
