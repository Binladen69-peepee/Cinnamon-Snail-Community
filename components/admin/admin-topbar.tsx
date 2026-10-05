import Link from "next/link";
import { Bell, ChevronRight, Search, Shield } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CountBadge, fieldClass } from "@/components/app/ui";

/**
 * The console's top bar.
 *
 * A plain GET form, not a client-side search box: submitting it lands on the
 * members list with `?q=` in the URL, which means the result is linkable, the
 * back button works, and the whole thing runs before any JavaScript does.
 *
 * The bell is a link to moderation rather than a menu, because the console has
 * exactly one queue a human has to clear and pretending otherwise would be
 * furniture. Its count is the same one the rail shows — both read it from the
 * layout, so they cannot disagree.
 */
export function AdminTopbar({
  name,
  role,
  avatarUrl,
  openReports,
}: {
  name: string;
  role: string;
  avatarUrl: string | null;
  openReports: number;
}) {
  return (
    // Sticky only from `lg`: below that the mobile drawer's bar owns `top-0`,
    // and two sticky headers at the same offset overlap each other.
    <header className="z-30 border-b border-border bg-background/90 backdrop-blur-md lg:sticky lg:top-0">
      <div className="mx-auto flex h-14 w-full max-w-300 items-center gap-2 px-4 sm:px-6 lg:px-8">
        <form
          action="/admin/members"
          method="get"
          role="search"
          className="relative min-w-0 flex-1"
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            placeholder="Search members…"
            aria-label="Search members"
            className={fieldClass({ className: "max-w-md pl-9 text-label" })}
          />
        </form>

        <Link
          href="/admin/moderation"
          aria-label={
            openReports > 0
              ? `Moderation — ${openReports} waiting`
              : "Moderation — nothing waiting"
          }
          className="relative grid size-9 shrink-0 place-items-center rounded-ctl text-foreground-muted no-underline transition hover:bg-surface-muted hover:text-foreground"
        >
          <Bell className="size-[1.125rem]" aria-hidden />
          {/* The count is spelled out in the label above, so the dot is not the
              only thing carrying it. */}
          <CountBadge
            count={openReports}
            max={9}
            className="absolute -right-0.5 -top-0.5 ring-2 ring-background"
          />
        </Link>

        <Link
          href="/settings"
          className="flex shrink-0 items-center gap-2 rounded-ctl py-1 pl-1 pr-1.5 no-underline transition hover:bg-surface-muted sm:pr-2"
        >
          <Avatar name={name} src={avatarUrl} size="sm" className="size-8" />
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-[14ch] truncate text-label font-semibold leading-tight text-foreground">
              {name}
            </span>
            <span className="flex items-center gap-1 text-caption leading-tight text-foreground-muted">
              <Shield className="size-2.5" aria-hidden />
              {role}
            </span>
          </span>
          <ChevronRight className="size-3.5 shrink-0 text-foreground-muted" aria-hidden />
        </Link>
      </div>
    </header>
  );
}
