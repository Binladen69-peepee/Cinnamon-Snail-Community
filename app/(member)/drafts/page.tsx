import { redirect } from "next/navigation";
import { CalendarClock, FileText, PenLine, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { countOwnUnpublished, excerptOf, listOwnUnpublished } from "@/lib/community/feed";
import { COMPOSER_TYPES } from "@/lib/community/post-types";
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

export const metadata = { title: "Unpublished posts" };

const TABS = [
  { value: "DRAFT", label: "Drafts", icon: FileText },
  { value: "SCHEDULED", label: "Scheduled", icon: CalendarClock },
  { value: "PENDING", label: "In review", icon: ShieldCheck },
] as const;

type Tab = (typeof TABS)[number]["value"];

function parseTab(value: string | undefined): Tab | null {
  return value === "DRAFT" || value === "SCHEDULED" || value === "PENDING" ? value : null;
}

/** "Poll", "Question"… for anything that is not a plain post. */
function typeLabel(type: string): string | null {
  if (type === "SIMPLE" || type === "IMAGE" || type === "VIDEO") return null;
  return COMPOSER_TYPES.find((entry) => entry.value === type)?.label ?? null;
}

/**
 * Everything you have written that nobody else can see yet.
 *
 * Drafts, scheduled posts and posts waiting on a host are the same thing from
 * the author's side: written, not live. Drafts are no longer a feature anyone
 * starts (the client removed them from the navigation and the composer), but
 * the ones that exist keep working here, and scheduled and held posts still
 * need somewhere to be seen. The composer links here when there is something
 * to see.
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
  if (!session?.user.id) redirect("/login?callbackUrl=/drafts");

  const counts = await countOwnUnpublished(session.user.id);
  // Open on what there is: a member with one scheduled post and no drafts
  // should not land on an empty Drafts tab.
  const tab =
    parseTab((await searchParams).tab) ??
    TABS.find((item) => counts[item.value] > 0)?.value ??
    "DRAFT";

  const { posts } = await listOwnUnpublished({ userId: session.user.id, status: tab });
  const EmptyIcon = TABS.find((item) => item.value === tab)!.icon;

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Unpublished posts"
          description="Drafts, scheduled posts and posts waiting for a host. Nobody else can see these."
        >
          <TabBar label="Unpublished post state">
            {TABS.map((item) => {
              const active = tab === item.value;
              const Icon = item.icon;
              const count = counts[item.value];
              return (
                <TabLink key={item.value} href={`/drafts?tab=${item.value}`} active={active} scroll>
                  <Icon aria-hidden />
                  {item.label}
                  {count > 0 ? (
                    <span className="text-caption font-normal tabular-nums text-foreground-muted">
                      {count}
                    </span>
                  ) : null}
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
                ? "Drafts you saved earlier show up here until you publish or delete them."
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
                  excerpt: excerptOf(post.body, post.plainText),
                  typeLabel: typeLabel(post.type),
                  scheduledAt: post.scheduledAt ? post.scheduledAt.toISOString() : null,
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
