import Link from "next/link";
import { ArrowUpRight, GitMerge, Lightbulb, MessageSquare, Pencil } from "lucide-react";
import {
  Badge,
  Card,
  ChipLink,
  ChipRow,
  EmptyState,
  PageHeader,
  Pager,
  Segmented,
  segmentClass,
} from "@/components/app/ui";
import { IdeaAdminControls } from "@/components/ideas/idea-admin-controls";
import { IdeaCategoryBadge, IdeaStatusBadge } from "@/components/ideas/idea-badges";
import {
  ADMIN_IDEA_FILTERS,
  IDEAS_TITLE,
  adminIdeasHref,
  parseAdminIdeaFilter,
  parseAdminIdeaSort,
  parsePage,
  type AdminIdeaFilter,
} from "@/lib/ideas/constants";
import { listIdeasForStaff } from "@/lib/ideas/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: IDEAS_TITLE };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const EMPTY: Record<AdminIdeaFilter, { title: string; description: string }> = {
  open: {
    title: "Nothing new to look at",
    description: "When a member shares an idea it lands here, most-voted first.",
  },
  "under-review": {
    title: "Nothing under review",
    description: "Move an open idea here while the team weighs it up.",
  },
  planned: {
    title: "Nothing planned",
    description: "Ideas you mark as planned show here, and their voters are told.",
  },
  done: { title: "Nothing done yet", description: "Ideas you ship and mark as done show here." },
  declined: { title: "Nothing declined", description: "Declined ideas keep their votes and show here." },
  merged: {
    title: "No merged duplicates",
    description: "When you fold a duplicate into the original, it is listed here.",
  },
  removed: {
    title: "Nothing taken down",
    description: "Ideas taken off the board, here or from a report, are kept here.",
  },
  all: { title: "No ideas yet", description: "Members' ideas will appear here as they come in." },
};

/**
 * Ideas & Requests, for staff (DEC-078).
 *
 * The board as the team works it: every idea by status, most-voted first,
 * with the three decisions that matter — where it is (with a note members
 * see), whether it duplicates another (merge, which moves the votes), and
 * whether it should be on the board at all.
 */
