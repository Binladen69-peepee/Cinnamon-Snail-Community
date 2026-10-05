import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listMessageableMembers } from "@/lib/messages/start";
import { MAX_GROUP_MEMBERS } from "@/lib/messages/permissions";
import { NewMessagePicker } from "@/components/messages/new-message-picker";
import { PaneBackLink, PaneHeader } from "@/components/messages/pane-header";

export const metadata = { title: "New message" };

/**
 * Who to write to.
 *
 * With one conversation in the whole community, the inbox is empty for almost
 * everybody — so starting one is the primary action here, not a corner button.
 * It is a route rather than a dialog so it works the same on a phone, where it
 * simply fills the screen.
 */
export default async function NewMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; to?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const members = await listMessageableMembers({
    viewerId: session.user.id,
    q,
  });

  const error =
    params.error === "pick"
      ? "Choose at least one person."
      : params.error === "missing"
        ? "That member could not be found."
        : (params.error ?? null);

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <PaneHeader>
        <PaneBackLink />
        <h1 className="truncate text-title font-semibold text-foreground">New message</h1>
      </PaneHeader>

      <NewMessagePicker
        members={members}
        preselect={params.to?.trim() || null}
        maxGroup={MAX_GROUP_MEMBERS}
        error={error}
      />
    </section>
  );
}
