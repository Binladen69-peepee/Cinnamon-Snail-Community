import Link from "next/link";
import { ExternalLink, Globe, Lock, Pin, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  SPACE_KIND_BLURB,
  SPACE_KIND_LABEL,
  SPACE_VISIBILITY_LABEL,
} from "@/lib/spaces/kinds";
import type { SpaceKind, SpaceVisibility } from "@/lib/spaces";

export type SpaceResource = {
  id: string;
  label: string;
  url: string;
  description: string | null;
};

/**
 * The rail beside a space: what this room is, and what it keeps to hand.
 *
 * Pinned resources live here rather than above the feed, which is where the
 * previous build put them. Above the feed they pushed the first post down on
 * every visit; in the rail they stay reachable without costing the reader
 * anything. On phones the rail is absent, so the space page renders them
 * inline instead — see `PinnedResources`.
 */
export function SpaceRail({
  space,
  resources,
  members,
}: {
  space: {
    name: string;
    description: string | null;
    kind: SpaceKind;
    visibility: SpaceVisibility;
    postingPermission: string;
    _count: { memberships: number; posts: number };
  };
  resources: SpaceResource[];
  members: {
    handle: string;
    role: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  }[];
}) {
  const VisibilityIcon = space.visibility === "PRIVATE" ? Lock : Globe;

  return (
    <div className="space-y-2.5">
      <Panel title={`About ${space.name}`}>
        <p className="text-[13px] leading-relaxed text-foreground-muted">
          {space.description ?? SPACE_KIND_BLURB[space.kind]}
        </p>

        <dl className="mt-3 space-y-1.5 text-[12.5px]">
          <Row label="Kind" value={SPACE_KIND_LABEL[space.kind]} />
          <Row
            label="Visibility"
            value={SPACE_VISIBILITY_LABEL[space.visibility]}
            icon={<VisibilityIcon className="size-3" aria-hidden />}
          />
          <Row
            label="Who can post"
            value={
              space.postingPermission === "HOSTS_ONLY"
                ? "Hosts only"
                : space.postingPermission === "APPROVAL_REQUIRED"
                  ? "With approval"
                  : "Any member"
            }
          />
          <Row
            label="Members"
            value={String(space._count.memberships)}
            icon={<Users className="size-3" aria-hidden />}
          />
          <Row label="Posts" value={String(space._count.posts)} />
        </dl>
      </Panel>

      {resources.length > 0 ? (
        <Panel title="Pinned" icon={<Pin className="size-2.5" aria-hidden />}>
          <ul className="space-y-0.5">
            {resources.map((resource) => (
              <li key={resource.id}>
                <ResourceLink resource={resource} />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {members.length > 0 ? (
        <Panel title="Hosts and moderators">
          <ul className="space-y-1">
            {members.map((member) => (
              <li key={member.handle}>
                <Link
                  href={`/members/${member.handle}`}
                  className="-mx-1.5 flex items-center gap-2 rounded-ctl px-1.5 py-1 no-underline transition hover:bg-mint"
                >
                  <Avatar
                    name={member.profile?.displayName ?? member.handle}
                    src={member.profile?.avatarUrl}
                    size="sm"
                    className="size-6 text-[9px]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-foreground">
                    {member.profile?.displayName ?? member.handle}
                  </span>
                  <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-[0.08em] text-foreground-muted">
                    {member.role.toLowerCase()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

/**
 * The same resources, for phone width where there is no rail.
 */
export function PinnedResources({ resources }: { resources: SpaceResource[] }) {
  if (resources.length === 0) return null;
  return (
    <section className="rounded-card border border-border bg-surface p-2.5 xl:hidden">
      <h2 className="mb-2 flex items-center gap-1.5 px-1.5 text-[10.5px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
        <Pin className="size-2.5" aria-hidden />
        Pinned in this space
      </h2>
      <ul className="grid gap-0.5 sm:grid-cols-2">
        {resources.map((resource) => (
          <li key={resource.id}>
            <ResourceLink resource={resource} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResourceLink({ resource }: { resource: SpaceResource }) {
  const external = resource.url.startsWith("http");
  return (
    <a
      href={resource.url}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="-mx-1.5 flex items-start gap-2 rounded-ctl px-1.5 py-1.5 no-underline transition hover:bg-mint"
    >
      <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-bold text-foreground">
          {resource.label}
        </span>
        {resource.description ? (
          <span className="block truncate text-[11.5px] text-foreground-muted">
            {resource.description}
          </span>
        ) : null}
      </span>
    </a>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-2.5">
      <h2 className="mb-2 flex items-center gap-1.5 px-1.5 text-[10.5px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
        {icon}
        {title}
      </h2>
      <div className="px-1.5">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="inline-flex items-center gap-1 font-bold text-foreground">
        {icon}
        {value}
      </dd>
    </div>
  );
}
