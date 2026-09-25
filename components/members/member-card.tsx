import Link from "next/link";
import { MapPin, Sparkles, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { PostFollowButton } from "@/components/feed/post-follow-button";
import type { DirectoryMember } from "@/lib/community/directory";
import { cn } from "@/lib/utils";

/**
 * One member in the directory.
 *
 * Every card is the same height whatever the member filled in, because a grid
 * of cards that shrink to their content leaves holes — the same reason
 * `SpaceCard` uses a fixed icon tile rather than a cover image.
 *
 * What is deliberately absent: any count of posts or followers. BUILD.md rules
 * out a competitive leaderboard, and a number on a card is where one starts.
 * "Three rooms in common" is here instead, which is about the two of you
 * rather than about who is winning.
 */
export function MemberCard({
  member,
  showStarter = false,
}: {
  member: DirectoryMember;
  /** The suggestion strip has room for the matcher's opener; the grid does not. */
  showStarter?: boolean;
}) {
  const interests = member.interests.slice(0, 3);
  const moreInterests = member.interests.length - interests.length;

  return (
    <article className="flex h-full flex-col rounded-card border border-border bg-surface p-3.5 transition hover:border-hairline-firm">
      <div className="flex items-start gap-3">
        <Link
          href={`/members/${member.handle}`}
          className="shrink-0 no-underline"
          tabIndex={-1}
          aria-hidden
        >
          <Avatar
            name={member.displayName}
            src={member.avatarUrl}
            size="md"
            className="size-12"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Link
              href={`/members/${member.handle}`}
              className="min-w-0 truncate text-[14.5px] font-bold text-foreground no-underline hover:text-brand hover:underline"
            >
              {member.displayName}
            </Link>
            {member.isHost ? (
              <span className="shrink-0 rounded-chip bg-brand-wash px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-strong">
                Host
              </span>
            ) : null}
          </div>
          <p className="truncate text-[12.5px] text-foreground-muted">
            @{member.handle}
          </p>
        </div>

        <PostFollowButton
          handle={member.handle}
          initialFollowing={member.following}
        />
      </div>

      {member.reason ? (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-ctl bg-brand-wash px-2.5 py-1.5 text-[12.5px] leading-snug text-brand-strong">
          <Sparkles className="mt-px size-3 shrink-0" aria-hidden />
          <span className="line-clamp-2">{member.reason}</span>
        </p>
      ) : member.cookingLately ? (
        <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-snug text-foreground-muted">
          <span className="font-semibold text-foreground">Cooking lately: </span>
          {member.cookingLately}
        </p>
      ) : member.bio ? (
        <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-snug text-foreground-muted">
          {member.bio}
        </p>
      ) : null}

      {showStarter && member.starter ? (
        <p className="mt-2 border-l-2 border-border pl-2.5 text-[12.5px] italic leading-snug text-foreground-muted">
          “{member.starter}”
        </p>
      ) : null}

      {interests.length > 0 ? (
        <ul className="mt-2.5 flex flex-wrap gap-1">
          {interests.map((interest) => (
            <li
              key={interest.slug}
              className="rounded-chip border border-border px-1.5 py-0.5 text-[11px] font-semibold text-foreground-muted"
            >
              {interest.label}
            </li>
          ))}
          {moreInterests > 0 ? (
            <li className="px-1 py-0.5 text-[11px] font-semibold text-foreground-muted">
              +{moreInterests}
            </li>
          ) : null}
        </ul>
      ) : null}

      <div
        className={cn(
          "mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2.5 text-[11.5px] font-semibold text-foreground-muted",
        )}
      >
        {member.location ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" aria-hidden />
            {member.location}
          </span>
        ) : null}
        {member.sharedSpaces > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" aria-hidden />
            {member.sharedSpaces} {member.sharedSpaces === 1 ? "room" : "rooms"} in
            common
          </span>
        ) : null}
      </div>
    </article>
  );
}
