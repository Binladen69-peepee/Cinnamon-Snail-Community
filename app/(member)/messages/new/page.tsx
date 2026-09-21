import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { listMessageableMembers } from "@/lib/messages/start";
import { MAX_GROUP_MEMBERS } from "@/lib/messages/permissions";
import { NewMessagePicker } from "@/components/messages/new-message-picker";

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
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-2.5">
        <Link
          href="/messages"
          aria-label="Back to conversations"
          className="-ml-1 grid size-8 shrink-0 place-items-center rounded-full text-foreground-muted no-underline transition hover:bg-brand-wash hover:text-brand-strong lg:hidden"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <h1 className="text-[15px] font-bold text-foreground">New message</h1>
      </header>

      <NewMessagePicker
        members={members}
        preselect={params.to?.trim() || null}
        maxGroup={MAX_GROUP_MEMBERS}
        error={error}
      />
    </section>
  );
}