export default async function AdminIdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const filter = parseAdminIdeaFilter(params.filter);
  const sort = parseAdminIdeaSort(params.sort);
  const page = parsePage(params.page);
  const data = await listIdeasForStaff({ filter, sort, page });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={IDEAS_TITLE}
        description="What members are asking for, most-voted first. Move an idea along with a note they will see, fold a duplicate into the original, or take something off the board."
        actions={
          <Link
            href="/ideas"
            className="inline-flex items-center gap-1 text-label font-medium text-link no-underline hover:underline"
          >
            Open the board
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ChipRow label="Filter ideas" className="min-w-0">
            {ADMIN_IDEA_FILTERS.map((option) => (
              <ChipLink
                key={option.value}
                href={adminIdeasHref({ filter: option.value, sort })}
                active={option.value === filter}
              >
                {option.label}
                <span className="tabular-nums opacity-70">{data.counts[option.value]}</span>
              </ChipLink>
            ))}
          </ChipRow>
          <Segmented label="Order" className="shrink-0 self-start sm:self-auto">
            <Link
              href={adminIdeasHref({ filter, sort: "votes" })}
              aria-current={sort === "votes" ? "page" : undefined}
              className={segmentClass(sort === "votes", "h-7 px-2.5")}
            >
              Most votes
            </Link>
            <Link
              href={adminIdeasHref({ filter, sort: "new" })}
              aria-current={sort === "new" ? "page" : undefined}
              className={segmentClass(sort === "new", "h-7 px-2.5")}
            >
              Newest
            </Link>
          </Segmented>
        </div>
      </PageHeader>

      <Card padding="none">
        {data.rows.length === 0 ? (
          <EmptyState
            bordered={false}
            icon={<Lightbulb />}
            title={EMPTY[filter].title}
            description={EMPTY[filter].description}
          />
        ) : (
          <ul className="divide-y divide-separator">
            {data.rows.map((idea) => (
              <li key={idea.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="flex w-12 shrink-0 flex-col items-center rounded-ctl bg-surface-muted py-1.5 text-center">
                    <span className="text-title font-semibold leading-none tabular-nums text-foreground">
                      {idea.score}
                    </span>
                    <span className="mt-0.5 text-micro font-medium text-foreground-muted">
                      {idea.score === 1 ? "vote" : "votes"}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <IdeaStatusBadge status={idea.status} />
                      <IdeaCategoryBadge category={idea.category} />
                      {idea.mergedInto ? (
                        <Badge tone="neutral" icon={<GitMerge aria-hidden />}>
                          Merged
                        </Badge>
                      ) : null}
                      {idea.visibility !== "PUBLISHED" ? (
                        <Badge tone="danger">Off the board</Badge>
                      ) : null}
                    </div>
                    <h2 className="mt-1.5 text-body font-semibold leading-snug text-foreground wrap-break-word">
                      <Link
                        href={`/ideas/${idea.id}`}
                        className="no-underline transition hover:text-brand-strong"
                      >
                        {idea.title}
                      </Link>
                    </h2>
                    {idea.excerpt ? (
                      <p className="mt-0.5 line-clamp-2 text-label text-foreground-muted">
                        {idea.excerpt}
                      </p>
                    ) : null}
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-foreground-muted">
                      <span>
                        by{" "}
                        <Link
                          href={`/members/${idea.author.handle}`}
                          className="font-medium text-foreground no-underline hover:underline"
                        >
                          {idea.author.name}
                        </Link>
                      </span>
                      <time dateTime={idea.publishedAt.toISOString()} className="tabular-nums">
                        {dateFormat.format(idea.publishedAt)}
                      </time>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <MessageSquare className="size-3" aria-hidden />
                        {idea.commentCount}
                        <span className="sr-only">
                          {idea.commentCount === 1 ? "reply" : "replies"}
                        </span>
                      </span>
                      <Link
                        href={`/ideas/${idea.id}/edit`}
                        className="inline-flex items-center gap-1 font-medium text-link no-underline hover:underline"
                      >
                        <Pencil className="size-3" aria-hidden />
                        Edit wording
                      </Link>
                    </p>
                    {idea.mergedInto ? (
                      <p className="mt-1.5 text-label text-foreground-muted">
                        Merged into{" "}
                        <Link
                          href={`/ideas/${idea.mergedInto.id}`}
                          className="font-medium text-link no-underline hover:underline"
                        >
                          {idea.mergedInto.title}
                        </Link>
                      </p>
                    ) : null}
                    {idea.statusNote ? (
                      <p className="mt-2 rounded-ctl bg-surface-muted px-3 py-2 text-label text-foreground wrap-break-word">
                        {idea.statusNote}
                        {idea.statusUpdatedAt ? (
                          <span className="ml-1.5 text-caption text-foreground-muted">
                            · {dateFormat.format(idea.statusUpdatedAt)}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </div>
                <IdeaAdminControls
                  idea={{
                    id: idea.id,
                    title: idea.title,
                    status: idea.status,
                    statusNote: idea.statusNote,
                    merged: idea.mergedInto !== null,
                    removed: idea.visibility !== "PUBLISHED",
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.pageCount > 1 ? (
        <Pager
          label="Idea pages"
          prevHref={data.page > 1 ? adminIdeasHref({ filter, sort, page: data.page - 1 }) : null}
          nextHref={
            data.page < data.pageCount
              ? adminIdeasHref({ filter, sort, page: data.page + 1 })
              : null
          }
          summary={`Page ${data.page} of ${data.pageCount} · ${data.total} ideas`}
        />
      ) : null}
    </div>
  );
}
