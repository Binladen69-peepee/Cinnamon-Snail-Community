import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, ListOrdered, Plus, Settings } from "lucide-react";
import {
  lessonOptions,
  loadTrack,
  previewFor,
  recipeOptions,
} from "@/lib/admin/roadmap";
import {
  COOK_VIBES,
  PRIMARY_BENEFITS,
  SUCKIEST_THINGS,
  labelFor,
} from "@/lib/roadmap/answers";
import { Badge, EmptyPanel, Panel, PanelHeader } from "@/components/admin/ui";
import {
  MilestoneForm,
  MilestoneRowActions,
  TrackSettingsForm,
} from "@/components/admin/roadmap-forms";

export const metadata = { title: "Track" };

/**
 * One track — BUILD.md §14 "Admin authoring".
 *
 * Milestones in order with their four slots, the reorder controls, and the
 * preview. The preview is the part that is easy to leave out and expensive to
 * skip: framing and the gluten-free filter are keyed by a member's answer, and
 * without a way to *look* at a combination an author writes those keys blind.
 */
export default async function AdminTrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ gf?: string; benefit?: string; stuck?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const track = await loadTrack(slug);
  if (!track) notFound();

  const [lessons, recipes] = await Promise.all([lessonOptions(), recipeOptions()]);

  const answers = {
    glutenFree: query.gf === "1",
    primaryBenefit: query.benefit ?? null,
    suckiestThing: query.stuck ?? null,
  };
  const preview = await previewFor(track, answers);

  const totalSettled = track.milestones.reduce(
    (sum, milestone) => sum + milestone.completed + milestone.skipped,
    0,
  );

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-[12.5px] text-foreground-muted">
        <Link
          href="/admin/roadmap"
          className="font-semibold text-foreground-muted no-underline hover:text-foreground hover:underline"
        >
          Roadmap tracks
        </Link>
        <span aria-hidden> / </span>
        <span>{track.name}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
            {track.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-foreground-muted">
            {track.published ? (
              <Badge tone="good">Published</Badge>
            ) : (
              <Badge tone="neutral">Draft</Badge>
            )}
            <span>v{track.version}</span>
            <span aria-hidden>·</span>
            <span>
              {track.enrolled} {track.enrolled === 1 ? "member" : "members"} on it
            </span>
            <span aria-hidden>·</span>
            <span>{totalSettled} milestones settled</span>
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelHeader
              title="Milestones"
              icon={<ListOrdered className="size-3.5" aria-hidden />}
              count={track.milestones.length}
            />
            {track.milestones.length === 0 ? (
              <EmptyPanel
                icon={<ListOrdered className="size-5" aria-hidden />}
                title="No milestones yet"
                body="A milestone is a topic, a lesson, a recipe and the goal that ties them together. Add the first one below."
              />
            ) : (
              <ol className="divide-y divide-separator">
                {track.milestones.map((milestone, index) => (
                  <li key={milestone.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-[13.5px] font-bold text-foreground">
                          <span className="tabular-nums text-foreground-muted">
                            {index + 1}.
                          </span>
                          {milestone.topic}
                        </p>
                        <p className="mt-0.5 text-[12.5px] text-foreground-muted">
                          {milestone.learningGoal}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-foreground-muted">
                          <span>{milestone.lessonTitle ?? "No lesson"}</span>
                          <span aria-hidden>·</span>
                          <span>{milestone.recipeTitle ?? "No recipe"}</span>
                          {milestone.recipeGlutenFreeTitle ? (
                            <>
                              <span aria-hidden>·</span>
                              <span>GF: {milestone.recipeGlutenFreeTitle}</span>
                            </>
                          ) : null}
                          {milestone.completed + milestone.skipped > 0 ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="tabular-nums">
                                {milestone.completed} done, {milestone.skipped} skipped
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <MilestoneRowActions
                        slug={track.slug}
                        milestone={milestone}
                        first={index === 0}
                        last={index === track.milestones.length - 1}
                      />
                    </div>

                    <details className="mt-2">
                      <summary className="cursor-pointer text-[12px] font-semibold text-foreground-muted hover:text-foreground">
                        Edit
                      </summary>
                      <div className="mt-3 border-t border-border pt-3">
                        <MilestoneForm
                          trackId={track.id}
                          slug={track.slug}
                          milestone={milestone}
                          lessons={lessons}
                          recipes={recipes}
                        />
                      </div>
                    </details>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Add a milestone"
              icon={<Plus className="size-3.5" aria-hidden />}
            />
            <div className="px-4 py-4">
              <MilestoneForm
                trackId={track.id}
                slug={track.slug}
                milestone={null}
                lessons={lessons}
                recipes={recipes}
              />
            </div>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel>
            <PanelHeader
              title="Track settings"
              icon={<Settings className="size-3.5" aria-hidden />}
            />
            <div className="px-4 py-4">
              <TrackSettingsForm
                track={{
                  id: track.id,
                  slug: track.slug,
                  name: track.name,
                  description: track.description,
                  published: track.published,
                  version: track.version,
                  enrolled: track.enrolled,
                  milestones: track.milestones.length,
                }}
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Preview" icon={<Eye className="size-3.5" aria-hidden />} />
            <div className="px-4 py-3.5">
              <p className="mb-3 text-[12px] leading-snug text-foreground-muted">
                What a member with these answers reads. Links, so a combination
                worth checking can be sent to someone.
              </p>

              {/* A GET form, so the chosen combination lives in the URL. */}
              <form method="get" className="space-y-2.5">
                <label className="flex items-center gap-2 text-[12.5px] text-foreground">
                  <input
                    type="checkbox"
                    name="gf"
                    value="1"
                    defaultChecked={answers.glutenFree}
                    className="size-4"
                  />
                  Eats gluten free
                </label>
                <Select
                  name="benefit"
                  label="Here for"
                  value={answers.primaryBenefit}
                  options={PRIMARY_BENEFITS}
                />
                <Select
                  name="stuck"
                  label="Gets in the way"
                  value={answers.suckiestThing}
                  options={SUCKIEST_THINGS}
                />
                <button
                  type="submit"
                  className="inline-flex h-8 items-center rounded-ctl border border-border bg-surface px-3 text-[12.5px] font-semibold text-foreground transition hover:border-hairline-firm"
                >
                  Preview
                </button>
              </form>

              {preview.length === 0 ? (
                <p className="mt-3 text-[12.5px] text-foreground-muted">
                  Nothing to preview yet.
                </p>
              ) : (
                <ol className="mt-3.5 space-y-2.5 border-t border-border pt-3">
                  {preview.map((milestone, index) => (
                    <li key={milestone.id}>
                      <p className="text-[12.5px] font-semibold text-foreground">
                        {index + 1}. {milestone.topic}
                      </p>
                      {milestone.framing ? (
                        <p className="mt-0.5 text-[12px] leading-snug text-foreground">
                          {milestone.framing}
                        </p>
                      ) : null}
                      {milestone.constraintNote ? (
                        <p className="mt-0.5 text-[12px] leading-snug text-foreground-muted">
                          {milestone.constraintNote}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[11.5px] text-foreground-muted">
                        {milestone.recipeTitle ?? "No recipe"}
                        {milestone.recipeIsGlutenFree ? " (gluten free)" : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="How this track is matched" />
            <p className="px-4 py-3 text-[12px] leading-snug text-foreground-muted">
              A member is recommended this track when their cook-vibe answer
              matches its slug or name. The four §14 vibes are{" "}
              {COOK_VIBES.map((vibe) => labelFor(COOK_VIBES, vibe.value)).join(", ")}.
              This track&apos;s slug is{" "}
              <code className="font-mono text-[11.5px] text-foreground">{track.slug}</code>.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-foreground-muted">
        {label}
      </span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="h-8 w-full rounded-ctl border border-field-border bg-field-background px-2 text-[12.5px] text-foreground"
      >
        <option value="">No answer</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
