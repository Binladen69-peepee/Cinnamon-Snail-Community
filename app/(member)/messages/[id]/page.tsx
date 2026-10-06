import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { readConversation } from "@/lib/messages/conversations";
import { previewInternalLinks } from "@/lib/messages/link-preview";
import { resolveMemberAvatar } from "@/lib/community/member-avatars";
import { uploadsConfigured } from "@/lib/uploads/storage";
import { resolveMatchDraft } from "@/lib/social/suggestions";
import { CREW_KIND_LABEL } from "@/lib/crews/labels";
import { Thread } from "@/components/messages/thread";
import type { ThreadMessage } from "@/components/messages/message-bubble";

/**
 * One conversation.
 *
 * `readConversation` returns null for a thread the viewer is not a member of,
 * which becomes a 404 — a guessed id must not be distinguishable from a thread
 * that does not exist.
 *
 * Note what this page does *not* do: mark the thread read. Rendering is not
 * reading, and a prefetch would then destroy the unread badge the member came
 * here to act on. The poll route marks it read once messages are actually on
 * screen, which is the standing rule from the rebuild roadmap.
 *
 * `?draft=match:<id>` is the weekly match's "Message <name>": the suggested
 * opener is looked up here, on the server, for the match's owner only, and
 * put in the composer. The URL never carries the text, and nothing is sent
 * until the member sends it.
 */
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ draft?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const { id } = await params;
  const { draft: draftKey } = await searchParams;
  const conversation = await readConversation(id, session.user.id);
  if (!conversation) notFound();

  // Resolved once for the whole page rather than per bubble, so a thread where
  // somebody pasted six lessons costs one query, not six.
  const origin = (await headers()).get("origin") ?? "";
  const [previews, draft] = await Promise.all([
    previewInternalLinks({
      bodies: conversation.messages.map((message) => message.body),
      origin,
    }),
    draftKey && conversation.kind === "direct"
      ? resolveMatchDraft({ viewerId: session.user.id, draftKey, conversationId: id }).catch(
          () => null,
        )
      : null,
  ]);

  const messages: ThreadMessage[] = conversation.messages.map((message) => ({
    id: message.id,
    body: message.body,
    imageUrl: message.imageUrl,
    createdAt: message.createdAt.toISOString(),
    authorId: message.authorId,
    authorName: message.author.profile?.displayName ?? message.author.handle,
    authorAvatar: resolveMemberAvatar(
      message.author.handle,
      message.author.profile?.avatarUrl,
      message.author.profile?.displayName,
    ),
    mine: message.authorId === session.user.id,
  }));

  return (
    <Thread
      conversationId={conversation.id}
      title={conversation.title || "Conversation"}
      kind={conversation.kind}
      isGroup={conversation.isGroup}
      memberCount={conversation.memberCount}
      crew={
        conversation.crew
          ? {
              slug: conversation.crew.slug,
              name: conversation.crew.name,
              label: `${CREW_KIND_LABEL[conversation.crew.kind]} crew`,
              archived: conversation.crew.archived,
            }
          : null
      }
      hiddenAuthorIds={conversation.hiddenAuthorIds}
      draft={draft}
      others={conversation.others.map((other) => ({
        id: other.id,
        handle: other.handle,
        name: other.name,
        avatarUrl: resolveMemberAvatar(other.handle, other.avatarUrl, other.name),
        lastReadAt: other.lastReadAt?.toISOString() ?? null,
        blockedByViewer: other.blockedByViewer,
      }))}
      initialMessages={messages}
      initialPreviews={[...previews.values()]}
      hasMore={conversation.hasMore}
      uploadsEnabled={uploadsConfigured()}
    />
  );
}
