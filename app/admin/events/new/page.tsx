import Link from "next/link";
import { prisma } from "@/lib/db";
import { EventForm } from "@/components/admin/event-form";

export const metadata = { title: "New event" };

export default async function NewEventPage() {
  const [spaces, hosts] = await Promise.all([
    prisma.space.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
      take: 100,
    }),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        roles: { some: { role: { name: { in: ["ADMIN", "SUPER_ADMIN", "HOST"] } } } },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, handle: true },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="text-[12.5px] text-foreground-muted">
        <Link
          href="/admin/events"
          className="font-semibold text-foreground-muted no-underline hover:text-foreground hover:underline"
        >
          Events
        </Link>
        <span aria-hidden> / </span>
        <span>New</span>
      </nav>

      <h1 className="font-display text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
        Schedule an event
      </h1>

      <div className="max-w-[46rem]">
        <EventForm
          event={null}
          spaces={spaces}
          hosts={hosts.map((host) => ({
            id: host.id,
            name: host.name ?? host.handle,
          }))}
        />
      </div>
    </div>
  );
}
