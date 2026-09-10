import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import {
  markConversationRead,
  readConversation,
} from "@/lib/messages/conversations";
import { MessageThread } from "@/components/messages/message-thread";
import { Avatar } from "@/components/ui/avatar";
import {
  blockMemberAction,
  leaveConversationAction,
} from "@/app/(member)/messages/actions";

export const metadata = { title: "Conversation · Vegan University" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const { id } = await params;
  const conversation = await readConversation(id, session.user.id);
  // A conversation you are not in is indistinguishable from one that is missing.
  if (!conversation) notFound();
  await markConversationRead(id, session.user.id);

  return (
    <div className="flex h-[calc(100vh-11rem)] flex-col">
      <header className="vu-card flex flex-wrap items-center gap-4 p-4">
        <Link
          href="/messages"
          aria-label="Back to messages"
          className="text-olive hover:text-forest"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex -space-x-3">
          {conversation.others.map((other) => (
            <Avatar
              key={other.id}
              name={other.name}
              src={other.avatarUrl}
              className="ring-2 ring-surface"
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl text-forest">
            {conversation.title || "Conversation"}
          </h1>
          <p className="text-xs text-muted">
            {conversation.isGroup
              ? `${conversation.others.length + 1} people`
              : conversation.others[0]
                ? `@${conversation.others[0].handle}`
                : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!conversation.isGroup && conversation.others[0] ? (
            <form action={blockMemberAction}>
              <input type="hidden" name="userId" value={conversation.others[0].id} />
              <input
                type="hidden"
                name="block"
                value={conversation.others[0].blockedByViewer ? "false" : "true"}
              />
              <button
                type="submit"
                className="rounded-full border border-sand px-3 py-1.5 text-xs text-olive hover:border-danger hover:text-danger"
              >
                {conversation.others[0].blockedByViewer ? "Unblock" : "Block"}
              </button>
            </form>
          ) : null}
          {conversation.isGroup ? (
            <form action={leaveConversationAction}>
              <input type="hidden" name="conversationId" value={conversation.id} />
              <button
                type="submit"
                className="rounded-full border border-sand px-3 py-1.5 text-xs text-olive hover:border-danger hover:text-danger"
              >
                Leave
              </button>
            </form>
          ) : null}
        </div>
      </header>

      {conversation.others.some((other) => other.blockedByViewer) ? (
        <p className="mt-3 rounded-2xl bg-sand/40 px-4 py-3 text-sm text-olive" role="status">
          You have blocked this member. Unblock to send messages again.
        </p>
      ) : null}

      <MessageThread
        conversationId={conversation.id}
        isGroup={conversation.isGroup}
        initialMessages={conversation.messages.map((message) => ({
          id: message.id,
          body: message.body,
          imageUrl: message.imageUrl,
          createdAt: message.createdAt.toISOString(),
          authorId: message.authorId,
          authorName: message.author.profile?.displayName ?? message.author.handle,
          authorAvatar: message.author.profile?.avatarUrl ?? null,
          mine: message.authorId === session.user.id,
        }))}
      />
    </div>
  );
}
