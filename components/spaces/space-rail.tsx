import Link from "next/link";
import { ExternalLink, Globe, Lock, Pin, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Card, CardHeader } from "@/components/app/ui";
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
    <div className="flex flex-col gap-4">
      <Card padding="none">
        <CardHeader title={`About ${space.name}`} />
        <div className="px-4 pb-1 pt-3">
          <p className="text-label text-foreground-muted text-pretty">
            {space.description ?? SPACE_KIND_BLURB[space.kind]}
          </p>

          <dl className="mt-2 divide-y divide-separator text-label">
            <Row label="Kind" value={SPACE_KIND_LABEL[space.kind]} />
            <Row
              label="Visibility"
              value={SPACE_VISIBILITY_LABEL[space.visibility]}
              icon={<VisibilityIcon className="size-3.5" aria-hidden />}
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
              icon={<Users className="size-3.5" aria-hidden />}
            />
            <Row label="Posts" value={String(space._count.posts)} />
          </dl>
        </div>
      </Card>

      {resources.length > 0 ? (
        <Card padding="none">
          <CardHeader title="Pinned" icon={<Pin />} />
          <ul className="divide-y divide-separator">
            {resources.map((resource) => (
              <li key={resource.id}>
                <ResourceLink resource={resource} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {members.length > 0 ? (
        <Card padding="none">
          <CardHeader title="Hosts and moderators" />
          <ul className="py-1.5">
            {members.map((member) => (
              <li key={member.handle}>
                <Link
                  href={`/members/${member.handle}`}
                  className="flex items-center gap-2.5 px-4 py-2 no-underline transition hover:bg-surface-muted"
                >
                  <Avatar
                    name={member.profile?.displayName ?? member.handle}
                    src={member.profile?.avatarUrl}
                    size="xs"
                  />
                  <span className="min-w-0 flex-1 truncate text-label font-medium text-foreground">
                    {member.profile?.displayName ?? member.handle}
                  </span>
                  <Badge className="capitalize">{member.role.toLowerCase()}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
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
    <Card padding="none" className="xl:hidden">
      <CardHeader title="Pinned in this space" icon={<Pin />} />
      <ul className="divide-y divide-separator">
        {resources.map((resource) => (
          <li key={resource.id}>
            <ResourceLink resource={resource} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ResourceLink({ resource }: { resource: SpaceResource }) {
  const external = resource.url.startsWith("http");
  return (
    <a
      href={resource.url}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="flex items-start gap-2.5 px-4 py-2.5 no-underline transition hover:bg-surface-muted"
    >
      <ExternalLink className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-label font-medium text-foreground">
          {resource.label}
        </span>
        {resource.description ? (
          <span className="block truncate text-caption text-foreground-muted">
            {resource.description}
          </span>
        ) : null}
      </span>
    </a>
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
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="inline-flex items-center gap-1 text-right font-medium text-foreground">
        {icon}
        {value}
      </dd>
    </div>
  );
}
