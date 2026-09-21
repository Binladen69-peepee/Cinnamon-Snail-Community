import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listConversations } from "@/lib/messages/conversations";
import { AppShell } from "@/components/app/app-shell";
import {
  ConversationList,
  type InboxRow,
} from "@/components/messages/conversation-list";
import { MessagesPanes } from "@/components/messages/messages-panes";
import { resolveMemberAvatar } from "@/lib/community/member-avatars";

export const metadata = { title: "Messages" };

/**
 * The messages frame.
 *
 * The inbox lives in the layout, not in each page, so moving between threads
 * does not refetch or remount it — the list keeps its scroll position and the
 * only thing that changes is the pane beside it.
 */
export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const conversations = await listConversations(session.user.id);

  const rows: InboxRow[] = conversations.map((conversation) => {
    const last = conversation.lastMessage;
    const mine = last?.author.id === session.user.id;
    const preview = last
      ? `${mine ? "You: " : conversation.isGroup ? `${last.author.handle}: ` : ""}${
          last.body || "Shared an image"
        }`
      : "No messages yet";
    return {
      id: conversation.id,
      title: conversation.title,
      isGroup: conversation.isGroup,
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

  return (
    <AppShell wide flush>
      <MessagesPanes list={<ConversationList rows={rows} />}>
        {children}
      </MessagesPanes>
    </AppShell>
  );
}
