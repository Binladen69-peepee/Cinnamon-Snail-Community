import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function AdminPage() {
  const [members, posts, failedWebhooks] = await Promise.all([
    prisma.user.count(),
    prisma.post.count({ where: { status: "PUBLISHED" } }),
    prisma.billingEvent.count({ where: { failedAt: { not: null } } }),
  ]);
  return (
    <div>
      <h1 className="font-display text-4xl text-forest">Admin</h1>
      <p className="mt-3 text-muted">
        Same design language, denser tools. Billing health is live. Automations
        and AI queues arrive with their phases.
      </p>
      <dl className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.5rem] bg-warm-white p-5">
          <dt className="text-sm text-muted">Members</dt>
          <dd className="font-display text-3xl text-forest">{members}</dd>
        </div>
        <div className="rounded-[1.5rem] bg-warm-white p-5">
          <dt className="text-sm text-muted">Published posts</dt>
          <dd className="font-display text-3xl text-forest">{posts}</dd>
        </div>
        <div className="rounded-[1.5rem] bg-warm-white p-5">
          <dt className="text-sm text-muted">Failed billing events</dt>
          <dd className="font-display text-3xl text-forest">{failedWebhooks}</dd>
        </div>
      </dl>
      <Link href="/admin/billing" className="mt-8 inline-flex min-h-11 items-center text-olive">
        Open billing health
      </Link>
    </div>
  );
}
