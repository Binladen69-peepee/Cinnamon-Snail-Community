import { redirect } from "next/navigation";
import { CalendarClock, Lightbulb, ListFilter, Plus } from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app/app-shell";
import {
  ButtonLink,
  Card,
  ChipLink,
  ChipRow,
  EmptyState,
  PageHeader,
  Pager,
  TabBar,
  TabLink,
} from "@/components/app/ui";
import { IdeaRow } from "@/components/ideas/idea-row";
import { IdeasRail } from "@/components/ideas/ideas-rail";
import {
  IDEA_CATEGORIES,
  IDEA_CATEGORY_VALUES,
  IDEA_SORTS,
  IDEA_STATUS_FILTERS,
  IDEAS_DESCRIPTION,
  IDEAS_TITLE,
  ideasHref,
  parseIdeaCategory,
  parseIdeaSort,
  parseIdeaStatusFilter,
  parsePage,
} from "@/lib/ideas/constants";
import { listIdeas, listPlannedIdeas } from "@/lib/ideas/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: IDEAS_TITLE };

/**
 * Ideas & Requests (DEC-078): the one place members ask for the classes,
 * recipes and features they want next, Reddit-style.
 *
 * Top, New and Planned are the views; kind and status narrow them. Every view
 * is a link, so a filtered board can be shared and works before hydration.
 * Merged duplicates and anything moderation took down never appear here.
 */
export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; category?: string; status?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login?callbackUrl=/ideas");

  const params = await searchParams;
  const sort = parseIdeaSort(params.sort);
  const category = parseIdeaCategory(params.category);
  const status = parseIdeaStatusFilter(params.status);
  const page = parsePage(params.page);

  const [list, planned] = await Promise.all([
    listIdeas({ viewerId: session.user.id, sort, category, status, page }),
    sort === "planned" ? Promise.resolve([]) : listPlannedIdeas(session.user.id, 5),
  ]);

  const view = { sort, category, status };
  const filtered = category !== null || (sort !== "planned" && status !== "active");

  return (
    <AppShell rail={list.allowed ? <IdeasRail planned={planned} /> : undefined}>
      <div className="flex flex-col gap-5">
        <PageHeader
          title={IDEAS_TITLE}
          description={IDEAS_DESCRIPTION}
          actions={
            list.allowed ? (
              <ButtonLink href="/ideas/new" variant="primary">
                <Plus className="size-4" aria-hidden />
                Share an idea
              </ButtonLink>
            ) : null
          }
        >
          {list.allowed ? (
            <TabBar label="Order ideas">
              {IDEA_SORTS.map((item) => (
                <TabLink
                  key={item.value}
                  href={ideasHref({ ...view, sort: item.value, page: 1 })}
                  active={sort === item.value}
                >
                  {item.label}
                </TabLink>
              ))}
            </TabBar>
          ) : null}
        </PageHeader>

        {!list.allowed ? (
          <EmptyState
            icon={<Lightbulb />}
            title={`${IDEAS_TITLE} is open to members`}
            description="Once your membership is active you can ask for classes, recipes and features, and vote on what others have asked for."
            action={
              <ButtonLink href="/billing" variant="primary">
                See your membership
              </ButtonLink>
            }
          />
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <ChipRow label="Filter by kind">
                <ChipLink href={ideasHref({ ...view, category: null })} active={category === null}>
                  All kinds
                </ChipLink>
                {IDEA_CATEGORY_VALUES.map((value) => (
                  <ChipLink
                    key={value}
                    href={ideasHref({ ...view, category: value })}
                    active={category === value}
                  >
                    {IDEA_CATEGORIES[value].label}
                  </ChipLink>
                ))}
              </ChipRow>
              {sort !== "planned" ? (
                <ChipRow label="Filter by status">
                  {IDEA_STATUS_FILTERS.map((item) => (
                    <ChipLink
                      key={item.value}
                      href={ideasHref({ ...view, status: item.value })}
                      active={status === item.value}
                    >
                      {item.label}
                    </ChipLink>
                  ))}
                </ChipRow>
              ) : null}
            </div>

            {list.items.length === 0 ? (
              sort === "planned" && !category ? (
                <EmptyState
                  icon={<CalendarClock />}
                  title="Nothing planned yet"
                  description="When the team picks up an idea, it shows here, and everyone who voted for it hears about it."
                  action={<ButtonLink href="/ideas">See the top ideas</ButtonLink>}
                />
              ) : filtered || sort === "planned" ? (
                <EmptyState
                  icon={<ListFilter />}
                  title="Nothing matches these filters"
                  description="Try another kind or status, or ask for it yourself."
                  action={
                    <>
                      <ButtonLink href="/ideas">Clear filters</ButtonLink>
                      <ButtonLink href="/ideas/new" variant="primary">
                        Share an idea
                      </ButtonLink>
                    </>
                  }
                />
              ) : (
                <EmptyState
                  icon={<Lightbulb />}
                  title="No ideas yet"
                  description="Be the first to ask for a class, a recipe or a feature. Others can upvote it, and the team sees what is wanted most."
                  action={
                    <ButtonLink href="/ideas/new" variant="primary">
                      <Plus className="size-4" aria-hidden />
                      Share an idea
                    </ButtonLink>
                  }
                />
              )
            ) : (
              <Card padding="none" className="overflow-hidden" aria-label="Ideas">
                <ul className="divide-y divide-separator">
                  {list.items.map((idea) => (
                    <IdeaRow key={idea.id} idea={idea} />
                  ))}
                </ul>
              </Card>
            )}

            {list.pageCount > 1 ? (
              <Pager
                label="Idea pages"
                prevHref={list.page > 1 ? ideasHref({ ...view, page: list.page - 1 }) : null}
                nextHref={
                  list.page < list.pageCount ? ideasHref({ ...view, page: list.page + 1 }) : null
                }
                summary={`Page ${list.page} of ${list.pageCount}`}
              />
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
