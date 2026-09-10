import Link from "next/link";
import { MessageCircleQuestion, PenLine, Soup, Users } from "lucide-react";
import type { FeedSort } from "@/lib/community/sort";

/**
 * Empty feed.
 *
 * A community feed with nothing in it is the moment a member is most likely to
 * leave, so this offers three concrete things to do rather than one line of
 * grey text. The wording changes with the filter: "Top" being empty means
 * something different from the whole table being quiet.
 */
export function FeedEmpty({ sort }: { sort: FeedSort }) {
  const filtered = sort === "top" || sort === "rising";

  return (
    <section className="rounded-[1.5rem] border border-dashed border-sand bg-surface/60 px-6 py-12 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-sage">
        <Soup className="size-6 text-forest" aria-hidden />
      </span>
      <h2 className="mt-4 font-display text-xl font-bold text-forest">
        {filtered ? "Nothing has caught fire yet" : "The table is set"}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-foreground-muted">
        {filtered
          ? "No posts have picked up enough votes for this view. Try New to see everything that has been shared."
          : "No posts yet in the spaces you can see. Somebody has to go first — it may as well be dinner."}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/compose"
          className="vu-cta-fill vu-cta-glow inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold no-underline"
        >
          <PenLine className="size-4" aria-hidden />
          Share the first plate
        </Link>
        <Link
          href="/compose?type=QUESTION"
          className="inline-flex h-11 items-center gap-2 rounded-full border border-sand px-5 text-sm font-semibold text-forest no-underline transition hover:border-accent"
        >
          <MessageCircleQuestion className="size-4" aria-hidden />
          Ask a question
        </Link>
        <Link
          href="/members"
          className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-foreground-muted no-underline transition hover:text-forest"
        >
          <Users className="size-4" aria-hidden />
          Meet members
        </Link>
      </div>
    </section>
  );
}
