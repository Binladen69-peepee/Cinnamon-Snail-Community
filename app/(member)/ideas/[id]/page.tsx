import Link from "next/link";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, GitMerge, Lock } from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app/app-shell";
import { ButtonLink, Callout, Card } from "@/components/app/ui";
import { RichText } from "@/components/content/rich-text";
import { CommentComposer } from "@/components/feed/comment-composer";
import { Conversation } from "@/components/feed/conversation";
import { IdeaActions } from "@/components/ideas/idea-actions";
import {
  IdeaCategoryBadge,
  IdeaMergedBadge,
  IdeaStatusBadge,
} from "@/components/ideas/idea-badges";
import { IdeaReplySort } from "@/components/ideas/idea-reply-sort";
import { IdeaVoteButton } from "@/components/ideas/idea-vote-button";
import { IdeasRail } from "@/components/ideas/ideas-rail";
import { Avatar } from "@/components/ui/avatar";
import { formatShortTime } from "@/lib/community/format-count";
import { getPostConversation } from "@/lib/community/post-detail";
import { parseCommentSort } from "@/lib/community/sort";
import { IDEA_STATUSES, IDEAS_TITLE } from "@/lib/ideas/constants";
import { getIdeaDetail, listPlannedIdeas } from "@/lib/ideas/queries";
import { VOTE_BLOCK_MESSAGES } from "@/lib/ideas/rules";

export const dynamic = "force-dynamic";

/** One read per request, shared by the metadata and the page. */
const loadIdea = cache((viewerId: string, ideaId: string) => getIdeaDetail(viewerId, ideaId));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  const idea = session?.user.id ? await loadIdea(session.user.id, id) : null;
  return { title: idea ? `${idea.title} · ${IDEAS_TITLE}` : IDEAS_TITLE };
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Top-level replies per "show more", and the most one page will draw. */
const ROOTS_STEP = 20;
const ROOTS_MAX = 200;

function parseRoots(value: string | undefined): number {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= ROOTS_STEP) return ROOTS_STEP;
  return Math.min(Math.ceil(raw / ROOTS_STEP) * ROOTS_STEP, ROOTS_MAX);
}

