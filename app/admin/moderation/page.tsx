import Link from "next/link";
import { ExternalLink, Flag, MessageSquare, ShieldCheck, UserRound } from "lucide-react";
import {
  loadModeration,
  parseReportFilter,
  REPORT_STATUS_LABEL,
  type ReportFilter,
} from "@/lib/admin/moderation";
import { Avatar } from "@/components/ui/avatar";
import {
  Badge,
  Card,
  ChipLink,
  ChipRow,
  EmptyState,
  PageHeader,
} from "@/components/app/ui";
import { ReportActions } from "@/components/admin/report-actions";

export const metadata = { title: "Moderation" };

const FILTER_LABEL: Record<ReportFilter, string> = {
  open: "Open",
  reviewing: "Reviewing",
  resolved: "Closed",
  all: "Everything",
};

/**
 * The moderation queue.
 *
 * Reports have been fileable since phase one and nothing has ever displayed
 * one. This is that screen: what was reported, who reported it, who it is
 * about, and the four things a moderator can do about it.
 *
 * Rows rather than a table. A report is a paragraph of context plus a decision
 * — a row of cells would either truncate the thing being judged or push the
 * actions off the side.
 */
export default async function AdminModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = parseReportFilter(params.filter);
  const data = await loadModeration({ filter });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Moderation"
        description={
          data.counts.open > 0
            ? `${data.counts.open} unread, ${data.counts.reviewing} being looked at.`
            : "Nothing is waiting to be read."
        }
      >
        <ChipRow label="Filter reports">
          {(Object.keys(FILTER_LABEL) as ReportFilter[]).map((option) => (
            <ChipLink
              key={option}
              href={option === "open" ? "/admin/moderation" : `/admin/moderation?filter=${option}`}
              active={option === filter}
            >
              {FILTER_LABEL[option]}
              <span className="tabular-nums opacity-70">
                {data.counts[option === "resolved" ? "resolved" : option]}
              </span>
            </ChipLink>
          ))}
        </ChipRow>
      </PageHeader>

      <Card padding="none">
        {data.rows.length === 0 ? (
          <EmptyState
            bordered={false}
            icon={<ShieldCheck />}
            title={filter === "open" ? "Nothing to review" : "No reports here"}
            description={
              filter === "open"
                ? "When a member reports a post, a message or another member, it lands here."
                : "Try another filter — closed reports are kept rather than deleted."
            }
          />
        ) : (
          <ul className="divide-y divide-separator">
            {data.rows.map((report) => (
              <li key={report.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge
                      tone={
                        report.status === "OPEN"
                          ? "danger"
                          : report.status === "REVIEWING"
                            ? "warning"
                            : "neutral"
                      }
                      icon={<Flag aria-hidden />}
                    >
                      {REPORT_STATUS_LABEL[report.status]}
                    </Badge>
                    <span className="truncate text-body font-semibold text-foreground">
                      {report.reason}
                    </span>
                  </div>
                  <time
                    dateTime={report.createdAt.toISOString()}
                    className="shrink-0 text-caption tabular-nums text-foreground-muted"
                  >
                    {report.createdAt.toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>

                {report.details ? (
                  <p className="text-body leading-snug text-foreground-muted">
                    {report.details}
                  </p>
                ) : null}

                <div className="rounded-ctl bg-surface-muted px-3 py-2.5">
                  {report.target.kind === "gone" ? (
                    <p className="text-label italic text-foreground-muted">
                      The reported content has already been taken down.
                    </p>
                  ) : report.target.kind === "member" ? (
                    <p className="flex items-center gap-1.5 text-label text-foreground-muted">
                      <UserRound className="size-4 shrink-0" aria-hidden />
                      A report about the member, not about one piece of content.
                    </p>
                  ) : (
                    <>
                      <p className="flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                        {report.target.kind === "post" ? (
                          <Flag className="size-3" aria-hidden />
                        ) : (
                          <MessageSquare className="size-3" aria-hidden />
                        )}
                        {report.target.kind === "post" ? "Post" : "Direct message"}
                      </p>
                      <p className="mt-1 text-body leading-snug text-foreground">
                        {report.target.excerpt}
                      </p>
                      {report.target.kind === "post" ? (
                        <Link
                          href={report.target.href}
                          className="mt-1.5 inline-flex items-center gap-1 text-label font-medium text-link no-underline hover:underline"
                        >
                          Open the post
                          <ExternalLink className="size-3.5" aria-hidden />
                        </Link>
                      ) : (
                        <p className="mt-1.5 text-caption italic text-foreground-muted">
                          Private thread — not linked from here.
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-label text-foreground-muted">
                    {report.reporter ? (
                      <span className="flex items-center gap-1.5">
                        <Avatar
                          name={report.reporter.name}
                          src={report.reporter.avatarUrl}
                          size="xs"
                        />
                        Reported by{" "}
                        <Link
                          href={`/members/${report.reporter.handle}`}
                          className="font-medium text-foreground no-underline hover:underline"
                        >
                          {report.reporter.name}
                        </Link>
                      </span>
                    ) : null}
                    {report.subject ? (
                      <span>
                        About{" "}
                        <Link
                          href={`/admin/members/${report.subject.id}`}
                          className="font-medium text-foreground no-underline hover:underline"
                        >
                          {report.subject.name}
                        </Link>
                      </span>
                    ) : null}
                  </div>

                  <ReportActions
                    reportId={report.id}
                    status={report.status}
                    postId={report.target.kind === "post" ? report.target.id : null}
                    subject={report.subject}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
