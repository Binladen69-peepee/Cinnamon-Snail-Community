import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, FileText, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { listOwnUnpublished } from "@/lib/community/feed";
import { AppShell } from "@/components/app/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { DraftRow } from "@/app/(member)/drafts/draft-row";
import { cn } from "@/lib/utils";

export const metadata = { title: "Drafts" };

const TABS = [
  { value: "DRAFT", label: "Drafts", icon: FileText },
  { value: "SCHEDULED", label: "Scheduled", icon: CalendarClock },
  { value: "PENDING", label: "In review", icon: ShieldCheck },
] as const;

type Tab = (typeof TABS)[number]["value"];

function parseTab(value: string | undefined): Tab {
  return value === "SCHEDULED" || value === "PENDING" ? value : "DRAFT";
}

/**
 * Everything you have written that nobody else can see yet.
 *
 * Drafts, scheduled posts and posts waiting on a host all end up in the same
 * place because they are the same thing from the author's side: written, not
 * live. The schema has supported all three for a long time and none of them
 * had anywhere to appear, so a draft was a post that vanished.
 *
 * Only ever your own. `listOwnUnpublished` filters by author and nothing here
 * takes a member id from the URL.
 */
export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const tab = parseTab((await searchParams).tab);
  const { posts } = await listOwnUnpublished({
    userId: session.user.id,
    status: tab,
  });

  return (
    <AppShell>
      <div className="space-y-4 pb-10">
        <div>
          <h1 className="font-display text-[1.6rem] font-bold tracking-[-0.02em] text-foreground">
            Your drafts
          </h1>
          <p className="mt-1 text-[14px] text-foreground-muted">
            Nothing here is visible to anyone else.
          </p>
        </div>

        <nav
          aria-label="Draft state"
          className="flex items-center gap-1 overflow-x-auto rounded-card border border-border bg-surface p-1"
        >
          {TABS.map((item) => {
            const active = tab === item.value;
            const Icon = item.icon;
            return (
              <Link
                key={item.value}
                href={`/drafts?tab=${item.value}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-chip text-[13px] font-semibold no-underline transition",
                  active
                    ? "bg-brand-fill text-brand-fill-foreground"
                    : "text-foreground-muted hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {posts.length === 0 ? (
          <EmptyState
            title={
              tab === "DRAFT"
                ? "No drafts"
                : tab === "SCHEDULED"
                  ? "Nothing scheduled"
                  : "Nothing in review"
            }
            body={
              tab === "DRAFT"
                ? "Anything you save without posting shows up here."
                : tab === "SCHEDULED"
                  ? "Posts you time for later wait here until they go live."
                  : "Posts waiting for a host to approve them appear here."
            }
            actionLabel="Write a post"
            actionHref="/compose"
          />
        ) : (
          <ul className="space-y-2.5">
            {posts.map((post) => (
              <DraftRow
                key={post.id}
                post={{
                  id: post.id,
                  title: post.title,
                  plainText: post.plainText,
                  spaceName: post.space.name,
                  scheduledAt: post.scheduledAt
                    ? post.scheduledAt.toISOString()
                    : null,
                  updatedAt: post.updatedAt.toISOString(),
                  attachments: post.attachments.length,
                }}
                canPublish={tab !== "PENDING"}
              />
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
