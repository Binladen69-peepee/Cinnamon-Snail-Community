import Link from "next/link";
import { MapPin, Sparkles, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { PostFollowButton } from "@/components/feed/post-follow-button";
import { Badge, Card } from "@/components/app/ui";
import type { DirectoryMember } from "@/lib/community/directory";

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
    <Card as="article" interactive className="flex h-full flex-col">
      <div className="flex items-start gap-3">
        <Link
          href={`/members/${member.handle}`}
          className="shrink-0 no-underline"
          tabIndex={-1}
          aria-hidden
        >
          <Avatar name={member.displayName} src={member.avatarUrl} size="md" />
        </Link>

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Link
              href={`/members/${member.handle}`}
              className="min-w-0 truncate text-body font-semibold text-foreground no-underline transition hover:text-brand-strong hover:underline"
            >
              {member.displayName}
            </Link>
            {member.isHost ? <Badge tone="brand">Host</Badge> : null}
          </div>
          <p className="truncate text-label text-foreground-muted">@{member.handle}</p>
        </div>

        <PostFollowButton
          handle={member.handle}
          initialFollowing={member.following}
        />
      </div>

      {member.reason ? (
        <p className="mt-3 flex items-start gap-2 rounded-ctl bg-brand-wash px-3 py-2 text-label text-on-brand-wash">
          <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-2">{member.reason}</span>
        </p>
      ) : member.cookingLately ? (
        <p className="mt-3 line-clamp-2 text-label text-foreground-muted">
          <span className="font-medium text-foreground">Cooking lately: </span>
          {member.cookingLately}
        </p>
      ) : member.bio ? (
        <p className="mt-3 line-clamp-2 text-label text-foreground-muted">{member.bio}</p>
      ) : null}

      {showStarter && member.starter ? (
        <p className="mt-2.5 border-l-2 border-hairline-firm pl-3 text-label italic text-foreground-muted">
          “{member.starter}”
        </p>
      ) : null}

      {interests.length > 0 ? (
        <ul className="mt-3 flex flex-wrap items-center gap-1.5">
          {interests.map((interest) => (
            <li key={interest.slug}>
              <Badge>{interest.label}</Badge>
            </li>
          ))}
          {moreInterests > 0 ? (
            <li className="text-caption text-foreground-muted">+{moreInterests}</li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-caption text-foreground-muted">
        {member.location ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {member.location}
          </span>
        ) : null}
        {member.sharedSpaces > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            {member.sharedSpaces} {member.sharedSpaces === 1 ? "room" : "rooms"} in
            common
          </span>
        ) : null}
      </div>
    </Card>
  );
}
