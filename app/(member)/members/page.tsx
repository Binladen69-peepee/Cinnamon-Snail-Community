import Link from "next/link";
import { prisma } from "@/lib/db";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";

export default async function MembersPage() {
  const members = await prisma.profile.findMany({
    where: { directoryVisible: true, user: { status: "ACTIVE" } },
    include: { user: true },
    orderBy: { displayName: "asc" },
  });
  if (members.length === 0) {
    return (
      <EmptyState
        title="The directory is quiet"
        body="When members make their profiles visible, they will appear here."
      />
    );
  }
  return (
    <div>
      <h1 className="font-display text-4xl text-forest">Members</h1>
      <p className="mt-3 text-muted">People cooking, learning, and showing up.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => (
          <Link
            key={member.id}
            href={`/members/${member.user.handle}`}
            className="rounded-[1.5rem] border border-sand bg-warm-white p-5"
          >
            <Avatar name={member.displayName} src={member.avatarUrl} />
            <h2 className="mt-3 font-display text-xl text-forest">{member.displayName}</h2>
            <p className="text-sm text-muted">
              {[member.city, member.region].filter(Boolean).join(", ") || "Somewhere cooking"}
            </p>
            <p className="mt-2 line-clamp-3 text-sm">{member.bio}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
