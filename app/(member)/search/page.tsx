import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { searchEntities, type SearchType } from "@/lib/search";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

const types: SearchType[] = ["post", "comment", "course", "lesson", "event", "member"];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; space?: string }>;
}) {
  const session = await auth();
  if (!session?.sessionId) redirect("/login");
  const params = await searchParams;
  const q = params.q ?? "";
  const type = types.includes(params.type as SearchType)
    ? (params.type as SearchType)
    : undefined;
  const spaces = await prisma.space.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  const spaceId = spaces.some((space) => space.id === params.space)
    ? params.space
    : undefined;
  const results =
    q.length >= 2
      ? await searchEntities({
          query: q,
          types: type ? [type] : undefined,
          spaceId,
        })
      : [];

  return (
    <div>
      <h1 className="font-display text-4xl text-forest">Search</h1>
      <form className="mt-6 flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search posts, people, courses…"
          className="min-h-11 min-w-[240px] flex-1 rounded-full border border-sand bg-warm-white px-4"
        />
        <select
          name="type"
          defaultValue={type ?? ""}
          className="min-h-11 rounded-full border border-sand bg-warm-white px-4"
        >
          <option value="">All types</option>
          {types.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          name="space"
          defaultValue={spaceId ?? ""}
          className="min-h-11 rounded-full border border-sand bg-warm-white px-4"
        >
          <option value="">All spaces</option>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
        <button type="submit" className="vu-cta-fill min-h-11 rounded-full px-5">
          Search
        </button>
      </form>
      <div className="mt-8 space-y-4">
        {q && results.length === 0 ? (
          <EmptyState
            title="Nothing matched"
            body="Try a shorter phrase, or remove a filter. Search uses Postgres full-text first, then a trigram/ilike fallback."
          />
        ) : null}
        {results.map((row) => (
          <Link
            key={row.id}
            href={
              row.entityType === "post"
                ? `/posts/${row.entityId}`
                : row.entityType === "member"
                  ? `/members/${row.entityId}`
                  : row.entityType === "event"
                    ? "/calendar"
                    : "/learn"
            }
            className="block rounded-[1.5rem] border border-sand bg-warm-white p-5"
          >
            <p className="text-xs uppercase tracking-wide text-olive">{row.entityType}</p>
            <h2 className="mt-1 font-display text-2xl text-forest">{row.title}</h2>
            <p className="mt-2 line-clamp-2 text-sm text-muted">{row.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
