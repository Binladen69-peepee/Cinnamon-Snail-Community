import { MessageSquare, PenSquare } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/app/ui";

/**
 * The detail pane with nothing selected.
 *
 * On a phone this is never seen — the list fills the screen at `/messages` and
 * this pane is hidden. On a wide screen it is the right half, and an empty
 * right half needs to say what to do rather than sit blank.
 */
export default function MessagesIndexPage() {
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
