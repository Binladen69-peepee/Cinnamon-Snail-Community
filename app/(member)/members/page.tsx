import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { peopleYouShouldMeet } from "@/lib/social/suggestions";

export const metadata = { title: "Members · Vegan University" };

export default async function MembersPage() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const [members, suggestions] = await Promise.all([
    prisma.profile.findMany({
      where: { directoryVisible: true, user: { status: "ACTIVE" } },
      include: { user: { select: { handle: true } } },
      orderBy: { displayName: "asc" },
    }),
    peopleYouShouldMeet(session.user.id, 4),
  ]);

  if (members.length === 0) {
    return (
      <EmptyState
        title="The directory is quiet"
        body="When members make their profiles visible, they will appear here."
      />
    );
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-forest">Members</h1>
          <p className="mt-3 text-muted">
            People cooking, learning, and showing up.
          </p>
        </div>
        <ButtonLink href="/connect" variant="secondary" size="sm">
          Why these people?
        </ButtonLink>
      </header>

      {suggestions.length > 0 ? (
        <section aria-labelledby="meet" className="vu-card p-6">
          <h2 id="meet" className="font-display text-xl text-forest">
            People you should meet
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {suggestions.map((person) => (
              <li key={person.userId} className="flex gap-3">
                <Avatar name={person.displayName} src={person.avatarUrl} />
                <div className="min-w-0">
                  <Link
                    href={`/members/${person.handle}`}
                    className="block truncate font-semibold text-forest no-underline hover:underline"
                  >
                    {person.displayName}
                  </Link>
                  <p className="text-sm text-muted">{person.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="directory">
        <h2 id="directory" className="sr-only">
          Member directory
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <Link
              key={member.id}
              href={`/members/${member.user.handle}`}
              className="vu-card vu-card-hover p-5 no-underline"
            >
              <Avatar name={member.displayName} src={member.avatarUrl} />
              <h3 className="mt-3 font-display text-xl text-forest">
                {member.displayName}
              </h3>
              <p className="text-sm text-muted">
                {[member.city, member.region].filter(Boolean).join(", ") ||
                  "Somewhere cooking"}
              </p>
              <p className="mt-2 line-clamp-3 text-sm">{member.bio}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
