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
  ChipLink,
  EmptyPanel,
  PageHeader,
  Panel,
} from "@/components/admin/ui";
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
 * Cards rather than a table. A report is a paragraph of context plus a decision
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
    <div className="space-y-4">
      <PageHeader
        title="Moderation"
        subtitle={
          data.counts.open > 0
            ? `${data.counts.open} unread, ${data.counts.reviewing} being looked at.`
            : "Nothing is waiting to be read."
        }
      />

      <ul className="flex flex-wrap gap-1.5">
        {(Object.keys(FILTER_LABEL) as ReportFilter[]).map((option) => (
          <li key={option}>
            <ChipLink
              href={option === "open" ? "/admin/moderation" : `/admin/moderation?filter=${option}`}
              active={option === filter}
            >
              {FILTER_LABEL[option]}
              <span className="ml-1.5 tabular-nums opacity-70">
                {data.counts[option === "resolved" ? "resolved" : option]}
              </span>
            </ChipLink>
          </li>
        ))}
      </ul>

      {data.rows.length === 0 ? (
        <Panel>
          <EmptyPanel
            icon={<ShieldCheck className="size-6" aria-hidden />}
            title={filter === "open" ? "Nothing to review" : "No reports here"}
            body={
              filter === "open"
                ? "When a member reports a post, a message or another member, it lands here."
                : "Try another filter — closed reports are kept rather than deleted."
            }
          />
        </Panel>
      ) : (
        <ul className="space-y-3">
          {data.rows.map((report) => (
            <li key={report.id}>
              <Panel className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge
                      tone={
                        report.status === "OPEN"
                          ? "bad"
                          : report.status === "REVIEWING"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      <Flag className="size-3" aria-hidden />
                      {REPORT_STATUS_LABEL[report.status]}
                    </Badge>
                    <span className="truncate text-[13.5px] font-bold text-foreground">
                      {report.reason}
                    </span>
                  </div>
                  <time
                    dateTime={report.createdAt.toISOString()}
                    className="shrink-0 text-[11.5px] tabular-nums text-foreground-muted"
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
                  <p className="mt-2 text-[13px] leading-snug text-foreground-muted">
                    {report.details}
                  </p>
                ) : null}

                <div className="mt-3 rounded-ctl border border-border bg-background p-3">
                  {report.target.kind === "gone" ? (
                    <p className="text-[12.5px] italic text-foreground-muted">
                      The reported content has already been taken down.
                    </p>
                  ) : report.target.kind === "member" ? (
                    <p className="flex items-center gap-1.5 text-[12.5px] text-foreground-muted">
                      <UserRound className="size-3.5 shrink-0" aria-hidden />
                      A report about the member, not about one piece of content.
                    </p>
                  ) : (
                    <>
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-foreground-muted">
                        {report.target.kind === "post" ? (
                          <Flag className="size-3" aria-hidden />
                        ) : (
                          <MessageSquare className="size-3" aria-hidden />
                        )}
                        {report.target.kind === "post" ? "Post" : "Direct message"}
                      </p>
                      <p className="mt-1 text-[13px] leading-snug text-foreground">
                        {report.target.excerpt}
                      </p>
                      {report.target.kind === "post" ? (
                        <Link
                          href={report.target.href}
                          className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand no-underline hover:underline"
                        >
                          Open the post
                          <ExternalLink className="size-3" aria-hidden />
                        </Link>
                      ) : (
                        <p className="mt-1.5 text-[11.5px] italic text-foreground-muted">
                          Private thread — not linked from here.
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-foreground-muted">
                  {report.reporter ? (
                    <span className="flex items-center gap-1.5">
                      <Avatar
                        name={report.reporter.name}
                        src={report.reporter.avatarUrl}
                        size="sm"
                        className="size-6 text-[9px]"
                      />
                      Reported by{" "}
                      <Link
                        href={`/members/${report.reporter.handle}`}
                        className="font-semibold text-foreground no-underline hover:underline"
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
                        className="font-semibold text-foreground no-underline hover:underline"
                      >
                        {report.subject.name}
                      </Link>
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 border-t border-separator pt-3">
                  <ReportActions
                    reportId={report.id}
                    status={report.status}
                    postId={report.target.kind === "post" ? report.target.id : null}
                    subject={report.subject}
                  />
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
