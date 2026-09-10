import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { readPrivacy, visibleProfileFields } from "@/lib/community/privacy";
import { badgesForUser } from "@/lib/social/badges";
import { canMessage } from "@/lib/messages/conversations";
import { blockMemberAction } from "@/app/(member)/messages/actions";

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const session = await auth();
  const { handle } = await params;
  const user = await prisma.user.findUnique({
    where: { handle },
    include: { profile: true },
  });
  const isOwner = session?.user.id === user?.id;
  if (!user?.profile || (!user.profile.directoryVisible && !isOwner)) {
    notFound();
  }
  const profile = user.profile;
  const visible = visibleProfileFields(readPrivacy(profile.privacy), isOwner);
  const interests = Array.isArray(profile.cookingInterests)
    ? (profile.cookingInterests as string[])
    : [];
  const links = Array.isArray(profile.links) ? (profile.links as string[]) : [];

  const [badges, messaging, blocked] = await Promise.all([
    badgesForUser(user.id),
    session?.user.id && !isOwner
      ? canMessage(session.user.id, user.id)
      : Promise.resolve(null),
    session?.user.id && !isOwner
      ? prisma.userBlock.findUnique({
          where: {
            blockerId_blockedId: { blockerId: session.user.id, blockedId: user.id },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  return (
    <article className="mx-auto max-w-2xl">
      <Avatar name={profile.displayName} src={profile.avatarUrl} size="lg" />
      <h1 className="mt-4 font-display text-4xl text-forest">{profile.displayName}</h1>
      <p className="text-muted">@{user.handle}</p>
      {visible.showLocation ? (
        <p className="mt-2 text-muted">
          {[profile.city, profile.region, profile.country].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {!isOwner && session?.user.id ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {messaging?.allowed ? (
            <ButtonLink href={`/messages/new?to=${user.handle}`} size="sm">
              Message
            </ButtonLink>
          ) : messaging ? (
            <p className="rounded-full border border-sand px-4 py-2 text-xs text-muted">
              {messaging.reason}
            </p>
          ) : null}
          <form action={blockMemberAction}>
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="block" value={blocked ? "false" : "true"} />
            <button
              type="submit"
              className="rounded-full border border-sand px-4 py-2 text-xs text-olive hover:border-danger hover:text-danger"
            >
              {blocked ? "Unblock" : "Block"}
            </button>
          </form>
        </div>
      ) : null}

      <p className="mt-6 text-lg">{profile.bio}</p>
      {profile.skillLevel ? (
        <p className="mt-4 text-sm text-olive">Skill: {profile.skillLevel}</p>
      ) : null}

      {badges.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-xl text-forest">Recognition</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {badges.map((award) => (
              <li
                key={award.id}
                title={award.reason ?? award.badge.description}
                className="flex items-center gap-2 rounded-full border border-sand bg-surface px-3 py-1.5 text-sm"
              >
                <span aria-hidden>{award.badge.icon ?? "🌱"}</span>
                <span className="font-medium text-forest">{award.badge.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {visible.showInterests && interests.length > 0 ? (
        <ul className="mt-6 flex flex-wrap gap-2">
          {interests.map((item) => (
            <li key={item} className="rounded-full bg-sage/40 px-3 py-1 text-sm">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {visible.showLinks && links.length > 0 ? (
        <ul className="mt-4 space-y-1 text-sm">
          {links.map((link) => (
            <li key={link}>
              <a href={link} className="text-olive" target="_blank" rel="noreferrer">
                {link}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
