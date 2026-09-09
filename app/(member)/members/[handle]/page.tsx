import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Avatar } from "@/components/ui/avatar";
import { readPrivacy, visibleProfileFields } from "@/lib/community/privacy";

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
      <p className="mt-6 text-lg">{profile.bio}</p>
      {profile.skillLevel ? (
        <p className="mt-4 text-sm text-olive">Skill: {profile.skillLevel}</p>
      ) : null}
      {visible.showInterests && interests.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
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
