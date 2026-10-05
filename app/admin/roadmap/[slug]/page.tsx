import { notFound } from "next/navigation";
import { ChevronDown, Eye, ListOrdered, Plus, Settings, Waypoints } from "lucide-react";
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
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  Select,
} from "@/components/app/ui";
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
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/admin/roadmap", label: "Roadmap tracks" }}
        title={track.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {track.published ? (
              <Badge tone="success">Published</Badge>
            ) : (
              <Badge tone="neutral">Draft</Badge>
            )}
            <span className="tabular-nums">v{track.version}</span>
            <span aria-hidden>·</span>
            <span>
              {track.enrolled} {track.enrolled === 1 ? "member" : "members"} on it
            </span>
            <span aria-hidden>·</span>
            <span>{totalSettled} milestones settled</span>
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card padding="none">
            <CardHeader
              title="Milestones"
              icon={<ListOrdered />}
              count={track.milestones.length}
            />
            {track.milestones.length === 0 ? (
              <EmptyState
                bordered={false}
                icon={<ListOrdered />}
                title="No milestones yet"
                description="A milestone is a topic, a lesson, a recipe and the goal that ties them together. Add the first one below."
              />
            ) : (
              <ol className="divide-y divide-separator">
                {track.milestones.map((milestone, index) => (
                  <li key={milestone.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-baseline gap-2 text-body font-semibold text-foreground">
                          <span className="tabular-nums text-foreground-muted">
                            {index + 1}.
                          </span>
                          {milestone.topic}
                        </p>
                        <p className="mt-0.5 text-label text-foreground-muted">
                          {milestone.learningGoal}
                        </p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-foreground-muted">
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

                    <details className="group/edit mt-2">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-ctl text-label font-medium text-foreground-muted transition hover:text-foreground [&::-webkit-details-marker]:hidden">
                        <ChevronDown
                          className="size-4 transition group-open/edit:rotate-180"
                          aria-hidden
                        />
                        Edit
                      </summary>
                      <div className="mt-3 border-t border-separator pt-4">
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
          </Card>

          <Card padding="none">
            <CardHeader title="Add a milestone" icon={<Plus />} />
            <div className="p-4 sm:p-5">
              <MilestoneForm
                trackId={track.id}
                slug={track.slug}
                milestone={null}
                lessons={lessons}
                recipes={recipes}
              />
            </div>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Card padding="none">
            <CardHeader title="Track settings" icon={<Settings />} />
            <div className="p-4 sm:p-5">
              <TrackSettingsForm
                track={{
                  id: track.id,
                  slug: track.slug,
                  name: track.name,
                  description: track.description,
                  kitTag: track.kitTag,
                  kitCompletedTag: track.kitCompletedTag,
                  published: track.published,
                  version: track.version,
                  enrolled: track.enrolled,
                  milestones: track.milestones.length,
                }}
              />
            </div>
          </Card>

          <Card padding="none">
            <CardHeader
              title="Preview"
              icon={<Eye />}
              description="What a member with these answers reads. Links, so a combination worth checking can be sent to someone."
            />
            <div className="flex flex-col gap-4 p-4 sm:p-5">
              {/* A GET form, so the chosen combination lives in the URL. */}
              <form method="get" className="flex flex-col gap-3">
                <label className="flex items-center gap-2 text-label text-foreground">
                  <input
                    type="checkbox"
                    name="gf"
                    value="1"
                    defaultChecked={answers.glutenFree}
                    className="size-4"
                  />
                  Eats gluten free
                </label>
                <PreviewSelect
                  name="benefit"
                  label="Here for"
                  value={answers.primaryBenefit}
                  options={PRIMARY_BENEFITS}
                />
                <PreviewSelect
                  name="stuck"
                  label="Gets in the way"
                  value={answers.suckiestThing}
                  options={SUCKIEST_THINGS}
                />
                <Button type="submit" size="sm" className="w-fit">
                  Preview
                </Button>
              </form>

              {preview.length === 0 ? (
                <p className="rounded-ctl bg-surface-muted px-3 py-2.5 text-label text-foreground-muted">
                  Nothing to preview yet.
                </p>
              ) : (
                <ol className="flex flex-col gap-3 border-t border-separator pt-4">
                  {preview.map((milestone, index) => (
                    <li key={milestone.id}>
                      <p className="text-label font-semibold text-foreground">
                        {index + 1}. {milestone.topic}
                      </p>
                      {milestone.framing ? (
                        <p className="mt-0.5 text-label leading-snug text-foreground">
                          {milestone.framing}
                        </p>
                      ) : null}
                      {milestone.constraintNote ? (
                        <p className="mt-0.5 text-label leading-snug text-foreground-muted">
                          {milestone.constraintNote}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-caption text-foreground-muted">
                        {milestone.recipeTitle ?? "No recipe"}
                        {milestone.recipeIsGlutenFree ? " (gluten free)" : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>

          <Card padding="none">
            <CardHeader title="How this track is matched" icon={<Waypoints />} />
            <p className="px-4 py-3.5 text-label leading-relaxed text-foreground-muted sm:px-5">
              A member is recommended this track when their cook-vibe answer
              matches its slug or name. The four §14 vibes are{" "}
              {COOK_VIBES.map((vibe) => labelFor(COOK_VIBES, vibe.value)).join(", ")}.
              This track&apos;s slug is{" "}
              <code className="rounded-chip bg-default px-1 py-px font-mono text-caption text-foreground">
                {track.slug}
              </code>
              .
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function PreviewSelect({
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
    <Field label={label} htmlFor={`preview-${name}`}>
      <Select id={`preview-${name}`} name={name} defaultValue={value ?? ""} size="sm">
        <option value="">No answer</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}
