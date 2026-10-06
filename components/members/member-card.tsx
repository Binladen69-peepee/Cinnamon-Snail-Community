import Link from "next/link";
import {
  Flame,
  HeartHandshake,
  MapPin,
  MessageSquare,
  Sprout,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { PostFollowButton } from "@/components/feed/post-follow-button";
import { Badge, ButtonLink, Card } from "@/components/app/ui";
import type { DirectoryMember } from "@/lib/community/directory";
import { cn } from "@/lib/utils";

/** Which list a card sits in, which decides the icon on its reason line. */
export type MemberCardContext = "similar" | "near" | "top" | "new";

const REASON_ICON = {
  similar: HeartHandshake,
  near: MapPin,
  top: Flame,
  new: Sprout,
} as const;

/**
 * One member, in the directory or a discovery list.
 *
 * Every card is the same height whatever the member filled in, because a grid
 * of cards that shrink to their content leaves holes.
 *
 * What a card offers is what a member wants to do next: open the profile, or
 * say hello. "Message" appears only when the member would actually accept a
 * message from the viewer (the same rule the send path enforces), so the
 * button never leads to a refusal.
 *
 * What is deliberately absent: any count of posts or followers, and any rank.
 * The reason line says, in words, why this person is in the list — something
 * the two of you share, where they are, or what they have been doing.
 */
export function MemberCard({
  member,
  context = "similar",
  className,
}: {
  member: DirectoryMember;
  context?: MemberCardContext;
  className?: string;
}) {
  const interests = member.interests.slice(0, 3);
  const moreInterests = member.interests.length - interests.length;
  const profileHref = `/members/${encodeURIComponent(member.handle)}`;
  const ReasonIcon = REASON_ICON[context];

  return (
    <Card as="article" interactive className={cn("flex h-full flex-col", className)}>
      <div className="flex items-start gap-3">
        <Link
          href={profileHref}
          className="shrink-0 no-underline"
          tabIndex={-1}
          aria-hidden
        >
          <Avatar name={member.displayName} src={member.avatarUrl} size="md" />
        </Link>

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Link
              href={profileHref}
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
          <ReasonIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
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

      {interests.length > 0 ? (
        <ul className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Interests">
          {interests.map((interest) => (
            <li key={interest.slug}>
              <Badge>{interest.label}</Badge>
            </li>
          ))}
          {moreInterests > 0 ? (
            <li className="text-caption text-foreground-muted">
              +{moreInterests}
              <span className="sr-only"> more</span>
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-auto flex flex-col gap-3 pt-3">
        {member.location || member.sharedCrews > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-foreground-muted">
            {member.location ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{member.location}</span>
              </span>
            ) : null}
            {member.sharedCrews > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden />
                {member.sharedCrews} {member.sharedCrews === 1 ? "crew" : "crews"} in common
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink
            href={profileHref}
            size="sm"
            className="flex-1"
            aria-label={`View ${member.displayName}'s profile`}
          >
            View profile
          </ButtonLink>
          {member.canMessage ? (
            <ButtonLink
              href={`/messages/new?to=${encodeURIComponent(member.handle)}`}
              size="sm"
              variant="ghost"
              className="flex-1"
              aria-label={`Message ${member.displayName}`}
            >
              <MessageSquare className="size-4" aria-hidden />
              Message
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
