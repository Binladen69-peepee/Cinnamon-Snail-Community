import "server-only";
import type { PostStatus, ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveMemberAvatar } from "@/lib/community/member-avatars";

/**
 * The moderation queue.
 *
 * The `Report` table and its OPEN -> REVIEWING -> RESOLVED/DISMISSED workflow
 * have existed since phase one, and members can file reports from a post menu
 * and from a message. Until now nothing rendered them: reports went into the
 * database and no screen in the product could show one.
 *
 * A report carries what was reported, not a copy of it, so the excerpt is read
 * live. If the post or message has since been deleted the row still appears --
 * saying so -- because "the thing you reported is gone" is an outcome a
 * moderator needs, and a queue that silently drops rows teaches nobody.
 */

export const REPORT_FILTERS = ["open", "reviewing", "resolved", "all"] as const;
export type ReportFilter = (typeof REPORT_FILTERS)[number];

export function parseReportFilter(value: string | string[] | undefined): ReportFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return REPORT_FILTERS.includes(raw as ReportFilter) ? (raw as ReportFilter) : "open";
}

export type ReportRow = {
  id: string;
  status: ReportStatus;
  reason: string;
  details: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  reporter: { handle: string; name: string; avatarUrl: string | null } | null;
  subject: { handle: string; name: string; id: string } | null;
  /** What was reported, and whether it still exists. */
  target:
    | { kind: "post"; id: string; excerpt: string; href: string }
    | { kind: "message"; id: string; excerpt: string; href: null }
    | { kind: "member" }
    | { kind: "gone" };
};

export type ModerationData = {
  rows: ReportRow[];
  counts: Record<"open" | "reviewing" | "resolved" | "all", number>;
  filter: ReportFilter;
};

function statusWhere(filter: ReportFilter) {
  if (filter === "open") return { status: "OPEN" as const };
  if (filter === "reviewing") return { status: "REVIEWING" as const };
  if (filter === "resolved") {
    return { status: { in: ["RESOLVED", "DISMISSED"] as ReportStatus[] } };
  }
  return {};
}

function excerpt(value: string | null | undefined, limit = 160): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "(no text)";
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export async function loadModeration(input: {
  filter: ReportFilter;
}): Promise<ModerationData> {
  const [rows, open, reviewing, resolved, all] = await Promise.all([
    prisma.report.findMany({
      where: statusWhere(input.filter),
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        status: true,
        reason: true,
        details: true,
        createdAt: true,
        resolvedAt: true,
        postId: true,
        messageId: true,
        reporter: {
          select: {
            handle: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
        subjectUser: {
          select: {
            id: true,
            handle: true,
            profile: { select: { displayName: true } },
          },
        },
        post: {
          select: { id: true, plainText: true, title: true, status: true },
        },
        message: { select: { id: true, body: true, deletedAt: true } },
      },
    }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.report.count({ where: { status: "REVIEWING" } }),
    prisma.report.count({ where: { status: { in: ["RESOLVED", "DISMISSED"] } } }),
    prisma.report.count(),
  ]);

  return {
    filter: input.filter,
    counts: { open, reviewing, resolved, all },
    rows: rows.map((report) => ({
      id: report.id,
      status: report.status,
      reason: report.reason,
      details: report.details,
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt,
      reporter: report.reporter
        ? {
            handle: report.reporter.handle,
            name: report.reporter.profile?.displayName ?? report.reporter.handle,
            avatarUrl: resolveMemberAvatar(
              report.reporter.handle,
              report.reporter.profile?.avatarUrl,
              report.reporter.profile?.displayName,
            ),
          }
        : null,
      subject: report.subjectUser
        ? {
            id: report.subjectUser.id,
            handle: report.subjectUser.handle,
            name:
              report.subjectUser.profile?.displayName ?? report.subjectUser.handle,
          }
        : null,
      target: resolveTarget(report),
    })),
  };
}

function resolveTarget(report: {
  postId: string | null;
  messageId: string | null;
  post: {
    id: string;
    plainText: string | null;
    title: string | null;
    status: PostStatus;
  } | null;
  message: { id: string; body: string; deletedAt: Date | null } | null;
}): ReportRow["target"] {
  if (report.postId) {
    // A post is not deleted by a column here: REMOVED is the moderation
    // outcome and HIDDEN is a host taking it down, and neither should be
    // re-presented to a moderator as live content.
    if (
      !report.post ||
      report.post.status === "REMOVED" ||
      report.post.status === "HIDDEN"
    ) {
      return { kind: "gone" };
    }
    return {
      kind: "post",
      id: report.post.id,
      excerpt: excerpt(report.post.title ?? report.post.plainText),
      href: `/posts/${report.post.id}`,
    };
  }
  if (report.messageId) {
    if (!report.message || report.message.deletedAt) return { kind: "gone" };
    return {
      kind: "message",
      id: report.message.id,
      // Deliberately no link: a moderator reading a report should not be
      // dropped into a private thread they are not a member of.
      excerpt: excerpt(report.message.body),
      href: null,
    };
  }
  return { kind: "member" };
}

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  OPEN: "Open",
  REVIEWING: "Reviewing",
  RESOLVED: "Resolved",
  DISMISSED: "Dismissed",
};
