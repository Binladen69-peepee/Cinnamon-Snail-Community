import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { grantAccessAction } from "@/app/admin/actions";
import Link from "next/link";

export default async function AdminMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const member = await prisma.user.findUnique({
    where: { id },
    include: {
      profile: true,
      subscriptions: { include: { product: true }, orderBy: { createdAt: "desc" } },
      entitlements: { include: { product: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!member) notFound();
  const products = await prisma.product.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-8">
      <Link href="/admin/billing" className="text-sm text-foreground-muted">
        Back to billing
      </Link>
      <div>
        <h1 className="font-display text-[1.55rem] font-bold tracking-[-0.02em] text-foreground">
          {member.profile?.displayName ?? member.email}
        </h1>
        <p className="mt-2 text-foreground-muted">{member.email}</p>
      </div>
      <section>
        <h2 className="text-[14px] font-bold text-foreground">Subscription timeline</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {member.subscriptions.map((item) => (
            <li key={item.id} className="rounded-ctl border border-border bg-surface px-4 py-3">
              {item.product.name} · {item.status.toLowerCase()} ·{" "}
              {item.createdAt.toDateString()}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-[14px] font-bold text-foreground">Entitlement timeline</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {member.entitlements.map((item) => (
            <li key={item.id} className="rounded-ctl border border-border bg-surface px-4 py-3">
              {item.product.name} · {item.source.toLowerCase()} · {item.status.toLowerCase()}
            </li>
          ))}
        </ul>
      </section>
      <form action={grantAccessAction} className="flex flex-wrap gap-3">
        <input type="hidden" name="userId" value={member.id} />
        <select name="productId" className="min-h-11 rounded-ctl border border-border px-3">
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <Button type="submit">Grant access</Button>
      </form>
    </div>
  );
}
