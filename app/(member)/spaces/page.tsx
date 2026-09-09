import Link from "next/link";
import { prisma } from "@/lib/db";
import { EmptyState } from "@/components/ui/empty-state";

export default async function SpacesPage() {
  const spaces = await prisma.space.findMany({ orderBy: { sortOrder: "asc" } });
  if (spaces.length === 0) {
    return (
      <EmptyState
        title="Spaces are being prepared"
        body="Hosts will open kitchens, course rooms, and event spaces here."
      />
    );
  }
  return (
    <div>
      <h1 className="font-display text-4xl text-forest">Community spaces</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Each space has a host, a purpose, and a table of its own.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {spaces.map((space) => (
          <Link
            key={space.id}
            href={`/spaces/${space.slug}`}
            className="overflow-hidden rounded-[1.5rem] border border-sand bg-warm-white"
          >
            {space.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={space.coverUrl} alt="" className="h-40 w-full object-cover" />
            ) : (
              <div className="h-40 bg-sage/40" />
            )}
            <div className="p-5">
              <h2 className="font-display text-2xl text-forest">{space.name}</h2>
              <p className="mt-2 text-sm text-muted">{space.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
