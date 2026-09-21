import Link from "next/link";
import { MessageSquare, PenSquare } from "lucide-react";

/**
 * The detail pane with nothing selected.
 *
 * On a phone this is never seen — the list fills the screen at `/messages` and
 * this pane is hidden. On a wide screen it is the right half, and an empty
 * right half needs to say what to do rather than sit blank.
 */
export default function MessagesIndexPage() {
  return (
    <div className="hidden h-full flex-col items-center justify-center gap-3 px-6 text-center lg:flex">
      <span className="grid size-14 place-items-center rounded-full bg-brand-wash text-brand-strong">
        <MessageSquare className="size-7" aria-hidden />
      </span>
      <div>
        <h2 className="font-display text-[1.15rem] font-bold text-foreground">
          Your conversations live here
        </h2>
        <p className="mx-auto mt-1 max-w-[42ch] text-[14px] text-foreground-muted">
          Pick a conversation on the left, or start one with someone you have
          been cooking alongside.
        </p>
      </div>
      <Link
        href="/messages/new"
        className="inline-flex h-10 items-center gap-2 rounded-ctl bg-brand-strong px-4 text-[14px] font-semibold text-white no-underline transition hover:bg-deep-forest"
      >
        <PenSquare className="size-4" aria-hidden />
        New message
      </Link>
    </div>
  );
}
