import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, PlayCircle, SearchX } from "lucide-react";
import { auth } from "@/auth";
import { loadLibrary } from "@/lib/learn/library";
import { AppShell } from "@/components/app/app-shell";
import {
  ButtonLink,
  ChipLink,
  ChipRow,
  EmptyState,
  PageHeader,
  Section,
} from "@/components/app/ui";
import { UrlSearchField } from "@/components/app/url-search-field";
import { ClassTile } from "@/components/learn/class-tile";

export const metadata = { title: "Classes" };

/** The tile grid, shared by the continue rail and every shelf. */
const TILE_GRID =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4";

/**
 * The class library.
 *
 * Shelves by category when browsing, one grid when narrowing — the shape a
 * catalog of this size reads best in, and the one every video library
 * converges on. Search and category both live in the URL, so a shelf you
 * filtered is a link.
 *
 * The "pick up where you left off" rail appears only once there is something
 * to pick up — ordered by when the member last touched a class rather than by
 * how far through it they are, and pointing at the lesson itself when the
 * course knows which one that was.
 */
export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const category = params.category?.trim() || null;

  const data = await loadLibrary({ userId: session.user.id, q, category });
  const narrowing = Boolean(q || category);

  return (
    <AppShell size="wide">
      <div className="flex flex-col gap-8">
        <PageHeader
          tone="hero"
          title="Classes"
          description={
            narrowing ? (
              <>
                {data.total} of {data.totalUnfiltered} classes
                {category ? (
                  <>
                    {" "}
                    in{" "}
                    <span className="font-semibold text-foreground">
                      {category}
                    </span>
                  </>
                ) : null}
              </>
            ) : (
              <>
                {data.totalUnfiltered} cook-alongs across{" "}
                {data.categories.length} kinds of cooking.
              </>
            )
          }
        >
          <div className="flex flex-col gap-3">
            <UrlSearchField
              placeholder="Search classes by dish, technique or cuisine"
              label="Search classes"
              resetParams={["category"]}
            />

            {data.categories.length > 1 ? (
              <CategoryRow
                categories={data.categories}
                active={category}
                q={q}
              />
            ) : null}
          </div>
        </PageHeader>

        {data.continueLearning.length > 0 ? (
          <Section title="Pick up where you left off" icon={<PlayCircle />}>
            <ul className={TILE_GRID}>
              {data.continueLearning.map((cls) => (
                <li key={cls.slug}>
                  <ClassTile
                    cls={cls}
                    percent={cls.percent}
                    href={cls.resumeHref ?? undefined}
                    eager
                  />
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {data.total === 0 ? (
          <Blank q={q} category={category} empty={data.totalUnfiltered === 0} />
        ) : (
          <div className="flex flex-col gap-10">
            {data.rows.map((row, rowIndex) => (
              <Section
                key={row.category || "results"}
                title={row.category || undefined}
                icon={row.category ? <BookOpen /> : undefined}
                count={row.category ? row.classes.length : undefined}
                action={
                  row.category ? (
                    <Link
                      href={`/learn?category=${encodeURIComponent(row.category)}`}
                      scroll={false}
                      className="text-label font-medium text-brand-strong no-underline hover:underline"
                    >
                      See all
                    </Link>
                  ) : undefined
                }
              >
                <ul className={TILE_GRID}>
                  {row.classes.map((cls, index) => (
                    <li key={cls.slug}>
                      <ClassTile
                        cls={cls}
                        percent={cls.percent}
                        eager={rowIndex === 0 && index < 4}
                      />
                    </li>
                  ))}
                </ul>
              </Section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function CategoryRow({
  categories,
  active,
  q,
}: {
  categories: string[];
  active: string | null;
  q: string;
}) {
  function href(category: string | null) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (category) search.set("category", category);
    const query = search.toString();
    return query ? `/learn?${query}` : "/learn";
  }

  // Scrolls sideways on a phone, wraps from `sm` up, where a long category
  // list is easier to scan as rows than to swipe through.
  return (
    <ChipRow label="Categories" className="sm:flex-wrap sm:overflow-visible">
      {[null, ...categories].map((category) => (
        <ChipLink
          key={category ?? "all"}
          href={href(category)}
          active={category === active}
        >
          {category ?? "All classes"}
        </ChipLink>
      ))}
    </ChipRow>
  );
}

function Blank({
  q,
  category,
  empty,
}: {
  q: string;
  category: string | null;
  empty: boolean;
}) {
  const title = empty
    ? "No classes are published yet"
    : q
      ? `No class matches “${q}”`
      : `Nothing in ${category} yet`;

  return (
    <EmptyState
      icon={empty ? <BookOpen /> : <SearchX />}
      title={title}
      description={
        empty
          ? "Adam's cook-alongs appear here as they are published."
          : "Try a dish rather than a description — “ramen” finds more than “something warm”."
      }
      action={
        !empty ? (
          <ButtonLink href="/learn">Show every class</ButtonLink>
        ) : undefined
      }
    />
  );
}
