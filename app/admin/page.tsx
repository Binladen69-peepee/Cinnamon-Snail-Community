import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  MessageSquare,
  Receipt,
  Users,
} from "lucide-react";
import Link from "next/link";
import { loadOverview } from "@/lib/admin/overview";
import {
  AdminLink,
  Panel,
  PanelHeader,
  PageHeader,
  Stat,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Overview" };

/**
 * The console's front page.
 *
 * Alerts first, because the only reason to open an admin console unprompted is
 * to find out whether something is wrong. Then the four areas of the product,
 * each a row of measured numbers with a way into the section behind it.
 *
 * No trend arrows and no percentages: nothing here stores a historical series,
 * so a "+12% this week" would be a decoration rather than a measurement.
 */
export default async function AdminOverviewPage() {
  const data = await loadOverview();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        subtitle="What the community is doing, and what needs attention."
        actions={<AdminLink href="/home">Back to the community</AdminLink>}
      />

      <section aria-label="Alerts">
        {data.alerts.length === 0 ? (
          <div className="vu-raise flex items-center gap-2.5 rounded-card border border-border bg-surface px-4 py-3">
            <CheckCircle2 className="size-4 shrink-0 text-brand" aria-hidden />
            <p className="text-[13.5px] text-foreground">
              Nothing needs attention. Billing is clean and no reports are
              waiting.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {data.alerts.map((alert) => (
              <li key={alert.title}>
                <Link
                  href={alert.href}
                  className={cn(
                    "vu-raise flex items-start gap-2.5 rounded-card border px-4 py-3 no-underline transition hover:border-hairline-firm",
                    alert.level === "bad"
                      ? "border-danger/40 bg-danger/10"
                      : "border-warning/35 bg-warning/10",
                  )}
                >
                  <AlertTriangle
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      alert.level === "bad" ? "text-danger" : "text-warning",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold text-foreground">
                      {alert.title}
                    </span>
                    <span className="block text-[12.5px] text-foreground-muted">
                      {alert.detail}
                    </span>
                  </span>
                  <ArrowRight
                    className="mt-0.5 size-4 shrink-0 text-foreground-muted"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Group
        title="Community"
        icon={<Users className="size-3.5" aria-hidden />}
        href="/admin/members"
        cta="Open members"
      >
        <Stat flush label="Members" value={data.members.total} hint="Active accounts" />
        <Stat
          flush
          label="Posted or commented"
          value={data.members.active30}
          hint="Last 30 days"
          tone={data.members.active30 === 0 ? "warn" : "default"}
        />
        <Stat flush label="Joined" value={data.members.new30} hint="Last 30 days" />
        <Stat flush label="Joined" value={data.members.new7} hint="Last 7 days" />
      </Group>

      <Group
        title="Content"
        icon={<MessageSquare className="size-3.5" aria-hidden />}
        href="/admin/spaces"
        cta="Open spaces"
      >
        <Stat flush label="Published posts" value={data.content.posts} hint="All time" />
        <Stat flush label="New posts" value={data.content.posts7} hint="Last 7 days" />
        <Stat flush label="Comments" value={data.content.comments7} hint="Last 7 days" />
        <Stat
          flush
          label="Reports waiting"
          value={data.moderation.open + data.moderation.reviewing}
          hint={`${data.moderation.open} unread`}
          tone={data.moderation.open > 0 ? "bad" : "default"}
          href="/admin/moderation"
        />
      </Group>

      <Group
        title="Learning"
        icon={<GraduationCap className="size-3.5" aria-hidden />}
        href="/admin/courses"
        cta="Open courses"
      >
        <Stat flush label="Courses" value={data.learning.courses} hint="All" />
        <Stat
          flush
          label="Published"
          value={data.learning.published}
          hint="Visible to members"
          tone={data.learning.published === 0 ? "warn" : "default"}
        />
        <Stat
          flush
          label="Lessons"
          value={data.learning.lessons}
          hint={data.learning.lessons === 0 ? "None authored yet" : "Across all courses"}
          tone={data.learning.lessons === 0 ? "warn" : "default"}
        />
        <Stat
          flush
          label="Members learning"
          value={data.learning.started}
          hint="Courses started"
        />
      </Group>

      <Group
        title="Revenue"
        icon={<Receipt className="size-3.5" aria-hidden />}
        href="/admin/billing"
        cta="Open billing"
      >
        <Stat
          flush
          label="Active entitlements"
          value={data.billing.activeEntitlements}
          hint="Members with access"
          tone="good"
        />
        <Stat
          flush
          label="Paying subscriptions"
          value={data.billing.payingSubscriptions}
          hint="Active, past due, canceling or comped"
        />
        <Stat
          flush
          label="Failed events"
          value={data.billing.failedEvents}
          hint={`${data.billing.deadLettered} dead-lettered`}
          tone={
            data.billing.deadLettered > 0
              ? "bad"
              : data.billing.failedEvents > 0
                ? "warn"
                : "default"
          }
          href="/admin/billing/webhooks"
        />
        <Stat
          flush
          label="Cancellations in flight"
          value={data.billing.openCancellations}
          hint="Started, not confirmed"
        />
      </Group>
    </div>
  );
}

function Group({
  title,
  icon,
  href,
  cta,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  href: string;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <Panel>
      <PanelHeader
        title={title}
        icon={icon}
        action={
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand no-underline hover:underline"
          >
            {cta}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        {children}
      </div>
    </Panel>
  );
}
