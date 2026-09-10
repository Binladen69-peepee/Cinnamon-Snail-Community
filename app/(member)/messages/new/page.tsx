import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NewConversationForm } from "@/components/messages/new-conversation-form";

export const metadata = { title: "New conversation · Vegan University" };

export default async function NewConversationPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const { to } = await searchParams;

  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [{ blockerId: session.user.id }, { blockedId: session.user.id }],
    },
    select: { blockerId: true, blockedId: true },
  });
  const hidden = new Set(
    blocks.flatMap((block) => [block.blockerId, block.blockedId]),
  );
  hidden.add(session.user.id);

  const members = await prisma.profile.findMany({
    where: {
      directoryVisible: true,
      dmPreference: { not: "NOBODY" },
      user: { status: "ACTIVE", id: { notIn: [...hidden] } },
    },
    select: {
      displayName: true,
      avatarUrl: true,
      user: { select: { handle: true } },
    },
    orderBy: { displayName: "asc" },
    take: 200,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="font-display text-4xl text-forest">Start a conversation</h1>
        <p className="mt-3 text-muted">
          Message one person, or gather a few for a small group. Members who keep
          direct messages closed are not listed.
        </p>
      </header>
      <NewConversationForm
        members={members.map((member) => ({
          handle: member.user.handle,
          name: member.displayName,
          avatarUrl: member.avatarUrl,
        }))}
        preselected={to ?? null}
      />
    </div>
  );
}
