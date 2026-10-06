import { redirect } from "next/navigation";
import { BookOpen, FolderSearch, SearchX } from "lucide-react";
import { auth } from "@/auth";
import {
  loadLibrary,
  type LibraryCategory,
  type LibraryClassCard,
  type LibraryData,
} from "@/lib/learn/library";
import { tileMeta } from "@/lib/learn/shelves";
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
import { ClassShelf } from "@/components/learn/class-shelf";
import { ClassTile } from "@/components/learn/class-tile";

export const metadata = { title: "Classes" };

/** The grid a single shelf or a search result reads in. */
const TILE_GRID =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4";

/** Tiles above the fold load eagerly; everything else waits for the scroll. */
const EAGER_TILES = 4;

type Params = { q?: string | string[]; category?: string | string[] };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** The library's own address for a search and a shelf. Both live in the URL. */
function libraryHref(input: { q?: string; category?: string | null }): string {
  const search = new URLSearchParams();
  if (input.q) search.set("q", input.q);
  if (input.category) search.set("category", input.category);
  const query = search.toString();
  return query ? `/learn?${query}` : "/learn";
}

/**
 * The class library (DEC-078): a library, not a forum.
 *
 * Browsing is shelves, one row per category, the way a class portal reads: a
 * class sits on every shelf it belongs to, an empty shelf is never shown, and
 * "See all" opens the shelf as a grid at `/learn?category=<slug>`. Searching
 * collapses everything into one grid. Search and shelf both live in the URL,
 * so a filtered view is a link.
 *
 * "Continue where you left off" leads the page once there is something to pick
 * up: ordered by when the member last touched a class rather than by how far
 * through it they are, and pointing at the lesson itself when the course knows
 * which one that was.
 *
 * Nothing here links to a course's discussion room. Questions about a lesson
 * live on the lesson.
 */
export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 120);
  const categoryParam = first(params.category).trim() || null;

  const data = await loadLibrary({
    userId: session.user.id,
    q,
    category: categoryParam,
  });

  // An old link that named a shelf rather than its slug: one address per shelf.
  if (data.canonicalCategory) {
    redirect(libraryHref({ q, category: data.canonicalCategory }));
  }

  return (
    <AppShell size="wide">
      <div className="flex flex-col gap-8">
        <PageHeader
          tone="hero"
          eyebrow="Class library"
          title="Classes"
          description={<HeaderLine data={data} />}
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
                active={data.category?.slug ?? null}
                q={q}
              />
            ) : null}
          </div>
        </PageHeader>

        {data.categoryMissing ? (
          <EmptyState
            icon={<FolderSearch />}
            title="That category is not in the library"
            description="It may have been renamed or emptied. Every class is still on the shelves."
            action={<ButtonLink href="/learn">Show every class</ButtonLink>}
          />
        ) : data.category ? (
          <ShelfGrid data={data} category={data.category} q={q} />
        ) : q ? (
          <SearchGrid data={data} q={q} />
        ) : (
          <Shelves data={data} />
        )}
      </div>
    </AppShell>
  );
}

function HeaderLine({ data }: { data: LibraryData }) {
  if (data.categoryMissing) return <>Browse the shelves, or search every class.</>;
  if (data.category) {
    return (
      <>
        {data.results.length} {data.results.length === 1 ? "class" : "classes"}
        {data.q ? <> matching “{data.q}”</> : null} in{" "}
        <span className="font-semibold text-foreground">{data.category.name}</span>
      </>
    );
  }
  if (data.q) {
    return (
      <>
        {data.results.length} of {data.totalUnfiltered} classes match “{data.q}”
      </>
    );
  }
  if (data.totalUnfiltered === 0) return <>Cook-alongs appear here as they are published.</>;
  return data.categories.length > 1 ? (
    <>
      {data.totalUnfiltered} cook-alongs across {data.categories.length} kinds
      of cooking.
    </>
  ) : (
    <>{data.totalUnfiltered} cook-alongs.</>
  );
}

