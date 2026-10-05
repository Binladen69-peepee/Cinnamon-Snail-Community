import Link from "next/link";
import { CheckCircle2, ChevronRight, CircleDashed, Map as MapIcon, Plus, Users } from "lucide-react";
import { listTracks } from "@/lib/admin/roadmap";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/app/ui";
import { TrackCreateForm } from "@/components/admin/roadmap-forms";

export const metadata = { title: "Roadmap tracks" };

/**
 * Roadmap authoring — BUILD.md §14 "Admin authoring".
 *
 * The member roadmap has been finished and empty at the same time: a track is
 * authored content, and until this page there was no way to author one. Every
 * member saw the same honest empty state.
 *
 * The list leads with the numbers that decide what to do next — how many
 * members are on a track, how many finished it — because the question an author
 * arrives with is "which of these is working", not "what exists".
 */
export default async function AdminRoadmapPage() {
  const tracks = await listTracks();
  const published = tracks.filter((track) => track.published);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Roadmap tracks"
        description="A track is an ordered list of milestones. Members follow one at a time, and only published tracks are offered."
      />

      {published.length === 0 ? (
        <Callout tone="warning" icon={<CircleDashed />} title="No track is published.">
          Until one is, every member opening{" "}
          <code className="rounded-chip bg-default px-1 py-px font-mono text-caption text-foreground">
            /roadmap
          </code>{" "}
          sees an empty state.
        </Callout>
      ) : null}

      <Card padding="none">
        <CardHeader title="Tracks" icon={<MapIcon />} count={tracks.length} />
        {tracks.length === 0 ? (
          <EmptyState
            bordered={false}
            icon={<MapIcon />}
            title="No tracks yet"
            description="A track is the path a member follows — a handful of milestones, in order. Write the first one below."
          />
        ) : (
          <ul className="divide-y divide-separator">
            {tracks.map((track) => (
              <li key={track.id}>
                <Link
                  href={`/admin/roadmap/${track.slug}`}
                  className="group flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3.5 no-underline transition hover:bg-surface-muted sm:px-5"
                >
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-semibold text-foreground">
                        {track.name}
                      </span>
                      {track.published ? (
                        <Badge tone="success" icon={<CheckCircle2 aria-hidden />}>
                          Published
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Draft</Badge>
                      )}
                      <span className="text-caption tabular-nums text-foreground-muted">
                        v{track.version}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-label text-foreground-muted">
                      {track.description ?? "No description."}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-5 text-right">
                    <Figure
                      value={track.milestones}
                      label={track.milestones === 1 ? "milestone" : "milestones"}
                    />
                    <Figure
                      value={track.enrolled}
                      label="on it"
                      icon={<Users className="size-3.5" aria-hidden />}
                    />
                    <Figure value={track.finished} label="finished" />
                    <ChevronRight
                      className="size-4 text-foreground-muted transition group-hover:text-foreground"
                      aria-hidden
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="none">
        <CardHeader title="New track" icon={<Plus />} />
        <div className="p-4 sm:p-5">
          <TrackCreateForm />
        </div>
      </Card>
    </div>
  );
}

/** A count over its label, right-aligned in a track row. */
function Figure({
  value,
  label,
  icon,
}: {
  value: number;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <span className="block">
      <span className="flex items-center justify-end gap-1 text-body font-semibold tabular-nums text-foreground">
        {icon}
        {value}
      </span>
      <span className="block text-caption text-foreground-muted">{label}</span>
    </span>
  );
}
