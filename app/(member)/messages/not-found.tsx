import { MessageSquareOff, PenSquare } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/app/ui";
import { PaneBackLink, PaneHeader } from "@/components/messages/pane-header";

/**
 * A thread that does not exist, or that the viewer is not in: the two are
 * deliberately the same answer. Shown in the detail pane, so the inbox stays
 * beside it rather than the whole frame giving way to a bare 404.
 */
export default function ConversationNotFound() {
  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <PaneHeader>
        <PaneBackLink />
        <h1 className="truncate text-title font-semibold text-foreground">Messages</h1>
      </PaneHeader>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
        <EmptyState
          bordered={false}
          icon={<MessageSquareOff />}
          title="This conversation is not available"
          description="It may have been left, or the link may be wrong."
          action={
            <ButtonLink href="/messages/new" variant="primary">
              <PenSquare className="size-4" aria-hidden />
              New message
            </ButtonLink>
          }
        />
      </div>
    </section>
  );
}
