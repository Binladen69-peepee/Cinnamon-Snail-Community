import { prisma } from "@/lib/db";
import { EventForm } from "@/components/admin/event-form";
import { PageHeader } from "@/components/app/ui";

export const metadata = { title: "New live class" };

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
        back={{ href: "/admin/events", label: "Live classes" }}
        title="Schedule a live class"
        description="For a class that is not a Zoom meeting, or before Zoom is connected. Zoom meetings whose topic says LIVE CLASS appear on their own."
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
