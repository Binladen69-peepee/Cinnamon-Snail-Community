import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  ChevronLeft,
  CreditCard,
  KeyRound,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { canAccessPaidContent } from "@/lib/entitlements/check";
import { resolveMemberAvatar } from "@/lib/community/member-avatars";
import { Avatar } from "@/components/ui/avatar";
import { PendingButton } from "@/components/ui/pending-button";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Select,
  buttonClass,
  type BadgeTone,
} from "@/components/app/ui";
import { grantAccessAction } from "@/app/admin/actions";
import { MemberStatusControl } from "@/components/admin/member-status-control";
import { auth } from "@/auth";

export const metadata = { title: "Member" };

/** A stored enum ("PAST_DUE") as a person would say it ("Past due"). */
function humanize(value: string) {
  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const SUBSCRIPTION_TONE: Record<string, BadgeTone> = {
  ACTIVE: "success",
  COMPED: "success",
  PAST_DUE: "warning",
  DELINQUENT: "danger",
  CANCELING: "warning",
  CANCELED: "neutral",
  REFUNDED: "neutral",
};

const ENTITLEMENT_TONE: Record<string, BadgeTone> = {
  ACTIVE: "success",
  EXPIRED: "neutral",
  REVOKED: "danger",
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Admin",
  HOST: "Host",
  MEMBER: "Member",
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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
      roles: { select: { role: { select: { name: true } } } },
      subscriptions: { include: { product: true }, orderBy: { createdAt: "desc" } },
      entitlements: { include: { product: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!member) notFound();
  const products = await prisma.product.findMany({ orderBy: { name: "asc" } });

  const name = member.profile?.displayName ?? member.email;
  const roles = member.roles
    .map((row) => row.role.name)
    .filter((role) => role !== "MEMBER");
  const hasAccess = canAccessPaidContent(member.entitlements);
  // The same limits the action enforces: never yourself, never an admin.
  const session = await auth();
  const canChangeStatus =
    member.id !== session?.user.id && !roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link
          href="/admin/members"
          className="-ml-1 inline-flex w-fit items-center gap-1 rounded-ctl px-1 text-label font-medium text-foreground-muted no-underline transition hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Members
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar
              name={name}
              src={resolveMemberAvatar(
                member.handle,
                member.profile?.avatarUrl,
                member.profile?.displayName,
              )}
              size="lg"
            />
            <div className="min-w-0">
              <h1 className="truncate text-display font-semibold tracking-[-0.02em] text-foreground">
                {name}
              </h1>
              <p className="mt-0.5 truncate text-body text-foreground-muted">{member.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {roles.map((role) => (
                  <Badge key={role} tone="brand" icon={<ShieldCheck aria-hidden />}>
                    {ROLE_LABEL[role] ?? humanize(role)}
                  </Badge>
                ))}
                {member.status !== "ACTIVE" ? (
                  <Badge tone="danger">{humanize(member.status)}</Badge>
                ) : null}
                {hasAccess ? (
                  <Badge tone="success">Has access</Badge>
                ) : (
                  <Badge tone="neutral">No access</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canChangeStatus && (member.status === "ACTIVE" || member.status === "SUSPENDED") ? (
              <MemberStatusControl userId={member.id} name={name} status={member.status} />
            ) : null}
            <ButtonLink href="/admin/billing" size="sm">
              <CreditCard className="size-4" aria-hidden />
              Back to billing
            </ButtonLink>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card padding="none">
            <CardHeader
              title="Subscription timeline"
              icon={<CreditCard />}
              count={member.subscriptions.length}
            />
            {member.subscriptions.length === 0 ? (
              <EmptyState
                size="sm"
                bordered={false}
                title="No subscriptions"
                description="This account has never bought a membership through checkout."
              />
            ) : (
              <ul className="divide-y divide-separator">
                {member.subscriptions.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 sm:px-5"
                  >
                    <span className="min-w-0 truncate text-body font-medium text-foreground">
                      {item.product.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge tone={SUBSCRIPTION_TONE[item.status] ?? "neutral"}>
                        {humanize(item.status)}
                      </Badge>
                      <time
                        dateTime={item.createdAt.toISOString()}
                        className="text-caption tabular-nums text-foreground-muted"
                      >
                        {formatDate(item.createdAt)}
                      </time>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padding="none">
            <CardHeader
              title="Entitlement timeline"
              icon={<KeyRound />}
              count={member.entitlements.length}
            />
            {member.entitlements.length === 0 ? (
              <EmptyState
                size="sm"
                bordered={false}
                title="No entitlements"
                description="Nothing grants this account access yet. Grant it below if it should have some."
              />
            ) : (
              <ul className="divide-y divide-separator">
                {member.entitlements.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body font-medium text-foreground">
                        {item.product.name}
                      </span>
                      <span className="block text-caption text-foreground-muted">
                        {humanize(item.source)}
                      </span>
                    </span>
                    <Badge tone={ENTITLEMENT_TONE[item.status] ?? "neutral"}>
                      {humanize(item.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Card padding="none">
            <CardHeader title="Activity" icon={<Activity />} />
            <dl className="divide-y divide-separator">
              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <dt className="text-label text-foreground-muted">Joined</dt>
                <dd className="text-label font-medium tabular-nums text-foreground">
                  {formatDate(member.createdAt)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <dt className="text-label text-foreground-muted">First signed in</dt>
                <dd className="text-label font-medium tabular-nums text-foreground">
                  {member.firstLoginAt ? formatDate(member.firstLoginAt) : "Never"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <dt className="text-label text-foreground-muted">Last signed in</dt>
                <dd className="text-label font-medium tabular-nums text-foreground">
                  {member.lastLoginAt ? formatDate(member.lastLoginAt) : "Never"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <dt className="text-label text-foreground-muted">Handle</dt>
                <dd className="min-w-0 truncate text-label font-medium text-foreground">
                  @{member.handle}
                </dd>
              </div>
            </dl>
          </Card>

          <Card padding="none">
            <CardHeader
              title="Grant access"
              icon={<Plus />}
              description="Adds a manual entitlement to a product."
            />
            {products.length === 0 ? (
              <EmptyState
                size="sm"
                bordered={false}
                title="No products"
                description="There is nothing to grant until a product exists."
              />
            ) : (
              <form action={grantAccessAction} className="flex flex-col gap-3 p-4 sm:p-5">
                <input type="hidden" name="userId" value={member.id} />
                <Field label="Product" htmlFor="grant-product">
                  <Select id="grant-product" name="productId">
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <PendingButton className={buttonClass({ variant: "primary", className: "w-full" })}>
                  Grant access
                </PendingButton>
              </form>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
