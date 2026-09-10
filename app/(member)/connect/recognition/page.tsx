import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { badgesForUser, recentRecognition } from "@/lib/social/badges";
import { Avatar } from "@/components/ui/avatar";

export const metadata = { title: "Recognition · Vegan University" };

export default async function RecognitionPage() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const [catalog, mine, community] = await Promise.all([
    prisma.badge.findMany({ orderBy: { sortOrder: "asc" } }),
    badgesForUser(session.user.id),
    recentRecognition(12),
  ]);
  const held = new Map(mine.map((award) => [award.badge.slug, award]));

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-4xl text-forest">Recognition</h1>
        <p className="mt-3 max-w-prose text-muted">
          Badges are for things you actually did — a first cook, an answer someone
          needed, a course finished. There are no points and no leaderboard.
        </p>
      </header>

      <section aria-labelledby="yours">
        <h2 id="yours" className="font-display text-2xl text-forest">
          Yours
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {catalog.map((badge) => {
            const award = held.get(badge.slug);
            return (
              <li
                key={badge.id}
                className={
                  award
                    ? "vu-card p-5"
                    : "rounded-[1.25rem] border border-dashed border-sand p-5 opacity-70"
                }
              >
                <div className="flex items-start gap-3">
                  <span aria-hidden className="text-2xl">
                    {badge.icon ?? "🌱"}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-forest">{badge.name}</h3>
                    <p className="mt-1 text-sm text-muted">{badge.description}</p>
                    <p className="mt-2 text-xs text-olive">
                      {award
                        ? `Earned ${award.awardedAt.toLocaleDateString()} · ${award.reason ?? ""}`
                        : badge.criteria}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="community">
        <h2 id="community" className="font-display text-2xl text-forest">
          Around the community
        </h2>
        {community.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing awarded yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {community.map((award) => (
              <li key={award.id} className="vu-card flex items-center gap-3 p-4">
                <Avatar
                  name={award.user.profile?.displayName ?? award.user.handle}
                  src={award.user.profile?.avatarUrl}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <Link
                      href={`/members/${award.user.handle}`}
                      className="font-semibold text-forest no-underline hover:underline"
                    >
                      {award.user.profile?.displayName ?? award.user.handle}
                    </Link>{" "}
                    earned{" "}
                    <span className="font-semibold">
                      {award.badge.icon} {award.badge.name}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {award.reason ?? award.badge.description}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-muted">
                  {award.awardedAt.toLocaleDateString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
