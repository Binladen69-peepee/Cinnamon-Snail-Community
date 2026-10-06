import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { auth } from "@/auth";
import { composerTypesFor, parseComposerType } from "@/lib/community/post-types";
import { countOwnUnpublished } from "@/lib/community/feed";
import { hasHostRole } from "@/lib/community/kitchen-table";
import { KITCHEN_TABLE_PATH } from "@/lib/community/system-spaces";
import { uploadsConfigured } from "@/lib/uploads/storage";
import { AppShell } from "@/components/app/app-shell";
import { ButtonLink, Card, PageHeader } from "@/components/app/ui";
import { ComposeForm } from "@/components/feed/compose-form";

export const metadata = { title: "New post" };

/**
 * The full composer.
 *
 * The type arrives in the URL because that is how the inline composer links
 * here (`/compose?type=POLL`), which also makes "post a poll" a URL someone can
 * be sent. Every post goes to the Kitchen Table (DEC-078), so there is no room
 * to choose; a staff-only type asked for by a member falls back to a plain post.
 *
 * Drafts are no longer started anywhere (the client removed Drafts), but a
 * member who has unpublished posts — old drafts, scheduled posts, posts
 * waiting for a host — still needs a way to reach them. That link appears
 * here, and only when there is something behind it.
 */
export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login?callbackUrl=/compose");

  const params = await searchParams;
  const staff = hasHostRole(session.user.roles);
  const type = parseComposerType(params.type, { isStaff: staff });
  const types = composerTypesFor(staff).map((entry) => entry.value);
  const unpublished = await countOwnUnpublished(session.user.id);

  const draftsTab =
    unpublished.DRAFT > 0 ? "DRAFT" : unpublished.SCHEDULED > 0 ? "SCHEDULED" : "PENDING";

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          back={{ href: KITCHEN_TABLE_PATH, label: "Kitchen Table" }}
          title="New post"
          description="It goes to the Kitchen Table. Pick what kind of post it is, and the fields it needs appear."
          actions={
            unpublished.total > 0 ? (
              <ButtonLink href={`/drafts?tab=${draftsTab}`} size="sm">
                <FileText className="size-4" aria-hidden />
                Unpublished posts ({unpublished.total})
              </ButtonLink>
            ) : undefined
          }
        />

        <Card padding="lg">
          <ComposeForm type={type.value} types={types} uploadsEnabled={uploadsConfigured()} />
        </Card>
      </div>
    </AppShell>
  );
}
