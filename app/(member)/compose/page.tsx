import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { parseComposerType } from "@/lib/community/post-types";
import { uploadsConfigured } from "@/lib/uploads/storage";
import { AppShell } from "@/components/app/app-shell";
import { ComposeForm } from "@/components/feed/compose-form";

export const metadata = { title: "New post" };

/**
 * The full composer.
 *
 * Eight surfaces link here — the Create button in the bar, the raised centre
 * tab on phones, the Create Post button in the discovery rail, the empty feed,
 * the space pages, and the inline composer's own Link and Poll shortcuts — and
 * every one of them was a 404.
 *
 * The type arrives in the URL because that is how the inline composer already
 * linked here (`/compose?type=POLL`), which also makes "post a poll" a URL
 * someone can be sent.
 *
 * Only rooms the member can actually post in are offered. Reading them from
 * their memberships rather than from every visible room means the space picker
 * cannot suggest somewhere the server would then refuse.
 */
export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; space?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const params = await searchParams;
  const type = parseComposerType(params.type);

  const memberships = await prisma.spaceMembership.findMany({
    where: { userId: session.user.id },
    select: { space: { select: { id: true, name: true, slug: true } } },
    orderBy: { space: { sortOrder: "asc" } },
  });
  const spaces = memberships.map((row) => row.space);

  // Prefer the room asked for, then the one last read, then the first joined.
  const asked = params.space
    ? spaces.find((space) => space.slug === params.space || space.id === params.space)
    : undefined;
  const lastUsed = (await cookies()).get("vu-last-space")?.value;
  const defaultSpaceId =
    asked?.id ??
    spaces.find((space) => space.id === lastUsed)?.id ??
    spaces[0]?.id ??
    null;

  return (
    <AppShell>
      <div className="space-y-4">
        <header>
          <h1 className="font-display text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
            New post
          </h1>
          <p className="mt-1 text-[14px] text-foreground-muted">
            Everything you can post, with the fields each kind needs.
          </p>
        </header>

        <ComposeForm
          type={type.value}
          spaces={spaces.map(({ id, name }) => ({ id, name }))}
          defaultSpaceId={defaultSpaceId}
          uploadsEnabled={uploadsConfigured()}
        />
      </div>
    </AppShell>
  );
}
