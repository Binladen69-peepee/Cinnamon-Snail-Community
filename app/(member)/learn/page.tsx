import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, PlayCircle, SearchX } from "lucide-react";
import { auth } from "@/auth";
import { loadLibrary } from "@/lib/learn/library";
import { AppShell } from "@/components/app/app-shell";
import { UrlSearchField } from "@/components/app/url-search-field";
import { ClassTile } from "@/components/learn/class-tile";
import { cn } from "@/lib/utils";

export const metadata = { title: "Classes" };

/**
 * The class library.
 *
 * Shelves by category when browsing, one grid when narrowing — the shape a
 * catalog of this size reads best in, and the one every video library
 * converges on. Search and category both live in the URL, so a shelf you
 * filtered is a link.
 *
 * Deliberately not built: a "continue learning" rail that is always empty.
 * There are no lessons in the database yet, so there is no progress to resume;
 * the row renders itself the moment there is, rather than sitting there as an
 * empty promise until then.
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
    <AppShell wide>
      <div className="mx-auto w-full max-w-[1160px] space-y-5 pb-4">
        <header className="space-y-3">
          <div>
            <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
              Classes
            </h1>
            <p className="mt-1 text-[14px] text-foreground-muted">
              {narrowing ? (
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
              )}
            </p>
          </div>

          <UrlSearchField
            placeholder="Search classes by dish, technique or cuisine"
            label="Search classes"
            resetParams={["category"]}
          />

          {data.categories.length > 1 ? (
            <CategoryRow categories={data.categories} active={category} q={q} />
          ) : null}
        </header>

        {data.continueLearning.length > 0 ? (
          <section className="space-y-2.5">
            <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
              <PlayCircle className="size-3" aria-hidden />
              Pick up where you left off
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {data.continueLearning.map((cls) => (
                <li key={cls.slug}>
                  <ClassTile cls={cls} percent={cls.percent} eager />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {data.total === 0 ? (
          <Blank q={q} category={category} empty={data.totalUnfiltered === 0} />
        ) : (
          <div className="space-y-7">
            {data.rows.map((row, rowIndex) => (
              <section key={row.category || "results"} className="space-y-2.5">
                {row.category ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="flex items-baseline gap-2 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
                      <BookOpen className="size-3 self-center" aria-hidden />
                      {row.category}
                      <span className="font-semibold tabular-nums">
                        {row.classes.length}
                      </span>
                    </h2>
                    <Link
                      href={`/learn?category=${encodeURIComponent(row.category)}`}
                      scroll={false}
                      className="shrink-0 text-[12.5px] font-semibold text-brand no-underline hover:underline"
                    >
                      See all
                    </Link>
                  </div>
                ) : null}

                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
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
              </section>
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

  return (
    <ul className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
      {[null, ...categories].map((category) => {
        const current = category === active;
        return (
          <li key={category ?? "all"}>
            <Link
              href={href(category)}
              scroll={false}
              aria-current={current ? "true" : undefined}
              className={cn(
                "inline-flex h-8 items-center whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold no-underline transition",
                current
                  ? "border-brand-fill bg-brand-fill text-brand-fill-foreground"
                  : "border-border bg-surface text-foreground-muted hover:border-hairline-firm hover:text-foreground",
              )}
            >
              {category ?? "All classes"}
            </Link>
          </li>
        );
      })}
    </ul>
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
    <div className="rounded-card border border-dashed border-border bg-surface px-6 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-wash text-brand-strong">
        {empty ? (
          <BookOpen className="size-6" aria-hidden />
        ) : (
          <SearchX className="size-6" aria-hidden />
        )}
      </span>
      <h2 className="mt-3 font-display text-[1.15rem] font-bold text-foreground">
        {title}
      </h2>
      <p className="mx-auto mt-1.5 max-w-[44ch] text-[14px] text-foreground-muted">
        {empty
          ? "Adam's cook-alongs appear here as they are published."
          : "Try a dish rather than a description — “ramen” finds more than “something warm”."}
      </p>
      {!empty ? (
        <Link
          href="/learn"
          className="mt-4 inline-flex h-9 items-center rounded-ctl border border-border bg-background px-4 text-[13.5px] font-semibold text-foreground no-underline transition hover:border-hairline-firm"
        >
          Show every class
        </Link>
      ) : null}
    </div>
  );
}
