import Link from "next/link";
import { CheckCircle2, CircleDashed, Map as MapIcon, Plus, Users } from "lucide-react";
import { listTracks } from "@/lib/admin/roadmap";
import { Badge, EmptyPanel, Panel, PanelHeader } from "@/components/admin/ui";
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
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
          Roadmap tracks
        </h1>
        <p className="mt-1 text-[13px] text-foreground-muted">
          A track is an ordered list of milestones. Members follow one at a time,
          and only published tracks are offered.
        </p>
      </header>

      {published.length === 0 ? (
        <p className="flex items-start gap-2.5 rounded-card border border-warning/35 bg-warning/10 px-4 py-3 text-[13px] leading-snug text-foreground">
          <CircleDashed className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            <strong className="font-bold">No track is published.</strong> Until one
            is, every member opening <code className="font-mono text-[12px]">/roadmap</code>{" "}
            sees an empty state.
          </span>
        </p>
      ) : null}

      <Panel>
        <PanelHeader
          title="Tracks"
          icon={<MapIcon className="size-3.5" aria-hidden />}
          count={tracks.length}
        />
        {tracks.length === 0 ? (
          <EmptyPanel
            icon={<MapIcon className="size-5" aria-hidden />}
            title="No tracks yet"
            body="A track is the path a member follows — a handful of milestones, in order. Write the first one below."
          />
        ) : (
          <ul className="divide-y divide-separator">
            {tracks.map((track) => (
              <li key={track.id}>
                <Link
                  href={`/admin/roadmap/${track.slug}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 no-underline transition hover:bg-default"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-bold text-foreground">
                        {track.name}
                      </span>
                      {track.published ? (
                        <Badge tone="good">
                          <CheckCircle2 className="size-3" aria-hidden />
                          Published
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Draft</Badge>
                      )}
                      <span className="text-[11px] tabular-nums text-foreground-muted">
                        v{track.version}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-foreground-muted">
                      {track.description ?? "No description."}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-4 text-right">
                    <Stat
                      value={track.milestones}
                      label={track.milestones === 1 ? "milestone" : "milestones"}
                    />
                    <Stat
                      value={track.enrolled}
                      label="on it"
                      icon={<Users className="size-3" aria-hidden />}
                    />
                    <Stat value={track.finished} label="finished" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="New track" icon={<Plus className="size-3.5" aria-hidden />} />
        <div className="px-4 py-4">
          <TrackCreateForm />
        </div>
      </Panel>
    </div>
  );
}

function Stat({
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
      <span className="flex items-center justify-end gap-1 text-[13.5px] font-bold tabular-nums text-foreground">
        {icon}
        {value}
      </span>
      <span className="block text-[10.5px] text-foreground-muted">{label}</span>
    </span>
  );
}
