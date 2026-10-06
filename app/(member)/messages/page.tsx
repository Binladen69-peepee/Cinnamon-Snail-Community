import { redirect } from "next/navigation";
import { MessageSquare, PenSquare } from "lucide-react";
import { auth } from "@/auth";
import { directMessageTarget } from "@/lib/messages/start";
import { ButtonLink, EmptyState } from "@/components/app/ui";

/**
 * The detail pane with nothing selected.
 *
 * On a phone this is never seen — the list fills the screen at `/messages` and
 * this pane is hidden. On a wide screen it is the right half, and an empty
 * right half needs to say what to do rather than sit blank.
 *
 * `?to=<handle>` is how profiles say "message this member". It lands on the
 * thread the viewer already has with them, or on the picker with them chosen.
 */
export default async function MessagesIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;
  if (to?.trim()) {
    const session = await auth();
    if (!session?.user.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/messages?to=${to}`)}`);
    redirect(await directMessageTarget(session.user.id, to));
  }

  return (
    <div className="hidden h-full items-center justify-center lg:flex">
      <EmptyState
        bordered={false}
        icon={<MessageSquare />}
        title="Your conversations live here"
        description="Pick a conversation on the left, or start one with someone you have been cooking alongside."
        action={
          <ButtonLink href="/messages/new" variant="primary">
            <PenSquare className="size-4" aria-hidden />
            New message
          </ButtonLink>
        }
      />
    </div>
  );
}
