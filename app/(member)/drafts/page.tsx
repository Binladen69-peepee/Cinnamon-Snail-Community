import { redirect } from "next/navigation";
import { CalendarClock, FileText, PenLine, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { listOwnUnpublished } from "@/lib/community/feed";
import { AppShell } from "@/components/app/app-shell";
import {
  ButtonLink,
  EmptyState,
  PageHeader,
  TabBar,
  TabLink,
  cardClass,
} from "@/components/app/ui";
import { DraftRow } from "@/app/(member)/drafts/draft-row";

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
  const EmptyIcon = TABS.find((item) => item.value === tab)!.icon;

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Your drafts"
          description="Nothing here is visible to anyone else."
        >
          <TabBar label="Draft state">
            {TABS.map((item) => {
              const active = tab === item.value;
              const Icon = item.icon;
              return (
                <TabLink
                  key={item.value}
                  href={`/drafts?tab=${item.value}`}
                  active={active}
                  scroll
                >
                  <Icon aria-hidden />
                  {item.label}
                </TabLink>
              );
            })}
          </TabBar>
        </PageHeader>

        {posts.length === 0 ? (
          <EmptyState
            icon={<EmptyIcon />}
            title={
              tab === "DRAFT"
                ? "No drafts"
                : tab === "SCHEDULED"
                  ? "Nothing scheduled"
                  : "Nothing in review"
            }
            description={
              tab === "DRAFT"
                ? "Anything you save without posting shows up here."
                : tab === "SCHEDULED"
                  ? "Posts you time for later wait here until they go live."
                  : "Posts waiting for a host to approve them appear here."
            }
            action={
              <ButtonLink href="/compose" variant="primary">
                <PenLine className="size-4" aria-hidden />
                Write a post
              </ButtonLink>
            }
          />
        ) : (
          <ul className={cardClass({ padding: "none", className: "divide-y divide-separator" })}>
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
