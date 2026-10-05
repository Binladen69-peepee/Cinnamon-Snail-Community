import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getSpaceSettings,
  listAttachableProducts,
  listSpaceGroups,
} from "@/lib/spaces/settings";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/ui";
import { SpaceSettingsForm } from "@/app/(member)/spaces/[slug]/settings/settings-form";

export const metadata = { title: "Space settings" };

/**
 * A space's own settings, for the people who run it.
 *
 * Not in the admin console. The person who runs a room is usually its host
 * rather than staff, and sending them to a separate console to rename their
 * own space is part of why these settings ended up unreachable at all.
 *
 * Someone without permission gets a 404 rather than a refusal, for the same
 * reason a private space does: that the page exists is itself information.
 */
export default async function SpaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const { slug } = await params;
  const result = await getSpaceSettings(session.user.id, slug);
  if (!result) notFound();

  const [groups, products] = await Promise.all([
    listSpaceGroups(),
    result.canSetProduct ? listAttachableProducts() : Promise.resolve([]),
  ]);

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Space settings"
          description="Everything here takes effect for every member of this space."
          back={{ href: `/spaces/${slug}`, label: result.space.name }}
        />

        <SpaceSettingsForm
          space={result.space}
          groups={groups}
          products={products}
          canSetProduct={result.canSetProduct}
        />
      </div>
    </AppShell>
  );
}