function CategoryRow({
  categories,
  active,
  q,
}: {
  categories: LibraryCategory[];
  active: string | null;
  q: string;
}) {
  // Scrolls sideways on a phone, wraps from `sm` up, where a long category
  // list is easier to scan as rows than to swipe through.
  return (
    <ChipRow label="Categories" className="sm:flex-wrap sm:overflow-visible">
      <ChipLink href={libraryHref({ q })} active={active === null}>
        All classes
      </ChipLink>
      {categories.map((category) => (
        <ChipLink
          key={category.id}
          href={libraryHref({ q, category: category.slug })}
          active={category.slug === active}
        >
          {category.name}
        </ChipLink>
      ))}
    </ChipRow>
  );
}

/** Browsing: continue row, then one row per shelf. */
function Shelves({ data }: { data: LibraryData }) {
  if (data.shelves.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen />}
        title="No classes are published yet"
        description="Adam's cook-alongs appear here as they are published."
      />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {data.continueLearning.length > 0 ? (
        <ClassShelf title="Continue where you left off">
          {data.continueLearning.map((cls) => (
            <ClassTile
              key={cls.id}
              cls={cls}
              percent={cls.percent}
              href={cls.resumeHref ?? undefined}
              eager
            />
          ))}
        </ClassShelf>
      ) : null}

      {data.shelves.map((shelf, shelfIndex) => (
        <ClassShelf
          key={shelf.category?.id ?? "unshelved"}
          title={shelf.title}
          count={shelf.classes.length}
          description={shelf.category?.description}
          seeAllHref={
            shelf.category ? libraryHref({ category: shelf.category.slug }) : undefined
          }
        >
          {shelf.classes.map((cls, index) => (
            <ClassTile
              key={cls.id}
              cls={cls}
              percent={cls.percent}
              meta={shelf.category ? tileMeta(cls.categories, shelf.category.slug) : null}
              eager={shelfIndex === 0 && index < EAGER_TILES}
            />
          ))}
        </ClassShelf>
      ))}
    </div>
  );
}

/** One shelf as a grid: `/learn?category=<slug>`, the "See all" view. */
function ShelfGrid({
  data,
  category,
  q,
}: {
  data: LibraryData;
  category: LibraryCategory;
  q: string;
}) {
  return (
    <Section
      title={category.name}
      count={data.results.length}
      description={category.description ?? undefined}
    >
      {data.results.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title={`No class in ${category.name} matches “${q}”`}
          description="Try a dish rather than a description, or look across every shelf."
          action={
            <>
              <ButtonLink href={libraryHref({ category: category.slug })}>
                Show all of {category.name}
              </ButtonLink>
              <ButtonLink href={libraryHref({ q })} variant="ghost">
                Search every class
              </ButtonLink>
            </>
          }
        />
      ) : (
        <TileGrid classes={data.results} context={category.slug} />
      )}
    </Section>
  );
}

/** A search across the whole library, as one grid. */
function SearchGrid({ data, q }: { data: LibraryData; q: string }) {
  if (data.results.length === 0) {
    return (
      <EmptyState
        icon={<SearchX />}
        title={data.totalUnfiltered === 0 ? "No classes are published yet" : `No class matches “${q}”`}
        description={
          data.totalUnfiltered === 0
            ? "Adam's cook-alongs appear here as they are published."
            : "Try a dish rather than a description — “ramen” finds more than “something warm”."
        }
        action={
          data.totalUnfiltered > 0 ? (
            <ButtonLink href="/learn">Show every class</ButtonLink>
          ) : undefined
        }
      />
    );
  }

  return (
    <Section title={`Results for “${q}”`} count={data.results.length}>
      <TileGrid classes={data.results} context={null} />
    </Section>
  );
}

function TileGrid({
  classes,
  context,
}: {
  classes: LibraryClassCard[];
  /** The shelf being viewed, so a tile says where else it sits; null in search. */
  context: string | null;
}) {
  return (
    <ul className={TILE_GRID}>
      {classes.map((cls, index) => (
        <li key={cls.id} className="min-w-0">
          <ClassTile
            cls={cls}
            percent={cls.percent}
            meta={tileMeta(cls.categories, context)}
            eager={index < EAGER_TILES}
          />
        </li>
      ))}
    </ul>
  );
}
