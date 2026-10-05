import { redirect } from "next/navigation";
import { Compass, LayoutGrid, Star } from "lucide-react";
import { auth } from "@/auth";
import { listNavSpaces } from "@/lib/spaces";
import { AppShell } from "@/components/app/app-shell";
import { SpaceCard } from "@/components/spaces/space-card";
import {
  ButtonLink,
  Callout,
  EmptyState,
  PageHeader,
  Section,
} from "@/components/app/ui";

export const metadata = { title: "Spaces" };

/** One grid for every group, so the directory reads as one surface. */
const GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3";

/**
 * The space directory.
 *
 * Grouped exactly the way the rail is, from the same `listNavSpaces` call, so
 * the two can never disagree about how the community is organised. Private
 * rooms the member is not in are absent entirely rather than shown as locked —
 * being told a room exists but not what is in it is its own kind of leak.
 *
 * The same width and columns as the member directory: both are grids of
 * things to open, and they should feel like the same kind of page.
 */
export default async function SpacesPage() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const { favorites, groups } = await listNavSpaces(session.user.id);
  const all = [...favorites, ...groups.flatMap((group) => group.spaces)];

  if (all.length === 0) {
    return (
      <AppShell size="wide">
        <div className="flex flex-col gap-6">
          <PageHeader title="Spaces" />
          <EmptyState
            icon={<LayoutGrid />}
            title="Spaces are being prepared"
            description="Hosts will open kitchens, course rooms and event spaces here."
            action={<ButtonLink href="/home">Back to Explorer</ButtonLink>}
          />
        </div>
      </AppShell>
    );
  }

  const joined = all.filter((space) => space.joined).length;
  const unread = all.reduce((sum, space) => sum + space.unread, 0);

  return (
    <AppShell size="wide">
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Spaces"
          description={
            <>
              Every post lives in a room. You are in {joined} of {all.length}
              {unread > 0 ? `, with ${unread} unread` : ""}.
            </>
          }
        />

        {joined === 0 ? (
          <Callout tone="brand" icon={<Compass />}>
            You have not joined a room yet — your feed will stay empty until you
            do.
          </Callout>
        ) : null}

        {favorites.length > 0 ? (
          <Section title="Favourites" icon={<Star className="fill-current" />}>
            <div className={GRID}>
              {favorites.map((space) => (
                <SpaceCard key={space.id} space={space} />
              ))}
            </div>
          </Section>
        ) : null}

        {groups.map((group) => (
          <Section key={group.id ?? "ungrouped"} title={group.name}>
            <div className={GRID}>
              {group.spaces.map((space) => (
                <SpaceCard key={space.id} space={space} />
              ))}
            </div>
          </Section>
        ))}
      </div>
    </AppShell>
  );
}
