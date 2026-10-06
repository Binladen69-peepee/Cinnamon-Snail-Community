import { ArrowRight, Pencil } from "lucide-react";
import {
  ButtonLink,
  Callout,
  EmptyState,
  Section,
} from "@/components/app/ui";
import { MemberCard } from "@/components/members/member-card";
import { CLUSTER_META, memberViewHref } from "@/components/members/member-views";
import type { ClusterResult, ClusterView } from "@/lib/community/directory";

/** The grid the full lists and the directory share. */
export const MEMBER_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3";

/**
 * One discovery cluster.
 *
 * On Discover (`preview`) it is a short row with "See all": on a phone the
 * row scrolls sideways, one card and a peek of the next, so four clusters do
 * not become sixteen cards of scrolling; from `sm` up it is a grid. On its own
 * view it is the full list.
 */
export function MemberCluster({
  view,
  result,
  preview = false,
}: {
  view: ClusterView;
  result: ClusterResult | undefined;
  preview?: boolean;
}) {
  const meta = CLUSTER_META[view];
  const Icon = meta.icon;
  const members = result?.ok ? result.members : [];

  return (
    <Section
      title={meta.title}
      description={meta.description}
      icon={<Icon />}
      count={preview || !result?.ok ? undefined : members.length}
      action={
        preview && members.length > 0 ? (
          <ButtonLink href={memberViewHref(view)} variant="ghost" size="sm" className="-mr-2">
            See all
            <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        ) : undefined
      }
    >
      {!result || !result.ok ? (
        <Callout tone="danger" title={`${meta.title} didn’t load`}>
          Something went wrong on our side. Reload the page in a moment.
        </Callout>
      ) : members.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<Icon />}
          title={meta.empty.title}
          description={meta.empty.description}
          action={
            view === "similar" ? (
              <ButtonLink href="/settings" size="sm">
                <Pencil className="size-4" aria-hidden />
                Edit your profile
              </ButtonLink>
            ) : view === "top" ? (
              <ButtonLink href="/kitchen-table" size="sm">
                Go to the Kitchen Table
              </ButtonLink>
            ) : undefined
          }
        />
      ) : preview ? (
        <ul
          aria-label={meta.title}
          className="vu-scroll-x -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4"
        >
          {members.map((member) => (
            <li
              key={member.handle}
              className="w-[min(18rem,85%)] shrink-0 snap-start sm:w-auto"
            >
              <MemberCard member={member} context={view} />
            </li>
          ))}
        </ul>
      ) : (
        <ul aria-label={meta.title} className={MEMBER_GRID}>
          {members.map((member) => (
            <li key={member.handle}>
              <MemberCard member={member} context={view} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
