import { prisma } from "@/lib/db";
import { EventForm } from "@/components/admin/event-form";
import { PageHeader } from "@/components/app/ui";

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
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/admin/events", label: "Events" }}
        title="Schedule an event"
      />

      <div className="w-full max-w-3xl">
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
