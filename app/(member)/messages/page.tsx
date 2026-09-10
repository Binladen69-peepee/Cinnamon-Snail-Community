import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listConversations } from "@/lib/messages/conversations";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Messages · Vegan University" };

function whenLabel(date: Date | null) {
  if (!date) return "";
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const conversations = await listConversations(session.user.id);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-forest">Messages</h1>
          <p className="mt-3 text-muted">
            Quiet conversations with the people you meet here.
          </p>
        </div>
        <ButtonLink href="/messages/new">Start a conversation</ButtonLink>
      </header>

      {conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          body="Find someone in the directory whose cooking you want to talk about, and say hello."
          actionLabel="Browse members"
          actionHref="/members"
        />
      ) : (
        <ul className="space-y-3">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/messages/${conversation.id}`}
                className="vu-card vu-card-hover flex items-center gap-4 p-4 no-underline"
              >
                <div className="flex -space-x-3">
                  {conversation.others.slice(0, 3).map((other) => (
                    <Avatar
                      key={other.id}
                      name={other.name}
                      src={other.avatarUrl}
                      className="ring-2 ring-surface"
                    />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-semibold text-forest">
                      {conversation.title || "Conversation"}
                    </p>
                    <span className="shrink-0 text-xs text-muted">
                      {whenLabel(conversation.lastMessageAt)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted">
                    {conversation.lastMessage
                      ? conversation.lastMessage.body ||
                        (conversation.lastMessage.imageUrl ? "Shared an image" : "")
                      : "No messages yet"}
                  </p>
                </div>
                {conversation.unread > 0 ? (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                    {conversation.unread > 9 ? "9+" : conversation.unread}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
