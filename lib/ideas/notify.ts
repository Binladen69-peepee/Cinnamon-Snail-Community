import "server-only";
import { prisma } from "@/lib/db";
import {
  dispatchNotifications,
  type NotificationDraft,
} from "@/lib/notifications/dispatch";
import type { IdeaStatusValue } from "@/lib/ideas/constants";

/**
 * Who hears about an idea moving (DEC-078).
 *
 * - **The author** hears about every status change, as a REPLIES notification:
 *   the team's answer to their request is a reply to it, and it follows the
 *   member's own "Replies" switch.
 * - **Everyone who voted** hears when the idea is planned and when it is done,
 *   as a HOST_ANNOUNCEMENTS notification: news from the team about something
 *   they asked for. Not for "under review" or "declined", which would be noise
 *   to people who only pressed an arrow.
 *
 * Everything goes through `dispatchNotifications`, so preferences, blocks and
 * "never about your own action" hold here as everywhere. Each notice has a
 * dedupe key per idea and status, so moving an idea back and forth cannot
 * notify anyone about the same status twice.
 */

/** A big idea board still notifies its voters in one bounded batch. */
export const VOTER_FANOUT_CAP = 2000;

function quoted(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  return `“${clean.length > 80 ? `${clean.slice(0, 79).trimEnd()}…` : clean}”`;
}

function withNote(sentence: string, note: string | null): string {
  return note ? `${sentence} ${note}` : sentence;
}

export type StatusNotice = {
  author: { title: string; body: string };
  voters: { title: string; body: string } | null;
};

/** The words for a status change. Pure, so the copy can be tested. */
export function statusNotice(
  status: IdeaStatusValue,
  ideaTitle: string,
  note: string | null,
): StatusNotice {
  const idea = quoted(ideaTitle);
  switch (status) {
    case "PLANNED":
      return {
        author: { title: "Your idea is planned", body: withNote(`${idea} is on the way.`, note) },
        voters: {
          title: "An idea you voted for is planned",
          body: withNote(`${idea} is on the way.`, note),
        },
      };
    case "DONE":
      return {
        author: { title: "Your idea is done", body: withNote(`${idea} is here.`, note) },
        voters: {
          title: "An idea you voted for is done",
          body: withNote(`${idea} is here.`, note),
        },
      };
    case "UNDER_REVIEW":
      return {
        author: {
          title: "Your idea is under review",
          body: withNote(`The team is looking at ${idea}.`, note),
        },
        voters: null,
      };
    case "DECLINED":
      return {
        author: {
          title: "An update on your idea",
          body: withNote(`The team will not be taking on ${idea}.`, note),
        },
        voters: null,
      };
    case "OPEN":
    default:
      return {
        author: {
          title: "Your idea is open again",
          body: withNote(`${idea} is collecting votes again.`, note),
        },
        voters: null,
      };
  }
}

export async function notifyIdeaStatus(input: {
  ideaId: string;
  ideaTitle: string;
  authorId: string;
  actorId: string;
  status: IdeaStatusValue;
  note: string | null;
}): Promise<number> {
  const notice = statusNotice(input.status, input.ideaTitle, input.note);
  const href = `/ideas/${input.ideaId}`;
  const drafts: NotificationDraft[] = [
    {
      userId: input.authorId,
      category: "REPLIES",
      title: notice.author.title,
      body: notice.author.body,
      href,
      actorId: input.actorId,
      dedupeKey: `idea-status:${input.ideaId}:${input.status}`,
    },
  ];

  if (notice.voters) {
    const voters = await prisma.vote.findMany({
      where: {
        postId: input.ideaId,
        value: { gt: 0 },
        userId: { notIn: [input.authorId, input.actorId] },
      },
      orderBy: { createdAt: "desc" },
      take: VOTER_FANOUT_CAP,
      select: { userId: true },
    });
    for (const voter of voters) {
      drafts.push({
        userId: voter.userId,
        category: "HOST_ANNOUNCEMENTS",
        title: notice.voters.title,
        body: notice.voters.body,
        href,
        actorId: input.actorId,
        dedupeKey: `idea-status-voter:${input.ideaId}:${input.status}`,
      });
    }
  }

  const result = await dispatchNotifications(drafts);
  return result.created;
}

/** The duplicate's author, told where their request (and vote) went. */
export async function notifyIdeaMerged(input: {
  sourceId: string;
  sourceTitle: string;
  sourceAuthorId: string;
  targetId: string;
  targetTitle: string;
  actorId: string;
}): Promise<number> {
  const result = await dispatchNotifications([
    {
      userId: input.sourceAuthorId,
      category: "REPLIES",
      title: "Your idea joined another one",
      body: `${quoted(input.sourceTitle)} was asked for already, so it now counts towards ${quoted(input.targetTitle)}. Your vote moved with it.`,
      href: `/ideas/${input.targetId}`,
      actorId: input.actorId,
      dedupeKey: `idea-merged:${input.sourceId}`,
    },
  ]);
  return result.created;
}
