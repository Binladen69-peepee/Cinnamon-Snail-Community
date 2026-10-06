import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listConversations } from "@/lib/messages/conversations";
import { AppShell } from "@/components/app/app-shell";
import {
  ConversationList,
  type InboxRow,
} from "@/components/messages/conversation-list";
import { MessagesPanes } from "@/components/messages/messages-panes";
import { InboxSkeleton } from "@/components/messages/skeletons";
import { resolveMemberAvatar } from "@/lib/community/member-avatars";

export const metadata = { title: "Messages" };

/**
 * The messages frame.
 *
 * The inbox lives in the layout, not in each page, so moving between threads
 * does not refetch or remount it — the list keeps its scroll position and the
 * only thing that changes is the pane beside it.
 *
 * Its query sits behind its own Suspense boundary. A `loading.tsx` in this
 * folder only covers the pages below the layout, never the layout itself, so
 * without the boundary entering /messages showed nothing at all until the
 * inbox had loaded. Now the panes arrive at once and the list fills in.
 */
export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  return (
    <AppShell wide flush>
      <MessagesPanes
        list={
          <Suspense fallback={<InboxSkeleton />}>
            <Inbox viewerId={session.user.id} />
          </Suspense>
        }
      >
        {children}
      </MessagesPanes>
    </AppShell>
  );
}

async function Inbox({ viewerId }: { viewerId: string }) {
  const conversations = await listConversations(viewerId);

  const rows: InboxRow[] = conversations.map((conversation) => {
    const last = conversation.lastMessage;
    const mine = last?.author.id === viewerId;
    // In a group the preview says who spoke, by first name as people say it.
    const speaker = last
      ? (last.author.profile?.displayName ?? last.author.handle).trim().split(/\s+/)[0]
      : "";
    const preview = last
      ? `${mine ? "You: " : conversation.kind !== "direct" ? `${speaker}: ` : ""}${
          last.body || "Shared an image"
        }`
      : conversation.kind === "crew"
        ? "Crew chat · no messages yet"
        : "No messages yet";
    return {
      id: conversation.id,
      title: conversation.title,
      isGroup: conversation.isGroup,
      isCrew: conversation.kind === "crew",
      others: conversation.others.map((other) => ({
        handle: other.handle,
        name: other.name,
        avatarUrl: resolveMemberAvatar(other.handle, other.avatarUrl, other.name),
      })),
      preview,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      unread: conversation.unread,
    };
  });

  return <ConversationList rows={rows} />;
}
