import { redirect } from "next/navigation";
import { Compass, Star } from "lucide-react";
import { auth } from "@/auth";
import { listNavSpaces } from "@/lib/spaces";
import { AppShell } from "@/components/app/app-shell";
import { SpaceCard } from "@/components/spaces/space-card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Spaces" };

/**
 * The space directory.
 *
 * Grouped exactly the way the rail is, from the same `listNavSpaces` call, so
 * the two can never disagree about how the community is organised. Private
 * rooms the member is not in are absent entirely rather than shown as locked —
 * being told a room exists but not what is in it is its own kind of leak.
 */
export default async function SpacesPage() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const { favorites, groups } = await listNavSpaces(session.user.id);
  const all = [...favorites, ...groups.flatMap((group) => group.spaces)];

  if (all.length === 0) {
    return (
      <AppShell>
        <EmptyState
          title="Spaces are being prepared"
          body="Hosts will open kitchens, course rooms and event spaces here."
        />
      </AppShell>
    );
  }

  const joined = all.filter((space) => space.joined).length;
  const unread = all.reduce((sum, space) => sum + space.unread, 0);

  return (
    <AppShell>
      <div className="space-y-5">
        <header>
          <h1 className="font-display text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
            Spaces
          </h1>
          <p className="mt-1 text-[14px] text-foreground-muted">
            Every post lives in a room. You are in {joined} of {all.length}
            {unread > 0 ? `, with ${unread} unread` : ""}.
          </p>
        </header>

        {favorites.length > 0 ? (
          <Section
            title="Favourites"
            icon={<Star className="size-2.5 fill-current" aria-hidden />}
          >
            {favorites.map((space) => (
              <SpaceCard key={space.id} space={space} />
            ))}
          </Section>
        ) : null}

        {groups.map((group) => (
          <Section key={group.id ?? "ungrouped"} title={group.name}>
            {group.spaces.map((space) => (
              <SpaceCard key={space.id} space={space} />
            ))}
          </Section>
        ))}

        {joined === 0 ? (
          <p className="flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-2.5 text-[13.5px] text-foreground-muted">
            <Compass className="size-4 shrink-0 text-brand" aria-hidden />
            You have not joined a room yet — your feed will stay empty until you
            do.
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
        {icon}
        {title}
      </h2>
      <div className="grid gap-2.5 sm:grid-cols-2">{children}</div>
    </section>
  );
}
