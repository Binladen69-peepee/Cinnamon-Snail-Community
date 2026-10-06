import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Archive, LogOut, MessageSquare, Plus, Users } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { loadCrewPage, type CrewPageData } from "@/lib/crews/views";
import { CREW_KIND_LABEL, crewRuleSentence } from "@/lib/crews/labels";
import { AppShell } from "@/components/app/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { PendingButton } from "@/components/ui/pending-button";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pager,
  Section,
  buttonClass,
} from "@/components/app/ui";
import { CrewIcon } from "@/components/crews/crew-icon";
import { crewMessage } from "@/components/crews/crew-messages";
import { joinCrewAction, leaveCrewAction, openCrewChatAction } from "../actions";

export const dynamic = "force-dynamic";

type Params = { slug: string };
type Search = { error?: string; joined?: string; left?: string; page?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const crew = await prisma.crew
    .findUnique({ where: { slug }, select: { name: true } })
    .catch(() => null);
  return { title: crew?.name ?? "Crew" };
}

/**
 * One crew (DEC-078): what it is, why the viewer is in it, the way into its
 * group chat, and who else is in it.
 *
 * The member list respects the same rules as the directory (members who hide
 * themselves, and blocks either way, are not named), and for the automatic
 * crews it is only shown to the people in the crew.
 */
export default async function CrewPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user.id) redirect(`/login?callbackUrl=/crews/${encodeURIComponent(slug)}`);
  const query = await searchParams;
  const staff = session.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN");

  let data: CrewPageData | null = null;
  let failed = false;
  try {
    data = await loadCrewPage({
      slug,
      viewerId: session.user.id,
      staff,
      page: Number(query.page) || 1,
    });
  } catch (cause) {
    console.error("[crews] crew page failed", cause);
    failed = true;
  }

  if (failed) {
    return (
      <AppShell>
        <ErrorState
          title="This crew didn’t load"
          description="Something went wrong on our side. Reload the page in a moment."
          action={<ButtonLink href={`/crews/${slug}`}>Reload</ButtonLink>}
        />
      </AppShell>
    );
  }
  if (!data) notFound();

  const { crew } = data;
  const notice = crewMessage(query);
  const optional = crew.kind === "OPTIONAL";
  const canChat = data.joined !== null && (!crew.archived || data.inChat);
  const canJoin = optional && data.joined === null && !crew.archived;

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-6">
          <PageHeader
            back={{ href: "/crews", label: "Crews" }}
            eyebrow={`${CREW_KIND_LABEL[crew.kind]} crew`}
            title={crew.name}
            description={crew.description ?? undefined}
            actions={
              // A member opens the chat; anyone else may join an opt-in crew.
              canChat ? (
                <form action={openCrewChatAction}>
                  <input type="hidden" name="slug" value={crew.slug} />
                  <PendingButton className={buttonClass({ variant: "primary" })}>
                    <MessageSquare className="size-4" aria-hidden />
                    Open crew chat
                  </PendingButton>
                </form>
              ) : canJoin ? (
                <form action={joinCrewAction}>
                  <input type="hidden" name="slug" value={crew.slug} />
                  <PendingButton className={buttonClass({ variant: "primary" })}>
                    <Plus className="size-4" aria-hidden />
                    Join crew
                  </PendingButton>
                </form>
              ) : undefined
            }
          />

          {notice ? (
            <Callout tone={notice.tone} role={notice.tone === "danger" ? "alert" : "status"}>
              {notice.text}
            </Callout>
          ) : null}

          {crew.archived ? (
            <Callout tone="neutral" icon={<Archive />} title="This crew has been archived.">
              Nobody new joins an archived crew (a roadmap crew is archived when its roadmap is
              retired). Its chat stays readable for the people who were in it.
            </Callout>
          ) : null}

          <Card>
            <div className="flex items-start gap-3">
              <CrewIcon kind={crew.kind} />
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold text-foreground tabular-nums">
                  {crew.memberCount} {crew.memberCount === 1 ? "member" : "members"}
                </p>
                {data.reason ? (
                  <p className="mt-0.5 text-body text-foreground text-pretty">{data.reason}</p>
                ) : null}
                <p className="mt-1 text-label text-foreground-muted text-pretty">
                  {crewRuleSentence(crew.kind)}
                </p>
                {canJoin ? (
                  <p className="mt-2 text-caption text-foreground-muted">
                    Other members can see who is in this crew.
                  </p>
                ) : null}
              </div>
            </div>
            {data.joined === "OPT_IN" ? (
              <form
                action={leaveCrewAction}
                className="mt-4 flex justify-end border-t border-separator pt-3"
              >
                <input type="hidden" name="slug" value={crew.slug} />
                <PendingButton className={buttonClass({ variant: "ghost", size: "sm" })}>
                  <LogOut className="size-3.5" aria-hidden />
                  Leave crew
                </PendingButton>
              </form>
            ) : null}
          </Card>
        </div>

        <Section title="Members" icon={<Users />} count={data.canSeeMembers ? data.visibleCount : undefined}>
          {!data.canSeeMembers ? (
            <EmptyState
              size="sm"
              icon={<Users />}
              title="Only this crew sees who’s in it"
              description="Members are placed in this crew automatically, so its list is kept to the people in it."
            />
          ) : data.members.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<Users />}
              title="Nobody to show yet"
              description={
                data.privateCount > 0
                  ? "Nobody in this crew is shown here, by their privacy settings or yours."
                  : "Be the first: join, then say hello in the chat."
              }
            />
          ) : (
            <>
              <Card padding="none">
                <ul className="divide-y divide-separator">
                  {data.members.map((member) => (
                    <li key={member.userId}>
                      <Link
                        href={`/members/${member.handle}`}
                        className="flex items-center gap-3 px-4 py-3 no-underline transition hover:bg-surface-muted sm:px-5"
                      >
                        <Avatar name={member.name} src={member.avatarUrl} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body font-semibold text-foreground">
                            {member.name}
                          </span>
                          <span className="block truncate text-caption text-foreground-muted">
                            @{member.handle}
                            {member.city ? ` · ${member.city}` : ""}
                          </span>
                        </span>
                        {member.isViewer ? <Badge tone="brand">You</Badge> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
              {data.pageCount > 1 ? (
                <Pager
                  label="Crew member pages"
                  prevHref={data.page > 1 ? `/crews/${crew.slug}?page=${data.page - 1}` : null}
                  nextHref={
                    data.page < data.pageCount ? `/crews/${crew.slug}?page=${data.page + 1}` : null
                  }
                  summary={`Page ${data.page} of ${data.pageCount}`}
                />
              ) : null}
              {data.privateCount > 0 ? (
                <p className="text-caption text-foreground-muted">
                  {data.privateCount} more {data.privateCount === 1 ? "member isn’t" : "members aren’t"}{" "}
                  shown here, by their privacy settings or yours.
                </p>
              ) : null}
            </>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