function parseFocus(value: string | undefined): string | null {
  return value && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

/**
 * One idea: the request and its vote, where the team has put it and what they
 * said, and the conversation. The conversation is the feed's own thread and
 * reply box, so replying to an idea is replying to a post, with the same
 * notifications, moderation and anchors (`#comment-<id>`).
 */
export default async function IdeaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; comment?: string; roots?: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/ideas/${id}`)}`);

  const query = await searchParams;
  const sort = parseCommentSort(query.sort);
  const roots = parseRoots(query.roots);
  const idea = await loadIdea(session.user.id, id);
  // Not found and not allowed are one answer, as for any post.
  if (!idea) notFound();

  const [conversation, planned] = await Promise.all([
    // `?comment=` is a link into one reply (C4): its thread is always drawn.
    getPostConversation(session.user.id, idea.id, sort, {
      focusId: parseFocus(query.comment),
      roots,
    }),
    listPlannedIdeas(session.user.id, 5),
  ]);

  const viewer = {
    name: session.user.name || session.user.handle,
    avatar: session.user.image ?? null,
  };
  const live = idea.visibility === "PUBLISHED";
  const merged = idea.mergedInto !== null;
  const showStatus =
    merged ||
    idea.status !== "OPEN" ||
    Boolean(idea.statusNote) ||
    Boolean(idea.statusUpdatedAt);
  const voteLine = !live
    ? "Voting is closed while this idea is off the board."
    : idea.voteBlock
      ? VOTE_BLOCK_MESSAGES[idea.voteBlock]
      : "One vote per member. Press again to take yours back.";

  return (
    <AppShell rail={<IdeasRail planned={planned.filter((item) => item.id !== idea.id)} />}>
      <div className="flex flex-col gap-4">
        <Link
          href="/ideas"
          className="-ml-1 inline-flex w-fit items-center gap-1 rounded-ctl px-1 text-label font-medium text-foreground-muted no-underline transition hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {IDEAS_TITLE}
        </Link>

        {!live ? (
          <Callout tone="warning" title="This idea is off the board">
            A moderator took it down, so only {idea.isAuthor ? "you" : "its author"} and the team
            can see it.
          </Callout>
        ) : null}

        {merged && idea.mergedInto ? (
          <Callout tone="info" icon={<GitMerge />} title="Merged into another idea">
            Someone had asked for this already, so the votes moved to{" "}
            {idea.mergedInto.live ? (
              <Link
                href={`/ideas/${idea.mergedInto.id}`}
                className="font-medium text-link no-underline hover:underline"
              >
                {idea.mergedInto.title}
              </Link>
            ) : (
              "an idea that has since come down"
            )}
            . Vote and reply there.
          </Callout>
        ) : null}

        <Card as="article" padding="none" aria-labelledby="idea-title">
          <div className="flex gap-3 p-4 sm:gap-4 sm:p-5">
            <IdeaVoteButton
              ideaId={idea.id}
              title={idea.title}
              score={idea.score}
              voted={idea.voted}
              block={idea.voteBlock}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {merged ? <IdeaMergedBadge /> : <IdeaStatusBadge status={idea.status} />}
                <IdeaCategoryBadge category={idea.category} />
              </div>
              <h1
                id="idea-title"
                className="mt-2 text-heading font-semibold leading-snug tracking-[-0.01em] text-foreground text-balance wrap-break-word"
              >
                {idea.title}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-foreground-muted">
                <Avatar
                  name={idea.author.name}
                  src={idea.author.avatarUrl}
                  size="xs"
                  className="size-5"
                />
                <Link
                  href={`/members/${idea.author.handle}`}
                  className="font-medium text-foreground no-underline hover:underline"
                >
                  {idea.author.name}
                </Link>
                <span aria-hidden>·</span>
                <time
                  dateTime={idea.publishedAt.toISOString()}
                  title={dateFormat.format(idea.publishedAt)}
                  className="tabular-nums"
                >
                  {formatShortTime(idea.publishedAt)}
                </time>
                {idea.editedAt ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>edited</span>
                  </>
                ) : null}
              </p>
              {idea.body ? (
                <RichText
                  body={idea.body}
                  className="mt-3 text-reading leading-relaxed text-foreground"
                />
              ) : null}
            </div>
          </div>

          {showStatus ? (
            <section
              aria-labelledby="idea-status"
              className="border-t border-separator px-4 py-3.5 sm:px-5"
            >
              <h2
                id="idea-status"
                className="text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted"
              >
                From the team
              </h2>
              <p className="mt-1 text-body text-foreground">
                <span className="font-semibold">
                  {merged ? "Merged." : `${IDEA_STATUSES[idea.status].label}.`}
                </span>{" "}
                <span className="text-foreground-muted">
                  {merged
                    ? "Its votes now count towards the original."
                    : IDEA_STATUSES[idea.status].description}
                </span>
              </p>
              {idea.statusNote ? (
                <p className="mt-2.5 rounded-ctl bg-surface-muted px-3 py-2.5 text-body leading-relaxed text-foreground wrap-break-word">
                  {idea.statusNote}
                </p>
              ) : null}
              {idea.statusUpdatedAt ? (
                <p className="mt-1.5 text-caption text-foreground-muted">
                  Updated {dateFormat.format(idea.statusUpdatedAt)}
                  {idea.statusUpdatedBy ? ` by ${idea.statusUpdatedBy}` : ""}
                </p>
              ) : null}
            </section>
          ) : null}

          {idea.mergedFrom.length > 0 ? (
            <section
              aria-label="Also asked as"
              className="border-t border-separator px-4 py-3.5 sm:px-5"
            >
              <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                Also asked as
              </h2>
              <ul className="mt-1.5 flex flex-col gap-1">
                {idea.mergedFrom.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/ideas/${item.id}`}
                      className="inline-flex items-center gap-1.5 text-label text-link no-underline hover:underline"
                    >
                      <GitMerge className="size-3.5 shrink-0" aria-hidden />
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-separator px-3 py-2 sm:px-4">
            <p className="px-1 text-caption text-foreground-muted">{voteLine}</p>
            <IdeaActions
              ideaId={idea.id}
              title={idea.title}
              canReport={live && !idea.isAuthor}
              canEdit={idea.canEdit}
              canWithdraw={idea.canWithdraw}
            />
          </div>
        </Card>

        <Card padding="none" className="divide-y divide-separator">
          <div className="px-4 py-4 sm:px-5">
            {live && !merged ? (
              <CommentComposer postId={idea.id} viewer={viewer} joined />
            ) : (
              <p className="flex items-center gap-2 text-body text-foreground-muted">
                <Lock className="size-4 shrink-0" aria-hidden />
                {merged
                  ? "Replies continue on the idea this was merged into."
                  : "Replies are closed while this idea is off the board."}
              </p>
            )}
          </div>
          <div className="px-4 py-3 sm:px-5">
            <IdeaReplySort ideaId={idea.id} current={sort} count={conversation.count} />
          </div>
          <div className="px-4 py-5 sm:px-5">
            <Conversation comments={conversation.comments} postId={idea.id} viewer={viewer} />
            {conversation.hasMore && roots < ROOTS_MAX ? (
              <div className="mt-5 flex justify-center">
                <ButtonLink
                  href={`/ideas/${idea.id}?sort=${sort}&roots=${roots + ROOTS_STEP}#replies`}
                  size="sm"
                  scroll={false}
                >
                  Show more replies
                </ButtonLink>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
