import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getSpaceSettings,
  listAttachableProducts,
  listSpaceGroups,
} from "@/lib/spaces/settings";
import { KITCHEN_TABLE_PATH, KITCHEN_TABLE_SLUG } from "@/lib/community/system-spaces";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/ui";
import { SpaceSettingsForm } from "@/app/(member)/spaces/[slug]/settings/settings-form";

export const metadata = { title: "Space settings" };

/**
 * A room's own settings, for the people who run it.
 *
 * Rooms are no longer listed to members (DEC-078), but they still decide who
 * can read and post, whether posts wait for review, and whether a room's posts
 * read in the Kitchen Table at all. The Kitchen Table links here for its hosts.
 *
 * Someone without permission gets a 404 rather than a refusal, for the same
 * reason a private room does: that the page exists is itself information.
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

  const isTable = slug === KITCHEN_TABLE_SLUG;
  // The console's list of rooms is for staff; everyone else goes back to the table.
  const consoleAccess = session.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN",
  );
  const back =
    isTable || !consoleAccess
      ? { href: KITCHEN_TABLE_PATH, label: "Kitchen Table" }
      : { href: "/admin/spaces", label: "Spaces" };

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <PageHeader
          title={isTable ? "Kitchen Table settings" : `${result.space.name} settings`}
          description="Everything here takes effect for every member."
          back={back}
        />

        <SpaceSettingsForm
          space={result.space}
          groups={groups}
          products={products}
          canSetProduct={result.canSetProduct}
          back={back}
        />
      </div>
    </AppShell>
  );
}
