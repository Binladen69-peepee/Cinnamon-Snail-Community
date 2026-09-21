import Link from "next/link";
import { MapPin, Sparkles } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { PostFollowButton } from "@/components/feed/post-follow-button";
import type { DiscoverPerson } from "@/lib/community/discover";

/**
 * A member in the directory.
 *
 * The matcher's reason is shown when there is one, because "you both cook
 * Sichuan" is the difference between a directory and a list of strangers. It is
 * never invented: a member with no signal in common simply shows their city.
 */
export function PersonCard({ person }: { person: DiscoverPerson }) {
  return (
    <article className="flex h-full flex-col rounded-card border border-border bg-surface p-3.5 transition hover:border-hairline-firm">
      <div className="flex items-start gap-3">
        <Link href={`/members/${person.handle}`} className="shrink-0 no-underline">
          <Avatar
            name={person.displayName}
            src={person.avatarUrl}
            size="md"
            className="size-12"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            href={`/members/${person.handle}`}
            className="block truncate text-[14.5px] font-bold text-foreground no-underline hover:text-brand hover:underline"
          >
            {person.displayName}
          </Link>
          <p className="truncate text-[12.5px] text-foreground-muted">
            @{person.handle}
          </p>
        </div>

        <PostFollowButton
          handle={person.handle}
          initialFollowing={person.following}
        />
      </div>

      {person.reason ? (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-ctl bg-brand-wash px-2.5 py-1.5 text-[12.5px] leading-snug text-brand-strong">
          <Sparkles className="mt-px size-3 shrink-0" aria-hidden />
          <span className="line-clamp-2">{person.reason}</span>
        </p>
      ) : person.bio ? (
        <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-snug text-foreground-muted">
          {person.bio}
        </p>
      ) : null}

      {person.city ? (
        <p className="mt-auto flex items-center gap-1 pt-2.5 text-[11.5px] font-semibold text-foreground-muted">
          <MapPin className="size-3" aria-hidden />
          {person.city}
        </p>
      ) : null}
    </article>
  );
}
