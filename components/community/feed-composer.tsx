import Link from "next/link";
import { CalendarDays, ImageIcon, ListChecks, Soup } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

/**
 * Composer entry point.
 *
 * Every control here opens /compose, so the old version's separate "Post"
 * button was a fifth link to the same place sitting where a submit button
 * should be. It is gone; the shortcuts now carry the intent instead, each
 * pre-selecting a post type.
 */
export function FeedComposer({
  name,
  avatar,
}: {
  name: string;
  avatar: string | null;
}) {
  return (
    <section className="rounded-[1.5rem] border border-sand/80 bg-surface p-4 shadow-[0_1px_2px_rgba(15,61,50,0.04)]">
      <Link href="/compose" className="flex items-center gap-3 no-underline">
        <Avatar name={name} src={avatar} />
        <span className="flex min-h-11 flex-1 items-center rounded-full border border-sand bg-mint/50 px-4 text-sm text-foreground-muted transition hover:border-accent/60 hover:bg-mint">
          Share a plate, a question, or what went wrong…
        </span>
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-sand/60 pt-3">
        <Shortcut href="/compose?type=IMAGE" icon={ImageIcon} label="Photo" />
        <Shortcut href="/compose?type=RECIPE" icon={Soup} label="Recipe" />
        <Shortcut href="/compose?type=POLL" icon={ListChecks} label="Poll" />
        <Shortcut href="/compose?type=EVENT" icon={CalendarDays} label="Event" />
      </div>
    </section>
  );
}

function Shortcut({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof ImageIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-[13px] font-semibold text-foreground-muted no-underline transition hover:bg-mint hover:text-forest"
    >
      {/* One tone for every shortcut: the old version coloured each icon
          differently, which read as four unrelated features. */}
      <Icon className="size-4 text-accent" aria-hidden />
      {label}
    </Link>
  );
}
