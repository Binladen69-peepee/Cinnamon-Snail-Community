import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { markNotificationsRead } from "@/lib/notifications/create";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/utils";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (notifications.some((item) => !item.readAt)) {
    await markNotificationsRead(session.user.id);
  }
  return (
    <div>
      <h1 className="font-display text-4xl text-forest">Notifications</h1>
      <div className="mt-8 space-y-3">
        {notifications.length === 0 ? (
          <EmptyState
            title="You're all caught up"
            body="Replies, mentions, and host notes will land here. Email and web push join as those channels are connected."
          />
        ) : (
          notifications.map((item) => (
            <Link
              key={item.id}
              href={item.href ?? "/notifications"}
              className="block rounded-3xl border border-sand bg-warm-white p-5"
            >
              <p className="text-xs uppercase text-olive">{item.category.toLowerCase()}</p>
              <h2 className="mt-1 font-medium text-forest">{item.title}</h2>
              <p className="text-sm text-muted">{item.body}</p>
              <p className="mt-2 text-xs text-taupe">{formatRelativeTime(item.createdAt)}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
